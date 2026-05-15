/**
 * FixPlanner
 * 
 * Maps findings to technical fix strategies.
 * Source: Refactored from autofixRegistry.js
 */
const { CODES: FindingCodes } = require('../interpretation/IndustrialFindingCodes');

class FixPlanner {
    constructor() {
        this.strategyMap = {
            'BLEED_MISSING': 'ADD_BLEED',
            'COLOR_PROFILE_MISMATCH': 'CONVERT_CMYK',
            'TRANSPARENCY_PRESENT': 'FLATTEN_PDF',
            'TRIMBOX_MISSING': 'REBUILD_TRIMBOX',
            'TRIMBOX_INVALID': 'REBUILD_TRIMBOX',
            'TRIMBOX_OUTSIDE_MEDIABOX': 'REBUILD_TRIMBOX',
            'GEOM_TRIMBOX_MISSING': 'REBUILD_TRIMBOX',
            'TRIM_BOX_ANOMALY': 'REBUILD_TRIMBOX',
            'BLEEDBOX_MISSING': 'APPLY_BLEED',
            'IND_COLOR_001': 'CONVERT_CMYK',
            'IND_COLOR_002': 'INJECT_OUTPUT_INTENT',
            'IND_COLOR_006': 'INJECT_OUTPUT_INTENT',
            [FindingCodes.GEOM_BLEED_MISSING]: 'APPLY_BLEED',
            [FindingCodes.GEOM_BLEED_INSUFFICIENT]: 'APPLY_BLEED',
            [FindingCodes.GEOM_BLEEDBOX_MISSING]: 'APPLY_BLEED',
            [FindingCodes.GEOM_TRIMBOX_MISSING]: 'REBUILD_TRIMBOX',
            [FindingCodes.GEOM_TRIMBOX_INVALID]: 'REBUILD_TRIMBOX',
            [FindingCodes.GEOM_TRIMBOX_OUTSIDE_MEDIABOX]: 'REBUILD_TRIMBOX',
            [FindingCodes.COLOR_RGB_OBJECTS_DETECTED]: 'CONVERT_CMYK',
            [FindingCodes.COLOR_ICC_PROFILE_MISSING]: 'INJECT_OUTPUT_INTENT',
            [FindingCodes.COLOR_MIXED_COLOR_SPACES]: 'CONVERT_CMYK',
            [FindingCodes.COLOR_OUTPUT_INTENT_MISSING]: 'INJECT_OUTPUT_INTENT',
            [FindingCodes.TRANS_TRANSPARENCY_DETECTED]: 'FLATTEN_PDF'
        };
    }

    plan(issues) {
        const plan = [];
        if (!Array.isArray(issues)) return plan;

        issues.forEach(issue => {
            // Respect repairStrategy, fix_method, recommended_fix if available, otherwise look up canonical code/id
            const strategy = issue.repairStrategy || issue.fix_method || issue.recommended_fix || this.strategyMap[issue.code] || this.strategyMap[issue.id];
            
            // Plan if strategy is known to ensure deterministic reporting
            if (strategy) {
                plan.push({
                    issue_id: issue.id || issue.code,
                    issue_code: issue.code || issue.id,
                    strategy,
                    status: 'PENDING',
                    fixRequired: issue.fixRequired ?? (issue.severity === 'error' || issue.severity === 'critical'),
                    safeToAutofix: issue.safeToAutofix ?? (issue.fixable !== false),
                    destructiveFixRisk: issue.destructiveFixRisk || "LOW"
                });
            }
        });

        // Deduplicate plan strategies to avoid running e.g. CONVERT_CMYK 5 times for 5 RGB objects
        const uniquePlan = [];
        const seenStrategies = new Set();
        for (const item of plan) {
            if (!seenStrategies.has(item.strategy)) {
                seenStrategies.add(item.strategy);
                uniquePlan.push(item);
            } else {
                // If already seen, append the issue_code to the existing plan step
                const existing = uniquePlan.find(p => p.strategy === item.strategy);
                if (existing) {
                    existing.associated_issues = existing.associated_issues || [existing.issue_code];
                    if (!existing.associated_issues.includes(item.issue_code)) {
                        existing.associated_issues.push(item.issue_code);
                    }
                }
            }
        }

        return uniquePlan;
    }
}

module.exports = FixPlanner;
