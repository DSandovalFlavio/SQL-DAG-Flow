import React, { useState, useEffect, useMemo } from 'react';
import { Folder, Check, ChevronRight, ChevronDown } from 'lucide-react';

const FolderTreeItem = ({ node, selectedFolders, onToggle, theme, level = 0 }) => {
    const [expanded, setExpanded] = useState(level < 1);
    const hasChildren = node.children && node.children.length > 0;
    const isChecked = selectedFolders.includes(node.path);

    const handleToggle = (e) => {
        e.stopPropagation();
        onToggle(node);
    };

    return (
        <div>
            <div
                onClick={() => setExpanded(!expanded)}
                style={{
                    display: 'flex', alignItems: 'center', padding: '4px 8px',
                    paddingLeft: `${level * 20 + 8}px`, cursor: 'pointer', borderRadius: '6px',
                    transition: 'background 0.15s ease', color: 'var(--text-primary)', userSelect: 'none'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--interactive-hover)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
                <div style={{ marginRight: '4px', display: 'flex', alignItems: 'center', width: '20px', justifyContent: 'center' }}>
                    {hasChildren && (expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
                </div>
                <div
                    onClick={handleToggle}
                    style={{
                        width: '18px', height: '18px', borderRadius: '5px',
                        border: `1px solid ${isChecked ? 'var(--accent-primary)' : 'var(--border-strong)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: isChecked ? 'var(--accent-primary)' : 'transparent',
                        marginRight: '8px', transition: 'all 0.15s ease'
                    }}
                >
                    {isChecked && <Check size={12} color="white" />}
                </div>
                <Folder size={16} color="var(--text-tertiary)" style={{ marginRight: '8px' }} />
                <span style={{ fontSize: '13px' }}>{node.name}</span>
            </div>
            {hasChildren && expanded && (
                <div>
                    {node.children.map(child => (
                        <FolderTreeItem key={child.path} node={child} selectedFolders={selectedFolders} onToggle={onToggle} theme={theme} level={level + 1} />
                    ))}
                </div>
            )}
        </div>
    );
};

const FolderSelectorModal = ({ isOpen, currentPath, subfolders, onConfirm, onCancel, theme }) => {
    const [selectedFolders, setSelectedFolders] = useState([]);

    useEffect(() => {
        if (isOpen && subfolders.length > 0) {
            setSelectedFolders(subfolders);
        }
    }, [isOpen, subfolders]);

    const tree = useMemo(() => {
        const root = { name: 'root', path: '', children: [] };
        const sortedFolders = [...subfolders].sort();
        sortedFolders.forEach(path => {
            const parts = path.split('/');
            let currentLevel = root.children;
            let currentPath = '';
            parts.forEach((part) => {
                currentPath = currentPath ? `${currentPath}/${part}` : part;
                let existingNode = currentLevel.find(n => n.name === part);
                if (!existingNode) {
                    existingNode = { name: part, path: currentPath, children: [] };
                    currentLevel.push(existingNode);
                }
                currentLevel = existingNode.children;
            });
        });
        return root.children;
    }, [subfolders]);

    if (!isOpen) return null;

    const getAllDescendants = (node) => {
        let descendants = [node.path];
        if (node.children) {
            node.children.forEach(child => { descendants = [...descendants, ...getAllDescendants(child)]; });
        }
        return descendants;
    };

    const toggleFolder = (node) => {
        const isCurrentlyChecked = selectedFolders.includes(node.path);
        const descendants = getAllDescendants(node);
        if (isCurrentlyChecked) {
            setSelectedFolders(prev => prev.filter(p => !descendants.includes(p)));
        } else {
            setSelectedFolders(prev => { const unique = new Set([...prev, ...descendants]); return Array.from(unique); });
        }
    };

    const toggleAll = () => {
        if (selectedFolders.length > 0) { setSelectedFolders([]); } else { setSelectedFolders(subfolders); }
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
            background: 'var(--surface-overlay)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(8px)'
        }}>
            <div style={{
                background: 'var(--surface-elevated)',
                width: '500px', maxWidth: '90%', maxHeight: '80vh',
                borderRadius: '16px', boxShadow: 'var(--shadow-xl)',
                display: 'flex', flexDirection: 'column', overflow: 'hidden',
                border: '1px solid var(--border-default)',
                animation: 'fadeIn 0.2s ease-out'
            }}>
                <div style={{ padding: '20px', borderBottom: '1px solid var(--border-default)' }}>
                    <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '16px', fontWeight: 700, letterSpacing: '-0.02em' }}>Select Subfolders to Scan</h3>
                    <p style={{ margin: '5px 0 0 0', fontSize: '12px', color: 'var(--text-tertiary)' }}>Path: {currentPath}</p>
                </div>

                <div style={{ padding: '8px 20px', display: 'flex', justifyContent: 'flex-end', borderBottom: '1px solid var(--border-default)' }}>
                    <button onClick={toggleAll} style={{
                        background: 'transparent', border: 'none', color: 'var(--accent-text)',
                        cursor: 'pointer', fontSize: '13px', fontWeight: '600'
                    }}>
                        {selectedFolders.length > 0 ? 'Deselect All' : 'Select All'}
                    </button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '10px 0' }}>
                    {tree.length === 0 && (
                        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-tertiary)' }}>No subfolders found.</div>
                    )}
                    {tree.map(node => (
                        <FolderTreeItem key={node.path} node={node} selectedFolders={selectedFolders} onToggle={toggleFolder} theme={theme} />
                    ))}
                </div>

                <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border-default)', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button onClick={onCancel} style={{
                        padding: '10px 20px', borderRadius: '8px', border: 'none',
                        background: 'var(--interactive-active)', color: 'var(--text-primary)',
                        cursor: 'pointer', fontWeight: '600', fontSize: '13px', transition: 'background 0.15s ease'
                    }}>Cancel</button>
                    <button onClick={() => onConfirm(selectedFolders)} style={{
                        padding: '10px 30px', borderRadius: '8px', border: 'none',
                        background: 'var(--accent-primary)', color: 'white',
                        cursor: 'pointer', fontWeight: '600', fontSize: '13px',
                        boxShadow: 'var(--shadow-sm)', transition: 'background 0.15s ease'
                    }}>Confirm Selection ({selectedFolders.length})</button>
                </div>
            </div>
        </div>
    );
};

export default FolderSelectorModal;
