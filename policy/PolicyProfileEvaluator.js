'use strict';
/**
 * Phase 72A — PolicyProfileEvaluator
 *
 * Evaluates engine findings / job state against an active policy profile.
 *
 * Output governance:
 *   - profile_passed = true NEVER implies production_certified or standard_certified
 *   - blockers are string codes (not raw paths, PII, or implementation detail)
 *   - warnings are advisory only — they do not block readiness
 */

const { resolveProfile } = require('./PolicyProfileSchema');

// Finding code sets by domain — used to map engine findings → profile constraints
const BLEED_FINDING_CODES = new Set([
    'BLEED_MISSING', 'BLEED_INSUFFICIENT', 'BLEED_BOX_TOO_SMALL',
    'IND_GEO_003', 'IND_GEO_004', 'IND_GEO_005',
    'APPLY_BLEED', 'BLEED_REQUIRED'
]);

const TAC_FINDING_CODES = new Set([
    'COLOR_TOTAL_INK_COVERAGE_EXCEEDED', 'TOTAL_INK_COVERAGE_EXCESSIVE',
    'INK_TOTAL_COVERAGE_EXCESSIVE', 'IND_COLOR_005', 'IND_INK_001',
    'REDUCE_TAC', 'REDUCE_TOTAL_INK_COVERAGE'
]);

const JAVASCRIPT_FINDING_CODES = new Set([
    'PDF_JAVASCRIPT_PRESENT', 'IND_SEC_001', 'STRUCT_JAVASCRIPT_DETECTED',
    'IND_STRUCT_003', 'STRIP_JAVASCRIPT'
]);

const EMBEDDED_FILES_FINDING_CODES = new Set([
    'PDF_EMBEDDED_FILES_PRESENT', 'IND_SEC_003', 'REMOVE_EMBEDDED_FILES'
]);

const LAUNCH_ACTION_FINDING_CODES = new Set([
    'PDF_LAUNCH_ACTION_PRESENT', 'IND_SEC_002', 'REMOVE_LAUNCH_ACTIONS',
    'PDF_DOCUMENT_OPEN_ACTION_PRESENT', 'IND_SEC_004', 'REMOVE_DOCUMENT_OPEN_ACTIONS'
]);

const RGB_FINDING_CODES = new Set([
    'RGB_COLOR_DETECTED', 'COLOR_RGB_IMAGES', 'IND_COLOR_001',
    'RGB_IMAGES_PRESENT', 'IND_IMG_017', 'IND_IMG_004',
    'IMG_RGB_IMAGE_DETECTED', 'CONVERT_IMAGE_RGB_TO_CMYK_SELECTIVE'
]);

const FONT_UNEMBEDDED_CODES = new Set([
    'FONT_NOT_EMBEDDED', 'FONTS_NOT_EMBEDDED', 'MISSING_FONT_EMBEDDING',
    'IND_FONT_001', 'IND_FONT_002', 'EMBED_FONTS'
]);

const TYPE3_FONT_CODES = new Set([
    'TYPE3_FONT_DETECTED', 'TYPE3_FONT_PRESENT', 'IND_FONT_006',
    'OUTLINE_TYPE3_FONTS'
]);

const CROP_MARKS_MISSING_CODES = new Set([
    'CROP_MARKS_MISSING', 'IND_MARK_004', 'ADD_CROP_MARKS'
]);

const STANDARD_VALIDATION_CODES = new Set([
    'PDFX_CLAIMED_BUT_NOT_VALIDATED', 'STANDARD_CLAIM_WITHOUT_VALIDATOR_EVIDENCE',
    'IND_COMPLIANCE_005', 'IND_COMPLIANCE_022', 'STANDARD_VALIDATION_REQUIRED',
    'IND_COMPLIANCE_015'
]);

/**
 * Evaluate a profile against a set of engine findings.
 *
 * @param {Object} profile  - Resolved profile object (from PolicyProfileSchema)
 * @param {Array}  findings - Array of finding objects with { id|code, severity?, tac_value? }
 * @param {Object} [jobMeta] - Optional job-level metadata { detected_standard?, tac_measured? }
 * @returns {Object} policy_profile_governance
 */
function evaluateProfile(profile, findings = [], jobMeta = {}) {
    const resolved = resolveProfile(profile);
    const findingCodes = new Set(findings.map(f => f.id || f.code).filter(Boolean));
    const blockers = [];
    const warnings = [];

    // ── 1. Bleed policy ────────────────────────────────────────────────────
    if (resolved.bleed_policy?.required) {
        const hasBleedFinding = [...BLEED_FINDING_CODES].some(c => findingCodes.has(c));
        if (hasBleedFinding) {
            blockers.push('PROFILE_BLEED_REQUIRED');
        }
    }

    // ── 2. TAC limit ───────────────────────────────────────────────────────
    if (resolved.tac_limit != null) {
        const hasTacFinding = [...TAC_FINDING_CODES].some(c => findingCodes.has(c));
        const measuredTac   = jobMeta.tac_measured ?? null;
        if (hasTacFinding) {
            blockers.push(`PROFILE_TAC_LIMIT_EXCEEDED`);
        } else if (measuredTac !== null && measuredTac > resolved.tac_limit) {
            blockers.push(`PROFILE_TAC_LIMIT_EXCEEDED`);
        }
    }

    // ── 3. Color policy ────────────────────────────────────────────────────
    if (resolved.color_policy?.require_cmyk && !resolved.color_policy?.allow_rgb) {
        const hasRgbFinding = [...RGB_FINDING_CODES].some(c => findingCodes.has(c));
        if (hasRgbFinding) {
            blockers.push('PROFILE_CMYK_REQUIRED');
        }
    }

    // ── 4. Font policy ─────────────────────────────────────────────────────
    if (resolved.font_policy?.require_embedded) {
        const hasUnembedded = [...FONT_UNEMBEDDED_CODES].some(c => findingCodes.has(c));
        if (hasUnembedded) {
            blockers.push('PROFILE_FONTS_MUST_BE_EMBEDDED');
        }
    }
    if (!resolved.font_policy?.allow_type3) {
        const hasType3 = [...TYPE3_FONT_CODES].some(c => findingCodes.has(c));
        if (hasType3) {
            blockers.push('PROFILE_TYPE3_FONTS_NOT_ALLOWED');
        }
    }

    // ── 5. Security policy ─────────────────────────────────────────────────
    if (resolved.security_policy?.no_javascript) {
        if ([...JAVASCRIPT_FINDING_CODES].some(c => findingCodes.has(c))) {
            blockers.push('PROFILE_NO_JAVASCRIPT_VIOLATED');
        }
    }
    if (resolved.security_policy?.no_embedded_files) {
        if ([...EMBEDDED_FILES_FINDING_CODES].some(c => findingCodes.has(c))) {
            blockers.push('PROFILE_NO_EMBEDDED_FILES_VIOLATED');
        }
    }
    if (resolved.security_policy?.no_launch_actions) {
        if ([...LAUNCH_ACTION_FINDING_CODES].some(c => findingCodes.has(c))) {
            blockers.push('PROFILE_NO_LAUNCH_ACTIONS_VIOLATED');
        }
    }

    // ── 6. Page marks policy ───────────────────────────────────────────────
    if (resolved.page_marks_policy?.crop_marks_required) {
        const hasCropMarksMissing = [...CROP_MARKS_MISSING_CODES].some(c => findingCodes.has(c));
        if (hasCropMarksMissing) {
            blockers.push('PROFILE_CROP_MARKS_REQUIRED');
        }
    }

    // ── 7. Standard requirement ────────────────────────────────────────────
    if (resolved.required_standard) {
        const detectedStandard = jobMeta.detected_standard ?? null;
        // If standard is claimed/required but validation not performed → warning
        if (!detectedStandard) {
            warnings.push(`PROFILE_STANDARD_REQUIRED_BUT_NOT_VALIDATED: ${resolved.required_standard}`);
        } else if (detectedStandard !== resolved.required_standard) {
            blockers.push(`PROFILE_STANDARD_MISMATCH`);
            // Extra context in warnings (non-PII, non-path)
            warnings.push(`Profile requires ${resolved.required_standard}, detected: ${detectedStandard}`);
        }
        // Check for validation finding codes
        const hasStandardFinding = [...STANDARD_VALIDATION_CODES].some(c => findingCodes.has(c));
        if (hasStandardFinding && !blockers.includes('PROFILE_STANDARD_MISMATCH')) {
            warnings.push('PROFILE_STANDARD_VALIDATION_INCOMPLETE');
        }
    }

    // ── 8. De-duplicate ────────────────────────────────────────────────────
    const uniqueBlockers  = [...new Set(blockers)];
    const uniqueWarnings  = [...new Set(warnings)];
    const profilePassed   = uniqueBlockers.length === 0;

    return {
        profile_id:   resolved.profile_id,
        profile_label: resolved.label,
        profile_passed:   profilePassed,
        profile_blockers: uniqueBlockers,
        profile_warnings: uniqueWarnings,
        evaluated_at:    new Date().toISOString(),
        // Governance invariants — always false: profile evaluation is NOT a certification authority
        production_certified:      false,
        standard_certified:        false,
        compliance_claim_allowed:  false,
        print_ready_claim_allowed: false
    };
}

/**
 * Convenience: evaluate from an AutofixProcessor-style fix_audit payload.
 * Extracts findings from fix_audit.findings[] or fix_audit.plan[].source_finding.
 */
function evaluateFromFixAudit(profile, fixAudit = {}, jobMeta = {}) {
    const findings = [];

    // From fix_audit.findings[] if present
    if (Array.isArray(fixAudit.findings)) {
        findings.push(...fixAudit.findings);
    }
    // From plan items
    if (Array.isArray(fixAudit.plan)) {
        for (const item of fixAudit.plan) {
            if (item.source_finding) findings.push({ id: item.source_finding });
        }
    }
    // From issues[]
    if (Array.isArray(fixAudit.issues)) {
        findings.push(...fixAudit.issues);
    }

    // Extract tac_measured from findings
    const tacFinding = fixAudit.findings?.find(
        f => TAC_FINDING_CODES.has(f.id || f.code) && (f.tac_value != null || f.measured_tac != null)
    );
    const tacMeasured = tacFinding?.tac_value ?? tacFinding?.measured_tac ?? jobMeta.tac_measured ?? null;

    return evaluateProfile(profile, findings, { ...jobMeta, tac_measured: tacMeasured });
}

module.exports = {
    evaluateProfile,
    evaluateFromFixAudit,
    // Expose finding code sets for testing
    BLEED_FINDING_CODES,
    TAC_FINDING_CODES,
    JAVASCRIPT_FINDING_CODES,
    RGB_FINDING_CODES,
    FONT_UNEMBEDDED_CODES
};
