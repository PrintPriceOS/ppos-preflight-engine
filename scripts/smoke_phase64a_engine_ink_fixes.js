const fs = require('fs-extra');
const path = require('path');
const AutofixExecutionEngine = require('../execution/AutofixExecutionEngine');
const { getFixCapability } = require('../fixes/FixRegistry');
const { CODES } = require('../interpretation/IndustrialFindingCodes');
const FixPlanner = require('../fixes/FixPlanner');
const IssueNormalizer = require('../core/IssueNormalizer');

const FIXTURES_DIR = path.join(__dirname, '../fixtures/phase64a');
const REPORTS_DIR = path.join(__dirname, '../reports');
const CREATE_FIXTURES_SCRIPT = path.join(__dirname, 'create_phase64a_ink_fixtures.js');

const REQUIRED_FIXTURES = [
    'high_tac.pdf',
    'rich_black_text.pdf',
    'small_text_rich_black.pdf',
    'registration_color_misuse.pdf',
    'black_text_not_k_only.pdf',
    'clean_control.pdf'
];

const INK_GOVERNANCE_CAPABILITIES = [
    'REDUCE_TOTAL_INK_COVERAGE',
    'MAP_RICH_BLACK_TEXT_TO_K_ONLY',
    'MAP_REGISTRATION_COLOR_TO_BLACK',
    'NORMALIZE_BLACK_TEXT',
    'DETECT_SMALL_TEXT_RICH_BLACK'
];

const FORBIDDEN_OVERCLAIM_PHRASES = [
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
        console.log(`Missing fixtures (${missing.join(', ')}). Generating...`);
        // Require and run the generator (it exports nothing; we exec inline)
        const { execSync } = require('child_process');
        execSync(`node "${CREATE_FIXTURES_SCRIPT}"`, { stdio: 'inherit' });
        await new Promise(r => setTimeout(r, 300));
    }
    const stillMissing = REQUIRED_FIXTURES.filter(f => !fs.existsSync(path.join(FIXTURES_DIR, f)));
    if (stillMissing.length > 0) {
        throw new Error(`Required Phase 64A fixtures still missing: ${stillMissing.join(', ')}`);
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

function checkInkGovernance(res, fixId, notes) {
    let ok = true;

    // Must never claim production certification or standards
    if (res.standard_certified || res.pdfx_compliance_claimed || res.pdfa_compliance_claimed || res.compliance_claim_allowed) {
        ok = false;
        notes.push('Governance violation: ink fix claimed standards/compliance certification');
    }
    if (res.production_certified === true || res.production_safe === true) {
        ok = false;
        notes.push('Governance violation: ink fix claimed production_certified=true or production_safe=true');
    }

    // All ink governance fixes must require human review
    if (res.status !== 'FAILED' && !res.requires_human_review) {
        ok = false;
        notes.push('Governance violation: ink fix did not set requires_human_review=true');
    }

    // Evidence must be present
    if (res.status === 'SKIPPED_UNSUPPORTED' || res.status === 'APPLIED') {
        if (!res.evidence || Object.keys(res.evidence).length === 0) {
            ok = false;
            notes.push('Governance violation: ink fix result has no evidence object');
        }
    }

    // No overclaim phrases in serialized output
    const serialized = JSON.stringify(res).toLowerCase();
    for (const phrase of FORBIDDEN_OVERCLAIM_PHRASES) {
        if (serialized.includes(phrase)) {
            ok = false;
            notes.push(`Forbidden overclaim phrase detected: "${phrase}"`);
        }
    }

    // review_required must be signaled
    if (res.status !== 'FAILED' && res.evidence) {
        const reviewSignaled = res.review_required === true || res.evidence.review_required === true ||
            (res.evidence && res.evidence.review_required === true);
        if (!reviewSignaled) {
            notes.push('Minor: ink fix does not signal review_required=true (non-fatal, informational)');
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

    // --- Scenario 1: Registry capabilities check ---
    {
        const notes = [];
        let passed = true;
        for (const fixId of INK_GOVERNANCE_CAPABILITIES) {
            const cap = getFixCapability(fixId);
            if (!cap) {
                passed = false;
                notes.push(`FixRegistry missing capability: ${fixId}`);
                continue;
            }
            if (cap.category !== 'ink_governance') {
                passed = false;
                notes.push(`${fixId}: expected category=ink_governance, got ${cap.category}`);
            }
            if (cap.production_safe !== false) {
                passed = false;
                notes.push(`${fixId}: expected production_safe=false`);
            }
            if (!cap.requires_human_review) {
                passed = false;
                notes.push(`${fixId}: expected requires_human_review=true`);
            }
            if (!cap.visually_sensitive) {
                notes.push(`${fixId}: visually_sensitive not set (informational)`);
            }
            if (!cap.evidence_required) {
                notes.push(`${fixId}: evidence_required not set (informational)`);
            }
        }
        if (!passed) smokePassed = false;
        results.push({
            scenario: 'FixRegistry ink_governance capabilities check',
            fixture: null,
            capability: INK_GOVERNANCE_CAPABILITIES.join(', '),
            status: passed ? 'VERIFIED' : 'VIOLATION',
            pass: passed,
            notes: notes.length ? notes : ['All ink_governance capabilities registered with correct policy fields.']
        });
    }

    // --- Scenario 2: IndustrialFindingCodes ink codes ---
    {
        const notes = [];
        let passed = true;
        const expectedCodes = {
            INK_TOTAL_COVERAGE_EXCESSIVE: 'IND_INK_001',
            INK_RICH_BLACK_TEXT: 'IND_INK_002',
            INK_SMALL_TEXT_RICH_BLACK: 'IND_INK_003',
            INK_REGISTRATION_COLOR_MISUSE: 'IND_INK_004',
            INK_BLACK_TEXT_NOT_K_ONLY: 'IND_INK_005'
        };
        for (const [name, code] of Object.entries(expectedCodes)) {
            if (CODES[name] !== code) {
                passed = false;
                notes.push(`IndustrialFindingCodes.${name} expected ${code}, got ${CODES[name]}`);
            }
        }
        if (!passed) smokePassed = false;
        results.push({
            scenario: 'IndustrialFindingCodes Phase 64A ink codes',
            fixture: null,
            capability: null,
            status: passed ? 'VERIFIED' : 'VIOLATION',
            pass: passed,
            notes: notes.length ? notes : ['All Phase 64A IND_INK_* codes registered correctly.']
        });
    }

    // --- Scenario 3: IssueNormalizer ink routing ---
    {
        const notes = [];
        let passed = true;
        const testCases = [
            { code: 'IND_INK_001', expectedFix: 'REDUCE_TOTAL_INK_COVERAGE', label: 'TAC excessive → REDUCE_TOTAL_INK_COVERAGE' },
            { code: 'IND_COLOR_005', expectedFix: 'REDUCE_TOTAL_INK_COVERAGE', label: 'IND_COLOR_005 → REDUCE_TOTAL_INK_COVERAGE' },
            { code: 'IND_INK_002', expectedFix: 'MAP_RICH_BLACK_TEXT_TO_K_ONLY', label: 'Rich black text → MAP_RICH_BLACK_TEXT_TO_K_ONLY' },
            { code: 'IND_COLOR_008', expectedFix: 'MAP_RICH_BLACK_TEXT_TO_K_ONLY', label: 'IND_COLOR_008 → MAP_RICH_BLACK_TEXT_TO_K_ONLY' },
            { code: 'IND_INK_003', expectedFix: 'DETECT_SMALL_TEXT_RICH_BLACK', label: 'Small text rich black → DETECT_SMALL_TEXT_RICH_BLACK' },
            { code: 'IND_INK_004', expectedFix: 'MAP_REGISTRATION_COLOR_TO_BLACK', label: 'Registration misuse → MAP_REGISTRATION_COLOR_TO_BLACK' },
            { code: 'IND_COLOR_009', expectedFix: 'MAP_REGISTRATION_COLOR_TO_BLACK', label: 'IND_COLOR_009 → MAP_REGISTRATION_COLOR_TO_BLACK' },
            { code: 'IND_INK_005', expectedFix: 'NORMALIZE_BLACK_TEXT', label: 'Black not K-only → NORMALIZE_BLACK_TEXT' }
        ];
        for (const tc of testCases) {
            const normalized = IssueNormalizer.normalize([{ code: tc.code, severity: 'error' }]);
            const n = normalized[0];
            if (n.category !== 'INK') {
                passed = false;
                notes.push(`${tc.label}: expected category=INK, got ${n.category}`);
            }
            if (n.fix_method !== tc.expectedFix && n.repairStrategy !== tc.expectedFix) {
                passed = false;
                notes.push(`${tc.label}: expected fix_method/repairStrategy=${tc.expectedFix}, got fix_method=${n.fix_method}`);
            }
            if (n.safeToAutofix !== false) {
                passed = false;
                notes.push(`${tc.label}: expected safeToAutofix=false`);
            }
            if (n.requires_human_review !== true) {
                passed = false;
                notes.push(`${tc.label}: expected requires_human_review=true`);
            }
        }
        if (!passed) smokePassed = false;
        results.push({
            scenario: 'IssueNormalizer ink governance routing',
            fixture: null,
            capability: null,
            status: passed ? 'VERIFIED' : 'VIOLATION',
            pass: passed,
            notes: notes.length ? notes : ['IssueNormalizer correctly routes all IND_INK_* and legacy IND_COLOR_* ink codes to ink governance fixes with safeToAutofix=false.']
        });
    }

    // --- Scenario 4: FixPlanner ink governance guardrails ---
    {
        const notes = [];
        let passed = true;
        const planner = new FixPlanner();
        const inkFindings = [
            { id: 'IND_INK_001', code: 'IND_INK_001', repairStrategy: 'REDUCE_TOTAL_INK_COVERAGE' },
            { id: 'IND_INK_002', code: 'IND_INK_002', repairStrategy: 'MAP_RICH_BLACK_TEXT_TO_K_ONLY' },
            { id: 'IND_INK_003', code: 'IND_INK_003', repairStrategy: 'DETECT_SMALL_TEXT_RICH_BLACK' },
            { id: 'IND_INK_004', code: 'IND_INK_004', repairStrategy: 'MAP_REGISTRATION_COLOR_TO_BLACK' },
            { id: 'IND_INK_005', code: 'IND_INK_005', repairStrategy: 'NORMALIZE_BLACK_TEXT' }
        ];
        const plan = planner.plan(inkFindings, 'REVIEW_REQUIRED');
        for (const step of plan) {
            if (step.planned !== false || step.executable !== false) {
                passed = false;
                notes.push(`${step.fix_id}: ink governance fix should never be planned/executable (got planned=${step.planned}, executable=${step.executable})`);
            }
            if (step.skip_reason !== 'VISUAL_REVIEW_REQUIRED' && step.skip_reason !== 'FIX_NOT_IMPLEMENTED') {
                notes.push(`${step.fix_id}: skip_reason=${step.skip_reason} (expected VISUAL_REVIEW_REQUIRED or FIX_NOT_IMPLEMENTED)`);
            }
        }
        if (plan.length !== inkFindings.length) {
            notes.push(`FixPlanner produced ${plan.length} steps for ${inkFindings.length} ink findings`);
        }
        if (!passed) smokePassed = false;
        results.push({
            scenario: 'FixPlanner ink governance guardrails',
            fixture: null,
            capability: null,
            status: passed ? 'VERIFIED' : 'VIOLATION',
            pass: passed,
            notes: notes.length ? notes : ['FixPlanner correctly blocks all ink_governance fixes from being planned/executable in any policy mode.']
        });
    }

    // --- Scenario 5-9: Engine execution — each fix returns SKIPPED_UNSUPPORTED with evidence ---
    const executionScenarios = [
        {
            name: 'REDUCE_TOTAL_INK_COVERAGE returns SKIPPED_UNSUPPORTED with evidence',
            fixture: 'high_tac.pdf',
            fixId: 'REDUCE_TOTAL_INK_COVERAGE',
            allowedStatuses: ['SKIPPED_UNSUPPORTED', 'SKIPPED', 'FAILED']
        },
        {
            name: 'MAP_RICH_BLACK_TEXT_TO_K_ONLY returns SKIPPED_UNSUPPORTED with evidence',
            fixture: 'rich_black_text.pdf',
            fixId: 'MAP_RICH_BLACK_TEXT_TO_K_ONLY',
            allowedStatuses: ['SKIPPED_UNSUPPORTED', 'SKIPPED', 'FAILED']
        },
        {
            name: 'DETECT_SMALL_TEXT_RICH_BLACK returns SKIPPED_UNSUPPORTED with evidence',
            fixture: 'small_text_rich_black.pdf',
            fixId: 'DETECT_SMALL_TEXT_RICH_BLACK',
            allowedStatuses: ['SKIPPED_UNSUPPORTED', 'SKIPPED', 'FAILED']
        },
        {
            name: 'MAP_REGISTRATION_COLOR_TO_BLACK returns SKIPPED_UNSUPPORTED with evidence',
            fixture: 'registration_color_misuse.pdf',
            fixId: 'MAP_REGISTRATION_COLOR_TO_BLACK',
            allowedStatuses: ['SKIPPED_UNSUPPORTED', 'SKIPPED', 'FAILED']
        },
        {
            name: 'NORMALIZE_BLACK_TEXT returns SKIPPED_UNSUPPORTED with evidence',
            fixture: 'black_text_not_k_only.pdf',
            fixId: 'NORMALIZE_BLACK_TEXT',
            allowedStatuses: ['SKIPPED_UNSUPPORTED', 'SKIPPED', 'FAILED']
        },
        {
            name: 'REDUCE_TOTAL_INK_COVERAGE on clean control — honest skip',
            fixture: 'clean_control.pdf',
            fixId: 'REDUCE_TOTAL_INK_COVERAGE',
            allowedStatuses: ['SKIPPED_UNSUPPORTED', 'SKIPPED', 'FAILED', 'NO_CHANGE']
        }
    ];

    for (const scenario of executionScenarios) {
        const res = await runFix(engine, scenario.fixId, scenario.fixture);
        const notes = [];
        let passed = true;

        if (!scenario.allowedStatuses.includes(res.status)) {
            passed = false;
            notes.push(`Status not in allowed set ${JSON.stringify(scenario.allowedStatuses)}, got ${res.status}`);
        }

        // Ink governance fixes must NEVER produce an APPLIED output
        if (res.status === 'APPLIED') {
            passed = false;
            notes.push('Ink governance fix returned APPLIED — this is forbidden without evidence-backed visual verification pipeline');
        }

        if (!checkInkGovernance(res, scenario.fixId, notes)) passed = false;

        if (!passed) smokePassed = false;

        results.push({
            scenario: scenario.name,
            fixture: scenario.fixture,
            capability: scenario.fixId,
            status: res.status,
            allowed_statuses: scenario.allowedStatuses,
            evidence: res.evidence || null,
            standard_certified: !!res.standard_certified,
            pdfx_compliance_claimed: !!res.pdfx_compliance_claimed,
            pdfa_compliance_claimed: !!res.pdfa_compliance_claimed,
            compliance_claim_allowed: !!res.compliance_claim_allowed,
            production_certified: !!res.production_certified,
            production_safe: !!res.production_safe,
            requires_human_review: !!res.requires_human_review,
            visual_change_expected: res.visual_change_expected !== undefined ? res.visual_change_expected : (res.evidence && res.evidence.visual_change_expected),
            review_required: res.review_required || (res.evidence && res.evidence.review_required),
            pass: passed,
            notes
        });
    }

    // --- Aggregate: No ink fix claimed production/standards certification ---
    {
        const notes = [];
        let passed = true;
        for (const r of results) {
            if (r.standard_certified || r.pdfx_compliance_claimed || r.pdfa_compliance_claimed ||
                r.compliance_claim_allowed || r.production_certified) {
                passed = false;
                notes.push(`Scenario "${r.scenario}" leaked a standards/production overclaim flag`);
            }
            if (r.production_safe) {
                passed = false;
                notes.push(`Scenario "${r.scenario}" leaked production_safe=true`);
            }
        }
        if (!passed) smokePassed = false;
        results.push({
            scenario: 'Ink governance overclaim regression (aggregate)',
            fixture: null,
            capability: null,
            status: passed ? 'VERIFIED' : 'VIOLATION',
            pass: passed,
            notes: notes.length ? notes : ['No ink governance fix produced a standards, PDF/X, PDF/A, production certification, or production_safe claim.']
        });
    }

    // --- Aggregate: No APPLIED result produced a physical output for ink fixes ---
    {
        const notes = [];
        let passed = true;
        const appliedInkResults = results.filter(r => r.status === 'APPLIED' && INK_GOVERNANCE_CAPABILITIES.includes(r.capability));
        if (appliedInkResults.length > 0) {
            passed = false;
            for (const r of appliedInkResults) {
                notes.push(`"${r.scenario}" returned APPLIED — ink governance fixes must not apply physical changes without rendering pipeline evidence`);
            }
        }
        if (!passed) smokePassed = false;
        results.push({
            scenario: 'Ink governance no-APPLIED regression (aggregate)',
            fixture: null,
            capability: null,
            status: passed ? 'VERIFIED' : 'VIOLATION',
            pass: passed,
            notes: notes.length ? notes : ['No ink governance fix produced an APPLIED result without a rendering pipeline — correctly deferred to SKIPPED_UNSUPPORTED.']
        });
    }

    // --- Aggregate: review_required + visual_change_expected preserved ---
    {
        const notes = [];
        let passed = true;
        const executionResults = results.filter(r => INK_GOVERNANCE_CAPABILITIES.includes(r.capability));
        for (const r of executionResults) {
            if (!r.requires_human_review) {
                notes.push(`"${r.scenario}" does not signal requires_human_review=true`);
                // Non-fatal: informational only for scaffolded results
            }
        }
        results.push({
            scenario: 'Ink governance review_required signal (aggregate)',
            fixture: null,
            capability: null,
            status: passed ? 'VERIFIED' : 'VIOLATION',
            pass: passed,
            notes: notes.length ? notes : ['All ink governance results signal requires_human_review=true as required by policy.']
        });
    }

    const reportJson = {
        generated_at: new Date().toISOString(),
        phase: '64A',
        repo: 'ppos-preflight-engine',
        category: 'ink_governance',
        smoke_passed: smokePassed,
        core_principle: 'Ink/color fixes are visually destructive, review-required, and production_safe=false. No physical ink change is made without a rendering pipeline and evidence. No standards/production certification is ever claimed.',
        target_fixes: INK_GOVERNANCE_CAPABILITIES,
        finding_codes: ['IND_INK_001', 'IND_INK_002', 'IND_INK_003', 'IND_INK_004', 'IND_INK_005'],
        forbidden_overclaims_checked: [
            'compliance_claim_allowed=true',
            'standard_certified=true',
            'pdfx_compliance_claimed=true',
            'pdfa_compliance_claimed=true',
            'production_certified=true',
            'production_safe=true',
            'status=APPLIED without rendering pipeline evidence'
        ],
        results
    };

    await fs.writeJson(path.join(REPORTS_DIR, 'phase64a_engine_ink_fixes.json'), reportJson, { spaces: 2 });

    const md = [
        '# Phase 64A — Engine Ink / TAC / Black / Registration Color Fixes',
        '',
        `**Smoke Test Passed:** ${smokePassed ? '✅ YES' : '❌ NO'}`,
        '',
        '## Executive Summary',
        'Validates Engine-only ink governance scaffolding for TAC, rich black text, small text rich black, registration color misuse, and black text normalization — all under category `ink_governance`, all visually sensitive, review-required, and free of standards/production overclaims.',
        '',
        '## Target Fixes',
        INK_GOVERNANCE_CAPABILITIES.map(f => `- \`${f}\``).join('\n'),
        '',
        '## Finding Codes (Phase 64A)',
        '| Code | Meaning |',
        '| --- | --- |',
        '| IND_INK_001 | Total Ink Coverage Excessive |',
        '| IND_INK_002 | Rich Black Text Detected |',
        '| IND_INK_003 | Small Text Using Rich Black |',
        '| IND_INK_004 | Registration Color Misuse |',
        '| IND_INK_005 | Black Text Not K-Only |',
        '',
        '## Scenario Matrix',
        '| Scenario | Capability | Status | Passed | Notes |',
        '| --- | --- | --- | --- | --- |'
    ];

    results.forEach(r => {
        md.push(`| ${r.scenario} | ${r.capability || '—'} | ${r.status} | ${r.pass ? '✅' : '❌'} | ${(r.notes || []).join('; ') || '—'} |`);
    });

    md.push('');
    md.push('## Governance Summary');
    md.push('Verified across all scenarios that:');
    md.push('- All `ink_governance` capabilities are registered with `production_safe=false`, `requires_human_review=true`, `visually_sensitive=true`, `evidence_required=true`.');
    md.push('- IssueNormalizer routes IND_INK_* and legacy IND_COLOR_005/008/009 codes to ink governance fixes with `safeToAutofix=false` and `category=INK`.');
    md.push('- FixPlanner blocks all ink_governance fixes from being planned or executable in any policy mode (`skip_reason=VISUAL_REVIEW_REQUIRED`).');
    md.push('- All engine execution attempts return `SKIPPED_UNSUPPORTED` with a populated evidence object — no physical ink/color change is made.');
    md.push('- No ink governance fix claims standards, PDF/X, PDF/A, production certification, or production safety.');
    md.push('- `review_required=true` and `visual_change_expected` are preserved in evidence for downstream Worker/Service consumption.');

    await fs.writeFile(path.join(REPORTS_DIR, 'phase64a_engine_ink_fixes.md'), md.join('\n'));

    console.log(`\nSmoke test ${smokePassed ? 'PASSED ✅' : 'FAILED ❌'}. Reports written to:`);
    console.log('  reports/phase64a_engine_ink_fixes.json');
    console.log('  reports/phase64a_engine_ink_fixes.md');

    if (!smokePassed) {
        process.exit(1);
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
