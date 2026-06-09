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
            // Only emit findings for tools that were found but failed (FAILED), not MISSING (covered below).
            // Phase 62F-A: use probe semantics to emit precise finding codes instead of generic EXTRACTION_ERROR.
            const nonMissingErrors = integrity.extractionErrors.filter(e => e.probeStatus !== 'MISSING');
            nonMissingErrors.forEach(err => {
                const probeSem = integrity.probeSemantics?.tools?.[err.parser];
                const semanticStatus = probeSem?.semantic_status || err.semanticStatus || 'FAILED_UNCLASSIFIED';
                const warningClasses = probeSem?.warning_classes || [];
                const evidenceBase = { tool: err.parser, source: 'CLI_PROBE', page: 1, confidence: 1.0, stderr_excerpt: probeSem?.evidence?.stderr_excerpt || '', stdout_excerpt: probeSem?.evidence?.stdout_excerpt || '' };

                if (err.parser === 'qpdf') {
                    if (semanticStatus === 'WARNING_ONLY' || semanticStatus === 'SUCCESS_WITH_WARNINGS') {
                        // Emit per-class structural warning findings (non-fatal)
                        if (warningClasses.includes('PDF_LINEARIZATION_HINT_WARNING')) {
                            findings.push({ page: 1, code: CODES.PDF_LINEARIZATION_HINT_WARNING, severity: 'warning', category: 'STRUCTURAL', analyzer: 'PdfIntegrityAnalyzer', confidence: 0.98, fixable: false, safeToAutofix: false, recommended_fix: null, message: 'qpdf: linearization hint-table inconsistency detected (non-fatal).', evidence: { ...evidenceBase, raw: 'PDF_LINEARIZATION_HINT_WARNING' } });
                        }
                        if (warningClasses.includes('PDF_SHARED_OBJECT_HINT_MISMATCH')) {
                            findings.push({ page: 1, code: CODES.PDF_SHARED_OBJECT_HINT_MISMATCH, severity: 'warning', category: 'STRUCTURAL', analyzer: 'PdfIntegrityAnalyzer', confidence: 0.98, fixable: false, safeToAutofix: false, recommended_fix: null, message: 'qpdf: shared-object hint-table mismatch (non-fatal).', evidence: { ...evidenceBase, raw: 'PDF_SHARED_OBJECT_HINT_MISMATCH' } });
                        }
                        if (warningClasses.includes('PDF_OBJECT_COUNT_HINT_MISMATCH')) {
                            findings.push({ page: 1, code: CODES.PDF_OBJECT_COUNT_HINT_MISMATCH, severity: 'warning', category: 'STRUCTURAL', analyzer: 'PdfIntegrityAnalyzer', confidence: 0.98, fixable: false, safeToAutofix: false, recommended_fix: null, message: 'qpdf: object count hint-table mismatch (non-fatal).', evidence: { ...evidenceBase, raw: 'PDF_OBJECT_COUNT_HINT_MISMATCH' } });
                        }
                        if (warningClasses.length === 0 || warningClasses.includes('PDF_STRUCTURAL_WARNING_NON_FATAL')) {
                            findings.push({ page: 1, code: CODES.PDF_STRUCTURAL_WARNING_NON_FATAL, severity: 'warning', category: 'STRUCTURAL', analyzer: 'PdfIntegrityAnalyzer', confidence: 0.95, fixable: false, safeToAutofix: false, recommended_fix: null, message: 'qpdf: structural warning (non-fatal) — document is readable.', evidence: { ...evidenceBase, raw: 'PDF_STRUCTURAL_WARNING_NON_FATAL' } });
                        }
                        findings.push({ page: 1, code: CODES.HEAVY_PDF_PROBE_SEMANTICS_CLASSIFIED, severity: 'info', category: 'STRUCTURAL', analyzer: 'PdfIntegrityAnalyzer', confidence: 1.0, fixable: false, recommended_fix: null, message: `qpdf probe semantics classified as ${semanticStatus}. Warning classes: ${warningClasses.join(', ') || 'none'}.`, evidence: { ...evidenceBase, raw: `semantic_status=${semanticStatus}` } });
                    } else if (semanticStatus === 'FAILED_TIMEOUT') {
                        findings.push({ page: 1, code: CODES.PROBE_TIMEOUT, severity: 'error', category: 'INTEGRITY', analyzer: 'PdfIntegrityAnalyzer', confidence: 1.0, fixable: false, recommended_fix: null, message: 'qpdf --check timed out.', evidence: evidenceBase });
                    } else if (semanticStatus === 'FAILED_OOM') {
                        findings.push({ page: 1, code: CODES.PROBE_OOM, severity: 'error', category: 'INTEGRITY', analyzer: 'PdfIntegrityAnalyzer', confidence: 1.0, fixable: false, recommended_fix: null, message: 'qpdf killed (out-of-memory or SIGKILL).', evidence: evidenceBase });
                    } else if (semanticStatus === 'FAILED_FATAL' || semanticStatus === 'FAILED_NO_OUTPUT' || semanticStatus === 'FAILED_UNCLASSIFIED' || semanticStatus === 'PARTIAL_SUCCESS') {
                        findings.push({ page: 1, code: CODES.PDF_STRUCTURAL_ERROR_FATAL, severity: 'error', category: 'STRUCTURAL', analyzer: 'PdfIntegrityAnalyzer', confidence: 0.98, fixable: false, recommended_fix: null, message: `qpdf reported a fatal structural error (${semanticStatus}). Re-exporting the PDF is recommended.`, evidence: { ...evidenceBase, raw: probeSem?.evidence?.stderr_excerpt || err.message } });
                    } else {
                        findings.push({ page: 1, code: 'IND_INTEGRITY_EXTRACTION_ERROR', severity: 'error', category: 'INTEGRITY', analyzer: 'PdfIntegrityAnalyzer', confidence: 1.0, fixable: false, recommended_fix: null, message: `qpdf probe failure: ${semanticStatus}`, evidence: evidenceBase });
                    }
                } else if (err.parser === 'pdfimages') {
                    if (semanticStatus === 'WARNING_ONLY' || semanticStatus === 'SUCCESS_WITH_WARNINGS') {
                        if (warningClasses.includes('PDF_FONT_WEIGHT_WARNING')) {
                            findings.push({ page: 1, code: CODES.PDF_FONT_WEIGHT_WARNING, severity: 'warning', category: 'STRUCTURAL', analyzer: 'PdfIntegrityAnalyzer', confidence: 0.95, fixable: false, safeToAutofix: false, recommended_fix: null, message: 'pdfimages: Syntax Warning — Invalid Font Weight detected (non-fatal).', evidence: { ...evidenceBase, raw: 'PDF_FONT_WEIGHT_WARNING' } });
                        } else {
                            findings.push({ page: 1, code: CODES.PROBE_WARNING_PDFIMAGES, severity: 'warning', category: 'STRUCTURAL', analyzer: 'PdfIntegrityAnalyzer', confidence: 0.95, fixable: false, recommended_fix: null, message: `pdfimages: probe warning during image extraction (${warningClasses.join(', ') || 'unclassified'}).`, evidence: evidenceBase });
                        }
                    } else if (semanticStatus === 'FAILED_TIMEOUT') {
                        findings.push({ page: 1, code: CODES.PROBE_TIMEOUT, severity: 'error', category: 'INTEGRITY', analyzer: 'PdfIntegrityAnalyzer', confidence: 1.0, fixable: false, recommended_fix: null, message: 'pdfimages -list timed out.', evidence: evidenceBase });
                    } else if (semanticStatus === 'FAILED_OOM') {
                        findings.push({ page: 1, code: CODES.PROBE_OOM, severity: 'error', category: 'INTEGRITY', analyzer: 'PdfIntegrityAnalyzer', confidence: 1.0, fixable: false, recommended_fix: null, message: 'pdfimages killed (out-of-memory or SIGKILL).', evidence: evidenceBase });
                    } else if (semanticStatus === 'FAILED_FATAL' || semanticStatus === 'FAILED_NO_OUTPUT') {
                        findings.push({ page: 1, code: CODES.PROBE_FATAL, severity: 'error', category: 'INTEGRITY', analyzer: 'PdfIntegrityAnalyzer', confidence: 0.98, fixable: false, recommended_fix: null, message: `pdfimages probe failed fatally (${semanticStatus}).`, evidence: evidenceBase });
                    } else {
                        findings.push({ page: 1, code: 'IND_INTEGRITY_EXTRACTION_ERROR', severity: 'error', category: 'INTEGRITY', analyzer: 'PdfIntegrityAnalyzer', confidence: 1.0, fixable: false, recommended_fix: null, message: `pdfimages probe failure: ${semanticStatus}`, evidence: evidenceBase });
                    }
                } else {
                    // Other tools — use semantic status to decide severity
                    if (semanticStatus === 'WARNING_ONLY' || semanticStatus === 'SUCCESS_WITH_WARNINGS') {
                        findings.push({ page: 1, code: CODES.PDF_STRUCTURAL_WARNING_NON_FATAL, severity: 'warning', category: 'STRUCTURAL', analyzer: 'PdfIntegrityAnalyzer', confidence: 0.9, fixable: false, recommended_fix: null, message: `${err.parser} probe: non-fatal warning output.`, evidence: evidenceBase });
                    } else {
                        findings.push({ page: 1, code: 'IND_INTEGRITY_EXTRACTION_ERROR', severity: 'error', category: 'INTEGRITY', analyzer: 'PdfIntegrityAnalyzer', confidence: 1.0, fixable: false, recommended_fix: null, message: `Extraction probe failure in parser: ${err.parser}`, evidence: { ...evidenceBase, raw: err.message || 'Binary extraction probe returned fatal exit status' } });
                    }
                }
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
