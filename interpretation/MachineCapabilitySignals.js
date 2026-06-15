'use strict';
/**
 * Phase 73A — Engine Machine Capability Signals
 *
 * Derives structured, machine-matching-relevant signals from an analysis
 * report's metadata and normalized findings:
 *   - page size / page count / orientation
 *   - color mode (RGB / mixed color space presence)
 *   - ink risk (TAC / rich black / registration color misuse)
 *   - finishing / page marks risk (crop marks, registration marks, bleed)
 *   - standards status (claimed / validated / invalid / unknown)
 *   - media requirements (bleed, CMYK conversion need, page size)
 *
 * Governance:
 *   - Signals are advisory only. They are inputs to downstream machine
 *     matching, never a certification or production-readiness authority.
 *   - machine_capability_signals never imply production_certified,
 *     standard_certified, or compliance_claim_allowed.
 */

const RGB_CODES = new Set([
    'RGB_COLOR_DETECTED', 'COLOR_RGB_IMAGES', 'COLOR_RGB_OBJECTS_DETECTED', 'IND_COLOR_001',
    'RGB_IMAGES_PRESENT', 'IND_IMG_017', 'IND_IMG_004', 'IMG_RGB_IMAGE_DETECTED'
]);

const SPOT_COLOR_CODES = new Set(['COLOR_SPOT_COLOR_DETECTED', 'IND_COLOR_004']);

const MIXED_COLOR_SPACE_CODES = new Set(['COLOR_MIXED_COLOR_SPACES', 'IND_COLOR_003']);

const ICC_MISSING_CODES = new Set([
    'COLOR_ICC_PROFILE_MISSING', 'IND_COLOR_002',
    'COLOR_OUTPUT_INTENT_MISSING', 'IND_COLOR_006',
    'OUTPUTINTENT_MISSING_FOR_STANDARD', 'IND_COMPLIANCE_010'
]);

const TAC_EXCEEDED_CODES = new Set([
    'COLOR_TOTAL_INK_COVERAGE_EXCEEDED', 'TOTAL_INK_COVERAGE_EXCESSIVE',
    'INK_TOTAL_COVERAGE_EXCESSIVE', 'IND_COLOR_005', 'IND_INK_001'
]);

const RICH_BLACK_CODES = new Set([
    'COLOR_RICH_BLACK_TEXT', 'IND_COLOR_008', 'INK_RICH_BLACK_TEXT', 'IND_INK_002',
    'RICH_BLACK_TEXT', 'INK_SMALL_TEXT_RICH_BLACK', 'IND_INK_003', 'SMALL_TEXT_RICH_BLACK'
]);

const REGISTRATION_MISUSE_CODES = new Set([
    'COLOR_REGISTRATION_ABUSE', 'IND_COLOR_009',
    'INK_REGISTRATION_COLOR_MISUSE', 'IND_INK_004', 'REGISTRATION_COLOR_MISUSE'
]);

const BLEED_MISSING_CODES = new Set([
    'BLEED_MISSING', 'BLEED_INSUFFICIENT', 'BLEEDBOX_MISSING',
    'GEOM_BLEED_MISSING', 'GEOM_BLEED_INSUFFICIENT', 'GEOM_BLEEDBOX_MISSING',
    'IND_GEOM_001', 'IND_GEOM_002', 'IND_GEOM_004'
]);

const CROP_MARKS_MISSING_CODES = new Set([
    'CROP_MARKS_MISSING', 'MARK_CROP_MARKS_MISSING', 'IND_MARK_001', 'IND_MARK_004'
]);

const REGISTRATION_MARKS_INSIDE_TRIM_CODES = new Set([
    'REGISTRATION_MARKS_INSIDE_TRIM', 'IND_MARK_008'
]);

const PAGE_MARKS_INCONSISTENT_CODES = new Set([
    'PAGE_MARKS_INCONSISTENT', 'IND_MARK_010',
    'PAGE_MARKS_UNCERTAIN_GEOMETRY', 'IND_MARK_011'
]);

const PAGE_SIZE_INCONSISTENT_CODES = new Set([
    'PAGE_SIZE_INCONSISTENT', 'GEOM_PAGE_SIZE_INCONSISTENT', 'IND_GEOM_009'
]);

const MIXED_ORIENTATION_CODES = new Set([
    'GEOM_MIXED_PAGE_ORIENTATION', 'IND_GEOM_011'
]);

const STANDARD_VALIDATION_PASSED_CODES = new Set([
    'STANDARD_VALIDATION_PASSED', 'IND_COMPLIANCE_026'
]);

const STANDARD_CLAIMED_NOT_VALIDATED_CODES = new Set([
    'PDFX_CLAIMED_BUT_NOT_VALIDATED', 'IND_COMPLIANCE_005',
    'PDFA_CLAIMED_BUT_NOT_VALIDATED', 'IND_COMPLIANCE_025',
    'STANDARD_CLAIM_WITHOUT_VALIDATOR_EVIDENCE', 'IND_COMPLIANCE_022',
    'STANDARD_VALIDATION_REQUIRED', 'IND_COMPLIANCE_015'
]);

const STANDARD_INVALID_CODES = new Set([
    'PDFX_INVALID', 'IND_COMPLIANCE_004', 'PDFA_INVALID', 'IND_COMPLIANCE_024'
]);

const STANDARD_MISSING_CODES = new Set([
    'PDFX_MISSING', 'IND_COMPLIANCE_003', 'PDFA_MISSING', 'IND_COMPLIANCE_023',
    'PDF_STANDARD_UNKNOWN', 'IND_COMPLIANCE_008'
]);

const PAGE_SIZE_TOLERANCE_MM = 0.5;
const DEFAULT_MIN_BLEED_MM = 3;

/**
 * Build a Set of all finding codes present on the report (both `id` and `code` forms).
 */
function buildFindingCodeSet(issues = []) {
    const codes = new Set();
    for (const issue of issues) {
        if (issue.id) codes.add(issue.id);
        if (issue.code) codes.add(issue.code);
    }
    return codes;
}

function hasAny(findingCodes, codeSet) {
    for (const c of codeSet) {
        if (findingCodes.has(c)) return true;
    }
    return false;
}

function classifyOrientation(widthMm, heightMm) {
    if (widthMm == null || heightMm == null) return 'UNKNOWN';
    if (Math.abs(widthMm - heightMm) <= PAGE_SIZE_TOLERANCE_MM) return 'SQUARE';
    return widthMm > heightMm ? 'LANDSCAPE' : 'PORTRAIT';
}

function isPageSizeConsistent(pages, refWidth, refHeight) {
    if (!Array.isArray(pages) || pages.length <= 1) return true;
    if (refWidth == null || refHeight == null) return true;
    return pages.every(p =>
        p.widthMm == null || p.heightMm == null ||
        (Math.abs(p.widthMm - refWidth) <= PAGE_SIZE_TOLERANCE_MM &&
         Math.abs(p.heightMm - refHeight) <= PAGE_SIZE_TOLERANCE_MM)
    );
}

/**
 * Generate machine capability signals from analysis metadata + normalized findings.
 *
 * @param {Object} metadata - PreflightEngine metadata (geometry, pages, size, ...)
 * @param {Array}  issues   - Normalized findings (each with `id`/`code`)
 * @param {Object} [jobMeta] - Optional job-level hints: { tac_measured, detected_standard,
 *                              standard_validated, paper_type, paper_gsm }
 * @returns {Object} machine_capability_signals
 */
function generateMachineCapabilitySignals(metadata = {}, issues = [], jobMeta = {}) {
    const findingCodes = buildFindingCodeSet(issues);
    const geometry = metadata.geometry || {};
    const pages = Array.isArray(geometry.pages) ? geometry.pages : [];
    const firstPage = geometry.firstPage || pages[0] || {};

    const widthMm = firstPage.widthMm ?? geometry.widthMm ?? null;
    const heightMm = firstPage.heightMm ?? geometry.heightMm ?? null;

    const warnings = [];

    // ── Page signals ─────────────────────────────────────────────────────
    const pageCount = metadata.pages || metadata.pageCount || pages.length || 0;
    if (pageCount === 0) warnings.push('PAGE_COUNT_UNAVAILABLE');
    if (widthMm == null || heightMm == null) warnings.push('PAGE_SIZE_UNAVAILABLE');

    const pageSizeConsistent = isPageSizeConsistent(pages, widthMm, heightMm) &&
        !hasAny(findingCodes, PAGE_SIZE_INCONSISTENT_CODES);

    const page_signals = {
        page_count: pageCount,
        page_size_mm: { width: widthMm, height: heightMm },
        orientation: classifyOrientation(widthMm, heightMm),
        page_size_consistent: pageSizeConsistent,
        mixed_orientation_detected: hasAny(findingCodes, MIXED_ORIENTATION_CODES)
    };

    // ── Color signals ────────────────────────────────────────────────────
    const rgbDetected = hasAny(findingCodes, RGB_CODES);
    const mixedColorSpaces = hasAny(findingCodes, MIXED_COLOR_SPACE_CODES);

    const color_signals = {
        color_mode: mixedColorSpaces ? 'MIXED_COLOR_SPACES' : (rgbDetected ? 'RGB_PRESENT' : 'CMYK_OR_UNSPECIFIED'),
        rgb_detected: rgbDetected,
        spot_color_detected: hasAny(findingCodes, SPOT_COLOR_CODES),
        mixed_color_spaces: mixedColorSpaces,
        icc_profile_missing: hasAny(findingCodes, ICC_MISSING_CODES)
    };

    // ── Ink signals ──────────────────────────────────────────────────────
    const tacExceeded = hasAny(findingCodes, TAC_EXCEEDED_CODES);
    const richBlackRisk = hasAny(findingCodes, RICH_BLACK_CODES);
    const registrationColorMisuse = hasAny(findingCodes, REGISTRATION_MISUSE_CODES);

    let inkRisk = 'LOW';
    if (tacExceeded || registrationColorMisuse) inkRisk = 'HIGH';
    else if (richBlackRisk) inkRisk = 'MEDIUM';

    const ink_signals = {
        ink_risk: inkRisk,
        tac_exceeded: tacExceeded,
        tac_measured: jobMeta.tac_measured ?? null,
        rich_black_risk: richBlackRisk,
        registration_color_misuse: registrationColorMisuse
    };

    // ── Finishing / page marks signals ──────────────────────────────────
    const bleedMissing = hasAny(findingCodes, BLEED_MISSING_CODES);
    const cropMarksMissing = hasAny(findingCodes, CROP_MARKS_MISSING_CODES);
    const registrationMarksInsideTrim = hasAny(findingCodes, REGISTRATION_MARKS_INSIDE_TRIM_CODES);
    const pageMarksInconsistent = hasAny(findingCodes, PAGE_MARKS_INCONSISTENT_CODES);

    let finishingRisk = 'LOW';
    if (registrationMarksInsideTrim || (cropMarksMissing && bleedMissing)) finishingRisk = 'HIGH';
    else if (cropMarksMissing || bleedMissing || pageMarksInconsistent) finishingRisk = 'MEDIUM';

    const finishing_signals = {
        finishing_marks_risk: finishingRisk,
        bleed_missing: bleedMissing,
        crop_marks_missing: cropMarksMissing,
        registration_marks_inside_trim: registrationMarksInsideTrim,
        page_marks_inconsistent: pageMarksInconsistent
    };

    // ── Standards signals ────────────────────────────────────────────────
    const standardValidated = hasAny(findingCodes, STANDARD_VALIDATION_PASSED_CODES) ||
        jobMeta.standard_validated === true;
    const standardInvalid = hasAny(findingCodes, STANDARD_INVALID_CODES);
    const standardClaimedNotValidated = hasAny(findingCodes, STANDARD_CLAIMED_NOT_VALIDATED_CODES);
    const standardMissing = hasAny(findingCodes, STANDARD_MISSING_CODES);

    let standardStatus = 'UNKNOWN';
    if (standardInvalid) standardStatus = 'INVALID';
    else if (standardValidated) standardStatus = 'VALIDATED';
    else if (standardClaimedNotValidated) standardStatus = 'CLAIMED_NOT_VALIDATED';
    else if (standardMissing) standardStatus = 'NOT_CLAIMED';

    const standards_signals = {
        standard_status: standardStatus,
        detected_standard: jobMeta.detected_standard ?? null,
        standard_validated: standardValidated,
        standard_claimed_not_validated: standardClaimedNotValidated,
        standard_invalid: standardInvalid
    };

    // ── Media requirements ──────────────────────────────────────────────
    const media_requirements = {
        min_bleed_mm: DEFAULT_MIN_BLEED_MM,
        bleed_present: !bleedMissing,
        page_size_mm: { width: widthMm, height: heightMm },
        requires_cmyk_conversion: rgbDetected,
        paper_type: jobMeta.paper_type ?? null,
        paper_gsm: jobMeta.paper_gsm ?? null
    };

    return {
        generated_at: new Date().toISOString(),
        page_signals,
        color_signals,
        ink_signals,
        finishing_signals,
        standards_signals,
        media_requirements,
        warnings,
        // Governance invariants — signals are advisory inputs to machine matching only.
        machine_capability_signals_governance: {
            signals_are_advisory_only: true,
            machine_match_authority: false,
            production_certified: false,
            standard_certified: false,
            compliance_claim_allowed: false
        }
    };
}

module.exports = {
    generateMachineCapabilitySignals,
    // Exposed for testing
    RGB_CODES,
    TAC_EXCEEDED_CODES,
    BLEED_MISSING_CODES,
    CROP_MARKS_MISSING_CODES,
    STANDARD_VALIDATION_PASSED_CODES
};
