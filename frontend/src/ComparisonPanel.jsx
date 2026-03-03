import React, { useState, useCallback, useMemo, useRef } from 'react';
import { X, ChevronDown, ChevronRight, Columns, Filter, Zap, GitBranch, Info, ArrowUp, ArrowDown, Globe, Layers } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/esm/styles/prism';

// ─── Helpers ────────────────────────────────────────────────────────────────

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

function extractColumns(content) {
    if (!content) return [];
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
    const ctasMatch = content.match(/CREATE\s+(?:OR\s+REPLACE\s+)?(?:TABLE|VIEW)\s+[\w.`]+\s+AS\s+SELECT\s+([\s\S]+?)\s+FROM\b/im);
    if (ctasMatch) return parseSelectColumns(ctasMatch[1]);
    const withSelectMatch = content.match(/\)\s*SELECT\s+([\s\S]+?)\s+FROM\b/im);
    if (withSelectMatch) { const cols = parseSelectColumns(withSelectMatch[1]); if (cols.length > 0) return cols; }
    const selectMatch = content.match(/(?:^|\b)SELECT\s+([\s\S]+?)\s+FROM\b/im);
    if (selectMatch) return parseSelectColumns(selectMatch[1]);
    return [];
}

function getDependencyList(deps) {
    if (!deps) return [];
    if (Array.isArray(deps)) return deps;
    if (typeof deps === 'object') return Object.keys(deps);
    return [];
}

// ─── Sub-Components ─────────────────────────────────────────────────────────

const MetadataRow = ({ label, valueA, valueB }) => {
    const isDiff = valueA !== valueB;
    return (
        <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--border-default)' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', alignSelf: 'center' }}>{label}</span>
            <span style={{
                fontSize: '13px', color: 'var(--text-primary)',
                padding: '4px 8px', borderRadius: '6px',
                background: isDiff ? 'rgba(251, 191, 36, 0.08)' : 'transparent',
                border: isDiff ? '1px solid rgba(251, 191, 36, 0.2)' : '1px solid transparent',
            }}>{valueA || '—'}</span>
            <span style={{
                fontSize: '13px', color: 'var(--text-primary)',
                padding: '4px 8px', borderRadius: '6px',
                background: isDiff ? 'rgba(251, 191, 36, 0.08)' : 'transparent',
                border: isDiff ? '1px solid rgba(251, 191, 36, 0.2)' : '1px solid transparent',
            }}>{valueB || '—'}</span>
        </div>
    );
};

const SchemaComparison = ({ colsA, colsB, labelA, labelB }) => {
    const [isOpen, setIsOpen] = useState(true);

    const comparison = useMemo(() => {
        const namesA = new Set(colsA.map(c => c.name.toLowerCase()));
        const namesB = new Set(colsB.map(c => c.name.toLowerCase()));
        const allNames = [...new Set([...colsA.map(c => c.name.toLowerCase()), ...colsB.map(c => c.name.toLowerCase())])];

        return allNames.map(name => {
            const a = colsA.find(c => c.name.toLowerCase() === name);
            const b = colsB.find(c => c.name.toLowerCase() === name);
            const inA = namesA.has(name);
            const inB = namesB.has(name);
            let status = 'both';
            if (inA && !inB) status = 'only-a';
            else if (!inA && inB) status = 'only-b';
            else if (a && b && a.type !== b.type) status = 'type-diff';
            return { name: (a || b).name, typeA: a?.type || '', typeB: b?.type || '', status };
        });
    }, [colsA, colsB]);

    if (colsA.length === 0 && colsB.length === 0) return null;

    const shared = comparison.filter(c => c.status === 'both').length;
    const onlyA = comparison.filter(c => c.status === 'only-a').length;
    const onlyB = comparison.filter(c => c.status === 'only-b').length;
    const typeDiff = comparison.filter(c => c.status === 'type-diff').length;

    const statusColor = {
        'both': 'transparent',
        'only-a': 'rgba(96, 165, 250, 0.08)',
        'only-b': 'rgba(167, 139, 250, 0.08)',
        'type-diff': 'rgba(251, 191, 36, 0.08)',
    };
    const statusBorder = {
        'both': 'transparent',
        'only-a': '#60a5fa',
        'only-b': '#a78bfa',
        'type-diff': '#fbbf24',
    };

    return (
        <div style={{ marginBottom: '20px' }}>
            <div onClick={() => setIsOpen(!isOpen)} style={{
                fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: '8px',
                display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', userSelect: 'none',
                textTransform: 'uppercase', letterSpacing: '0.05em'
            }}>
                {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <Columns size={12} /> Schema Comparison
                <span style={{ fontSize: '9px', fontWeight: 700, background: 'var(--interactive-active)', padding: '2px 6px', borderRadius: '4px', color: 'var(--text-secondary)', marginLeft: '4px' }}>
                    {shared} shared
                </span>
                {onlyA > 0 && <span style={{ fontSize: '9px', fontWeight: 700, background: 'rgba(96, 165, 250, 0.12)', color: '#60a5fa', padding: '2px 6px', borderRadius: '4px' }}>+{onlyA} A</span>}
                {onlyB > 0 && <span style={{ fontSize: '9px', fontWeight: 700, background: 'rgba(167, 139, 250, 0.12)', color: '#a78bfa', padding: '2px 6px', borderRadius: '4px' }}>+{onlyB} B</span>}
                {typeDiff > 0 && <span style={{ fontSize: '9px', fontWeight: 700, background: 'rgba(251, 191, 36, 0.12)', color: '#fbbf24', padding: '2px 6px', borderRadius: '4px' }}>⚡{typeDiff} diff</span>}
            </div>
            {isOpen && (
                <div style={{ border: '1px solid var(--border-default)', borderRadius: '10px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                        <thead>
                            <tr style={{ background: 'var(--surface-primary)' }}>
                                <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-primary)', fontWeight: 600, borderBottom: '1px solid var(--border-default)', width: '30%' }}>Column</th>
                                <th style={{ padding: '6px 10px', textAlign: 'left', color: '#60a5fa', fontWeight: 600, borderBottom: '1px solid var(--border-default)', width: '35%' }}>{labelA}</th>
                                <th style={{ padding: '6px 10px', textAlign: 'left', color: '#a78bfa', fontWeight: 600, borderBottom: '1px solid var(--border-default)', width: '35%' }}>{labelB}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {comparison.map((col, i) => (
                                <tr key={i} style={{
                                    background: statusColor[col.status],
                                    borderBottom: i < comparison.length - 1 ? '1px solid var(--border-default)' : 'none',
                                    borderLeft: `3px solid ${statusBorder[col.status]}`,
                                }}>
                                    <td style={{ padding: '5px 10px', color: 'var(--text-primary)', fontFamily: 'monospace', fontWeight: 500 }}>{col.name}</td>
                                    <td style={{ padding: '5px 10px', color: col.status === 'only-b' ? 'var(--text-tertiary)' : 'var(--text-secondary)', fontFamily: 'monospace', fontStyle: col.status === 'only-b' ? 'italic' : 'normal' }}>
                                        {col.typeA || '—'}
                                    </td>
                                    <td style={{ padding: '5px 10px', color: col.status === 'only-a' ? 'var(--text-tertiary)' : 'var(--text-secondary)', fontFamily: 'monospace', fontStyle: col.status === 'only-a' ? 'italic' : 'normal' }}>
                                        {col.typeB || '—'}
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

const DependencyComparison = ({ depsA, depsB, labelA, labelB }) => {
    const [isOpen, setIsOpen] = useState(false);

    const comparison = useMemo(() => {
        const setA = new Set(depsA.map(d => d.toLowerCase()));
        const setB = new Set(depsB.map(d => d.toLowerCase()));
        const shared = depsA.filter(d => setB.has(d.toLowerCase()));
        const onlyA = depsA.filter(d => !setB.has(d.toLowerCase()));
        const onlyB = depsB.filter(d => !setA.has(d.toLowerCase()));
        return { shared, onlyA, onlyB };
    }, [depsA, depsB]);

    if (depsA.length === 0 && depsB.length === 0) return null;

    const depBadge = (name, color) => (
        <span key={name} style={{
            fontSize: '11px', fontFamily: 'monospace', padding: '3px 8px',
            background: `${color}10`, border: `1px solid ${color}30`,
            borderRadius: '6px', color: 'var(--text-primary)', display: 'inline-block', margin: '2px'
        }}>{name}</span>
    );

    return (
        <div style={{ marginBottom: '20px' }}>
            <div onClick={() => setIsOpen(!isOpen)} style={{
                fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: '8px',
                display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', userSelect: 'none',
                textTransform: 'uppercase', letterSpacing: '0.05em'
            }}>
                {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <Globe size={12} /> Dependencies
                <span style={{ fontSize: '9px', fontWeight: 700, background: 'var(--interactive-active)', padding: '2px 6px', borderRadius: '4px', color: 'var(--text-secondary)', marginLeft: '4px' }}>
                    {comparison.shared.length} shared
                </span>
                {comparison.onlyA.length > 0 && <span style={{ fontSize: '9px', fontWeight: 700, background: 'rgba(96, 165, 250, 0.12)', color: '#60a5fa', padding: '2px 6px', borderRadius: '4px' }}>+{comparison.onlyA.length} A</span>}
                {comparison.onlyB.length > 0 && <span style={{ fontSize: '9px', fontWeight: 700, background: 'rgba(167, 139, 250, 0.12)', color: '#a78bfa', padding: '2px 6px', borderRadius: '4px' }}>+{comparison.onlyB.length} B</span>}
            </div>
            {isOpen && (
                <div style={{ border: '1px solid var(--border-default)', borderRadius: '10px', padding: '12px', background: 'var(--surface-inset)' }}>
                    {comparison.shared.length > 0 && (
                        <div style={{ marginBottom: '10px' }}>
                            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-tertiary)', marginBottom: '4px', textTransform: 'uppercase' }}>Shared ({comparison.shared.length})</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px' }}>
                                {comparison.shared.map(d => depBadge(d, 'var(--text-secondary)'))}
                            </div>
                        </div>
                    )}
                    {comparison.onlyA.length > 0 && (
                        <div style={{ marginBottom: '10px' }}>
                            <div style={{ fontSize: '10px', fontWeight: 700, color: '#60a5fa', marginBottom: '4px', textTransform: 'uppercase' }}>Only in {labelA} ({comparison.onlyA.length})</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px' }}>
                                {comparison.onlyA.map(d => depBadge(d, '#60a5fa'))}
                            </div>
                        </div>
                    )}
                    {comparison.onlyB.length > 0 && (
                        <div>
                            <div style={{ fontSize: '10px', fontWeight: 700, color: '#a78bfa', marginBottom: '4px', textTransform: 'uppercase' }}>Only in {labelB} ({comparison.onlyB.length})</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px' }}>
                                {comparison.onlyB.map(d => depBadge(d, '#a78bfa'))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

const ComplexityComparison = ({ complexityA, complexityB, labelA, labelB }) => {
    const [isOpen, setIsOpen] = useState(false);

    if ((!complexityA || complexityA.score === 0) && (!complexityB || complexityB.score === 0)) return null;

    const scoreA = complexityA?.score || 0;
    const scoreB = complexityB?.score || 0;
    const getLevel = (s) => s <= 3 ? 'Low' : s <= 7 ? 'Medium' : s <= 12 ? 'High' : 'Very High';
    const getLevelColor = (s) => s <= 3 ? 'var(--status-success)' : s <= 7 ? 'var(--status-warning)' : s <= 12 ? '#e67e22' : 'var(--status-error)';

    const metricKeys = [
        { key: 'joins', label: 'JOINs', weight: 3, color: '#60a5fa' },
        { key: 'ctes', label: 'CTEs', weight: 2, color: '#f472b6' },
        { key: 'subqueries', label: 'Subqueries', weight: 3, color: '#a78bfa' },
        { key: 'filters', label: 'Filters', weight: 1, color: '#fbbf24' },
        { key: 'case_statements', label: 'CASE', weight: 2, color: '#fb923c' },
        { key: 'aggregations', label: 'Aggregations', weight: 1, color: '#34d399' },
        { key: 'unions', label: 'UNIONs', weight: 2, color: '#2dd4bf' },
    ];

    const delta = scoreA - scoreB;

    return (
        <div style={{ marginBottom: '20px' }}>
            <div onClick={() => setIsOpen(!isOpen)} style={{
                fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: '8px',
                display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', userSelect: 'none',
                textTransform: 'uppercase', letterSpacing: '0.05em'
            }}>
                {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <Zap size={12} /> Complexity
                <span style={{ color: getLevelColor(scoreA), fontWeight: 700 }}>{scoreA}</span>
                <span style={{ color: 'var(--text-tertiary)' }}>vs</span>
                <span style={{ color: getLevelColor(scoreB), fontWeight: 700 }}>{scoreB}</span>
                {delta !== 0 && (
                    <span style={{
                        fontSize: '9px', fontWeight: 700,
                        background: delta > 0 ? 'rgba(248, 113, 113, 0.12)' : 'rgba(52, 211, 153, 0.12)',
                        color: delta > 0 ? '#f87171' : '#34d399',
                        padding: '2px 6px', borderRadius: '4px',
                        display: 'flex', alignItems: 'center', gap: '2px'
                    }}>
                        {delta > 0 ? <ArrowUp size={9} /> : <ArrowDown size={9} />}
                        {Math.abs(delta)}
                    </span>
                )}
            </div>
            {isOpen && (
                <div style={{ border: '1px solid var(--border-default)', borderRadius: '10px', padding: '12px', background: 'var(--surface-inset)' }}>
                    {/* Score gauges side by side */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                        {[{ label: labelA, score: scoreA }, { label: labelB, score: scoreB }].map((item, idx) => (
                            <div key={idx}>
                                <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginBottom: '4px', fontWeight: 600 }}>{item.label}</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div style={{ flex: 1, height: '4px', background: 'var(--interactive-active)', borderRadius: '2px', overflow: 'hidden' }}>
                                        <div style={{ width: `${Math.min(item.score / 20 * 100, 100)}%`, height: '100%', background: `linear-gradient(90deg, var(--status-success), ${getLevelColor(item.score)})`, borderRadius: '2px', transition: 'width 0.3s' }} />
                                    </div>
                                    <span style={{ fontSize: '12px', fontWeight: 700, color: getLevelColor(item.score), minWidth: '40px' }}>
                                        {item.score} <span style={{ fontSize: '9px', fontWeight: 600 }}>({getLevel(item.score)})</span>
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Metric comparison table */}
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                        <thead>
                            <tr>
                                <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-tertiary)', fontWeight: 600, fontSize: '10px' }}>Metric</th>
                                <th style={{ textAlign: 'center', padding: '4px 8px', color: '#60a5fa', fontWeight: 600, fontSize: '10px' }}>{labelA}</th>
                                <th style={{ textAlign: 'center', padding: '4px 8px', color: '#a78bfa', fontWeight: 600, fontSize: '10px' }}>{labelB}</th>
                                <th style={{ textAlign: 'center', padding: '4px 8px', color: 'var(--text-tertiary)', fontWeight: 600, fontSize: '10px' }}>Δ</th>
                            </tr>
                        </thead>
                        <tbody>
                            {metricKeys.map(m => {
                                const vA = complexityA?.[m.key] || 0;
                                const vB = complexityB?.[m.key] || 0;
                                const d = vA - vB;
                                if (vA === 0 && vB === 0) return null;
                                return (
                                    <tr key={m.key} style={{ borderTop: '1px solid var(--border-default)' }}>
                                        <td style={{ padding: '4px 8px', color: m.color, fontWeight: 500 }}>{m.label}</td>
                                        <td style={{ padding: '4px 8px', textAlign: 'center', color: 'var(--text-primary)', fontWeight: 600 }}>{vA}</td>
                                        <td style={{ padding: '4px 8px', textAlign: 'center', color: 'var(--text-primary)', fontWeight: 600 }}>{vB}</td>
                                        <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                                            {d !== 0 ? (
                                                <span style={{
                                                    fontSize: '10px', fontWeight: 700,
                                                    color: d > 0 ? '#f87171' : '#34d399',
                                                    display: 'inline-flex', alignItems: 'center', gap: '1px'
                                                }}>
                                                    {d > 0 ? '+' : ''}{d}
                                                </span>
                                            ) : (
                                                <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>—</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

const BusinessRulesComparison = ({ rulesA, rulesB, labelA, labelB }) => {
    const [isOpen, setIsOpen] = useState(false);

    const totalA = rulesA ? Object.values(rulesA).reduce((s, arr) => s + arr.length, 0) : 0;
    const totalB = rulesB ? Object.values(rulesB).reduce((s, arr) => s + arr.length, 0) : 0;

    if (totalA === 0 && totalB === 0) return null;

    const sections = ['filters', 'case_logic', 'having', 'aggregations'];
    const sectionMeta = {
        filters: { label: 'WHERE Filters', icon: <Filter size={11} />, color: '#60a5fa' },
        case_logic: { label: 'CASE Logic', icon: <GitBranch size={11} />, color: '#a78bfa' },
        having: { label: 'HAVING', icon: <Filter size={11} />, color: '#fbbf24' },
        aggregations: { label: 'Aggregations', icon: <Zap size={11} />, color: '#34d399' },
    };

    return (
        <div style={{ marginBottom: '20px' }}>
            <div onClick={() => setIsOpen(!isOpen)} style={{
                fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: '8px',
                display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', userSelect: 'none',
                textTransform: 'uppercase', letterSpacing: '0.05em'
            }}>
                {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <Filter size={12} /> Business Rules
                <span style={{ fontSize: '9px', fontWeight: 700, background: 'rgba(96, 165, 250, 0.12)', color: '#60a5fa', padding: '2px 6px', borderRadius: '4px' }}>{totalA}</span>
                <span style={{ color: 'var(--text-tertiary)', fontSize: '10px' }}>vs</span>
                <span style={{ fontSize: '9px', fontWeight: 700, background: 'rgba(167, 139, 250, 0.12)', color: '#a78bfa', padding: '2px 6px', borderRadius: '4px' }}>{totalB}</span>
            </div>
            {isOpen && (
                <div style={{ border: '1px solid var(--border-default)', borderRadius: '10px', padding: '12px', background: 'var(--surface-inset)' }}>
                    {sections.map(key => {
                        const dataA = rulesA?.[key] || [];
                        const dataB = rulesB?.[key] || [];
                        if (dataA.length === 0 && dataB.length === 0) return null;
                        const meta = sectionMeta[key];
                        return (
                            <div key={key} style={{ marginBottom: '12px' }}>
                                <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: meta.color, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    {meta.icon} {meta.label}
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                    <div>
                                        <div style={{ fontSize: '9px', fontWeight: 700, color: '#60a5fa', marginBottom: '3px' }}>{labelA} ({dataA.length})</div>
                                        {dataA.length === 0 ? (
                                            <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>None</div>
                                        ) : dataA.map((rule, i) => (
                                            <div key={i} style={{
                                                fontFamily: 'monospace', fontSize: '10px', padding: '3px 6px',
                                                background: 'rgba(96, 165, 250, 0.06)', borderRadius: '4px',
                                                marginBottom: '2px', color: 'var(--text-primary)', wordBreak: 'break-word',
                                                lineHeight: 1.4, borderLeft: `2px solid ${meta.color}`
                                            }}>{rule.length > 80 ? rule.substring(0, 80) + '...' : rule}</div>
                                        ))}
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '9px', fontWeight: 700, color: '#a78bfa', marginBottom: '3px' }}>{labelB} ({dataB.length})</div>
                                        {dataB.length === 0 ? (
                                            <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>None</div>
                                        ) : dataB.map((rule, i) => (
                                            <div key={i} style={{
                                                fontFamily: 'monospace', fontSize: '10px', padding: '3px 6px',
                                                background: 'rgba(167, 139, 250, 0.06)', borderRadius: '4px',
                                                marginBottom: '2px', color: 'var(--text-primary)', wordBreak: 'break-word',
                                                lineHeight: 1.4, borderLeft: `2px solid ${meta.color}`
                                            }}>{rule.length > 80 ? rule.substring(0, 80) + '...' : rule}</div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

const SQLComparison = ({ contentA, contentB, labelA, labelB, isDark }) => {
    const [isOpen, setIsOpen] = useState(true);
    const scrollRefA = useRef(null);
    const scrollRefB = useRef(null);
    const isSyncing = useRef(false);

    const highlightStyle = isDark ? vscDarkPlus : vs;

    const handleScroll = useCallback((source) => {
        if (isSyncing.current) return;
        isSyncing.current = true;
        const refA = scrollRefA.current;
        const refB = scrollRefB.current;
        if (source === 'a' && refA && refB) {
            refB.scrollTop = refA.scrollTop;
            refB.scrollLeft = refA.scrollLeft;
        } else if (source === 'b' && refA && refB) {
            refA.scrollTop = refB.scrollTop;
            refA.scrollLeft = refB.scrollLeft;
        }
        requestAnimationFrame(() => { isSyncing.current = false; });
    }, []);

    const linesA = (contentA || '').split('\n').length;
    const linesB = (contentB || '').split('\n').length;

    return (
        <div style={{ marginBottom: '20px' }}>
            <div onClick={() => setIsOpen(!isOpen)} style={{
                fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: '8px',
                display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', userSelect: 'none',
                textTransform: 'uppercase', letterSpacing: '0.05em'
            }}>
                {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                SQL Content
                <span style={{ fontSize: '9px', fontWeight: 700, background: 'rgba(96, 165, 250, 0.12)', color: '#60a5fa', padding: '2px 6px', borderRadius: '4px' }}>{linesA} lines</span>
                <span style={{ color: 'var(--text-tertiary)', fontSize: '10px' }}>vs</span>
                <span style={{ fontSize: '9px', fontWeight: 700, background: 'rgba(167, 139, 250, 0.12)', color: '#a78bfa', padding: '2px 6px', borderRadius: '4px' }}>{linesB} lines</span>
            </div>
            {isOpen && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    {[
                        { label: labelA, content: contentA || '-- No content', ref: scrollRefA, scrollSrc: 'a', color: '#60a5fa' },
                        { label: labelB, content: contentB || '-- No content', ref: scrollRefB, scrollSrc: 'b', color: '#a78bfa' },
                    ].map((item, idx) => (
                        <div key={idx}>
                            <div style={{ fontSize: '10px', fontWeight: 700, color: item.color, marginBottom: '4px', textTransform: 'uppercase' }}>{item.label}</div>
                            <div
                                ref={item.ref}
                                onScroll={() => handleScroll(item.scrollSrc)}
                                style={{
                                    border: '1px solid var(--border-default)',
                                    borderRadius: '10px',
                                    overflow: 'auto',
                                    maxHeight: '400px',
                                }}
                            >
                                <SyntaxHighlighter
                                    language="sql"
                                    style={highlightStyle}
                                    customStyle={{
                                        margin: 0,
                                        padding: '12px',
                                        fontSize: '11px',
                                        lineHeight: 1.5,
                                        background: isDark ? '#0d0d0d' : '#f7f6f3',
                                    }}
                                    wrapLines={true}
                                    wrapLongLines={true}
                                    showLineNumbers={true}
                                    lineNumberStyle={{ minWidth: '2em', paddingRight: '8px', color: 'var(--text-tertiary)', fontSize: '9px', opacity: 0.5 }}
                                >
                                    {item.content}
                                </SyntaxHighlighter>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};


// ─── Main Component ─────────────────────────────────────────────────────────

const ComparisonPanel = ({ nodeA, nodeB, onClose, theme }) => {
    const isDark = theme === 'dark';

    const labelA = nodeA?.label || nodeA?.id || 'Node A';
    const labelB = nodeB?.label || nodeB?.id || 'Node B';

    const colsA = useMemo(() => extractColumns(nodeA?.details?.content), [nodeA?.details?.content]);
    const colsB = useMemo(() => extractColumns(nodeB?.details?.content), [nodeB?.details?.content]);

    const depsA = useMemo(() => getDependencyList(nodeA?.details?.dependencies), [nodeA?.details?.dependencies]);
    const depsB = useMemo(() => getDependencyList(nodeB?.details?.dependencies), [nodeB?.details?.dependencies]);

    if (!nodeA || !nodeB) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                onClick={onClose}
                style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: 'var(--surface-overlay)',
                    zIndex: 1999,
                    animation: 'fadeIn 0.2s ease-out',
                }}
            />

            {/* Panel */}
            <div style={{
                position: 'fixed',
                top: '56px',
                left: '5%',
                right: '5%',
                bottom: '24px',
                background: 'var(--surface-secondary)',
                border: '1px solid var(--border-default)',
                borderRadius: '16px',
                zIndex: 2000,
                boxShadow: 'var(--shadow-xl)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                animation: 'fadeIn 0.25s ease-out',
            }}>
                {/* Header */}
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '16px 24px',
                    borderBottom: '1px solid var(--border-default)',
                    background: 'var(--surface-primary)',
                    flexShrink: 0,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                            Node Comparison
                        </h2>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{
                                fontSize: '12px', fontWeight: 600, padding: '4px 12px',
                                background: 'rgba(96, 165, 250, 0.12)', color: '#60a5fa',
                                borderRadius: '8px', border: '1px solid rgba(96, 165, 250, 0.2)',
                            }}>{labelA}</span>
                            <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 500 }}>vs</span>
                            <span style={{
                                fontSize: '12px', fontWeight: 600, padding: '4px 12px',
                                background: 'rgba(167, 139, 250, 0.12)', color: '#a78bfa',
                                borderRadius: '8px', border: '1px solid rgba(167, 139, 250, 0.2)',
                            }}>{labelB}</span>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'transparent', border: 'none', color: 'var(--text-secondary)',
                            cursor: 'pointer', padding: '6px', borderRadius: '6px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'background 0.15s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--interactive-hover)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        title="Close (Esc)"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Scrollable Body */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
                    {/* Metadata Comparison */}
                    <div style={{ marginBottom: '24px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Layers size={12} /> Metadata
                        </div>
                        <div style={{ border: '1px solid var(--border-default)', borderRadius: '10px', padding: '4px 12px', background: 'var(--surface-inset)' }}>
                            <MetadataRow label="Layer" valueA={nodeA.layer} valueB={nodeB.layer} />
                            <MetadataRow label="Type" valueA={nodeA.details?.type || 'Table'} valueB={nodeB.details?.type || 'Table'} />
                            <MetadataRow label="Project" valueA={nodeA.details?.project} valueB={nodeB.details?.project} />
                            <MetadataRow label="Dataset" valueA={nodeA.details?.dataset} valueB={nodeB.details?.dataset} />
                            <MetadataRow label="Tag" valueA={nodeA.tag} valueB={nodeB.tag} />
                            {(nodeA.details?.last_modified_days != null || nodeB.details?.last_modified_days != null) && (
                                <MetadataRow
                                    label="Modified"
                                    valueA={nodeA.details?.last_modified_days != null ? (nodeA.details.last_modified_days === 0 ? 'Today' : `${nodeA.details.last_modified_days}d ago`) : null}
                                    valueB={nodeB.details?.last_modified_days != null ? (nodeB.details.last_modified_days === 0 ? 'Today' : `${nodeB.details.last_modified_days}d ago`) : null}
                                />
                            )}
                        </div>
                    </div>

                    {/* Schema Comparison */}
                    <SchemaComparison colsA={colsA} colsB={colsB} labelA={labelA} labelB={labelB} />

                    {/* Dependencies Comparison */}
                    <DependencyComparison depsA={depsA} depsB={depsB} labelA={labelA} labelB={labelB} />

                    {/* Complexity Comparison */}
                    <ComplexityComparison
                        complexityA={nodeA.details?.complexity}
                        complexityB={nodeB.details?.complexity}
                        labelA={labelA}
                        labelB={labelB}
                    />

                    {/* Business Rules Comparison */}
                    <BusinessRulesComparison
                        rulesA={nodeA.details?.business_rules}
                        rulesB={nodeB.details?.business_rules}
                        labelA={labelA}
                        labelB={labelB}
                    />

                    {/* SQL Content Comparison */}
                    <SQLComparison
                        contentA={nodeA.details?.content}
                        contentB={nodeB.details?.content}
                        labelA={labelA}
                        labelB={labelB}
                        isDark={isDark}
                    />
                </div>
            </div>
        </>
    );
};

export default ComparisonPanel;
