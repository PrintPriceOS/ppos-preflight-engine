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
        const { PDFDocument, PDFName } = require('pdf-lib');

        const ICC_DIR = process.env.ICC_PROFILES_DIR || path.resolve(__dirname, '../../../icc-profiles');
        const ICC_PROFILE_MAP = {
            'iso_coated_v3':       'PSO_Coated_v3.icc',
            'iso_uncoated_v3':     'PSOuncoated_v3_FOGRA52.icc',
            'iso_coated_v2_to_v3': 'ISOcoated_v2_to_PSOcoated_v3_DeviceLink.icc',
        };
        const resolveIccPath = (name) => {
            const filename = ICC_PROFILE_MAP[name];
            return filename ? path.join(ICC_DIR, filename) : null;
        };

        const ext = path.extname(filePath);
        const basename = path.basename(filePath, ext);
        const outDir = options.outputDir || path.dirname(filePath);
        const outputPath = path.join(outDir, `${basename}_fixed_${Date.now()}${ext}`);

        try {
            // Pre-fix validation for NO-OP detection (specifically for TrimBox)
            if (fixPlan.strategy === 'REBUILD_TRIMBOX' || fixPlan.repairStrategy === 'REBUILD_TRIMBOX') {
                const bytes = await fs.readFile(filePath);
                const pdfDoc = await PDFDocument.load(bytes);
                const pages = pdfDoc.getPages();
                let allValid = true;

                for (const page of pages) {
                    const trimBox = page.node.lookup(PDFName.of('TrimBox'));
                    const mediaBox = page.node.lookup(PDFName.of('MediaBox'));
                    
                    if (!trimBox || !mediaBox) {
                        allValid = false;
                        break;
                    }

                    const trimArray = trimBox.asArray().map(v => v.asNumber());
                    const mediaArray = mediaBox.asArray().map(v => v.asNumber());

                    const width = trimArray[2] - trimArray[0];
                    const height = trimArray[3] - trimArray[1];
                    const isFinite = trimArray.every(n => Number.isFinite(n));

                    const isInside = trimArray[0] >= mediaArray[0] && trimArray[1] >= mediaArray[1] &&
                                    trimArray[2] <= mediaArray[2] && trimArray[3] <= mediaArray[3];

                    if (!isFinite || width <= 0 || height <= 0 || !isInside) {
                        allValid = false;
                        break;
                    }
                }

                if (allValid) {
                    console.log(`[ENGINE][AUTOFIX] No-op detected: TrimBox already valid.`);
                    return {
                        ok: true,
                        status: 'SUCCESS',
                        noopFix: true,
                        fixApplied: false,
                        rewritten: false,
                        certificationMode: "CERTIFIED_WITHOUT_MODIFICATION",
                        repairs: [],
                        artifacts: {
                            certified_pdf: {
                                source_preserved: true,
                                rewrite: false,
                                path: filePath,
                                filename: path.basename(filePath)
                            }
                        },
                        message: "No structural changes were required. Document already complied with geometry requirements."
                    };
                }
            }

            let result;
            let destructiveFixRisk = "LOW";

            if (fixPlan.type === 'grayscale' || fixPlan.target === 'gray') {
                result = await fixEngine.applyCmyk(filePath, outputPath, null, options);
                destructiveFixRisk = "HIGH";
            } else if (fixPlan.type === 'color' || fixPlan.target === 'cmyk') {
                const profile = fixPlan.profile || 'iso_coated_v3';
                result = await fixEngine.applyCmyk(filePath, outputPath, resolveIccPath(profile), options);
                destructiveFixRisk = "HIGH";
            } else if (fixPlan.type === 'bleed' || fixPlan.forceBleed) {
                const bleedMm = fixPlan.bleedMm || 3;
                result = await fixEngine.applyBleed(filePath, outputPath, bleedMm, options);
            } else if (fixPlan.type === 'geometry' || fixPlan.strategy === 'REBUILD_TRIMBOX' || fixPlan.repairStrategy === 'REBUILD_TRIMBOX') {
                result = await fixEngine.rebuildTrimBox(filePath, outputPath, options);
            } else {
                // Fallback: Copy if no specific fix requested
                await fs.copy(filePath, outputPath);
                result = { success: true, note: 'Copied' };
            }

            if (result.success) {
                console.log(`[ENGINE][AUTOFIX][OUTPUT-GENERATED] Successfully generated fixed file: ${outputPath}`);
                
                const repairs = (result.repairs || []).map(r => ({
                    ...r,
                    destructiveFixRisk: r.destructiveFixRisk || destructiveFixRisk,
                    rewritten: true
                }));

                return {
                    ok: true,
                    status: 'SUCCESS',
                    noopFix: false,
                    fixApplied: true,
                    rewritten: true,
                    fixedPath: outputPath,
                    artifacts: {
                        fixed_pdf: {
                            path: outputPath,
                            filename: path.basename(outputPath)
                        }
                    },
                    repairs,
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
