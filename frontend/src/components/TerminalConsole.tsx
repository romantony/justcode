import React, { useState, useEffect, useRef } from 'react';
import { Terminal as TerminalIcon, ChevronDown, ChevronUp, Play, Trash2 } from 'lucide-react';

interface TerminalLine {
  type: 'command' | 'stdout' | 'stderr' | 'system';
  text: string;
}

export default function TerminalConsole() {
  const [isOpen, setIsOpen] = useState(false);
  const [history, setHistory] = useState<TerminalLine[]>([
    { type: 'system', text: 'JustCode Interactive Workspace Shell initialized.' }
  ]);
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const [workspaceName, setWorkspaceName] = useState('workspace');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Fetch the workspace directory name to display in the prompt
    fetch('http://localhost:5001/api/workspace/files')
      .then(res => res.json())
      .then(data => {
        const parts = (data.workspacePath || '').split(/[/\\]/);
        setWorkspaceName(parts[parts.length - 1] || 'workspace');
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history, isOpen]);

  const handleRunCommand = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || running) return;

    const cmd = input.trim();
    setInput('');
    setRunning(true);
    setHistory(prev => [...prev, { type: 'command', text: `$ ${cmd}` }]);

    try {
      const res = await fetch('http://localhost:5001/api/terminal/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd })
      });
      const data = await res.json();
      
      const newLines: TerminalLine[] = [];
      if (data.stdout) {
        newLines.push({ type: 'stdout', text: data.stdout });
      }
      if (data.stderr) {
        newLines.push({ type: 'stderr', text: data.stderr });
      }
      if (data.exitCode !== 0) {
        newLines.push({ type: 'system', text: `Command exited with status code ${data.exitCode}` });
      }
      
      setHistory(prev => [...prev, ...newLines]);
    } catch (err: any) {
      setHistory(prev => [...prev, { type: 'stderr', text: `Network Error: ${err.message}` }]);
    } finally {
      setRunning(false);
    }
  };

  const clearHistory = () => {
    setHistory([{ type: 'system', text: 'Shell cleared.' }]);
  };

  return (
    <div style={{
      borderTop: '1px solid var(--border-color)',
      backgroundColor: '#0b0c10',
      color: '#cbd5e1',
      fontFamily: 'var(--font-mono)',
      display: 'flex',
      flexDirection: 'column',
      height: isOpen ? '240px' : '36px',
      transition: 'height 0.2s ease',
      zIndex: 50
    }}>
      {/* Header bar */}
      <div 
        onClick={() => setIsOpen(!isOpen)}
        style={{
          height: '36px',
          padding: '0 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          borderBottom: isOpen ? '1px solid var(--border-color)' : 'none',
          userSelect: 'none'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981' }}>
          <TerminalIcon size={14} />
          <span style={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.5px' }}>
            TERMINAL - {workspaceName}
          </span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }} onClick={e => e.stopPropagation()}>
          {isOpen && (
            <button 
              onClick={clearHistory}
              style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px', display: 'flex' }}
              title="Clear terminal output"
            >
              <Trash2 size={13} />
            </button>
          )}
          <button 
            onClick={() => setIsOpen(!isOpen)}
            style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px', display: 'flex' }}
          >
            {isOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>
      </div>

      {/* Terminal logs content */}
      {isOpen && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div 
            ref={scrollRef}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '12px 16px',
              fontSize: '0.8rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              lineHeight: '1.4'
            }}
          >
            {history.map((line, idx) => {
              let color = '#94a3b8'; // Default system gray
              if (line.type === 'command') color = '#3b82f6';
              if (line.type === 'stdout') color = '#e2e8f0';
              if (line.type === 'stderr') color = '#ef4444';
              return (
                <div key={idx} style={{ color, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {line.text}
                </div>
              );
            })}
          </div>

          {/* Interactive input bar */}
          <form 
            onSubmit={handleRunCommand}
            style={{
              height: '36px',
              borderTop: '1px solid #1e293b',
              display: 'flex',
              alignItems: 'center',
              padding: '0 16px',
              gap: '8px',
              backgroundColor: '#07080b'
            }}
          >
            <span style={{ fontSize: '0.8rem', color: '#10b981', userSelect: 'none' }}>
              {workspaceName}$
            </span>
            <input 
              type="text" 
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={running ? 'Running command...' : 'Type shell command...'}
              disabled={running}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: '#fff',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.8rem'
              }}
            />
            {input.trim() && (
              <button 
                type="submit"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#10b981',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex'
                }}
              >
                <Play size={12} fill="#10b981" />
              </button>
            )}
          </form>
        </div>
      )}
    </div>
  );
}
