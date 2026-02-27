import React from 'react';
import { ChevronRight, Home, X } from 'lucide-react';

const BreadcrumbTrail = ({ history, onNavigate, onClear, theme }) => {
    if (!history || history.length === 0) return null;

    const layerColors = {
        bronze: '#cd7f32', silver: '#708090', gold: '#FFD700',
        external: '#ff9f1c', cte: '#E91E63', other: '#4CA1AF'
    };

    return (
        <div style={{
            position: 'absolute',
            top: '60px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 997,
            display: 'flex',
            alignItems: 'center',
            gap: '2px',
            padding: '5px 10px',
            background: 'var(--surface-elevated)',
            border: '1px solid var(--border-default)',
            borderRadius: '10px',
            backdropFilter: 'blur(12px)',
            boxShadow: 'var(--shadow-sm)',
            maxWidth: '70vw',
            overflow: 'hidden',
            animation: 'fadeIn 0.15s ease-out',
        }}>
            <Home size={12} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />

            {history.map((item, i) => (
                <React.Fragment key={`${item.id}-${i}`}>
                    <ChevronRight size={10} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                    <button
                        onClick={() => onNavigate(item, i)}
                        style={{
                            background: i === history.length - 1 ? 'var(--interactive-active)' : 'transparent',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '2px 8px',
                            color: i === history.length - 1 ? 'var(--text-primary)' : 'var(--text-secondary)',
                            fontWeight: i === history.length - 1 ? 600 : 400,
                            fontSize: '11px',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            transition: 'all 0.15s',
                        }}
                    >
                        <div style={{
                            width: 6, height: 6, borderRadius: '50%',
                            background: layerColors[item.layer] || '#888',
                            flexShrink: 0,
                        }} />
                        {item.label}
                    </button>
                </React.Fragment>
            ))}

            <button
                onClick={onClear}
                style={{
                    background: 'transparent', border: 'none',
                    color: 'var(--text-tertiary)', cursor: 'pointer',
                    padding: '2px', marginLeft: '4px',
                    display: 'flex', alignItems: 'center',
                    opacity: 0.6,
                }}
                title="Clear trail"
            >
                <X size={12} />
            </button>
        </div>
    );
};

export default BreadcrumbTrail;
