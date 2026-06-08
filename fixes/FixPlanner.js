/**
 * FixPlanner
 * 
 * Maps findings to technical fix strategies.
 * Source: Refactored from autofixRegistry.js
 */
const { normalizeFixId, getFixCapability, isFixImplemented, isFixAutofixable } = require('./FixRegistry');

class FixPlanner {
    constructor() {
    }

    plan(issues, policyMode = "SAFE") {
        const plan = [];
        if (!Array.isArray(issues)) return plan;

        issues.forEach(issue => {
            let rawStrategy = issue.repairStrategy || issue.fix_method || issue.recommended_fix || issue.code || issue.id;

            // Phase 61A planning rules: map structural and metadata finding codes
            if (rawStrategy === 'IND_STRUCT_007' || rawStrategy === 'OBJECT_STREAMS_INCONSISTENT' || 
                rawStrategy === 'IND_STRUCT_008' || rawStrategy === 'PDF_STRUCTURE_NEEDS_NORMALIZATION') {
                rawStrategy = 'NORMALIZE_OBJECT_STREAMS';
            } else if (rawStrategy === 'IND_COMPLIANCE_005' || rawStrategy === 'PDFX_CLAIMED_BUT_NOT_VALIDATED' || 
                       rawStrategy === 'IND_COMPLIANCE_022' || rawStrategy === 'STANDARD_CLAIM_WITHOUT_VALIDATOR_EVIDENCE') {
                rawStrategy = 'REVOKE_FALSE_CERTIFICATION';
            } else if (rawStrategy === 'IND_COMPLIANCE_006' || rawStrategy === 'PDFX_METADATA_CONFLICT') {
                rawStrategy = 'STRIP_INVALID_PDFX_METADATA';
            } else if (rawStrategy === 'IND_COMPLIANCE_007' || rawStrategy === 'PDFA_METADATA_CONFLICT') {
                rawStrategy = 'STRIP_INVALID_PDFA_METADATA';
            } else if (rawStrategy === 'IND_COMPLIANCE_015' || rawStrategy === 'STANDARD_VALIDATION_REQUIRED') {
                rawStrategy = 'GENERATE_STANDARD_VALIDATION_REPORT_INTERNAL';
            } else if (rawStrategy === 'CROP_MARKS_MISSING' || rawStrategy === 'IND_MARK_004') {
                rawStrategy = 'ADD_CROP_MARKS';
            } else if (rawStrategy === 'CROP_MARKS_INVALID' || rawStrategy === 'IND_MARK_005' || 
                       rawStrategy === 'PAGE_MARKS_INCONSISTENT' || rawStrategy === 'IND_MARK_010') {
                rawStrategy = 'NORMALIZE_PAGE_MARKS';
            } else if (rawStrategy === 'REGISTRATION_MARKS_PRESENT' || rawStrategy === 'IND_MARK_007') {
                rawStrategy = 'REMOVE_REGISTRATION_MARKS';
            } else if (rawStrategy === 'PDF_JAVASCRIPT_PRESENT' || rawStrategy === 'IND_SEC_001' || rawStrategy === 'STRUCT_JAVASCRIPT_DETECTED' || rawStrategy === 'IND_STRUCT_003') {
                rawStrategy = 'STRIP_JAVASCRIPT';
            } else if (rawStrategy === 'PDF_LAUNCH_ACTION_PRESENT' || rawStrategy === 'IND_SEC_002') {
                rawStrategy = 'REMOVE_LAUNCH_ACTIONS';
            } else if (rawStrategy === 'PDF_EMBEDDED_FILES_PRESENT' || rawStrategy === 'IND_SEC_003') {
                rawStrategy = 'REMOVE_EMBEDDED_FILES';
            } else if (rawStrategy === 'PDF_DOCUMENT_OPEN_ACTION_PRESENT' || rawStrategy === 'IND_SEC_004') {
                rawStrategy = 'REMOVE_DOCUMENT_OPEN_ACTIONS';
            } else if (rawStrategy === 'PDF_PAGE_OPEN_ACTION_PRESENT' || rawStrategy === 'IND_SEC_005') {
                rawStrategy = 'REMOVE_PAGE_OPEN_ACTIONS';
            } else if (rawStrategy === 'PDF_ANNOTATIONS_PRESENT' || rawStrategy === 'IND_SEC_006' ||
                       rawStrategy === 'ANNOTATION_FLATTENING_REQUIRED' || rawStrategy === 'IND_SEC_012' ||
                       rawStrategy === 'STRUCT_ANNOTATIONS_DETECTED' || rawStrategy === 'IND_STRUCT_001') {
                rawStrategy = 'FLATTEN_ANNOTATIONS';
            } else if (rawStrategy === 'PDF_ACROFORMS_PRESENT' || rawStrategy === 'IND_SEC_007' ||
                       rawStrategy === 'FORM_FLATTENING_REQUIRED' || rawStrategy === 'IND_SEC_013' ||
                       rawStrategy === 'STRUCT_ACROFORM_DETECTED' || rawStrategy === 'IND_STRUCT_002') {
                rawStrategy = 'FLATTEN_FORMS';
            } else if (rawStrategy === 'PDF_XFA_FORMS_PRESENT' || rawStrategy === 'IND_SEC_008') {
                rawStrategy = 'FLATTEN_FORMS';
            }

            const fixId = normalizeFixId(rawStrategy);
            const cap = getFixCapability(fixId);
            
            if (cap) {
                const implemented = isFixImplemented(fixId);
                let autofixable = isFixAutofixable(fixId, policyMode);
                const isUserFixable = issue.fixable !== false;
                
                // Phase 55A: Standards Certification guardrail
                if (cap.category === 'standards_certification' || cap.category === 'standards') {
                    if (policyMode === "SAFE" && cap.validator_required && !cap.validator_available) {
                        autofixable = false;
                    }
                }
                
                // Phase 62A: Page Marks guardrails
                if (cap.category === 'page_marks') {
                    if (policyMode === "SAFE") {
                        autofixable = false; // Cannot run in SAFE mode
                    }
                    if (fixId === 'ADD_CROP_MARKS') {
                        // If finding is insufficient margin or trimbox missing/required
                        if (issue.id === 'INSUFFICIENT_MARGIN_FOR_CROP_MARKS' || issue.id === 'IND_MARK_013' ||
                            issue.id === 'TRIMBOX_REQUIRED_FOR_MARKS' || issue.id === 'IND_MARK_012') {
                            autofixable = false;
                        }
                    }
                    if (issue.id === 'PAGE_MARKS_UNCERTAIN_GEOMETRY' || issue.id === 'IND_MARK_011') {
                        autofixable = false;
                    }
                }

                // Phase 63A: PDF Security / Interactive Object guardrails
                if (cap.category === 'pdf_security_interactivity') {
                    if ((fixId === 'FLATTEN_ANNOTATIONS' || fixId === 'FLATTEN_FORMS') &&
                        (issue.id === 'INTERACTIVE_CONTENT_UNSAFE_TO_FLATTEN' || issue.id === 'IND_SEC_014' ||
                         issue.id === 'PDF_XFA_FORMS_PRESENT' || issue.id === 'IND_SEC_008' ||
                         issue.id === 'PDF_UNSAFE_INTERACTIVE_OBJECTS' || issue.id === 'IND_SEC_016')) {
                        autofixable = false;
                    }
                }
                
                const planned = implemented && autofixable && isUserFixable;
                const skipped = !planned;
                let skipReason = null;
                
                if (!implemented) skipReason = "FIX_NOT_IMPLEMENTED";
                else if (!isUserFixable) skipReason = "FINDING_MARKED_UNFIXABLE";
                else if (!autofixable) {
                    if (cap.category === 'standards_certification' || cap.category === 'standards') skipReason = "VALIDATOR_REQUIRED";
                    else if (cap.category === 'page_marks') {
                        if (policyMode === "SAFE") skipReason = "SAFE_MODE_RESTRICTION";
                        else if (issue.id === 'INSUFFICIENT_MARGIN_FOR_CROP_MARKS' || issue.id === 'IND_MARK_013') skipReason = "INSUFFICIENT_MARGIN";
                        else if (issue.id === 'TRIMBOX_REQUIRED_FOR_MARKS' || issue.id === 'IND_MARK_012') skipReason = "TRIMBOX_MISSING";
                        else if (issue.id === 'PAGE_MARKS_UNCERTAIN_GEOMETRY' || issue.id === 'IND_MARK_011') skipReason = "UNCERTAIN_GEOMETRY";
                        else skipReason = "POLICY_MODE_RESTRICTION";
                    } else if (cap.category === 'pdf_security_interactivity' &&
                               (fixId === 'FLATTEN_ANNOTATIONS' || fixId === 'FLATTEN_FORMS') &&
                               (issue.id === 'INTERACTIVE_CONTENT_UNSAFE_TO_FLATTEN' || issue.id === 'IND_SEC_014' ||
                                issue.id === 'PDF_XFA_FORMS_PRESENT' || issue.id === 'IND_SEC_008' ||
                                issue.id === 'PDF_UNSAFE_INTERACTIVE_OBJECTS' || issue.id === 'IND_SEC_016')) {
                        skipReason = "UNSAFE_TO_FLATTEN";
                    } else skipReason = "POLICY_MODE_RESTRICTION";
                }

                plan.push({
                    fix_id: fixId,
                    detected: true,
                    planned: planned,
                    executable: planned,
                    skipped: skipped,
                    skip_reason: skipReason,
                    risk_level: cap.risk_level,
                    requires_human_review: cap.requires_human_review,
                    implemented: implemented,
                    autofixable: cap.autofixable,
                    policy_mode: policyMode,
                    source_finding: issue.id || issue.code,
                    // Legacy properties needed by upstream
                    strategy: fixId,
                    status: 'PENDING',
                    fixRequired: issue.fixRequired ?? (issue.severity === 'error' || issue.severity === 'critical'),
                    safeToAutofix: planned,
                    destructiveFixRisk: cap.risk_level === 'HIGH' ? 'HIGH' : (cap.risk_level === 'MEDIUM' ? 'MEDIUM' : 'LOW'),
                    requiresExplicitReviewMode: cap.requires_human_review
                });
            } else {
                // If it's completely unknown but somehow passed as a strategy
                if (rawStrategy && rawStrategy !== issue.code && rawStrategy !== issue.id) {
                     plan.push({
                        fix_id: rawStrategy,
                        detected: true,
                        planned: false,
                        executable: false,
                        skipped: true,
                        skip_reason: "UNKNOWN_FIX_CAPABILITY",
                        risk_level: "HIGH",
                        requires_human_review: true,
                        implemented: false,
                        autofixable: false,
                        policy_mode: policyMode,
                        source_finding: issue.id || issue.code,
                        strategy: rawStrategy,
                        status: 'PENDING',
                        safeToAutofix: false
                     });
                }
            }
        });

        // Deduplicate plan strategies
        const uniquePlan = [];
        const seenStrategies = new Set();
        for (const item of plan) {
            if (!seenStrategies.has(item.fix_id)) {
                seenStrategies.add(item.fix_id);
                uniquePlan.push(item);
            } else {
                const existing = uniquePlan.find(p => p.fix_id === item.fix_id);
                if (existing) {
                    existing.associated_issues = existing.associated_issues || [existing.source_finding];
                    if (!existing.associated_issues.includes(item.source_finding)) {
                        existing.associated_issues.push(item.source_finding);
                    }
                }
            }
        }

        return uniquePlan;
    }
}

module.exports = FixPlanner;

