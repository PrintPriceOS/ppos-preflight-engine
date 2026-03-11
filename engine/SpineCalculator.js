/**
 * SpineCalculator
 * 
 * Composable engine for calculating theoretical spine width based on paper specs.
 * Classification: INDUSTRIAL_RUNTIME (Technical Math)
 */
class SpineCalculator {
    constructor(rules = {}) {
        this.rules = rules;
    }

    /**
     * Calculates the theoretical spine width.
     */
    calculateTheoreticalSpine(specs) {
        const { pageCount, paperType, paperGsm } = specs;
        const caliper = this._resolveCaliper(paperType, paperGsm);

        const sheetCount = Math.ceil(pageCount / 2);
        const spineMm = sheetCount * caliper;

        return {
            spine_mm: Number(spineMm.toFixed(3)),
            sheet_count: sheetCount,
            caliper_used: caliper
        };
    }

    /**
     * Evaluates the delta between detected and theoretical spine.
     */
    evaluateDelta(detected, theoretical, bindingType) {
        const delta = Math.abs(detected - theoretical);
        const tolerance = this.rules.tolerances?.[bindingType] || 0.5;

        let classification = 'GREEN';
        if (delta > tolerance * 2) classification = 'BLOCKING';
        else if (delta > tolerance) classification = 'ATTENTION';

        return {
            delta: Number(delta.toFixed(3)),
            tolerance,
            classification,
            status: classification === 'GREEN' ? 'ok' : 'mismatch'
        };
    }

    _resolveCaliper(type, gsm) {
        // Basic lookup if not provided in rules
        const table = this.rules.caliper_table || {
            'coated_90': 0.07,
            'coated_130': 0.09,
            'coated_170': 0.12,
            'uncoated_80': 0.10,
            'uncoated_100': 0.13
        };
        const key = `${type}_${gsm}`;
        return table[key] || 0.1; // Default
    }
}

module.exports = SpineCalculator;
