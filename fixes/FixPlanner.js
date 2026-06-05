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
            const rawStrategy = issue.repairStrategy || issue.fix_method || issue.recommended_fix || issue.code || issue.id;
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
                
                const planned = implemented && autofixable && isUserFixable;
                const skipped = !planned;
                let skipReason = null;
                
                if (!implemented) skipReason = "FIX_NOT_IMPLEMENTED";
                else if (!isUserFixable) skipReason = "FINDING_MARKED_UNFIXABLE";
                else if (!autofixable) skipReason = (cap.category === 'standards_certification' || cap.category === 'standards') ? "VALIDATOR_REQUIRED" : "POLICY_MODE_RESTRICTION";

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

