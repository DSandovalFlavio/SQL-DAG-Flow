import React, { useState, useEffect, useMemo } from 'react';
import { Folder, Check, ChevronRight, ChevronDown } from 'lucide-react';

const FolderTreeItem = ({ node, selectedFolders, onToggle, theme, level = 0 }) => {
    const [expanded, setExpanded] = useState(level < 1); // Expand top level by default
    const hasChildren = node.children && node.children.length > 0;

    // Check status
    const isChecked = selectedFolders.includes(node.path);

    // Check if some children are checked (for indeterminate visually - optional, but let's stick to simple first)
    // Actually, simple logic: if I check a folder, I want to include it.

    const isDark = theme === 'dark';
    const textColor = isDark ? '#ffffff' : '#000000';
    const hoverColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';

    const handleToggle = (e) => {
        e.stopPropagation();
        onToggle(node);
    };

    return (
        <div>
            <div
                onClick={() => setExpanded(!expanded)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '4px 8px',
                    paddingLeft: `${level * 20 + 8}px`,
                    cursor: 'pointer',
                    borderRadius: '4px',
                    transition: 'background 0.2s',
                    color: textColor,
                    userSelect: 'none'
                }}
                className="tree-item"
                onMouseEnter={(e) => e.currentTarget.style.background = hoverColor}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
                <div style={{ marginRight: '4px', display: 'flex', alignItems: 'center', width: '20px', justifyContent: 'center' }}>
                    {hasChildren && (
                        expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
                    )}
                </div>

                <div
                    onClick={handleToggle}
                    style={{
                        width: '18px',
                        height: '18px',
                        borderRadius: '4px',
                        border: `1px solid ${isChecked ? (isDark ? '#4dabf7' : '#007bff') : (isDark ? '#666' : '#ccc')}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: isChecked ? (isDark ? '#4dabf7' : '#007bff') : 'transparent',
                        marginRight: '8px'
                    }}
                >
                    {isChecked && <Check size={12} color="white" />}
                </div>

                <Folder size={16} color={isDark ? '#ccc' : '#666'} style={{ marginRight: '8px' }} />
                <span style={{ fontSize: '13px' }}>{node.name}</span>
            </div>

            {hasChildren && expanded && (
                <div>
                    {node.children.map(child => (
                        <FolderTreeItem
                            key={child.path}
                            node={child}
                            selectedFolders={selectedFolders}
                            onToggle={onToggle}
                            theme={theme}
                            level={level + 1}
                        />
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
            setSelectedFolders(subfolders); // Select all by default
        }
    }, [isOpen, subfolders]);

    // Build Tree Structure
    const tree = useMemo(() => {
        const root = { name: 'root', path: '', children: [] };

        // Sort folders to ensure parents come before children if flat list is sorted, 
        // but robust logic handles any order.
        const sortedFolders = [...subfolders].sort();

        sortedFolders.forEach(path => {
            const parts = path.split('/');
            let currentLevel = root.children;
            let currentPath = '';

            parts.forEach((part, index) => {
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

    const isDark = theme === 'dark';
    const bgColor = isDark ? '#1a1a1a' : '#ffffff';
    const textColor = isDark ? '#ffffff' : '#000000';
    const borderColor = isDark ? '#333' : '#ddd';

    const getAllDescendants = (node) => {
        let descendants = [node.path];
        if (node.children) {
            node.children.forEach(child => {
                descendants = [...descendants, ...getAllDescendants(child)];
            });
        }
        return descendants;
    };

    const toggleFolder = (node) => {
        const isCurrentlyChecked = selectedFolders.includes(node.path);
        const descendants = getAllDescendants(node);

        if (isCurrentlyChecked) {
            // Uncheck: Remove this node and all descendants
            setSelectedFolders(prev => prev.filter(p => !descendants.includes(p)));
        } else {
            // Check: Add this node and all descendants
            // Also need to check if we are adding doubles? Set handles it, or check existence.
            setSelectedFolders(prev => {
                const unique = new Set([...prev, ...descendants]);
                return Array.from(unique);
            });
        }
    };

    const toggleAll = () => {
        if (selectedFolders.length > 0) {
            setSelectedFolders([]);
        } else {
            setSelectedFolders(subfolders);
        }
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0,0,0,0.5)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(5px)'
        }}>
            <div style={{
                background: bgColor,
                width: '500px',
                maxWidth: '90%',
                maxHeight: '80vh',
                borderRadius: '12px',
                boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                border: `1px solid ${borderColor}`
            }}>
                <div style={{ padding: '20px', borderBottom: `1px solid ${borderColor}` }}>
                    <h3 style={{ margin: 0, color: textColor, fontSize: '18px' }}>Select Subfolders to Scan</h3>
                    <p style={{ margin: '5px 0 0 0', opacity: 0.6, fontSize: '12px', color: textColor }}>
                        Path: {currentPath}
                    </p>
                </div>

                <div style={{ padding: '10px 20px', display: 'flex', justifyContent: 'flex-end', borderBottom: `1px solid ${borderColor}` }}>
                    <button
                        onClick={toggleAll}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: isDark ? '#4dabf7' : '#007bff',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: '600'
                        }}
                    >
                        {selectedFolders.length > 0 ? 'Deselect All' : 'Select All'}
                    </button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '10px 0' }}>
                    {tree.length === 0 && (
                        <div style={{ padding: '20px', textAlign: 'center', opacity: 0.5, color: textColor }}>
                            No subfolders found.
                        </div>
                    )}
                    {tree.map(node => (
                        <FolderTreeItem
                            key={node.path}
                            node={node}
                            selectedFolders={selectedFolders}
                            onToggle={toggleFolder}
                            theme={theme}
                        />
                    ))}
                </div>

                <div style={{ padding: '20px', borderTop: `1px solid ${borderColor}`, display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button
                        onClick={onCancel}
                        style={{
                            padding: '10px 20px',
                            borderRadius: '8px',
                            border: 'none',
                            background: isDark ? '#333' : '#eee',
                            color: textColor,
                            cursor: 'pointer',
                            fontWeight: '600'
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => onConfirm(selectedFolders)}
                        style={{
                            padding: '10px 30px',
                            borderRadius: '8px',
                            border: 'none',
                            background: isDark ? '#eeeeee' : '#111111',
                            color: isDark ? '#000000' : '#ffffff',
                            cursor: 'pointer',
                            fontWeight: '600'
                        }}
                    >
                        Confirm Selection ({selectedFolders.length})
                    </button>
                </div>
            </div>
        </div>
    );
};

export default FolderSelectorModal;
