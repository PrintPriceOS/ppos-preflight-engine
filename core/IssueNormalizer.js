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
            
            const fixableGeometry = [
                'TRIMBOX_MISSING',
                'TRIMBOX_INVALID',
                'TRIMBOX_OUTSIDE_MEDIABOX'
            ].includes(mappedCode);
            
            const normalized = {
                id: mappedCode,
                code: rawCode,
                analyzer: f.analyzer || 'PreflightEngine',
                severity: f.severity || (mappedCode.endsWith('_WARNING') ? 'warning' : 'error'),
                category: f.category || null,
                message: this.MESSAGES[mappedCode] || this.MESSAGES[rawCode] || f.message || 'Technical preflight finding',
                page: f.page !== undefined ? f.page : null,
                source: f.source,
                geometry: f.geometry,
                confidence: f.confidence !== undefined ? f.confidence : ((f.context && f.context.confidence) || 0.98),
                fixable: f.fixable !== undefined ? f.fixable : false,
                recommended_fix: f.recommended_fix || f.fix_method || null,
                fixRequired: f.fixRequired !== undefined ? f.fixRequired : (f.context && f.context.fixRequired) || false,
                safeToAutofix: f.safeToAutofix !== undefined ? f.safeToAutofix : (f.context && f.context.safeToAutofix) || false,
                destructiveFixRisk: f.destructiveFixRisk || (f.context && f.context.destructiveFixRisk) || null,
                fix_method: f.fix_method || f.recommended_fix || null,
                evidence: f.evidence || null
            };

            if (fixableGeometry) {
                normalized.category = 'GEOMETRY';
                normalized.fixable = true;
                normalized.fix_method = 'REBUILD_TRIMBOX';
                normalized.recommended_fix = 'REBUILD_TRIMBOX';
                normalized.repairStrategy = 'REBUILD_TRIMBOX';
                if (normalized.confidence === 0.8) normalized.confidence = 0.95;
                normalized.fixRequired = true;
                normalized.safeToAutofix = true;
                normalized.destructiveFixRisk = "LOW";
            }

            if (['BLEED_MISSING', 'BLEED_INSUFFICIENT', 'BLEEDBOX_MISSING'].includes(mappedCode)) {
                normalized.category = 'GEOMETRY';
                normalized.fixable = true;
                normalized.fix_method = 'APPLY_BLEED';
                normalized.recommended_fix = 'APPLY_BLEED';
                normalized.repairStrategy = 'APPLY_BLEED';
                normalized.confidence = 0.9;
                normalized.fixRequired = false;
                normalized.safeToAutofix = true;
                normalized.destructiveFixRisk = 'MEDIUM';
            }

            if (mappedCode === 'PAGE_SIZE_INCONSISTENT' || rawCode === 'IND_GEOM_009' || rawCode === 'IND_GEOM_010' || rawCode === 'IND_GEOM_011') {
                normalized.category = 'GEOMETRY';
                normalized.fixable = false;
                normalized.confidence = 0.95;
                normalized.fixRequired = false;
                normalized.safeToAutofix = false;
            }

            if (mappedCode === 'TRIM_MARGIN_WARNING' || mappedCode === 'TRIM_MARKS_NEAR_LIVE_AREA') {
                normalized.category = 'GEOMETRY';
                normalized.fixable = false;
                normalized.confidence = 0.5;
                normalized.fixRequired = false;
                normalized.safeToAutofix = false;
            }

            if (rawCode?.startsWith('IND_COLOR')) normalized.category = 'COLOR';
            if (rawCode?.startsWith('IND_FONT')) normalized.category = 'FONT';
            if (rawCode?.startsWith('IND_IMG')) normalized.category = 'IMAGE';
            if (rawCode?.startsWith('IND_TRANS')) normalized.category = 'TRANSPARENCY';
            if (rawCode?.startsWith('IND_OVERPRINT')) normalized.category = 'OVERPRINT';
            if (rawCode?.startsWith('IND_MARK')) normalized.category = 'MARK';
            if (rawCode?.startsWith('IND_COMPLIANCE')) normalized.category = 'COMPLIANCE';
            if (rawCode?.startsWith('IND_STRUCT')) normalized.category = 'STRUCTURAL';
            if (rawCode?.includes('INTEGRITY')) normalized.category = 'INTEGRITY';

            return normalized;
        });
    }

    static get MESSAGES() {
        return {
            'INTENT_BOOK':                 'Book / Catalog Intent Detected',
            'HEURISTIC_TEXT_OUTLINED':     'Text Possibly Converted to Outlines',
            'BLEED_MISSING':               'Bleed Zone Missing',
            'BLEED_INSUFFICIENT':          'Insufficient Bleed (< 3mm)',
            'TRIMBOX_MISSING':             'TrimBox Not Defined',
            'TRIMBOX_INVALID':             'Invalid TrimBox Dimensions',
            'TRIMBOX_OUTSIDE_MEDIABOX':    'TrimBox Extends Outside MediaBox',
            'TRIM_MARGIN_WARNING':         'Trim Margin Too Narrow',
            'TRIM_MARKS_NEAR_LIVE_AREA':   'Trim Marks Overlap Live Area',
            'COLOR_PROFILE_MISMATCH':      'Color Profile Mismatch',
            'IMAGE_LOW_RESOLUTION':        'Low Resolution Image',
            'BLEEDBOX_MISSING':            'BleedBox Not Defined',
            'PAGE_SIZE_INCONSISTENT':      'Inconsistent Page Sizes Detected',
            
            // New Industrial Mappings
            'IND_COLOR_001': 'RGB Objects Detected',
            'IND_COLOR_002': 'ICC Profile Missing',
            'IND_COLOR_003': 'Mixed Color Spaces Detected',
            'IND_COLOR_004': 'Spot Color Detected',
            'IND_COLOR_005': 'Total Ink Coverage (TAC) Exceeded',
            'IND_COLOR_006': 'OutputIntent Missing',
            'IND_COLOR_007': 'ICC Profile Mismatch',
            'IND_COLOR_008': 'Rich Black Text Detected',
            'IND_COLOR_009': 'Registration Color Abuse',
            'IND_FONT_001': 'Font Not Embedded',
            'IND_FONT_002': 'Font Subset Detected',
            'IND_FONT_003': 'Type3 Font Detected',
            'IND_FONT_004': 'Missing Glyph Detected',
            'IND_IMG_001': 'Image Low Resolution',
            'IND_IMG_002': 'Image Excessive Resolution',
            'IND_IMG_003': 'JPEG Artifacts Detected',
            'IND_IMG_004': 'RGB Image Detected',
            'IND_TRANS_001': 'Live Transparency Detected',
            'IND_TRANS_002': 'Blend Mode Detected',
            'IND_TRANS_003': 'Soft Mask Detected',
            'IND_OVERPRINT_001': 'Overprint Detected',
            'IND_OVERPRINT_002': 'Knockout Conflict',
            'IND_MARK_001': 'Crop Marks Missing',
            'IND_MARK_002': 'Registration Marks Present',
            'IND_MARK_003': 'Color Bar Detected',
            'IND_GEOM_010': 'Page Rotation Detected',
            'IND_GEOM_011': 'Mixed Page Orientation',
            'IND_GEOM_012': 'Hairline / Thin Stroke Detected',
            'IND_COMPLIANCE_001': 'PDF/X Compliance Missing',
            'IND_COMPLIANCE_002': 'PDF/X OutputCondition Mismatch / Invalid',
            'IND_STRUCT_001': 'Annotations Present',
            'IND_STRUCT_002': 'Interactive Form / AcroForm Detected',
            'IND_STRUCT_003': 'JavaScript Embedded Action Detected',
            'IND_STRUCT_004': 'Broken XREF / Incremental Save Anomaly',
            'IND_STRUCT_005': 'Object Stream / Cross-Reference Issue',
            'IND_INTEGRITY_DEGRADED': 'Forensic Extraction Degraded',
            'IND_INTEGRITY_EXTRACTION_ERROR': 'Extraction Probe Failure',
            'IND_INTEGRITY_MISSING_TOOL': 'Required Industrial Tool Missing'
        };
    }

    static mapCode(code) {
        const map = {
            'GEOM_BLEED_MISSING': 'BLEED_MISSING',
            'IND_GEOM_001': 'BLEED_INSUFFICIENT',
            'IND_GEOM_002': 'BLEED_MISSING',
            'IND_GEOM_004': 'BLEEDBOX_MISSING',
            'GEOM_BLEEDBOX_MISSING': 'BLEEDBOX_MISSING',
            'IND_GEOM_009': 'PAGE_SIZE_INCONSISTENT',
            'GEOM_PAGE_SIZE_INCONSISTENT': 'PAGE_SIZE_INCONSISTENT',
            'GEOM_TRIMBOX_MISSING': 'TRIMBOX_MISSING',
            'IND_GEOM_003': 'TRIMBOX_MISSING',
            'IND_GEOM_005': 'TRIMBOX_INVALID',
            'IND_GEOM_006': 'TRIMBOX_OUTSIDE_MEDIABOX',
            'IND_GEOM_007': 'TRIM_MARGIN_WARNING',
            'IND_GEOM_008': 'TRIM_MARKS_NEAR_LIVE_AREA',
            'IND_TRIM': 'TRIMBOX_MISSING',
            'TRIM_BOX_ANOMALY': 'TRIMBOX_MISSING',
            'COLOR_MISMATCH': 'COLOR_PROFILE_MISMATCH',
            'LOW_RES': 'IMAGE_LOW_RESOLUTION'
        };
        return map[code] || code;
    }
}

module.exports = IssueNormalizer;
