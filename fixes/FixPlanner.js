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
            } else if (rawStrategy === 'COLOR_TOTAL_INK_COVERAGE_EXCEEDED' || rawStrategy === 'IND_COLOR_005' ||
                       rawStrategy === 'INK_TOTAL_COVERAGE_EXCESSIVE' || rawStrategy === 'IND_INK_001' ||
                       rawStrategy === 'TOTAL_INK_COVERAGE_EXCESSIVE' || rawStrategy === 'REDUCE_TAC') {
                rawStrategy = 'REDUCE_TOTAL_INK_COVERAGE';
            } else if (rawStrategy === 'COLOR_RICH_BLACK_TEXT' || rawStrategy === 'IND_COLOR_008' ||
                       rawStrategy === 'INK_RICH_BLACK_TEXT' || rawStrategy === 'IND_INK_002' ||
                       rawStrategy === 'RICH_BLACK_TEXT') {
                rawStrategy = 'MAP_RICH_BLACK_TEXT_TO_K_ONLY';
            } else if (rawStrategy === 'INK_SMALL_TEXT_RICH_BLACK' || rawStrategy === 'IND_INK_003' ||
                       rawStrategy === 'SMALL_TEXT_RICH_BLACK') {
                rawStrategy = 'DETECT_SMALL_TEXT_RICH_BLACK';
            } else if (rawStrategy === 'COLOR_REGISTRATION_ABUSE' || rawStrategy === 'IND_COLOR_009' ||
                       rawStrategy === 'INK_REGISTRATION_COLOR_MISUSE' || rawStrategy === 'IND_INK_004' ||
                       rawStrategy === 'REGISTRATION_COLOR_MISUSE') {
                rawStrategy = 'MAP_REGISTRATION_COLOR_TO_BLACK';
            } else if (rawStrategy === 'INK_BLACK_TEXT_NOT_K_ONLY' || rawStrategy === 'IND_INK_005' ||
                       rawStrategy === 'BLACK_TEXT_NOT_K_ONLY') {
                rawStrategy = 'NORMALIZE_BLACK_TEXT';
            } else if (rawStrategy === 'RGB_IMAGES_PRESENT' || rawStrategy === 'IND_IMG_017' ||
                       rawStrategy === 'IMG_RGB_IMAGE_DETECTED' || rawStrategy === 'IND_IMG_004') {
                rawStrategy = 'CONVERT_IMAGE_RGB_TO_CMYK_SELECTIVE';
            } else if (rawStrategy === 'UNTAGGED_IMAGE' || rawStrategy === 'IND_IMG_018') {
                rawStrategy = 'TAG_UNTAGGED_IMAGES';
            } else if (rawStrategy === 'IMAGE_ICC_MISMATCH' || rawStrategy === 'IND_IMG_019' ||
                       rawStrategy === 'COLOR_ICC_PROFILE_MISMATCH' || rawStrategy === 'IND_COLOR_007') {
                rawStrategy = 'NORMALIZE_IMAGE_ICC_PROFILE';
            } else if (rawStrategy === 'EXCESSIVE_RESOLUTION_IMAGE' || rawStrategy === 'IND_IMG_020' ||
                       rawStrategy === 'EXCESSIVE_RESOLUTION' || rawStrategy === 'IND_IMG_006') {
                rawStrategy = 'DOWNSAMPLE_EXCESSIVE_RESOLUTION';
            } else if (rawStrategy === 'LOW_RES_IMAGES' || rawStrategy === 'IND_IMG_005' ||
                       rawStrategy === 'IMG_IMAGE_LOW_RESOLUTION' || rawStrategy === 'IND_IMG_001') {
                rawStrategy = 'FLAG_LOW_RES_IMAGES_UNFIXABLE';
            } else if (rawStrategy === 'TRANSPARENCY_PRESENT' || rawStrategy === 'TRANS_TRANSPARENCY_DETECTED' ||
                       rawStrategy === 'TRANSPARENCY_GROUPS' || rawStrategy === 'IND_TRANS_001' ||
                       rawStrategy === 'IND_TRANS_004' || rawStrategy === 'IND_TRANS_005' ||
                       rawStrategy === 'IND_TRANS_008' || rawStrategy === 'IND_TRANS_009' ||
                       rawStrategy === 'RASTERIZATION_RISK' || rawStrategy === 'SOFT_MASK_PRESENT' ||
                       rawStrategy === 'KNOCKOUT_GROUP_PRESENT' || rawStrategy === 'IND_TRANS_006' ||
                       rawStrategy === 'TRANS_SOFT_MASK_DETECTED' || rawStrategy === 'IND_TRANS_003') {
                rawStrategy = 'FLATTEN_TRANSPARENCY';
            } else if (rawStrategy === 'BLEND_MODE_PRESENT' || rawStrategy === 'TRANS_BLEND_MODE_DETECTED' ||
                       rawStrategy === 'IND_TRANS_002' || rawStrategy === 'IND_TRANS_007') {
                rawStrategy = 'NORMALIZE_BLEND_MODES';
            } else if (rawStrategy === 'OVERPRINT_DETECTED' || rawStrategy === 'OVERPRINT_PRESENT' ||
                       rawStrategy === 'OVERPRINT_KNOCKOUT_CONFLICT' || rawStrategy === 'IND_OVERPRINT_001' ||
                       rawStrategy === 'IND_OVERPRINT_002' || rawStrategy === 'IND_OVERPRINT_003') {
                rawStrategy = 'FLATTEN_OVERPRINT';
            } else if (rawStrategy === 'OVERPRINT_MODE_PRESENT' || rawStrategy === 'IND_OVERPRINT_004') {
                rawStrategy = 'SIMULATE_OVERPRINT_PREVIEW';
            } else if (rawStrategy === 'VISUAL_DIFF_REQUIRED' || rawStrategy === 'IND_VISUAL_001' ||
                       rawStrategy === 'RENDERED_PROOF_REQUIRED' || rawStrategy === 'IND_VISUAL_004') {
                rawStrategy = 'GENERATE_VISUAL_CHANGE_REPORT';
            } else if (rawStrategy === 'VISUAL_CHANGE_DETECTED' || rawStrategy === 'IND_VISUAL_002') {
                rawStrategy = 'COMPARE_ORIGINAL_TO_FIXED';
            } else if (rawStrategy === 'VISUAL_DIFF_TOOL_UNAVAILABLE' || rawStrategy === 'IND_VISUAL_003') {
                rawStrategy = 'RENDER_PDF_PAGES';
            } else if (rawStrategy === 'RENDERED_PROOF_GENERATED' || rawStrategy === 'IND_VISUAL_005') {
                rawStrategy = 'GENERATE_PROOF_THUMBNAILS';
            } else if (rawStrategy === 'PROOF_CONTRACT_GENERATED' || rawStrategy === 'IND_PROOF_001' ||
                       rawStrategy === 'PROOF_IDENTITY_STABLE' || rawStrategy === 'IND_PROOF_004') {
                rawStrategy = 'GENERATE_PROOF_APPROVAL_CONTRACT';
            } else if (rawStrategy === 'PROOF_APPROVAL_PENDING' || rawStrategy === 'IND_PROOF_002' ||
                       rawStrategy === 'PROOF_ARTIFACT_HASH_MISSING' || rawStrategy === 'IND_PROOF_003') {
                rawStrategy = 'GENERATE_PROOF_ARTIFACT_HASHES';
            }

            const fixId = normalizeFixId(rawStrategy);
            const cap = getFixCapability(fixId);
            
            if (cap) {
                const implemented = isFixImplemented(fixId);
                let autofixable = isFixAutofixable(fixId, policyMode);
                const isUserFixable = issue.fixable !== false;
                
                // Phase 55A / Phase 68A: Standards Certification guardrail.
                // All standards_certification fixes require real validator evidence before a
                // compliance claim is allowed. validator_available may be 'RUNTIME_DETECTED'
                // (Phase 68A veraPDF), false (scaffolded), or a boolean. In all cases, these
                // fixes are never auto-applied — compliance claim requires human review.
                if (cap.category === 'standards_certification' || cap.category === 'standards') {
                    autofixable = false; // Never auto-applied; validator evidence + human review required
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

                // Phase 64A: Ink governance guardrails — all ink_governance fixes are never auto-applied
                if (cap.category === 'ink_governance') {
                    autofixable = false; // No ink/color fix is safe without evidence-backed visual review
                }

                // Phase 65A: Selective image fix guardrails — visually sensitive image transforms
                // are never auto-applied without evidence-backed visual review; never upscale.
                if (cap.category === 'image_quality' &&
                    (fixId === 'CONVERT_IMAGE_RGB_TO_CMYK_SELECTIVE' || fixId === 'TAG_UNTAGGED_IMAGES' ||
                     fixId === 'NORMALIZE_IMAGE_ICC_PROFILE' || fixId === 'DOWNSAMPLE_EXCESSIVE_RESOLUTION' ||
                     fixId === 'FLAG_LOW_RES_IMAGES_UNFIXABLE')) {
                    autofixable = false; // Selective image transforms require human visual review evidence
                }

                // Phase 66A: Font governance guardrails — font fixes require strong evidence
                // (font source availability, safe encoding mapping); never auto-applied and
                // missing glyphs are never invented.
                if (cap.category === 'font_governance') {
                    autofixable = false; // No font fix is safe without an available font source and human visual review
                }

                // Phase 67A: Transparency / Overprint physical fix guardrails.
                // All transparency_overprint physical fixes are highly visual/destructive:
                // always review_required=true, never production_safe=true, never auto-applied.
                if (cap.category === 'transparency_overprint') {
                    autofixable = false;
                }

                // Phase 69A: Visual proofing guardrails.
                // Visual diff / rendered proof capabilities are evidence generation only:
                // never auto-applied, never imply production/certification/print-ready status.
                if (cap.category === 'visual_proofing') {
                    autofixable = false;
                }

                // Phase 70A: Proof approval contract guardrails.
                // Proof contract / artifact hash capabilities are identity and evidence generation only:
                // never auto-applied, never imply production certification, print-readiness, or standards compliance.
                if (cap.category === 'proof_approval_contract') {
                    autofixable = false;
                }

                // Phase 71A: Production package evidence guardrails.
                // Artifact hash manifest / verification capabilities are identity and evidence
                // generation only: never auto-applied, never imply trust, certification, or
                // production approval, and trust is never inferred from filenames.
                if (cap.category === 'production_package_evidence') {
                    autofixable = false;
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
                    if (cap.category === 'proof_approval_contract') skipReason = "PROOF_CONTRACT_EVIDENCE_ONLY_HUMAN_REVIEW_REQUIRED";
                    else if (cap.category === 'production_package_evidence') skipReason = "PRODUCTION_PACKAGE_EVIDENCE_ONLY_HUMAN_REVIEW_REQUIRED";
                    else if (cap.category === 'visual_proofing') skipReason = "VISUAL_PROOFING_EVIDENCE_ONLY_HUMAN_REVIEW_REQUIRED";
                    else if (cap.category === 'transparency_overprint') skipReason = "TRANSPARENCY_OVERPRINT_VISUAL_REVIEW_REQUIRED";
                    else if (cap.category === 'ink_governance') skipReason = "VISUAL_REVIEW_REQUIRED";
                    else if (cap.category === 'font_governance' && fixId === 'FLAG_MISSING_GLYPHS_UNFIXABLE') skipReason = "MISSING_GLYPHS_UNFIXABLE_NO_SYNTHESIS";
                    else if (cap.category === 'font_governance') skipReason = "FONT_SOURCE_EVIDENCE_REQUIRED";
                    else if (cap.category === 'image_quality' && fixId === 'FLAG_LOW_RES_IMAGES_UNFIXABLE') skipReason = "LOW_RES_UNFIXABLE_NO_UPSCALE";
                    else if (cap.category === 'image_quality' &&
                             (fixId === 'CONVERT_IMAGE_RGB_TO_CMYK_SELECTIVE' || fixId === 'TAG_UNTAGGED_IMAGES' ||
                              fixId === 'NORMALIZE_IMAGE_ICC_PROFILE' || fixId === 'DOWNSAMPLE_EXCESSIVE_RESOLUTION')) skipReason = "VISUAL_REVIEW_REQUIRED";
                    else if (cap.category === 'standards_certification' || cap.category === 'standards') skipReason = "VALIDATOR_REQUIRED";
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

