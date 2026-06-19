import { useState, useEffect, useRef } from 'react';
import { Users, Code, Settings, Sun, Moon, Plus, MessageSquare, ArrowRightLeft, ChevronRight } from 'lucide-react';
import ChatInterface from './components/ChatInterface';
import AgentGraph from './components/AgentGraph';
import AgentsConfig from './components/AgentsConfig';
import SkillsManager from './components/SkillsManager';
import SettingsPanel from './components/SettingsPanel';
import FileExplorer from './components/FileExplorer';
import TerminalConsole from './components/TerminalConsole';

interface ChatSummary {
  id: string;
  title: string;
  llmOverride?: string | null;
  createdAt: number;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'chat' | 'agents' | 'skills' | 'settings'>('chat');
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('theme');
    return (saved as 'dark' | 'light') || 'dark';
  });
  
  const [chatsList, setChatsList] = useState<ChatSummary[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [activeLlmOverride, setActiveLlmOverride] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [running, setRunning] = useState(false);
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [statusText, setStatusText] = useState('Workspace Ready');
  const [showExplorer, setShowExplorer] = useState(true);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);

  const handleToggleSelectFile = (path: string) => {
    setSelectedFiles(prev => 
      prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]
    );
  };

  const activeChatRef = useRef<string | null>(null);

  // Sync ref for EventSource callback
  useEffect(() => {
    activeChatRef.current = activeChatId;
  }, [activeChatId]);

  // Handle Theme switching
  useEffect(() => {
    localStorage.setItem('theme', theme);
    const bodyClass = document.body.classList;
    if (theme === 'dark') {
      bodyClass.add('dark');
    } else {
      bodyClass.remove('dark');
    }
  }, [theme]);

  // Load chats on mount
  useEffect(() => {
    fetchChats();
  }, []);

  // Listen to Server-Sent Events from backend
  useEffect(() => {
    const eventSource = new EventSource('http://localhost:5001/api/events');
    
    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        
        // Only trigger updates if the event is for the currently viewed chat session
        if (payload.chatId === activeChatRef.current) {
          fetchChatDetails(payload.chatId);

          // Update status bar texts based on events
          if (payload.type === 'agent_started') {
            setStatusText(`Agent [${payload.data.agentId.toUpperCase()}] is reasoning...`);
          } else if (payload.type === 'tool_started') {
            setStatusText(`Executing tool: ${payload.data.tool}`);
          } else if (payload.type === 'tool_completed') {
            setStatusText(`Completed tool: ${payload.data.tool}`);
          } else if (payload.type === 'agent_delegated') {
            setStatusText(`Delegating task to [${payload.data.recipient.toUpperCase()}]`);
          } else if (payload.type === 'execution_completed') {
            setStatusText('Workflow finished.');
            fetchChats(); // Refresh sidebar list titles
          } else if (payload.type === 'execution_stopped') {
            setStatusText('Workflow stopped by user.');
          } else if (payload.type === 'execution_failed') {
            setStatusText(`Workflow failed: ${payload.data.error}`);
          }
        }
      } catch (err) {
        console.error('SSE JSON parse error:', err);
      }
    };

    return () => {
      eventSource.close();
    };
  }, []);

  const fetchChats = async () => {
    try {
      const res = await fetch('http://localhost:5001/api/chats');
      const data = await res.json();
      setChatsList(data);
      
      // If we have past chats and no active chat is selected, open the first one
      if (data.length > 0 && !activeChatId) {
        handleSelectChat(data[0].id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchChatDetails = async (chatId: string) => {
    try {
      const res = await fetch(`http://localhost:5001/api/chats/${chatId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
        setActiveLlmOverride(data.llmOverride || null);
        
        const isRunning = data.messages.some((m: any) => m.status === 'running' || m.status === 'pending');
        setRunning(isRunning);

        const currentActiveMsg = data.messages.find((m: any) => m.status === 'running');
        if (currentActiveMsg) {
          setActiveAgent(currentActiveMsg.recipient);
        } else {
          setActiveAgent(null);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSelectChat = (chatId: string) => {
    setActiveChatId(chatId);
    fetchChatDetails(chatId);
    setStatusText('Session loaded');
  };

  const handleCreateNewSession = () => {
    const newId = `session-${Date.now()}`;
    setActiveChatId(newId);
    setMessages([]);
    setActiveLlmOverride(null);
    setRunning(false);
    setActiveAgent(null);
    setStatusText('New session initialized');
  };

  const handleLlmOverrideChange = async (override: string | null) => {
    setActiveLlmOverride(override);
    if (activeChatId) {
      try {
        await fetch(`http://localhost:5001/api/chats/${activeChatId}/override`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ llmOverride: override })
        });
        fetchChats(); // Refresh summaries
      } catch (err) {
        console.error('Failed to save LLM override:', err);
      }
    }
  };

  const handleSendMessage = async (prompt: string) => {
    const id = activeChatId || `session-${Date.now()}`;
    const override = activeLlmOverride;
    if (!activeChatId) {
      setActiveChatId(id);
    }

    setStatusText('Starting workflow...');
    setRunning(true);

    try {
      const res = await fetch('http://localhost:5001/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: id,
          prompt,
          llmOverride: override,
          contextFiles: selectedFiles
        })
      });
      if (res.ok) {
        setSelectedFiles([]);
        fetchChats(); // Update sessions list
        fetchChatDetails(id);
      } else {
        const data = await res.json();
        alert(`Error starting execution: ${data.error}`);
        setRunning(false);
      }
    } catch (err: any) {
      alert(`Network error starting execution: ${err.message}`);
      setRunning(false);
    }
  };

  const handleStopExecution = async () => {
    if (!activeChatId) return;
    setStatusText('Stopping execution...');
    try {
      await fetch(`http://localhost:5001/api/chats/${activeChatId}/stop`, {
        method: 'POST'
      });
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="app-container">
      
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <img src="/logo.svg" alt="JustCode Logo" style={{ width: '22px', height: '22px' }} />
          <span className="sidebar-logo">JustCode Agents</span>
        </div>

        <nav className="sidebar-menu">
          <button 
            className={`sidebar-btn ${activeTab === 'chat' ? 'active' : ''}`}
            onClick={() => setActiveTab('chat')}
          >
            <ArrowRightLeft size={16} />
            Workspace
          </button>
          
          <button 
            className={`sidebar-btn ${activeTab === 'agents' ? 'active' : ''}`}
            onClick={() => setActiveTab('agents')}
          >
            <Users size={16} />
            Agent Setup
          </button>

          <button 
            className={`sidebar-btn ${activeTab === 'skills' ? 'active' : ''}`}
            onClick={() => setActiveTab('skills')}
          >
            <Code size={16} />
            Custom Skills
          </button>

          <button 
            className={`sidebar-btn ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <Settings size={16} />
            LLM & MCP Settings
          </button>

          <div style={{ marginTop: '24px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Sessions</span>
              <button 
                className="theme-toggle-btn" 
                style={{ padding: '4px', border: 'none', color: '#cbd5e1' }}
                onClick={handleCreateNewSession}
                title="New Session"
              >
                <Plus size={14} />
              </button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '300px', overflowY: 'auto' }}>
              {chatsList.length === 0 ? (
                <span style={{ fontSize: '0.75rem', color: '#64748b', padding: '8px' }}>No active runs.</span>
              ) : (
                chatsList.map(summary => (
                  <button
                    key={summary.id}
                    className={`sidebar-btn ${activeChatId === summary.id ? 'active' : ''}`}
                    style={{ padding: '8px 12px', fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}
                    onClick={() => handleSelectChat(summary.id)}
                  >
                    <MessageSquare size={12} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle' }} />
                    {summary.title}
                  </button>
                ))
              )}
            </div>
          </div>
        </nav>

        <div className="sidebar-footer">
          <button 
            className="theme-toggle-btn"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} theme`}
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#94a3b8' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10b981' }}></span>
            <span>Online</span>
          </div>
        </div>
      </aside>

      {/* Main Container */}
      <main className="main-workspace">
        <header className="topbar">
          <div className="topbar-title">
            {activeTab === 'chat' && 'Developer Agent Workspace'}
            {activeTab === 'agents' && 'Configure Agents & Instructions'}
            {activeTab === 'skills' && 'Custom Skills Developer'}
            {activeTab === 'settings' && 'System Configuration Settings'}
          </div>
          
          <div className="topbar-actions">
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
              {statusText}
            </span>
          </div>
        </header>

        {activeTab === 'chat' && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            <div className="workspace-grid" style={{
              gridTemplateColumns: showExplorer ? '240px 1.2fr 0.8fr' : '40px 1.2fr 0.8fr',
              flex: 1
            }}>
              {showExplorer ? (
                <FileExplorer 
                  onCollapse={() => setShowExplorer(false)} 
                  selectedFiles={selectedFiles}
                  onToggleSelectFile={handleToggleSelectFile}
                />
              ) : (
                <div 
                  onClick={() => setShowExplorer(true)}
                  style={{
                    backgroundColor: 'var(--bg-panel)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    padding: '16px 0',
                    cursor: 'pointer',
                    gap: '12px',
                    color: 'var(--text-secondary)',
                    height: '100%',
                    userSelect: 'none'
                  }}
                  title="Expand File Explorer"
                >
                  <ChevronRight size={16} />
                  <span style={{
                    writingMode: 'vertical-rl',
                    textOrientation: 'mixed',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    letterSpacing: '1px'
                  }}>EXPLORER</span>
                </div>
              )}
              <ChatInterface 
                messages={messages} 
                running={running} 
                activeLlmOverride={activeLlmOverride}
                onLlmOverrideChange={handleLlmOverrideChange}
                onSendMessage={handleSendMessage} 
                onStop={handleStopExecution}
                selectedFiles={selectedFiles}
                onRemoveFile={handleToggleSelectFile}
              />
              <AgentGraph activeAgentId={activeAgent} />
            </div>
            <TerminalConsole />
          </div>
        )}

        {activeTab === 'agents' && (
          <div className="content-area">
            <AgentsConfig />
          </div>
        )}

        {activeTab === 'skills' && (
          <SkillsManager />
        )}

        {activeTab === 'settings' && (
          <div className="content-area">
            <SettingsPanel />
          </div>
        )}
      </main>

    </div>
  );
}
