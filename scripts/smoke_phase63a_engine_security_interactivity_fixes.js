const fs = require('fs-extra');
const path = require('path');
const AutofixExecutionEngine = require('../execution/AutofixExecutionEngine');
const { PDFDocument } = require('pdf-lib');

const FIXTURES_DIR = path.join(__dirname, '../fixtures/phase63a');
const REPORTS_DIR = path.join(__dirname, '../reports');
const CREATE_FIXTURES_SCRIPT = path.join(__dirname, 'create_phase63a_security_interactivity_fixtures.js');

const REQUIRED_FIXTURES = [
    'javascript_action.pdf',
    'launch_action.pdf',
    'embedded_file.pdf',
    'document_open_action.pdf',
    'page_open_action.pdf',
    'annotations_basic.pdf',
    'acroform_basic.pdf',
    'mixed_interactive_content.pdf',
    'clean_control.pdf'
];

const FORBIDDEN_CUSTOMER_PHRASES = [
    'print-ready',
    'certified pdf',
    'pdf/x validated',
    'pdf/a validated',
    'production certified',
    'standards certified'
];

async function ensureFixtures() {
    const missing = REQUIRED_FIXTURES.filter(f => !fs.existsSync(path.join(FIXTURES_DIR, f)));
    if (missing.length > 0) {
        console.log(`Missing fixtures detected (${missing.join(', ')}). Regenerating from create_phase63a_security_interactivity_fixtures.js ...`);
        delete require.cache[require.resolve(CREATE_FIXTURES_SCRIPT)];
        require(CREATE_FIXTURES_SCRIPT);
        await new Promise(r => setTimeout(r, 500));
    }
    const stillMissing = REQUIRED_FIXTURES.filter(f => !fs.existsSync(path.join(FIXTURES_DIR, f)));
    if (stillMissing.length > 0) {
        throw new Error(`Required Phase 63A fixtures still missing after regeneration attempt: ${stillMissing.join(', ')}`);
    }
}

async function runFix(engine, capability, fixture) {
    const inputPath = path.join(FIXTURES_DIR, fixture);
    const outputPath = path.join(FIXTURES_DIR, `regression_output_${capability.toLowerCase()}_${fixture}`);
    try {
        return await engine.executeFix({
            input_path: inputPath,
            output_path: outputPath,
            fix_hint: capability,
            planned: true
        });
    } catch (e) {
        return { failed: true, error_message: e.message, status: 'FAILED' };
    }
}

function checkGovernance(res, notes) {
    let ok = true;
    if (res.standard_certified || res.pdfx_compliance_claimed || res.pdfa_compliance_claimed || res.compliance_claim_allowed) {
        ok = false;
        notes.push('Governance violation: security/interactivity fix claimed standards/compliance certification');
    }
    if (res.production_certified || res.production_safe) {
        ok = false;
        notes.push('Governance violation: security/interactivity fix claimed production certification/safety');
    }
    if (res.status !== 'NO_CHANGE' && res.status !== 'FAILED' && !res.requires_human_review) {
        ok = false;
        notes.push('Governance violation: security/interactivity fix did not require human review');
    }
    if (res.status === 'APPLIED' && !res.evidence) {
        ok = false;
        notes.push('Governance violation: APPLIED fix is missing an evidence object');
    }
    const serialized = JSON.stringify(res).toLowerCase();
    for (const phrase of FORBIDDEN_CUSTOMER_PHRASES) {
        if (serialized.includes(phrase)) {
            ok = false;
            notes.push(`Forbidden customer-facing overclaim phrase detected in result payload: "${phrase}"`);
        }
    }
    if (serialized.includes('certified.pdf') && !serialized.includes('"certified_pdf":null')) {
        notes.push('Result payload references certified.pdf — verify it is not treated as trusted by filename (informational)');
    }
    return ok;
}

async function checkOutputValidity(res, notes) {
    if (res.status !== 'APPLIED') return true;
    if (!res.output_path || !fs.existsSync(res.output_path)) {
        notes.push('Output PDF missing despite APPLIED status');
        return false;
    }
    const buf = await fs.readFile(res.output_path);
    if (buf.slice(0, 4).toString('latin1') !== '%PDF') {
        notes.push('Output PDF does not start with %PDF');
        return false;
    }
    try {
        await PDFDocument.load(buf);
    } catch (e) {
        notes.push(`Output PDF could not be reopened/parsed: ${e.message}`);
        return false;
    }
    return true;
}

async function main() {
    await fs.ensureDir(REPORTS_DIR);
    await ensureFixtures();

    const engine = new AutofixExecutionEngine();
    const results = [];
    let smokePassed = true;

    const scenarios = [
        {
            name: 'STRIP_JAVASCRIPT removes or skips honestly',
            fixture: 'javascript_action.pdf',
            capability: 'STRIP_JAVASCRIPT',
            allowedStatuses: ['APPLIED', 'SKIPPED', 'SKIPPED_UNSUPPORTED']
        },
        {
            name: 'REMOVE_LAUNCH_ACTIONS removes or skips honestly',
            fixture: 'launch_action.pdf',
            capability: 'REMOVE_LAUNCH_ACTIONS',
            allowedStatuses: ['APPLIED', 'SKIPPED', 'SKIPPED_UNSUPPORTED']
        },
        {
            name: 'REMOVE_EMBEDDED_FILES removes or skips honestly',
            fixture: 'embedded_file.pdf',
            capability: 'REMOVE_EMBEDDED_FILES',
            allowedStatuses: ['APPLIED', 'SKIPPED', 'SKIPPED_UNSUPPORTED']
        },
        {
            name: 'REMOVE_DOCUMENT_OPEN_ACTIONS removes or skips honestly',
            fixture: 'document_open_action.pdf',
            capability: 'REMOVE_DOCUMENT_OPEN_ACTIONS',
            allowedStatuses: ['APPLIED', 'SKIPPED', 'SKIPPED_UNSUPPORTED']
        },
        {
            name: 'REMOVE_PAGE_OPEN_ACTIONS removes or skips honestly',
            fixture: 'page_open_action.pdf',
            capability: 'REMOVE_PAGE_OPEN_ACTIONS',
            allowedStatuses: ['APPLIED', 'SKIPPED', 'SKIPPED_UNSUPPORTED']
        },
        {
            name: 'FLATTEN_ANNOTATIONS applies only if safe, otherwise SKIPPED_UNSUPPORTED',
            fixture: 'annotations_basic.pdf',
            capability: 'FLATTEN_ANNOTATIONS',
            allowedStatuses: ['APPLIED', 'SKIPPED_UNSUPPORTED']
        },
        {
            name: 'FLATTEN_FORMS applies only if safe, otherwise SKIPPED_UNSUPPORTED',
            fixture: 'acroform_basic.pdf',
            capability: 'FLATTEN_FORMS',
            allowedStatuses: ['APPLIED', 'SKIPPED_UNSUPPORTED', 'NO_CHANGE']
        },
        {
            name: 'mixed_interactive_content preserves evidence (STRIP_JAVASCRIPT)',
            fixture: 'mixed_interactive_content.pdf',
            capability: 'STRIP_JAVASCRIPT',
            allowedStatuses: ['APPLIED', 'SKIPPED', 'SKIPPED_UNSUPPORTED'],
            requireEvidence: true
        },
        {
            name: 'mixed_interactive_content preserves evidence (FLATTEN_FORMS)',
            fixture: 'mixed_interactive_content.pdf',
            capability: 'FLATTEN_FORMS',
            allowedStatuses: ['APPLIED', 'SKIPPED_UNSUPPORTED', 'NO_CHANGE'],
            requireEvidence: true
        },
        {
            name: 'clean_control returns no action with evidence (STRIP_JAVASCRIPT)',
            fixture: 'clean_control.pdf',
            capability: 'STRIP_JAVASCRIPT',
            allowedStatuses: ['APPLIED', 'NO_CHANGE', 'SKIPPED'],
            requireEvidence: true
        },
        {
            name: 'clean_control returns no action with evidence (FLATTEN_FORMS)',
            fixture: 'clean_control.pdf',
            capability: 'FLATTEN_FORMS',
            allowedStatuses: ['NO_CHANGE', 'SKIPPED', 'SKIPPED_UNSUPPORTED'],
            requireEvidence: false
        }
    ];

    for (const scenario of scenarios) {
        const res = await runFix(engine, scenario.capability, scenario.fixture);
        const notes = [];
        let passed = true;

        if (!scenario.allowedStatuses.includes(res.status)) {
            passed = false;
            notes.push(`Status not in allowed set ${JSON.stringify(scenario.allowedStatuses)}, got ${res.status}`);
        }

        const outputValid = await checkOutputValidity(res, notes);
        if (!outputValid) passed = false;

        if (!checkGovernance(res, notes)) passed = false;

        if (scenario.requireEvidence) {
            const hasEvidence = !!(res.evidence && Object.keys(res.evidence).length > 0);
            if (!hasEvidence) {
                passed = false;
                notes.push('Expected evidence object to be present and non-empty');
            }
        }

        if (res.status !== 'APPLIED' && res.status !== 'FAILED') {
            const hasReason = !!(res.skip_reason || res.error_code || res.error_message ||
                (res.evidence && (res.evidence.reason || res.evidence.warnings)));
            if (!hasReason) {
                notes.push('Non-applied result lacks an explicit honest reason (non-fatal, evidence-only check)');
            }
        }

        if (!passed) smokePassed = false;

        results.push({
            scenario: scenario.name,
            fixture: scenario.fixture,
            capability: scenario.capability,
            status: res.status,
            allowed_statuses: scenario.allowedStatuses,
            output_pdf_valid: outputValid,
            evidence: res.evidence || null,
            standard_certified: !!res.standard_certified,
            pdfx_compliance_claimed: !!res.pdfx_compliance_claimed,
            pdfa_compliance_claimed: !!res.pdfa_compliance_claimed,
            compliance_claim_allowed: !!res.compliance_claim_allowed,
            production_certified: !!res.production_certified,
            production_safe: !!res.production_safe,
            requires_human_review: !!res.requires_human_review,
            security_sensitive: !!res.security_sensitive,
            visually_sensitive: !!res.visually_sensitive,
            pass: passed,
            notes
        });
    }

    // Standards overclaim regression — scan all results for any forbidden claim
    {
        const notes = [];
        let passed = true;
        for (const r of results) {
            if (r.standard_certified || r.pdfx_compliance_claimed || r.pdfa_compliance_claimed || r.compliance_claim_allowed || r.production_certified) {
                passed = false;
                notes.push(`Scenario "${r.scenario}" leaked a standards/production overclaim flag`);
            }
        }
        if (!passed) smokePassed = false;
        results.push({
            scenario: 'Standards overclaim regression (aggregate)',
            fixture: null,
            capability: null,
            status: passed ? 'VERIFIED' : 'VIOLATION',
            pass: passed,
            notes: notes.length ? notes : ['No security/interactivity fix produced a standards, PDF/X, PDF/A, or production certification claim.']
        });
    }

    // certified.pdf filename trust regression
    {
        const notes = [];
        let passed = true;
        for (const r of results) {
            const serialized = JSON.stringify(r).toLowerCase();
            if (serialized.includes('"trust') && serialized.includes('certified.pdf') && serialized.includes('true')) {
                passed = false;
                notes.push(`Scenario "${r.scenario}" appears to trust certified.pdf by filename`);
            }
        }
        if (!passed) smokePassed = false;
        results.push({
            scenario: 'certified.pdf filename trust regression (aggregate)',
            fixture: null,
            capability: null,
            status: passed ? 'VERIFIED' : 'VIOLATION',
            pass: passed,
            notes: notes.length ? notes : ['No result treats certified.pdf as trusted by filename alone; artifact_trust must remain authoritative downstream.']
        });
    }

    // APPLIED output validity regression (aggregate)
    {
        const notes = [];
        let passed = true;
        const appliedScenarios = results.filter(r => r.status === 'APPLIED');
        for (const r of appliedScenarios) {
            if (!r.output_pdf_valid) {
                passed = false;
                notes.push(`Scenario "${r.scenario}" produced an APPLIED result with an invalid/unparseable output PDF`);
            }
        }
        if (!passed) smokePassed = false;
        results.push({
            scenario: 'APPLIED output validity regression (aggregate)',
            fixture: null,
            capability: null,
            status: passed ? 'VERIFIED' : 'VIOLATION',
            pass: passed,
            notes: notes.length ? notes : [`${appliedScenarios.length} APPLIED result(s) verified valid, start with %PDF, and are reparseable.`]
        });
    }

    const reportJson = {
        generated_at: new Date().toISOString(),
        phase: '63A',
        repo: 'ppos-preflight-engine',
        category: 'pdf_security_interactivity',
        smoke_passed: smokePassed,
        core_principle: 'Security/interactivity cleanup must never imply PDF/X compliance, PDF/A compliance, standards certification, production certification, print-ready status, or certified.pdf trust.',
        forbidden_overclaims_checked: [
            'compliance_claim_allowed=true',
            'standard_certified=true',
            'pdfx_compliance_claimed=true',
            'pdfa_compliance_claimed=true',
            'production_certified=true',
            'certified.pdf trusted by filename',
            'customer-facing "Print-ready" / "Certified PDF" / "PDF/X validated" / "PDF/A validated" wording'
        ],
        results
    };

    await fs.writeJson(path.join(REPORTS_DIR, 'phase63a_engine_security_interactivity_fixes.json'), reportJson, { spaces: 2 });

    const md = [
        '# Phase 63A — Engine PDF Security / Interactive Object Safe Fixes',
        '',
        `**Smoke Test Passed:** ${smokePassed ? '✅ YES' : '❌ NO'}`,
        '',
        '## Executive Summary',
        'Validates Engine-only safe fixes for dangerous/interactive PDF objects: STRIP_JAVASCRIPT, REMOVE_LAUNCH_ACTIONS, REMOVE_EMBEDDED_FILES, REMOVE_DOCUMENT_OPEN_ACTIONS, REMOVE_PAGE_OPEN_ACTIONS, FLATTEN_ANNOTATIONS, FLATTEN_FORMS — all under category `pdf_security_interactivity`, all conservative, evidence-backed, and free of standards/production overclaims.',
        '',
        '## Scenario Matrix',
        '| Scenario | Capability | Status | Output Valid | Passed | Notes |',
        '| --- | --- | --- | --- | --- | --- |'
    ];

    results.forEach(r => {
        md.push(`| ${r.scenario} | ${r.capability || '—'} | ${r.status} | ${r.output_pdf_valid === undefined ? '—' : (r.output_pdf_valid ? '✅' : '❌')} | ${r.pass ? '✅' : '❌'} | ${(r.notes || []).join('; ') || '—'} |`);
    });

    md.push('');
    md.push('## Governance Summary');
    md.push('Verified across all scenarios that:');
    md.push('- STRIP_JAVASCRIPT / REMOVE_LAUNCH_ACTIONS / REMOVE_EMBEDDED_FILES / REMOVE_DOCUMENT_OPEN_ACTIONS / REMOVE_PAGE_OPEN_ACTIONS remove or honestly skip dangerous interactive objects.');
    md.push('- FLATTEN_ANNOTATIONS and FLATTEN_FORMS apply only when appearance preservation can be reasoned about safely; otherwise they return SKIPPED_UNSUPPORTED with evidence rather than faking a flatten.');
    md.push('- Mixed interactive content preserves evidence end-to-end.');
    md.push('- Clean control documents return honest no-action results with evidence.');
    md.push('- No security/interactivity fix claims standards, PDF/X, PDF/A, or production certification.');
    md.push('- certified.pdf is never trusted by filename alone.');
    md.push('- Every executed (non-NO_CHANGE/FAILED) fix requires human review and carries an evidence object.');
    md.push('- Applied output PDFs are valid, start with %PDF, and are reparseable.');

    await fs.writeFile(path.join(REPORTS_DIR, 'phase63a_engine_security_interactivity_fixes.md'), md.join('\n'));

    console.log(`Smoke test ${smokePassed ? 'passed' : 'FAILED'}. Reports written to reports/phase63a_engine_security_interactivity_fixes.{json,md}`);

    if (!smokePassed) {
        process.exit(1);
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
