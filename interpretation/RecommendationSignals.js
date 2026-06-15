'use strict';
/**
 * Phase 75A — Engine Recommendation Signals
 *
 * Derives structured, per-finding signals useful for a downstream
 * recommendation/fix-suggestion layer:
 *   - fixability        (FIXABLE_AUTO / FIXABLE_REVIEW_REQUIRED / NOT_IMPLEMENTED / NOT_FIXABLE)
 *   - risk_level        (LOW / MEDIUM / HIGH / CRITICAL / UNKNOWN)
 *   - visual_sensitivity (true/false)
 *   - missing_tool      (tool name or null)
 *   - validator_required (true/false)
 *   - operator_review_reason (string reason or null)
 *
 * Governance:
 *   - Signals are advisory only. They describe the safety/readiness of a
 *     potential fix; they do not select, rank, or auto-apply any action.
 *   - recommendation_signals never imply production_certified,
 *     standard_certified, or compliance_claim_allowed.
 */

const { normalizeFixId, getFixCapability } = require('../fixes/FixRegistry');

const VISUALLY_SENSITIVE_CATEGORIES = new Set([
    'transparency_overprint', 'ink_governance', 'font_governance', 'visual_proofing'
]);

const IMAGE_VISUAL_FIX_IDS = new Set([
    'CONVERT_IMAGE_RGB_TO_CMYK_SELECTIVE', 'TAG_UNTAGGED_IMAGES',
    'NORMALIZE_IMAGE_ICC_PROFILE', 'DOWNSAMPLE_EXCESSIVE_RESOLUTION'
]);

/**
 * Determine the missing tool (if any) required by a fix capability's toolchain.
 */
function findMissingTool(cap, missingTools) {
    if (!cap || !Array.isArray(cap.toolchain) || cap.toolchain.length === 0) return null;
    if (!Array.isArray(missingTools) || missingTools.length === 0) return null;

    const missingSet = new Set(missingTools.map(t => String(t).toLowerCase()));
    for (const tool of cap.toolchain) {
        if (missingSet.has(String(tool).toLowerCase())) return tool;
    }
    return null;
}

function isVisuallySensitive(issue, cap, fixId) {
    if (issue.visually_sensitive === true) return true;
    if (issue.visually_sensitive === false) return false;
    if (!cap) return false;
    if (VISUALLY_SENSITIVE_CATEGORIES.has(cap.category)) return true;
    if (cap.category === 'image_quality' && IMAGE_VISUAL_FIX_IDS.has(fixId)) return true;
    return false;
}

function normalizeRiskLevel(level) {
    if (!level) return 'UNKNOWN';
    const upper = String(level).toUpperCase();
    return ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(upper) ? upper : 'UNKNOWN';
}

function classifyFixability(cap, missingTool) {
    if (!cap) return 'NOT_FIXABLE';
    if (!cap.implemented) return 'NOT_IMPLEMENTED';
    if (missingTool) return 'FIXABLE_REVIEW_REQUIRED';
    if (cap.validator_required) return 'FIXABLE_REVIEW_REQUIRED';
    if (cap.autofixable && !cap.requires_human_review) return 'FIXABLE_AUTO';
    return 'FIXABLE_REVIEW_REQUIRED';
}

function determineOperatorReviewReason({ cap, fixId, missingTool, validatorRequired, visuallySensitive, issue }) {
    if (!cap) {
        return (issue.fix_method || issue.repairStrategy) ? 'UNKNOWN_FIX_CAPABILITY' : null;
    }
    if (!cap.implemented) return 'FIX_NOT_IMPLEMENTED';
    if (missingTool) return `MISSING_TOOL:${missingTool}`;
    if (validatorRequired) return 'VALIDATOR_REQUIRED';
    if (visuallySensitive) return 'VISUAL_REVIEW_REQUIRED';
    if (cap.requires_human_review) return 'HUMAN_REVIEW_REQUIRED';
    if (issue.review_required === true) return 'REVIEW_REQUIRED';
    return null;
}

/**
 * Build a recommendation signal object for a single normalized finding.
 *
 * @param {Object} issue - Normalized finding (from IssueNormalizer), with
 *                          id/code/fixable/fix_method/repairStrategy/
 *                          safeToAutofix/destructiveFixRisk/visually_sensitive/etc.
 * @param {Array}  missingTools - List of tool names unavailable in this environment.
 * @returns {Object} Per-finding recommendation signal.
 */
function buildFindingSignal(issue, missingTools = []) {
    const rawStrategy = issue.repairStrategy || issue.fix_method || issue.recommended_fix || null;
    const fixId = rawStrategy ? normalizeFixId(rawStrategy) : null;
    const cap = fixId ? getFixCapability(fixId) : null;

    const missingTool = findMissingTool(cap, missingTools);
    const validatorRequired = cap?.validator_required === true;
    const visuallySensitive = isVisuallySensitive(issue, cap, fixId);
    const riskLevel = normalizeRiskLevel(issue.destructiveFixRisk || cap?.risk_level);
    const fixability = classifyFixability(cap, missingTool);
    const operatorReviewReason = determineOperatorReviewReason({
        cap, fixId, missingTool, validatorRequired, visuallySensitive, issue
    });

    return {
        finding_id: issue.id || issue.code || null,
        finding_code: issue.code || issue.id || null,
        fix_id: fixId,
        fixability,
        risk_level: riskLevel,
        visual_sensitivity: visuallySensitive,
        missing_tool: missingTool,
        validator_required: validatorRequired,
        operator_review_reason: operatorReviewReason
    };
}

/**
 * Generate document-level recommendation signals from normalized findings.
 *
 * @param {Object} metadata - PreflightEngine metadata (analysisIntegrity, ...)
 * @param {Array}  issues   - Normalized findings (each with `id`/`code` and fix metadata)
 * @returns {Object} recommendation_signals
 */
function generateRecommendationSignals(metadata = {}, issues = []) {
    const missingTools = metadata.analysisIntegrity?.missingTools || [];
    const findings = (Array.isArray(issues) ? issues : []).map(issue => buildFindingSignal(issue, missingTools));

    const summary = {
        total_findings: findings.length,
        fixable_auto_count: findings.filter(f => f.fixability === 'FIXABLE_AUTO').length,
        fixable_review_required_count: findings.filter(f => f.fixability === 'FIXABLE_REVIEW_REQUIRED').length,
        not_implemented_count: findings.filter(f => f.fixability === 'NOT_IMPLEMENTED').length,
        not_fixable_count: findings.filter(f => f.fixability === 'NOT_FIXABLE').length,
        visual_review_required_count: findings.filter(f => f.visual_sensitivity === true).length,
        validator_required_count: findings.filter(f => f.validator_required === true).length,
        missing_tool_count: findings.filter(f => f.missing_tool !== null).length
    };

    return {
        generated_at: new Date().toISOString(),
        findings,
        summary,
        // Governance invariants — signals are advisory inputs to a recommendation
        // layer only. They never select, rank, or auto-apply fixes, and never
        // imply production or standards certification.
        recommendation_signals_governance: {
            signals_are_advisory_only: true,
            recommendation_authority: false,
            auto_apply_authority: false,
            production_certified: false,
            standard_certified: false,
            compliance_claim_allowed: false
        }
    };
}

module.exports = {
    generateRecommendationSignals,
    // Exposed for testing
    buildFindingSignal,
    findMissingTool,
    isVisuallySensitive,
    classifyFixability
};
