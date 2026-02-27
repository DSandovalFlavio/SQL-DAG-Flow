import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Search, ArrowRight, Database, Tag, FileText, Zap, X } from 'lucide-react';

const CommandPalette = ({ nodes, isOpen, onClose, onSelectNode, theme }) => {
    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef(null);
    const listRef = useRef(null);

    // Focus input when opened
    useEffect(() => {
        if (isOpen) {
            setQuery('');
            setSelectedIndex(0);
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [isOpen]);

    const results = useMemo(() => {
        const modelNodes = nodes.filter(n => n.type !== 'annotation');
        if (!query) {
            // Show top nodes by downstream impact when no query
            return modelNodes
                .sort((a, b) => (b.data.downstreamCount || 0) - (a.data.downstreamCount || 0))
                .slice(0, 15);
        }

        const q = query.toLowerCase();
        return modelNodes.filter(n => {
            const label = n.data.label?.toLowerCase() || '';
            const project = n.data.details?.project?.toLowerCase() || '';
            const dataset = n.data.details?.dataset?.toLowerCase() || '';
            const tag = n.data.tag?.toLowerCase() || '';
            return label.includes(q) || project.includes(q) || dataset.includes(q) || tag.includes(q) || n.id.toLowerCase().includes(q);
        }).sort((a, b) => {
            // Exact start match first
            const aStarts = a.data.label?.toLowerCase().startsWith(q) ? -1 : 0;
            const bStarts = b.data.label?.toLowerCase().startsWith(q) ? -1 : 0;
            if (aStarts !== bStarts) return aStarts - bStarts;
            // Then by downstream impact
            return (b.data.downstreamCount || 0) - (a.data.downstreamCount || 0);
        }).slice(0, 20);
    }, [nodes, query]);

    // Keyboard navigation
    const handleKeyDown = useCallback((e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter' && results[selectedIndex]) {
            e.preventDefault();
            onSelectNode(results[selectedIndex]);
            onClose();
        } else if (e.key === 'Escape') {
            onClose();
        }
    }, [results, selectedIndex, onSelectNode, onClose]);

    // Scroll selected item into view
    useEffect(() => {
        if (listRef.current) {
            const items = listRef.current.children;
            if (items[selectedIndex]) {
                items[selectedIndex].scrollIntoView({ block: 'nearest' });
            }
        }
    }, [selectedIndex]);

    // Reset selected index when results change
    useEffect(() => {
        setSelectedIndex(0);
    }, [query]);

    if (!isOpen) return null;

    const layerColors = {
        bronze: '#cd7f32', silver: '#708090', gold: '#FFD700',
        external: '#ff9f1c', cte: '#E91E63', other: '#4CA1AF'
    };

    return (
        <div
            style={{
                position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
                background: 'var(--surface-overlay)', backdropFilter: 'blur(8px)',
                zIndex: 3000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
                paddingTop: '15vh',
            }}
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div style={{
                width: '560px', maxWidth: '90vw',
                background: 'var(--surface-elevated)',
                borderRadius: '16px',
                border: '1px solid var(--border-default)',
                boxShadow: 'var(--shadow-xl)',
                overflow: 'hidden',
                animation: 'fadeIn 0.15s ease-out',
            }}>
                {/* Search Input */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '14px 18px',
                    borderBottom: '1px solid var(--border-default)',
                }}>
                    <Search size={18} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Search models, tables, projects..."
                        style={{
                            flex: 1, background: 'transparent', border: 'none',
                            color: 'var(--text-primary)', fontSize: '15px',
                            outline: 'none', fontWeight: 400,
                        }}
                    />
                    <kbd style={{
                        fontSize: '10px', color: 'var(--text-tertiary)',
                        background: 'var(--interactive-active)', padding: '2px 6px',
                        borderRadius: '4px', border: '1px solid var(--border-default)',
                    }}>
                        ESC
                    </kbd>
                </div>

                {/* Results */}
                <div ref={listRef} style={{
                    maxHeight: '400px', overflowY: 'auto',
                    padding: '6px',
                }}>
                    {results.length === 0 && (
                        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '13px' }}>
                            No models found
                        </div>
                    )}
                    {results.map((node, i) => {
                        const isSelected = i === selectedIndex;
                        const layer = node.data.layer || 'other';
                        const downstream = node.data.downstreamCount || 0;
                        const complexity = node.data.details?.complexity?.score || 0;

                        return (
                            <div
                                key={node.id}
                                onClick={() => { onSelectNode(node); onClose(); }}
                                onMouseEnter={() => setSelectedIndex(i)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '10px',
                                    padding: '10px 14px',
                                    borderRadius: '10px',
                                    cursor: 'pointer',
                                    background: isSelected ? 'var(--interactive-active)' : 'transparent',
                                    transition: 'background 0.1s',
                                }}
                            >
                                {/* Layer dot */}
                                <div style={{
                                    width: 8, height: 8, borderRadius: '50%',
                                    background: layerColors[layer] || '#888',
                                    flexShrink: 0,
                                }} />

                                {/* Name + metadata */}
                                <div style={{ flex: 1, overflow: 'hidden' }}>
                                    <div style={{
                                        fontSize: '13px', fontWeight: 600,
                                        color: 'var(--text-primary)',
                                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                    }}>
                                        {node.data.label}
                                    </div>
                                    <div style={{
                                        fontSize: '10px', color: 'var(--text-tertiary)',
                                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                        display: 'flex', gap: '6px', marginTop: '2px',
                                    }}>
                                        <span>{node.data.details?.project || '-'}</span>
                                        <span>·</span>
                                        <span>{node.data.details?.dataset || '-'}</span>
                                        {node.data.tag && (
                                            <>
                                                <span>·</span>
                                                <span style={{ color: 'var(--accent-text)' }}>#{node.data.tag}</span>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Badges */}
                                <div style={{ display: 'flex', gap: '6px', flexShrink: 0, alignItems: 'center' }}>
                                    {downstream > 0 && (
                                        <span title={`${downstream} downstream models`} style={{
                                            fontSize: '9px', fontWeight: 700,
                                            background: 'rgba(96, 165, 250, 0.15)',
                                            color: '#60a5fa',
                                            padding: '2px 6px', borderRadius: '4px',
                                            display: 'flex', alignItems: 'center', gap: '3px',
                                        }}>
                                            <ArrowRight size={9} /> {downstream}
                                        </span>
                                    )}
                                    {complexity > 5 && (
                                        <span title={`Complexity: ${complexity}`} style={{
                                            fontSize: '9px', fontWeight: 700,
                                            background: complexity > 12 ? 'rgba(239, 68, 68, 0.12)' : 'rgba(251, 191, 36, 0.12)',
                                            color: complexity > 12 ? '#ef4444' : '#fbbf24',
                                            padding: '2px 6px', borderRadius: '4px',
                                            display: 'flex', alignItems: 'center', gap: '3px',
                                        }}>
                                            <Zap size={9} /> {complexity}
                                        </span>
                                    )}
                                </div>

                                {/* Action hint */}
                                {isSelected && (
                                    <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', flexShrink: 0 }}>
                                        ↵
                                    </span>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Footer */}
                <div style={{
                    padding: '10px 18px',
                    borderTop: '1px solid var(--border-default)',
                    display: 'flex', gap: '16px', alignItems: 'center',
                    fontSize: '10px', color: 'var(--text-tertiary)',
                }}>
                    <span>↑↓ Navigate</span>
                    <span>↵ Open</span>
                    <span>ESC Close</span>
                    {!query && <span style={{ marginLeft: 'auto' }}>Showing top models by impact</span>}
                </div>
            </div>
        </div>
    );
};

export default CommandPalette;
