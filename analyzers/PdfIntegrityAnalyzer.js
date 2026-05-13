const { CODES } = require('../interpretation/IndustrialFindingCodes');

/**
 * PdfIntegrityAnalyzer
 * 
 * Standardized pipeline analyzer for PDF extraction integrity, parser errors, and binary degradation.
 */
class PdfIntegrityAnalyzer {
    async analyze(filePath, options = {}) {
        const metadata = options.metadata || {};
        const integrity = metadata.analysisIntegrity || {};
        const findings = [];

        // If fallback/mock data was used or real extraction failed, report PARTIAL status but push integrity warnings
        const hasExtractionErrors = Array.isArray(integrity.extractionErrors) && integrity.extractionErrors.length > 0;
        const missingTools = Array.isArray(integrity.missingTools) && integrity.missingTools.length > 0;

        if (metadata.source === 'FALLBACK_MOCK' || integrity.realExtraction === false) {
            findings.push({
                page: 1,
                code: 'IND_INTEGRITY_DEGRADED',
                severity: "error",
                category: "INTEGRITY",
                analyzer: "PdfIntegrityAnalyzer",
                confidence: 1.0,
                fixable: false,
                recommended_fix: null,
                message: "Forensic PDF extraction degraded. Fallback or partial structural metadata used.",
                evidence: {
                    tool: 'PdfTechnicalEngine',
                    source: 'SYSTEM_KERNEL',
                    page: 1,
                    confidence: 1.0,
                    raw: 'source=FALLBACK_MOCK or realExtraction=false'
                }
            });
        }

        if (hasExtractionErrors) {
            integrity.extractionErrors.forEach(err => {
                findings.push({
                    page: 1,
                    code: 'IND_INTEGRITY_EXTRACTION_ERROR',
                    severity: "error",
                    category: "INTEGRITY",
                    analyzer: "PdfIntegrityAnalyzer",
                    confidence: 1.0,
                    fixable: false,
                    recommended_fix: null,
                    message: `Extraction probe failure in parser: ${err.parser}`,
                    evidence: {
                        tool: err.parser,
                        source: 'CLI_PROBE',
                        page: 1,
                        confidence: 1.0,
                        raw: err.error || 'Binary extraction probe returned fatal exit status'
                    }
                });
            });
        }

        if (missingTools) {
            integrity.missingTools.forEach(tool => {
                findings.push({
                    page: 1,
                    code: 'IND_INTEGRITY_MISSING_TOOL',
                    severity: "warning",
                    category: "INTEGRITY",
                    analyzer: "PdfIntegrityAnalyzer",
                    confidence: 1.0,
                    fixable: false,
                    recommended_fix: null,
                    message: `Required industrial command-line utility missing: ${tool}`,
                    evidence: {
                        tool,
                        source: 'SYSTEM_ENVIRONMENT',
                        page: 1,
                        confidence: 1.0,
                        raw: `System PATH check failed to resolve executable: ${tool}`
                    }
                });
            });
        }

        const isPartial = metadata.source === 'FALLBACK_MOCK' || integrity.realExtraction === false;

        const toolOutputs = metadata.toolOutputs || {};
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

        // Annotations
        if (strContext.includes('annotation') || strContext.includes('/annot')) {
            const ev = findEvidence(['annotation', '/annot']);
            findings.push({
                page: 1,
                code: CODES.STRUCT_ANNOTATIONS_DETECTED,
                severity: "warning",
                category: "STRUCTURAL",
                analyzer: "PdfIntegrityAnalyzer",
                confidence: 0.98,
                fixable: true,
                recommended_fix: "FLATTEN_ANNOTATIONS",
                message: "PDF annotations detected.",
                evidence: {
                    tool: ev.tool,
                    source: ev.source,
                    page: 1,
                    confidence: 0.98,
                    raw: ev.raw
                }
            });
        }

        // AcroForm
        if (strContext.includes('acroform') || strContext.includes('interactive form')) {
            const ev = findEvidence(['acroform', 'interactive form']);
            findings.push({
                page: 1,
                code: CODES.STRUCT_ACROFORM_DETECTED,
                severity: "warning",
                category: "STRUCTURAL",
                analyzer: "PdfIntegrityAnalyzer",
                confidence: 0.98,
                fixable: true,
                recommended_fix: "FLATTEN_FORMS",
                message: "Interactive form (AcroForm) detected.",
                evidence: {
                    tool: ev.tool,
                    source: ev.source,
                    page: 1,
                    confidence: 0.98,
                    raw: ev.raw
                }
            });
        }

        // JavaScript
        let hasJs = false;
        let jsEvidenceTool = 'composite_probe';
        let jsEvidenceRaw = null;

        if (toolOutputs.pdfinfo) {
            if (/JavaScript:\s+yes/i.test(toolOutputs.pdfinfo)) {
                hasJs = true;
                jsEvidenceTool = 'pdfinfo';
                const lines = toolOutputs.pdfinfo.split('\n');
                jsEvidenceRaw = lines.find(l => /JavaScript:\s+yes/i.test(l))?.trim() || 'JavaScript: yes';
            }
        }

        if (!hasJs) {
            for (const [tool, output] of Object.entries(toolOutputs)) {
                if (!output || tool === 'pdfinfo') continue;
                
                const lines = output.split('\n');
                for (const line of lines) {
                    const low = line.toLowerCase();
                    if (low.includes('/javascript') || low.includes('/openaction') || /\/js(\s|\/|>|\[|\(|$)/i.test(line) || /\/aa(\s|\/|>|\[|\(|$)/i.test(line)) {
                        hasJs = true;
                        jsEvidenceTool = tool;
                        jsEvidenceRaw = line.trim();
                        break;
                    }
                }
                if (hasJs) break;
            }
        }

        if (hasJs) {
            findings.push({
                page: 1,
                code: CODES.STRUCT_JAVASCRIPT_DETECTED,
                severity: "error",
                category: "STRUCTURAL",
                analyzer: "PdfIntegrityAnalyzer",
                confidence: 0.98,
                fixable: true,
                recommended_fix: "STRIP_JAVASCRIPT",
                message: "Embedded JavaScript detected.",
                evidence: {
                    tool: jsEvidenceTool,
                    source: 'CLI_PROBE',
                    page: 1,
                    confidence: 0.98,
                    raw: jsEvidenceRaw
                }
            });
        }

        // Broken XREF / Incremental Save
        if (strContext.includes('xref error') || strContext.includes('broken xref') || strContext.includes('incremental save')) {
            const ev = findEvidence(['xref error', 'broken xref', 'incremental save']);
            findings.push({
                page: 1,
                code: CODES.STRUCT_XREF_BROKEN,
                severity: "error",
                category: "STRUCTURAL",
                analyzer: "PdfIntegrityAnalyzer",
                confidence: 0.98,
                fixable: true,
                recommended_fix: "REBUILD_XREF",
                message: "Broken cross-reference table or anomalous incremental save.",
                evidence: {
                    tool: ev.tool,
                    source: ev.source,
                    page: 1,
                    confidence: 0.98,
                    raw: ev.raw
                }
            });
        }

        // Object Stream Anomalies
        if (strContext.includes('object stream') || strContext.includes('/objstm')) {
            const ev = findEvidence(['object stream', '/objstm']);
            findings.push({
                page: 1,
                code: CODES.STRUCT_OBJECT_STREAM_ANOMALY,
                severity: "info",
                category: "STRUCTURAL",
                analyzer: "PdfIntegrityAnalyzer",
                confidence: 0.98,
                fixable: false,
                recommended_fix: null,
                message: "Compressed object streams utilized.",
                evidence: {
                    tool: ev.tool,
                    source: ev.source,
                    page: 1,
                    confidence: 0.98,
                    raw: ev.raw
                }
            });
        }

        return {
            findings,
            partial: isPartial,
            status: isPartial ? "PARTIAL" : "SUCCESS",
            metadata: {
                integrityChecked: true
            }
        };
    }
}

module.exports = PdfIntegrityAnalyzer;
