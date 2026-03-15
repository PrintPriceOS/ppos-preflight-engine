/**
 * IssueNormalizer
 * 
 * Standardizes technical findings into canonical codes and severities.
 */
class IssueNormalizer {
    static normalize(findings) {
        return findings.map(f => ({
            id: this.mapCode(f.code || f.id),
            severity: f.severity || 'warning',
            message: f.message || 'Technical preflight finding',
            page: f.page,
            fix_method: f.fix_method || null
        }));
    }

    static mapCode(code) {
        const map = {
            'GEOM_BLEED_MISSING': 'BLEED_MISSING',
            'GEOM_TRIMBOX_MISSING': 'TRIMBOX_MISSING',
            'COLOR_MISMATCH': 'COLOR_PROFILE_MISMATCH',
            'LOW_RES': 'IMAGE_LOW_RESOLUTION'
        };
        return map[code] || code;
    }
}

module.exports = IssueNormalizer;
