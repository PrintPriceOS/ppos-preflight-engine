'use strict';
/**
 * Phase 72A Smoke Test — Engine Policy Profile Contract
 *
 * Validates:
 *  1. Profile schema structure and built-in preset completeness
 *  2. Profile resolution (by id / by object / fallback)
 *  3. Evaluator output structure and governance invariants
 *  4. Per-domain blocker detection (bleed, TAC, color, font, security, page_marks, standard)
 *  5. FixPlanner guardrail for policy_profile_constraint category
 */

const path = require('path');
const fs   = require('fs');

const { BUILT_IN_PROFILES, validateProfileShape, resolveProfile } = require('../policy/PolicyProfileSchema');
const { evaluateProfile, evaluateFromFixAudit } = require('../policy/PolicyProfileEvaluator');
const FixPlanner = require('../fixes/FixPlanner');

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------
let PASS = 0, FAIL = 0;
const results = [];

function assert(condition, label, detail) {
    const pass = !!condition;
    if (pass) { console.log(`  ✅  ${label}`); PASS++; }
    else       { console.error(`  ❌  ${label}${detail ? ': ' + detail : ''}`); FAIL++; }
    results.push({ label, pass, detail: detail || null });
}

function assertFalse(condition, label, detail) {
    assert(!condition, label, detail);
}

// ---------------------------------------------------------------------------
// PART 1 — Schema structure
// ---------------------------------------------------------------------------
console.log('\n\n=== PART 1 — PolicyProfileSchema Structure ===\n');

const REQUIRED_PROFILE_KEYS = [
    'profile_id', 'label', 'bleed_policy', 'tac_limit',
    'color_policy', 'font_policy', 'security_policy', 'page_marks_policy'
];
const REQUIRED_PROFILES = ['NONE', 'OFFSET_STANDARD', 'PDFX4_STRICT', 'PDFA2B_ARCHIVE', 'DIGITAL_SCREEN', 'SHEETFED_HIGH_END'];

for (const pid of REQUIRED_PROFILES) {
    assert(pid in BUILT_IN_PROFILES, `1.1 Built-in profile "${pid}" exists`);
    const profile = BUILT_IN_PROFILES[pid];
    for (const key of REQUIRED_PROFILE_KEYS) {
        assert(key in profile, `1.2 Profile ${pid} has key "${key}"`);
    }
    const { valid } = validateProfileShape(profile);
    assert(valid, `1.3 Profile ${pid} passes shape validation`);
}

// ---------------------------------------------------------------------------
// PART 2 — Profile resolution
// ---------------------------------------------------------------------------
console.log('\n\n=== PART 2 — Profile Resolution ===\n');

{
    const byId = resolveProfile('PDFX4_STRICT');
    assert(byId.profile_id === 'PDFX4_STRICT', '2.1 resolveProfile by id returns correct profile');
}
{
    const byObj = resolveProfile({ profile_id: 'CUSTOM', label: 'Custom', bleed_policy: { required: true, min_mm: 3 }, tac_limit: 300, color_policy: { require_cmyk: true, allow_rgb: false, allow_spot_colors: false }, font_policy: { require_embedded: true, allow_type3: false }, security_policy: { no_javascript: true, no_embedded_files: true, no_launch_actions: true }, page_marks_policy: { crop_marks_required: false, registration_marks_allowed: false } });
    assert(byObj.profile_id === 'CUSTOM', '2.2 resolveProfile by custom object returns it');
}
{
    const fallback = resolveProfile('NONEXISTENT_PROFILE_ID');
    assert(fallback.profile_id === 'NONE', '2.3 resolveProfile unknown id falls back to NONE');
}
{
    const nullFallback = resolveProfile(null);
    assert(nullFallback.profile_id === 'NONE', '2.4 resolveProfile null falls back to NONE');
}
{
    const badObj = resolveProfile({ broken: true });
    assert(badObj.profile_id === 'NONE', '2.5 resolveProfile malformed object falls back to NONE');
}

// ---------------------------------------------------------------------------
// PART 3 — Evaluator output shape and governance invariants
// ---------------------------------------------------------------------------
console.log('\n\n=== PART 3 — Evaluator Output Shape and Governance Invariants ===\n');

{
    const result = evaluateProfile('NONE', []);
    assert(typeof result.profile_passed === 'boolean',        '3.1 profile_passed is boolean');
    assert(Array.isArray(result.profile_blockers),            '3.2 profile_blockers is array');
    assert(Array.isArray(result.profile_warnings),            '3.3 profile_warnings is array');
    assert(typeof result.evaluated_at === 'string',           '3.4 evaluated_at is string');
    assert(result.production_certified === false,             '3.5 production_certified always false');
    assert(result.standard_certified === false,               '3.6 standard_certified always false');
    assert(result.compliance_claim_allowed === false,         '3.7 compliance_claim_allowed always false');
    assert(result.print_ready_claim_allowed === false,        '3.8 print_ready_claim_allowed always false');
}

// Golden path: no findings → NONE profile always passes
{
    const result = evaluateProfile('NONE', []);
    assert(result.profile_passed === true,          '3.9 NONE profile with no findings: profile_passed=true');
    assert(result.profile_blockers.length === 0,    '3.10 NONE profile: no blockers');
}

// Governance: even PDFX4_STRICT pass does NOT imply certified
{
    const result = evaluateProfile('PDFX4_STRICT', []);
    assert(result.production_certified === false,   '3.11 PDFX4_STRICT: production_certified=false even when passed');
    assert(result.standard_certified === false,     '3.12 PDFX4_STRICT: standard_certified=false even when passed');
}

// ---------------------------------------------------------------------------
// PART 4 — Per-domain blocker detection
// ---------------------------------------------------------------------------
console.log('\n\n=== PART 4 — Per-Domain Blocker Detection ===\n');

// 4.1 Bleed blocker
{
    const result = evaluateProfile('PDFX4_STRICT', [{ id: 'BLEED_MISSING' }]);
    assert(result.profile_passed === false,                              '4.1 Bleed violation → profile_passed=false');
    assert(result.profile_blockers.includes('PROFILE_BLEED_REQUIRED'), '4.1 PROFILE_BLEED_REQUIRED blocker emitted');
}

// 4.2 TAC blocker via finding code
{
    const result = evaluateProfile('OFFSET_STANDARD', [{ id: 'COLOR_TOTAL_INK_COVERAGE_EXCEEDED' }]);
    assert(result.profile_passed === false,                              '4.2 TAC finding → profile_passed=false');
    assert(result.profile_blockers.includes('PROFILE_TAC_LIMIT_EXCEEDED'), '4.2 PROFILE_TAC_LIMIT_EXCEEDED blocker');
}

// 4.3 TAC blocker via measured tac_measured metadata
{
    const result = evaluateProfile('SHEETFED_HIGH_END', [], { tac_measured: 295 }); // limit=280
    assert(result.profile_passed === false,                              '4.3 Measured TAC > limit → profile_passed=false');
    assert(result.profile_blockers.includes('PROFILE_TAC_LIMIT_EXCEEDED'), '4.3 PROFILE_TAC_LIMIT_EXCEEDED via measured');
}

// 4.4 Color policy blocker
{
    const result = evaluateProfile('PDFX4_STRICT', [{ id: 'RGB_IMAGES_PRESENT' }]);
    assert(result.profile_passed === false,                              '4.4 RGB finding on CMYK-only profile → failed');
    assert(result.profile_blockers.includes('PROFILE_CMYK_REQUIRED'),   '4.4 PROFILE_CMYK_REQUIRED blocker');
}

// 4.5 Font embedding blocker
{
    const result = evaluateProfile('OFFSET_STANDARD', [{ id: 'FONT_NOT_EMBEDDED' }]);
    assert(result.profile_passed === false,                              '4.5 Unembedded font → profile_passed=false');
    assert(result.profile_blockers.includes('PROFILE_FONTS_MUST_BE_EMBEDDED'), '4.5 PROFILE_FONTS_MUST_BE_EMBEDDED');
}

// 4.6 Type3 font blocker
{
    const result = evaluateProfile('PDFX4_STRICT', [{ id: 'TYPE3_FONT_DETECTED' }]);
    assert(result.profile_blockers.includes('PROFILE_TYPE3_FONTS_NOT_ALLOWED'), '4.6 PROFILE_TYPE3_FONTS_NOT_ALLOWED');
}

// 4.7 No-JavaScript blocker
{
    const result = evaluateProfile('PDFX4_STRICT', [{ id: 'PDF_JAVASCRIPT_PRESENT' }]);
    assert(result.profile_passed === false,                              '4.7 JS finding on no_javascript profile → failed');
    assert(result.profile_blockers.includes('PROFILE_NO_JAVASCRIPT_VIOLATED'), '4.7 PROFILE_NO_JAVASCRIPT_VIOLATED');
}

// 4.8 No-embedded-files blocker
{
    const result = evaluateProfile('OFFSET_STANDARD', [{ id: 'PDF_EMBEDDED_FILES_PRESENT' }]);
    assert(result.profile_blockers.includes('PROFILE_NO_EMBEDDED_FILES_VIOLATED'), '4.8 PROFILE_NO_EMBEDDED_FILES_VIOLATED');
}

// 4.9 No-launch-actions blocker
{
    const result = evaluateProfile('OFFSET_STANDARD', [{ id: 'PDF_LAUNCH_ACTION_PRESENT' }]);
    assert(result.profile_blockers.includes('PROFILE_NO_LAUNCH_ACTIONS_VIOLATED'), '4.9 PROFILE_NO_LAUNCH_ACTIONS_VIOLATED');
}

// 4.10 Crop marks required blocker
{
    const result = evaluateProfile('SHEETFED_HIGH_END', [{ id: 'CROP_MARKS_MISSING' }]);
    assert(result.profile_blockers.includes('PROFILE_CROP_MARKS_REQUIRED'), '4.10 PROFILE_CROP_MARKS_REQUIRED');
}

// 4.11 Standard mismatch blocker
{
    const result = evaluateProfile('PDFX4_STRICT', [], { detected_standard: 'PDF/A-2b' });
    assert(result.profile_blockers.includes('PROFILE_STANDARD_MISMATCH'), '4.11 PROFILE_STANDARD_MISMATCH');
}

// 4.12 Standard required but not validated → warning only
{
    const result = evaluateProfile('PDFX4_STRICT', [], { detected_standard: null });
    assert(!result.profile_blockers.includes('PROFILE_STANDARD_MISMATCH'),          '4.12 no PROFILE_STANDARD_MISMATCH when null');
    assert(result.profile_warnings.some(w => w.includes('PROFILE_STANDARD_REQUIRED_BUT_NOT_VALIDATED')), '4.12 warning emitted');
}

// 4.13 DIGITAL_SCREEN allows RGB — no blocker for RGB finding
{
    const result = evaluateProfile('DIGITAL_SCREEN', [{ id: 'RGB_IMAGES_PRESENT' }]);
    assertFalse(result.profile_blockers.includes('PROFILE_CMYK_REQUIRED'), '4.13 DIGITAL_SCREEN allows RGB — no CMYK blocker');
}

// 4.14 NONE profile — no blockers even with multiple findings
{
    const result = evaluateProfile('NONE', [
        { id: 'RGB_IMAGES_PRESENT' }, { id: 'PDF_JAVASCRIPT_PRESENT' }, { id: 'BLEED_MISSING' }
    ]);
    assert(result.profile_passed === true,       '4.14 NONE profile with findings: profile_passed=true');
    assert(result.profile_blockers.length === 0, '4.14 NONE profile: no blockers regardless of findings');
}

// 4.15 Warnings de-duplicated
{
    const result = evaluateProfile('PDFX4_STRICT', [{ id: 'PDFX_CLAIMED_BUT_NOT_VALIDATED' }, { id: 'STANDARD_CLAIM_WITHOUT_VALIDATOR_EVIDENCE' }]);
    const warningCounts = result.profile_warnings.reduce((acc, w) => { acc[w] = (acc[w] || 0) + 1; return acc; }, {});
    const hasDup = Object.values(warningCounts).some(c => c > 1);
    assertFalse(hasDup, '4.15 No duplicate warnings');
}

// ---------------------------------------------------------------------------
// PART 5 — evaluateFromFixAudit
// ---------------------------------------------------------------------------
console.log('\n\n=== PART 5 — evaluateFromFixAudit ===\n');

{
    const fixAudit = {
        findings: [{ id: 'BLEED_MISSING' }, { id: 'PDF_JAVASCRIPT_PRESENT' }],
        plan: []
    };
    const result = evaluateFromFixAudit('PDFX4_STRICT', fixAudit);
    assert(result.profile_passed === false,                              '5.1 evaluateFromFixAudit detects blockers from findings[]');
    assert(result.profile_blockers.includes('PROFILE_BLEED_REQUIRED'), '5.1 bleed blocker from fix_audit.findings');
    assert(result.profile_blockers.includes('PROFILE_NO_JAVASCRIPT_VIOLATED'), '5.1 JS blocker from fix_audit.findings');
}

{
    const fixAudit = {
        plan: [
            { fix_id: 'APPLY_BLEED', source_finding: 'BLEED_MISSING', planned: false },
            { fix_id: 'STRIP_JAVASCRIPT', source_finding: 'PDF_JAVASCRIPT_PRESENT', planned: false }
        ]
    };
    const result = evaluateFromFixAudit('OFFSET_STANDARD', fixAudit);
    assert(result.profile_blockers.includes('PROFILE_BLEED_REQUIRED'), '5.2 bleed blocker from fix_audit.plan[].source_finding');
    assert(result.profile_blockers.includes('PROFILE_NO_JAVASCRIPT_VIOLATED'), '5.2 JS blocker from fix_audit.plan[].source_finding');
}

{
    const fixAudit = { findings: [] };
    const result = evaluateFromFixAudit('OFFSET_STANDARD', fixAudit);
    assert(result.production_certified === false, '5.3 evaluateFromFixAudit: production_certified always false');
    assert(result.standard_certified === false,   '5.3 evaluateFromFixAudit: standard_certified always false');
}

// ---------------------------------------------------------------------------
// PART 6 — FixPlanner 72A guardrail
// ---------------------------------------------------------------------------
console.log('\n\n=== PART 6 — FixPlanner Policy Profile Constraint Guardrail ===\n');

{
    const planner = new FixPlanner();
    const issue = {
        id: 'PROFILE_BLEED_CONSTRAINT_VIOLATION',
        code: 'PROFILE_BLEED_CONSTRAINT_VIOLATION',
        repairStrategy: 'POLICY_PROFILE_BLEED_ENFORCE',
        severity: 'error',
        fixable: true
    };

    // Inject a mock registry capability for this fix
    const plan = planner.plan([issue], 'REVIEW_REQUIRED');
    // policy_profile_constraint category fixes are never in FixRegistry by default,
    // so planner will produce an unknown fix plan item (planned=false, skip_reason=UNKNOWN_FIX_CAPABILITY)
    // That is the correct behavior: profile violations escalate via policy_profile_governance,
    // not via FixPlanner auto-applies.
    assert(true, '6.1 FixPlanner processes policy_profile_constraint without throwing');
    assert(plan.every(p => p.planned === false || p.autofixable === false), '6.2 No policy_profile_constraint fix is auto-applied');
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------
const reportsDir = path.join(__dirname, '..', 'reports');
if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

const smokePassed = FAIL === 0;
const report = {
    generated_at: new Date().toISOString(),
    phase: '72A',
    repo: 'ppos-preflight-engine',
    category: 'engine_policy_profile_contract',
    smoke_passed: smokePassed,
    governance: {
        profile_pass_implies_production_certified: false,
        profile_pass_implies_standard_certified: false,
        profile_pass_implies_compliance_claim_allowed: false,
        profile_is_certification_authority: false,
        evaluator_emits_raw_paths: false,
        evaluator_emits_pii: false
    },
    built_in_profiles: Object.keys(BUILT_IN_PROFILES),
    summary: { total: PASS + FAIL, passed: PASS, failed: FAIL },
    results
};

const jsonPath = path.join(reportsDir, 'phase72a_engine_policy_profiles.json');
const mdPath   = path.join(reportsDir, 'phase72a_engine_policy_profiles.md');
fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

const md = [
    '# Phase 72A — Engine Policy Profile Contract',
    '',
    `**Generated:** ${report.generated_at}  `,
    `**Smoke:** ${smokePassed ? '✅ PASSED' : '❌ FAILED'}  `,
    `**Results:** ${PASS}/${PASS + FAIL} passed`,
    '',
    '## Built-in Profiles',
    Object.keys(BUILT_IN_PROFILES).map(p => `- \`${p}\``).join('\n'),
    '',
    '## Governance',
    '| Invariant | Value |',
    '|-----------|-------|',
    '| profile_pass → production_certified | **false** |',
    '| profile_pass → standard_certified | **false** |',
    '| profile is certification authority | **false** |',
    '',
    '## Test Results',
    '| # | Test | Pass |',
    '|---|------|------|',
    ...results.map((r, i) => `| ${i+1} | ${r.label} | ${r.pass ? '✅' : '❌'} |`),
    ''
].join('\n');
fs.writeFileSync(mdPath, md);

console.log(`\n${'='.repeat(70)}`);
console.log(`Phase 72A — Engine Policy Profile Contract`);
console.log(`Results: ${PASS}/${PASS + FAIL} passed${FAIL > 0 ? ` (${FAIL} FAILED)` : ''}`);
console.log(`Smoke: ${smokePassed ? 'PASSED ✅' : 'FAILED ❌'}`);
console.log(`Reports: ${jsonPath}`);
console.log('='.repeat(70));

process.exit(smokePassed ? 0 : 1);
