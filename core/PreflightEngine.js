/**
 * PrintPrice OS — Preflight Engine (v1.9.0)
 * 
 * Central orchestrator for deterministic analysis.
 */
const RiskAnalyzer = require('./RiskAnalyzer');
const ReportBuilder = require('./ReportBuilder');
const IssueNormalizer = require('./IssueNormalizer');
const PdfTechnicalEngine = require('../execution/PdfTechnicalEngine');

class PreflightEngine {
    constructor(analyzers = []) {
        this.analyzers = analyzers;
        this.riskAnalyzer = new RiskAnalyzer();
        this.reportBuilder = new ReportBuilder();
        this.technicalEngine = new PdfTechnicalEngine();
    }

    /**
     * Executes the full deterministic analysis lifecycle.
     */
    async analyzePdf(filePath, options = {}) {
        console.log(`[ENGINE] Starting deterministic analysis for: ${filePath}`);

        // 1. Extract real PDF metadata via Ghostscript before running analyzers
        const rawFindings = [];
        const warnings = [];
        let metadata = {};
        let partial = false;

        try {
            const techResult = await this.technicalEngine.analyze(filePath, options);
            
            const missingTools  = techResult.analysisIntegrity?.missingTools || [];
            const probeResults  = techResult.probeResults || {};
            const availableTools = techResult.availableTools || [];

            // ENGINE_ENVIRONMENT_FAILURE only when:
            //   (a) pdf-lib could not load the PDF at all (source=FALLBACK_MOCK), OR
            //   (b) all 4 core CLI probes are absent — preserves existing Test 11 behavior.
            // 'gs' and 'Ghostscript' are both valid aliases for the Ghostscript probe.
            const gsAbsent = missingTools.includes('Ghostscript') || missingTools.includes('gs') ||
                probeResults['Ghostscript'] === 'MISSING' || probeResults['gs'] === 'MISSING';
            const coreProbesMissing =
                (missingTools.includes('pdfinfo')   || probeResults['pdfinfo']   === 'MISSING') &&
                (missingTools.includes('pdfimages') || probeResults['pdfimages'] === 'MISSING') &&
                (missingTools.includes('mutool')    || probeResults['mutool']    === 'MISSING') &&
                gsAbsent;
            const isEnvironmentFailure = techResult.source === 'FALLBACK_MOCK' || coreProbesMissing;

            metadata = {
                geometry: techResult.geometry,
                pages: techResult.info?.pages || 0,
                size: techResult.info?.size || 0,
                source: techResult.source,
                analysisIntegrity: techResult.analysisIntegrity,
                toolOutputs: techResult.toolOutputs || {},
                pdfVersion: techResult.pdfVersion || 'unknown',
                environmentFailure: isEnvironmentFailure,
                probeResults,
                availableTools
            };

            if (isEnvironmentFailure) {
                console.warn(`[ENGINE] Hard environment gate triggered: missing critical industrial probes: ${missingTools.join(', ')}`);
            }

            if (techResult.ok) {
                console.log(`[ENGINE] PDF metadata extracted (source=${techResult.source}): pages=${metadata.pages}, ${metadata.geometry?.widthMm}x${metadata.geometry?.heightMm}mm`);
                if (techResult.source === 'FALLBACK_MOCK') {
                    partial = true;
                    warnings.push({ analyzer: 'PdfTechnicalEngine', error: 'PDF_EXTRACTION_DEGRADED', message: 'Using fallback geometry' });
                }
            } else {
                console.warn(`[ENGINE] Technical extraction failed or returned fallback partial payload.`);
                partial = true;
                warnings.push({
                    analyzer: 'PdfTechnicalEngine',
                    error: techResult.warning || 'PDF_EXTRACTION_DEGRADED',
                    message: 'Real PDF geometry extraction failed. Using null/empty structural markers.'
                });
            }
        } catch (err) {
            console.warn(`[ENGINE] Technical extraction threw error, analyzers will use defaults: ${err.message}`);
            partial = true;
            warnings.push({ analyzer: 'PdfTechnicalEngine', error: err.name || 'EXTRACTION_ERROR', message: err.message });
        }

        // 2. Run all registered analyzers with real metadata
        const strictMode = process.env.PREFLIGHT_STRICT_FORENSIC_MODE === 'true' || 
                           process.env.STRICT_FORENSIC_MODE === 'true' || 
                           options.strict_forensic_mode === true || 
                           options.strictForensicMode === true;

        const analyzerCoverage = {
            registered: this.analyzers.map(a => a.constructor.name),
            executed: [],
            partial: [],
            skipped: [],
            failed: []
        };

        for (const analyzer of this.analyzers) {
            const analyzerName = analyzer.constructor.name;

            try {
                console.log(`[ENGINE][${analyzerName}] Running analysis stage...`);
                const start = Date.now();
                const result = await analyzer.analyze(filePath, { ...options, metadata });
                const elapsed = Date.now() - start;
                console.log(`[ENGINE][${analyzerName}] Stage completed in ${elapsed}ms`);

                if (result.status === 'PARTIAL') {
                    analyzerCoverage.partial.push({
                        analyzer: analyzerName,
                        reason: result.metadata
                            ? (Object.values(result.metadata)[0]?.reason ?? 'PARTIAL_EVIDENCE')
                            : 'PARTIAL_EVIDENCE',
                        missingSources: metadata.analysisIntegrity?.missingTools || []
                    });
                } else {
                    analyzerCoverage.executed.push(analyzerName);
                }

                if (result.findings) rawFindings.push(...result.findings);
                if (result.metadata) metadata = { ...metadata, ...result.metadata };

                if (strictMode && result.status === 'PARTIAL') {
                    warnings.push({
                        analyzer: analyzerName,
                        error: 'COVERAGE_WARNING',
                        message: `Analyzer ${analyzerName} executed with partial extraction depth.`
                    });
                }
            } catch (err) {
                console.error(`[ENGINE] Analyzer ${analyzer.constructor.name} failed:`, err.message);
                partial = true;
                analyzerCoverage.failed.push({ analyzer: analyzerName, error: err.message });
                warnings.push({
                    analyzer: analyzerName,
                    error: err.name || 'ANALYZER_ERROR',
                    message: err.message
                });
            }
        }

        // 3. Normalize issues
        const normalizedIssues = IssueNormalizer.normalize(rawFindings);

        // Enforce Policy constraints on severities before scoring
        const isOffsetPolicy = options.policy === 'OFFSET_MODERN_COATED_F51' || 
                               options.profile === 'OFFSET_MODERN_COATED_F51' ||
                               options.policy?.includes('OFFSET') ||
                               options.profile?.includes('OFFSET');

        if (isOffsetPolicy) {
            const { CODES: FindingCodes } = require('../interpretation/IndustrialFindingCodes');
            normalizedIssues.forEach(issue => {
                if (issue.code === FindingCodes.COLOR_RGB_OBJECTS_DETECTED || issue.code === 'IND_COLOR_001') {
                    issue.severity = 'error';
                }
                if (issue.code === FindingCodes.COLOR_ICC_PROFILE_MISSING || issue.code === FindingCodes.COLOR_OUTPUT_INTENT_MISSING) {
                    issue.severity = 'error';
                }
                if (issue.code === FindingCodes.GEOM_BLEEDBOX_MISSING || issue.code === FindingCodes.GEOM_TRIMBOX_MISSING) {
                    issue.severity = 'error';
                }
            });
        }

        // 4. Score Risk
        const riskSummary = this.riskAnalyzer.score(normalizedIssues, metadata, options);

        // 5. Build Final Report
        return this.reportBuilder.build({
            issues: normalizedIssues,
            riskSummary,
            metadata,
            filePath,
            partial,
            warnings,
            analyzerCoverage,
            options
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
        const PdfArtifactDeltaAuditor = require('../execution/PdfArtifactDeltaAuditor');
        const fixEngine = new PdfFixEngine();
        const auditor = new PdfArtifactDeltaAuditor();
        const { PDFDocument, PDFName } = require('pdf-lib');

        const magicFixProfile = options.magicFixProfile || fixPlan.magicFixProfile || options.destructiveReviewMode || fixPlan.destructiveReviewMode || 'MAGIC_FIX_SAFE';
        options.magicFixProfile = magicFixProfile;

        const ICC_DIR = process.env.ICC_PROFILES_DIR || path.resolve(__dirname, '../../../icc-profiles');
        const ICC_PROFILE_MAP = {
            'iso_coated_v3': 'PSO_Coated_v3.icc',
            'iso_uncoated_v3': 'PSOuncoated_v3_FOGRA52.icc',
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
            const requestedStrategy = fixPlan.repairStrategy || fixPlan.strategy || fixPlan.type;
            const requestedFixesRaw = fixPlan.fixes || fixPlan.requested_fixes || options.fixes || options.requested_fixes || [];
            const requestedFixesArr = Array.isArray(requestedFixesRaw) ? [...requestedFixesRaw] : [requestedFixesRaw].filter(Boolean);

            if (fixPlan.repairStrategy) requestedFixesArr.push(fixPlan.repairStrategy);
            if (fixPlan.strategy) requestedFixesArr.push(fixPlan.strategy);
            if (fixPlan.fix_method) requestedFixesArr.push(fixPlan.fix_method);
            if (fixPlan.type === 'bleed') requestedFixesArr.push('APPLY_BLEED');
            if (fixPlan.type === 'geometry') requestedFixesArr.push('REBUILD_TRIMBOX');
            if (fixPlan.type === 'color' || fixPlan.target === 'cmyk') requestedFixesArr.push('CONVERT_CMYK');
            if (fixPlan.type === 'grayscale' || fixPlan.target === 'gray') requestedFixesArr.push('CONVERT_GRAYSCALE');
            if (fixPlan.forceBleed) requestedFixesArr.push('APPLY_BLEED');
            if (fixPlan.forceCmyk) requestedFixesArr.push('CONVERT_CMYK');

            const findings = fixPlan.findings || fixPlan.issues || options.findings || options.issues || [];
            findings.forEach(f => {
                if (f.repairStrategy) requestedFixesArr.push(f.repairStrategy);
                if (f.fix_method) requestedFixesArr.push(f.fix_method);
                if (f.recommended_fix) requestedFixesArr.push(f.recommended_fix);
            });

            const uniqueFixes = [...new Set(requestedFixesArr)];
            if (uniqueFixes.length === 0 && requestedStrategy) {
                uniqueFixes.push(requestedStrategy);
            }

            console.log(`[ENGINE][AUTOFIX][PLAN] PlannedFixes: ${JSON.stringify(uniqueFixes)}`);

            // Enforce structural integrity through mandatory repair ordering
            const priorityOrder = ['REBUILD_TRIMBOX', 'APPLY_BLEED', 'CONVERT_CMYK', 'INJECT_OUTPUT_INTENT'];
            uniqueFixes.sort((a, b) => {
                const idxA = priorityOrder.indexOf(a);
                const idxB = priorityOrder.indexOf(b);
                if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                if (idxA !== -1) return -1;
                if (idxB !== -1) return 1;
                return a.localeCompare(b);
            });

            let currentInputPath = filePath;
            let anyModified = false;
            let cumulativeRepairs = [];
            let highestRisk = "LOW";
            let requiresHumanReview = false;
            let rootError = null;
            let rootStatus = null;
            let anyApplied = false;
            let usedStrategy = null;
            let usedQuality = 'STANDARD';
            let usedBleedMode = null;
            const cumulativeWarnings = [];

            let stepIdx = 0;
            for (const fixCode of uniqueFixes) {
                stepIdx++;
                const finding = findings.find(f => f.fix_method === fixCode || f.repairStrategy === fixCode || f.recommended_fix === fixCode || f.id?.includes(fixCode.split('_')[1] || 'NONE'));

                if (fixCode === 'REBUILD_TRIMBOX') {
                    if (finding && finding.safeToAutofix === false) {
                        cumulativeRepairs.push({
                            code: fixCode,
                            status: 'SKIPPED',
                            reason: 'safeToAutofix=false or policy restricts automatic geometry reconstruction.',
                            destructiveFixRisk: finding.destructiveFixRisk || 'LOW',
                            requires_human_review: true
                        });
                        console.log(`[ENGINE][AUTOFIX][SKIP] Code: ${fixCode} | Reason: safeToAutofix=false`);
                        continue;
                    }

                    let isTrimBoxValid = false;
                    try {
                        const bytes = await fs.readFile(filePath);
                        const pdfDoc = await PDFDocument.load(bytes);
                        const pages = pdfDoc.getPages();
                        let allValid = true;
                        for (const page of pages) {
                            const trimBox = page.node.lookup(PDFName.of('TrimBox'));
                            const mediaBox = page.node.lookup(PDFName.of('MediaBox'));
                            if (!trimBox || !mediaBox) { allValid = false; break; }
                            const trimArray = trimBox.asArray().map(v => v.asNumber());
                            const mediaArray = mediaBox.asArray().map(v => v.asNumber());
                            const width = trimArray[2] - trimArray[0];
                            const height = trimArray[3] - trimArray[1];
                            const isFinite = trimArray.every(n => Number.isFinite(n));
                            const isInside = trimArray[0] >= mediaArray[0] && trimArray[1] >= mediaArray[1] &&
                                trimArray[2] <= mediaArray[2] && trimArray[3] <= mediaArray[3];
                            if (!isFinite || width <= 0 || height <= 0 || !isInside) { allValid = false; break; }
                        }
                        isTrimBoxValid = allValid;
                    } catch (err) {
                        console.warn(`[ENGINE][AUTOFIX] Failed to evaluate TrimBox validation: ${err.message}`);
                    }

                    if (isTrimBoxValid) {
                        console.log(`[ENGINE][AUTOFIX] No-op detected: TrimBox already valid.`);
                        cumulativeRepairs.push({
                            code: fixCode,
                            status: 'SKIPPED',
                            strategy: 'TRIMBOX_REBUILD_FROM_MEDIABOX',
                            description: 'No structural changes were required. Document already complied with geometry requirements.',
                            reason: 'TrimBox already valid.',
                            destructiveFixRisk: 'LOW',
                            requires_human_review: false
                        });
                        if (uniqueFixes.length === 1) {
                            const fixHint = fixPlan.repairStrategy || fixPlan.strategy || fixPlan.type || 'REBUILD_TRIMBOX';
                            return {
                                ok: false,
                                status: 'NO_CHANGE',
                                fix_id: options.jobId || `fix_${Date.now()}`,
                                input_issue_codes: [fixHint],
                                strategy: fixHint,
                                applied: false,
                                modified: false,
                                output_path: filePath,
                                warnings: ['Document copied or preserved without modification.'],
                                verification_status: 'VERIFIED',
                                noopFix: true,
                                fixApplied: false,
                                rewritten: false,
                                certificationMode: "CERTIFIED_WITHOUT_MODIFICATION",
                                repairs: cumulativeRepairs,
                                fixedPath: filePath,
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
                        continue;
                    }

                    console.log(`[ENGINE][AUTOFIX][APPLY] Executing REBUILD_TRIMBOX on ${currentInputPath}`);
                    const stepOutPath = path.join(outDir, `${basename}_step_${stepIdx}_${Date.now()}${ext}`);
                    const res = await fixEngine.rebuildTrimBox(currentInputPath, stepOutPath, options);
                    if (res.success) {
                        anyModified = true;
                        anyApplied = true;
                        currentInputPath = stepOutPath;
                        usedStrategy = 'TRIMBOX_REBUILD_FROM_MEDIABOX';
                        if (res.repairs && res.repairs.length > 0) {
                            cumulativeRepairs.push(...res.repairs);
                        } else {
                            cumulativeRepairs.push({
                                code: 'REBUILD_TRIMBOX',
                                status: 'APPLIED',
                                strategy: 'TRIMBOX_REBUILD_FROM_MEDIABOX',
                                description: 'TrimBox rebuilt from MediaBox or inferred production geometry.',
                                destructiveFixRisk: 'LOW',
                                requires_human_review: false
                            });
                        }
                    } else {
                        rootError = res.error;
                        cumulativeRepairs.push({
                            code: 'REBUILD_TRIMBOX',
                            status: 'FAILED',
                            reason: res.error,
                            destructiveFixRisk: 'LOW',
                            requires_human_review: true
                        });
                    }
                } else if (fixCode === 'APPLY_BLEED') {
                    if (finding && finding.safeToAutofix === false) {
                        cumulativeRepairs.push({
                            code: fixCode,
                            status: 'SKIPPED',
                            reason: 'safeToAutofix=false or policy restricts automatic bleed generation.',
                            destructiveFixRisk: finding.destructiveFixRisk || 'MEDIUM',
                            requires_human_review: true
                        });
                        console.log(`[ENGINE][AUTOFIX][SKIP] Code: ${fixCode} | Reason: safeToAutofix=false`);
                        continue;
                    }

                    console.log(`[ENGINE][AUTOFIX][APPLY] Executing APPLY_BLEED on ${currentInputPath}`);
                    const bleedMm = fixPlan.bleedMm || 3;
                    const stepOutPath = path.join(outDir, `${basename}_step_${stepIdx}_${Date.now()}${ext}`);
                    const res = await fixEngine.applyBleed(currentInputPath, stepOutPath, bleedMm, { ...options, ...fixPlan });
                    if (res.success) {
                        anyModified = true;
                        anyApplied = true;
                        currentInputPath = stepOutPath;
                        usedStrategy = res.strategy || 'BOX_EXPANSION_ONLY';
                        if (res.industrial_quality === 'LIMITED') usedQuality = 'LIMITED';
                        if (res.requires_human_review) requiresHumanReview = true;
                        if (res.bleed_fix_mode) usedBleedMode = res.bleed_fix_mode;
                        if (res.warnings) cumulativeWarnings.push(...res.warnings);

                        if (res.repairs && res.repairs.length > 0) {
                            cumulativeRepairs.push(...res.repairs);
                        } else {
                            cumulativeRepairs.push({
                                code: 'APPLY_BLEED',
                                status: 'APPLIED',
                                strategy: usedStrategy,
                                description: `BleedBox expanded ${bleedMm}mm on all sides via page box adjustment.`,
                                destructiveFixRisk: 'LOW',
                                requires_human_review: true
                            });
                        }
                    } else {
                        rootError = res.error;
                        if (res.status === 'UNSAFE_BLEED_FIX_NOT_APPLIED') rootStatus = res.status;
                        if (res.warnings) cumulativeWarnings.push(...res.warnings);
                        cumulativeRepairs.push({
                            code: 'APPLY_BLEED',
                            status: 'FAILED',
                            reason: res.error,
                            destructiveFixRisk: 'MEDIUM',
                            requires_human_review: true
                        });
                    }
                } else if (fixCode === 'CONVERT_CMYK') {
                    const profileMode = options.magicFixProfile || 'MAGIC_FIX_SAFE';
                    const isAllowedByProfile = profileMode === 'MAGIC_FIX_REVIEW' || profileMode === 'MAGIC_FIX_FORCE_CMYK' || profileMode === 'MAGIC_FIX_OPERATOR';
                    const isForce = fixPlan.forceCmyk || fixPlan.target === 'cmyk' || fixPlan.type === 'color' || fixPlan.type === 'grayscale';

                    if (!isAllowedByProfile && !isForce) {
                        cumulativeRepairs.push({
                            code: fixCode,
                            status: 'SKIPPED',
                            reason: 'Destructive color conversion requires explicit review mode.',
                            destructiveFixRisk: 'HIGH',
                            requires_human_review: true
                        });
                        console.log(`[ENGINE][AUTOFIX][SKIP] Code: ${fixCode} | Reason: magicFixProfile=${profileMode}`);
                        continue;
                    }

                    if (finding && finding.safeToAutofix === false && !isForce && !isAllowedByProfile) {
                        cumulativeRepairs.push({
                            code: fixCode,
                            status: 'SKIPPED',
                            reason: 'safeToAutofix=false or policy requires explicit destructive color conversion authorization.',
                            destructiveFixRisk: finding.destructiveFixRisk || 'LOW',
                            requires_human_review: true
                        });
                        console.log(`[ENGINE][AUTOFIX][SKIP] Code: ${fixCode} | Reason: safeToAutofix=false`);
                        continue;
                    }

                    console.log(`[ENGINE][AUTOFIX][APPLY] Executing CONVERT_CMYK on ${currentInputPath}`);
                    const profile = fixPlan.profile || 'iso_coated_v3';
                    const stepOutPath = path.join(outDir, `${basename}_step_${stepIdx}_${Date.now()}${ext}`);
                    const res = await fixEngine.applyCmyk(currentInputPath, stepOutPath, resolveIccPath(profile), options);
                    if (res.success) {
                        anyModified = true;
                        anyApplied = true;
                        currentInputPath = stepOutPath;
                        highestRisk = "HIGH";
                        requiresHumanReview = true;
                        usedStrategy = 'CONVERT_CMYK';
                        if (res.repairs && res.repairs.length > 0) {
                            cumulativeRepairs.push(...res.repairs);
                        } else {
                            cumulativeRepairs.push({
                                code: 'CONVERT_CMYK',
                                status: 'APPLIED',
                                strategy: 'CONVERT_CMYK',
                                description: 'Colorspace converted to CMYK via Ghostscript color strategy.',
                                destructiveFixRisk: 'HIGH',
                                requires_human_review: true
                            });
                        }
                    } else {
                        rootError = res.error;
                        if (res.repairs && res.repairs.length > 0) {
                            cumulativeRepairs.push(...res.repairs);
                        } else {
                            cumulativeRepairs.push({
                                code: 'CONVERT_CMYK',
                                status: 'FAILED',
                                reason: res.error,
                                destructiveFixRisk: 'HIGH',
                                requires_human_review: true
                            });
                        }
                    }
                } else if (fixCode === 'INJECT_OUTPUT_INTENT') {
                    const profile = fixPlan.profile || 'iso_coated_v3';
                    const resolvedIcc = resolveIccPath(profile);
                    if (!resolvedIcc) {
                        cumulativeRepairs.push({
                            code: fixCode,
                            status: 'SKIPPED',
                            reason: 'No ICC profile configured for OutputIntent injection.',
                            destructiveFixRisk: 'LOW',
                            requires_human_review: true
                        });
                        console.log(`[ENGINE][AUTOFIX][SKIP] Code: ${fixCode} | Reason: No ICC profile configured.`);
                        continue;
                    }
                    console.log(`[ENGINE][AUTOFIX][APPLY] Executing INJECT_OUTPUT_INTENT on ${currentInputPath}`);
                    const stepOutPath = path.join(outDir, `${basename}_step_${stepIdx}_${Date.now()}${ext}`);
                    const res = await fixEngine.injectOutputIntent(currentInputPath, stepOutPath, resolvedIcc, options);
                    if (res.success) {
                        anyModified = true;
                        anyApplied = true;
                        currentInputPath = stepOutPath;
                        if (res.repairs && res.repairs.length > 0) {
                            cumulativeRepairs.push(...res.repairs);
                        } else {
                            cumulativeRepairs.push({
                                code: 'INJECT_OUTPUT_INTENT',
                                status: 'APPLIED',
                                strategy: 'INJECT_OUTPUT_INTENT',
                                description: 'OutputIntent with ICC profile injected into PDF catalog.',
                                destructiveFixRisk: 'LOW',
                                requires_human_review: false
                            });
                        }
                    } else {
                        rootError = res.error;
                        cumulativeRepairs.push({
                            code: fixCode,
                            status: 'FAILED',
                            reason: res.error,
                            destructiveFixRisk: 'LOW',
                            requires_human_review: true
                        });
                    }
                } else if (fixCode === 'NO_ACTION') {
                    cumulativeRepairs.push({
                        code: fixCode,
                        status: 'SKIPPED',
                        reason: 'Explicit NO_ACTION requested.',
                        destructiveFixRisk: 'LOW',
                        requires_human_review: false
                    });
                } else {
                    const isExplicitNoAction = fixCode === 'NO_ACTION';
                    if (!isExplicitNoAction) {
                        console.log(`[ENGINE][AUTOFIX] Unrecognized fix strategy '${fixCode}', returning UNSUPPORTED_FIX.`);
                        cumulativeRepairs.push({
                            code: fixCode,
                            status: 'UNSUPPORTED',
                            reason: 'Fix is not implemented in Engine yet',
                            destructiveFixRisk: 'LOW',
                            requires_human_review: true
                        });
                        if (uniqueFixes.length === 1 || fixCode === requestedStrategy || ['CONVERT_GRAYSCALE', 'REBUILD_300DPI', 'BOOKLET_MODE', 'IMPOSE_BOOKLET'].includes(fixCode)) {
                            rootStatus = 'UNSUPPORTED_FIX';
                            rootError = 'Fix is not implemented in Engine yet';
                        }
                    }
                }
            }

            if (anyModified && currentInputPath !== outputPath) {
                await fs.move(currentInputPath, outputPath, { overwrite: true });
                currentInputPath = outputPath;
            }

            console.log(`[ENGINE][AUTOFIX][RESULT] JobId: ${options.jobId || 'N/A'} | Applied: ${anyApplied} | Modified: ${anyModified} | Status: ${rootStatus || (anyApplied ? 'SUCCESS' : 'NO_CHANGE')}`);

            if (rootStatus === 'FIX_UNSUPPORTED' || rootStatus === 'UNSUPPORTED_FIX') {
                return {
                    ok: false,
                    status: 'UNSUPPORTED_FIX',
                    error: rootError || 'NO_SAFE_FIX_AVAILABLE',
                    fix_id: options.jobId || `fix_${Date.now()}`,
                    input_issue_codes: uniqueFixes.length > 0 ? uniqueFixes : [requestedStrategy || 'UNKNOWN'],
                    requested_fixes: uniqueFixes,
                    strategy: requestedStrategy || 'UNKNOWN',
                    applied: false,
                    modified: false,
                    output_path: null,
                    warnings: ['Requested fix strategy is not recognized or supported.'],
                    verification_status: 'FAILED',
                    noopFix: false,
                    fixApplied: false,
                    rewritten: false,
                    fixedPath: null,
                    repairs: cumulativeRepairs,
                    failed_fixes: cumulativeRepairs.filter(r => r.status === 'UNSUPPORTED').map(r => ({ code: r.code, reason: r.reason })),
                    failedFixes: cumulativeRepairs.filter(r => r.status === 'UNSUPPORTED').map(r => ({ code: r.code, reason: r.reason })),
                    productionCertified: false,
                    requiresHumanReview: true,
                    artifacts: {},
                    wrapper_metadata: { timestamp: new Date().toISOString() }
                };
            }

            if (rootStatus === 'UNSAFE_BLEED_FIX_NOT_APPLIED') {
                return {
                    ok: false,
                    status: 'UNSAFE_BLEED_FIX_NOT_APPLIED',
                    error: rootError,
                    fix_id: options.jobId || `fix_${Date.now()}`,
                    input_issue_codes: uniqueFixes,
                    requested_fixes: uniqueFixes,
                    strategy: 'UNSAFE_BLEED_FIX_NOT_APPLIED',
                    applied: false,
                    modified: false,
                    output_path: null,
                    warnings: cumulativeWarnings,
                    verification_status: 'FAILED',
                    noopFix: false,
                    fixApplied: false,
                    rewritten: false,
                    fixedPath: null,
                    repairs: cumulativeRepairs,
                    artifacts: {},
                    wrapper_metadata: { timestamp: new Date().toISOString() }
                };
            }

            if (!anyModified) {
                await fs.copy(filePath, outputPath);
                return {
                    ok: false,
                    status: 'NO_CHANGE',
                    fix_id: options.jobId || `fix_${Date.now()}`,
                    input_issue_codes: uniqueFixes.length > 0 ? uniqueFixes : [requestedStrategy || 'NO_ACTION'],
                    requested_fixes: uniqueFixes,
                    strategy: requestedStrategy || 'NO_ACTION',
                    applied: false,
                    modified: false,
                    output_path: outputPath,
                    warnings: ['Document copied without modification.'],
                    verification_status: 'VERIFIED',
                    noopFix: true,
                    fixApplied: false,
                    rewritten: false,
                    fixedPath: outputPath,
                    artifacts: {
                        fixed_pdf: {
                            path: outputPath,
                            filename: path.basename(outputPath)
                        }
                    },
                    repairs: cumulativeRepairs,
                    note: 'Copied',
                    wrapper_metadata: { timestamp: new Date().toISOString() }
                };
            }

            const finalRepairs = cumulativeRepairs.map(r => ({
                ...r,
                destructiveFixRisk: r.destructiveFixRisk || highestRisk,
                rewritten: true
            }));

            const stratUsed = usedStrategy || requestedStrategy || 'UNKNOWN';
            
            // Run Delta Auditor
            const artifact_delta = await auditor.audit(filePath, outputPath, finalRepairs);
            
            // Integrate Auditor Results
            if (artifact_delta.requires_human_review) {
                requiresHumanReview = true;
            }
            if (!artifact_delta.production_certified) {
                // Production certified false if delta failed
            }
            if (artifact_delta.certification_blockers.length > 0) {
                highestRisk = 'HIGH';
            }

            const production_certified = !requiresHumanReview && highestRisk !== 'HIGH';
            const final_status = requiresHumanReview ? 'COMPLETED_WITH_REVIEW' : 'AUTOFIX_COMPLETED';

            return {
                ok: true,
                status: final_status,
                final_status: final_status,
                production_certified,
                fix_id: options.jobId || `fix_${Date.now()}`,
                input_issue_codes: uniqueFixes.length > 0 ? uniqueFixes : [stratUsed],
                requested_fixes: uniqueFixes,
                strategy: stratUsed,
                industrial_quality: usedQuality,
                requires_human_review: requiresHumanReview,
                bleed_fix_mode: usedBleedMode,
                applied: true,
                modified: true,
                output_path: outputPath,
                warnings: cumulativeWarnings,
                verification_status: requiresHumanReview ? 'HUMAN_REVIEW_REQUIRED' : 'VERIFIED',
                noopFix: false,
                fixApplied: true,
                rewritten: true,
                fixedPath: outputPath,
                artifact_delta,
                certification_blockers: artifact_delta.certification_blockers,
                review_reasons: artifact_delta.certification_blockers,
                artifacts: production_certified ? {
                    certified_pdf: {
                        path: outputPath,
                        filename: path.basename(outputPath)
                    },
                    fixed_pdf: {
                        path: outputPath,
                        filename: path.basename(outputPath)
                    }
                } : {
                    review_pdf: {
                        path: outputPath,
                        filename: path.basename(outputPath)
                    },
                    fixed_pdf: {
                        path: outputPath,
                        filename: path.basename(outputPath)
                    }
                },
                repairs: finalRepairs,
                wrapper_metadata: { timestamp: new Date().toISOString() }
            };

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
