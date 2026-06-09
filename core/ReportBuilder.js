const { HEAVY_PDF_THRESHOLD_BYTES } = require('../utils/ProbeSemanticsClassifier');

/**
 * ReportBuilder
 *
 * Standardizes the output structure of the preflight engine.
 * Phase 62F-A: adds precise degraded_reasons from probe semantics and heavy_pdf_probe_governance.
 */
class ReportBuilder {
    build({ issues, riskSummary, metadata, filePath, partial = false, warnings = [], analyzerCoverage = null, options = {} }) {
        let analysis_type = 'REAL_INDUSTRIAL';
        const hasExtractionErrors = metadata.analysisIntegrity?.extractionErrors?.length > 0;
        const isDegraded = partial || hasExtractionErrors || warnings.some(w => w.error?.includes('DEGRADED') || w.error?.includes('FAILED'));
        if (metadata.environmentFailure) {
            analysis_type = 'ENGINE_ENVIRONMENT_FAILURE';
        } else if (metadata.source === 'FALLBACK_MOCK' || isDegraded) {
            analysis_type = (metadata.pages === 0 && !metadata.geometry?.pages?.length) ? 'FAILED' : 'DEGRADED';
        } else if (partial) {
            analysis_type = 'PARTIAL';
        }

        const strictMode = process.env.PREFLIGHT_STRICT_FORENSIC_MODE === 'true' || 
                           process.env.STRICT_FORENSIC_MODE === 'true' || 
                           options.strict_forensic_mode === true || 
                           options.strictForensicMode === true;

        const fallbackUsed = metadata.source === 'FALLBACK_MOCK' || 
                             metadata.analysisIntegrity?.realExtraction === false || 
                             metadata.environmentFailure === true;
        
        const finalPartial = partial || hasExtractionErrors || fallbackUsed;

        // Rule #16: Never return ok: true if there was no real extraction or fallback/mock data was used
        const hasCriticalOrError = issues.some(i => i.severity === 'critical' || i.severity === 'error');
        const isOk = (fallbackUsed || hasCriticalOrError) ? false : (riskSummary.level !== 'CRITICAL');
        
        // In strict forensic mode, any fallback invalidates the entire analysis certification
        const isCertifiable = ((strictMode && fallbackUsed) || hasCriticalOrError) ? false : (riskSummary.level !== 'CRITICAL');
        const allowAutofix = !(strictMode && fallbackUsed);

        const forensic_events = [];
        if (fallbackUsed) {
            forensic_events.push('FORENSIC_DEGRADED_ANALYSIS');
        }

        const mappedIssues = issues.map(i => ({
            id: i.id,
            code: i.code || i.id,
            analyzer: i.analyzer || 'PreflightEngine',
            severity: i.severity,
            message: i.message,
            page: i.page || null,
            fixable: allowAutofix ? !!(i.fixable || i.fix_method || i.repairStrategy) : false,
            fix_method: allowAutofix ? (i.fix_method || null) : null,
            repairStrategy: allowAutofix ? (i.repairStrategy || i.fix_method || null) : null,
            category: i.category || null,
            confidence: i.confidence !== undefined ? i.confidence : (i.evidence?.confidence !== undefined ? i.evidence.confidence : 0.98),
            fixRequired: i.fixRequired || false,
            safeToAutofix: allowAutofix ? (i.safeToAutofix || false) : false,
            destructiveFixRisk: i.destructiveFixRisk || "LOW",
            evidence: i.evidence || { source: "PDF Kernel Extraction", descriptor: "Dictionary metrics and structural verification pass" }
        }));

        const baseIntegrity = metadata.analysisIntegrity || {};
        const missingToolsResolved = baseIntegrity.missingTools || [];
        const analysisIntegrity = {
            ...baseIntegrity,
            realExtraction: !fallbackUsed && (baseIntegrity.realExtraction !== false),
            fallbackUsed: fallbackUsed,
            degradedMode: analysis_type === 'DEGRADED' || analysis_type === 'FAILED' || analysis_type === 'ENGINE_ENVIRONMENT_FAILURE' || !!baseIntegrity.degradedMode,
            extractionErrors: baseIntegrity.extractionErrors || [],
            missingTools: missingToolsResolved,
            probeResults: baseIntegrity.probeResults || {},
            availableTools: baseIntegrity.availableTools || [],
            extractionPipeline: baseIntegrity.extractionPipeline || [],
            parserVersions: baseIntegrity.parserVersions || {}
        };

        let analysis_status = 'COMPLETE';
        if (analysis_type === 'ENGINE_ENVIRONMENT_FAILURE') analysis_status = 'ENGINE_ENVIRONMENT_FAILURE';
        else if (analysis_type === 'FAILED') analysis_status = 'FAILED';
        else if (analysis_type === 'DEGRADED') analysis_status = 'DEGRADED';
        else if (analysis_type === 'PARTIAL') analysis_status = 'PARTIAL';

        const missing_tools = missingToolsResolved;
        const degraded_reasons = [];
        if (metadata.source === 'FALLBACK_MOCK') {
            degraded_reasons.push('FALLBACK_MOCK_USED');
        }
        if (hasExtractionErrors) {
            analysisIntegrity.extractionErrors?.forEach(err => {
                // Phase 62F-A: use probe semantics for precise degraded reason instead of generic TOOL_EXTRACTION_FAILED
                const probeSem = analysisIntegrity.probeSemantics?.tools?.[err.parser];
                const semanticStatus = probeSem?.semantic_status || err.semanticStatus;
                const warningClasses = probeSem?.warning_classes || [];

                if (semanticStatus === 'WARNING_ONLY' || semanticStatus === 'SUCCESS_WITH_WARNINGS') {
                    // Emit specific warning-class reasons when known
                    let emittedSpecific = false;
                    if (warningClasses.includes('PDF_FONT_WEIGHT_WARNING')) {
                        degraded_reasons.push(`PDF_FONT_WEIGHT_WARNING:${err.parser}`);
                        emittedSpecific = true;
                    }
                    if (['PDF_LINEARIZATION_HINT_WARNING','PDF_SHARED_OBJECT_HINT_MISMATCH','PDF_OBJECT_COUNT_HINT_MISMATCH'].some(c => warningClasses.includes(c))) {
                        degraded_reasons.push(`PDF_STRUCTURAL_WARNING:${err.parser}`);
                        emittedSpecific = true;
                    }
                    if (!emittedSpecific) {
                        degraded_reasons.push(`TOOL_PROBE_WARNING:${err.parser}`);
                    }
                } else if (semanticStatus === 'PARTIAL_SUCCESS') {
                    degraded_reasons.push(`TOOL_PROBE_PARTIAL:${err.parser}`);
                } else if (semanticStatus === 'FAILED_TIMEOUT') {
                    degraded_reasons.push(`TOOL_PROBE_TIMEOUT:${err.parser}`);
                } else if (semanticStatus === 'FAILED_OOM') {
                    degraded_reasons.push(`TOOL_PROBE_OOM:${err.parser}`);
                } else if (semanticStatus === 'FAILED_TOOL_MISSING') {
                    // covered by MISSING_TOOL: below
                } else {
                    // FAILED_FATAL, FAILED_NO_OUTPUT, FAILED_UNCLASSIFIED, or no semantic info
                    degraded_reasons.push(`TOOL_EXTRACTION_FAILED:${err.parser}`);
                }
            });
        }
        warnings.forEach(w => {
            if (typeof w === 'string') degraded_reasons.push(w);
            else if (w.error) degraded_reasons.push(w.error);
            else if (w.message) degraded_reasons.push(w.message);
        });
        if (missing_tools.length > 0) {
            missing_tools.forEach(t => degraded_reasons.push(`MISSING_TOOL:${t}`));
        }
        const uniqueDegradedReasons = [...new Set(degraded_reasons)];

        // Enforce strict Status Consensus
        const isOffsetPolicy = options.policy === 'OFFSET_MODERN_COATED_F51' || 
                               options.profile === 'OFFSET_MODERN_COATED_F51' ||
                               options.policy?.includes('OFFSET') ||
                               options.profile?.includes('OFFSET');

        let status = 'PASS';
        const hasCriticalOrErrorMapped = mappedIssues.some(i => i.severity === 'critical' || i.severity === 'error');
        const hasWarningOrInfo = mappedIssues.some(i => i.severity === 'warning' || i.severity === 'info');

        if (metadata.environmentFailure === true) {
            status = 'FAILED_RUNTIME_ENVIRONMENT';
        } else if (hasCriticalOrErrorMapped) {
            status = isOffsetPolicy ? 'FAIL_PREPRESS' : 'FAIL';
        } else if (missing_tools.length > 0) {
            status = 'DEGRADED';
        } else if (analyzerCoverage?.partial?.length > 0 || analyzerCoverage?.skipped?.length > 0) {
            status = 'PARTIAL';
        } else if (hasWarningOrInfo) {
            status = 'PASS_WITH_WARNINGS';
        }

        let outcome_category = 'SUCCESS';
        if (metadata.environmentFailure === true) {
            outcome_category = 'ENVIRONMENT_FAILURE';
        } else if (hasCriticalOrErrorMapped) {
            outcome_category = 'PDF_DOCUMENT_FAILURE';
        } else if (missing_tools.length > 0) {
            outcome_category = 'DEGRADED_ANALYSIS';
        } else if (analyzerCoverage?.partial?.length > 0 || analyzerCoverage?.skipped?.length > 0) {
            outcome_category = 'PARTIAL_ANALYSIS';
        } else if (hasWarningOrInfo) {
            outcome_category = 'SUCCESS_WITH_FINDINGS';
        }

        const heavyPdfGovernance = this._buildHeavyPdfProbeGovernance({
            metadata,
            analysisIntegrity,
            certifiable: isCertifiable,
            analysisStatus: analysis_status
        });

        return {
            ok: isOk,
            status,
            outcome_category,
            risk_score: riskSummary.score,
            strict_forensic_mode: strictMode,
            analyzerCoverage: analyzerCoverage ? {
                ...analyzerCoverage,
                partial: analyzerCoverage.partial || []
            } : {
                registered: [],
                executed: [],
                partial: [],
                skipped: [],
                failed: []
            },
            analysis_type,
            analysis_status,
            analysis_scope: (metadata.environmentFailure || missing_tools.length > 0 || (analyzerCoverage?.partial?.length > 0))
                ? 'PARTIAL_ANALYSIS'
                : 'FULL_ANALYSIS',
            certifiable: isCertifiable,
            timestamp: new Date().toISOString(),
            partial: finalPartial,
            analysisIntegrity,
            forensic_events,
            degraded_reasons: uniqueDegradedReasons,
            missing_tools,
            missingTools: missing_tools, // direct top-level support
            pdf_version: metadata.pdfVersion || 'unknown',
            page_count: metadata.pages || metadata.pageCount || 0,
            summary: {
                risk_level: riskSummary.level,
                risk_score: riskSummary.score,
                scoreBasis: riskSummary.scoreBasis || 'DOCUMENT_FINDINGS',
                issue_count: issues.length,
                critical_count: riskSummary.criticals,
                analysis_warnings: warnings.length
            },
            document: {
                name: metadata.filename || filePath.split('/').pop(),
                size: metadata.size || 0,
                page_count: metadata.pages || metadata.pageCount || 0,
                pdf_version: metadata.pdfVersion || 'unknown'
            },
            issues: mappedIssues,
            findings: mappedIssues,
            analysis_warnings: warnings,
            engines: {
                preflight_engine: 'v1.9.0-deterministic',
                signature: process.env.GIT_COMMIT?.slice(0, 7) || 'local',
                strict_forensic_mode: strictMode
            },
            heavy_pdf_probe_governance: heavyPdfGovernance,
            // Legacy/Upstream Compatibility Aliases
            analysis: { issues: mappedIssues },
            forensics: { findings: mappedIssues, events: forensic_events }
        };
    }

    _buildHeavyPdfProbeGovernance({ metadata, analysisIntegrity, certifiable, analysisStatus }) {
        const fileSizeBytes = metadata.size || 0;
        const fileSizeMb = parseFloat((fileSizeBytes / (1024 * 1024)).toFixed(2));
        const pageCount = metadata.pages || 0;
        const heavyPdfDetected = fileSizeBytes >= HEAVY_PDF_THRESHOLD_BYTES || metadata.heavyPdfDetected === true;
        const probeSemantics = analysisIntegrity.probeSemantics;
        const probeSemanticApplied = !!(probeSemantics?.applied);
        const toolsSemantics = probeSemantics?.tools || {};

        // Build probe_summary counts
        const probeSummary = { total: 0, success: 0, success_with_warnings: 0, warning_only: 0, partial_success: 0, failed_fatal: 0, failed_timeout: 0, failed_oom: 0, failed_tool_missing: 0, failed_no_output: 0, failed_unclassified: 0 };
        for (const toolResult of Object.values(toolsSemantics)) {
            probeSummary.total++;
            switch (toolResult.semantic_status) {
                case 'SUCCESS':                probeSummary.success++;               break;
                case 'SUCCESS_WITH_WARNINGS':  probeSummary.success_with_warnings++; break;
                case 'WARNING_ONLY':           probeSummary.warning_only++;          break;
                case 'PARTIAL_SUCCESS':        probeSummary.partial_success++;       break;
                case 'FAILED_FATAL':           probeSummary.failed_fatal++;          break;
                case 'FAILED_TIMEOUT':         probeSummary.failed_timeout++;        break;
                case 'FAILED_OOM':             probeSummary.failed_oom++;            break;
                case 'FAILED_TOOL_MISSING':    probeSummary.failed_tool_missing++;   break;
                case 'FAILED_NO_OUTPUT':       probeSummary.failed_no_output++;      break;
                case 'FAILED_UNCLASSIFIED':    probeSummary.failed_unclassified++;   break;
            }
        }

        const hasFatalProbe = Object.values(toolsSemantics).some(t => t.fatal);
        const hasWarningProbe = Object.values(toolsSemantics).some(t => ['WARNING_ONLY','SUCCESS_WITH_WARNINGS','PARTIAL_SUCCESS'].includes(t.semantic_status));
        const analysisDegrade = analysisStatus === 'DEGRADED' || analysisStatus === 'FAILED';
        const fatalDocumentFailure = hasFatalProbe;
        const degradedButUsable = analysisDegrade && !fatalDocumentFailure && hasWarningProbe;
        const reviewRequired = fatalDocumentFailure || degradedButUsable;

        // Collect warnings and review reasons
        const governanceWarnings = [];
        const reviewReasons = [];

        const qpdfSem = toolsSemantics.qpdf;
        const pdfimageSem = toolsSemantics.pdfimages;

        if (qpdfSem?.structural_warning) {
            governanceWarnings.push('qpdf reported structural warnings (linearization, hint-table, or object count mismatch).');
            reviewReasons.push('QPDF_STRUCTURAL_WARNING');
        }
        if (pdfimageSem && ['WARNING_ONLY','SUCCESS_WITH_WARNINGS'].includes(pdfimageSem.semantic_status)) {
            governanceWarnings.push('pdfimages reported warnings during image extraction.');
            reviewReasons.push('PDFIMAGES_WARNING');
        }
        if (heavyPdfDetected) {
            governanceWarnings.push('Heavy PDF detected (≥500 MB). Analysis may be incomplete for some probes.');
            reviewReasons.push('HEAVY_PDF_DETECTED');
        }
        if (fatalDocumentFailure) {
            governanceWarnings.push('A critical probe failure prevents full analysis. Re-exporting or repairing the source PDF is recommended.');
            reviewReasons.push('FATAL_PROBE_FAILURE');
        }

        // Build tools governance structure (omit raw evidence details to keep report clean)
        const toolsGovernance = {};
        for (const [name, sem] of Object.entries(toolsSemantics)) {
            toolsGovernance[name] = {
                raw_status: sem.raw_status,
                semantic_status: sem.semantic_status,
                severity: sem.severity,
                usable_output: sem.usable_output,
                fatal: sem.fatal,
                warning_classes: sem.warning_classes || [],
                fatal_classes: sem.fatal_classes || []
            };
        }

        return {
            heavy_pdf_detected: heavyPdfDetected,
            file_size_bytes: fileSizeBytes,
            file_size_mb: fileSizeMb,
            page_count: pageCount,
            probe_semantics_applied: probeSemanticApplied,
            analysis_degraded: analysisDegrade,
            degraded_but_usable: degradedButUsable,
            fatal_document_failure: fatalDocumentFailure,
            certifiable: certifiable && !reviewRequired,
            review_required: reviewRequired,
            production_certified: false,
            standard_certified: false,
            pdfx_compliance_claimed: false,
            pdfa_compliance_claimed: false,
            compliance_claim_allowed: false,
            probe_summary: probeSummary,
            tools: toolsGovernance,
            warnings: governanceWarnings,
            review_required_reasons: reviewReasons,
            evidence: {}
        };
    }
}

module.exports = ReportBuilder;
