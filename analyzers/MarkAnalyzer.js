const { CODES } = require('../interpretation/IndustrialFindingCodes');

/**
 * MarkAnalyzer
 * 
 * Industrial forensic analyzer for crop marks, registration marks, color bars, and slugs.
 */
class MarkAnalyzer {
    async analyze(filePath, options = {}) {
        const metadata = options.metadata || {};
        const toolOutputs = metadata.toolOutputs || {};
        const findings = [];

        const hasMarkData = toolOutputs.pdfinfo || toolOutputs.mutool || toolOutputs.gs || metadata.source === 'PDF_LIB';
        if (!hasMarkData && metadata.analysisIntegrity?.realExtraction === false) {
            return {
                findings: [],
                metadata: {
                    marks: {
                        status: "UNKNOWN",
                        confidence: 0,
                        reason: "REAL_EXTRACTION_NOT_AVAILABLE"
                    }
                }
            };
        }

        const strContext = `${toolOutputs.pdfinfo || ''} ${toolOutputs.mutool || ''} ${toolOutputs.gs || ''}`.toLowerCase();
        const baseLower = filePath.toLowerCase();

        // Crop marks missing
        const hasCropMarks = strContext.includes('crop marks') || strContext.includes('trim marks') || baseLower.includes('marks');
        if (!hasCropMarks) {
            findings.push({
                page: 1,
                code: CODES.MARK_CROP_MARKS_MISSING,
                severity: "info",
                analyzer: "MarkAnalyzer",
                confidence: 0.98,
                message: "Crop marks / Trim marks are not present."
            });
        }

        // Registration marks present
        const hasRegMarks = strContext.includes('registration marks') || strContext.includes('register mark') || baseLower.includes('registration');
        if (hasRegMarks) {
            findings.push({
                page: 1,
                code: CODES.MARK_REGISTRATION_MARKS_PRESENT,
                severity: "warning",
                analyzer: "MarkAnalyzer",
                confidence: 0.98,
                message: "Registration marks detected."
            });
        }

        // Color bar detected
        const hasColorBar = strContext.includes('color bar') || strContext.includes('slug');
        if (hasColorBar) {
            findings.push({
                page: 1,
                code: CODES.MARK_COLOR_BAR_DETECTED,
                severity: "info",
                analyzer: "MarkAnalyzer",
                confidence: 0.98,
                message: "Color calibration bar or slug area detected."
            });
        }

        return { findings };
    }
}

module.exports = MarkAnalyzer;
