/**
 * IssueNormalizer
 * 
 * Standardizes technical findings into canonical codes and severities.
 */
class IssueNormalizer {
    static normalize(findings) {
        return findings.map(f => {
            const rawCode = f.code || f.id;
            const mappedCode = this.mapCode(rawCode);
            
            const isTrimBox = [
                'GEOM_TRIMBOX_MISSING',
                'TRIMBOX_MISSING',
                'IND_GEOM_003',
                'IND_TRIM',
                'TRIM_BOX_ANOMALY'
            ].includes(rawCode) || mappedCode === 'TRIMBOX_MISSING';
            
            const normalized = {
                id: mappedCode,
                severity: f.severity || 'warning',
                message: f.message || 'Technical preflight finding',
                page: f.page,
                source: f.source,
                geometry: f.geometry,
                confidence: f.confidence,
                fix_method: f.fix_method || null
            };

            if (isTrimBox) {
                normalized.id = 'TRIMBOX_MISSING';
                normalized.category = 'GEOMETRY';
                normalized.fixable = true;
                normalized.fix_method = 'REBUILD_TRIMBOX';
                normalized.repairStrategy = 'REBUILD_TRIMBOX';
            }

            return normalized;
        });
    }

    static mapCode(code) {
        const map = {
            'GEOM_BLEED_MISSING': 'BLEED_MISSING',
            'GEOM_TRIMBOX_MISSING': 'TRIMBOX_MISSING',
            'IND_GEOM_003': 'TRIMBOX_MISSING',
            'IND_TRIM': 'TRIMBOX_MISSING',
            'TRIM_BOX_ANOMALY': 'TRIMBOX_MISSING',
            'COLOR_MISMATCH': 'COLOR_PROFILE_MISMATCH',
            'LOW_RES': 'IMAGE_LOW_RESOLUTION'
        };
        return map[code] || code;
    }
}

module.exports = IssueNormalizer;
