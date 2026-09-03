// Single source of truth for node colours.
//
// A stored procedure is executable logic, not a dataset, so it must not read as
// a table — the same reason CTEs and external tables get their own colour. It
// still keeps its medallion layer (bronze/silver/gold) for grouping, filtering
// and stats; only its colour is overridden.

export const LAYER_PALETTES = {
    standard: { bronze: '#8B4513', silver: '#708090', gold: '#DAA520', external: '#C06430', cte: '#E91E63', other: '#4CA1AF', default: '#2F4F4F' },
    vivid: { bronze: '#D4654A', silver: '#4A9CC7', gold: '#E09E3A', external: '#D47A3A', cte: '#C45B8C', other: '#3A9E98', default: '#7B6DB5' },
    pastel: { bronze: '#DCC1B0', silver: '#B8C5D0', gold: '#F0E4B8', external: '#E8D0A8', cte: '#DAAFC0', other: '#A8D0D8', default: '#C8B8D8' },
    linear: { bronze: '#B08968', silver: '#8E99A4', gold: '#D4A843', external: '#CC8B5E', cte: '#C77092', other: '#6B9DAD', default: '#7A8B8B' },
};

// Violet reads as "process" against the earthy medallion tones, and is not used
// by any layer.
export const PROCEDURE_COLORS = {
    standard: '#6A4C93',
    vivid: '#8B5CF6',
    pastel: '#CBBCE8',
    linear: '#8A7CA8',
};

export const isProcedureType = (type) => type === 'procedure';

/** Colour for a node, taking its kind into account before its layer. */
export function nodeColor(layer, type, palette = 'standard') {
    if (isProcedureType(type)) {
        return PROCEDURE_COLORS[palette] || PROCEDURE_COLORS.standard;
    }
    const colors = LAYER_PALETTES[palette] || LAYER_PALETTES.standard;
    return colors[layer] || colors.default;
}
