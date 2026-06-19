import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Helper to read JSON safely
function readJSON(filename, defaultData = {}) {
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
    return defaultData;
  }
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading ${filename}:`, error);
    return defaultData;
  }
}

// Helper to write JSON safely
function writeJSON(filename, data) {
  const filePath = path.join(DATA_DIR, filename);
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(`Error writing ${filename}:`, error);
  }
}

// Initialize Default Agents
const DEFAULT_AGENTS = {
  architect: {
    id: 'architect',
    name: 'Architect',
    role: 'Planner & System Designer',
    instruction: `You are the Architect Agent. Your job is to analyze the user's software request, design the system architecture, create a concrete implementation plan, and delegate coding tasks to the Coder agent.
When you receive a request:
1. Break down the system requirements.
2. Outline the necessary files and functions.
3. Send a structured message to the 'coder' agent detailing what files to create or modify.
4. Wait for the Coder's updates and the Tester's results.
5. If the Reviewer requests adjustments, revise the plan and guide the team.`,
    llmConfigId: 'default',
    skills: ['list_directory', 'read_file', 'search_codebase'],
    enabled: true
  },
  coder: {
    id: 'coder',
    name: 'Coder',
    role: 'Software Developer',
    instruction: `You are the Coder Agent. Your job is to write high-quality, clean, well-documented code based on the Architect's instructions.
When you receive a coding task:
1. Create or modify files using the 'write_file' or 'patch_file' skills.
2. Confirm the code is correctly written.
3. Send a message to the 'tester' agent requesting verification.
4. If testing fails, read the test logs, fix the issues, and re-request verification.`,
    llmConfigId: 'default',
    skills: ['write_file', 'read_file', 'list_directory', 'git_commit'],
    enabled: true
  },
  tester: {
    id: 'tester',
    name: 'Tester',
    role: 'QA Engineer',
    instruction: `You are the Tester Agent. Your job is to verify that the code written by the Coder works correctly.
When the Coder requests testing:
1. Run relevant tests, builds, or scripts using the 'execute_command' skill.
2. Inspect the console outputs, linting reports, or logs.
3. Report back to the Coder and Reviewer with the exact output, marking tests as PASSED or FAILED.`,
    llmConfigId: 'default',
    skills: ['execute_command', 'list_directory'],
    enabled: true
  },
  reviewer: {
    id: 'reviewer',
    name: 'Reviewer',
    role: 'Code Auditor',
    instruction: `You are the Reviewer Agent. Your job is to review the code changes and verify they meet high standards.
When the Tester reports results:
1. Review the code written by the Coder (by reading files if needed) and the test outputs.
2. If code styling, logic, or testing is insufficient, send detailed feedback to the Coder or Architect.
3. If everything is correct and verified, output 'APPROVED' and summarize the accomplished work for the User.`,
    llmConfigId: 'default',
    skills: ['read_file'],
    enabled: true
  },
  incident_manager: {
    id: 'incident_manager',
    name: 'Incident Manager',
    role: 'Incident Handler',
    instruction: `You are the Incident Manager Agent. Your job is to handle errors, bugs, or alerts.
When an incident is reported (e.g. build failure, user bug report, runtime crash):
1. Investigate log outputs or error messages using 'execute_command' or 'read_file'.
2. Identify the impacted components and detail the issue in a structured report.
3. Delegate the bugfix request to the Coder, providing explicit details about what failed.`,
    llmConfigId: 'default',
    skills: ['read_file', 'list_directory', 'execute_command'],
    enabled: true
  },
  problem_manager: {
    id: 'problem_manager',
    name: 'Problem Manager (RCA)',
    role: 'Root Cause Analyst',
    instruction: `You are the Problem Manager / RCA Agent. Your job is to investigate the root cause of recurring code regressions or issues.
When performing Root Cause Analysis:
1. Query the git log using 'execute_command' to trace back who committed the offending lines.
2. Inspect the git commit messages to find links to the prompt context audit files (located in '.justcode/audit/').
3. Read the linked context files using 'read_file' to understand which Agent and LLM configuration were active, and why the instruction context led to the bug.
4. Formulate a final RCA (Root Cause Analysis) report outlining the bug description, the triggering agent/LLM config, the prompt context error, and recommended long-term prevention.`,
    llmConfigId: 'default',
    skills: ['read_file', 'list_directory', 'search_codebase', 'execute_command'],
    enabled: true
  },
  change_manager: {
    id: 'change_manager',
    name: 'Change Manager',
    role: 'Release Gatekeeper',
    instruction: `You are the Change Manager Agent. Your job is to review proposed changes and authorize code commits or merges.
When reviewing a change:
1. Review the differences between the current branch and main using 'execute_command' (e.g. git diff).
2. Check the test logs and ensure all QA validation passed.
3. Compare LLM build outputs/test results.
4. If everything looks stable, authorize the merge by outputting 'CHANGE APPROVED' along with a summary of risk level.`,
    llmConfigId: 'default',
    skills: ['read_file', 'list_directory', 'execute_command'],
    enabled: true
  },
  rca_agent: {
    id: 'rca_agent',
    name: 'RCA Analyst',
    role: 'Root Cause Investigator',
    instruction: `You are the Root Cause Analysis (RCA) Agent. Your job is to investigate regressions, crashes, or bugs.
When analyzing a problem:
1. Examine the git repository log using 'execute_command'.
2. Load and inspect the linked context audit files inside '.justcode/audit/' via 'read_file'.
3. Detail which agent, model version, and context triggered the bug.
4. Recommend immediate remediation steps and long-term preventions.`,
    llmConfigId: 'default',
    skills: ['read_file', 'list_directory', 'search_codebase', 'execute_command'],
    enabled: true
  },
  enhancement_agent: {
    id: 'enhancement_agent',
    name: 'Enhancement Specialist',
    role: 'Feature Developer',
    instruction: `You are the Enhancement Agent. Your job is to design and implement new features, enhancements, or refactors requested by the user.
1. Understand the new features and plan the code additions.
2. Edit or create files with high-quality implementations.
3. Commit your changes using 'git_commit' to ensure context auditing is preserved.
4. Prompt the Tester or Reviewer to verify the changes.`,
    llmConfigId: 'default',
    skills: ['write_file', 'read_file', 'list_directory', 'git_commit'],
    enabled: true
  },
  bugfix_agent: {
    id: 'bugfix_agent',
    name: 'Bugfix Specialist',
    role: 'Bug Repair Engineer',
    instruction: `You are the Bug Fix Agent. Your job is to debug and repair issues identified by the Incident Manager or Tester.
1. Target the faulty lines or modules based on the issue description.
2. Formulate a patch and apply the edits.
3. Verify compilation and correctness.
4. Commit your changes using 'git_commit' to preserve context auditing.`,
    llmConfigId: 'default',
    skills: ['write_file', 'read_file', 'list_directory', 'git_commit'],
    enabled: true
  }
};

// Initialize Default LLM Configurations
const DEFAULT_LLM_CONFIGS = {
  default: {
    id: 'default',
    name: 'Gemini (Default)',
    provider: 'gemini', // 'openai', 'anthropic', 'gemini', 'ollama'
    model: 'gemini-1.5-flash',
    apiKey: '',
    baseUrl: 'https://generativelanguage.googleapis.com',
    maxTokens: 4096,
    temperature: 0.2
  },
  claude: {
    id: 'claude',
    name: 'Claude (Anthropic)',
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-20241022',
    apiKey: '',
    baseUrl: 'https://api.anthropic.com',
    maxTokens: 4096,
    temperature: 0.2,
    useSubscription: false,
    authToken: ''
  },
  codex: {
    id: 'codex',
    name: 'Codex (OpenAI Proxy)',
    provider: 'codex',
    model: 'code-davinci-002',
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    maxTokens: 4096,
    temperature: 0.2,
    useSubscription: false,
    authToken: ''
  }
};

// Initialize Default Skills
const DEFAULT_SKILLS = {
  list_directory: {
    id: 'list_directory',
    name: 'List Directory',
    description: 'Lists all files and subdirectories in the project path.',
    code: `// Skill parameters: { path: string }
export async function run({ workspacePath, params }) {
  const fs = await import('fs');
  const path = await import('path');
  const targetDir = path.join(workspacePath, params.path || '.');
  
  if (!fs.existsSync(targetDir)) {
    throw new Error(\`Directory does not exist: \${params.path}\`);
  }
  
  const entries = fs.readdirSync(targetDir, { withFileTypes: true });
  return entries.map(e => ({
    name: e.name,
    type: e.isDirectory() ? 'directory' : 'file',
    path: path.relative(workspacePath, path.join(targetDir, e.name))
  }));
}`
  },
  read_file: {
    id: 'read_file',
    name: 'Read File',
    description: 'Reads the content of a file in the workspace.',
    code: `// Skill parameters: { path: string }
export async function run({ workspacePath, params }) {
  const fs = await import('fs');
  const path = await import('path');
  const filePath = path.join(workspacePath, params.path);
  
  if (!fs.existsSync(filePath)) {
    throw new Error(\`File not found: \${params.path}\`);
  }
  
  return fs.readFileSync(filePath, 'utf-8');
}`
  },
  write_file: {
    id: 'write_file',
    name: 'Write File',
    description: 'Writes content to a file in the workspace (creates directory if missing).',
    code: `// Skill parameters: { path: string, content: string }
export async function run({ workspacePath, params }) {
  const fs = await import('fs');
  const path = await import('path');
  const filePath = path.join(workspacePath, params.path);
  
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, params.content, 'utf-8');
  return \`Successfully wrote \${params.content.length} characters to \${params.path}\`;
}`
  },
  execute_command: {
    id: 'execute_command',
    name: 'Execute Command',
    description: 'Runs a shell command in the project workspace root.',
    code: `// Skill parameters: { command: string }
export async function run({ workspacePath, params }) {
  const { exec } = await import('child_process');
  
  return new Promise((resolve, reject) => {
    exec(params.command, { cwd: workspacePath }, (error, stdout, stderr) => {
      resolve({
        stdout: stdout || '',
        stderr: stderr || '',
        exitCode: error ? error.code : 0
      });
    });
  });
}`
  },
  search_codebase: {
    id: 'search_codebase',
    name: 'Search Codebase',
    description: 'Searches workspace files for a text string.',
    code: `// Skill parameters: { query: string }
export async function run({ workspacePath, params }) {
  const fs = await import('fs');
  const path = await import('path');
  
  const results = [];
  function searchDir(dir) {
    const list = fs.readdirSync(dir);
    for (const file of list) {
      // Exclude node_modules and .git
      if (file === 'node_modules' || file === '.git' || file === 'dist') continue;
      
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        searchDir(fullPath);
      } else {
        // Read file contents (assuming text file)
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          if (content.includes(params.query)) {
            const relPath = path.relative(workspacePath, fullPath);
            const lines = content.split('\\n');
            const matches = lines
              .map((line, idx) => line.includes(params.query) ? { line: idx + 1, content: line.trim() } : null)
              .filter(m => m !== null);
            results.push({ file: relPath, matches });
          }
        } catch (e) {
          // Ignore binary files or reading errors
        }
      }
    }
  }
  
  searchDir(workspacePath);
  return results;
}`
  },
  git_commit: {
    id: 'git_commit',
    name: 'Git Commit with AI Audit',
    description: 'Stages changes, logs AI agent/LLM prompt context audit data, and commits to git.',
    code: `// Skill parameters: { message: string, stageAll: boolean }
export async function run({ workspacePath, params, metadata }) {
  const fs = await import('fs');
  const path = await import('path');
  const { execSync } = await import('child_process');

  try {
    execSync('git rev-parse --is-inside-work-tree', { cwd: workspacePath });
  } catch (e) {
    execSync('git init', { cwd: workspacePath });
  }

  const auditDir = path.join(workspacePath, '.justcode', 'audit');
  fs.mkdirSync(auditDir, { recursive: true });

  const timestamp = Date.now();
  const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
  const auditFileName = \`audit-\${dateStr}.json\`;
  const auditFilePath = path.join(auditDir, auditFileName);

  const auditData = {
    timestamp: new Date().toISOString(),
    agentId: metadata?.agentId || 'unknown_agent',
    chatId: metadata?.chatId || 'unknown_chat',
    llmConfig: metadata?.llmConfig || {},
    systemInstruction: metadata?.systemInstruction || '',
    history: metadata?.history || []
  };

  fs.writeFileSync(auditFilePath, JSON.stringify(auditData, null, 2), 'utf-8');

  if (params.stageAll !== false) {
    execSync('git add .', { cwd: workspacePath });
  }

  let statusOut = '';
  try {
    statusOut = execSync('git diff --name-only --cached', { cwd: workspacePath }).toString().trim();
  } catch (err) {}

  if (!statusOut) {
    return 'No changes staged for commit.';
  }

  const agentName = metadata?.agentId ? metadata.agentId.toUpperCase() : 'CODER';
  const llmName = metadata?.llmConfig?.name || 'Unknown LLM';
  const modelName = metadata?.llmConfig?.model || 'unknown-model';
  const contextLink = \`.justcode/audit/\${auditFileName}\`;

  const commitMsg = \`[AI: \${agentName} via \${llmName} (\${modelName})] [Context: \${contextLink}]\\n\\n\${params.message || 'Updated codebase'}\`;
  const escapedMsg = commitMsg.replace(/"/g, '\\"');

  let commitOut = '';
  try {
    commitOut = execSync(\`git commit -m "\${escapedMsg}"\`, { cwd: workspacePath }).toString().trim();
  } catch (err) {
    throw new Error(\`Git commit failed: \${err.message}\`);
  }

  return \`Git Commit Successful!\\nCommit output:\\n\${commitOut}\\n\\nAudit log saved to: \${contextLink}\`;
}`
  }
};

export const db = {
  getLLMConfigs() {
    const saved = readJSON('llm_configs.json', DEFAULT_LLM_CONFIGS);
    let updated = false;
    for (const [k, v] of Object.entries(DEFAULT_LLM_CONFIGS)) {
      if (!saved[k]) {
        saved[k] = v;
        updated = true;
      } else {
        // Merge missing fields (e.g. useSubscription, authToken)
        for (const [subKey, subVal] of Object.entries(v)) {
          if (saved[k][subKey] === undefined) {
            saved[k][subKey] = subVal;
            updated = true;
          }
        }
      }
    }
    if (updated) {
      writeJSON('llm_configs.json', saved);
    }
    return saved;
  },
  saveLLMConfigs(configs) {
    writeJSON('llm_configs.json', configs);
  },
  getAgents() {
    const saved = readJSON('agents.json', DEFAULT_AGENTS);
    let updated = false;
    for (const [k, v] of Object.entries(DEFAULT_AGENTS)) {
      if (!saved[k]) {
        saved[k] = v;
        updated = true;
      }
    }
    if (updated) {
      writeJSON('agents.json', saved);
    }
    return saved;
  },
  saveAgents(agents) {
    writeJSON('agents.json', agents);
  },
  getSkills() {
    const saved = readJSON('skills.json', DEFAULT_SKILLS);
    let updated = false;
    for (const [k, v] of Object.entries(DEFAULT_SKILLS)) {
      if (!saved[k]) {
        saved[k] = v;
        updated = true;
      }
    }
    if (updated) {
      writeJSON('skills.json', saved);
    }
    return saved;
  },
  saveSkills(skills) {
    writeJSON('skills.json', skills);
  },
  getInstructions() {
    return readJSON('instructions.json', { systemPrompts: [] });
  },
  saveInstructions(instructions) {
    writeJSON('instructions.json', instructions);
  },
  getChats() {
    return readJSON('chats.json', {});
  },
  saveChats(chats) {
    writeJSON('chats.json', chats);
  },
  getMemory() {
    return readJSON('memory.json', { items: [] });
  },
  saveMemory(memory) {
    writeJSON('memory.json', memory);
  },
  getMCPServers() {
    return readJSON('mcp_servers.json', { servers: [] });
  },
  saveMCPServers(servers) {
    writeJSON('mcp_servers.json', servers);
  }
};
