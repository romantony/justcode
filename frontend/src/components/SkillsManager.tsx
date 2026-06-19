import { useState, useEffect } from 'react';
import { Code, Plus, Save, BookOpen } from 'lucide-react';

interface Skill {
  id: string;
  name: string;
  description: string;
  code: string;
}

export default function SkillsManager() {
  const [skills, setSkills] = useState<Record<string, Skill>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  
  // Editor state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [code, setCode] = useState('');
  const [editId, setEditId] = useState('');

  useEffect(() => {
    fetchSkills();
  }, []);

  const fetchSkills = async () => {
    try {
      const res = await fetch('http://localhost:5001/api/skills');
      const data = await res.json();
      setSkills(data);
      if (Object.keys(data).length > 0 && !selectedId) {
        selectSkill(Object.keys(data)[0], data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const selectSkill = (id: string, currentSkills = skills) => {
    const skill = currentSkills[id];
    if (skill) {
      setSelectedId(id);
      setEditId(skill.id);
      setName(skill.name);
      setDescription(skill.description);
      setCode(skill.code);
    }
  };

  const handleCreateNew = () => {
    setSelectedId(null);
    setEditId(`custom_skill_${Date.now()}`);
    setName('New Skill');
    setDescription('Describe when the LLM should invoke this tool and its parameters.');
    setCode(`// Skill parameters: { myParam: string }
export async function run({ workspacePath, params }) {
  const fs = await import('fs');
  const path = await import('path');
  
  // Implement skill logic
  const targetPath = path.join(workspacePath, params.myParam || 'test.txt');
  
  return \`Skill executed successfully. Workspace path: \${workspacePath}\`;
}`);
  };

  const handleSave = async () => {
    if (!name.trim() || !description.trim() || !code.trim()) {
      alert('Please fill out all fields.');
      return;
    }

    const updatedSkills = {
      ...skills,
      [editId]: {
        id: editId,
        name,
        description,
        code
      }
    };

    try {
      const res = await fetch('http://localhost:5001/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedSkills)
      });
      if (res.ok) {
        setSkills(updatedSkills);
        setSelectedId(editId);
        alert('Skill saved successfully!');
      }
    } catch (e) {
      alert('Error saving skill.');
    }
  };

  return (
    <div className="skills-workspace">
      
      {/* Sidebar List */}
      <div className="skills-list-pane">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Skill Registry</span>
          <button 
            className="theme-toggle-btn" 
            style={{ padding: '6px', borderRadius: '6px' }}
            onClick={handleCreateNew}
            title="Create Custom Skill"
          >
            <Plus size={16} />
          </button>
        </div>

        {Object.values(skills).map(skill => (
          <div 
            key={skill.id} 
            className={`skill-list-item ${selectedId === skill.id ? 'active' : ''}`}
            onClick={() => selectSkill(skill.id)}
          >
            <div className="skill-item-name">{skill.name}</div>
            <div className="skill-item-desc">{skill.description}</div>
          </div>
        ))}
      </div>

      {/* Editor Panel */}
      <div className="pane" style={{ padding: '24px', gap: '16px', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Code size={18} className="text-secondary" />
            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Skill Workspace</h3>
          </div>
          <button 
            className="btn-primary" 
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px' }}
            onClick={handleSave}
          >
            <Save size={16} />
            Save Skill
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label className="form-label">Skill Name</label>
              <input 
                type="text" 
                className="form-input" 
                value={name} 
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="form-label">Skill ID (unique identifier)</label>
              <input 
                type="text" 
                className="form-input" 
                value={editId} 
                disabled={selectedId !== null} // Lock ID if editing existing
                onChange={(e) => setEditId(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
              />
            </div>
          </div>

          <div>
            <label className="form-label">LLM Tool Instruction (Description)</label>
            <input 
              type="text" 
              className="form-input" 
              value={description} 
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label className="form-label" style={{ margin: 0 }}>Javascript Implementation (run() function)</label>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                run({'{ workspacePath, params }'})
              </span>
            </div>
            
            <textarea 
              className="form-textarea" 
              style={{ minHeight: '350px', fontSize: '0.85rem' }}
              value={code} 
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
        </div>

        <div style={{ backgroundColor: 'rgba(59, 130, 246, 0.05)', borderLeft: '3px solid var(--accent-color)', padding: '16px', borderRadius: '4px', display: 'flex', gap: '12px' }}>
          <BookOpen size={24} style={{ color: 'var(--accent-color)', flexShrink: 0 }} />
          <div style={{ fontSize: '0.8rem', lineHeight: '1.4', color: 'var(--text-secondary)' }}>
            <strong>How skills work:</strong> When the agent determines it needs this tool, the backend writes the code into a sandbox module and imports it dynamically. You can import native Node.js APIs like <code>fs</code>, <code>path</code>, <code>child_process</code>, or execute network requests. Return a string or serializable JSON object.
          </div>
        </div>
      </div>

    </div>
  );
}
