'use strict';

const { execFile } = require('child_process');
const util = require('util');
const execFileAsync = util.promisify(execFile);
const crypto = require('crypto');

/**
 * VeraPdfValidator
 *
 * Wrapper for the veraPDF binary (PDF/A validator).
 * Detects availability at runtime and runs real validation when available.
 * Returns honest SKIPPED_UNSUPPORTED evidence if veraPDF is not installed.
 *
 * Classification: INDUSTRIAL_RUNTIME (Technical Execution)
 */

const VERAPDF_CANDIDATES = [
    process.env.VERAPDF_PATH,
    '/usr/local/bin/verapdf',
    '/usr/bin/verapdf',
    '/opt/verapdf/bin/verapdf',
    '/opt/verapdf/verapdf',
    'verapdf',
].filter(Boolean);

// On Windows, also check .bat form
if (process.platform === 'win32') {
    VERAPDF_CANDIDATES.push('verapdf.bat');
    if (process.env.VERAPDF_PATH) {
        VERAPDF_CANDIDATES.push(process.env.VERAPDF_PATH + '.bat');
    }
}

class VeraPdfValidator {
    constructor() {
        this._resolvedBinary = undefined; // undefined = not yet checked, null = not found
        this._version = null;
        this._detectionError = null;
    }

    async findBinary() {
        if (this._resolvedBinary !== undefined) return this._resolvedBinary;

        for (const candidate of VERAPDF_CANDIDATES) {
            try {
                const { stdout } = await execFileAsync(candidate, ['--version'], {
                    timeout: 8000,
                    windowsHide: true
                });
                // Parse version from output e.g. "veraPDF 1.26.1 ..."
                const match = stdout.match(/veraPDF\s+([\d.]+)/i) ||
                              stdout.match(/([\d]+\.[\d]+\.[\d]+)/);
                this._version = match ? match[1] : 'unknown';
                this._resolvedBinary = candidate;
                return this._resolvedBinary;
            } catch (e) {
                // Try next candidate
            }
        }

        this._resolvedBinary = null;
        this._detectionError = 'veraPDF binary not found in PATH or known locations.';
        return null;
    }

    async getVersion() {
        await this.findBinary();
        return this._version;
    }

    async isAvailable() {
        const binary = await this.findBinary();
        return !!binary;
    }

    /**
     * Validate a PDF file for PDF/A conformance.
     * @param {string} pdfPath  Absolute path to the input PDF
     * @param {string} flavour  veraPDF flavour: '1a','1b','2a','2b','2u','3a','3b','3u', or 'auto'
     * @returns {object} Structured validation evidence
     */
    async validate(pdfPath, flavour = 'auto') {
        const binary = await this.findBinary();

        if (!binary) {
            return {
                available: false,
                validation_performed: false,
                validator_name: 'verapdf',
                validator_version: null,
                validation_passed: false,
                compliance_claim_allowed: false,
                standard_detected: null,
                validation_report_hash: null,
                error: 'VALIDATOR_NOT_FOUND',
                message: 'veraPDF binary not found. Install veraPDF to enable real PDF/A validation.',
                candidates_checked: VERAPDF_CANDIDATES
            };
        }

        try {
            // veraPDF CLI: --format json --flavour <f> <file>
            const args = ['--format', 'json'];
            if (flavour && flavour !== 'auto') {
                args.push('--flavour', flavour);
            }
            args.push(pdfPath);

            const { stdout, stderr } = await execFileAsync(binary, args, {
                timeout: 90000,
                maxBuffer: 20 * 1024 * 1024,
                windowsHide: true
            });

            let report = null;
            try {
                report = JSON.parse(stdout);
            } catch (_) {
                // veraPDF may emit text before the JSON blob
                const jsonMatch = stdout.match(/(\{[\s\S]*\})/);
                if (jsonMatch) {
                    try { report = JSON.parse(jsonMatch[1]); } catch (_2) {}
                }
            }

            if (!report) {
                return {
                    available: true,
                    validation_performed: true,
                    validator_name: 'verapdf',
                    validator_version: this._version,
                    validation_passed: false,
                    compliance_claim_allowed: false,
                    standard_detected: null,
                    validation_report_hash: null,
                    error: 'REPORT_PARSE_ERROR',
                    raw_stdout_excerpt: stdout.slice(0, 500),
                    raw_stderr_excerpt: (stderr || '').slice(0, 200)
                };
            }

            return this._parseReport(report);

        } catch (e) {
            return {
                available: true,
                validation_performed: false,
                validator_name: 'verapdf',
                validator_version: this._version,
                validation_passed: false,
                compliance_claim_allowed: false,
                standard_detected: null,
                validation_report_hash: null,
                error: 'VALIDATION_EXECUTION_ERROR',
                error_message: e.message
            };
        }
    }

    _parseReport(report) {
        // veraPDF JSON structure varies by version; defensively extract
        const rawReport = report.report || report;
        const jobs = rawReport.jobs || rawReport.job ? [rawReport.job] : [];
        const job = Array.isArray(jobs) ? jobs[0] : jobs;
        const validationResult = (job && job.validationResult) || {};

        const isCompliant = validationResult.isCompliant === true;
        const profileName = validationResult.profileName ||
                            (rawReport.buildInformation && rawReport.buildInformation.releaseDetails) || '';
        const standardDetected = this._parseStandard(String(profileName));

        // Compute a short hash of the report for evidence linking
        const reportStr = JSON.stringify(report);
        const reportHash = crypto.createHash('sha256').update(reportStr).digest('hex').slice(0, 16);

        const passedRules = validationResult.passedRules !== undefined ? validationResult.passedRules : null;
        const failedRules = validationResult.failedRules !== undefined ? validationResult.failedRules : null;

        const errors = this._extractErrors(job);

        const complianceClaimAllowed = isCompliant &&
            !!this._version &&
            !!standardDetected &&
            !!reportHash;

        return {
            available: true,
            validation_performed: true,
            validator_name: 'verapdf',
            validator_version: this._version,
            validation_passed: isCompliant,
            standard_detected: standardDetected,
            profile_name: String(profileName),
            validation_report_hash: reportHash,
            compliance_claim_allowed: complianceClaimAllowed,
            passed_rules: passedRules,
            failed_rules: failedRules,
            errors
        };
    }

    _parseStandard(profileName) {
        if (!profileName) return null;
        const lower = profileName.toLowerCase();
        if (lower.includes('pdf/a-1a')) return 'PDF/A-1a';
        if (lower.includes('pdf/a-1b')) return 'PDF/A-1b';
        if (lower.includes('pdf/a-2a')) return 'PDF/A-2a';
        if (lower.includes('pdf/a-2b')) return 'PDF/A-2b';
        if (lower.includes('pdf/a-2u')) return 'PDF/A-2u';
        if (lower.includes('pdf/a-3a')) return 'PDF/A-3a';
        if (lower.includes('pdf/a-3b')) return 'PDF/A-3b';
        if (lower.includes('pdf/a-3u')) return 'PDF/A-3u';
        if (lower.includes('pdf/a-4')) return 'PDF/A-4';
        if (lower.includes('pdf/a')) return 'PDF/A';
        return null;
    }

    _extractErrors(job) {
        const errors = [];
        if (!job) return errors;
        const assertions = (job.validationResult && job.validationResult.assertions) || [];
        for (const a of assertions.slice(0, 20)) {
            if (!a.status || a.status === 'PASSED') continue;
            errors.push({
                rule: a.ruleId || a.specification,
                message: a.message || 'Validation rule violated'
            });
        }
        return errors;
    }
}

// Singleton — detection result cached across calls within the same process
module.exports = new VeraPdfValidator();
