import React, { useMemo } from 'react';
import { X, AlertTriangle, ArrowRight, Zap, Layers, Network } from 'lucide-react';

const ImpactAnalysis = ({ node, allNodes, allEdges, isOpen, onClose, onFocusNode, theme }) => {
    if (!isOpen || !node) return null;

    const isDark = theme === 'dark';

    // Compute downstream impact
    const impact = useMemo(() => {
        if (!node || !allEdges) return { downstream: [], impactedColumns: {} };

        // BFS to find all downstream nodes
        const visited = new Set();
        const queue = [node.id || node.details?.id];
        const nodeId = node.id || node.details?.id;
        visited.add(nodeId);

        while (queue.length > 0) {
            const current = queue.shift();
            const outgoing = allEdges.filter(e => e.source === current);
            for (const edge of outgoing) {
                if (!visited.has(edge.target)) {
                    visited.add(edge.target);
                    queue.push(edge.target);
                }
            }
        }

        visited.delete(nodeId); // Remove self

        // Get downstream node details
        const downstream = Array.from(visited).map(id => {
            const n = allNodes.find(n => n.id === id);
            if (!n) return null;
            // Calculate depth (hops from source)
            let depth = 0;
            const depthQueue = [{ id: nodeId, d: 0 }];
            const depthVisited = new Set([nodeId]);
            while (depthQueue.length > 0) {
                const { id: cid, d } = depthQueue.shift();
                const out = allEdges.filter(e => e.source === cid);
                for (const edge of out) {
                    if (!depthVisited.has(edge.target)) {
                        depthVisited.add(edge.target);
                        if (edge.target === id) { depth = d + 1; }
                        depthQueue.push({ id: edge.target, d: d + 1 });
                    }
                }
            }
            return {
                id,
                label: n.data.label,
                layer: n.data.layer,
                complexity: n.data.details?.complexity?.score || 0,
                depth,
            };
        }).filter(Boolean).sort((a, b) => a.depth - b.depth || b.complexity - a.complexity);

        // Get column consumers for this node
        const columnConsumers = node.details?.column_consumers || {};

        return { downstream, columnConsumers };
    }, [node, allNodes, allEdges]);

    const layerColors = {
        bronze: '#cd7f32', silver: '#708090', gold: '#FFD700',
        external: '#ff9f1c', cte: '#E91E63', other: '#4CA1AF'
    };

    const riskLevel = impact.downstream.length === 0 ? 'none'
        : impact.downstream.length <= 3 ? 'low'
            : impact.downstream.length <= 8 ? 'medium'
                : 'high';

    const riskColors = { none: 'var(--status-success)', low: 'var(--status-success)', medium: 'var(--status-warning)', high: 'var(--status-error)' };
    const riskLabels = { none: 'No Impact', low: 'Low Risk', medium: 'Medium Risk', high: 'High Risk' };

    const columnEntries = Object.entries(impact.columnConsumers).sort((a, b) => b[1].length - a[1].length);

    return (
        <div
            style={{
                position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
                background: 'var(--surface-overlay)', backdropFilter: 'blur(8px)',
                zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div style={{
                width: '600px', maxWidth: '90vw', maxHeight: '80vh',
                background: 'var(--surface-elevated)',
                borderRadius: '16px',
                border: '1px solid var(--border-default)',
                boxShadow: 'var(--shadow-xl)',
                overflow: 'hidden', display: 'flex', flexDirection: 'column',
                animation: 'fadeIn 0.2s ease-out',
            }}>
                {/* Header */}
                <div style={{
                    padding: '20px 24px 16px',
                    borderBottom: '1px solid var(--border-default)',
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '16px', fontWeight: 700, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <AlertTriangle size={18} style={{ color: riskColors[riskLevel] }} />
                            Impact Analysis
                        </h3>
                        <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px', borderRadius: '4px' }}>
                            <X size={18} />
                        </button>
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                        What happens if <strong style={{ color: 'var(--text-primary)' }}>{node.label || node.details?.label}</strong> changes?
                    </div>

                    {/* Summary Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginTop: '14px' }}>
                        <div style={{
                            padding: '10px', borderRadius: '10px',
                            background: 'var(--surface-primary)',
                            border: '1px solid var(--border-default)',
                        }}>
                            <div style={{ fontSize: '9px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Affected Models</div>
                            <div style={{ fontSize: '22px', fontWeight: 700, color: riskColors[riskLevel], letterSpacing: '-0.02em' }}>{impact.downstream.length}</div>
                        </div>
                        <div style={{
                            padding: '10px', borderRadius: '10px',
                            background: 'var(--surface-primary)',
                            border: '1px solid var(--border-default)',
                        }}>
                            <div style={{ fontSize: '9px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Columns Used</div>
                            <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>{columnEntries.length}</div>
                        </div>
                        <div style={{
                            padding: '10px', borderRadius: '10px',
                            background: 'var(--surface-primary)',
                            border: `1px solid ${riskColors[riskLevel]}40`,
                        }}>
                            <div style={{ fontSize: '9px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Risk Level</div>
                            <div style={{ fontSize: '14px', fontWeight: 700, color: riskColors[riskLevel], marginTop: '4px' }}>{riskLabels[riskLevel]}</div>
                        </div>
                    </div>
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
                    {/* Column Consumers */}
                    {columnEntries.length > 0 && (
                        <div style={{ marginBottom: '20px' }}>
                            <div style={{
                                fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)',
                                textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px',
                            }}>
                                Column Usage by Downstream Models
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {columnEntries.map(([col, consumers]) => (
                                    <div key={col} style={{
                                        padding: '8px 12px',
                                        background: 'var(--surface-primary)',
                                        border: '1px solid var(--border-default)',
                                        borderRadius: '8px',
                                    }}>
                                        <div style={{
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                            marginBottom: consumers.length > 0 ? '6px' : 0,
                                        }}>
                                            <span style={{
                                                fontFamily: 'monospace', fontSize: '12px', fontWeight: 600,
                                                color: 'var(--text-primary)',
                                            }}>
                                                {col}
                                            </span>
                                            <span style={{
                                                fontSize: '9px', fontWeight: 700,
                                                background: consumers.length > 3 ? 'rgba(239, 68, 68, 0.12)' : 'rgba(96, 165, 250, 0.12)',
                                                color: consumers.length > 3 ? '#ef4444' : '#60a5fa',
                                                padding: '2px 6px', borderRadius: '4px',
                                            }}>
                                                {consumers.length} {consumers.length === 1 ? 'consumer' : 'consumers'}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                            {consumers.map((c, i) => (
                                                <span
                                                    key={i}
                                                    onClick={() => { if (onFocusNode) onFocusNode(c.node); }}
                                                    style={{
                                                        fontSize: '10px', padding: '2px 8px',
                                                        background: 'var(--interactive-active)',
                                                        color: 'var(--text-secondary)',
                                                        borderRadius: '4px',
                                                        cursor: onFocusNode ? 'pointer' : 'default',
                                                        transition: 'background 0.15s',
                                                    }}
                                                    title={`Click to focus on ${c.label}`}
                                                >
                                                    {c.label}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Downstream Models List */}
                    <div>
                        <div style={{
                            fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)',
                            textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px',
                        }}>
                            Downstream Models ({impact.downstream.length})
                        </div>
                        {impact.downstream.length === 0 ? (
                            <div style={{
                                padding: '20px', textAlign: 'center',
                                color: 'var(--text-tertiary)', fontSize: '12px',
                                background: 'var(--surface-primary)',
                                borderRadius: '10px', border: '1px solid var(--border-default)',
                            }}>
                                ✅ This model has no downstream consumers. Changes are safe.
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {impact.downstream.map((m) => (
                                    <div
                                        key={m.id}
                                        onClick={() => { if (onFocusNode) onFocusNode(m.id); }}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '10px',
                                            padding: '8px 12px',
                                            background: 'var(--surface-primary)',
                                            border: '1px solid var(--border-default)',
                                            borderRadius: '8px',
                                            cursor: onFocusNode ? 'pointer' : 'default',
                                            transition: 'background 0.15s',
                                        }}
                                    >
                                        <div style={{
                                            width: 8, height: 8, borderRadius: '50%',
                                            background: layerColors[m.layer] || '#888',
                                            flexShrink: 0,
                                        }} />
                                        <span style={{ flex: 1, fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)' }}>
                                            {m.label}
                                        </span>
                                        <span style={{ fontSize: '9px', color: 'var(--text-tertiary)', textTransform: 'capitalize' }}>
                                            {m.layer}
                                        </span>
                                        <span style={{
                                            fontSize: '9px', fontWeight: 600,
                                            color: 'var(--text-tertiary)',
                                            background: 'var(--interactive-active)',
                                            padding: '1px 6px', borderRadius: '4px',
                                        }}>
                                            depth {m.depth}
                                        </span>
                                        {m.complexity > 5 && (
                                            <span style={{
                                                fontSize: '9px', fontWeight: 700,
                                                background: m.complexity > 12 ? 'rgba(239, 68, 68, 0.12)' : 'rgba(251, 191, 36, 0.12)',
                                                color: m.complexity > 12 ? '#ef4444' : '#fbbf24',
                                                padding: '2px 6px', borderRadius: '4px',
                                                display: 'flex', alignItems: 'center', gap: '3px',
                                            }}>
                                                <Zap size={9} /> {m.complexity}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ImpactAnalysis;
