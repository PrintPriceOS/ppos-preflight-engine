/**
 * SpineEngine
 * 
 * Technical calculations for document spine width.
 */
class SpineEngine {
    calculateSpine(pages, caliperMm, bindingType) {
        if (bindingType === 'saddle') return { spine_mm: 0 };

        const sheetCount = Math.ceil(pages / 2);
        const spine = sheetCount * caliperMm;

        return {
            spine_mm: Number(spine.toFixed(3)),
            sheet_count: sheetCount,
            caliper_used: caliperMm
        };
    }
}

module.exports = new SpineEngine();
