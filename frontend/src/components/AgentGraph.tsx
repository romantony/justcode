import { Activity } from 'lucide-react';

interface AgentGraphProps {
  activeAgentId: string | null;
}

export default function AgentGraph({ activeAgentId }: AgentGraphProps) {
  const agentsList = [
    {
      id: 'architect',
      name: 'Architect',
      role: 'System Architect',
      description: 'Breaks down requirements and plans code layouts.',
      color: 'var(--color-architect)',
      x: '10%',
      y: '10%'
    },
    {
      id: 'coder',
      name: 'Coder',
      role: 'Lead Developer',
      description: 'Implements modules and writes source files.',
      color: 'var(--color-coder)',
      x: '60%',
      y: '10%'
    },
    {
      id: 'tester',
      name: 'Tester',
      role: 'QA Engineer',
      description: 'Executes commands, checks build & tests.',
      color: 'var(--color-tester)',
      x: '60%',
      y: '60%'
    },
    {
      id: 'reviewer',
      name: 'Reviewer',
      role: 'Senior Code Auditor',
      description: 'Audits files, confirms specifications.',
      color: 'var(--color-reviewer)',
      x: '10%',
      y: '60%'
    }
  ];

  return (
    <div className="graph-container">
      {/* SVG Arrow Connectors */}
      <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1 }}>
        <defs>
          <marker id="arrow-architect-coder" markerWidth="10" markerHeight="7" refX="6" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill={activeAgentId === 'coder' ? 'var(--color-coder)' : 'var(--border-color)'} />
          </marker>
          <marker id="arrow-coder-tester" markerWidth="10" markerHeight="7" refX="6" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill={activeAgentId === 'tester' ? 'var(--color-tester)' : 'var(--border-color)'} />
          </marker>
          <marker id="arrow-tester-reviewer" markerWidth="10" markerHeight="7" refX="6" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill={activeAgentId === 'reviewer' ? 'var(--color-reviewer)' : 'var(--border-color)'} />
          </marker>
          <marker id="arrow-reviewer-architect" markerWidth="10" markerHeight="7" refX="6" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill={activeAgentId === 'architect' ? 'var(--color-architect)' : 'var(--border-color)'} />
          </marker>
        </defs>

        {/* Architect -> Coder */}
        <line 
          x1="28%" y1="22%" x2="58%" y2="22%" 
          stroke={activeAgentId === 'coder' ? 'var(--color-coder)' : 'var(--border-color)'} 
          strokeWidth={activeAgentId === 'coder' ? '3' : '2'}
          strokeDasharray={activeAgentId === 'coder' ? '5,5' : 'none'}
          markerEnd="url(#arrow-architect-coder)"
          style={{ transition: 'all 0.3s' }}
        />
        
        {/* Coder -> Tester */}
        <line 
          x1="72%" y1="36%" x2="72%" y2="58%" 
          stroke={activeAgentId === 'tester' ? 'var(--color-tester)' : 'var(--border-color)'} 
          strokeWidth={activeAgentId === 'tester' ? '3' : '2'}
          strokeDasharray={activeAgentId === 'tester' ? '5,5' : 'none'}
          markerEnd="url(#arrow-coder-tester)"
          style={{ transition: 'all 0.3s' }}
        />

        {/* Tester -> Reviewer */}
        <line 
          x1="58%" y1="72%" x2="28%" y2="72%" 
          stroke={activeAgentId === 'reviewer' ? 'var(--color-reviewer)' : 'var(--border-color)'} 
          strokeWidth={activeAgentId === 'reviewer' ? '3' : '2'}
          strokeDasharray={activeAgentId === 'reviewer' ? '5,5' : 'none'}
          markerEnd="url(#arrow-tester-reviewer)"
          style={{ transition: 'all 0.3s' }}
        />

        {/* Reviewer -> Architect */}
        <line 
          x1="18%" y1="58%" x2="18%" y2="36%" 
          stroke={activeAgentId === 'architect' ? 'var(--color-architect)' : 'var(--border-color)'} 
          strokeWidth={activeAgentId === 'architect' ? '3' : '2'}
          strokeDasharray={activeAgentId === 'architect' ? '5,5' : 'none'}
          markerEnd="url(#arrow-reviewer-architect)"
          style={{ transition: 'all 0.3s' }}
        />
      </svg>

      <div style={{ position: 'relative', width: '100%', height: '100%', zIndex: 2 }}>
        {agentsList.map(a => {
          const isActive = activeAgentId === a.id;
          return (
            <div 
              key={a.id} 
              className={`graph-node ${isActive ? 'active' : ''}`}
              style={{ 
                position: 'absolute', 
                left: a.x, 
                top: a.y,
                borderTopColor: isActive ? a.color : 'var(--border-color)',
                borderTopWidth: '4px'
              }}
            >
              <div 
                className={`graph-node-avatar`}
                style={{ backgroundColor: a.color }}
              >
                {a.name.substring(0, 1)}
              </div>
              <div className="graph-node-name">{a.name}</div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>{a.role}</div>
              
              {isActive ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                  <Activity size={10} style={{ color: a.color }} />
                  <span className="graph-node-status" style={{ color: a.color, fontWeight: 'bold' }}>Reasoning</span>
                </div>
              ) : (
                <span className="graph-node-status">Idle</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
