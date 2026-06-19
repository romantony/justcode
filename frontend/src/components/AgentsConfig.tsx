import { useState, useEffect } from 'react';
import { Users, Save, CheckSquare, Square, Info } from 'lucide-react';

interface Agent {
  id: string;
  name: string;
  role: string;
  instruction: string;
  llmConfigId: string;
  skills: string[];
  enabled: boolean;
}

interface LLMConfig {
  id: string;
  name: string;
}

interface Skill {
  id: string;
  name: string;
  description: string;
}

export default function AgentsConfig() {
  const [agents, setAgents] = useState<Record<string, Agent>>({});
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [llmConfigs, setLlmConfigs] = useState<Record<string, LLMConfig>>({});
  const [skills, setSkills] = useState<Record<string, Skill>>({});
  
  // Editor state
  const [instruction, setInstruction] = useState('');
  const [llmConfigId, setLlmConfigId] = useState('default');
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [role, setRole] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const agentsRes = await fetch('http://localhost:5001/api/agents');
      const agentsData = await agentsRes.json();
      setAgents(agentsData);

      const llmRes = await fetch('http://localhost:5001/api/config');
      const llmData = await llmRes.json();
      setLlmConfigs(llmData);

      const skillsRes = await fetch('http://localhost:5001/api/skills');
      const skillsData = await skillsRes.json();
      setSkills(skillsData);

      if (Object.keys(agentsData).length > 0) {
        selectAgent(Object.keys(agentsData)[0], agentsData);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const selectAgent = (id: string, currentAgents = agents) => {
    const agent = currentAgents[id];
    if (agent) {
      setSelectedAgentId(id);
      setInstruction(agent.instruction);
      setLlmConfigId(agent.llmConfigId);
      setSelectedSkills(agent.skills || []);
      setRole(agent.role);
    }
  };

  const toggleSkill = (skillId: string) => {
    if (selectedSkills.includes(skillId)) {
      setSelectedSkills(selectedSkills.filter(id => id !== skillId));
    } else {
      setSelectedSkills([...selectedSkills, skillId]);
    }
  };

  const handleSave = async () => {
    if (!selectedAgentId) return;

    const updatedAgents = {
      ...agents,
      [selectedAgentId]: {
        ...agents[selectedAgentId],
        instruction,
        role,
        llmConfigId,
        skills: selectedSkills
      }
    };

    try {
      const res = await fetch('http://localhost:5001/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedAgents)
      });
      if (res.ok) {
        setAgents(updatedAgents);
        alert(`${agents[selectedAgentId].name} Agent updated successfully!`);
      }
    } catch (e) {
      alert('Error updating agent.');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Users size={22} className="text-secondary" />
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Agent Profiles & Instructions</h2>
      </div>

      <div className="agents-grid">
        {Object.values(agents).map(agent => (
          <div 
            key={agent.id}
            className={`agent-card ${selectedAgentId === agent.id ? 'active' : ''}`}
            onClick={() => selectAgent(agent.id)}
          >
            <span 
              className="agent-card-indicator" 
              style={{ backgroundColor: `var(--color-${agent.id})` }}
            />
            <div className="agent-card-header">
              <div 
                style={{ 
                  width: '32px', 
                  height: '32px', 
                  borderRadius: '50%', 
                  backgroundColor: `var(--color-${agent.id})`,
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 'bold',
                  fontSize: '0.8rem'
                }}
              >
                {agent.name.substring(0, 1)}
              </div>
              <div>
                <h4 style={{ fontWeight: 600, fontSize: '0.9rem' }}>{agent.name}</h4>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{agent.role}</span>
              </div>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: '1.4', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
              {agent.instruction}
            </p>
          </div>
        ))}
      </div>

      {selectedAgentId && agents[selectedAgentId] && (
        <div className="pane" style={{ padding: '24px', gap: '16px', marginTop: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>
              Edit {agents[selectedAgentId].name} Agent
            </h3>
            
            <button 
              className="btn-primary" 
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px' }}
              onClick={handleSave}
            >
              <Save size={16} />
              Save Agent Config
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label className="form-label">Role Title</label>
              <input 
                type="text" 
                className="form-input" 
                value={role} 
                onChange={(e) => setRole(e.target.value)}
              />
            </div>
            <div>
              <label className="form-label">Target LLM Endpoint</label>
              <select 
                className="form-select" 
                value={llmConfigId}
                onChange={(e) => setLlmConfigId(e.target.value)}
              >
                {Object.entries(llmConfigs).map(([id, config]) => (
                  <option key={id} value={id}>{config.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="form-label">System Instructions / Prompts</label>
            <textarea 
              className="form-textarea" 
              style={{ minHeight: '200px' }}
              value={instruction} 
              onChange={(e) => setInstruction(e.target.value)}
            />
          </div>

          <div>
            <label className="form-label" style={{ marginBottom: '12px' }}>Authorized Skills & Tools</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
              {Object.values(skills).map(skill => {
                const isChecked = selectedSkills.includes(skill.id);
                return (
                  <div 
                    key={skill.id}
                    onClick={() => toggleSkill(skill.id)}
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '8px', 
                      padding: '10px', 
                      border: '1px solid var(--border-color)', 
                      borderRadius: '6px', 
                      cursor: 'pointer',
                      backgroundColor: isChecked ? 'rgba(59, 130, 246, 0.05)' : 'transparent',
                      borderColor: isChecked ? 'var(--accent-color)' : 'var(--border-color)',
                      transition: 'all 0.2s'
                    }}
                  >
                    {isChecked ? (
                      <CheckSquare size={16} style={{ color: 'var(--accent-color)' }} />
                    ) : (
                      <Square size={16} style={{ color: 'var(--text-muted)' }} />
                    )}
                    <div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{skill.name}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }} title={skill.description}>
                        {skill.description}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ backgroundColor: 'rgba(245, 158, 11, 0.05)', borderLeft: '3px solid #f59e0b', padding: '16px', borderRadius: '4px', display: 'flex', gap: '12px', marginTop: '8px' }}>
            <Info size={24} style={{ color: '#f59e0b', flexShrink: 0 }} />
            <div style={{ fontSize: '0.8rem', lineHeight: '1.4', color: 'var(--text-secondary)' }}>
              <strong>A2A System Note:</strong> In addition to the checked workspace tools above, all agents are automatically authorized to call the <code>delegate_task</code> tool to communicate with other members of the engineering team, and execute connected MCP tools.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
