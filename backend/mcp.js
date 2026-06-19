import { spawn } from 'child_process';
import { db } from './db.js';

class MCPServerConnection {
  constructor(serverConfig) {
    this.id = serverConfig.id;
    this.name = serverConfig.name;
    this.command = serverConfig.command;
    this.args = serverConfig.args || [];
    this.env = serverConfig.env || {};
    this.process = null;
    this.buffer = '';
    this.pendingRequests = new Map();
    this.requestId = 1;
    this.status = 'disconnected'; // 'connecting', 'connected', 'error'
    this.error = null;
    this.tools = [];
  }

  async connect() {
    this.status = 'connecting';
    this.error = null;
    console.log(`Connecting to MCP server [${this.name}] using command: ${this.command} ${this.args.join(' ')}`);

    try {
      const mergedEnv = { ...process.env, ...this.env };
      this.process = spawn(this.command, this.args, {
        env: mergedEnv,
        shell: true
      });

      this.process.stdout.on('data', (data) => {
        this.handleData(data.toString());
      });

      this.process.stderr.on('data', (data) => {
        console.error(`MCP [${this.name}] stderr:`, data.toString());
      });

      this.process.on('close', (code) => {
        console.log(`MCP [${this.name}] exited with code: ${code}`);
        this.status = 'disconnected';
        this.cleanupPending(new Error(`MCP server connection closed (exit code ${code})`));
      });

      this.process.on('error', (err) => {
        console.error(`MCP [${this.name}] process error:`, err);
        this.status = 'error';
        this.error = err.message;
        this.cleanupPending(err);
      });

      this.status = 'connected';

      // Load tools immediately on connection
      await this.refreshTools();
      console.log(`MCP [${this.name}] successfully connected with ${this.tools.length} tools.`);
    } catch (err) {
      console.error(`MCP [${this.name}] connection failed:`, err);
      this.status = 'error';
      this.error = err.message;
      throw err;
    }
  }

  handleData(data) {
    this.buffer += data;
    let lineEnd = this.buffer.indexOf('\n');
    while (lineEnd !== -1) {
      const line = this.buffer.slice(0, lineEnd).trim();
      this.buffer = this.buffer.slice(lineEnd + 1);

      if (line) {
        try {
          const message = JSON.parse(line);
          this.handleMessage(message);
        } catch (e) {
          // Some servers output log lines that are not JSON-RPC. We ignore them or log them.
          console.log(`MCP [${this.name}] non-json output:`, line);
        }
      }
      lineEnd = this.buffer.indexOf('\n');
    }
  }

  handleMessage(msg) {
    if (msg.id !== undefined) {
      const pending = this.pendingRequests.get(msg.id);
      if (pending) {
        this.pendingRequests.delete(msg.id);
        if (msg.error) {
          pending.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        } else {
          pending.resolve(msg.result);
        }
      }
    }
  }

  sendRequest(method, params = {}) {
    if (this.status !== 'connected' || !this.process) {
      return Promise.reject(new Error(`MCP [${this.name}] is not connected.`));
    }

    const id = this.requestId++;
    const payload = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      try {
        this.process.stdin.write(JSON.stringify(payload) + '\n');
      } catch (err) {
        this.pendingRequests.delete(id);
        reject(new Error(`Failed to write to MCP stdin: ${err.message}`));
      }
    });
  }

  async refreshTools() {
    try {
      const response = await this.sendRequest('tools/list');
      this.tools = response.tools || [];
    } catch (err) {
      console.error(`Failed to refresh tools for MCP [${this.name}]:`, err);
      this.tools = [];
      throw err;
    }
  }

  async callTool(name, arguments_ = {}) {
    try {
      const response = await this.sendRequest('tools/call', {
        name,
        arguments: arguments_
      });
      return response;
    } catch (err) {
      console.error(`Failed to call tool [${name}] on MCP [${this.name}]:`, err);
      throw err;
    }
  }

  cleanupPending(error) {
    for (const [id, pending] of this.pendingRequests.entries()) {
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }

  disconnect() {
    if (this.process) {
      try {
        this.process.kill();
      } catch (e) {
        // Already dead
      }
      this.process = null;
    }
    this.status = 'disconnected';
    this.cleanupPending(new Error('MCP Server manually disconnected'));
  }
}

class MCPManager {
  constructor() {
    this.connections = new Map();
  }

  async init() {
    const config = db.getMCPServers();
    const servers = config.servers || [];

    for (const s of servers) {
      if (s.enabled) {
        const conn = new MCPServerConnection(s);
        this.connections.set(s.id, conn);
        try {
          await conn.connect();
        } catch (e) {
          console.error(`Auto-connect failed for MCP [${s.name}]:`, e);
        }
      }
    }
  }

  getConnectionsList() {
    return Array.from(this.connections.values()).map(conn => ({
      id: conn.id,
      name: conn.name,
      status: conn.status,
      error: conn.error,
      tools: conn.tools
    }));
  }

  async addServer(serverConfig) {
    const config = db.getMCPServers();
    serverConfig.id = serverConfig.id || `mcp-${Date.now()}`;
    serverConfig.enabled = serverConfig.enabled !== undefined ? serverConfig.enabled : true;

    config.servers = config.servers.filter(s => s.id !== serverConfig.id);
    config.servers.push(serverConfig);
    db.saveMCPServers(config);

    if (this.connections.has(serverConfig.id)) {
      this.connections.get(serverConfig.id).disconnect();
    }

    const conn = new MCPServerConnection(serverConfig);
    this.connections.set(serverConfig.id, conn);
    if (serverConfig.enabled) {
      await conn.connect();
    }
    return conn;
  }

  async removeServer(id) {
    const config = db.getMCPServers();
    config.servers = config.servers.filter(s => s.id !== id);
    db.saveMCPServers(config);

    if (this.connections.has(id)) {
      this.connections.get(id).disconnect();
      this.connections.delete(id);
    }
  }

  async callMCPTool(toolName, args) {
    for (const conn of this.connections.values()) {
      if (conn.status === 'connected') {
        const tool = conn.tools.find(t => t.name === toolName);
        if (tool) {
          return await conn.callTool(toolName, args);
        }
      }
    }
    throw new Error(`Tool [${toolName}] not found on any active MCP server`);
  }

  getAllMCPTools() {
    const list = [];
    for (const conn of this.connections.values()) {
      if (conn.status === 'connected') {
        for (const t of conn.tools) {
          list.push({
            ...t,
            mcpServerId: conn.id,
            mcpServerName: conn.name
          });
        }
      }
    }
    return list;
  }
}

export const mcpManager = new MCPManager();
export { MCPServerConnection };
