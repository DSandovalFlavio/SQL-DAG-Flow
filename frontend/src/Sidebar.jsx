import React, { useState, useMemo } from 'react';
import { Eye, EyeOff, Search, X, ChevronDown, ChevronRight, Database, Globe, FileText } from 'lucide-react';

const Sidebar = ({ nodes, hiddenNodeIds, toggleNodeVisibility, onClose, theme, onNodeClick }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedGroups, setExpandedGroups] = useState({
        standard: true,
        external: true,
        cte: true
    });
    const isDark = theme === 'dark';

    const groups = useMemo(() => {
        const filtered = nodes
            .filter(n => n.type !== 'annotation')
            .filter(n => n.data.label.toLowerCase().includes(searchTerm.toLowerCase()));

        const grouped = {
            standard: [],
            external: [],
            cte: []
        };

        filtered.forEach(node => {
            if (node.type === 'cte' || node.data.layer === 'cte') {
                grouped.cte.push(node);
            } else if (node.data.layer === 'external') {
                grouped.external.push(node);
            } else {
                grouped.standard.push(node);
            }
        });

        // Sort each group
        Object.keys(grouped).forEach(key => {
            grouped[key].sort((a, b) => a.data.label.localeCompare(b.data.label));
        });

        return grouped;
    }, [nodes, searchTerm]);

    const toggleGroup = (group) => {
        setExpandedGroups(prev => ({ ...prev, [group]: !prev[group] }));
    };

    const containerStyle = {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '300px',
        height: '100%',
        background: isDark ? '#1a1a1a' : '#ffffff',
        borderRight: isDark ? '1px solid #333' : '1px solid #ddd',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '5px 0 15px rgba(0,0,0,0.1)',
        transition: 'transform 0.3s ease',
    };

    const headerStyle = {
        padding: '20px',
        borderBottom: isDark ? '1px solid #333' : '1px solid #eee',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
    };

    const searchStyle = {
        padding: '10px 20px',
        borderBottom: isDark ? '1px solid #333' : '1px solid #eee',
    };

    const inputStyle = {
        width: '100%',
        padding: '8px 12px',
        borderRadius: '6px',
        border: isDark ? '1px solid #444' : '1px solid #ddd',
        background: isDark ? '#2a2a2a' : '#f5f5f5',
        color: isDark ? '#fff' : '#000',
        outline: 'none',
    };

    const listStyle = {
        flex: 1,
        overflowY: 'auto',
        padding: '10px 0',
    };

    const groupHeaderStyle = {
        padding: '10px 20px',
        display: 'flex',
        alignItems: 'center',
        cursor: 'pointer',
        fontSize: '12px',
        fontWeight: 'bold',
        color: isDark ? '#aaa' : '#666',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        userSelect: 'none'
    };

    const itemStyle = {
        padding: '6px 20px 6px 30px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        cursor: 'pointer',
        transition: 'background 0.2s',
    };

    const textColor = isDark ? '#fff' : '#000';

    const renderGroup = (key, title, icon) => {
        const groupNodes = groups[key];
        if (groupNodes.length === 0) return null;

        const isExpanded = expandedGroups[key];

        return (
            <div key={key}>
                <div style={groupHeaderStyle} onClick={() => toggleGroup(key)}>
                    {isExpanded ? <ChevronDown size={14} style={{ marginRight: 5 }} /> : <ChevronRight size={14} style={{ marginRight: 5 }} />}
                    {icon}
                    <span style={{ marginLeft: 6 }}>{title} ({groupNodes.length})</span>
                </div>
                {isExpanded && groupNodes.map(node => {
                    const isHidden = hiddenNodeIds.includes(node.id);
                    return (
                        <div
                            key={node.id}
                            style={{
                                ...itemStyle,
                                opacity: isHidden ? 0.5 : 1,
                                background: isDark ? 'hover:rgba(255,255,255,0.05)' : 'hover:rgba(0,0,0,0.05)'
                            }}
                            className="sidebar-item"
                            onClick={() => onNodeClick && onNodeClick(node)}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                <span
                                    style={{
                                        color: textColor,
                                        fontSize: '13px',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        maxWidth: '160px'
                                    }}
                                    title={node.data.label}
                                >
                                    {node.data.label}
                                </span>
                                {node.data.incomingCount > 0 && (
                                    <span style={{
                                        fontSize: '10px',
                                        background: isDark ? '#333' : '#eee',
                                        padding: '1px 5px',
                                        borderRadius: '10px',
                                        color: isDark ? '#aaa' : '#666'
                                    }}>
                                        {node.data.incomingCount}
                                    </span>
                                )}
                            </div>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    toggleNodeVisibility(node.id);
                                }}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: isHidden ? (isDark ? '#666' : '#ccc') : (isDark ? '#fff' : '#000'),
                                    display: 'flex',
                                    alignItems: 'center',
                                    padding: '4px'
                                }}
                                title={isHidden ? "Show Node" : "Hide Node"}
                            >
                                {isHidden ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div style={containerStyle}>
            <div style={headerStyle}>
                <h3 style={{ margin: 0, color: textColor, fontSize: '16px' }}>Nodes ({nodes.filter(n => n.type !== 'annotation').length})</h3>
                <button
                    onClick={onClose}
                    style={{ background: 'transparent', border: 'none', color: textColor, cursor: 'pointer' }}
                >
                    <X size={20} />
                </button>
            </div>

            <div style={searchStyle}>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <Search size={14} style={{ position: 'absolute', left: 10, color: isDark ? '#888' : '#aaa' }} />
                    <input
                        type="text"
                        placeholder="Search nodes..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{ ...inputStyle, paddingLeft: '32px' }}
                    />
                </div>
            </div>

            <div style={listStyle}>
                {renderGroup('standard', 'Standard Nodes', <Database size={14} />)}
                {renderGroup('cte', 'CTE Nodes', <FileText size={14} />)}
                {renderGroup('external', 'External Nodes', <Globe size={14} />)}
            </div>

            <div style={{ padding: '15px', borderTop: isDark ? '1px solid #333' : '1px solid #eee', display: 'flex', gap: '10px' }}>
                <button
                    onClick={() => nodes.forEach(n => !hiddenNodeIds.includes(n.id) && toggleNodeVisibility(n.id))}
                    style={{ flex: 1, padding: '8px', fontSize: '12px', cursor: 'pointer', background: isDark ? '#333' : '#eee', border: 'none', borderRadius: '4px', color: textColor }}
                >
                    Hide All
                </button>
                <button
                    onClick={() => nodes.forEach(n => hiddenNodeIds.includes(n.id) && toggleNodeVisibility(n.id))}
                    style={{ flex: 1, padding: '8px', fontSize: '12px', cursor: 'pointer', background: isDark ? '#333' : '#eee', border: 'none', borderRadius: '4px', color: textColor }}
                >
                    Show All
                </button>
            </div>
        </div>
    );
};

export default Sidebar;
