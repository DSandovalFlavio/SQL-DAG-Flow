import React from 'react';
import { AlignStartVertical, AlignStartHorizontal, AlignEndVertical, AlignEndHorizontal, AlignCenterVertical, AlignCenterHorizontal, Rows, Columns, ArrowDownToLine, ArrowRightToLine, X, GitCompareArrows, EyeOff } from 'lucide-react';

const SelectionToolbar = ({ selectedCount, onAlign, onClearSelection, onBatchLayerChange, onCompare, onHide, theme }) => {
    if (selectedCount < 2) return null;

    const buttonStyle = {
        background: 'transparent',
        border: 'none',
        color: 'var(--text-primary)',
        cursor: 'pointer',
        padding: '6px',
        borderRadius: '6px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background 0.15s ease'
    };

    const handleHover = (e) => e.currentTarget.style.background = 'var(--interactive-hover)';
    const handleLeave = (e) => e.currentTarget.style.background = 'transparent';

    return (
        <div style={{
            position: 'absolute',
            top: '70px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 999,
            background: 'var(--surface-tooltip)',
            backdropFilter: 'blur(16px)',
            border: '1px solid var(--border-default)',
            borderRadius: '14px',
            padding: '8px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: 'var(--shadow-lg)',
            animation: 'fadeIn 0.2s ease-out'
        }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginRight: '8px' }}>
                {selectedCount} selected
            </span>
            <div style={{ width: 1, height: 20, background: 'var(--border-emphasis)' }} />

            {/* Alignment buttons */}
            <button onClick={() => onAlign('left')} title="Align Left" style={buttonStyle} onMouseEnter={handleHover} onMouseLeave={handleLeave}>
                <AlignStartVertical size={16} />
            </button>
            <button onClick={() => onAlign('centerH')} title="Center Horizontal" style={buttonStyle} onMouseEnter={handleHover} onMouseLeave={handleLeave}>
                <AlignCenterVertical size={16} />
            </button>
            <button onClick={() => onAlign('right')} title="Align Right" style={buttonStyle} onMouseEnter={handleHover} onMouseLeave={handleLeave}>
                <AlignEndVertical size={16} />
            </button>
            <button onClick={() => onAlign('top')} title="Align Top" style={buttonStyle} onMouseEnter={handleHover} onMouseLeave={handleLeave}>
                <AlignStartHorizontal size={16} />
            </button>
            <button onClick={() => onAlign('centerV')} title="Center Vertical" style={buttonStyle} onMouseEnter={handleHover} onMouseLeave={handleLeave}>
                <AlignCenterHorizontal size={16} />
            </button>
            <button onClick={() => onAlign('bottom')} title="Align Bottom" style={buttonStyle} onMouseEnter={handleHover} onMouseLeave={handleLeave}>
                <AlignEndHorizontal size={16} />
            </button>

            <div style={{ width: 1, height: 20, background: 'var(--border-emphasis)' }} />

            {/* Distribution */}
            <button onClick={() => onAlign('distributeH')} title="Distribute Horizontal" style={buttonStyle} onMouseEnter={handleHover} onMouseLeave={handleLeave}>
                <Rows size={16} />
            </button>
            <button onClick={() => onAlign('distributeV')} title="Distribute Vertical" style={buttonStyle} onMouseEnter={handleHover} onMouseLeave={handleLeave}>
                <Columns size={16} />
            </button>

            {/* Compact */}
            <button onClick={() => onAlign('compactH')} title="Compact Horizontal" style={buttonStyle} onMouseEnter={handleHover} onMouseLeave={handleLeave}>
                <ArrowDownToLine size={16} />
            </button>
            <button onClick={() => onAlign('compactV')} title="Compact Vertical" style={buttonStyle} onMouseEnter={handleHover} onMouseLeave={handleLeave}>
                <ArrowRightToLine size={16} />
            </button>

            <div style={{ width: 1, height: 20, background: 'var(--border-emphasis)' }} />

            {selectedCount === 2 && onCompare && (
                <>
                    <button onClick={onCompare} title="Compare Nodes" style={{ ...buttonStyle, gap: '4px', fontSize: '12px', fontWeight: 600 }} onMouseEnter={handleHover} onMouseLeave={handleLeave}>
                        <GitCompareArrows size={16} /> Compare
                    </button>
                </>
            )}

            {/* Hide selected nodes */}
            {onHide && (
                <button onClick={onHide} title={`Hide ${selectedCount} nodes`} style={{ ...buttonStyle, gap: '4px', fontSize: '12px', fontWeight: 600 }} onMouseEnter={handleHover} onMouseLeave={handleLeave}>
                    <EyeOff size={16} /> Hide
                </button>
            )}

            <div style={{ width: 1, height: 20, background: 'var(--border-emphasis)' }} />
            {onBatchLayerChange && (
                <>
                    {['bronze', 'silver', 'gold'].map((layer) => {
                        const colors = { bronze: '#cd7f32', silver: '#708090', gold: '#FFD700' };
                        return (
                            <button
                                key={layer}
                                onClick={() => onBatchLayerChange(layer)}
                                title={`Set to ${layer}`}
                                style={{
                                    ...buttonStyle,
                                    width: 22, height: 22,
                                    background: colors[layer],
                                    borderRadius: '6px',
                                    color: layer === 'silver' ? '#fff' : '#000',
                                    fontSize: '10px', fontWeight: 700
                                }}
                            >
                                {layer.charAt(0).toUpperCase()}
                            </button>
                        );
                    })}
                    <div style={{ width: 1, height: 20, background: 'var(--border-emphasis)' }} />
                </>
            )}

            {/* Clear Selection */}
            <button onClick={onClearSelection} title="Clear Selection" style={{ ...buttonStyle, color: 'var(--text-secondary)' }} onMouseEnter={handleHover} onMouseLeave={handleLeave}>
                <X size={16} />
            </button>
        </div>
    );
};

export default SelectionToolbar;
