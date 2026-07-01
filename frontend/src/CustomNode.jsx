import React, { memo } from 'react';
import { Handle, Position, NodeToolbar } from '@xyflow/react';
import { Database, Table, FileText, Layers, Eye, Globe, EyeOff, FolderMinus, ScanEye, MousePointerClick, Maximize2, Minimize2, AlertTriangle } from 'lucide-react';

const CustomNode = ({ id, data }) => {
    const { label, layer, details, theme = 'dark', styleMode = 'full', onContextMenu } = data;
    // Inject id into data for easier access if needed, or just use id prop
    data.id = id;
    const isDark = theme === 'dark';
    const isView = details?.type === 'view';

    const getLayerColor = (layer) => {
        switch (layer) {
            case 'bronze': return '#cd7f32';
            case 'silver': return '#A0A0A0';
            case 'gold': return '#FFD700';
            case 'external': return '#ff9f1c';
            case 'cte': return '#E91E63';
            case 'other': return '#4CA1AF';
            default: return '#4CA1AF';
        }
    };

    const getGradient = (layer) => {
        const palette = data.palette || 'standard';

        const colors = {
            standard: { bronze: '#8B4513', silver: '#708090', gold: '#DAA520', external: '#C06430', cte: '#E91E63', other: '#4CA1AF', default: '#2F4F4F' },
            vivid: { bronze: '#D4654A', silver: '#4A9CC7', gold: '#E09E3A', external: '#D47A3A', cte: '#C45B8C', other: '#3A9E98', default: '#7B6DB5' },
            pastel: { bronze: '#DCC1B0', silver: '#B8C5D0', gold: '#F0E4B8', external: '#E8D0A8', cte: '#DAAFC0', other: '#A8D0D8', default: '#C8B8D8' },
            linear: { bronze: '#B08968', silver: '#8E99A4', gold: '#D4A843', external: '#CC8B5E', cte: '#C77092', other: '#6B9DAD', default: '#7A8B8B' }
        };

        const selectedPalette = colors[palette] || colors.standard;

        switch (layer) {
            case 'bronze': return selectedPalette.bronze;
            case 'silver': return selectedPalette.silver;
            case 'gold': return selectedPalette.gold;
            case 'external': return selectedPalette.external;
            case 'cte': return selectedPalette.cte;
            case 'other': return selectedPalette.other;
            default: return selectedPalette.default;
        }
    };

    const color = getGradient(layer);

    // Determine Text Color: Dark for Pastel+Full, White otherwise (unless minimal)
    let textColor = 'white';
    if (styleMode === 'full' && data.palette === 'pastel') {
        textColor = '#333';
    } else if (styleMode === 'border') {
        textColor = 'var(--text-primary)';
    }

    const { project = '', dataset = '' } = details || {};

    const getIcon = (layer, iconColor) => {
        if (details?.type === 'view') {
            return <Eye size={16} color={iconColor} />;
        }
        switch (layer) {
            case 'bronze': return <Database size={16} color={iconColor} />;
            case 'silver': return <Table size={16} color={iconColor} />;
            case 'gold': return <Layers size={16} color={iconColor} />;
            case 'external': return <Globe size={16} color={iconColor} />;
            case 'cte': return <FileText size={16} color={iconColor} style={{ fontStyle: 'italic' }} />;
            default: return <FileText size={16} color={iconColor} />;
        }
    }

    // Dynamic Styles
    const containerStyle = styleMode === 'full' ? {
        background: color,
        border: isView ? '1px dashed rgba(255,255,255,0.3)' : '1px solid rgba(255,255,255,0.08)',
        color: textColor
    } : {
        background: 'var(--surface-elevated)',
        border: isView ? `2px dashed ${color}` : `2px solid ${color}`,
        color: textColor
    };

    const iconColor = styleMode === 'full' ? textColor : color;

    // Git blast-radius highlight: edited models glow strongly, downstream
    // (impacted) models get a softer accent ring.
    const gitStatus = data.gitStatus;
    const gitGlow = gitStatus === 'changed'
        ? '0 0 0 2px var(--accent-primary), 0 0 18px 3px rgba(124,106,239,0.55)'
        : gitStatus === 'downstream'
            ? '0 0 0 2px rgba(124,106,239,0.55)'
            : null;

    return (
        <div
            onContextMenu={(e) => {
                e.preventDefault();
                if (onContextMenu) onContextMenu(e, data);
            }}
            style={{
                ...containerStyle,
                padding: '12px 20px',
                borderRadius: isView ? '20px' : '10px',
                minWidth: '220px',
                boxShadow: gitGlow || 'var(--shadow-md)',
                fontFamily: "'Inter', sans-serif",
                position: 'relative',
                cursor: 'context-menu',
                transition: 'box-shadow 0.2s ease, transform 0.15s ease'
            }}>
            <Handle type="target" position={Position.Left} style={{ background: 'var(--text-secondary)', width: 8, height: 8, border: '2px solid var(--surface-primary)' }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                {getIcon(layer, iconColor)}
                <div style={{
                    fontSize: '9px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    opacity: 0.7,
                    fontWeight: 600,
                    color: styleMode === 'border' ? color : 'inherit'
                }}>
                    {layer.toUpperCase()} {isView ? '(VIEW)' : ''}
                </div>
            </div>

            <div style={{ fontSize: '14px', fontWeight: '600', textShadow: (styleMode === 'full' && data.palette !== 'pastel') ? '0 1px 2px rgba(0,0,0,0.2)' : 'none', marginBottom: '4px', letterSpacing: '-0.01em' }}>
                {label}
            </div>

            {/* Project & Dataset Metadata */}
            {(details?.project !== 'default' || details?.dataset !== 'default') && (
                <div style={{ fontSize: '10px', opacity: 0.6, marginBottom: '6px', fontStyle: 'italic' }}>
                    {details?.project !== 'default' ? `${details?.project}.` : ''}{details?.dataset !== 'default' ? details?.dataset : ''}
                </div>
            )}

            {/* Dependency Count / Source Label */}
            {data.showCounts !== false && (
                data.incomingCount > 0 ? (
                    <div style={{ fontSize: '9px', marginTop: '4px', opacity: 0.6, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span>Direct: {data.incomingCount}</span>
                        <span>Nested: {data.nestedCount !== undefined ? data.nestedCount : '-'}</span>
                    </div>
                ) : (
                    <div style={{ fontSize: '9px', marginTop: '4px', opacity: 0.5 }}>Source</div>
                )
            )}

            {/* Complexity Score Badge */}
            {data.showComplexity !== false && details?.complexity?.score > 0 && (
                <div
                    title={`Complexity: ${details.complexity.score} (J:${details.complexity.joins} C:${details.complexity.ctes} S:${details.complexity.subqueries} F:${details.complexity.filters} CASE:${details.complexity.case_statements} A:${details.complexity.aggregations})`}
                    style={{
                        position: 'absolute',
                        top: '-8px',
                        right: '-8px',
                        background: details.complexity.score <= 3 ? 'var(--status-success)'
                            : details.complexity.score <= 7 ? 'var(--status-warning)'
                                : details.complexity.score <= 12 ? '#e67e22'
                                    : 'var(--status-error)',
                        color: 'var(--text-inverse)',
                        fontSize: '9px',
                        fontWeight: 700,
                        width: '22px',
                        height: '22px',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: 'var(--shadow-md)',
                        border: '2px solid var(--surface-primary)',
                        zIndex: 2
                    }}
                >
                    {details.complexity.score}
                </div>
            )}

            {/* Syntax Warning Badge */}
            {details?.syntax_warnings?.length > 0 && (
                <div
                    title={`${details.syntax_warnings.length} syntax issue(s)`}
                    style={{
                        position: 'absolute',
                        top: '-8px',
                        left: '-8px',
                        background: 'var(--status-warning)',
                        color: 'var(--text-inverse)',
                        width: '22px',
                        height: '22px',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: 'var(--shadow-md)',
                        border: '2px solid var(--surface-primary)',
                        zIndex: 2
                    }}
                >
                    <AlertTriangle size={12} />
                </div>
            )}

            {/* Hover Toolbar */}
            {onContextMenu && ( // Only show if interactive
                <div style={{
                    position: 'absolute',
                    bottom: '100%', // Position above the node
                    left: '50%',
                    transform: 'translateX(-50%)',
                    paddingBottom: '12px', // Invisible bridge area
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    opacity: 0,
                    pointerEvents: 'none',
                    transition: 'all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1)',
                    zIndex: 100,
                }} className="node-toolbar">
                    <div style={{
                        background: 'var(--surface-tooltip)',
                        backdropFilter: 'blur(16px)',
                        padding: '6px',
                        borderRadius: '10px',
                        boxShadow: 'var(--shadow-lg)',
                        border: '1px solid var(--border-default)',
                        display: 'flex',
                        gap: '4px',
                        minWidth: 'max-content'
                    }}>
                        {/* Hide Self */}
                        <ToolbarButton
                            icon={<EyeOff size={14} />}
                            label="Hide"
                            onClick={() => data.onAction('hide', data.id)}
                            isDark={isDark}
                        />
                        {/* Hide Ancestors */}
                        <ToolbarButton
                            icon={<FolderMinus size={14} />}
                            label="Hide Left"
                            onClick={() => data.onAction('hideTree', data.id)}
                            isDark={isDark}
                        />
                        <div style={{ width: '1px', background: 'var(--border-emphasis)', margin: '0 2px' }} />

                        {/* Show Only Tree (Focus) */}
                        <ToolbarButton
                            icon={<ScanEye size={14} />}
                            label="Focus Tree"
                            onClick={() => data.onAction('onlyTree', data.id)}
                            isDark={isDark}
                        />
                        {/* Select Full Tree */}
                        <ToolbarButton
                            icon={<MousePointerClick size={14} />}
                            label="Select Tree"
                            onClick={() => data.onAction('selectTree', data.id)}
                            isDark={isDark}
                        />

                        {/* Expand / Collapse */}
                        <div style={{ width: '1px', background: 'var(--border-emphasis)', margin: '0 2px' }} />
                        {data.expandedNodes && data.expandedNodes[data.id] ? (
                            <ToolbarButton
                                icon={<Minimize2 size={14} />}
                                label="Collapse"
                                onClick={() => data.onAction('collapse', data.id)}
                                isDark={isDark}
                            />
                        ) : (
                            <>
                                <ToolbarButton
                                    icon={<Maximize2 size={14} />}
                                    label="All"
                                    onClick={() => data.onAction('expand', data.id)}
                                    isDark={isDark}
                                />
                                <ToolbarButton
                                    icon={<Globe size={14} />}
                                    label="Externals"
                                    onClick={() => data.onAction('expandExternal', data.id)}
                                    isDark={isDark}
                                />
                                <ToolbarButton
                                    icon={<FileText size={14} />}
                                    label="CTEs"
                                    onClick={() => data.onAction('expandCte', data.id)}
                                    isDark={isDark}
                                />
                            </>
                        )}
                    </div>
                </div>
            )}

            <style>
                {`
                .react-flow__node-custom:hover .node-toolbar {
                    opacity: 1 !important;
                    pointer-events: auto !important;
                }
                `}
            </style>

            {/* Tag Badge */}
            {data.tag && data.showTags !== false && (
                <div style={{
                    position: 'absolute',
                    bottom: '-10px',
                    left: '8px',
                    background: isDark ? 'var(--surface-tooltip)' : 'var(--surface-elevated)',
                    backdropFilter: 'blur(8px)',
                    color: styleMode === 'full' ? 'var(--text-primary)' : color,
                    fontSize: '8px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '4px',
                    border: `1px solid ${styleMode === 'full' ? 'rgba(255,255,255,0.15)' : `${color}40`}`,
                    letterSpacing: '0.03em',
                    maxWidth: '120px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    boxShadow: 'var(--shadow-sm)',
                    zIndex: 3,
                    textTransform: 'uppercase',
                }}>
                    {data.tag}
                </div>
            )}

            {/* Git change / impact badge */}
            {gitStatus && (
                <div style={{
                    position: 'absolute',
                    top: '-10px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: gitStatus === 'changed' ? 'var(--accent-primary)' : 'var(--surface-tooltip)',
                    color: gitStatus === 'changed' ? 'var(--text-inverse)' : 'var(--accent-primary)',
                    border: gitStatus === 'changed' ? 'none' : '1px solid var(--accent-primary)',
                    fontSize: '8px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '6px',
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    boxShadow: 'var(--shadow-sm)',
                    zIndex: 4,
                    whiteSpace: 'nowrap',
                }}>
                    {gitStatus === 'changed' ? '● Changed' : 'Impacted'}
                </div>
            )}

            <Handle type="source" position={Position.Right} style={{ background: 'var(--text-secondary)', width: 8, height: 8, border: '2px solid var(--surface-primary)' }} />
        </div>
    );
};

const ToolbarButton = ({ icon, label, onClick, isDark }) => (
    <button
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        title={label}
        style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-primary)',
            padding: '6px',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.15s ease'
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--interactive-hover)'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
    >
        {icon}
        <span style={{ fontSize: '10px', marginLeft: '4px', fontWeight: 500 }}>{label}</span>
    </button>
);

// Custom equality: the parent rebuilds every node's `data` object (with fresh
// handler closures) on every refresh, which makes the default shallow `memo`
// re-render ALL nodes each time. Our handlers are stable useCallbacks that read
// from refs, so we can safely ignore their identity and only re-render when a
// visually-relevant field actually changes. This is the single biggest render
// win on large graphs.
const areEqual = (prev, next) => {
    if (prev.id !== next.id) return false;
    if (prev.selected !== next.selected) return false;
    if (prev.dragging !== next.dragging) return false;

    const a = prev.data || {};
    const b = next.data || {};

    // Handler presence toggles interactivity (toolbar / context menu)
    if (!!a.onContextMenu !== !!b.onContextMenu) return false;

    const scalarKeys = [
        'label', 'layer', 'theme', 'styleMode', 'palette',
        'showCounts', 'showComplexity', 'showTags', 'tag',
        'incomingCount', 'nestedCount', 'downstreamCount', 'gitStatus',
    ];
    for (const k of scalarKeys) {
        if (a[k] !== b[k]) return false;
    }

    const da = a.details || {};
    const db = b.details || {};
    if (da.type !== db.type) return false;
    if (da.project !== db.project) return false;
    if (da.dataset !== db.dataset) return false;
    if ((da.complexity && da.complexity.score) !== (db.complexity && db.complexity.score)) return false;
    if ((da.syntax_warnings ? da.syntax_warnings.length : 0) !== (db.syntax_warnings ? db.syntax_warnings.length : 0)) return false;

    // Expand/collapse state for THIS node changes its toolbar
    const ea = a.expandedNodes ? a.expandedNodes[prev.id] : undefined;
    const eb = b.expandedNodes ? b.expandedNodes[next.id] : undefined;
    if (ea !== eb) return false;

    return true;
};

export default memo(CustomNode, areEqual);
