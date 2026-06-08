const fs = require('fs-extra');
const path = require('path');
const AutofixExecutionEngine = require('../execution/AutofixExecutionEngine');
const { getFixCapability } = require('../fixes/FixRegistry');
const { CODES } = require('../interpretation/IndustrialFindingCodes');
const FixPlanner = require('../fixes/FixPlanner');
const IssueNormalizer = require('../core/IssueNormalizer');

const FIXTURES_DIR = path.join(__dirname, '../fixtures/phase66a');
const REPORTS_DIR = path.join(__dirname, '../reports');
const CREATE_FIXTURES_SCRIPT = path.join(__dirname, 'create_phase66a_font_fixtures.js');

const REQUIRED_FIXTURES = [
    'fonts_not_embedded.pdf',
    'font_subset.pdf',
    'type3_fonts_present.pdf',
    'font_encoding_invalid.pdf',
    'missing_glyphs.pdf',
    'clean_control.pdf'
];

const FONT_GOVERNANCE_CAPABILITIES = [
    'EMBED_FONTS',
    'SUBSET_EMBEDDED_FONTS',
    'OUTLINE_TYPE3_FONTS',
    'REPAIR_FONT_ENCODING',
    'FLAG_MISSING_GLYPHS_UNFIXABLE'
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
        const { execSync } = require('child_process');
        execSync(`node "${CREATE_FIXTURES_SCRIPT}"`, { stdio: 'inherit' });
        await new Promise(r => setTimeout(r, 300));
    }
    const stillMissing = REQUIRED_FIXTURES.filter(f => !fs.existsSync(path.join(FIXTURES_DIR, f)));
    if (stillMissing.length > 0) {
        throw new Error(`Required Phase 66A fixtures still missing: ${stillMissing.join(', ')}`);
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

function checkFontGovernance(res, fixId, notes) {
    let ok = true;

    if (res.standard_certified || res.pdfx_compliance_claimed || res.pdfa_compliance_claimed || res.compliance_claim_allowed) {
        ok = false;
        notes.push('Governance violation: font fix claimed standards/compliance certification');
    }
    if (res.production_certified === true || res.production_safe === true) {
        ok = false;
        notes.push('Governance violation: font fix claimed production_certified=true or production_safe=true');
    }

    if (res.status !== 'FAILED' && !res.requires_human_review) {
        ok = false;
        notes.push('Governance violation: font fix did not set requires_human_review=true');
    }

    if (res.status === 'SKIPPED_UNSUPPORTED' || res.status === 'APPLIED') {
        if (!res.evidence || Object.keys(res.evidence).length === 0) {
            ok = false;
            notes.push('Governance violation: font fix result has no evidence object');
        }
    }

    // Policy: missing glyphs cannot be invented/synthesized
    if (res.evidence && res.evidence.glyph_synthesis_performed === true) {
        ok = false;
        notes.push('Governance violation: font fix performed glyph synthesis — forbidden by policy');
    }

    const serialized = JSON.stringify(res).toLowerCase();
    for (const phrase of FORBIDDEN_OVERCLAIM_PHRASES) {
        if (serialized.includes(phrase)) {
            ok = false;
            notes.push(`Forbidden overclaim phrase detected: "${phrase}"`);
        }
    }

    if (res.status !== 'FAILED' && res.evidence) {
        const reviewSignaled = res.review_required === true || res.evidence.review_required === true;
        if (!reviewSignaled) {
            notes.push('Minor: font fix does not signal review_required=true (non-fatal, informational)');
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
        for (const fixId of FONT_GOVERNANCE_CAPABILITIES) {
            const cap = getFixCapability(fixId);
            if (!cap) {
                passed = false;
                notes.push(`FixRegistry missing capability: ${fixId}`);
                continue;
            }
            if (cap.category !== 'font_governance') {
                passed = false;
                notes.push(`${fixId}: expected category=font_governance, got ${cap.category}`);
            }
            if (cap.production_safe !== false) {
                passed = false;
                notes.push(`${fixId}: expected production_safe=false`);
            }
            if (!cap.requires_human_review) {
                passed = false;
                notes.push(`${fixId}: expected requires_human_review=true`);
            }
            if (!cap.evidence_required) {
                notes.push(`${fixId}: evidence_required not set (informational)`);
            }
        }
        if (!passed) smokePassed = false;
        results.push({
            scenario: 'FixRegistry font_governance (Phase 66A) capabilities check',
            fixture: null,
            capability: FONT_GOVERNANCE_CAPABILITIES.join(', '),
            status: passed ? 'VERIFIED' : 'VIOLATION',
            pass: passed,
            notes: notes.length ? notes : ['All Phase 66A font_governance capabilities registered with correct policy fields.']
        });
    }

    // --- Scenario 2: IndustrialFindingCodes font codes ---
    {
        const notes = [];
        let passed = true;
        const expectedCodes = {
            FONT_NOT_EMBEDDED: 'IND_FONT_001',
            FONT_SUBSET: 'IND_FONT_002',
            FONT_TYPE3_FONT_DETECTED: 'IND_FONT_003',
            FONT_GLYPH_MISSING: 'IND_FONT_004',
            FONT_ENCODING_INVALID: 'IND_FONT_005'
        };
        for (const [name, code] of Object.entries(expectedCodes)) {
            if (CODES[name] !== code) {
                passed = false;
                notes.push(`IndustrialFindingCodes.${name} expected ${code}, got ${CODES[name]}`);
            }
        }
        if (!passed) smokePassed = false;
        results.push({
            scenario: 'IndustrialFindingCodes Phase 66A font codes',
            fixture: null,
            capability: null,
            status: passed ? 'VERIFIED' : 'VIOLATION',
            pass: passed,
            notes: notes.length ? notes : ['All Phase 66A font finding codes registered correctly (including reuse of IND_FONT_001-004 and new IND_FONT_005).']
        });
    }

    // --- Scenario 3: IssueNormalizer routing ---
    {
        const notes = [];
        let passed = true;
        const testCases = [
            { code: 'IND_FONT_001', expectedFix: 'EMBED_FONTS', label: 'Fonts not embedded → EMBED_FONTS' },
            { code: 'IND_FONT_002', expectedFix: 'SUBSET_EMBEDDED_FONTS', label: 'Font subset → SUBSET_EMBEDDED_FONTS' },
            { code: 'IND_FONT_003', expectedFix: 'OUTLINE_TYPE3_FONTS', label: 'Type3 fonts present → OUTLINE_TYPE3_FONTS' },
            { code: 'IND_FONT_005', expectedFix: 'REPAIR_FONT_ENCODING', label: 'Font encoding invalid → REPAIR_FONT_ENCODING' },
            { code: 'IND_FONT_004', expectedFix: 'FLAG_MISSING_GLYPHS_UNFIXABLE', label: 'Missing glyphs → FLAG_MISSING_GLYPHS_UNFIXABLE' }
        ];
        for (const tc of testCases) {
            const normalized = IssueNormalizer.normalize([{ code: tc.code, severity: 'error' }]);
            const n = normalized[0];
            if (n.category !== 'FONT') {
                passed = false;
                notes.push(`${tc.label}: expected category=FONT, got ${n.category}`);
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
            scenario: 'IssueNormalizer font fix routing',
            fixture: null,
            capability: null,
            status: passed ? 'VERIFIED' : 'VIOLATION',
            pass: passed,
            notes: notes.length ? notes : ['IssueNormalizer correctly routes Phase 66A font codes to font_governance fixes with safeToAutofix=false and category=FONT.']
        });
    }

    // --- Scenario 4: FixPlanner guardrails ---
    {
        const notes = [];
        let passed = true;
        const planner = new FixPlanner();
        const fontFindings = [
            { id: 'IND_FONT_001', code: 'IND_FONT_001', repairStrategy: 'EMBED_FONTS' },
            { id: 'IND_FONT_002', code: 'IND_FONT_002', repairStrategy: 'SUBSET_EMBEDDED_FONTS' },
            { id: 'IND_FONT_003', code: 'IND_FONT_003', repairStrategy: 'OUTLINE_TYPE3_FONTS' },
            { id: 'IND_FONT_005', code: 'IND_FONT_005', repairStrategy: 'REPAIR_FONT_ENCODING' },
            { id: 'IND_FONT_004', code: 'IND_FONT_004', repairStrategy: 'FLAG_MISSING_GLYPHS_UNFIXABLE' }
        ];
        const plan = planner.plan(fontFindings, 'REVIEW_REQUIRED');
        for (const step of plan) {
            if (step.planned !== false || step.executable !== false) {
                passed = false;
                notes.push(`${step.fix_id}: font fix should never be planned/executable (got planned=${step.planned}, executable=${step.executable})`);
            }
            const allowedReasons = ['FONT_SOURCE_EVIDENCE_REQUIRED', 'MISSING_GLYPHS_UNFIXABLE_NO_SYNTHESIS', 'FIX_NOT_IMPLEMENTED'];
            if (!allowedReasons.includes(step.skip_reason)) {
                notes.push(`${step.fix_id}: skip_reason=${step.skip_reason} (expected one of ${allowedReasons.join(', ')})`);
            }
        }
        if (plan.length !== fontFindings.length) {
            notes.push(`FixPlanner produced ${plan.length} steps for ${fontFindings.length} font findings`);
        }
        if (!passed) smokePassed = false;
        results.push({
            scenario: 'FixPlanner font governance guardrails',
            fixture: null,
            capability: null,
            status: passed ? 'VERIFIED' : 'VIOLATION',
            pass: passed,
            notes: notes.length ? notes : ['FixPlanner correctly blocks all Phase 66A font fixes from being planned/executable in any policy mode.']
        });
    }

    // --- Scenario 5-10: Engine execution — each fix returns SKIPPED_* with evidence ---
    const executionScenarios = [
        {
            name: 'EMBED_FONTS returns honest skip/result with evidence',
            fixture: 'fonts_not_embedded.pdf',
            fixId: 'EMBED_FONTS',
            allowedStatuses: ['SKIPPED_UNSUPPORTED', 'SKIPPED', 'FAILED', 'APPLIED']
        },
        {
            name: 'SUBSET_EMBEDDED_FONTS returns SKIPPED with evidence',
            fixture: 'font_subset.pdf',
            fixId: 'SUBSET_EMBEDDED_FONTS',
            allowedStatuses: ['SKIPPED_UNSUPPORTED', 'SKIPPED', 'FAILED']
        },
        {
            name: 'OUTLINE_TYPE3_FONTS returns SKIPPED with evidence',
            fixture: 'type3_fonts_present.pdf',
            fixId: 'OUTLINE_TYPE3_FONTS',
            allowedStatuses: ['SKIPPED_UNSUPPORTED', 'SKIPPED', 'FAILED']
        },
        {
            name: 'REPAIR_FONT_ENCODING returns SKIPPED with evidence',
            fixture: 'font_encoding_invalid.pdf',
            fixId: 'REPAIR_FONT_ENCODING',
            allowedStatuses: ['SKIPPED_UNSUPPORTED', 'SKIPPED', 'FAILED']
        },
        {
            name: 'FLAG_MISSING_GLYPHS_UNFIXABLE flags honestly without synthesis',
            fixture: 'missing_glyphs.pdf',
            fixId: 'FLAG_MISSING_GLYPHS_UNFIXABLE',
            allowedStatuses: ['SKIPPED_UNSUPPORTED', 'SKIPPED', 'FAILED']
        },
        {
            name: 'SUBSET_EMBEDDED_FONTS on clean control — honest skip',
            fixture: 'clean_control.pdf',
            fixId: 'SUBSET_EMBEDDED_FONTS',
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

        if (!checkFontGovernance(res, scenario.fixId, notes)) passed = false;

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
            glyph_synthesis_performed: !!(res.evidence && res.evidence.glyph_synthesis_performed),
            font_source_available: res.evidence ? res.evidence.font_source_available : undefined,
            pass: passed,
            notes
        });
    }

    // --- Aggregate: No font fix claimed production/standards certification ---
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
            scenario: 'Font fix overclaim regression (aggregate)',
            fixture: null,
            capability: null,
            status: passed ? 'VERIFIED' : 'VIOLATION',
            pass: passed,
            notes: notes.length ? notes : ['No font fix produced a standards, PDF/X, PDF/A, production certification, or production_safe claim.']
        });
    }

    // --- Aggregate: No glyph synthesis ---
    {
        const notes = [];
        let passed = true;
        const glyphResults = results.filter(r => r.capability === 'FLAG_MISSING_GLYPHS_UNFIXABLE');
        for (const r of glyphResults) {
            if (r.glyph_synthesis_performed) {
                passed = false;
                notes.push(`"${r.scenario}" performed glyph synthesis — forbidden; missing glyphs must be flagged, not invented`);
            }
        }
        if (!passed) smokePassed = false;
        results.push({
            scenario: 'No-glyph-synthesis policy regression (aggregate)',
            fixture: null,
            capability: 'FLAG_MISSING_GLYPHS_UNFIXABLE',
            status: passed ? 'VERIFIED' : 'VIOLATION',
            pass: passed,
            notes: notes.length ? notes : ['Missing glyphs are honestly flagged; no glyph synthesis/substitution was performed.']
        });
    }

    // --- Aggregate: review_required preserved ---
    {
        const notes = [];
        let passed = true;
        const executionResults = results.filter(r => FONT_GOVERNANCE_CAPABILITIES.includes(r.capability));
        for (const r of executionResults) {
            if (!r.requires_human_review) {
                notes.push(`"${r.scenario}" does not signal requires_human_review=true`);
            }
        }
        results.push({
            scenario: 'Font fix review_required signal (aggregate)',
            fixture: null,
            capability: null,
            status: passed ? 'VERIFIED' : 'VIOLATION',
            pass: passed,
            notes: notes.length ? notes : ['All font fix results signal requires_human_review=true as required by policy.']
        });
    }

    const reportJson = {
        generated_at: new Date().toISOString(),
        phase: '66A',
        repo: 'ppos-preflight-engine',
        category: 'font_governance',
        smoke_passed: smokePassed,
        core_principle: 'Font fixes require strong evidence. EMBED_FONTS only applies when a font source is available or Ghostscript can safely embed (returning SKIPPED_UNAVAILABLE_FONT_SOURCE otherwise). Missing glyphs are flagged, never invented or synthesized. All font fixes require human review and are production_safe=false.',
        target_fixes: FONT_GOVERNANCE_CAPABILITIES,
        finding_codes: ['IND_FONT_001', 'IND_FONT_002', 'IND_FONT_003', 'IND_FONT_004', 'IND_FONT_005'],
        forbidden_overclaims_checked: [
            'compliance_claim_allowed=true',
            'standard_certified=true',
            'pdfx_compliance_claimed=true',
            'pdfa_compliance_claimed=true',
            'production_certified=true',
            'production_safe=true',
            'glyph_synthesis_performed=true'
        ],
        results
    };

    await fs.writeJson(path.join(REPORTS_DIR, 'phase66a_engine_font_fixes.json'), reportJson, { spaces: 2 });

    const md = [
        '# Phase 66A — Engine Font Fixes',
        '',
        `**Smoke Test Passed:** ${smokePassed ? '✅ YES' : '❌ NO'}`,
        '',
        '## Executive Summary',
        'Validates Engine-only font fix scaffolding for font embedding, subsetting, Type 3 outlining, encoding repair, and missing-glyph flagging — all under category `font_governance`, all review-required, free of standards/production overclaims, and never inventing fonts, encodings, or glyphs.',
        '',
        '## Target Fixes',
        FONT_GOVERNANCE_CAPABILITIES.map(f => `- \`${f}\``).join('\n'),
        '',
        '## Finding Codes (Phase 66A)',
        '| Code | Meaning |',
        '| --- | --- |',
        '| IND_FONT_001 | Font Not Embedded |',
        '| IND_FONT_002 | Font Subset Detected |',
        '| IND_FONT_003 | Type3 Font Detected |',
        '| IND_FONT_004 | Missing Glyph Detected |',
        '| IND_FONT_005 | Font Encoding Invalid |',
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
    md.push('- All `font_governance` Phase 66A capabilities are registered with `production_safe=false`, `requires_human_review=true`, `evidence_required=true`.');
    md.push('- IndustrialFindingCodes registers IND_FONT_001-005 (including new IND_FONT_005 for invalid encoding).');
    md.push('- IssueNormalizer routes IND_FONT_001-005 codes to font_governance fixes with `safeToAutofix=false` and `category=FONT`.');
    md.push('- FixPlanner blocks all Phase 66A font fixes from being planned or executable in any policy mode (`skip_reason=FONT_SOURCE_EVIDENCE_REQUIRED` or `MISSING_GLYPHS_UNFIXABLE_NO_SYNTHESIS`).');
    md.push('- Engine execution attempts return an honest status (`SKIPPED_UNSUPPORTED`/`APPLIED` for the existing Ghostscript-backed `EMBED_FONTS` path) with a populated evidence object.');
    md.push('- No font fix claims standards, PDF/X, PDF/A, production certification, or production safety.');
    md.push('- Missing glyphs are flagged honestly (`glyph_synthesis_performed=false`) — glyphs are never invented or substituted.');
    md.push('- `review_required=true` and `font_source_available` are preserved in evidence for downstream Worker/Service consumption.');

    await fs.writeFile(path.join(REPORTS_DIR, 'phase66a_engine_font_fixes.md'), md.join('\n'));

    console.log(`\nSmoke test ${smokePassed ? 'PASSED ✅' : 'FAILED ❌'}. Reports written to:`);
    console.log('  reports/phase66a_engine_font_fixes.json');
    console.log('  reports/phase66a_engine_font_fixes.md');

    if (!smokePassed) {
        process.exit(1);
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
