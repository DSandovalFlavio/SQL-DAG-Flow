import React, { memo } from 'react';
import { Handle, Position, NodeToolbar } from '@xyflow/react';
import { Database, Table, FileText, Layers, Eye, Globe, EyeOff, FolderMinus, ScanEye, MousePointerClick } from 'lucide-react';

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
            case 'cte': return '#E91E63'; // Pink for CTEs
            case 'other': return '#4CA1AF'; // Teal for Other
            default: return '#4CA1AF';
        }
    };

    const getGradient = (layer) => {
        const palette = data.palette || 'standard';

        const colors = {
            standard: { bronze: '#8B4513', silver: '#708090', gold: '#DAA520', external: '#D35400', cte: '#E91E63', other: '#4CA1AF', default: '#2F4F4F' },
            vivid: { bronze: '#FF5722', silver: '#29B6F6', gold: '#FFEB3B', external: '#FF9800', cte: '#F50057', other: '#00BCD4', default: '#9C27B0' },
            pastel: { bronze: '#D7CCC8', silver: '#CFD8DC', gold: '#FFF9C4', external: '#FFE0B2', cte: '#F8BBD0', other: '#B2EBF2', default: '#E1BEE7' }
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

    const color = getGradient(layer); // Returns solid color from palette

    // Determine Text Color: Dark for Pastel+Full, White otherwise (unless minimal)
    let textColor = 'white';
    if (styleMode === 'full' && data.palette === 'pastel') {
        textColor = '#333';
    } else if (styleMode === 'border') {
        textColor = theme === 'dark' ? '#e0e0e0' : '#333';
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
        border: isView ? '1px dashed rgba(255,255,255,0.3)' : '1px solid rgba(255,255,255,0.1)',
        color: textColor
    } : {
        background: isDark ? '#1e1e1e' : '#ffffff',
        border: isView ? `2px dashed ${color}` : `2px solid ${color}`,
        color: textColor
    };

    const iconColor = styleMode === 'full' ? textColor : color;

    // Debugging
    // console.log('Node', label, 'showCounts:', data.showCounts);

    return (
        <div
            onContextMenu={(e) => {
                e.preventDefault();
                if (onContextMenu) onContextMenu(e, data);
            }}
            style={{
                ...containerStyle,
                padding: '12px 20px',
                borderRadius: isView ? '20px' : '12px',
                minWidth: '220px',
                boxShadow: isDark ? '0 4px 15px rgba(0,0,0,0.3)' : '0 4px 15px rgba(0,0,0,0.1)',
                fontFamily: "'Inter', sans-serif",
                position: 'relative',
                cursor: 'context-menu'
            }}>
            <Handle type="target" position={Position.Left} style={{ background: isDark ? '#fff' : '#555' }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                {getIcon(layer, iconColor)}
                <div style={{
                    fontSize: '9px',
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                    opacity: 0.8,
                    color: styleMode === 'border' ? color : 'inherit'
                }}>
                    {layer.toUpperCase()} {isView ? '(VIEW)' : ''}
                </div>
            </div>

            <div style={{ fontSize: '14px', fontWeight: '600', textShadow: (styleMode === 'full' && data.palette !== 'pastel') ? '0 1px 2px rgba(0,0,0,0.2)' : 'none', marginBottom: '4px' }}>
                {label}
            </div>

            {/* Project & Dataset Metadata */}
            {(details?.project !== 'default' || details?.dataset !== 'default') && (
                <div style={{ fontSize: '10px', opacity: 0.7, marginBottom: '6px', fontStyle: 'italic' }}>
                    {details?.project !== 'default' ? `${details?.project}.` : ''}{details?.dataset !== 'default' ? details?.dataset : ''}
                </div>
            )}

            {/* Dependency Count / Source Label */}
            {data.showCounts !== false && (
                data.incomingCount > 0 ? (
                    <div style={{ fontSize: '9px', marginTop: '4px', opacity: 0.7, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span>Direct: {data.incomingCount}</span>
                        <span>Nested: {data.nestedCount !== undefined ? data.nestedCount : '-'}</span>
                    </div>
                ) : (
                    <div style={{ fontSize: '9px', marginTop: '4px', opacity: 0.6 }}>Source</div>
                )
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
                        background: isDark ? 'rgba(30, 30, 30, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                        backdropFilter: 'blur(8px)',
                        padding: '6px',
                        borderRadius: '8px',
                        boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.4)' : '0 8px 32px rgba(0,0,0,0.15)',
                        border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.05)',
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
                        <div style={{ width: '1px', background: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)', margin: '0 2px' }} />

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

            <Handle type="source" position={Position.Right} style={{ background: isDark ? '#fff' : '#555' }} />
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
            color: isDark ? '#eee' : '#333',
            padding: '6px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.2s'
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
    >
        {icon}
        <span style={{ fontSize: '10px', marginLeft: '4px', fontWeight: 500 }}>{label}</span>
    </button>
);

export default memo(CustomNode);
