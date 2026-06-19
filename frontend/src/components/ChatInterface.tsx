import React, { useState, useRef, useEffect } from 'react';
import { Play, Square, Code, Terminal, ChevronDown, ChevronRight, Check, AlertCircle, X } from 'lucide-react';

interface Message {
  id?: string;
  role: 'user' | 'assistant' | 'tool';
  sender?: string;
  recipient?: string;
  content: string | null;
  status?: string;
  result?: string;
  tool_calls?: any[];
  tool_call_id?: string;
  name?: string;
  timestamp?: number;
}

interface ChatInterfaceProps {
  messages: Message[];
  running: boolean;
  activeLlmOverride: string | null;
  onLlmOverrideChange: (override: string | null) => void;
  onSendMessage: (prompt: string) => void;
  onStop: () => void;
  onResume?: () => void;
  selectedFiles?: string[];
  onRemoveFile?: (path: string) => void;
  agents?: Record<string, any>;
  targetAgentId?: string;
  onTargetAgentChange?: (agentId: string) => void;
}

interface LLMConfig {
  id: string;
  name: string;
}

export default function ChatInterface({ 
  messages, 
  running, 
  activeLlmOverride, 
  onLlmOverrideChange, 
  onSendMessage, 
  onStop,
  onResume,
  selectedFiles = [],
  onRemoveFile,
  agents = {},
  targetAgentId = 'architect',
  onTargetAgentChange
}: ChatInterfaceProps) {
  const [input, setInput] = useState('');
  const [llmConfigs, setLlmConfigs] = useState<LLMConfig[]>([]);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    fetch('http://localhost:5001/api/config')
      .then(res => res.json())
      .then(data => {
        setLlmConfigs(Object.values(data));
      })
      .catch(err => console.error('Failed to load LLM configs in chat:', err));
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || running) return;
    onSendMessage(input);
    setInput('');
  };

  const formatContent = (content: string | null) => {
    if (!content) return '';
    
    // Split by markdown code blocks
    const parts = content.split(/(```[\s\S]*?```)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('```')) {
        const match = part.match(/```(\w*)\n([\s\S]*?)```/);
        const lang = match ? match[1] : '';
        const code = match ? match[2] : part.slice(3, -3);
        
        return (
          <div key={idx} className="tool-logs-container" style={{ margin: '8px 0', border: '1px solid var(--border-color)' }}>
            <div className="tool-header" style={{ padding: '6px 12px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>{lang || 'code'}</span>
            </div>
            <pre style={{ margin: 0, padding: '12px', overflowX: 'auto', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', backgroundColor: 'var(--bg-code)', color: 'var(--text-primary)' }}>
              <code>{code}</code>
            </pre>
          </div>
        );
      }

      // Parse inline code `code`
      const subparts = part.split(/(`[^`\n]+`)/g);
      return (
        <span key={idx}>
          {subparts.map((sub, sIdx) => {
            if (sub.startsWith('`') && sub.endsWith('`')) {
              return (
                <code 
                  key={sIdx} 
                  style={{ 
                    fontFamily: 'var(--font-mono)', 
                    backgroundColor: 'var(--bg-code)', 
                    color: 'var(--accent-color)',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontSize: '0.85em'
                  }}
                >
                  {sub.slice(1, -1)}
                </code>
              );
            }
            return sub;
          })}
        </span>
      );
    });
  };

  // Group tool calls and responses for easier presentation
  return (
    <div className="pane" style={{ height: '100%' }}>
      <div className="pane-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <span className="pane-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Terminal size={16} />
          Agent Execution feed
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginLeft: 'auto', marginRight: running ? '16px' : '0' }}>
          {/* Target Agent Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Target Agent:</span>
            <select 
              className="form-select" 
              style={{ width: '135px', padding: '2px 6px', fontSize: '0.75rem', height: 'auto', margin: 0, backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
              value={targetAgentId}
              onChange={(e) => onTargetAgentChange?.(e.target.value)}
              disabled={running}
            >
              {(agents && Object.keys(agents).length > 0 ? Object.values(agents) : [
                { id: 'architect', name: 'Architect' },
                { id: 'coder', name: 'Coder' },
                { id: 'tester', name: 'Tester' },
                { id: 'reviewer', name: 'Reviewer' }
              ]).map((agent: any) => (
                <option key={agent.id} value={agent.id}>{agent.name}</option>
              ))}
            </select>
          </div>

          {/* LLM Override */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>LLM Override:</span>
            <select 
              className="form-select" 
              style={{ width: '160px', padding: '2px 6px', fontSize: '0.75rem', height: 'auto', margin: 0, backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
              value={activeLlmOverride || ''}
              onChange={(e) => onLlmOverrideChange(e.target.value || null)}
            >
              <option value="">Default (Agent Setup)</option>
              {llmConfigs.map(cfg => (
                <option key={cfg.id} value={cfg.id}>{cfg.name}</option>
              ))}
            </select>
          </div>
        </div>

        {running && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="running-glow" style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--accent-color)' }}></span>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>A2A Execution active</span>
          </div>
        )}
      </div>

      <div className="chat-messages">
        {messages.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', gap: '16px' }}>
            <Terminal size={48} strokeWidth={1} />
            <div style={{ textAlign: 'center', maxWidth: '380px' }}>
              <p style={{ fontWeight: 600, marginBottom: '6px', color: 'var(--text-primary)' }}>Start a Developer Session</p>
              <p style={{ fontSize: '0.8rem', lineHeight: '1.4' }}>
                Ask the agent team to plan, build, and test features. The Architect, Coder, Tester, and Reviewer will coordinate.
              </p>
            </div>
          </div>
        ) : (
          messages.map((m, idx) => {
            // Render User messages
            if (m.role === 'user' && m.sender === 'user') {
              return (
                <div key={idx} className="message-bubble user">
                  <div className="message-meta">
                    <span className="agent-tag tag-user">Developer</span>
                  </div>
                  <div style={{ fontSize: '0.9rem' }}>{m.content}</div>
                </div>
              );
            }

            // Render Tool Results as collapsible logs
            if (m.role === 'tool') {
              return <CollapsibleToolLog key={idx} name={m.name || 'tool'} content={m.content || ''} />;
            }

            // Render LLM responses (assistant/agents)
            if (m.role === 'assistant' && m.tool_calls) {
              return (
                <div key={idx} style={{ alignSelf: 'flex-start', margin: '4px 0', fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Code size={12} />
                  <span>Agent triggered tool calls: {m.tool_calls.map(tc => tc.function.name).join(', ')}</span>
                </div>
              );
            }

            // Render regular Agent text updates
            const isAgent = m.sender && m.sender !== 'user';
            if (isAgent) {
              const tagClass = `tag-${m.sender}`;
              const name = m.sender ? m.sender.charAt(0).toUpperCase() + m.sender.slice(1) : 'Agent';
              
              return (
                <div key={idx} className="message-bubble agent">
                  <div className="message-meta">
                    <span className={`agent-tag ${tagClass}`}>{name}</span>
                    <span style={{ color: 'var(--text-muted)', fontWeight: 'normal' }}>
                      {m.recipient && m.recipient !== 'user' && `→ ${m.recipient.toUpperCase()}`}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.9rem' }}>{formatContent(m.content)}</div>
                </div>
              );
            }

            return null;
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', borderTop: '1px solid var(--border-color)' }}>
        {selectedFiles.length > 0 && (
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '6px',
            padding: '10px 20px',
            backgroundColor: 'var(--bg-code)',
            borderBottom: '1px solid var(--border-color)',
            maxHeight: '80px',
            overflowY: 'auto'
          }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', marginRight: '6px', userSelect: 'none' }}>
              Attached Context:
            </span>
            {selectedFiles.map(path => {
              const fileName = path.split(/[/\\]/).pop() || path;
              return (
                <div 
                  key={path}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    backgroundColor: 'rgba(59, 130, 246, 0.12)',
                    color: 'var(--accent-color)',
                    padding: '2px 8px',
                    borderRadius: '100px',
                    fontSize: '0.725rem',
                    fontWeight: 600,
                    border: '1px solid rgba(59, 130, 246, 0.2)'
                  }}
                >
                  <span>{fileName}</span>
                  {onRemoveFile && (
                    <button 
                      onClick={() => onRemoveFile(path)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--accent-color)',
                        cursor: 'pointer',
                        padding: '0 2px',
                        display: 'flex',
                        alignItems: 'center'
                      }}
                      title="Remove from context"
                    >
                      <X size={10} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <form onSubmit={handleSubmit} className="chat-input-bar" style={{ borderTop: 'none' }}>
        <input
          type="text"
          className="chat-input"
          placeholder="Ask the team to write, test, or refactor code..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={running}
        />
        
        {running ? (
          <button 
            type="button" 
            className="btn-danger" 
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            onClick={onStop}
          >
            <Square size={16} fill="white" />
            Stop
          </button>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {!running && messages.some(m => m.status === 'failed') && onResume && (
              <button 
                type="button" 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '6px', 
                  backgroundColor: 'rgba(59, 130, 246, 0.1)',
                  border: '1px solid rgba(59, 130, 246, 0.2)',
                  color: 'var(--accent-color)',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  marginRight: '8px',
                  transition: 'background 0.2s'
                }}
                onClick={onResume}
              >
                <Play size={12} fill="var(--accent-color)" />
                Resume Workflow
              </button>
            )}
            <button 
              type="submit" 
              className="btn-send"
              disabled={!input.trim()}
            >
              <Play size={16} fill="white" />
              Run
            </button>
          </div>
        )}
      </form>
      </div>
    </div>
  );
}

// Collapsible Tool Log Component
function CollapsibleToolLog({ name, content }: { name: string; content: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const isError = content.startsWith('ERROR') || content.includes('exitCode: 1') || content.includes('stderr');

  return (
    <div className="tool-logs-container" style={{ alignSelf: 'flex-start', width: '100%', maxWidth: '85%' }}>
      <div 
        className="tool-header" 
        onClick={() => setIsOpen(!isOpen)}
        style={{ color: isError ? '#ef4444' : 'var(--text-secondary)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {isError ? <AlertCircle size={12} /> : <Check size={12} />}
          <span style={{ fontWeight: 600 }}>Executed Tool:</span>
          <code>{name}</code>
        </div>
        <span style={{ fontSize: '0.7rem', opacity: 0.8 }}>
          {isOpen ? 'Click to hide logs' : 'Click to show logs'}
        </span>
      </div>
      
      {isOpen && (
        <pre className="tool-body">
          <code>{content}</code>
        </pre>
      )}
    </div>
  );
}
