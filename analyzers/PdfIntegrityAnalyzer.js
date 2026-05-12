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
