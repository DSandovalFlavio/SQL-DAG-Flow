import React, { useState, useEffect, useCallback } from 'react';
import { Play, Pause, SkipForward, SkipBack, X, Layers } from 'lucide-react';

const TourMode = ({ nodes, edges, isOpen, onClose, onFocusNode, theme }) => {
    const [currentStep, setCurrentStep] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);

    // Build tour steps: group by layer, then order within each layer by downstream impact
    const tourSteps = React.useMemo(() => {
        if (!nodes || nodes.length === 0) return [];

        const layerOrder = ['bronze', 'silver', 'gold', 'other', 'external'];
        const layerLabels = {
            bronze: 'Bronze Layer (Raw Data Sources)',
            silver: 'Silver Layer (Cleaned / Transformed)',
            gold: 'Gold Layer (Business Ready)',
            other: 'Other Models',
            external: 'External Dependencies',
        };

        const steps = [];
        const realNodes = nodes.filter(n => n.type !== 'annotation' && !n.hidden);

        for (const layer of layerOrder) {
            const layerNodes = realNodes
                .filter(n => n.data.layer === layer)
                .sort((a, b) => (b.data.downstreamCount || 0) - (a.data.downstreamCount || 0));

            if (layerNodes.length === 0) continue;

            // Add layer intro step
            steps.push({
                type: 'intro',
                layer,
                title: layerLabels[layer] || layer,
                count: layerNodes.length,
                nodeIds: layerNodes.map(n => n.id),
            });

            // Add top 5 nodes by impact
            const topNodes = layerNodes.slice(0, 5);
            for (const node of topNodes) {
                steps.push({
                    type: 'node',
                    layer,
                    id: node.id,
                    label: node.data.label,
                    downstream: node.data.downstreamCount || 0,
                    complexity: node.data.details?.complexity?.score || 0,
                    description: node.data.details?.header_meta?.description || node.data.description || null,
                    incoming: node.data.incomingCount || 0,
                });
            }
        }

        return steps;
    }, [nodes]);

    // Auto-play
    useEffect(() => {
        if (!isPlaying || !isOpen) return;
        const timer = setTimeout(() => {
            if (currentStep < tourSteps.length - 1) {
                setCurrentStep(prev => prev + 1);
            } else {
                setIsPlaying(false);
            }
        }, 3000);
        return () => clearTimeout(timer);
    }, [isPlaying, currentStep, tourSteps.length, isOpen]);

    // Focus on current step
    useEffect(() => {
        if (!isOpen || tourSteps.length === 0) return;
        const step = tourSteps[currentStep];
        if (!step) return;

        if (step.type === 'intro') {
            // Fit view to all nodes in this layer
            if (onFocusNode) onFocusNode(step.nodeIds, true);
        } else if (step.type === 'node') {
            if (onFocusNode) onFocusNode([step.id], false);
        }
    }, [currentStep, isOpen, tourSteps]);

    if (!isOpen || tourSteps.length === 0) return null;

    const step = tourSteps[currentStep];
    const progress = ((currentStep + 1) / tourSteps.length) * 100;

    const layerColors = {
        bronze: '#cd7f32', silver: '#708090', gold: '#FFD700',
        external: '#ff9f1c', cte: '#E91E63', other: '#4CA1AF'
    };

    return (
        <div style={{
            position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)',
            zIndex: 1500, width: '460px', maxWidth: '90vw',
            background: 'var(--surface-elevated)',
            border: '1px solid var(--border-default)',
            borderRadius: '16px',
            boxShadow: 'var(--shadow-xl)',
            overflow: 'hidden',
            animation: 'fadeIn 0.2s ease-out',
        }}>
            {/* Progress bar */}
            <div style={{ height: '3px', background: 'var(--interactive-active)' }}>
                <div style={{
                    height: '100%', width: `${progress}%`,
                    background: layerColors[step?.layer] || 'var(--accent-primary)',
                    transition: 'width 0.3s ease',
                }} />
            </div>

            <div style={{ padding: '16px 20px' }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Layers size={14} style={{ color: layerColors[step?.layer] || '#888' }} />
                        <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Tour — Step {currentStep + 1}/{tourSteps.length}
                        </span>
                    </div>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: '2px' }}>
                        <X size={14} />
                    </button>
                </div>

                {/* Step content */}
                {step.type === 'intro' ? (
                    <div>
                        <div style={{
                            fontSize: '15px', fontWeight: 700, color: layerColors[step.layer],
                            marginBottom: '4px', letterSpacing: '-0.02em',
                        }}>
                            {step.title}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                            {step.count} {step.count === 1 ? 'model' : 'models'} in this layer
                        </div>
                    </div>
                ) : (
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: layerColors[step.layer] || '#888' }} />
                            <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                                {step.label}
                            </span>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: step.description ? '6px' : 0 }}>
                            <span style={{ fontSize: '10px', background: 'rgba(96,165,250,0.12)', color: '#60a5fa', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                                {step.incoming} in → {step.downstream} out
                            </span>
                            {step.complexity > 5 && (
                                <span style={{
                                    fontSize: '10px', fontWeight: 700,
                                    background: step.complexity > 12 ? 'rgba(239,68,68,0.12)' : 'rgba(251,191,36,0.12)',
                                    color: step.complexity > 12 ? '#ef4444' : '#fbbf24',
                                    padding: '2px 6px', borderRadius: '4px',
                                }}>
                                    Complexity: {step.complexity}
                                </span>
                            )}
                        </div>
                        {step.description && (
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                                {step.description}
                            </div>
                        )}
                    </div>
                )}

                {/* Controls */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '14px' }}>
                    <button
                        onClick={() => setCurrentStep(prev => Math.max(0, prev - 1))}
                        disabled={currentStep === 0}
                        style={{
                            background: 'var(--interactive-active)', border: 'none', borderRadius: '6px',
                            color: 'var(--text-secondary)', cursor: currentStep === 0 ? 'default' : 'pointer',
                            padding: '6px', display: 'flex',
                            opacity: currentStep === 0 ? 0.3 : 1,
                        }}
                    >
                        <SkipBack size={16} />
                    </button>
                    <button
                        onClick={() => setIsPlaying(!isPlaying)}
                        style={{
                            background: isPlaying ? 'var(--status-warning)' : 'var(--accent-primary)',
                            border: 'none', borderRadius: '8px',
                            color: '#fff', cursor: 'pointer',
                            padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '4px',
                            fontSize: '11px', fontWeight: 700,
                        }}
                    >
                        {isPlaying ? <><Pause size={14} /> Pause</> : <><Play size={14} /> Play</>}
                    </button>
                    <button
                        onClick={() => setCurrentStep(prev => Math.min(tourSteps.length - 1, prev + 1))}
                        disabled={currentStep >= tourSteps.length - 1}
                        style={{
                            background: 'var(--interactive-active)', border: 'none', borderRadius: '6px',
                            color: 'var(--text-secondary)', cursor: currentStep >= tourSteps.length - 1 ? 'default' : 'pointer',
                            padding: '6px', display: 'flex',
                            opacity: currentStep >= tourSteps.length - 1 ? 0.3 : 1,
                        }}
                    >
                        <SkipForward size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TourMode;
