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
                partial: true,
                status: "PARTIAL",
                metadata: {
                    marks: {
                        status: "PARTIAL",
                        confidence: 0,
                        reason: "REAL_EXTRACTION_NOT_AVAILABLE"
                    }
                }
            };
        }

        const strContext = `${toolOutputs.pdfinfo || ''} ${toolOutputs.mutool || ''} ${toolOutputs.gs || ''}`.toLowerCase();

        const findEvidence = (keywords) => {
            for (const [tool, output] of Object.entries(toolOutputs)) {
                if (!output) continue;
                const lower = output.toLowerCase();
                for (const kw of keywords) {
                    if (lower.includes(kw)) {
                        const lines = output.split('\n');
                        const matchingLine = lines.find(l => l.toLowerCase().includes(kw)) || kw;
                        return { tool, source: 'CLI_PROBE', raw: matchingLine.trim() };
                    }
                }
            }
            return { tool: 'composite_probe', source: metadata.source || 'CLI_PROBE', raw: keywords[0] };
        };

        // Crop marks missing — only emit when policy explicitly requires marks.
        // Default: suppress. Book interiors (≥48 pages) always suppress.
        const hasCropMarks = strContext.includes('crop marks') || strContext.includes('trim marks');
        const requiresCropMarks = options.requiresCropMarks === true ||
            options.policy?.requiresCropMarks === true;
        const isBookInterior = (metadata.pages || 0) >= 48;

        if (!hasCropMarks && requiresCropMarks && !isBookInterior) {
            findings.push({
                page: 1,
                code: CODES.MARK_CROP_MARKS_MISSING,
                severity: "info",
                category: "MARK",
                analyzer: "MarkAnalyzer",
                confidence: 0.98,
                fixable: false,
                recommended_fix: null,
                message: "Crop marks / Trim marks are not present.",
                evidence: {
                    tool: 'pdfinfo / mutool / gs',
                    source: metadata.source || 'CLI_PROBE',
                    page: 1,
                    confidence: 0.98,
                    raw: 'Crop marks absent from structure context'
                }
            });
        }

        // Registration marks present
        const hasRegMarks = strContext.includes('registration marks') || strContext.includes('register mark');
        if (hasRegMarks) {
            const ev = findEvidence(['registration marks', 'register mark']);
            findings.push({
                page: 1,
                code: CODES.MARK_REGISTRATION_MARKS_PRESENT,
                severity: "warning",
                category: "MARK",
                analyzer: "MarkAnalyzer",
                confidence: 0.98,
                fixable: false,
                recommended_fix: null,
                message: "Registration marks detected.",
                evidence: {
                    tool: ev.tool,
                    source: ev.source,
                    page: 1,
                    confidence: 0.98,
                    raw: ev.raw
                }
            });
        }

        // Color bar detected
        const hasColorBar = strContext.includes('color bar') || strContext.includes('slug');
        if (hasColorBar) {
            const ev = findEvidence(['color bar', 'slug']);
            findings.push({
                page: 1,
                code: CODES.MARK_COLOR_BAR_DETECTED,
                severity: "info",
                category: "MARK",
                analyzer: "MarkAnalyzer",
                confidence: 0.98,
                fixable: false,
                recommended_fix: null,
                message: "Color calibration bar or slug area detected.",
                evidence: {
                    tool: ev.tool,
                    source: ev.source,
                    page: 1,
                    confidence: 0.98,
                    raw: ev.raw
                }
            });
        }

        return { findings, status: "SUCCESS" };
    }
}

module.exports = MarkAnalyzer;
