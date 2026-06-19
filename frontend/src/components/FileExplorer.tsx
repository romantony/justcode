import { useState, useEffect } from 'react';
import { Folder, FolderOpen, FileCode, File, RefreshCw, ChevronRight, ChevronDown, Search, X } from 'lucide-react';

interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  children?: FileNode[];
}

export default function FileExplorer() {
  const [tree, setTree] = useState<FileNode[]>([]);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(['']));
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [workspaceName, setWorkspaceName] = useState('');
  const [workspacePath, setWorkspacePath] = useState('');
  const [previewFile, setPreviewFile] = useState<FileNode | null>(null);
  const [previewContent, setPreviewContent] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);

  const fetchTree = async () => {
    setLoading(true);
    try {
      const res = await fetch('http://localhost:5001/api/workspace/files');
      const data = await res.json();
      setTree(data.tree || []);
      setWorkspacePath(data.workspacePath || '');
      // Extract the last folder name as workspace display name
      const parts = (data.workspacePath || '').split(/[/\\]/);
      setWorkspaceName(parts[parts.length - 1] || 'Workspace');
    } catch (err) {
      console.error('Failed to load file explorer tree:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTree();
  }, []);

  const toggleExpand = (path: string) => {
    const next = new Set(expandedPaths);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    setExpandedPaths(next);
  };

  const handleFileClick = async (node: FileNode) => {
    setPreviewFile(node);
    setPreviewLoading(true);
    setPreviewContent('');
    try {
      const res = await fetch(`http://localhost:5001/api/workspace/file?path=${encodeURIComponent(node.path)}`);
      const data = await res.json();
      if (data.error) {
        setPreviewContent(`Error: ${data.error}`);
      } else {
        setPreviewContent(data.content);
      }
    } catch (err: any) {
      setPreviewContent(`Failed to load file content: ${err.message}`);
    } finally {
      setPreviewLoading(false);
    }
  };

  // Helper to filter nodes recursively by search term
  const filterTree = (nodes: FileNode[]): FileNode[] => {
    return nodes
      .map(node => {
        if (node.isDirectory && node.children) {
          const filteredChildren = filterTree(node.children);
          if (filteredChildren.length > 0 || node.name.toLowerCase().includes(searchTerm.toLowerCase())) {
            return { ...node, children: filteredChildren };
          }
        } else if (node.name.toLowerCase().includes(searchTerm.toLowerCase())) {
          return node;
        }
        return null;
      })
      .filter((n): n is FileNode => n !== null);
  };

  const filteredTree = searchTerm ? filterTree(tree) : tree;

  const renderNode = (node: FileNode, depth = 0) => {
    const isExpanded = expandedPaths.has(node.path);
    const hasChildren = node.children && node.children.length > 0;
    const paddingLeft = `${depth * 12 + 8}px`;

    const getFileIcon = (fileName: string) => {
      const ext = fileName.split('.').pop()?.toLowerCase();
      if (['js', 'jsx', 'ts', 'tsx', 'py', 'json', 'html', 'css', 'go', 'rs', 'sh', 'md'].includes(ext || '')) {
        return <FileCode size={15} style={{ color: 'var(--accent-color)' }} />;
      }
      return <File size={15} style={{ color: 'var(--text-muted)' }} />;
    };

    if (node.isDirectory) {
      return (
        <div key={node.path}>
          <div
            className="explorer-node folder-node"
            style={{ paddingLeft, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', height: '28px' }}
            onClick={() => {
              toggleExpand(node.path);
            }}
          >
            {hasChildren ? (
              isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
            ) : (
              <span style={{ width: '14px' }}></span>
            )}
            {isExpanded ? (
              <FolderOpen size={16} style={{ color: '#f59e0b' }} />
            ) : (
              <Folder size={16} style={{ color: '#f59e0b' }} />
            )}
            <span style={{ fontSize: '0.85rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {node.name}
            </span>
          </div>
          {isExpanded && node.children && (
            <div>{node.children.map(child => renderNode(child, depth + 1))}</div>
          )}
        </div>
      );
    }

    return (
      <div
        key={node.path}
        className="explorer-node file-node"
        style={{ paddingLeft, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', height: '28px' }}
        onClick={() => handleFileClick(node)}
      >
        <span style={{ width: '14px' }}></span>
        {getFileIcon(node.name)}
        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {node.name}
        </span>
      </div>
    );
  };

  return (
    <div className="pane file-explorer-pane" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="pane-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 700, letterSpacing: '0.5px' }}>EXPLORER</span>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '160px' }} title={workspacePath}>
            {workspaceName}
          </span>
        </div>
        <button 
          onClick={fetchTree} 
          disabled={loading} 
          style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          title="Refresh Workspace"
        >
          <RefreshCw size={14} className={loading ? 'spin-animation' : ''} />
        </button>
      </div>

      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg-code)', borderRadius: '6px', padding: '4px 8px', border: '1px solid var(--border-color)' }}>
          <Search size={14} style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search files..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: '0.8rem', width: '100%' }}
          />
          {searchTerm && (
            <X size={14} style={{ color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => setSearchTerm('')} />
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 4px' }}>
        {filteredTree.length === 0 ? (
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>
            {searchTerm ? 'No files match your search.' : 'Workspace is empty.'}
          </div>
        ) : (
          filteredTree.map(node => renderNode(node, 0))
        )}
      </div>

      {/* File Preview Modal */}
      {previewFile && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999,
          backdropFilter: 'blur(4px)'
        }}>
          <div className="pane" style={{
            width: '80%',
            height: '80%',
            maxWidth: '900px',
            backgroundColor: 'var(--bg-panel)',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <div className="pane-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileCode size={18} style={{ color: 'var(--accent-color)' }} />
                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{previewFile.name}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({previewFile.path})</span>
              </div>
              <button 
                onClick={() => setPreviewFile(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>
            
            <div style={{ flex: 1, overflow: 'auto', padding: '20px', backgroundColor: 'var(--bg-code)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
              {previewLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                  <RefreshCw size={24} className="spin-animation" style={{ color: 'var(--accent-color)' }} />
                </div>
              ) : (
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{previewContent || '[Empty File]'}</pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
