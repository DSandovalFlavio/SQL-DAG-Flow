import { PROCEDURE_COLORS } from './nodeColors';
import React, { useState, useMemo } from 'react';
import { Eye, EyeOff, Search, X, ChevronDown, ChevronRight, Database, Globe, FileText, FolderTree, Layers, Code } from 'lucide-react';

const Sidebar = ({ nodes, hiddenNodeIds, toggleNodeVisibility, onClose, theme, onNodeClick }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [searchInSQL, setSearchInSQL] = useState(false);
    const [groupMode, setGroupMode] = useState('layer'); // 'layer' | 'project'
    const [expandedGroups, setExpandedGroups] = useState({
        standard: true,
        external: true,
        cte: true
    });

    // Shared filtering function
    const filterNode = (n, searchLower) => {
        if (!searchTerm) return true;
        const label = n.data.label.toLowerCase();
        const project = (n.data.details?.project || '').toLowerCase();
        const dataset = (n.data.details?.dataset || '').toLowerCase();
        const nameMatch = label.includes(searchLower) || project.includes(searchLower) || dataset.includes(searchLower);
        if (nameMatch) return true;
        if (searchInSQL && n.data.details?.content) {
            return n.data.details.content.toLowerCase().includes(searchLower);
        }
        return false;
    };

    // Get SQL match context snippet for a node
    const getSQLSnippet = (node, searchLower) => {
        if (!searchInSQL || !searchTerm || !node.data.details?.content) return null;
        const content = node.data.details.content;
        const idx = content.toLowerCase().indexOf(searchLower);
        if (idx === -1) return null;
        const start = Math.max(0, idx - 20);
        const end = Math.min(content.length, idx + searchTerm.length + 40);
        let snippet = content.substring(start, end).replace(/\n/g, ' ').trim();
        if (start > 0) snippet = '...' + snippet;
        if (end < content.length) snippet = snippet + '...';
        return snippet;
    };

    // Layer-based grouping (original)
    const layerGroups = useMemo(() => {
        const searchLower = searchTerm.toLowerCase();
        const filtered = nodes
            .filter(n => n.type !== 'annotation')
            .filter(n => filterNode(n, searchLower));

        const grouped = { standard: [], external: [], cte: [] };
        filtered.forEach(node => {
            if (node.type === 'cte' || node.data.layer === 'cte') {
                grouped.cte.push(node);
            } else if (node.data.layer === 'external') {
                grouped.external.push(node);
            } else {
                grouped.standard.push(node);
            }
        });
        Object.keys(grouped).forEach(key => {
            grouped[key].sort((a, b) => a.data.label.localeCompare(b.data.label));
        });
        return grouped;
    }, [nodes, searchTerm, searchInSQL]);

    // Project/Dataset-based grouping
    const projectGroups = useMemo(() => {
        const searchLower = searchTerm.toLowerCase();
        const filtered = nodes
            .filter(n => n.type !== 'annotation')
            .filter(n => filterNode(n, searchLower));

        const tree = {};
        filtered.forEach(node => {
            const project = node.data.details?.project || 'default';
            const dataset = node.data.details?.dataset || 'default';
            if (!tree[project]) tree[project] = {};
            if (!tree[project][dataset]) tree[project][dataset] = [];
            tree[project][dataset].push(node);
        });
        Object.values(tree).forEach(datasets => {
            Object.values(datasets).forEach(nodeList => {
                nodeList.sort((a, b) => a.data.label.localeCompare(b.data.label));
            });
        });
        return tree;
    }, [nodes, searchTerm, searchInSQL]);

    const toggleGroup = (group) => {
        setExpandedGroups(prev => ({ ...prev, [group]: !prev[group] }));
    };

    const layerColors = {
        bronze: '#cd7f32', silver: '#708090', gold: '#FFD700',
        other: '#4CA1AF', external: '#ff9f1c', cte: '#E91E63'
    };
    // Procedures are logic, not datasets — same reason CTEs and externals have
    // their own colour. Their medallion layer still drives the grouping.
    const dotColor = (node) => (
        node.data?.details?.type === 'procedure'
            ? PROCEDURE_COLORS.standard
            : layerColors[node.data.layer] || '#888'
    );

    const renderNodeItem = (node) => {
        const isHidden = hiddenNodeIds.includes(node.id);
        return (
            <React.Fragment key={node.id}>
                <div
                    key={node.id}
                    style={{
                        padding: '5px 20px 5px 30px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        transition: 'background 0.15s cubic-bezier(0.25, 0.1, 0.25, 1)',
                        opacity: isHidden ? 0.5 : 1,
                        borderRadius: '4px',
                        margin: '0 8px',
                    }}
                    className="sidebar-item"
                    onClick={() => onNodeClick && onNodeClick(node)}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', flex: 1 }}>
                        <div style={{
                            width: 6, height: 6, borderRadius: '50%',
                            background: dotColor(node),
                            flexShrink: 0
                        }} />
                        <span
                            style={{
                                color: 'var(--text-primary)',
                                fontSize: '12px',
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
                                background: 'var(--interactive-active)',
                                padding: '1px 5px',
                                borderRadius: '10px',
                                color: 'var(--text-secondary)'
                            }}>
                                {node.data.incomingCount}
                            </span>
                        )}
                    </div>
                    <button
                        onClick={(e) => { e.stopPropagation(); toggleNodeVisibility(node.id); }}
                        style={{
                            background: 'transparent', border: 'none', cursor: 'pointer',
                            color: isHidden ? 'var(--text-tertiary)' : 'var(--text-secondary)',
                            display: 'flex', alignItems: 'center', padding: '4px',
                            borderRadius: '4px',
                            transition: 'color 0.15s ease'
                        }}
                        title={isHidden ? "Show Node" : "Hide Node"}
                    >
                        {isHidden ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                </div>
                {/* SQL match snippet */}
                {searchInSQL && searchTerm && (() => {
                    const snippet = getSQLSnippet(node, searchTerm.toLowerCase());
                    if (!snippet) return null;
                    return (
                        <div style={{
                            padding: '2px 20px 4px 46px',
                            fontSize: '10px',
                            fontFamily: 'monospace',
                            color: 'var(--accent-text)',
                            opacity: 0.8,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                        }}>
                            {snippet}
                        </div>
                    );
                })()}
            </React.Fragment>
        );
    };

    const renderLayerGroup = (key, title, icon) => {
        const groupNodes = layerGroups[key];
        if (groupNodes.length === 0) return null;
        const isExpanded = expandedGroups[key];
        return (
            <div key={key}>
                <div
                    style={{
                        padding: '10px 20px',
                        display: 'flex', alignItems: 'center',
                        cursor: 'pointer', fontSize: '11px', fontWeight: '600',
                        color: 'var(--text-tertiary)',
                        textTransform: 'uppercase', letterSpacing: '0.05em', userSelect: 'none'
                    }}
                    onClick={() => toggleGroup(key)}
                >
                    {isExpanded ? <ChevronDown size={14} style={{ marginRight: 5 }} /> : <ChevronRight size={14} style={{ marginRight: 5 }} />}
                    {icon}
                    <span style={{ marginLeft: 6 }}>{title} ({groupNodes.length})</span>
                </div>
                {isExpanded && groupNodes.map(renderNodeItem)}
            </div>
        );
    };

    const renderProjectGroup = () => {
        const projects = Object.entries(projectGroups).sort(([a], [b]) => {
            if (a === 'default' || a === 'internal') return 1;
            if (b === 'default' || b === 'internal') return -1;
            return a.localeCompare(b);
        });

        return projects.map(([project, datasets]) => {
            const projectKey = `proj_${project}`;
            const isOpen = expandedGroups[projectKey] !== false;
            const nodeCount = Object.values(datasets).reduce((s, arr) => s + arr.length, 0);
            if (nodeCount === 0) return null;

            return (
                <div key={projectKey}>
                    <div
                        style={{
                            padding: '8px 20px',
                            display: 'flex', alignItems: 'center',
                            cursor: 'pointer', fontSize: '11px', fontWeight: '600',
                            color: 'var(--text-tertiary)',
                            textTransform: 'uppercase', letterSpacing: '0.05em', userSelect: 'none'
                        }}
                        onClick={() => toggleGroup(projectKey)}
                    >
                        {isOpen ? <ChevronDown size={14} style={{ marginRight: 5 }} /> : <ChevronRight size={14} style={{ marginRight: 5 }} />}
                        <Database size={14} />
                        <span style={{ marginLeft: 6 }}>
                            {project === 'default' || project === 'internal' ? 'Other' : project}
                        </span>
                        <span style={{ marginLeft: 'auto', fontSize: '10px', background: 'var(--interactive-active)', padding: '1px 6px', borderRadius: '8px', color: 'var(--text-secondary)' }}>
                            {nodeCount}
                        </span>
                    </div>
                    {isOpen && Object.entries(datasets)
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([dataset, datasetNodes]) => {
                            const dsKey = `ds_${project}_${dataset}`;
                            const dsOpen = expandedGroups[dsKey] !== false;
                            return (
                                <div key={dsKey}>
                                    <div
                                        style={{
                                            padding: '6px 20px 6px 40px',
                                            display: 'flex', alignItems: 'center',
                                            cursor: 'pointer', fontSize: '11px', fontWeight: 500,
                                            color: 'var(--text-secondary)', userSelect: 'none'
                                        }}
                                        onClick={() => toggleGroup(dsKey)}
                                    >
                                        {dsOpen ? <ChevronDown size={12} style={{ marginRight: 4 }} /> : <ChevronRight size={12} style={{ marginRight: 4 }} />}
                                        <span>{dataset === 'default' ? 'uncategorized' : dataset}</span>
                                        <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--text-tertiary)' }}>({datasetNodes.length})</span>
                                    </div>
                                    {dsOpen && datasetNodes.map(renderNodeItem)}
                                </div>
                            );
                        })
                    }
                </div>
            );
        });
    };

    return (
        <div style={{
            position: 'absolute', top: 0, left: 0, width: '280px', height: '100%',
            background: 'var(--surface-secondary)',
            borderRight: '1px solid var(--border-default)',
            zIndex: 1000, display: 'flex', flexDirection: 'column',
            boxShadow: 'var(--shadow-lg)', transition: 'transform 0.25s cubic-bezier(0.25, 0.1, 0.25, 1)'
        }}>
            {/* Header */}
            <div style={{
                padding: '14px 20px', borderBottom: '1px solid var(--border-default)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
                <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '14px', fontWeight: 600, letterSpacing: '-0.01em' }}>
                    Nodes ({nodes.filter(n => n.type !== 'annotation').length})
                </h3>
                <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px', borderRadius: '4px' }}>
                    <X size={18} />
                </button>
            </div>

            {/* Search + Group Mode Toggle */}
            <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-default)' }}>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                    <Search size={14} style={{ position: 'absolute', left: 10, color: 'var(--text-tertiary)' }} />
                    <input
                        type="text"
                        placeholder="Search nodes, projects, datasets..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{
                            width: '100%', padding: '8px 12px 8px 32px', borderRadius: '8px',
                            border: '1px solid var(--border-default)',
                            background: 'var(--surface-primary)',
                            color: 'var(--text-primary)', outline: 'none', fontSize: '12px',
                            transition: 'border-color 0.15s ease'
                        }}
                        onFocus={(e) => e.target.style.borderColor = 'var(--accent-primary)'}
                        onBlur={(e) => e.target.style.borderColor = 'var(--border-default)'}
                    />
                </div>
                {/* SQL Content Search Toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                    <button
                        onClick={() => setSearchInSQL(!searchInSQL)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '4px',
                            padding: '4px 8px', fontSize: '10px', fontWeight: 600,
                            border: 'none', borderRadius: '6px', cursor: 'pointer',
                            background: searchInSQL ? 'var(--accent-muted)' : 'var(--interactive-hover)',
                            color: searchInSQL ? 'var(--accent-text)' : 'var(--text-secondary)',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <Code size={12} /> Search in SQL
                    </button>
                    {searchInSQL && (
                        <span style={{ fontSize: '9px', color: 'var(--text-tertiary)' }}>Matches SQL file content</span>
                    )}
                </div>
                {/* Group Mode Toggle */}
                <div style={{ display: 'flex', background: 'var(--interactive-hover)', borderRadius: '8px', padding: '2px' }}>
                    <button
                        onClick={() => setGroupMode('layer')}
                        style={{
                            flex: 1, padding: '5px 8px', fontSize: '10px', fontWeight: 600,
                            border: 'none', borderRadius: '6px', cursor: 'pointer',
                            background: groupMode === 'layer' ? 'var(--surface-elevated)' : 'transparent',
                            color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                            boxShadow: groupMode === 'layer' ? 'var(--shadow-sm)' : 'none',
                            transition: 'all 0.15s cubic-bezier(0.25, 0.1, 0.25, 1)'
                        }}
                    >
                        <Layers size={12} /> By Layer
                    </button>
                    <button
                        onClick={() => setGroupMode('project')}
                        style={{
                            flex: 1, padding: '5px 8px', fontSize: '10px', fontWeight: 600,
                            border: 'none', borderRadius: '6px', cursor: 'pointer',
                            background: groupMode === 'project' ? 'var(--surface-elevated)' : 'transparent',
                            color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                            boxShadow: groupMode === 'project' ? 'var(--shadow-sm)' : 'none',
                            transition: 'all 0.15s cubic-bezier(0.25, 0.1, 0.25, 1)'
                        }}
                    >
                        <FolderTree size={12} /> By Project
                    </button>
                </div>
            </div>

            {/* Node List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
                {groupMode === 'layer' ? (
                    <>
                        {renderLayerGroup('standard', 'Standard Nodes', <Database size={14} />)}
                        {renderLayerGroup('cte', 'CTE Nodes', <FileText size={14} />)}
                        {renderLayerGroup('external', 'External Nodes', <Globe size={14} />)}
                    </>
                ) : (
                    renderProjectGroup()
                )}
            </div>

            {/* Footer */}
            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-default)', display: 'flex', gap: '8px' }}>
                <button
                    onClick={() => nodes.forEach(n => !hiddenNodeIds.includes(n.id) && toggleNodeVisibility(n.id))}
                    style={{
                        flex: 1, padding: '6px', fontSize: '11px', cursor: 'pointer',
                        background: 'var(--interactive-hover)', border: 'none', borderRadius: '6px',
                        color: 'var(--text-secondary)', fontWeight: 500,
                        transition: 'background 0.15s ease'
                    }}
                >
                    Hide All
                </button>
                <button
                    onClick={() => nodes.forEach(n => hiddenNodeIds.includes(n.id) && toggleNodeVisibility(n.id))}
                    style={{
                        flex: 1, padding: '6px', fontSize: '11px', cursor: 'pointer',
                        background: 'var(--interactive-hover)', border: 'none', borderRadius: '6px',
                        color: 'var(--text-secondary)', fontWeight: 500,
                        transition: 'background 0.15s ease'
                    }}
                >
                    Show All
                </button>
            </div>
        </div>
    );
};

export default Sidebar;
