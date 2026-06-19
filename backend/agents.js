import { db } from './db.js';
import { getCodebaseContext } from './skills.js';
import { mcpManager } from './mcp.js';
import path from 'path';

// Standard schema definitions for built-in skills
const SKILL_SCHEMAS = {
  list_directory: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Relative path to list, defaults to root ".".' }
    }
  },
  read_file: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Relative path of the file to read.' }
    },
    required: ['path']
  },
  write_file: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Relative path of the file to write.' },
      content: { type: 'string', description: 'The text content to write into the file.' }
    },
    required: ['path', 'content']
  },
  execute_command: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The terminal command to execute.' }
    },
    required: ['command']
  },
  search_codebase: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The search query to match against files.' }
    },
    required: ['query']
  }
};

const DELEGATE_TOOL = {
  name: 'delegate_task',
  description: 'Delegates a software engineering sub-task to another specialized agent. Only call this when you need assistance from another role (e.g. Coder needs Tester to run a command, or Architect needs Coder to write files).',
  parameters: {
    type: 'object',
    properties: {
      recipient: {
        type: 'string',
        enum: ['architect', 'coder', 'tester', 'reviewer'],
        description: 'The target agent to send the message to.'
      },
      task: {
        type: 'string',
        description: 'Detailed instructions and task specs for the agent.'
      }
    },
    required: ['recipient', 'task']
  }
};

export async function callLLM(config, systemInstruction, messages, tools) {
  const provider = config.provider || 'gemini';

  if (provider === 'gemini') {
    return await callGemini(config, systemInstruction, messages, tools);
  } else if (provider === 'openai' || provider === 'ollama' || provider === 'codex') {
    return await callOpenAI(config, systemInstruction, messages, tools);
  } else if (provider === 'anthropic') {
    return await callAnthropic(config, systemInstruction, messages, tools);
  } else {
    throw new Error(`Unsupported LLM provider: ${provider}`);
  }
}

// Convert JSON-schema types to UPPERCASE types for Gemini
function mapToGeminiSchema(schema) {
  const mapped = {
    type: (schema.type || 'object').toUpperCase()
  };
  if (schema.properties) {
    mapped.properties = {};
    for (const [k, v] of Object.entries(schema.properties)) {
      mapped.properties[k] = mapToGeminiSchema(v);
    }
  }
  if (schema.required) {
    mapped.required = schema.required;
  }
  if (schema.description) {
    mapped.description = schema.description;
  }
  if (schema.enum) {
    mapped.enum = schema.enum;
  }
  return mapped;
}

async function callGemini(config, systemInstruction, messages, tools) {
  const modelName = config.model || 'gemini-1.5-flash';
  const apiKey = config.apiKey || process.env.GEMINI_API_KEY;
  const baseUrl = config.baseUrl || 'https://generativelanguage.googleapis.com';

  if (!apiKey) {
    throw new Error('Gemini API key is not configured. Please add it in LLM Settings or set the GEMINI_API_KEY environment variable.');
  }

  const url = `${baseUrl}/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  const contents = [];
  for (const m of messages) {
    const role = m.role === 'assistant' ? 'model' : 'user';

    if (m.tool_calls) {
      contents.push({
        role: 'model',
        parts: m.tool_calls.map(tc => ({
          functionCall: {
            name: tc.function.name,
            args: tc.function.arguments ? JSON.parse(tc.function.arguments) : {}
          }
        }))
      });
    } else if (m.role === 'tool') {
      contents.push({
        role: 'user',
        parts: [{
          functionResponse: {
            name: m.name,
            response: { result: m.content }
          }
        }]
      });
    } else {
      contents.push({
        role,
        parts: [{ text: m.content || ' ' }]
      });
    }
  }

  const payload = {
    contents,
    systemInstruction: systemInstruction ? {
      parts: [{ text: systemInstruction }]
    } : undefined,
    generationConfig: {
      temperature: config.temperature ?? 0.2,
      maxOutputTokens: config.maxTokens ?? 4096
    }
  };

  if (tools && tools.length > 0) {
    payload.tools = [{
      functionDeclarations: tools.map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters ? mapToGeminiSchema(t.parameters) : undefined
      }))
    }];
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API Error: ${res.status} ${res.statusText} - ${errText}`);
  }

  const data = await res.json();
  const candidate = data.candidates?.[0];
  const part = candidate?.content?.parts?.[0];

  if (part?.functionCall) {
    const fc = part.functionCall;
    return {
      content: null,
      tool_calls: [{
        id: `call-${Date.now()}`,
        type: 'function',
        function: {
          name: fc.name,
          arguments: JSON.stringify(fc.args)
        }
      }]
    };
  }

  return {
    content: part?.text || '',
    tool_calls: null
  };
}

async function callOpenAI(config, systemInstruction, messages, tools) {
  const modelName = config.model || 'gpt-4o';
  const apiKey = config.apiKey || (config.provider === 'openai' ? process.env.OPENAI_API_KEY : '');
  let baseUrl = config.baseUrl || 'https://api.openai.com/v1';

  const useSubscription = !!config.useSubscription;
  const token = config.authToken || apiKey;

  if (config.provider === 'openai' && !useSubscription && !apiKey) {
    throw new Error('OpenAI API key is not configured. Please add it in LLM Settings or set the OPENAI_API_KEY environment variable.');
  }
  if (useSubscription && !token) {
    throw new Error('Subscription selected but Auth Token is empty. Please enter your Bearer token in LLM Settings.');
  }

  // Adjust URL for openai or ollama
  const url = baseUrl.endsWith('/') ? `${baseUrl}chat/completions` : `${baseUrl}/chat/completions`;

  const formattedMessages = [];
  if (systemInstruction) {
    formattedMessages.push({ role: 'system', content: systemInstruction });
  }

  for (const m of messages) {
    if (m.tool_calls) {
      formattedMessages.push({
        role: 'assistant',
        tool_calls: m.tool_calls
      });
    } else if (m.role === 'tool') {
      formattedMessages.push({
        role: 'tool',
        tool_call_id: m.tool_call_id || `call-${Date.now()}`,
        name: m.name,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
      });
    } else {
      formattedMessages.push({
        role: m.role === 'model' ? 'assistant' : m.role,
        content: m.content || ''
      });
    }
  }

  const payload = {
    model: modelName,
    messages: formattedMessages,
    temperature: config.temperature ?? 0.2,
    max_tokens: config.maxTokens ?? 4096
  };

  if (tools && tools.length > 0) {
    payload.tools = tools.map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }
    }));
  }

  const headers = {
    'Content-Type': 'application/json'
  };
  if (useSubscription) {
    headers['Authorization'] = `Bearer ${token}`;
  } else if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI/Ollama API Error: ${res.status} ${res.statusText} - ${errText}`);
  }

  const data = await res.json();
  const choice = data.choices?.[0];

  return {
    content: choice?.message?.content || '',
    tool_calls: choice?.message?.tool_calls || null
  };
}

export async function runAgent(agentId, prompt, history = [], workspacePath, chatId = null) {
  const agents = db.getAgents();
  const agent = agents[agentId];

  if (!agent) {
    throw new Error(`Agent [${agentId}] not found.`);
  }

  // Retrieve LLM Config
  const llmConfigs = db.getLLMConfigs();
  let llmConfigId = agent.llmConfigId;

  // Resolve chat override
  if (chatId) {
    const chats = db.getChats();
    if (chats[chatId]?.llmOverride) {
      llmConfigId = chats[chatId].llmOverride;
    }
  }

  const config = llmConfigs[llmConfigId] || llmConfigs['default'];

  if (!config) {
    throw new Error(`LLM configuration for agent [${agentId}] is missing.`);
  }

  // Get Codebase Context (RAG)
  const codebaseContext = await getCodebaseContext(prompt, workspacePath);

  // Combine instructions
  const systemInstruction = `${agent.instruction}\n\n${codebaseContext}`;

  // Build tool definitions
  const skillsList = db.getSkills();
  const mcpTools = mcpManager.getAllMCPTools();
  
  const tools = [];
  
  // Add Delegate tool
  tools.push(DELEGATE_TOOL);

  // Add agent's allowed skills
  for (const skillId of agent.skills || []) {
    const skill = skillsList[skillId];
    if (skill) {
      tools.push({
        name: skill.id,
        description: skill.description,
        parameters: SKILL_SCHEMAS[skill.id] || { type: 'object', properties: {} }
      });
    }
  }

  // Add active MCP tools
  for (const mcpTool of mcpTools) {
    tools.push({
      name: mcpTool.name,
      description: `[MCP: ${mcpTool.mcpServerName}] ${mcpTool.description}`,
      parameters: mcpTool.inputSchema || { type: 'object', properties: {} }
    });
  }

  // Format history messages for LLM
  // History should be an array of: { role: 'user' | 'assistant' | 'tool', content: string, name?: string, tool_calls?: any, tool_call_id?: string }
  const messages = [...history];
  
  // If last message is not already the user prompt, add it
  if (messages.length === 0 || messages[messages.length - 1].content !== prompt) {
    messages.push({ role: 'user', content: prompt });
  }

  console.log(`Calling LLM for Agent [${agent.name}] with ${tools.length} tools`);
  const response = await callLLM(config, systemInstruction, messages, tools);
  return response;
}

// Anthropic Messages API client implementation
async function callAnthropic(config, systemInstruction, messages, tools) {
  const modelName = config.model || 'claude-3-5-sonnet-20241022';
  const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
  const baseUrl = config.baseUrl || 'https://api.anthropic.com';

  const useSubscription = !!config.useSubscription;
  const token = config.authToken || apiKey;

  if (!useSubscription && !apiKey) {
    throw new Error('Anthropic API key is not configured. Please add it in LLM Settings or set the ANTHROPIC_API_KEY environment variable.');
  }
  if (useSubscription && !token) {
    throw new Error('Subscription selected but Auth Token is empty. Please enter your Bearer token in LLM Settings.');
  }

  const url = baseUrl.endsWith('/') ? `${baseUrl}v1/messages` : `${baseUrl}/v1/messages`;

  const formattedMessages = [];
  for (const m of messages) {
    if (m.tool_calls) {
      formattedMessages.push({
        role: 'assistant',
        content: [
          ...(m.content ? [{ type: 'text', text: m.content }] : []),
          ...m.tool_calls.map(tc => ({
            type: 'tool_use',
            id: tc.id,
            name: tc.function.name,
            input: JSON.parse(tc.function.arguments || '{}')
          }))
        ]
      });
    } else if (m.role === 'tool') {
      const lastMsg = formattedMessages[formattedMessages.length - 1];
      const toolResultBlock = {
        type: 'tool_result',
        tool_use_id: m.tool_call_id || `call-${Date.now()}`,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
      };

      if (lastMsg && lastMsg.role === 'user' && Array.isArray(lastMsg.content)) {
        lastMsg.content.push(toolResultBlock);
      } else {
        formattedMessages.push({
          role: 'user',
          content: [toolResultBlock]
        });
      }
    } else {
      const role = (m.role === 'model' || m.role === 'assistant') ? 'assistant' : 'user';
      formattedMessages.push({
        role,
        content: m.content || ' '
      });
    }
  }

  // Consolidate consecutive messages with same role
  const consolidatedMessages = [];
  for (const msg of formattedMessages) {
    const last = consolidatedMessages[consolidatedMessages.length - 1];
    if (last && last.role === msg.role) {
      if (typeof last.content === 'string' && typeof msg.content === 'string') {
        last.content += `\n\n${msg.content}`;
      } else {
        const lastArray = Array.isArray(last.content) ? last.content : [{ type: 'text', text: last.content }];
        const msgArray = Array.isArray(msg.content) ? msg.content : [{ type: 'text', text: msg.content }];
        last.content = [...lastArray, ...msgArray];
      }
    } else {
      consolidatedMessages.push(msg);
    }
  }

  const payload = {
    model: modelName,
    messages: consolidatedMessages,
    max_tokens: config.maxTokens ?? 4096,
    temperature: config.temperature ?? 0.2
  };

  if (systemInstruction) {
    payload.system = systemInstruction;
  }

  if (tools && tools.length > 0) {
    payload.tools = tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters
    }));
  }

  const headers = {
    'Content-Type': 'application/json'
  };
  if (useSubscription) {
    headers['Authorization'] = `Bearer ${token}`;
  } else {
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API Error: ${res.status} ${res.statusText} - ${errText}`);
  }

  const data = await res.json();
  
  let textContent = '';
  const toolCalls = [];

  for (const block of data.content || []) {
    if (block.type === 'text') {
      textContent += block.text;
    } else if (block.type === 'tool_use') {
      toolCalls.push({
        id: block.id,
        type: 'function',
        function: {
          name: block.name,
          arguments: JSON.stringify(block.input)
        }
      });
    }
  }

  return {
    content: textContent || null,
    tool_calls: toolCalls.length > 0 ? toolCalls : null
  };
}
