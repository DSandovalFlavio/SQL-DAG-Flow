import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Globe, FilePlus, X, Edit2, Check, X as XIcon, ChevronDown, ChevronRight, Columns, FolderOpen, Filter, Zap, GitBranch, Info, Search, Tag, ArrowUp, ArrowDown, AlertTriangle, ArrowRight } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/esm/styles/prism';

const DetailsPanel = ({
    node,
    onClose,
    onUpdateNode,
    onCreateFile,
    theme,
    onDelete,
    onLayerChange,
    onImpactAnalysis
}) => {
    const [width, setWidth] = useState(450);
    const [isDragging, setIsDragging] = useState(false);
    const [isEditingLayer, setIsEditingLayer] = useState(false);
    const [tempLayer, setTempLayer] = useState(node?.layer || 'other');
    const [searchTerm, setSearchTerm] = useState('');
    const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
    const [tagInput, setTagInput] = useState(node?.tag || '');
    const [isEditingTag, setIsEditingTag] = useState(false);
    const sqlContentRef = useRef(null);

    useEffect(() => {
        if (node) {
            setTempLayer(node.layer || 'other');
            setIsEditingLayer(false);
            setTagInput(node.tag || '');
            setIsEditingTag(false);
            setSearchTerm('');
            setCurrentMatchIndex(0);
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

    // Search match computation
    const searchMatches = useMemo(() => {
        if (!searchTerm || !node?.details?.content) return [];
        const content = node.details.content;
        const term = searchTerm.toLowerCase();
        const matches = [];
        let idx = content.toLowerCase().indexOf(term);
        while (idx !== -1) {
            matches.push(idx);
            idx = content.toLowerCase().indexOf(term, idx + 1);
        }
        return matches;
    }, [searchTerm, node?.details?.content]);

    // Scroll to current match
    useEffect(() => {
        if (searchMatches.length > 0 && sqlContentRef.current) {
            const marks = sqlContentRef.current.querySelectorAll('mark.search-highlight');
            if (marks[currentMatchIndex]) {
                marks[currentMatchIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }, [currentMatchIndex, searchMatches]);

    // Detect keywords and model references for line annotations
    const dependencyNames = useMemo(() => {
        if (!node?.details?.dependencies) return new Set();
        const deps = node.details.dependencies;
        const names = new Set();
        const depKeys = typeof deps === 'object' && !Array.isArray(deps) ? Object.keys(deps) : deps;
        depKeys.forEach(dep => {
            const parts = dep.split('.');
            names.add(parts[parts.length - 1].toLowerCase());
            names.add(dep.toLowerCase());
        });
        return names;
    }, [node?.details?.dependencies]);

    const getLineAnnotation = useCallback((lineText) => {
        const upper = lineText.toUpperCase().trim();
        if (/\bJOIN\b/.test(upper)) return { color: '#a78bfa', label: 'JOIN' };
        if (/\bFROM\b/.test(upper)) return { color: '#60a5fa', label: 'FROM' };
        // Check for model/table references
        const lower = lineText.toLowerCase();
        for (const dep of dependencyNames) {
            if (lower.includes(dep)) return { color: '#fbbf24', label: 'REF' };
        }
        return null;
    }, [dependencyNames]);

    // Render SQL content with search highlights and line annotations
    const renderSQLContent = useCallback(() => {
        const content = node?.details?.content || '-- No content found.';
        const lines = content.split('\n');

        return (
            <div ref={sqlContentRef} style={{ position: 'relative' }}>
                <SyntaxHighlighter
                    language="sql"
                    style={highlightStyle}
                    customStyle={{
                        margin: 0,
                        padding: '15px',
                        paddingLeft: '22px',
                        fontSize: '12px',
                        lineHeight: 1.5,
                        background: isDark ? '#0d0d0d' : '#f7f6f3',
                    }}
                    wrapLines={true}
                    wrapLongLines={true}
                    showLineNumbers={true}
                    lineNumberStyle={{ minWidth: '2.5em', paddingRight: '1em', color: 'var(--text-tertiary)', fontSize: '10px', opacity: 0.5 }}
                    lineProps={(lineNumber) => {
                        const lineText = lines[lineNumber - 1] || '';
                        const annotation = getLineAnnotation(lineText);
                        return {
                            style: {
                                borderLeft: annotation ? `3px solid ${annotation.color}` : '3px solid transparent',
                                paddingLeft: '8px',
                                display: 'block',
                                ...(annotation ? { background: `${annotation.color}08` } : {})
                            }
                        };
                    }}
                    PreTag={({ children, ...rest }) => {
                        // Apply search highlights by post-processing
                        if (!searchTerm) return <pre {...rest}>{children}</pre>;
                        return <pre {...rest}>{children}</pre>;
                    }}
                >
                    {content}
                </SyntaxHighlighter>

                {/* Search highlight overlay */}
                {searchTerm && (
                    <div
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            pointerEvents: 'none',
                            padding: '15px',
                            paddingLeft: '22px',
                            fontSize: '12px',
                            lineHeight: 1.5,
                            whiteSpace: 'pre-wrap',
                            wordWrap: 'break-word',
                            overflow: 'hidden',
                            mixBlendMode: 'multiply',
                        }}
                    />
                )}
            </div>
        );
    }, [node?.details?.content, highlightStyle, isDark, searchTerm, currentMatchIndex, searchMatches, getLineAnnotation]);

    // Alternative: Custom SQL renderer with search and annotations
    const renderCustomSQL = useCallback(() => {
        const content = node?.details?.content || '-- No content found.';
        const lines = content.split('\n');

        return (
            <div ref={sqlContentRef} style={{
                fontFamily: "'Fira Code', 'Cascadia Code', 'JetBrains Mono', monospace",
                fontSize: '12px',
                lineHeight: '1.6',
                overflow: 'auto',
                background: isDark ? '#0d0d0d' : '#f7f6f3',
                padding: '12px 0',
                counterReset: 'line',
            }}>
                {lines.map((line, i) => {
                    const annotation = getLineAnnotation(line);

                    // Highlight search matches in line
                    let lineContent;
                    if (searchTerm && line.toLowerCase().includes(searchTerm.toLowerCase())) {
                        const parts = [];
                        let remaining = line;
                        let globalOffset = lines.slice(0, i).join('\n').length + (i > 0 ? 1 : 0);
                        let localIdx = 0;

                        while (remaining.length > 0) {
                            const matchIdx = remaining.toLowerCase().indexOf(searchTerm.toLowerCase());
                            if (matchIdx === -1) {
                                parts.push(<span key={`t-${localIdx}`}>{remaining}</span>);
                                break;
                            }
                            if (matchIdx > 0) {
                                parts.push(<span key={`t-${localIdx}`}>{remaining.substring(0, matchIdx)}</span>);
                            }
                            const globalMatchPos = globalOffset + (line.length - remaining.length) + matchIdx;
                            const matchNumber = searchMatches.indexOf(globalMatchPos);
                            const isCurrent = matchNumber === currentMatchIndex;

                            parts.push(
                                <mark
                                    key={`m-${localIdx}`}
                                    className="search-highlight"
                                    style={{
                                        background: isCurrent ? '#e2b714' : 'rgba(226, 183, 20, 0.35)',
                                        color: isCurrent ? '#000' : 'inherit',
                                        borderRadius: '2px',
                                        padding: '0 1px',
                                        outline: isCurrent ? '2px solid #e2b714' : 'none',
                                    }}
                                >
                                    {remaining.substring(matchIdx, matchIdx + searchTerm.length)}
                                </mark>
                            );
                            remaining = remaining.substring(matchIdx + searchTerm.length);
                            localIdx++;
                        }
                        lineContent = parts;
                    } else {
                        lineContent = highlightSQLSyntax(line, isDark);
                    }

                    return (
                        <div
                            key={i}
                            style={{
                                display: 'flex',
                                borderLeft: annotation ? `3px solid ${annotation.color}` : '3px solid transparent',
                                background: annotation ? `${annotation.color}08` : 'transparent',
                                padding: '0 12px 0 0',
                                transition: 'background 0.15s',
                            }}
                        >
                            <span style={{
                                minWidth: '40px',
                                textAlign: 'right',
                                paddingRight: '12px',
                                color: 'var(--text-tertiary)',
                                fontSize: '10px',
                                opacity: 0.5,
                                userSelect: 'none',
                                paddingTop: '1px',
                            }}>
                                {i + 1}
                            </span>
                            <span style={{ flex: 1, paddingLeft: '4px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                {lineContent}
                            </span>
                            {annotation && (
                                <span style={{
                                    fontSize: '8px',
                                    fontWeight: 700,
                                    color: annotation.color,
                                    opacity: 0.7,
                                    letterSpacing: '0.05em',
                                    alignSelf: 'center',
                                    marginLeft: '8px',
                                    flexShrink: 0,
                                }}>
                                    {annotation.label}
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>
        );
    }, [node?.details?.content, isDark, searchTerm, currentMatchIndex, searchMatches, getLineAnnotation]);

    if (!node) return null;

    // Annotation color presets
    const colorPresets = [
        '#60a5fa', '#a78bfa', '#f472b6', '#fb923c',
        '#fbbf24', '#34d399', '#2dd4bf', '#94a3b8',
        '#ef4444', '#8b5cf6'
    ];

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

                        {/* Color Customization */}
                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Color</label>
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                                {/* None/default option */}
                                <button
                                    onClick={() => onUpdateNode(node.id, { customColor: null })}
                                    style={{
                                        width: '24px', height: '24px', borderRadius: '6px',
                                        border: !node.customColor ? '2px solid var(--text-primary)' : '1px solid var(--border-default)',
                                        background: 'var(--surface-primary)',
                                        cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '10px', color: 'var(--text-tertiary)',
                                        transition: 'all 0.15s'
                                    }}
                                    title="Default"
                                >
                                    ∅
                                </button>
                                {colorPresets.map(color => (
                                    <button
                                        key={color}
                                        onClick={() => onUpdateNode(node.id, { customColor: color })}
                                        style={{
                                            width: '24px', height: '24px', borderRadius: '6px',
                                            background: color,
                                            border: node.customColor === color ? '2px solid var(--text-primary)' : '2px solid transparent',
                                            cursor: 'pointer',
                                            transition: 'all 0.15s',
                                            boxShadow: node.customColor === color ? 'var(--shadow-sm)' : 'none',
                                        }}
                                        title={color}
                                    />
                                ))}
                                <input
                                    type="color"
                                    value={node.customColor || '#60a5fa'}
                                    onChange={(e) => onUpdateNode(node.id, { customColor: e.target.value })}
                                    style={{
                                        width: '24px', height: '24px', borderRadius: '6px',
                                        border: '1px solid var(--border-default)',
                                        cursor: 'pointer', padding: 0,
                                        background: 'transparent'
                                    }}
                                    title="Custom color"
                                />
                            </div>
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

                                {/* Tag Editor */}
                                <div style={{ marginBottom: '16px' }}>
                                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        <Tag size={12} /> Tag
                                    </div>
                                    {isEditingTag ? (
                                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                            <input
                                                type="text"
                                                value={tagInput}
                                                onChange={(e) => setTagInput(e.target.value)}
                                                placeholder="Enter tag..."
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        onUpdateNode(node.id, { tag: tagInput || null });
                                                        setIsEditingTag(false);
                                                    }
                                                    if (e.key === 'Escape') {
                                                        setTagInput(node.tag || '');
                                                        setIsEditingTag(false);
                                                    }
                                                }}
                                                style={{
                                                    flex: 1,
                                                    background: 'var(--surface-primary)',
                                                    border: '1px solid var(--border-default)',
                                                    color: 'var(--text-primary)',
                                                    padding: '6px 10px',
                                                    borderRadius: '6px',
                                                    fontSize: '12px',
                                                    outline: 'none'
                                                }}
                                                autoFocus
                                            />
                                            <button
                                                onClick={() => {
                                                    onUpdateNode(node.id, { tag: tagInput || null });
                                                    setIsEditingTag(false);
                                                }}
                                                style={{ background: 'var(--status-success)', color: 'white', border: 'none', borderRadius: '6px', padding: '4px', cursor: 'pointer', display: 'flex' }}
                                                title="Save"
                                            >
                                                <Check size={14} />
                                            </button>
                                            {node.tag && (
                                                <button
                                                    onClick={() => {
                                                        onUpdateNode(node.id, { tag: null });
                                                        setTagInput('');
                                                        setIsEditingTag(false);
                                                    }}
                                                    style={{ background: 'var(--status-error)', color: 'white', border: 'none', borderRadius: '6px', padding: '4px', cursor: 'pointer', display: 'flex' }}
                                                    title="Remove tag"
                                                >
                                                    <X size={14} />
                                                </button>
                                            )}
                                            <button
                                                onClick={() => { setTagInput(node.tag || ''); setIsEditingTag(false); }}
                                                style={{ background: 'var(--interactive-active)', color: 'var(--text-primary)', border: 'none', borderRadius: '6px', padding: '4px', cursor: 'pointer', display: 'flex' }}
                                                title="Cancel"
                                            >
                                                <XIcon size={14} />
                                            </button>
                                        </div>
                                    ) : (
                                        <div
                                            onClick={() => setIsEditingTag(true)}
                                            style={{
                                                fontSize: '12px',
                                                color: node.tag ? 'var(--text-primary)' : 'var(--text-tertiary)',
                                                padding: '6px 10px',
                                                background: 'var(--surface-primary)',
                                                borderRadius: '8px',
                                                border: '1px solid var(--border-default)',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                transition: 'border-color 0.15s',
                                            }}
                                        >
                                            <span>{node.tag || 'Click to add tag...'}</span>
                                            <Edit2 size={11} style={{ opacity: 0.5 }} />
                                        </div>
                                    )}
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

                                {/* Impact Analysis Button */}
                                {onImpactAnalysis && node.type !== 'annotation' && (node.details?.id || node.id) && (
                                    <div style={{ marginBottom: '16px' }}>
                                        <button
                                            onClick={() => onImpactAnalysis(node)}
                                            style={{
                                                width: '100%',
                                                padding: '10px 14px',
                                                background: 'var(--surface-primary)',
                                                border: '1px solid var(--border-default)',
                                                borderRadius: '10px',
                                                color: 'var(--text-primary)',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '10px',
                                                fontSize: '12px',
                                                fontWeight: 600,
                                                transition: 'all 0.15s ease',
                                            }}
                                            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent-primary)'; e.currentTarget.style.background = 'var(--interactive-hover)'; }}
                                            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.background = 'var(--surface-primary)'; }}
                                        >
                                            <AlertTriangle size={15} style={{ color: 'var(--status-warning)' }} />
                                            <span>Impact Analysis</span>
                                            {(node.downstreamCount || node.details?.downstreamCount) > 0 && (
                                                <span style={{
                                                    marginLeft: 'auto',
                                                    fontSize: '10px',
                                                    fontWeight: 700,
                                                    background: 'rgba(96, 165, 250, 0.12)',
                                                    color: '#60a5fa',
                                                    padding: '2px 8px',
                                                    borderRadius: '4px',
                                                    display: 'flex', alignItems: 'center', gap: '3px',
                                                }}>
                                                    <ArrowRight size={10} /> {node.downstreamCount || 0} downstream
                                                </span>
                                            )}
                                        </button>
                                    </div>
                                )}

                                {/* Schema Preview */}
                                <SchemaPreview content={node.details?.content} isDark={isDark} columnConsumers={node.details?.column_consumers} />

                                {/* Business Rules */}
                                <BusinessRules rules={node.details?.business_rules} isDark={isDark} />

                                {/* Complexity Breakdown */}
                                <ComplexityBreakdown complexity={node.details?.complexity} isDark={isDark} />

                                {/* SQL Content Header + Search */}
                                <div style={{ marginBottom: '10px' }}>
                                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>SQL Content</div>

                                    {/* Search Bar */}
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        padding: '6px 10px',
                                        background: 'var(--surface-primary)',
                                        border: '1px solid var(--border-default)',
                                        borderRadius: '8px',
                                        marginBottom: '8px',
                                    }}>
                                        <Search size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                                        <input
                                            type="text"
                                            value={searchTerm}
                                            onChange={(e) => { setSearchTerm(e.target.value); setCurrentMatchIndex(0); }}
                                            placeholder="Search in SQL..."
                                            style={{
                                                flex: 1,
                                                background: 'transparent',
                                                border: 'none',
                                                color: 'var(--text-primary)',
                                                fontSize: '12px',
                                                outline: 'none',
                                            }}
                                        />
                                        {searchTerm && (
                                            <>
                                                <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                                                    {searchMatches.length > 0 ? `${currentMatchIndex + 1}/${searchMatches.length}` : '0/0'}
                                                </span>
                                                <button
                                                    onClick={() => setCurrentMatchIndex(prev => prev > 0 ? prev - 1 : searchMatches.length - 1)}
                                                    disabled={searchMatches.length === 0}
                                                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-secondary)', display: 'flex' }}
                                                    title="Previous match"
                                                >
                                                    <ArrowUp size={12} />
                                                </button>
                                                <button
                                                    onClick={() => setCurrentMatchIndex(prev => prev < searchMatches.length - 1 ? prev + 1 : 0)}
                                                    disabled={searchMatches.length === 0}
                                                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-secondary)', display: 'flex' }}
                                                    title="Next match"
                                                >
                                                    <ArrowDown size={12} />
                                                </button>
                                                <button
                                                    onClick={() => { setSearchTerm(''); setCurrentMatchIndex(0); }}
                                                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-secondary)', display: 'flex' }}
                                                    title="Clear"
                                                >
                                                    <X size={12} />
                                                </button>
                                            </>
                                        )}
                                    </div>

                                    {/* Line Annotation Legend */}
                                    <div style={{ display: 'flex', gap: '12px', marginBottom: '4px' }}>
                                        {[
                                            { color: '#60a5fa', label: 'FROM' },
                                            { color: '#a78bfa', label: 'JOIN' },
                                            { color: '#fbbf24', label: 'Reference' },
                                        ].map(item => (
                                            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '9px', color: 'var(--text-tertiary)' }}>
                                                <div style={{ width: '3px', height: '10px', background: item.color, borderRadius: '1px' }} />
                                                {item.label}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div style={{
                                    border: '1px solid var(--border-default)',
                                    borderRadius: '10px',
                                    overflow: 'hidden'
                                }}>
                                    {renderCustomSQL()}
                                </div>
                            </>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

// Simple SQL syntax highlighter for inline rendering
function highlightSQLSyntax(line, isDark) {
    const keywords = /\b(SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|FULL|CROSS|ON|AND|OR|NOT|IN|EXISTS|BETWEEN|LIKE|IS|NULL|AS|CASE|WHEN|THEN|ELSE|END|GROUP|BY|ORDER|HAVING|LIMIT|OFFSET|UNION|ALL|DISTINCT|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|VIEW|DROP|ALTER|INDEX|IF|REPLACE|WITH|RECURSIVE|OVER|PARTITION|ROW_NUMBER|RANK|DENSE_RANK|LAG|LEAD|FIRST_VALUE|LAST_VALUE|COUNT|SUM|AVG|MIN|MAX|CAST|COALESCE|NULLIF|EXTRACT|DATE|TIMESTAMP|INTERVAL|TRUE|FALSE|ASC|DESC|TEMPORARY|TEMP|MATERIALIZED|MERGE|USING|MATCHED|DECLARE|BEGIN|RETURNS|RETURN|FUNCTION|PROCEDURE|CALL|EXECUTE|GRANT|REVOKE|EXCEPT|INTERSECT|FETCH|NEXT|ROWS|ONLY|QUALIFY|UNNEST|ARRAY|STRUCT|PIVOT|UNPIVOT|TABLESAMPLE|FORMAT|SAFE_CAST|IFNULL|IFF|NVL|CONCAT|TRIM|SUBSTRING|LENGTH|UPPER|LOWER|CURRENT_DATE|CURRENT_TIMESTAMP)\b/gi;
    const strings = /('(?:[^'\\]|\\.)*')/g;
    const comments = /(--.*$)/gm;
    const numbers = /\b(\d+(?:\.\d+)?)\b/g;

    const parts = [];
    let lastIndex = 0;
    const tokens = [];

    // Tokenize comments first (highest priority)
    let match;
    const commentRegex = /(--.*$)/gm;
    while ((match = commentRegex.exec(line)) !== null) {
        tokens.push({ start: match.index, end: match.index + match[0].length, type: 'comment', text: match[0] });
    }

    // Tokenize strings
    const stringRegex = /('(?:[^'\\]|\\.)*')/g;
    while ((match = stringRegex.exec(line)) !== null) {
        const overlaps = tokens.some(t => match.index >= t.start && match.index < t.end);
        if (!overlaps) {
            tokens.push({ start: match.index, end: match.index + match[0].length, type: 'string', text: match[0] });
        }
    }

    // Sort by start position
    tokens.sort((a, b) => a.start - b.start);

    // Build parts
    let pos = 0;
    tokens.forEach((token, idx) => {
        if (token.start > pos) {
            // Process gap for keywords/numbers
            const gap = line.substring(pos, token.start);
            parts.push(...highlightGap(gap, `g-${idx}`, isDark));
        }
        const color = token.type === 'comment'
            ? (isDark ? '#6a737d' : '#6a737d')
            : (isDark ? '#ce9178' : '#a31515');
        parts.push(<span key={`t-${idx}`} style={{ color, fontStyle: token.type === 'comment' ? 'italic' : 'normal' }}>{token.text}</span>);
        pos = token.end;
    });

    if (pos < line.length) {
        parts.push(...highlightGap(line.substring(pos), 'end', isDark));
    }

    return parts.length > 0 ? parts : [<span key="empty">{line}</span>];
}

function highlightGap(text, prefix, isDark) {
    const parts = [];
    const regex = /(\b(?:SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|FULL|CROSS|ON|AND|OR|NOT|IN|EXISTS|BETWEEN|LIKE|IS|NULL|AS|CASE|WHEN|THEN|ELSE|END|GROUP|BY|ORDER|HAVING|LIMIT|OFFSET|UNION|ALL|DISTINCT|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|VIEW|DROP|ALTER|INDEX|IF|REPLACE|WITH|RECURSIVE|OVER|PARTITION|ROW_NUMBER|RANK|DENSE_RANK|LAG|LEAD|FIRST_VALUE|LAST_VALUE|COUNT|SUM|AVG|MIN|MAX|CAST|COALESCE|NULLIF|EXTRACT|DATE|TIMESTAMP|INTERVAL|TRUE|FALSE|ASC|DESC|TEMPORARY|TEMP|MATERIALIZED|MERGE|USING|MATCHED|DECLARE|BEGIN|RETURNS|RETURN|FUNCTION|PROCEDURE|CALL|EXECUTE|GRANT|REVOKE|EXCEPT|INTERSECT|FETCH|NEXT|ROWS|ONLY|QUALIFY|UNNEST|ARRAY|STRUCT|PIVOT|UNPIVOT|TABLESAMPLE|FORMAT|SAFE_CAST|IFNULL|IFF|NVL|CONCAT|TRIM|SUBSTRING|LENGTH|UPPER|LOWER|CURRENT_DATE|CURRENT_TIMESTAMP)\b)|(\b\d+(?:\.\d+)?\b)/gi;

    let lastIdx = 0;
    let m;
    let partIdx = 0;

    while ((m = regex.exec(text)) !== null) {
        if (m.index > lastIdx) {
            parts.push(<span key={`${prefix}-${partIdx++}`} style={{ color: isDark ? '#d4d4d4' : '#333' }}>{text.substring(lastIdx, m.index)}</span>);
        }
        if (m[1]) {
            // keyword
            parts.push(<span key={`${prefix}-${partIdx++}`} style={{ color: isDark ? '#569cd6' : '#0000ff', fontWeight: 600 }}>{m[0]}</span>);
        } else if (m[2]) {
            // number
            parts.push(<span key={`${prefix}-${partIdx++}`} style={{ color: isDark ? '#b5cea8' : '#098658' }}>{m[0]}</span>);
        }
        lastIdx = m.index + m[0].length;
    }

    if (lastIdx < text.length) {
        parts.push(<span key={`${prefix}-${partIdx}`} style={{ color: isDark ? '#d4d4d4' : '#333' }}>{text.substring(lastIdx)}</span>);
    }

    return parts;
}

// Schema Preview sub-component
const SchemaPreview = ({ content, isDark, columnConsumers = {} }) => {
    const [isOpen, setIsOpen] = useState(false);

    const columns = useMemo(() => {
        if (!content) return [];

        // 1. DDL with column definitions: CREATE TABLE name (col1 TYPE, col2 TYPE)
        const ddlMatch = content.match(/CREATE\s+(?:OR\s+REPLACE\s+)?(?:TABLE|VIEW)\s+[^(]+\(([^)]+)\)(?!\s*;?\s*$|\s+AS\b)/is);
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

        // 2. CTAS / VIEW AS SELECT
        const ctasMatch = content.match(/CREATE\s+(?:OR\s+REPLACE\s+)?(?:TABLE|VIEW)\s+[\w.`]+\s+AS\s+SELECT\s+([\s\S]+?)\s+FROM\b/im);
        if (ctasMatch) {
            return parseSelectColumns(ctasMatch[1]);
        }

        // 3. WITH cte AS (...) SELECT ... FROM
        const withSelectMatch = content.match(/\)\s*SELECT\s+([\s\S]+?)\s+FROM\b/im);
        if (withSelectMatch) {
            const cols = parseSelectColumns(withSelectMatch[1]);
            if (cols.length > 0) return cols;
        }

        // 4. Standalone SELECT ... FROM
        const selectMatch = content.match(/(?:^|\b)SELECT\s+([\s\S]+?)\s+FROM\b/im);
        if (selectMatch) {
            return parseSelectColumns(selectMatch[1]);
        }

        return [];
    }, [content]);

    // Merge column consumer data
    const columnsWithConsumers = useMemo(() => {
        // Build a flat set of all consumed column names from all source tables
        const consumerMap = {};
        Object.values(columnConsumers || {}).forEach(colEntries => {
            if (Array.isArray(colEntries)) {
                // This case shouldn't happen now, but handle legacy
            }
        });
        // columnConsumers is { col_name: [{node, label}] }
        return columns.map(col => ({
            ...col,
            consumers: columnConsumers[col.name] || []
        }));
    }, [columns, columnConsumers]);

    if (columnsWithConsumers.length === 0) return null;

    const totalConsumed = columnsWithConsumers.filter(c => c.consumers.length > 0).length;

    return (
        <div style={{ marginBottom: '16px' }}>
            <div onClick={() => setIsOpen(!isOpen)} style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', userSelect: 'none', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <Columns size={12} />
                Schema ({columnsWithConsumers.length} columns)
                {totalConsumed > 0 && (
                    <span style={{
                        marginLeft: '6px',
                        fontSize: '9px',
                        fontWeight: 700,
                        background: 'rgba(96, 165, 250, 0.12)',
                        color: '#60a5fa',
                        padding: '1px 6px',
                        borderRadius: '4px',
                    }}>
                        {totalConsumed} used downstream
                    </span>
                )}
            </div>
            {isOpen && (
                <div style={{ border: '1px solid var(--border-default)', borderRadius: '10px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                        <thead>
                            <tr style={{ background: 'var(--surface-primary)' }}>
                                <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-primary)', fontWeight: 600, borderBottom: '1px solid var(--border-default)' }}>Column</th>
                                <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-primary)', fontWeight: 600, borderBottom: '1px solid var(--border-default)' }}>Type</th>
                                <th style={{ padding: '6px 10px', textAlign: 'right', color: 'var(--text-primary)', fontWeight: 600, borderBottom: '1px solid var(--border-default)' }}>Used By</th>
                            </tr>
                        </thead>
                        <tbody>
                            {columnsWithConsumers.map((col, i) => (
                                <tr key={i} style={{ borderBottom: i < columnsWithConsumers.length - 1 ? '1px solid var(--border-default)' : 'none' }}>
                                    <td style={{ padding: '5px 10px', color: 'var(--text-primary)', fontFamily: 'monospace', fontWeight: 500 }}>{col.name}</td>
                                    <td style={{ padding: '5px 10px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{col.type}</td>
                                    <td style={{ padding: '5px 10px', textAlign: 'right' }}>
                                        {col.consumers.length > 0 ? (
                                            <span
                                                title={col.consumers.map(c => c.label).join(', ')}
                                                style={{
                                                    fontSize: '9px',
                                                    fontWeight: 700,
                                                    background: col.consumers.length > 3 ? 'rgba(239, 68, 68, 0.12)' : 'rgba(96, 165, 250, 0.12)',
                                                    color: col.consumers.length > 3 ? '#ef4444' : '#60a5fa',
                                                    padding: '2px 6px',
                                                    borderRadius: '4px',
                                                    cursor: 'help',
                                                }}
                                            >
                                                {col.consumers.length} {col.consumers.length === 1 ? 'model' : 'models'}
                                            </span>
                                        ) : (
                                            <span style={{ fontSize: '9px', color: 'var(--text-tertiary)' }}>—</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

// Parse SELECT column list into {name, type} entries
function parseSelectColumns(selectClause) {
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
}

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
