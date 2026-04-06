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
            if (fixPlan.type === 'grayscale' || fixPlan.target === 'gray') {
                const result = await fixEngine.applyCmyk(filePath, outputPath, 'iso_grayscale_v2', options);
                return result.success ? { success: true, outputPath } : { success: false, error: result.error };
            }

            if (fixPlan.type === 'color' || fixPlan.target === 'cmyk') {
                const profile = fixPlan.profile || 'iso_coated_v3';
                // In a real setup, we'd resolve the profile path. For now assume it's a slug.
                const result = await fixEngine.applyCmyk(filePath, outputPath, profile, options);
                return result.success ? { success: true, outputPath } : { success: false, error: result.error };
            }

            if (fixPlan.type === 'bleed' || fixPlan.forceBleed) {
                const bleedMm = fixPlan.bleedMm || 3;
                const result = await fixEngine.applyBleed(filePath, outputPath, bleedMm, options);
                return result.success ? { success: true, outputPath } : { success: false, error: result.error };
            }

            // Fallback: Copy if no specific fix requested
            await fs.copy(filePath, outputPath);
            return { success: true, outputPath, note: 'Copied (no specific fix applied)' };

        } catch (err) {
            console.error('[ENGINE][AUTOFIX-FAILED]', err);
            return { success: false, error: err.message };
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
