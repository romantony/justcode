import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { db } from './db.js';
import { mcpManager } from './mcp.js';
import { startA2AExecution, resumeA2AExecution, stopExecution, a2aEvents } from './a2a.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

// Serve static frontend client
const publicHtmlPath = path.join(__dirname, 'public_html');
app.use(express.static(publicHtmlPath));

// Initialize MCP Servers on start
mcpManager.init().catch(err => {
  console.error('Failed to initialize MCP servers:', err);
});

// SSE Streaming endpoint for real-time progress updates
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const handleEvent = (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  a2aEvents.on('event', handleEvent);

  req.on('close', () => {
    a2aEvents.off('event', handleEvent);
    res.end();
  });
});

// --- LLM CONFIG ENDPOINTS ---
app.get('/api/config', (req, res) => {
  res.json(db.getLLMConfigs());
});

app.post('/api/config', (req, res) => {
  db.saveLLMConfigs(req.body);
  res.json({ success: true, configs: db.getLLMConfigs() });
});

// --- AGENT ENDPOINTS ---
app.get('/api/agents', (req, res) => {
  res.json(db.getAgents());
});

app.post('/api/agents', (req, res) => {
  db.saveAgents(req.body);
  res.json({ success: true, agents: db.getAgents() });
});

// --- SKILLS ENDPOINTS ---
app.get('/api/skills', (req, res) => {
  res.json(db.getSkills());
});

app.post('/api/skills', (req, res) => {
  db.saveSkills(req.body);
  res.json({ success: true, skills: db.getSkills() });
});

// --- CHAT / CONVERSATION ENDPOINTS ---
app.get('/api/chats', (req, res) => {
  const chats = db.getChats();
  const summary = Object.values(chats).map(c => ({
    id: c.id,
    title: c.title,
    llmOverride: c.llmOverride || null,
    createdAt: c.createdAt
  })).sort((a, b) => b.createdAt - a.createdAt);
  res.json(summary);
});

app.get('/api/chats/:id', (req, res) => {
  const chats = db.getChats();
  const chat = chats[req.params.id];
  if (!chat) {
    return res.status(404).json({ error: 'Chat not found' });
  }
  res.json(chat);
});

app.post('/api/chats', async (req, res) => {
  const { chatId, prompt, llmOverride, contextFiles, targetAgentId } = req.body;
  if (!chatId || !prompt) {
    return res.status(400).json({ error: 'Missing chatId or prompt' });
  }
  try {
    const chat = await startA2AExecution(chatId, prompt, llmOverride, contextFiles || [], targetAgentId || 'architect');
    res.json(chat);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/chats/:id/resume', async (req, res) => {
  const { llmOverride } = req.body;
  try {
    const chat = await resumeA2AExecution(req.params.id, llmOverride);
    res.json(chat);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/chats/:id/override', (req, res) => {
  const { llmOverride } = req.body;
  const chats = db.getChats();
  if (!chats[req.params.id]) {
    return res.status(404).json({ error: 'Chat not found' });
  }
  chats[req.params.id].llmOverride = llmOverride || null;
  db.saveChats(chats);
  res.json({ success: true, chat: chats[req.params.id] });
});

app.post('/api/chats/:id/stop', (req, res) => {
  const stopped = stopExecution(req.params.id);
  res.json({ success: stopped });
});

// --- MCP CONFIG ENDPOINTS ---
app.get('/api/mcp/servers', (req, res) => {
  const servers = db.getMCPServers();
  const activeList = mcpManager.getConnectionsList();
  
  // Merge status from active connections
  const list = (servers.servers || []).map(s => {
    const active = activeList.find(a => a.id === s.id);
    return {
      ...s,
      status: active ? active.status : 'disconnected',
      error: active ? active.error : null,
      tools: active ? active.tools : []
    };
  });
  
  res.json(list);
});

app.post('/api/mcp/servers', async (req, res) => {
  try {
    const conn = await mcpManager.addServer(req.body);
    res.json({
      success: true,
      server: {
        id: conn.id,
        name: conn.name,
        status: conn.status,
        tools: conn.tools
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/mcp/servers/:id', async (req, res) => {
  await mcpManager.removeServer(req.params.id);
  res.json({ success: true });
});

app.get('/api/mcp/tools', (req, res) => {
  res.json(mcpManager.getAllMCPTools());
});

// --- WORKSPACE FILE EXPLORER ENDPOINTS ---
app.get('/api/workspace/files', (req, res) => {
  const workspacePath = process.env.JUSTCODE_WORKSPACE || path.resolve(process.cwd(), '..');
  
  function getFileTree(dir, relativePath = '') {
    const absolutePath = path.join(dir, relativePath);
    let stats;
    try {
      stats = fs.statSync(absolutePath);
    } catch (e) {
      return null;
    }
    
    const name = path.basename(absolutePath) || relativePath || '/';
    
    if (stats.isDirectory()) {
      const ignoredDirs = ['node_modules', '.git', 'dist', 'build', '.idea', '.vscode', '.system_generated', 'temp_skills'];
      if (ignoredDirs.includes(name)) {
        return null;
      }
      
      let children = [];
      try {
        const files = fs.readdirSync(absolutePath);
        for (const file of files) {
          const child = getFileTree(dir, path.join(relativePath, file));
          if (child) {
            children.push(child);
          }
        }
      } catch (err) {
        // Ignore reading errors
      }
      
      children.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });
      
      return {
        name,
        path: relativePath,
        isDirectory: true,
        children
      };
    } else {
      return {
        name,
        path: relativePath,
        isDirectory: false,
        size: stats.size
      };
    }
  }
  
  try {
    const tree = getFileTree(workspacePath);
    res.json({
      workspacePath,
      tree: tree ? tree.children : []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/workspace/file', (req, res) => {
  const filePath = req.query.path;
  if (!filePath) {
    return res.status(400).json({ error: 'Missing path query parameter' });
  }
  const workspacePath = process.env.JUSTCODE_WORKSPACE || path.resolve(process.cwd(), '..');
  const absolutePath = path.resolve(workspacePath, filePath);
  
  // Guard to prevent directory traversal
  if (!absolutePath.startsWith(workspacePath)) {
    return res.status(403).json({ error: 'Access denied: Path is outside workspace.' });
  }
  
  try {
    if (!fs.existsSync(absolutePath) || fs.statSync(absolutePath).isDirectory()) {
      return res.status(404).json({ error: 'File not found' });
    }
    const content = fs.readFileSync(absolutePath, 'utf8');
    res.json({ content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/terminal/run', (req, res) => {
  const { command } = req.body;
  if (!command) {
    return res.status(400).json({ error: 'Missing command parameter' });
  }
  const workspacePath = process.env.JUSTCODE_WORKSPACE || path.resolve(process.cwd(), '..');
  
  exec(command, { cwd: workspacePath }, (error, stdout, stderr) => {
    res.json({
      stdout: stdout || '',
      stderr: stderr || '',
      exitCode: error ? error.code : 0
    });
  });
});

// Fallback to index.html for frontend routing support
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(publicHtmlPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Developer Agent Workspace Backend listening on http://localhost:${PORT}`);
});
