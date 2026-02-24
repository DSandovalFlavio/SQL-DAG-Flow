import React, { useMemo, useState } from 'react';
import { BarChart3, ChevronDown, ChevronRight, AlertTriangle, CheckCircle, FolderTree, Database } from 'lucide-react';

const LayerStats = ({ nodes, edges, theme, isOpen, onClose }) => {
    const [expandedProjects, setExpandedProjects] = useState({});
    const isDark = theme === 'dark';

    const stats = useMemo(() => {
        const realNodes = nodes.filter(n => n.type !== 'annotation');
        const layers = { bronze: 0, silver: 0, gold: 0, other: 0, external: 0, cte: 0 };
        const projectTree = {};

        realNodes.forEach(n => {
            const layer = n.data.layer || 'other';
            layers[layer] = (layers[layer] || 0) + 1;
            const project = n.data.details?.project || 'default';
            const dataset = n.data.details?.dataset || 'default';
            if (!projectTree[project]) projectTree[project] = {};
            if (!projectTree[project][dataset]) projectTree[project][dataset] = [];
            projectTree[project][dataset].push(n.data.label || n.id);
        });

        const targetsSet = new Set(edges.map(e => e.target));
        const sourcesSet = new Set(edges.map(e => e.source));
        const sourceNodes = realNodes.filter(n => !targetsSet.has(n.id));
        const sinkNodes = realNodes.filter(n => !sourcesSet.has(n.id));
        const orphanNodes = realNodes.filter(n => !targetsSet.has(n.id) && !sourcesSet.has(n.id));

        const layerOrder = { bronze: 0, silver: 1, gold: 2 };
        let violations = 0;
        edges.forEach(e => {
            const sourceNode = realNodes.find(n => n.id === e.source);
            const targetNode = realNodes.find(n => n.id === e.target);
            if (sourceNode && targetNode) {
                const sO = layerOrder[sourceNode.data.layer];
                const tO = layerOrder[targetNode.data.layer];
                if (sO !== undefined && tO !== undefined && sO > tO) violations++;
            }
        });

        return { total: realNodes.length, layers, edges: edges.length, sources: sourceNodes.length, sinks: sinkNodes.length, orphans: orphanNodes.length, violations, projectTree };
    }, [nodes, edges]);

    const layerColors = {
        bronze: '#cd7f32', silver: '#708090', gold: '#FFD700',
        other: '#4CA1AF', external: '#ff9f1c', cte: '#E91E63'
    };

    const toggleProject = (proj) => {
        setExpandedProjects(prev => ({ ...prev, [proj]: !prev[proj] }));
    };

    if (!isOpen) return null;

    const total = stats.total || 1;

    return (
        <div style={{
            position: 'absolute',
            bottom: '60px',
            right: '10px',
            zIndex: 100,
            background: isDark ? 'rgba(30,30,30,0.97)' : 'rgba(255,255,255,0.97)',
            backdropFilter: 'blur(12px)',
            border: isDark ? '1px solid #444' : '1px solid #ddd',
            borderRadius: '12px',
            padding: '16px',
            width: '280px',
            maxHeight: '400px',
            overflowY: 'auto',
            boxShadow: '0 8px 30px rgba(0,0,0,0.25)',
            fontFamily: "'Inter', sans-serif",
            color: isDark ? '#fff' : '#333'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', opacity: 0.7 }}>
                    <BarChart3 size={14} /> Statistics
                </div>
                <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: isDark ? '#aaa' : '#666', display: 'flex', fontSize: '11px' }}>
                    ✕
                </button>
            </div>

            {/* Layer Bars */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '12px' }}>
                {Object.entries(stats.layers).filter(([, count]) => count > 0).map(([layer, count]) => (
                    <div key={layer} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 600, width: '50px', textTransform: 'capitalize', color: layerColors[layer] }}>{layer}</span>
                        <div style={{ flex: 1, height: '6px', background: isDark ? '#333' : '#eee', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ width: `${(count / total) * 100}%`, height: '100%', background: layerColors[layer], borderRadius: '3px', transition: 'width 0.3s ease' }} />
                        </div>
                        <span style={{ fontSize: '11px', fontWeight: 600, minWidth: '20px', textAlign: 'right' }}>{count}</span>
                    </div>
                ))}
            </div>

            {/* Summary Stats */}
            <div style={{ borderTop: isDark ? '1px solid #333' : '1px solid #eee', paddingTop: '10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '11px', marginBottom: '12px' }}>
                <div><span style={{ opacity: 0.6 }}>Edges:</span> <strong>{stats.edges}</strong></div>
                <div><span style={{ opacity: 0.6 }}>Sources:</span> <strong>{stats.sources}</strong></div>
                <div><span style={{ opacity: 0.6 }}>Sinks:</span> <strong>{stats.sinks}</strong></div>
                <div><span style={{ opacity: 0.6 }}>Orphans:</span> <strong>{stats.orphans}</strong></div>
            </div>

            {/* Project/Dataset Tree */}
            <div style={{ borderTop: isDark ? '1px solid #333' : '1px solid #eee', paddingTop: '10px', marginBottom: '10px' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', opacity: 0.5, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <FolderTree size={12} /> Projects & Datasets
                </div>
                {Object.entries(stats.projectTree)
                    .filter(([proj]) => proj !== 'internal')
                    .sort(([a], [b]) => {
                        if (a === 'default') return 1;
                        if (b === 'default') return -1;
                        return a.localeCompare(b);
                    })
                    .map(([project, datasets]) => {
                        const nodeCount = Object.values(datasets).reduce((s, arr) => s + arr.length, 0);
                        const isOpen = expandedProjects[project];
                        return (
                            <div key={project} style={{ marginBottom: '4px' }}>
                                <div
                                    onClick={() => toggleProject(project)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '4px',
                                        cursor: 'pointer', fontSize: '11px', fontWeight: 600,
                                        padding: '3px 0', userSelect: 'none'
                                    }}
                                >
                                    {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                    <Database size={11} style={{ opacity: 0.6 }} />
                                    <span style={{ flex: 1 }}>{project === 'default' ? 'Other' : project}</span>
                                    <span style={{ fontSize: '10px', opacity: 0.5, background: isDark ? '#333' : '#eee', padding: '1px 6px', borderRadius: '8px' }}>{nodeCount}</span>
                                </div>
                                {isOpen && Object.entries(datasets)
                                    .sort(([a], [b]) => a.localeCompare(b))
                                    .map(([dataset, nodeNames]) => (
                                        <div key={dataset} style={{ marginLeft: '20px', fontSize: '10px', padding: '2px 0', display: 'flex', alignItems: 'center', gap: '4px', opacity: 0.8 }}>
                                            <span style={{ color: isDark ? '#888' : '#999' }}>└</span>
                                            <span style={{ fontWeight: 500 }}>{dataset === 'default' ? 'uncategorized' : dataset}</span>
                                            <span style={{ opacity: 0.5 }}>({nodeNames.length})</span>
                                        </div>
                                    ))
                                }
                            </div>
                        );
                    })
                }
            </div>

            {/* Architecture Health */}
            <div style={{
                padding: '8px', borderRadius: '6px',
                background: stats.violations === 0 ? 'rgba(46, 204, 113, 0.1)' : 'rgba(255, 68, 68, 0.1)',
                border: `1px solid ${stats.violations === 0 ? 'rgba(46, 204, 113, 0.3)' : 'rgba(255, 68, 68, 0.3)'}`,
                display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px'
            }}>
                {stats.violations === 0 ? (
                    <><CheckCircle size={14} color="#2ecc71" /><span style={{ color: '#2ecc71', fontWeight: 600 }}>Clean Architecture</span></>
                ) : (
                    <><AlertTriangle size={14} color="#ff4444" /><span style={{ color: '#ff4444', fontWeight: 600 }}>{stats.violations} layer violation{stats.violations > 1 ? 's' : ''}</span></>
                )}
            </div>
        </div>
    );
};

export default LayerStats;
