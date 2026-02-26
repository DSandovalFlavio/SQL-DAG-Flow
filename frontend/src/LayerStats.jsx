import React, { useMemo } from 'react';
import { X, BarChart3, Network, HeartPulse } from 'lucide-react';

const LayerStats = ({ nodes, edges, theme, isOpen, onClose }) => {
    if (!isOpen) return null;

    const isDark = theme === 'dark';

    const layerColors = {
        bronze: '#cd7f32',
        silver: '#708090',
        gold: '#FFD700',
        external: '#ff9f1c',
        cte: '#E91E63',
        other: '#4CA1AF'
    };

    const stats = useMemo(() => {
        const modelNodes = nodes.filter(n => n.type !== 'annotation');
        const layerCounts = {};
        modelNodes.forEach(node => {
            const layer = node.data.layer || 'other';
            layerCounts[layer] = (layerCounts[layer] || 0) + 1;
        });

        const projectTree = {};
        modelNodes.forEach(node => {
            const project = node.data.details?.project || 'default';
            const dataset = node.data.details?.dataset || 'default';
            if (!projectTree[project]) projectTree[project] = {};
            if (!projectTree[project][dataset]) projectTree[project][dataset] = 0;
            projectTree[project][dataset]++;
        });

        const totalNodes = modelNodes.length;
        const totalEdges = edges.length;
        const avgDeps = totalNodes > 0 ? (totalEdges / totalNodes).toFixed(1) : 0;

        const hasOrphans = modelNodes.some(n => {
            const hasIncoming = edges.some(e => e.target === n.id);
            const hasOutgoing = edges.some(e => e.source === n.id);
            return !hasIncoming && !hasOutgoing;
        });
        const orphanCount = modelNodes.filter(n => {
            const hasIncoming = edges.some(e => e.target === n.id);
            const hasOutgoing = edges.some(e => e.source === n.id);
            return !hasIncoming && !hasOutgoing;
        }).length;

        const sourceCount = modelNodes.filter(n => !edges.some(e => e.target === n.id) && edges.some(e => e.source === n.id)).length;
        const sinkCount = modelNodes.filter(n => edges.some(e => e.target === n.id) && !edges.some(e => e.source === n.id)).length;

        return { layerCounts, projectTree, totalNodes, totalEdges, avgDeps, hasOrphans, orphanCount, sourceCount, sinkCount };
    }, [nodes, edges]);

    const maxCount = Math.max(1, ...Object.values(stats.layerCounts));

    return (
        <div style={{
            position: 'fixed',
            top: 0, left: 0, width: '100vw', height: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--surface-overlay)',
            backdropFilter: 'blur(8px)',
            zIndex: 2000,
        }}
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div style={{
                background: 'var(--surface-elevated)',
                borderRadius: '16px',
                width: '500px',
                maxWidth: '90vw',
                maxHeight: '80vh',
                overflowY: 'auto',
                padding: '24px',
                border: '1px solid var(--border-default)',
                boxShadow: 'var(--shadow-xl)',
                animation: 'fadeIn 0.2s ease-out'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <h3 style={{ margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px', fontWeight: 700, letterSpacing: '-0.02em' }}>
                        <BarChart3 size={18} /> Project Statistics
                    </h3>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px', borderRadius: '4px' }}><X size={18} /></button>
                </div>

                {/* Overview Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '20px' }}>
                    {[
                        { label: 'Models', value: stats.totalNodes, icon: <Network size={14} /> },
                        { label: 'Dependencies', value: stats.totalEdges, icon: <Network size={14} /> },
                        { label: 'Avg Deps', value: stats.avgDeps, icon: <Network size={14} /> }
                    ].map(card => (
                        <div key={card.label} style={{ padding: '12px', background: 'var(--surface-primary)', borderRadius: '10px', border: '1px solid var(--border-default)' }}>
                            <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>{card.label}</div>
                            <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>{card.value}</div>
                        </div>
                    ))}
                </div>

                {/* Layer Distribution */}
                <div style={{ marginBottom: '20px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Layer Distribution</div>
                    {Object.entries(stats.layerCounts).sort((a, b) => b[1] - a[1]).map(([layer, count]) => (
                        <div key={layer} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                            <div style={{ width: '70px', fontSize: '11px', fontWeight: 500, color: 'var(--text-primary)', textTransform: 'capitalize' }}>{layer}</div>
                            <div style={{ flex: 1, height: '6px', background: 'var(--interactive-active)', borderRadius: '3px', overflow: 'hidden' }}>
                                <div style={{ width: `${(count / maxCount) * 100}%`, height: '100%', background: layerColors[layer] || '#888', borderRadius: '3px', transition: 'width 0.3s cubic-bezier(0.25, 0.1, 0.25, 1)' }} />
                            </div>
                            <div style={{ width: '30px', fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)', textAlign: 'right' }}>{count}</div>
                        </div>
                    ))}
                </div>

                {/* Project & Dataset Tree */}
                <div style={{ marginBottom: '20px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Project Structure</div>
                    <div style={{ background: 'var(--surface-primary)', borderRadius: '10px', padding: '10px', border: '1px solid var(--border-default)' }}>
                        {Object.entries(stats.projectTree).sort(([a], [b]) => a.localeCompare(b)).map(([project, datasets]) => (
                            <div key={project} style={{ marginBottom: '8px' }}>
                                <div style={{ fontWeight: 600, fontSize: '12px', color: 'var(--text-primary)', marginBottom: '4px' }}>📁 {project}</div>
                                {Object.entries(datasets).sort(([a], [b]) => a.localeCompare(b)).map(([dataset, count]) => (
                                    <div key={dataset} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0 3px 24px', fontSize: '11px' }}>
                                        <span style={{ color: 'var(--text-secondary)' }}>📂 {dataset}</span>
                                        <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{count}</span>
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Architecture Health */}
                <div>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        <HeartPulse size={12} /> Architecture Health
                    </div>
                    <div style={{
                        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px'
                    }}>
                        {[
                            { label: 'Sources (No Deps)', value: stats.sourceCount, status: 'info' },
                            { label: 'Sinks (No Consumers)', value: stats.sinkCount, status: 'info' },
                            { label: 'Orphaned Nodes', value: stats.orphanCount, status: stats.orphanCount > 0 ? 'warning' : 'success' },
                            { label: 'Avg Dependencies', value: stats.avgDeps, status: stats.avgDeps > 5 ? 'warning' : 'success' },
                        ].map(item => {
                            const statusColors = {
                                success: 'var(--status-success)',
                                warning: 'var(--status-warning)',
                                error: 'var(--status-error)',
                                info: 'var(--status-info)'
                            };
                            return (
                                <div key={item.label} style={{
                                    padding: '10px', borderRadius: '10px',
                                    background: 'var(--surface-primary)',
                                    border: '1px solid var(--border-default)',
                                    display: 'flex', alignItems: 'center', gap: '8px'
                                }}>
                                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: statusColors[item.status] }} />
                                    <div>
                                        <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontWeight: 500 }}>{item.label}</div>
                                        <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{item.value}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LayerStats;
