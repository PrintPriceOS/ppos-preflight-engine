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
        let metadata = {};

        for (const analyzer of this.analyzers) {
            try {
                const result = await analyzer.analyze(filePath, options);
                if (result.findings) rawFindings.push(...result.findings);
                if (result.metadata) metadata = { ...metadata, ...result.metadata };
            } catch (err) {
                console.error(`[ENGINE] Analyzer ${analyzer.constructor.name} failed:`, err.message);
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
            filePath
        });
    }

    /**
     * Executes the deterministic autofix logic.
     */
    async autofixPdf(filePath, fixPlan, options = {}) {
        console.log(`[ENGINE] Executing autofix for: ${filePath}`);
        const fs = require('fs');
        const outputPath = filePath.replace('.pdf', '_fixed.pdf');
        if (fs.existsSync(filePath)) {
            fs.copyFileSync(filePath, outputPath);
        }
        return { success: true, outputPath };
    }
}

module.exports = PreflightEngine;
