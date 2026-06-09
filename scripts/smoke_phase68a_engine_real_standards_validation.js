'use strict';

const fs = require('fs-extra');
const path = require('path');
const AutofixExecutionEngine = require('../execution/AutofixExecutionEngine');
const veraPdf = require('../execution/VeraPdfValidator');
const { getFixCapability } = require('../fixes/FixRegistry');
const { CODES } = require('../interpretation/IndustrialFindingCodes');
const FixPlanner = require('../fixes/FixPlanner');
const IssueNormalizer = require('../core/IssueNormalizer');

const FIXTURES_DIR = path.join(__dirname, '../fixtures/phase68a');
const REPORTS_DIR = path.join(__dirname, '../reports');

const PHASE68A_CAPABILITIES = [
    'VALIDATE_PDFX',
    'VALIDATE_PDFA',
    'GENERATE_STANDARD_VALIDATION_REPORT',
    'CONVERT_TO_PDFX_VALIDATED',
    'CONVERT_TO_PDFA_VALIDATED'
];

const FORBIDDEN_OVERCLAIM_PHRASES = [
    'print-ready',
    'certified pdf',
    'pdf/x validated',
    'pdf/a validated',
    'production certified',
    'standards certified',
    '"production_safe":true',
    '"production_certified":true',
    '"standard_certified":true'
];

// Minimal valid PDF for fixture generation (enough for veraPDF to parse)
function minimalPdf(title) {
    return `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >> endobj
xref
0 4
0000000000 65535 f
0000000009 00000 n
0000000062 00000 n
0000000119 00000 n
trailer << /Size 4 /Root 1 0 R >>
startxref
210
%%EOF`;
}

async function ensureFixtures() {
    await fs.ensureDir(FIXTURES_DIR);
    const required = [
        'pdfx_claimed.pdf',
        'pdfa_claimed.pdf',
        'no_standard_claim.pdf',
        'clean_control.pdf'
    ];
    for (const name of required) {
        const p = path.join(FIXTURES_DIR, name);
        if (!fs.existsSync(p)) {
            await fs.writeFile(p, minimalPdf(name));
        }
    }
}

async function runFix(engine, fixId, fixture) {
    const inputPath = path.join(FIXTURES_DIR, fixture);
    const outputPath = path.join(FIXTURES_DIR, `regression_output_${fixId.toLowerCase()}_${fixture}`);
    try {
        return await engine.executeFix({
            input_path: inputPath,
            output_path: outputPath,
            fix_hint: fixId,
            planned: true
        });
    } catch (e) {
        return { failed: true, error_message: e.message, status: 'FAILED' };
    }
}

function checkStandardsGovernance(res, notes) {
    let ok = true;

    // No compliance claim without full evidence
    if (res.compliance_claim_allowed === true) {
        const evidenceComplete = res.validation_performed === true &&
            res.validation_passed === true &&
            !!res.validator_name &&
            !!res.validator_version &&
            !!res.standard_detected &&
            !!res.validation_report_hash;
        if (!evidenceComplete) {
            ok = false;
            notes.push('Governance violation: compliance_claim_allowed=true but evidence is incomplete');
        }
    }

    // standard_certified must always be false (engine does not certify)
    if (res.standard_certified === true) {
        ok = false;
        notes.push('Governance violation: standard_certified=true is forbidden at engine level');
    }

    // production_safe must always be false for standards fixes
    if (res.production_safe === true) {
        ok = false;
        notes.push('Governance violation: production_safe=true for standards fix');
    }

    // production_certified must be false
    if (res.production_certified === true) {
        ok = false;
        notes.push('Governance violation: production_certified=true for standards fix');
    }

    // requires_human_review must be true for all standards fixes
    if (res.requires_human_review !== true) {
        ok = false;
        notes.push('Governance violation: requires_human_review must be true for standards fixes');
    }

    // Evidence object required
    const allowedStatuses = ['SKIPPED_UNSUPPORTED', 'SKIPPED', 'FAILED', 'APPLIED'];
    if (allowedStatuses.includes(res.status) && (!res.evidence || Object.keys(res.evidence).length === 0)) {
        ok = false;
        notes.push('Governance violation: evidence object is missing or empty');
    }

    // Forbidden overclaim phrases
    const serialized = JSON.stringify(res).toLowerCase();
    for (const phrase of FORBIDDEN_OVERCLAIM_PHRASES) {
        if (serialized.includes(phrase)) {
            ok = false;
            notes.push(`Forbidden overclaim phrase detected: "${phrase}"`);
        }
    }

    return ok;
}

async function main() {
    await fs.ensureDir(REPORTS_DIR);
    await ensureFixtures();

    const engine = new AutofixExecutionEngine();
    const results = [];
    let smokePassed = true;

    // --- Scenario 1: FixRegistry Phase 68A capabilities check ---
    {
        const notes = [];
        let passed = true;
        for (const fixId of PHASE68A_CAPABILITIES) {
            const cap = getFixCapability(fixId);
            if (!cap) {
                passed = false;
                notes.push(`FixRegistry missing capability: ${fixId}`);
                continue;
            }
            if (cap.category !== 'standards_certification') {
                passed = false;
                notes.push(`${fixId}: expected category=standards_certification, got ${cap.category}`);
            }
            if (cap.production_safe !== false) {
                passed = false;
                notes.push(`${fixId}: expected production_safe=false`);
            }
            if (!cap.requires_human_review) {
                passed = false;
                notes.push(`${fixId}: expected requires_human_review=true`);
            }
            if (cap.compliance_claim_allowed !== false) {
                passed = false;
                notes.push(`${fixId}: expected compliance_claim_allowed=false in registry`);
            }
            if (!cap.validator_required) {
                passed = false;
                notes.push(`${fixId}: expected validator_required=true`);
            }
        }
        if (!passed) smokePassed = false;
        results.push({
            scenario: 'FixRegistry standards_certification (Phase 68A) capabilities check',
            fixture: null,
            capability: PHASE68A_CAPABILITIES.join(', '),
            status: passed ? 'VERIFIED' : 'VIOLATION',
            pass: passed,
            notes: notes.length ? notes : ['All Phase 68A standards_certification capabilities registered with correct policy fields.']
        });
    }

    // --- Scenario 2: IndustrialFindingCodes Phase 68A compliance codes ---
    {
        const notes = [];
        let passed = true;
        const expectedCodes = {
            PDFA_MISSING: 'IND_COMPLIANCE_023',
            PDFA_INVALID: 'IND_COMPLIANCE_024',
            PDFA_CLAIMED_BUT_NOT_VALIDATED: 'IND_COMPLIANCE_025',
            STANDARD_VALIDATION_PASSED: 'IND_COMPLIANCE_026',
            VALIDATOR_EVIDENCE_COMPLETE: 'IND_COMPLIANCE_027',
            VALIDATOR_EVIDENCE_INCOMPLETE: 'IND_COMPLIANCE_028',
            // Existing codes that must remain
            STANDARD_VALIDATOR_UNAVAILABLE: 'IND_COMPLIANCE_013',
            STANDARD_VALIDATION_FAILED: 'IND_COMPLIANCE_014',
            STANDARD_VALIDATION_REQUIRED: 'IND_COMPLIANCE_015',
            STANDARD_CLAIM_WITHOUT_VALIDATOR_EVIDENCE: 'IND_COMPLIANCE_022'
        };
        for (const [name, code] of Object.entries(expectedCodes)) {
            if (CODES[name] !== code) {
                passed = false;
                notes.push(`IndustrialFindingCodes.${name} expected ${code}, got ${CODES[name]}`);
            }
        }
        if (!passed) smokePassed = false;
        results.push({
            scenario: 'IndustrialFindingCodes Phase 68A compliance codes',
            fixture: null,
            capability: null,
            status: passed ? 'VERIFIED' : 'VIOLATION',
            pass: passed,
            notes: notes.length ? notes : ['All Phase 68A compliance finding codes registered correctly (IND_COMPLIANCE_023-028).']
        });
    }

    // --- Scenario 3: IssueNormalizer routing for standards findings ---
    {
        const notes = [];
        let passed = true;
        const testCases = [
            { code: 'IND_COMPLIANCE_022', label: 'STANDARD_CLAIM_WITHOUT_VALIDATOR_EVIDENCE', expectedCat: 'COMPLIANCE' },
            { code: 'IND_COMPLIANCE_013', label: 'STANDARD_VALIDATOR_UNAVAILABLE', expectedCat: 'COMPLIANCE' },
            { code: 'IND_COMPLIANCE_023', label: 'PDFA_MISSING (Phase 68A)', expectedCat: 'COMPLIANCE' },
            { code: 'IND_COMPLIANCE_025', label: 'PDFA_CLAIMED_BUT_NOT_VALIDATED (Phase 68A)', expectedCat: 'COMPLIANCE' }
        ];
        for (const tc of testCases) {
            const normalized = IssueNormalizer.normalize([{ code: tc.code, severity: 'error' }]);
            const n = normalized[0];
            if (n.category !== tc.expectedCat) {
                passed = false;
                notes.push(`${tc.label}: expected category=${tc.expectedCat}, got ${n.category}`);
            }
        }
        if (!passed) smokePassed = false;
        results.push({
            scenario: 'IssueNormalizer Phase 68A compliance code routing',
            fixture: null,
            capability: null,
            status: passed ? 'VERIFIED' : 'VIOLATION',
            pass: passed,
            notes: notes.length ? notes : ['IssueNormalizer correctly categorizes Phase 68A compliance codes as COMPLIANCE.']
        });
    }

    // --- Scenario 4: FixPlanner guardrails — standards_certification never auto-executable ---
    {
        const notes = [];
        let passed = true;
        const planner = new FixPlanner();
        const standardsFindings = [
            { id: 'IND_COMPLIANCE_022', code: 'IND_COMPLIANCE_022', repairStrategy: 'VALIDATE_PDFA' },
            { id: 'IND_COMPLIANCE_015', code: 'IND_COMPLIANCE_015', repairStrategy: 'GENERATE_STANDARD_VALIDATION_REPORT' },
            { id: 'IND_COMPLIANCE_025', code: 'IND_COMPLIANCE_025', repairStrategy: 'VALIDATE_PDFA' }
        ];

        for (const policyMode of ['SAFE', 'REVIEW_REQUIRED', 'EXPERIMENTAL']) {
            const plan = planner.plan(standardsFindings, policyMode);
            for (const step of plan) {
                if (step.planned !== false || step.executable !== false) {
                    passed = false;
                    notes.push(`[${policyMode}] ${step.fix_id}: standards_certification fix must never be planned/executable (got planned=${step.planned}, executable=${step.executable})`);
                }
                if (step.skip_reason !== 'VALIDATOR_REQUIRED' && step.skip_reason !== 'FIX_NOT_IMPLEMENTED') {
                    notes.push(`[${policyMode}] ${step.fix_id}: skip_reason=${step.skip_reason} (expected VALIDATOR_REQUIRED or FIX_NOT_IMPLEMENTED)`);
                }
            }
        }
        if (!passed) smokePassed = false;
        results.push({
            scenario: 'FixPlanner standards_certification Phase 68A guardrails',
            fixture: null,
            capability: null,
            status: passed ? 'VERIFIED' : 'VIOLATION',
            pass: passed,
            notes: notes.length ? notes : ['FixPlanner correctly blocks all Phase 68A standards_certification fixes from auto-execution in any policy mode.']
        });
    }

    // --- Scenario 5: veraPDF availability detection (honest) ---
    {
        const notes = [];
        let passed = true;
        const available = await veraPdf.isAvailable();
        const version = await veraPdf.getVersion();
        notes.push(`veraPDF available: ${available}`);
        if (available) {
            notes.push(`veraPDF version: ${version}`);
        } else {
            notes.push('veraPDF not found — VALIDATE_PDFA will return SKIPPED_UNSUPPORTED with honest evidence.');
        }
        results.push({
            scenario: 'veraPDF availability detection',
            fixture: null,
            capability: 'VALIDATE_PDFA',
            status: 'VERIFIED',
            pass: passed,
            verapdf_available: available,
            verapdf_version: version,
            notes
        });
    }

    // --- Scenario 6: VALIDATE_PDFX — honest about PDF/X validator scope ---
    {
        const res = await runFix(engine, 'VALIDATE_PDFX', 'pdfx_claimed.pdf');
        const notes = [];
        let passed = true;

        const allowedStatuses = ['SKIPPED_UNSUPPORTED', 'SKIPPED', 'FAILED'];
        if (!allowedStatuses.includes(res.status)) {
            passed = false;
            notes.push(`Expected one of ${allowedStatuses.join(', ')}, got ${res.status} — PDF/X validation must not claim success without a real PDF/X validator`);
        }
        if (res.pdfx_compliance_claimed === true) {
            passed = false;
            notes.push('Governance violation: pdfx_compliance_claimed=true without a PDF/X validator');
        }
        if (!checkStandardsGovernance(res, notes)) passed = false;

        if (!passed) smokePassed = false;
        results.push({
            scenario: 'VALIDATE_PDFX — honest about PDF/X validator scope',
            fixture: 'pdfx_claimed.pdf',
            capability: 'VALIDATE_PDFX',
            status: res.status,
            validation_performed: res.validation_performed,
            pdfx_compliance_claimed: !!res.pdfx_compliance_claimed,
            compliance_claim_allowed: !!res.compliance_claim_allowed,
            evidence: res.evidence || null,
            requires_human_review: !!res.requires_human_review,
            pass: passed,
            notes: notes.length ? notes : ['VALIDATE_PDFX correctly skips without a dedicated PDF/X validator.']
        });
    }

    // --- Scenario 7: VALIDATE_PDFA — veraPDF integration or honest SKIPPED_UNSUPPORTED ---
    {
        const res = await runFix(engine, 'VALIDATE_PDFA', 'pdfa_claimed.pdf');
        const notes = [];
        let passed = true;

        const allowedStatuses = ['SKIPPED_UNSUPPORTED', 'SKIPPED', 'FAILED', 'APPLIED'];
        if (!allowedStatuses.includes(res.status)) {
            passed = false;
            notes.push(`Unexpected status: ${res.status}`);
        }

        // Regardless of veraPDF availability, governance must hold
        if (!checkStandardsGovernance(res, notes)) passed = false;

        // If compliance_claim_allowed=true, must have full evidence
        if (res.compliance_claim_allowed === true) {
            const evidenceComplete = res.validation_performed === true &&
                res.validation_passed === true &&
                !!res.validator_name &&
                !!res.validator_version &&
                !!res.standard_detected &&
                !!res.validation_report_hash;
            if (!evidenceComplete) {
                passed = false;
                notes.push('compliance_claim_allowed=true but evidence is incomplete (missing required fields)');
            }
        }

        if (!passed) smokePassed = false;
        results.push({
            scenario: 'VALIDATE_PDFA — veraPDF integration or honest SKIPPED_UNSUPPORTED',
            fixture: 'pdfa_claimed.pdf',
            capability: 'VALIDATE_PDFA',
            status: res.status,
            validation_performed: !!res.validation_performed,
            validation_passed: !!res.validation_passed,
            validator_name: res.validator_name || null,
            validator_version: res.validator_version || null,
            standard_detected: res.standard_detected || null,
            validation_report_hash: res.validation_report_hash || null,
            compliance_claim_allowed: !!res.compliance_claim_allowed,
            evidence: res.evidence || null,
            requires_human_review: !!res.requires_human_review,
            pass: passed,
            notes: notes.length ? notes : ['VALIDATE_PDFA returns veraPDF evidence when available, or honest SKIPPED_UNSUPPORTED.']
        });
    }

    // --- Scenario 8: GENERATE_STANDARD_VALIDATION_REPORT ---
    {
        const res = await runFix(engine, 'GENERATE_STANDARD_VALIDATION_REPORT', 'no_standard_claim.pdf');
        const notes = [];
        let passed = true;

        const allowedStatuses = ['SKIPPED_UNSUPPORTED', 'SKIPPED', 'FAILED', 'APPLIED'];
        if (!allowedStatuses.includes(res.status)) {
            passed = false;
            notes.push(`Unexpected status: ${res.status}`);
        }
        if (!checkStandardsGovernance(res, notes)) passed = false;

        if (!passed) smokePassed = false;
        results.push({
            scenario: 'GENERATE_STANDARD_VALIDATION_REPORT — veraPDF-backed or honest scaffold',
            fixture: 'no_standard_claim.pdf',
            capability: 'GENERATE_STANDARD_VALIDATION_REPORT',
            status: res.status,
            validation_performed: !!res.validation_performed,
            compliance_claim_allowed: !!res.compliance_claim_allowed,
            evidence: res.evidence || null,
            pass: passed,
            notes: notes.length ? notes : ['GENERATE_STANDARD_VALIDATION_REPORT runs veraPDF when available, otherwise returns honest SKIPPED_UNSUPPORTED.']
        });
    }

    // --- Scenario 9: CONVERT_TO_PDFX_VALIDATED — scaffolded, always skips ---
    {
        const res = await runFix(engine, 'CONVERT_TO_PDFX_VALIDATED', 'pdfx_claimed.pdf');
        const notes = [];
        let passed = true;

        const allowedStatuses = ['SKIPPED_UNSUPPORTED', 'SKIPPED', 'FAILED'];
        if (!allowedStatuses.includes(res.status)) {
            passed = false;
            notes.push(`Expected scaffolded skip, got ${res.status}`);
        }
        if (!checkStandardsGovernance(res, notes)) passed = false;

        if (!passed) smokePassed = false;
        results.push({
            scenario: 'CONVERT_TO_PDFX_VALIDATED — scaffolded, always SKIPPED_UNSUPPORTED',
            fixture: 'pdfx_claimed.pdf',
            capability: 'CONVERT_TO_PDFX_VALIDATED',
            status: res.status,
            compliance_claim_allowed: !!res.compliance_claim_allowed,
            pass: passed,
            notes: notes.length ? notes : ['CONVERT_TO_PDFX_VALIDATED correctly returns SKIPPED_UNSUPPORTED (no PDF/X conversion+validation pipeline available).']
        });
    }

    // --- Scenario 10: CONVERT_TO_PDFA_VALIDATED — scaffolded, always skips ---
    {
        const res = await runFix(engine, 'CONVERT_TO_PDFA_VALIDATED', 'pdfa_claimed.pdf');
        const notes = [];
        let passed = true;

        const allowedStatuses = ['SKIPPED_UNSUPPORTED', 'SKIPPED', 'FAILED'];
        if (!allowedStatuses.includes(res.status)) {
            passed = false;
            notes.push(`Expected scaffolded skip, got ${res.status}`);
        }
        if (!checkStandardsGovernance(res, notes)) passed = false;

        if (!passed) smokePassed = false;
        results.push({
            scenario: 'CONVERT_TO_PDFA_VALIDATED — scaffolded, always SKIPPED_UNSUPPORTED',
            fixture: 'pdfa_claimed.pdf',
            capability: 'CONVERT_TO_PDFA_VALIDATED',
            status: res.status,
            compliance_claim_allowed: !!res.compliance_claim_allowed,
            pass: passed,
            notes: notes.length ? notes : ['CONVERT_TO_PDFA_VALIDATED correctly returns SKIPPED_UNSUPPORTED (no validated conversion pipeline yet).']
        });
    }

    // --- Scenario 11: clean_control — VALIDATE_PDFA on clean PDF ---
    {
        const res = await runFix(engine, 'VALIDATE_PDFA', 'clean_control.pdf');
        const notes = [];
        let passed = true;

        const allowedStatuses = ['SKIPPED_UNSUPPORTED', 'SKIPPED', 'FAILED', 'APPLIED'];
        if (!allowedStatuses.includes(res.status)) {
            passed = false;
            notes.push(`Unexpected status: ${res.status}`);
        }
        if (!checkStandardsGovernance(res, notes)) passed = false;

        if (!passed) smokePassed = false;
        results.push({
            scenario: 'VALIDATE_PDFA on clean_control.pdf — honest result regardless of compliance',
            fixture: 'clean_control.pdf',
            capability: 'VALIDATE_PDFA',
            status: res.status,
            validation_performed: !!res.validation_performed,
            validation_passed: !!res.validation_passed,
            compliance_claim_allowed: !!res.compliance_claim_allowed,
            pass: passed,
            notes: notes.length ? notes : ['Clean PDF results in honest validation result with no overclaims.']
        });
    }

    // --- Scenario 12: Standards overclaim regression (aggregate) ---
    {
        const notes = [];
        let passed = true;
        for (const r of results) {
            if (r.standard_certified || r.production_certified) {
                passed = false;
                notes.push(`"${r.scenario}" leaked standard_certified=true or production_certified=true`);
            }
            if (r.production_safe) {
                passed = false;
                notes.push(`"${r.scenario}" leaked production_safe=true`);
            }
        }
        if (!passed) smokePassed = false;
        results.push({
            scenario: 'Standards certification overclaim regression (aggregate)',
            fixture: null,
            capability: null,
            status: passed ? 'VERIFIED' : 'VIOLATION',
            pass: passed,
            notes: notes.length ? notes : ['No Phase 68A fix produced standard_certified, production_certified, or production_safe claims.']
        });
    }

    // --- Scenario 13: compliance_claim_allowed only when evidence complete ---
    {
        const notes = [];
        let passed = true;
        const executionResults = results.filter(r => PHASE68A_CAPABILITIES.includes(r.capability));
        for (const r of executionResults) {
            if (r.compliance_claim_allowed === true) {
                // Must have all required evidence fields
                if (!r.validation_performed || !r.validation_passed ||
                    !r.validator_name || !r.validator_version ||
                    !r.standard_detected || !r.validation_report_hash) {
                    passed = false;
                    notes.push(`"${r.scenario}": compliance_claim_allowed=true but evidence incomplete`);
                }
            }
        }
        if (!passed) smokePassed = false;
        results.push({
            scenario: 'compliance_claim_allowed only when evidence complete (aggregate)',
            fixture: null,
            capability: null,
            status: passed ? 'VERIFIED' : 'VIOLATION',
            pass: passed,
            notes: notes.length ? notes : ['compliance_claim_allowed=true is only set when all required evidence fields are present.']
        });
    }

    // Final summary
    const verapdfAvailable = await veraPdf.isAvailable();
    const verapdfVersion = await veraPdf.getVersion();

    const reportJson = {
        generated_at: new Date().toISOString(),
        phase: '68A',
        repo: 'ppos-preflight-engine',
        category: 'standards_certification',
        smoke_passed: smokePassed,
        verapdf_detected: verapdfAvailable,
        verapdf_version: verapdfVersion || null,
        core_principle: 'No compliance claim is allowed without complete validator evidence (validation_performed, validation_passed, validator_name, validator_version, standard_detected, validation_report_hash, compliance_claim_allowed=true). Without complete evidence, compliance_claim_allowed remains false. Engine never sets standard_certified=true or production_certified=true. All standards fixes are review_required=true.',
        target_capabilities: PHASE68A_CAPABILITIES,
        required_evidence_fields: [
            'validation_performed',
            'validation_passed',
            'validator_name',
            'validator_version',
            'standard_detected',
            'validation_report_hash',
            'compliance_claim_allowed'
        ],
        finding_codes_added: [
            'IND_COMPLIANCE_023 (PDFA_MISSING)',
            'IND_COMPLIANCE_024 (PDFA_INVALID)',
            'IND_COMPLIANCE_025 (PDFA_CLAIMED_BUT_NOT_VALIDATED)',
            'IND_COMPLIANCE_026 (STANDARD_VALIDATION_PASSED)',
            'IND_COMPLIANCE_027 (VALIDATOR_EVIDENCE_COMPLETE)',
            'IND_COMPLIANCE_028 (VALIDATOR_EVIDENCE_INCOMPLETE)'
        ],
        forbidden_overclaims_checked: [
            'compliance_claim_allowed=true without complete evidence',
            'standard_certified=true',
            'pdfx_compliance_claimed=true without PDF/X validator',
            'pdfa_compliance_claimed=true without veraPDF evidence',
            'production_certified=true',
            'production_safe=true'
        ],
        results
    };

    await fs.writeJson(
        path.join(REPORTS_DIR, 'phase68a_engine_real_standards_validation.json'),
        reportJson,
        { spaces: 2 }
    );

    const passCount = results.filter(r => r.pass).length;
    const failCount = results.filter(r => r.pass === false).length;

    const md = [
        '# Phase 68A — Engine Real PDF/X / PDF/A Validator Integration',
        '',
        `**Smoke Test Passed:** ${smokePassed ? '✅ YES' : '❌ NO'}`,
        `**Scenarios:** ${results.length} | **Passed:** ${passCount} | **Failed:** ${failCount}`,
        '',
        '## veraPDF Status',
        `- **Available:** ${verapdfAvailable ? 'Yes' : 'No (graceful degradation active)'}`,
        `- **Version:** ${verapdfVersion || 'N/A'}`,
        '',
        '## Core Principle',
        'No compliance claim is allowed without complete validator evidence. Without all required fields (`validation_performed`, `validation_passed`, `validator_name`, `validator_version`, `standard_detected`, `validation_report_hash`), `compliance_claim_allowed` remains `false`. The engine never sets `standard_certified=true` or `production_certified=true`.',
        '',
        '## Target Capabilities',
        PHASE68A_CAPABILITIES.map(f => `- \`${f}\``).join('\n'),
        '',
        '## Phase 68A Finding Codes',
        '| Code | Meaning |',
        '| --- | --- |',
        '| IND_COMPLIANCE_023 | PDF/A Missing |',
        '| IND_COMPLIANCE_024 | PDF/A Invalid |',
        '| IND_COMPLIANCE_025 | PDF/A Claimed But Not Validated |',
        '| IND_COMPLIANCE_026 | Standard Validation Passed |',
        '| IND_COMPLIANCE_027 | Validator Evidence Complete |',
        '| IND_COMPLIANCE_028 | Validator Evidence Incomplete |',
        '',
        '## Scenario Matrix',
        '| Scenario | Capability | Status | Passed | Notes |',
        '| --- | --- | --- | --- | --- |'
    ];

    results.forEach(r => {
        const noteStr = (r.notes || []).slice(0, 2).join('; ') || '—';
        md.push(`| ${r.scenario} | ${r.capability || '—'} | ${r.status || '—'} | ${r.pass !== false ? '✅' : '❌'} | ${noteStr} |`);
    });

    md.push('');
    md.push('## Governance Summary');
    md.push('Verified across all scenarios that:');
    md.push('- All Phase 68A `standards_certification` capabilities are registered with `production_safe=false`, `requires_human_review=true`, `compliance_claim_allowed=false` (registry default), `validator_required=true`.');
    md.push('- `VALIDATE_PDFA` integrates veraPDF when available, returning structured evidence. Falls back to `SKIPPED_UNSUPPORTED` with honest evidence when veraPDF is not installed.');
    md.push('- `VALIDATE_PDFX` returns `SKIPPED_UNSUPPORTED` because veraPDF validates PDF/A only; a dedicated PDF/X validator is deferred.');
    md.push('- `GENERATE_STANDARD_VALIDATION_REPORT` runs veraPDF when available; otherwise returns honest scaffold.');
    md.push('- `CONVERT_TO_PDFX_VALIDATED` and `CONVERT_TO_PDFA_VALIDATED` are scaffolded and return `SKIPPED_UNSUPPORTED`.');
    md.push('- `compliance_claim_allowed=true` is only emitted when all required evidence fields are present: `validation_performed`, `validation_passed`, `validator_name`, `validator_version`, `standard_detected`, `validation_report_hash`.');
    md.push('- FixPlanner blocks all standards_certification fixes from auto-execution in every policy mode.');
    md.push('- No fix claims `standard_certified`, `production_certified`, or `production_safe`.');
    md.push('- Phase 68A finding codes IND_COMPLIANCE_023–028 registered correctly.');

    await fs.writeFile(
        path.join(REPORTS_DIR, 'phase68a_engine_real_standards_validation.md'),
        md.join('\n')
    );

    console.log(`\nSmoke test ${smokePassed ? 'PASSED ✅' : 'FAILED ❌'}. Reports written to:`);
    console.log('  reports/phase68a_engine_real_standards_validation.json');
    console.log('  reports/phase68a_engine_real_standards_validation.md');

    if (!smokePassed) {
        process.exit(1);
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
