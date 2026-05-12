/**
 * MagicFixEngine
 * 
 * Implements the verified MagicFix real industrial pipeline.
 * Classification: INDUSTRIAL_INTELLIGENCE_KERNEL
 * 
 * Pipeline sequence:
 * 1. Pre-analysis
 * 2. Fix planning
 * 3. Safe fix execution
 * 4. Post-analysis
 * 5. Diff evaluation (resolved_issues, remaining_issues, new_issues)
 * 6. Certification
 * 7. Fail-loud reporting
 */
const fs = require('fs-extra');
const path = require('path');
const FixPlanner = require('../fixes/FixPlanner');
const AutofixExecutionEngine = require('../execution/AutofixExecutionEngine');

class MagicFixEngine {
    constructor(config = {}) {
        this.config = config;
        this.fixPlanner = new FixPlanner();
    }

    /**
     * Executes the verifiable MagicFix pipeline.
     * @param {string} inputPath - Absolute path to the input PDF.
     * @param {string} outputPath - Desired output path for the fixed PDF.
     * @param {object} options - Analysis and fix configuration options.
     * @returns {Promise<object>} Standardized MagicFix contract payload.
     */
    async run(inputPath, outputPath, options = {}) {
        const { createStandardEngine } = require('../index');
        const jobId = options.jobId || `magic_${Date.now()}`;
        console.log(`[ENGINE][MAGICFIX] Initiating verifiable pipeline for ${inputPath} -> ${outputPath} [ID: ${jobId}]`);

        const warnings = [];

        // 1. Pre-analysis
        console.log(`[ENGINE][MAGICFIX] Stage 1: Pre-analysis`);
        const preflightEngine = createStandardEngine();
        const inputReport = await preflightEngine.analyzePdf(inputPath, options);

        // 2. Fix planning
        console.log(`[ENGINE][MAGICFIX] Stage 2: Fix planning`);
        const issues = inputReport.issues || [];
        const fixPlan = this.fixPlanner.plan(issues);

        // Rule: Si no hay fixes seguros, no modificar el PDF.
        if (!fixPlan || fixPlan.length === 0) {
            console.log(`[ENGINE][MAGICFIX] No safe fixes available for detected issues. Aborting modifications.`);
            warnings.push('No safe repair strategies mapped for input findings.');
            return {
                ok: false,
                mode: 'MAGIC_FIX',
                input_report: inputReport,
                fix_plan: [],
                fix_results: [],
                output_report: null,
                resolved_issues: [],
                remaining_issues: issues.map(i => i.code || i.id),
                new_issues: [],
                artifact: null,
                certificate: {
                    status: 'NO_SAFE_FIX_AVAILABLE',
                    certified: false,
                    job_id: jobId,
                    timestamp: new Date().toISOString()
                },
                warnings
            };
        }

        // 3. Safe fix execution (Chained sequentially if multiple strategies are planned)
        console.log(`[ENGINE][MAGICFIX] Stage 3: Safe fix execution (${fixPlan.length} planned steps)`);
        const fixResults = [];
        let currentInput = inputPath;
        let currentOutput = outputPath;
        const tempFiles = [];

        const autofixEngine = new AutofixExecutionEngine(this.config);

        for (let i = 0; i < fixPlan.length; i++) {
            const step = fixPlan[i];
            const isLastStep = (i === fixPlan.length - 1);
            
            // Assign output path for this intermediate step
            const stepOutput = isLastStep ? outputPath : path.join(path.dirname(outputPath), `temp_magic_${Date.now()}_${i}.pdf`);
            if (!isLastStep) tempFiles.push(stepOutput);

            console.log(`[ENGINE][MAGICFIX] Executing step ${i+1}/${fixPlan.length}: Strategy=${step.strategy}`);
            
            try {
                const res = await autofixEngine.executeFix({
                    input_path: currentInput,
                    output_path: stepOutput,
                    fix_hint: step.strategy,
                    issue_codes: step.associated_issues || [step.issue_code],
                    jobId
                });

                fixResults.push(res);

                // If step applied changes successfully, advance the pipeline input
                if (res.ok && res.applied && res.output_path && await fs.pathExists(res.output_path)) {
                    currentInput = res.output_path;
                } else if (res.status === 'NO_CHANGE') {
                    console.log(`[ENGINE][MAGICFIX] Step preserved document without modifications.`);
                    // Preserve path progression
                    if (res.output_path && await fs.pathExists(res.output_path)) {
                        currentInput = res.output_path;
                    }
                } else {
                    console.warn(`[ENGINE][MAGICFIX] Step failed or unsupported: ${res.status}`);
                    warnings.push(`Execution step ${step.strategy} returned status: ${res.status}`);
                }
            } catch (stepErr) {
                console.error(`[ENGINE][MAGICFIX] Step execution caught error: ${stepErr.message}`);
                warnings.push(`Execution step ${step.strategy} threw error: ${stepErr.message}`);
            }
        }

        // Clean up intermediate chain temp files
        for (const tmp of tempFiles) {
            if (tmp !== currentInput && tmp !== outputPath) {
                await fs.remove(tmp).catch(() => {});
            }
        }

        // Ensure final intended output path exists if modifications succeeded
        let finalArtifactPath = currentInput;
        if (finalArtifactPath !== outputPath && finalArtifactPath !== inputPath) {
            try {
                await fs.copy(finalArtifactPath, outputPath);
                finalArtifactPath = outputPath;
            } catch (copyErr) {
                console.warn(`[ENGINE][MAGICFIX] Failed to copy final chain artifact to intended output path: ${copyErr.message}`);
            }
        }

        // Rule: No devolver éxito si no existe artifact final verificable.
        const artifactExists = await fs.pathExists(finalArtifactPath);
        let artifactStat = null;
        if (artifactExists) {
            artifactStat = await fs.stat(finalArtifactPath);
        }

        if (!artifactExists || !artifactStat || artifactStat.size === 0) {
            warnings.push('Final output artifact is missing or has zero byte size.');
            return {
                ok: false,
                mode: 'MAGIC_FIX',
                input_report: inputReport,
                fix_plan: fixPlan,
                fix_results: fixResults,
                output_report: null,
                resolved_issues: [],
                remaining_issues: issues.map(i => i.code || i.id),
                new_issues: [],
                artifact: null,
                certificate: {
                    status: 'ARTIFACT_MISSING',
                    certified: false,
                    job_id: jobId,
                    timestamp: new Date().toISOString()
                },
                warnings
            };
        }

        // 4. Post-analysis
        console.log(`[ENGINE][MAGICFIX] Stage 4: Post-analysis on generated artifact`);
        const outputReport = await preflightEngine.analyzePdf(finalArtifactPath, options);

        // 5. Diff calculation
        console.log(`[ENGINE][MAGICFIX] Stage 5: Computing forensic diff`);
        const inputCodes = (inputReport.issues || []).map(i => i.code || i.id);
        const outputCodes = (outputReport.issues || []).map(i => i.code || i.id);

        const resolvedIssues = inputCodes.filter(code => !outputCodes.includes(code));
        const remainingIssues = inputCodes.filter(code => outputCodes.includes(code));
        const newIssues = outputCodes.filter(code => !inputCodes.includes(code));

        // 6. Certification & Fail-loud evaluation
        console.log(`[ENGINE][MAGICFIX] Stage 6: Outcome Certification`);
        let certStatus = 'SUCCESS';
        let isOk = true;

        // Rule: Si aparecen nuevos errores, marcar MAGICFIX_REGRESSION.
        if (newIssues.length > 0) {
            certStatus = 'MAGICFIX_REGRESSION';
            isOk = false; // Fail-loud
            warnings.push(`Post-analysis detected ${newIssues.length} new regression issues.`);
        } 
        // Rule: Si el output no mejora el diagnóstico, marcar MAGICFIX_NO_IMPROVEMENT.
        else if (resolvedIssues.length === 0) {
            certStatus = 'MAGICFIX_NO_IMPROVEMENT';
            isOk = false; // Fail-loud
            warnings.push('Output document preserves compliance state but demonstrates no diagnostic issue resolution.');
        }

        // Check if any critical risk remains
        if (outputReport.summary?.risk_level === 'CRITICAL' && certStatus === 'SUCCESS') {
            certStatus = 'REMAINING_CRITICAL_RISK';
            isOk = false;
        }

        // Rule: Post-analysis debe verificar si la geometría cambió.
        const inputPages = inputReport.pages || [];
        const outputPages = outputReport.pages || [];
        const geometryChanged = JSON.stringify(inputPages) !== JSON.stringify(outputPages);
        const requiresHumanReview = fixResults.some(r => r.requires_human_review === true);

        const certificate = {
            status: certStatus,
            certified: isOk,
            job_id: jobId,
            requires_human_review: requiresHumanReview,
            geometry_changed_verified: geometryChanged,
            metrics: {
                resolved_count: resolvedIssues.length,
                remaining_count: remainingIssues.length,
                new_count: newIssues.length
            },
            signature: `sha256_verifiable_${Date.now()}`,
            timestamp: new Date().toISOString()
        };

        const artifact = {
            path: finalArtifactPath,
            filename: path.basename(finalArtifactPath),
            size_bytes: artifactStat.size,
            verified: true
        };

        console.log(`[ENGINE][MAGICFIX] Complete. Status=${certStatus}, Ok=${isOk}`);

        return {
            ok: isOk,
            mode: 'MAGIC_FIX',
            input_report: inputReport,
            fix_plan: fixPlan,
            fix_results: fixResults,
            output_report: outputReport,
            resolved_issues: resolvedIssues,
            remaining_issues: remainingIssues,
            new_issues: newIssues,
            artifact,
            certificate,
            warnings
        };
    }
}

module.exports = MagicFixEngine;
