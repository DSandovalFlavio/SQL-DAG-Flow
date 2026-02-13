import React, { useState, useMemo } from 'react';
import { Eye, EyeOff, Search, X } from 'lucide-react';

const Sidebar = ({ nodes, hiddenNodeIds, toggleNodeVisibility, onClose, theme }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const isDark = theme === 'dark';

    const filteredNodes = useMemo(() => {
        return nodes
            .filter(n => n.type !== 'annotation') // Exclude annotations from the list for now
            .filter(n => n.data.label.toLowerCase().includes(searchTerm.toLowerCase()))
            .sort((a, b) => a.data.label.localeCompare(b.data.label));
    }, [nodes, searchTerm]);

    const containerStyle = {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '300px',
        height: '100%',
        background: isDark ? '#1a1a1a' : '#ffffff',
        borderRight: isDark ? '1px solid #333' : '1px solid #ddd',
        zIndex: 25,
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

    const itemStyle = {
        padding: '8px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        cursor: 'pointer',
        transition: 'background 0.2s',
    };

    const textColor = isDark ? '#fff' : '#000';

    return (
        <div style={containerStyle}>
            <div style={headerStyle}>
                <h3 style={{ margin: 0, color: textColor, fontSize: '16px' }}>Nodes ({filteredNodes.length})</h3>
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
                {filteredNodes.map(node => {
                    const isHidden = hiddenNodeIds.includes(node.id);
                    return (
                        <div
                            key={node.id}
                            style={{
                                ...itemStyle,
                                opacity: isHidden ? 0.5 : 1,
                            }}
                            className="sidebar-item"
                        >
                            <span
                                style={{
                                    color: textColor,
                                    fontSize: '14px',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    maxWidth: '200px'
                                }}
                                title={node.data.label}
                            >
                                {node.data.label}
                            </span>
                            <button
                                onClick={() => toggleNodeVisibility(node.id)}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: isHidden ? (isDark ? '#666' : '#ccc') : (isDark ? '#fff' : '#000'),
                                    display: 'flex',
                                    alignItems: 'center'
                                }}
                                title={isHidden ? "Show Node" : "Hide Node"}
                            >
                                {isHidden ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                    );
                })}
            </div>

            <div style={{ padding: '15px', borderTop: isDark ? '1px solid #333' : '1px solid #eee', display: 'flex', gap: '10px' }}>
                <button
                    onClick={() => filteredNodes.forEach(n => !hiddenNodeIds.includes(n.id) && toggleNodeVisibility(n.id))}
                    style={{ flex: 1, padding: '8px', fontSize: '12px', cursor: 'pointer', background: isDark ? '#333' : '#eee', border: 'none', borderRadius: '4px', color: textColor }}
                >
                    Hide All
                </button>
                <button
                    onClick={() => filteredNodes.forEach(n => hiddenNodeIds.includes(n.id) && toggleNodeVisibility(n.id))}
                    style={{ flex: 1, padding: '8px', fontSize: '12px', cursor: 'pointer', background: isDark ? '#333' : '#eee', border: 'none', borderRadius: '4px', color: textColor }}
                >
                    Show All
                </button>
            </div>
        </div>
    );
};

export default Sidebar;
