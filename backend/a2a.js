import { EventEmitter } from 'events';
import { db } from './db.js';
import { runAgent } from './agents.js';
import { executeSkill } from './skills.js';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';

export const a2aEvents = new EventEmitter();

// Global execution control
const activeChats = new Set();
const chatControllers = new Map(); // chatId -> AbortController

export function stopExecution(chatId) {
  if (activeChats.has(chatId)) {
    activeChats.delete(chatId);
    const controller = chatControllers.get(chatId);
    if (controller) {
      controller.abort();
      chatControllers.delete(chatId);
    }
    a2aEvents.emit('event', {
      chatId,
      type: 'execution_stopped',
      data: { message: 'Execution halted by user' }
    });
    return true;
  }
  return false;
}

export async function startA2AExecution(chatId, userPrompt, llmOverride = null, contextFiles = [], targetAgentId = 'architect') {
  if (activeChats.has(chatId)) {
    throw new Error('An execution is already active for this chat.');
  }

  const workspacePath = process.env.JUSTCODE_WORKSPACE || path.resolve(process.cwd(), '..');
  
  // Set up cancellation controller
  const controller = new AbortController();
  chatControllers.set(chatId, controller);
  activeChats.add(chatId);

  a2aEvents.emit('event', {
    chatId,
    type: 'execution_started',
    data: { prompt: userPrompt }
  });

  const chats = db.getChats();
  if (!chats[chatId]) {
    chats[chatId] = {
      id: chatId,
      title: userPrompt.slice(0, 40) + (userPrompt.length > 40 ? '...' : ''),
      messages: [],
      llmOverride: llmOverride || null,
      createdAt: Date.now()
    };
  } else if (llmOverride !== undefined) {
    chats[chatId].llmOverride = llmOverride;
  }

  // Enrich prompt with chosen files context
  let enrichedPrompt = userPrompt;
  if (Array.isArray(contextFiles) && contextFiles.length > 0) {
    enrichedPrompt += '\n\n### USER SPECIFIED FILE CONTEXT:\n';
    for (const relativePath of contextFiles) {
      const absolutePath = path.resolve(workspacePath, relativePath);
      if (absolutePath.startsWith(workspacePath)) {
        try {
          if (fs.existsSync(absolutePath) && !fs.statSync(absolutePath).isDirectory()) {
            const fileContent = fs.readFileSync(absolutePath, 'utf8');
            enrichedPrompt += `\n--- File: ${relativePath} ---\n\`\`\`\n${fileContent}\n\`\`\`\n`;
          }
        } catch (e) {
          console.error(`Failed to read user-specified context file: ${relativePath}`, e);
        }
      }
    }
  }

  // Create initial message targeting the specified agent
  const initialMsg = {
    id: `msg-${uuidv4()}`,
    role: 'user',
    sender: 'user',
    recipient: targetAgentId || 'architect',
    content: enrichedPrompt,
    status: 'pending',
    timestamp: Date.now()
  };
  
  chats[chatId].messages.push(initialMsg);
  db.saveChats(chats);

  // Run the A2A loop asynchronously
  runLoop(chatId, workspacePath, controller.signal).catch(err => {
    console.error(`A2A Loop Error in chat [${chatId}]:`, err);
    a2aEvents.emit('event', {
      chatId,
      type: 'execution_failed',
      data: { error: err.message }
    });
  }).finally(() => {
    activeChats.delete(chatId);
    chatControllers.delete(chatId);
  });

  return chats[chatId];
}

export async function resumeA2AExecution(chatId, llmOverride = null) {
  if (activeChats.has(chatId)) {
    throw new Error('An execution is already active for this chat.');
  }

  const workspacePath = process.env.JUSTCODE_WORKSPACE || path.resolve(process.cwd(), '..');
  const chats = db.getChats();
  const chat = chats[chatId];
  if (!chat) {
    throw new Error(`Chat session [${chatId}] not found.`);
  }

  if (llmOverride !== undefined) {
    chat.llmOverride = llmOverride;
  }

  let foundFailed = false;
  for (const m of chat.messages) {
    if (m.status === 'failed') {
      m.status = 'pending';
      delete m.error;
      foundFailed = true;
    }
  }

  if (!foundFailed && chat.messages.length > 0) {
    const lastMsg = chat.messages[chat.messages.length - 1];
    if (lastMsg.status !== 'completed' && lastMsg.status !== 'success') {
      lastMsg.status = 'pending';
      foundFailed = true;
    }
  }

  db.saveChats(chats);

  const controller = new AbortController();
  activeChats.add(chatId);
  chatControllers.set(chatId, controller);

  runLoop(chatId, workspacePath, controller.signal).catch(err => {
    console.error(`A2A Loop Error in chat [${chatId}]:`, err);
    a2aEvents.emit('event', {
      chatId,
      type: 'execution_failed',
      data: { error: err.message }
    });
  }).finally(() => {
    activeChats.delete(chatId);
    chatControllers.delete(chatId);
  });

  return chat;
}

async function runLoop(chatId, workspacePath, abortSignal) {
  let stepCount = 0;
  const maxSteps = 30; // Protect against infinite loops

  while (activeChats.has(chatId) && stepCount < maxSteps) {
    if (abortSignal.aborted) {
      console.log(`Execution aborted for chat ${chatId}`);
      break;
    }

    const chats = db.getChats();
    const chat = chats[chatId];
    if (!chat) break;

    // Find the next pending message
    const pendingMsgIdx = chat.messages.findIndex(m => m.status === 'pending');
    if (pendingMsgIdx === -1) {
      // Loop ends when no more messages are pending
      console.log(`No pending messages in chat ${chatId}. Execution complete.`);
      a2aEvents.emit('event', {
        chatId,
        type: 'execution_completed',
        data: { message: 'Workflow completed successfully.' }
      });
      break;
    }

    const message = chat.messages[pendingMsgIdx];
    stepCount++;

    try {
      await executeMessageStep(chatId, pendingMsgIdx, workspacePath, abortSignal);
    } catch (err) {
      // Mark message as failed
      const chatsUpdated = db.getChats();
      if (chatsUpdated[chatId]?.messages[pendingMsgIdx]) {
        chatsUpdated[chatId].messages[pendingMsgIdx].status = 'failed';
        chatsUpdated[chatId].messages[pendingMsgIdx].error = err.message;
        db.saveChats(chatsUpdated);
      }
      throw err;
    }
  }

  if (stepCount >= maxSteps) {
    throw new Error('Maximum workflow step limit exceeded to prevent runaway token usage.');
  }
}

async function executeMessageStep(chatId, messageIndex, workspacePath, abortSignal) {
  let chats = db.getChats();
  const message = chats[chatId].messages[messageIndex];
  const agentId = message.recipient;

  // 1. Mark message as running
  message.status = 'running';
  db.saveChats(chats);
  
  a2aEvents.emit('event', {
    chatId,
    type: 'agent_started',
    data: {
      messageId: message.id,
      agentId,
      content: message.content
    }
  });

  // 2. Build history context for the LLM
  // We feed it all messages in the chat up to this message
  const messagesBefore = chats[chatId].messages.slice(0, messageIndex);
  const formattedHistory = [];

  for (const m of messagesBefore) {
    if (m.role === 'tool') {
      formattedHistory.push({
        role: 'tool',
        name: m.name,
        content: m.content,
        tool_call_id: m.tool_call_id
      });
    } else if (m.role === 'assistant' && m.tool_calls) {
      formattedHistory.push({
        role: 'assistant',
        content: null,
        tool_calls: m.tool_calls
      });
    } else {
      // Map text messages
      const isSelf = m.recipient === agentId && m.sender === agentId;
      const isFromSelf = m.sender === agentId;
      
      if (isFromSelf) {
        formattedHistory.push({
          role: 'assistant',
          content: m.content
        });
      } else {
        // From user or other agents
        const prefix = m.sender === 'user' ? '' : `[From Agent: ${m.sender.toUpperCase()}]: `;
        formattedHistory.push({
          role: 'user',
          content: `${prefix}${m.content}`
        });
      }
    }
  }

  // 3. Keep running agent until it returns a text completion or delegates
  let agentPrompt = message.content;
  let finished = false;

  while (!finished) {
    if (abortSignal.aborted) {
      throw new Error('Execution aborted during agent reasoning.');
    }

    const response = await runAgent(agentId, agentPrompt, formattedHistory, workspacePath, chatId);

    if (response.tool_calls && response.tool_calls.length > 0) {
      // Save LLM assistant message with tool calls
      const toolCallMsg = {
        role: 'assistant',
        tool_calls: response.tool_calls,
        timestamp: Date.now()
      };
      
      chats = db.getChats();
      chats[chatId].messages.push(toolCallMsg);
      db.saveChats(chats);
      
      formattedHistory.push({
        role: 'assistant',
        content: null,
        tool_calls: response.tool_calls
      });

      // Execute each tool call
      for (const tc of response.tool_calls) {
        const toolName = tc.function.name;
        const toolArgs = JSON.parse(tc.function.arguments || '{}');

        a2aEvents.emit('event', {
          chatId,
          type: 'tool_started',
          data: {
            agentId,
            tool: toolName,
            args: toolArgs
          }
        });

        if (toolName === 'delegate_task') {
          // Handle agent delegation
          const { recipient, task } = toolArgs;
          
          // Create new pending message
          const delegateMsg = {
            id: `msg-${uuidv4()}`,
            role: 'user',
            sender: agentId,
            recipient,
            content: task,
            status: 'pending',
            timestamp: Date.now()
          };

          chats = db.getChats();
          chats[chatId].messages.push(delegateMsg);
          
          // Complete original running message
          chats[chatId].messages[messageIndex].status = 'completed';
          chats[chatId].messages[messageIndex].result = `Delegated task to ${recipient}`;
          db.saveChats(chats);

          a2aEvents.emit('event', {
            chatId,
            type: 'agent_delegated',
            data: {
              messageId: message.id,
              sender: agentId,
              recipient,
              task
            }
          });

          finished = true;
          break; // Break the tool loop, A2A loop will run the newly created pending message
        } else {
          // Normal file system or command line tool execution
          let resultStr = '';
          try {
            const agentObj = db.getAgents()[agentId];
            const llmConfigs = db.getLLMConfigs();
            let llmConfigId = agentObj?.llmConfigId || 'default';
            if (chatId) {
              const chats = db.getChats();
              if (chats[chatId]?.llmOverride) {
                llmConfigId = chats[chatId].llmOverride;
              }
            }
            const llmConfig = llmConfigs[llmConfigId] || llmConfigs['default'];

            const result = await executeSkill(toolName, workspacePath, toolArgs, {
              agentId,
              chatId,
              messageIndex,
              llmConfig: {
                name: llmConfig?.name,
                provider: llmConfig?.provider,
                model: llmConfig?.model
              },
              systemInstruction: agentObj?.instruction || '',
              history: formattedHistory
            });
            resultStr = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
          } catch (err) {
            resultStr = `ERROR executing tool: ${err.message}`;
          }

          const toolResponseMsg = {
            role: 'tool',
            name: toolName,
            content: resultStr,
            tool_call_id: tc.id,
            timestamp: Date.now()
          };

          chats = db.getChats();
          chats[chatId].messages.push(toolResponseMsg);
          db.saveChats(chats);

          formattedHistory.push({
            role: 'tool',
            name: toolName,
            content: resultStr,
            tool_call_id: tc.id
          });

          a2aEvents.emit('event', {
            chatId,
            type: 'tool_completed',
            data: {
              agentId,
              tool: toolName,
              result: resultStr
            }
          });
        }
      }
    } else {
      // Standard text response (agent finished execution steps and directly replies)
      const textResponse = response.content || '';
      
      chats = db.getChats();
      // Complete current message
      chats[chatId].messages[messageIndex].status = 'completed';
      chats[chatId].messages[messageIndex].result = textResponse;
      
      // Determine recipient of the response
      const originalSender = message.sender;
      
      if (originalSender === 'user') {
        // Reply back directly to user
        const replyMsg = {
          id: `msg-${uuidv4()}`,
          role: 'assistant',
          sender: agentId,
          recipient: 'user',
          content: textResponse,
          status: 'completed',
          timestamp: Date.now()
        };
        chats[chatId].messages.push(replyMsg);
        db.saveChats(chats);

        a2aEvents.emit('event', {
          chatId,
          type: 'agent_replied',
          data: {
            messageId: message.id,
            agentId,
            recipient: 'user',
            content: textResponse
          }
        });
      } else {
        // Send message back to the delegator agent
        const replyMsg = {
          id: `msg-${uuidv4()}`,
          role: 'user',
          sender: agentId,
          recipient: originalSender,
          content: textResponse,
          status: 'pending',
          timestamp: Date.now()
        };
        chats[chatId].messages.push(replyMsg);
        db.saveChats(chats);

        a2aEvents.emit('event', {
          chatId,
          type: 'agent_delegated',
          data: {
            messageId: message.id,
            sender: agentId,
            recipient: originalSender,
            task: textResponse
          }
        });
      }
      finished = true;
    }
  }
}
