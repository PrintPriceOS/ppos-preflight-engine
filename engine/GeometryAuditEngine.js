const { CODES } = require('../interpretation/industrialFindingCodes');

/**
 * GeometryAuditEngine
 * 
 * Pure industrial module for validating PDF geometry.
 * Classification: INDUSTRIAL_RUNTIME (Technical Interpretation)
 */
class GeometryAuditEngine {
    constructor(config = {}) {
        this.config = {
            minBleedMm: config.minBleedMm || 3.0,
            safeAreaMm: config.safeAreaMm || 5.0,
            standardSpinePerSheetMm: config.standardSpinePerSheetMm || 0.1
        };
    }

    /**
     * Technical Bleed Audit.
     * Returns codes and deltas.
     */
    auditBleed(geometry) {
        const { trimBox, bleedBox } = geometry;
        if (!trimBox) return { code: CODES.GEOM_TRIMBOX_MISSING, context: {} };
        if (!bleedBox) return { code: CODES.GEOM_BLEEDBOX_MISSING, context: {} };

        // [x1, y1, x2, y2]
        const bleedTop = bleedBox[3] - trimBox[3];
        const bleedBottom = trimBox[1] - bleedBox[1];
        const bleedLeft = trimBox[0] - bleedBox[0];
        const bleedRight = bleedBox[2] - trimBox[2];

        const toMm = (pt) => pt * 0.3528;

        const bleed = {
            top: toMm(bleedTop),
            bottom: toMm(bleedBottom),
            left: toMm(bleedLeft),
            right: toMm(bleedRight)
        };

        const minBleed = this.config.minBleedMm;
        const isInsufficient = bleed.top < minBleed || bleed.bottom < minBleed || bleed.left < minBleed || bleed.right < minBleed;
        const isMissing = bleed.top <= 0 && bleed.bottom <= 0 && bleed.left <= 0 && bleed.right <= 0;

        let code = null;
        if (isMissing) code = CODES.GEOM_BLEED_MISSING;
        else if (isInsufficient) code = CODES.GEOM_BLEED_INSUFFICIENT;

        return {
            code,
            context: {
                bleedMm: bleed,
                thresholdMm: minBleed,
                is_valid: !code
            }
        };
    }

    /**
     * Document Classification (Technical Interpretation).
     */
    classifyDocument(geometry, pageCount) {
        const { trimBox } = geometry;
        if (!trimBox) return { code: CODES.TYPE_UNKNOWN, context: { pageCount } };

        const widthMm = (trimBox[2] - trimBox[0]) * 0.3528;
        const heightMm = (trimBox[3] - trimBox[1]) * 0.3528;

        let typeCode = CODES.TYPE_FLYER;
        let spineMm = 0;

        const estimSpine = (pages) => (pages / 2) * (this.config.standardSpinePerSheetMm * 2);

        if (pageCount === 1) {
            if (widthMm > 300 || heightMm > 400) typeCode = CODES.TYPE_POSTER;
            else typeCode = CODES.TYPE_FLYER;
        } else if (pageCount <= 8) {
            typeCode = CODES.TYPE_BROCHURE;
        } else if (pageCount > 40) {
            typeCode = CODES.TYPE_BOOK_INTERIOR;
            spineMm = estimSpine(pageCount);
        } else {
            typeCode = CODES.TYPE_MAGAZINE;
            spineMm = estimSpine(pageCount);
        }

        return {
            code: typeCode,
            context: {
                spineMm: Number(spineMm.toFixed(3)),
                widthMm: Number(widthMm.toFixed(2)),
                heightMm: Number(heightMm.toFixed(2)),
                pageCount
            }
        };
    }
}

module.exports = GeometryAuditEngine;
