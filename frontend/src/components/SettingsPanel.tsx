import React, { useState, useEffect } from 'react';
import { Key, Server, Plus, Trash2, Cpu, AlertCircle } from 'lucide-react';

interface LLMConfig {
  id: string;
  name: string;
  provider: string;
  model: string;
  apiKey: string;
  baseUrl: string;
  maxTokens: number;
  temperature: number;
  useSubscription?: boolean;
  authToken?: string;
}

interface MCPServer {
  id: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  status: string;
  error: string | null;
  tools: any[];
}

export default function SettingsPanel() {
  const [llmConfigs, setLlmConfigs] = useState<Record<string, LLMConfig>>({});
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([]);
  
  // MCP Form state
  const [mcpName, setMcpName] = useState('');
  const [mcpCommand, setMcpCommand] = useState('');
  const [mcpArgsStr, setMcpArgsStr] = useState('');
  const [mcpEnvStr, setMcpEnvStr] = useState('');
  const [isAddingMcp, setIsAddingMcp] = useState(false);
  const [mcpError, setMcpError] = useState<string | null>(null);

  useEffect(() => {
    fetchConfigs();
    fetchMcpServers();
  }, []);

  const fetchConfigs = async () => {
    try {
      const res = await fetch('http://localhost:5001/api/config');
      const data = await res.json();
      setLlmConfigs(data);
    } catch (e) {
      console.error('Failed to fetch configurations:', e);
    }
  };

  const fetchMcpServers = async () => {
    try {
      const res = await fetch('http://localhost:5001/api/mcp/servers');
      const data = await res.json();
      setMcpServers(data);
    } catch (e) {
      console.error('Failed to fetch MCP servers:', e);
    }
  };

  const handleSaveLLM = async (id: string, updated: Partial<LLMConfig>) => {
    const newConfigs = {
      ...llmConfigs,
      [id]: { ...llmConfigs[id], ...updated }
    };
    
    try {
      const res = await fetch('http://localhost:5001/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfigs)
      });
      if (res.ok) {
        setLlmConfigs(newConfigs);
        alert('LLM Configuration Saved!');
      }
    } catch (e) {
      alert('Error saving configuration');
    }
  };

  const handleAddNewLLM = async () => {
    const newId = `custom-${Date.now()}`;
    const newConfig: LLMConfig = {
      id: newId,
      name: 'Custom LLM',
      provider: 'openai',
      model: 'gpt-4',
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      maxTokens: 4096,
      temperature: 0.2,
      useSubscription: false,
      authToken: ''
    };
    
    const newConfigs = {
      ...llmConfigs,
      [newId]: newConfig
    };
    
    try {
      const res = await fetch('http://localhost:5001/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfigs)
      });
      if (res.ok) {
        setLlmConfigs(newConfigs);
        alert('Custom LLM Configuration Added!');
      }
    } catch (e) {
      alert('Error adding new configuration');
    }
  };

  const handleDeleteLLM = async (id: string) => {
    if (!confirm('Are you sure you want to delete this LLM configuration?')) return;
    const { [id]: deleted, ...remaining } = llmConfigs;
    try {
      const res = await fetch('http://localhost:5001/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(remaining)
      });
      if (res.ok) {
        setLlmConfigs(remaining);
        alert('LLM Configuration Deleted!');
      }
    } catch (e) {
      alert('Error deleting configuration');
    }
  };

  const handleAddMcp = async (e: React.FormEvent) => {
    e.preventDefault();
    setMcpError(null);

    const args = mcpArgsStr.split(/\s+/).filter(Boolean);
    let env = {};
    if (mcpEnvStr.trim()) {
      try {
        env = JSON.parse(mcpEnvStr);
      } catch (err) {
        setMcpError('Environment variables must be valid JSON: {"KEY": "VALUE"}');
        return;
      }
    }

    try {
      const res = await fetch('http://localhost:5001/api/mcp/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: mcpName,
          command: mcpCommand,
          args,
          env
        })
      });
      
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to connect to MCP server');
      }

      setMcpName('');
      mcpCommand === '' ? null : setMcpCommand('');
      setMcpArgsStr('');
      setMcpEnvStr('');
      setIsAddingMcp(false);
      fetchMcpServers();
    } catch (err: any) {
      setMcpError(err.message);
    }
  };

  const handleDeleteMcp = async (id: string) => {
    if (!confirm('Are you sure you want to remove this MCP server connection?')) return;
    try {
      const res = await fetch(`http://localhost:5001/api/mcp/servers/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        fetchMcpServers();
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', maxWidth: '900px', width: '100%', margin: '0 auto' }}>
      
      {/* LLM Section */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Key size={22} className="text-secondary" />
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>LLM Provider Settings</h2>
          </div>
          <button 
            className="btn-primary" 
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px' }}
            onClick={handleAddNewLLM}
          >
            <Plus size={16} />
            Add Custom LLM
          </button>
        </div>
        
        {Object.entries(llmConfigs).map(([id, config]) => (
          <div key={id} className="settings-group" style={{ marginBottom: '16px' }}>
            <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '8px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              {id === 'default' || id === 'claude' || id === 'codex' ? (
                <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>
                  {config.name} {id === 'default' && '(Global Default)'}
                </h3>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexGrow: 1 }}>
                  <label style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Config Name:</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    style={{ padding: '4px 8px', fontSize: '0.9rem', width: '220px', height: 'auto', margin: 0 }}
                    value={config.name} 
                    onChange={(e) => handleSaveLLM(id, { name: e.target.value })}
                  />
                </div>
              )}
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label className="form-label">API Provider</label>
                <select 
                  className="form-select" 
                  value={config.provider}
                  onChange={(e) => handleSaveLLM(id, { provider: e.target.value })}
                >
                  <option value="gemini">Gemini</option>
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Claude (Anthropic)</option>
                  <option value="codex">Codex (OpenAI Proxy)</option>
                  <option value="ollama">Ollama (Local)</option>
                </select>
              </div>

              <div>
                <label className="form-label">Model Name</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={config.model} 
                  placeholder={
                    config.provider === 'gemini' ? 'gemini-1.5-flash' :
                    config.provider === 'anthropic' ? 'claude-3-5-sonnet-20241022' :
                    config.provider === 'codex' ? 'code-davinci-002' :
                    'gpt-4o'
                  }
                  onChange={(e) => handleSaveLLM(id, { model: e.target.value })}
                />
              </div>

              <div style={{ gridColumn: 'span 2' }}>
                <label className="form-label">API Base URL</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={config.baseUrl} 
                  onChange={(e) => handleSaveLLM(id, { baseUrl: e.target.value })}
                />
              </div>

              <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: '8px', margin: '4px 0' }}>
                <input 
                  type="checkbox" 
                  id={`use-sub-${id}`}
                  checked={!!config.useSubscription} 
                  onChange={(e) => handleSaveLLM(id, { useSubscription: e.target.checked })} 
                />
                <label htmlFor={`use-sub-${id}`} style={{ fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer', color: 'var(--text-secondary)' }}>
                  Use Subscription Bearer Token (Direct Bearer Auth)
                </label>
              </div>

              {config.useSubscription ? (
                <div style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Subscription Bearer Token</label>
                  <input 
                    type="password" 
                    className="form-input" 
                    value={config.authToken || ''} 
                    placeholder="Enter Bearer Token"
                    onChange={(e) => handleSaveLLM(id, { authToken: e.target.value })}
                  />
                </div>
              ) : (
                <div style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">API Key</label>
                  <input 
                    type="password" 
                    className="form-input" 
                    value={config.apiKey} 
                    placeholder={config.provider === 'ollama' ? 'Not required for Ollama' : 'Enter API Key'}
                    onChange={(e) => handleSaveLLM(id, { apiKey: e.target.value })}
                  />
                </div>
              )}

              <div>
                <label className="form-label">Temperature ({config.temperature})</label>
                <input 
                  type="range" 
                  min="0" 
                  max="1" 
                  step="0.1" 
                  value={config.temperature} 
                  style={{ width: '100%' }}
                  onChange={(e) => handleSaveLLM(id, { temperature: parseFloat(e.target.value) })}
                />
              </div>

              <div>
                <label className="form-label">Max Token Output</label>
                <input 
                  type="number" 
                  className="form-input" 
                  value={config.maxTokens} 
                  onChange={(e) => handleSaveLLM(id, { maxTokens: parseInt(e.target.value) })}
                />
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              <button 
                className="btn-primary" 
                onClick={() => handleSaveLLM(id, {})}
              >
                Save Configuration
              </button>
              {id !== 'default' && id !== 'claude' && id !== 'codex' && (
                <button 
                  className="btn-danger" 
                  onClick={() => handleDeleteLLM(id)}
                >
                  Delete Configuration
                </button>
              )}
            </div>
          </div>
        ))}
      </section>

      {/* MCP Connections Section */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Server size={22} className="text-secondary" />
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Model Context Protocol (MCP) Servers</h2>
          </div>
          <button 
            className="btn-primary" 
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px' }}
            onClick={() => setIsAddingMcp(!isAddingMcp)}
          >
            <Plus size={16} />
            Add Server
          </button>
        </div>

        {isAddingMcp && (
          <form onSubmit={handleAddMcp} className="settings-group" style={{ marginBottom: '24px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Configure New MCP stdio Connection</h3>
            
            {mcpError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: '6px', fontSize: '0.85rem' }}>
                <AlertCircle size={16} />
                <span>{mcpError}</span>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label className="form-label">Server Name</label>
                <input 
                  type="text" 
                  required
                  className="form-input" 
                  placeholder="e.g. Memory Server"
                  value={mcpName}
                  onChange={(e) => setMcpName(e.target.value)}
                />
              </div>

              <div>
                <label className="form-label">Launch Command</label>
                <input 
                  type="text" 
                  required
                  className="form-input" 
                  placeholder="e.g. npx or node"
                  value={mcpCommand}
                  onChange={(e) => setMcpCommand(e.target.value)}
                />
              </div>

              <div style={{ gridColumn: 'span 2' }}>
                <label className="form-label">Arguments (separated by space)</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. -y @modelcontextprotocol/server-postgres postgres://localhost/mydb"
                  value={mcpArgsStr}
                  onChange={(e) => setMcpArgsStr(e.target.value)}
                />
              </div>

              <div style={{ gridColumn: 'span 2' }}>
                <label className="form-label">Environment Variables JSON (Optional)</label>
                <textarea 
                  className="form-input" 
                  style={{ minHeight: '80px', fontFamily: 'var(--font-mono)' }}
                  placeholder='e.g. { "API_KEY": "12345", "PORT": "3000" }'
                  value={mcpEnvStr}
                  onChange={(e) => setMcpEnvStr(e.target.value)}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
              <button type="submit" className="btn-primary">Connect Server</button>
              <button 
                type="button" 
                className="btn-danger" 
                style={{ backgroundColor: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
                onClick={() => setIsAddingMcp(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="mcp-servers-grid">
          {mcpServers.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border-color)', borderRadius: '12px' }}>
              No MCP Servers registered yet. Add one above to expose database or filesystem tools to the agents.
            </div>
          ) : (
            mcpServers.map(server => (
              <div key={server.id} className="mcp-server-card">
                <div className="mcp-card-top">
                  <div>
                    <h4 style={{ fontWeight: 600, fontSize: '0.95rem' }}>{server.name}</h4>
                    <code style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                      {server.command} {server.args.join(' ')}
                    </code>
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span className={`mcp-status-tag ${server.status}`}>
                      {server.status}
                    </span>
                    <button 
                      className="theme-toggle-btn" 
                      style={{ padding: '6px', border: 'none', color: '#ef4444' }}
                      onClick={() => handleDeleteMcp(server.id)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {server.error && (
                  <div style={{ fontSize: '0.8rem', color: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.05)', padding: '8px 12px', borderRadius: '4px', borderLeft: '3px solid #ef4444' }}>
                    {server.error}
                  </div>
                )}

                {server.status === 'connected' && (
                  <div>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>
                      Exposed Tools ({server.tools.length}):
                    </span>
                    <div className="mcp-tools-list">
                      {server.tools.map(tool => (
                        <div key={tool.name} className="mcp-tool-badge" title={tool.description}>
                          <Cpu size={10} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                          {tool.name}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
