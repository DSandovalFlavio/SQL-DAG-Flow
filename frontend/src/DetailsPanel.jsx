import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Globe, FilePlus, X, Edit2, Check, X as XIcon, ChevronDown, ChevronRight, Columns, FolderOpen, Filter, Zap, GitBranch, Info } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/esm/styles/prism';

const DetailsPanel = ({
    node,
    onClose,
    onUpdateNode,
    onCreateFile,
    theme,
    onDelete,
    onLayerChange
}) => {
    const [width, setWidth] = useState(450);
    const [isDragging, setIsDragging] = useState(false);
    const [isEditingLayer, setIsEditingLayer] = useState(false);
    const [tempLayer, setTempLayer] = useState(node?.layer || 'other');

    useEffect(() => {
        if (node) {
            setTempLayer(node.layer || 'other');
            setIsEditingLayer(false);
        }
    }, [node]);

    const isDark = theme === 'dark';
    const highlightStyle = isDark ? vscDarkPlus : vs;

    const startResizing = useCallback((mouseDownEvent) => {
        mouseDownEvent.preventDefault();
        setIsDragging(true);
    }, []);

    const stopResizing = useCallback(() => {
        setIsDragging(false);
    }, []);

    const resize = useCallback((mouseMoveEvent) => {
        if (isDragging) {
            const newWidth = window.innerWidth - mouseMoveEvent.clientX;
            const maxWidth = window.innerWidth * 0.75;
            if (newWidth > 300 && newWidth < maxWidth) {
                setWidth(newWidth);
            }
        }
    }, [isDragging]);

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', resize);
            window.addEventListener('mouseup', stopResizing);
        } else {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResizing);
        }
        return () => {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResizing);
        };
    }, [isDragging, resize, stopResizing]);

    if (!node) return null;

    return (
        <div style={{
            position: 'absolute',
            top: '56px',
            right: 0,
            width: `${width}px`,
            height: 'calc(100% - 56px)',
            background: 'var(--surface-secondary)',
            borderLeft: '1px solid var(--border-default)',
            zIndex: 1000,
            boxSizing: 'border-box',
            boxShadow: 'var(--shadow-lg)',
            display: 'flex'
        }}>
            {/* Drag Handle */}
            <div
                onMouseDown={startResizing}
                style={{
                    width: '4px',
                    height: '100%',
                    cursor: 'col-resize',
                    background: isDragging ? 'var(--accent-primary)' : 'transparent',
                    transition: 'background 0.2s',
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    zIndex: 1001
                }}
                title="Drag to resize"
            />

            <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '16px', fontWeight: 700, letterSpacing: '-0.02em' }}>
                        {node.type === 'annotation' ? (node.isGroup ? 'Group Settings' : 'Note Settings') : 'Node Details'}
                    </h2>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: '20px', cursor: 'pointer', padding: '4px', borderRadius: '4px' }}>×</button>
                </div>

                {node.type === 'annotation' ? (
                    <div>
                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Content</label>
                            <textarea
                                value={node.label}
                                onChange={(e) => onUpdateNode(node.id, { label: e.target.value })}
                                style={{ width: '100%', height: '100px', background: 'var(--surface-primary)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', padding: '10px', borderRadius: '8px', resize: 'vertical', outline: 'none', fontSize: '13px' }}
                            />
                        </div>

                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Font Size (px)</label>
                            <input
                                type="number"
                                min="10"
                                max="100"
                                value={node.fontSize || 14}
                                onChange={(e) => onUpdateNode(node.id, { fontSize: parseInt(e.target.value, 10) })}
                                style={{ width: '100%', background: 'var(--surface-primary)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', padding: '10px', borderRadius: '8px', outline: 'none' }}
                            />
                        </div>
                        {!node.isGroup && (
                            <div style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <input type="checkbox" checked={node.transparent} onChange={(e) => onUpdateNode(node.id, { transparent: e.target.checked })} />
                                    <label style={{ color: 'var(--text-primary)', fontSize: '13px' }}>Transparent Background</label>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <input type="checkbox" checked={node.borderless} onChange={(e) => onUpdateNode(node.id, { borderless: e.target.checked })} />
                                    <label style={{ color: 'var(--text-primary)', fontSize: '13px' }}>Borderless</label>
                                </div>
                            </div>
                        )}
                        <button
                            onClick={() => onDelete(node.id)}
                            style={{ padding: '10px 20px', background: 'var(--status-error)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', width: '100%', transition: 'opacity 0.15s' }}
                        >
                            🗑️ Delete {node.isGroup ? 'Group' : 'Note'}
                        </button>
                    </div>
                ) : (
                    <>
                        <div style={{ marginBottom: '20px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Node Name</div>
                            <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '4px', letterSpacing: '-0.01em' }}>{node.label}</div>
                        </div>

                        {node.layer === 'external' ? (
                            <div style={{
                                padding: '16px',
                                background: 'rgba(255, 159, 28, 0.08)',
                                border: '1px solid rgba(255, 159, 28, 0.2)',
                                borderRadius: '10px',
                                marginBottom: '20px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                                    <Globe size={18} color="#ff9f1c" />
                                    <span style={{ fontWeight: '600', color: '#ff9f1c' }}>Ghost Node</span>
                                </div>
                                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: 1.5 }}>
                                    This node is referenced in your project but the corresponding SQL file was not found.
                                </p>
                                <button
                                    onClick={() => onCreateFile(node)}
                                    style={{
                                        width: '100%', padding: '10px',
                                        background: '#ff9f1c', color: 'white',
                                        border: 'none', borderRadius: '8px',
                                        fontWeight: '600', cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                        boxShadow: 'var(--shadow-sm)',
                                        transition: 'opacity 0.15s'
                                    }}
                                >
                                    <FilePlus size={16} /> Create SQL File
                                </button>
                            </div>
                        ) : (
                            <>
                                <div style={{ marginBottom: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                    <div>
                                        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            <span>Layer</span>
                                            {node.layer !== 'external' && node.details?.path && onLayerChange && !isEditingLayer && (
                                                <button
                                                    onClick={() => setIsEditingLayer(true)}
                                                    style={{ background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '2px' }}
                                                    title="Edit Layer"
                                                >
                                                    <Edit2 size={12} />
                                                </button>
                                            )}
                                        </div>
                                        {isEditingLayer ? (
                                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center', marginTop: '4px' }}>
                                                <select
                                                    value={tempLayer}
                                                    onChange={(e) => setTempLayer(e.target.value)}
                                                    style={{
                                                        background: 'var(--surface-primary)',
                                                        border: '1px solid var(--border-default)',
                                                        color: 'var(--text-primary)',
                                                        padding: '4px 8px',
                                                        borderRadius: '6px',
                                                        fontSize: '13px',
                                                        textTransform: 'capitalize',
                                                        flex: 1,
                                                        outline: 'none'
                                                    }}
                                                >
                                                    <option value="bronze">Bronze</option>
                                                    <option value="silver">Silver</option>
                                                    <option value="gold">Gold</option>
                                                    <option value="other">Other</option>
                                                </select>
                                                <button
                                                    onClick={async () => {
                                                        if (tempLayer !== node.layer) {
                                                            if (window.confirm(`Are you sure you want to physically move this file to the ${tempLayer} layer?`)) {
                                                                await onLayerChange(node, tempLayer);
                                                            }
                                                        }
                                                        setIsEditingLayer(false);
                                                    }}
                                                    style={{ background: 'var(--status-success)', color: 'white', border: 'none', borderRadius: '6px', padding: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                    title="Save Layer"
                                                >
                                                    <Check size={14} />
                                                </button>
                                                <button
                                                    onClick={() => { setTempLayer(node.layer || 'other'); setIsEditingLayer(false); }}
                                                    style={{ background: 'var(--status-error)', color: 'white', border: 'none', borderRadius: '6px', padding: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                    title="Cancel"
                                                >
                                                    <XIcon size={14} />
                                                </button>
                                            </div>
                                        ) : (
                                            <div style={{ fontSize: '14px', color: 'var(--text-primary)', textTransform: 'capitalize', marginTop: '4px' }}>{node.layer}</div>
                                        )}
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Type</div>
                                        <div style={{ fontSize: '14px', color: 'var(--text-primary)', textTransform: 'capitalize', marginTop: '4px' }}>{node.details?.type || 'Table'}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Project</div>
                                        <div style={{ fontSize: '14px', color: 'var(--text-primary)', marginTop: '4px' }}>{node.details?.project || '-'}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Dataset</div>
                                        <div style={{ fontSize: '14px', color: 'var(--text-primary)', marginTop: '4px' }}>{node.details?.dataset || '-'}</div>
                                    </div>
                                </div>

                                {/* File Path */}
                                {node.details?.path && (
                                    <div style={{ marginBottom: '16px' }}>
                                        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            <FolderOpen size={12} /> File Path
                                        </div>
                                        <div style={{
                                            fontSize: '11px',
                                            color: 'var(--text-secondary)',
                                            padding: '8px 10px',
                                            background: 'var(--surface-primary)',
                                            borderRadius: '8px',
                                            wordBreak: 'break-all',
                                            fontFamily: 'monospace',
                                            border: '1px solid var(--border-default)'
                                        }}>
                                            {node.details.path}
                                        </div>
                                    </div>
                                )}

                                {/* Schema Preview */}
                                <SchemaPreview content={node.details?.content} isDark={isDark} />

                                {/* Business Rules */}
                                <BusinessRules rules={node.details?.business_rules} isDark={isDark} />

                                {/* Complexity Breakdown */}
                                <ComplexityBreakdown complexity={node.details?.complexity} isDark={isDark} />

                                <div style={{ marginBottom: '10px', fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>SQL Content</div>
                                <div style={{
                                    border: '1px solid var(--border-default)',
                                    borderRadius: '10px',
                                    overflow: 'hidden'
                                }}>
                                    <SyntaxHighlighter
                                        language="sql"
                                        style={highlightStyle}
                                        customStyle={{
                                            margin: 0,
                                            padding: '15px',
                                            fontSize: '12px',
                                            lineHeight: 1.5,
                                            background: isDark ? '#0d0d0d' : '#f7f6f3',
                                        }}
                                        wrapLongLines={true}
                                    >
                                        {node.details?.content || '-- No content found.'}
                                    </SyntaxHighlighter>
                                </div>
                            </>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

// Schema Preview sub-component
const SchemaPreview = ({ content, isDark }) => {
    const [isOpen, setIsOpen] = useState(false);

    const columns = useMemo(() => {
        if (!content) return [];
        const ddlMatch = content.match(/CREATE\s+(?:OR\s+REPLACE\s+)?(?:TABLE|VIEW)\s+[^(]+\(([^)]+)\)/is);
        if (ddlMatch) {
            const colDefs = ddlMatch[1];
            const cols = colDefs.split(',').map(col => {
                const trimmed = col.trim();
                if (!trimmed) return null;
                const parts = trimmed.split(/\s+/);
                const name = parts[0]?.replace(/`/g, '');
                const type = parts.slice(1).join(' ');
                return name ? { name, type } : null;
            }).filter(Boolean);
            if (cols.length > 0) return cols;
        }
        const selectMatch = content.match(/(?:^|\bAS\s+)\s*SELECT\s+([\s\S]+?)\s+FROM\b/im);
        if (!selectMatch) return [];
        const selectClause = selectMatch[1];
        const cols = [];
        let depth = 0;
        let current = '';
        for (const char of selectClause) {
            if (char === '(' || char === '[') depth++;
            else if (char === ')' || char === ']') depth--;
            else if (char === ',' && depth === 0) { cols.push(current.trim()); current = ''; continue; }
            current += char;
        }
        if (current.trim()) cols.push(current.trim());
        return cols.map(col => {
            if (col === '*' || col.endsWith('.*')) return null;
            const asMatch = col.match(/\bAS\s+(\w+)\s*$/i);
            if (asMatch) { const expr = col.substring(0, asMatch.index).trim(); return { name: asMatch[1], type: expr }; }
            const dotParts = col.split('.');
            const simpleName = dotParts[dotParts.length - 1].trim();
            if (/^\w+$/.test(simpleName)) return { name: simpleName, type: 'column' };
            return { name: col.length > 30 ? col.substring(0, 30) + '...' : col, type: 'expression' };
        }).filter(Boolean);
    }, [content]);

    if (columns.length === 0) return null;

    return (
        <div style={{ marginBottom: '16px' }}>
            <div onClick={() => setIsOpen(!isOpen)} style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', userSelect: 'none', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <Columns size={12} />
                Schema ({columns.length} columns)
            </div>
            {isOpen && (
                <div style={{ border: '1px solid var(--border-default)', borderRadius: '10px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                        <thead>
                            <tr style={{ background: 'var(--surface-primary)' }}>
                                <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-primary)', fontWeight: 600, borderBottom: '1px solid var(--border-default)' }}>Column</th>
                                <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-primary)', fontWeight: 600, borderBottom: '1px solid var(--border-default)' }}>Type</th>
                            </tr>
                        </thead>
                        <tbody>
                            {columns.map((col, i) => (
                                <tr key={i} style={{ borderBottom: i < columns.length - 1 ? '1px solid var(--border-default)' : 'none' }}>
                                    <td style={{ padding: '5px 10px', color: 'var(--text-primary)', fontFamily: 'monospace', fontWeight: 500 }}>{col.name}</td>
                                    <td style={{ padding: '5px 10px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{col.type}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

// Business Rules sub-component
const BusinessRules = ({ rules, isDark }) => {
    const [isOpen, setIsOpen] = useState(false);
    if (!rules) return null;
    const totalRules = Object.values(rules).reduce((s, arr) => s + arr.length, 0);
    if (totalRules === 0) return null;

    const ruleStyle = {
        fontFamily: 'monospace', fontSize: '11px', padding: '4px 8px',
        background: isDark ? 'rgba(124, 106, 239, 0.06)' : 'rgba(108, 92, 231, 0.06)',
        borderRadius: '6px', marginBottom: '3px',
        color: 'var(--text-primary)', wordBreak: 'break-word', lineHeight: 1.4, borderLeft: '3px solid'
    };

    const sections = [
        { key: 'filters', label: 'WHERE Filters', icon: <Filter size={11} />, color: '#60a5fa', data: rules.filters },
        { key: 'case_logic', label: 'CASE Logic', icon: <GitBranch size={11} />, color: '#a78bfa', data: rules.case_logic },
        { key: 'having', label: 'HAVING', icon: <Filter size={11} />, color: '#fbbf24', data: rules.having },
        { key: 'aggregations', label: 'Aggregations', icon: <Zap size={11} />, color: '#34d399', data: rules.aggregations },
    ];

    return (
        <div style={{ marginBottom: '16px' }}>
            <div onClick={() => setIsOpen(!isOpen)} style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', userSelect: 'none', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <Filter size={12} />
                Business Rules ({totalRules})
            </div>
            {isOpen && (
                <div style={{ border: '1px solid var(--border-default)', borderRadius: '10px', padding: '10px', background: 'var(--surface-inset)' }}>
                    {sections.filter(s => s.data && s.data.length > 0).map(section => (
                        <div key={section.key} style={{ marginBottom: '10px' }}>
                            <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: section.color, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                {section.icon} {section.label} ({section.data.length})
                            </div>
                            {section.data.map((rule, i) => (
                                <div key={i} style={{ ...ruleStyle, borderLeftColor: section.color }}>
                                    {rule.length > 120 ? rule.substring(0, 120) + '...' : rule}
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// Complexity Breakdown sub-component
const ComplexityBreakdown = ({ complexity, isDark }) => {
    const [isOpen, setIsOpen] = useState(false);
    if (!complexity || complexity.score === 0) return null;

    const score = complexity.score;
    const level = score <= 3 ? 'Low' : score <= 7 ? 'Medium' : score <= 12 ? 'High' : 'Very High';
    const levelColor = score <= 3 ? 'var(--status-success)' : score <= 7 ? 'var(--status-warning)' : score <= 12 ? '#e67e22' : 'var(--status-error)';

    const metrics = [
        { label: 'JOINs', count: complexity.joins, weight: 3, color: '#60a5fa' },
        { label: 'CTEs', count: complexity.ctes, weight: 2, color: '#f472b6' },
        { label: 'Subqueries', count: complexity.subqueries, weight: 3, color: '#a78bfa' },
        { label: 'Filters', count: complexity.filters, weight: 1, color: '#fbbf24' },
        { label: 'CASE', count: complexity.case_statements, weight: 2, color: '#fb923c' },
        { label: 'Aggregations', count: complexity.aggregations, weight: 1, color: '#34d399' },
        { label: 'UNIONs', count: complexity.unions, weight: 2, color: '#2dd4bf' },
    ].filter(m => m.count > 0);

    return (
        <div style={{ marginBottom: '16px' }}>
            <div onClick={() => setIsOpen(!isOpen)} style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', userSelect: 'none', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <Zap size={12} />
                Complexity: <span style={{ color: levelColor, fontWeight: 700 }}>{score}</span>
                <span style={{ fontSize: '10px', color: levelColor, fontWeight: 600 }}>({level})</span>
            </div>
            {isOpen && (
                <div style={{ border: '1px solid var(--border-default)', borderRadius: '10px', padding: '12px', background: 'var(--surface-inset)' }}>
                    {/* Visual gauge */}
                    <div style={{ height: '4px', background: 'var(--interactive-active)', borderRadius: '2px', marginBottom: '12px', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(score / 20 * 100, 100)}%`, height: '100%', background: `linear-gradient(90deg, var(--status-success), ${levelColor})`, borderRadius: '2px', transition: 'width 0.3s' }} />
                    </div>

                    {/* Metric bars */}
                    {metrics.map(m => (
                        <div key={m.label} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', fontSize: '11px' }}>
                            <span style={{ width: '80px', color: 'var(--text-primary)', fontWeight: 500 }}>{m.label}</span>
                            <span style={{ color: m.color, fontWeight: 700, width: '20px', textAlign: 'center' }}>{m.count}</span>
                            <span style={{ color: 'var(--text-tertiary)', fontSize: '10px' }}>× {m.weight}</span>
                            <span style={{ color: 'var(--text-tertiary)', fontSize: '10px' }}>=</span>
                            <span style={{ fontWeight: 700, fontSize: '11px', color: m.color }}>{m.count * m.weight}</span>
                        </div>
                    ))}

                    {/* Formula explanation */}
                    <div style={{
                        marginTop: '10px', padding: '8px', borderRadius: '8px',
                        background: 'var(--interactive-hover)',
                        fontSize: '10px', color: 'var(--text-secondary)', lineHeight: 1.5
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                            <Info size={11} style={{ opacity: 0.7 }} />
                            <strong>How the Score is Calculated</strong>
                        </div>
                        <span style={{ opacity: 0.8 }}>JOINs×3 + CTEs×2 + Subqueries×3 + Filters×1 + CASE×2 + Aggregations×1 + UNIONs×2</span><br />
                        <span style={{ opacity: 0.6, fontSize: '9px' }}>Low ≤3 · Medium ≤7 · High ≤12 · Very High &gt;12</span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DetailsPanel;
