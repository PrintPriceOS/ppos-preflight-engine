/**
 * PrintPrice OS — Preflight Engine (v1.9.0)
 * 
 * Central orchestrator for deterministic analysis.
 */
const RiskAnalyzer = require('./RiskAnalyzer');
const ReportBuilder = require('./ReportBuilder');
const IssueNormalizer = require('./IssueNormalizer');

class PreflightEngine {
    constructor(analyzers = []) {
        this.analyzers = analyzers;
        this.riskAnalyzer = new RiskAnalyzer();
        this.reportBuilder = new ReportBuilder();
    }

    /**
     * Executes the full deterministic analysis lifecycle.
     */
    async analyzePdf(filePath, options = {}) {
        console.log(`[ENGINE] Starting deterministic analysis for: ${filePath}`);

        // 1. Run all registered analyzers
        const rawFindings = [];
        const warnings = [];
        let metadata = {};
        let partial = false;

        for (const analyzer of this.analyzers) {
            try {
                const analyzerName = analyzer.constructor.name;
                console.log(`[ENGINE][${analyzerName}] Running analysis stage...`);
                const start = Date.now();
                const result = await analyzer.analyze(filePath, options);
                const elapsed = Date.now() - start;
                console.log(`[ENGINE][${analyzerName}] Stage completed in ${elapsed}ms`);
                
                if (result.findings) rawFindings.push(...result.findings);
                if (result.metadata) metadata = { ...metadata, ...result.metadata };
            } catch (err) {
                console.error(`[ENGINE] Analyzer ${analyzer.constructor.name} failed:`, err.message);
                partial = true;
                warnings.push({
                    analyzer: analyzer.constructor.name,
                    error: err.name || 'ANALYZER_ERROR',
                    message: err.message
                });
            }
        }

        // 2. Normalize issues
        const normalizedIssues = IssueNormalizer.normalize(rawFindings);

        // 3. Score Risk
        const riskSummary = this.riskAnalyzer.score(normalizedIssues, metadata);

        // 4. Build Final Report
        return this.reportBuilder.build({
            issues: normalizedIssues,
            riskSummary,
            metadata,
            filePath,
            partial,
            warnings
        });
    }

    /**
     * Executes the deterministic autofix logic.
     * Delegates to the FixEngine for actual Ghostscript execution.
     */
    async autofixPdf(filePath, fixPlan = {}, options = {}) {
        console.log(`[ENGINE] Executing specialized autofix for: ${filePath} | Plan: ${JSON.stringify(fixPlan)}`);
        
        const path = require('path');
        const fs = require('fs-extra');
        const PdfFixEngine = require('../execution/PdfFixEngine');
        const fixEngine = new PdfFixEngine();

        const ext = path.extname(filePath);
        const outputPath = filePath.replace(ext, `_fixed_${Date.now()}${ext}`);

        // Handle different fix types based on the plan
        // This is where we implement 'grayscale', 'color', 'bleed', etc.
        try {
            let result;
            if (fixPlan.type === 'grayscale' || fixPlan.target === 'gray') {
                result = await fixEngine.applyCmyk(filePath, outputPath, 'iso_grayscale_v2', options);
            } else if (fixPlan.type === 'color' || fixPlan.target === 'cmyk') {
                const profile = fixPlan.profile || 'iso_coated_v3';
                result = await fixEngine.applyCmyk(filePath, outputPath, profile, options);
            } else if (fixPlan.type === 'bleed' || fixPlan.forceBleed) {
                const bleedMm = fixPlan.bleedMm || 3;
                result = await fixEngine.applyBleed(filePath, outputPath, bleedMm, options);
            } else {
                // Fallback: Copy if no specific fix requested
                await fs.copy(filePath, outputPath);
                result = { success: true, note: 'Copied' };
            }

            if (result.success) {
                console.log(`[ENGINE][AUTOFIX][OUTPUT-GENERATED] Successfully generated fixed file: ${outputPath}`);
                console.log(`[ENGINE][AUTOFIX][OUTPUT-PATH] ${outputPath}`);

                return {
                    ok: true,
                    status: 'SUCCESS',
                    fixedPath: outputPath,
                    artifacts: {
                        fixed_pdf: {
                            path: outputPath,
                            filename: path.basename(outputPath)
                        }
                    },
                    note: result.note,
                    wrapper_metadata: {
                        timestamp: new Date().toISOString()
                    }
                };
            } else {
                console.log(`[ENGINE][AUTOFIX][NO-OUTPUT] Fix stage failed: ${result.error}`);
                return { 
                    ok: false, 
                    status: 'FAILURE',
                    error: result.error,
                    wrapper_metadata: {
                        timestamp: new Date().toISOString()
                    }
                };
            }

        } catch (err) {
            console.error('[ENGINE][AUTOFIX-FAILED][NO-OUTPUT]', err);
            return { ok: false, status: 'FAILURE', error: err.message, wrapper_metadata: { timestamp: new Date().toISOString() } };
        }
    }

    /**
     * Renders a specific page for visual review or preview.
     */
    async renderPage(filePath, outputPath, page = 1, options = {}) {
        const PdfTechnicalEngine = require('../execution/PdfTechnicalEngine');
        const tech = new PdfTechnicalEngine();
        return await tech.renderPageAsImage(filePath, outputPath, page, options);
    }
}

module.exports = PreflightEngine;
