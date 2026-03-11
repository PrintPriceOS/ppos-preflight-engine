/**
 * Industrial Finding Codes
 * 
 * Standardized technical codes for the Preflight Engine kernel.
 * These codes are persistent and language-independent.
 */

const CODES = {
    // Geometry & Layout
    GEOM_BLEED_INSUFFICIENT: 'IND_GEOM_001',
    GEOM_BLEED_MISSING: 'IND_GEOM_002',
    GEOM_TRIMBOX_MISSING: 'IND_GEOM_003',
    GEOM_BLEEDBOX_MISSING: 'IND_GEOM_004',

    // Document Classification
    TYPE_UNKNOWN: 'IND_TYPE_000',
    TYPE_FLYER: 'IND_TYPE_001',
    TYPE_POSTER: 'IND_TYPE_002',
    TYPE_BROCHURE: 'IND_TYPE_003',
    TYPE_BOOK_INTERIOR: 'IND_TYPE_004',
    TYPE_MAGAZINE: 'IND_TYPE_005',

    // Technical Status
    TECH_EXEC_FAILED: 'IND_TECH_999'
};

module.exports = { CODES };
