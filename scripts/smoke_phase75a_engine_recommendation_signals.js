'use strict';
/**
 * Phase 75A Smoke Test — Engine Recommendation Signals
 *
 * Validates:
 *  1. Module output shape and defaults on empty input
 *  2. FIXABLE_AUTO classification (safe, implemented, no human review)
 *  3. FIXABLE_REVIEW_REQUIRED classification (implemented but human review required)
 *  4. NOT_FIXABLE classification (no fix strategy)
 *  5. NOT_IMPLEMENTED classification (scaffolded/unimplemented capability)
 *  6. visual_sensitivity signal (ink/transparency/font governance findings)
 *  7. validator_required signal (standards certification findings)
 *  8. missing_tool signal (toolchain dependency unavailable)
 *  9. Governance invariants
 * 10. ReportBuilder integration
 */

const path = require('path');
const fs   = require('fs');

const {
    generateRecommendationSignals,
    buildFindingSignal
} = require('../interpretation/RecommendationSignals');
const IssueNormalizer = require('../core/IssueNormalizer');
const ReportBuilder = require('../core/ReportBuilder');

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

// ---------------------------------------------------------------------------
// PART 1 — Output shape and defaults
// ---------------------------------------------------------------------------
console.log('\n\n=== PART 1 — Output Shape and Defaults ===\n');

{
    const result = generateRecommendationSignals({}, []);
    assert(typeof result.generated_at === 'string', '1.1 generated_at is string');
    assert(Array.isArray(result.findings), '1.2 findings is array');
    assert(result.findings.length === 0, '1.3 empty input: findings is empty');
    assert(typeof result.summary === 'object', '1.4 summary is object');
    assert(result.summary.total_findings === 0, '1.5 empty input: total_findings=0');
    assert(typeof result.recommendation_signals_governance === 'object', '1.6 governance is object');
}

// ---------------------------------------------------------------------------
// PART 2 — FIXABLE_AUTO classification
// ---------------------------------------------------------------------------
console.log('\n\n=== PART 2 — FIXABLE_AUTO Classification ===\n');

{
    // TRIMBOX_MISSING -> REBUILD_TRIMBOX: implemented, autofixable, no human review
    const [issue] = IssueNormalizer.normalize([{ code: 'IND_GEOM_003' }]);
    const signal = buildFindingSignal(issue, []);
    assert(signal.fixability === 'FIXABLE_AUTO', '2.1 TRIMBOX_MISSING -> fixability=FIXABLE_AUTO', signal.fixability);
    assert(signal.fix_id === 'REBUILD_TRIMBOX', '2.2 fix_id=REBUILD_TRIMBOX', signal.fix_id);
    assert(signal.risk_level === 'LOW', '2.3 risk_level=LOW', signal.risk_level);
    assert(signal.visual_sensitivity === false, '2.4 visual_sensitivity=false');
    assert(signal.missing_tool === null, '2.5 missing_tool=null');
    assert(signal.validator_required === false, '2.6 validator_required=false');
    assert(signal.operator_review_reason === null, '2.7 operator_review_reason=null');
}

// ---------------------------------------------------------------------------
// PART 3 — FIXABLE_REVIEW_REQUIRED classification
// ---------------------------------------------------------------------------
console.log('\n\n=== PART 3 — FIXABLE_REVIEW_REQUIRED Classification ===\n');

{
    // BLEED_MISSING -> APPLY_BLEED: implemented, autofixable, but requires_human_review=true
    const [issue] = IssueNormalizer.normalize([{ code: 'IND_GEOM_002' }]);
    const signal = buildFindingSignal(issue, []);
    assert(signal.fixability === 'FIXABLE_REVIEW_REQUIRED', '3.1 BLEED_MISSING -> fixability=FIXABLE_REVIEW_REQUIRED', signal.fixability);
    assert(signal.fix_id === 'APPLY_BLEED', '3.2 fix_id=APPLY_BLEED', signal.fix_id);
    assert(signal.risk_level === 'MEDIUM', '3.3 risk_level=MEDIUM', signal.risk_level);
    assert(signal.operator_review_reason === 'HUMAN_REVIEW_REQUIRED', '3.4 operator_review_reason=HUMAN_REVIEW_REQUIRED', signal.operator_review_reason);
}

// ---------------------------------------------------------------------------
// PART 4 — NOT_FIXABLE classification
// ---------------------------------------------------------------------------
console.log('\n\n=== PART 4 — NOT_FIXABLE Classification ===\n');

{
    // PAGE_SIZE_INCONSISTENT: fixable=false, no fix strategy assigned
    const [issue] = IssueNormalizer.normalize([{ code: 'IND_GEOM_009' }]);
    const signal = buildFindingSignal(issue, []);
    assert(signal.fixability === 'NOT_FIXABLE', '4.1 PAGE_SIZE_INCONSISTENT -> fixability=NOT_FIXABLE', signal.fixability);
    assert(signal.fix_id === null, '4.2 fix_id=null');
    assert(signal.operator_review_reason === null, '4.3 operator_review_reason=null (no known capability)');
}

// ---------------------------------------------------------------------------
// PART 5 — NOT_IMPLEMENTED classification
// ---------------------------------------------------------------------------
console.log('\n\n=== PART 5 — NOT_IMPLEMENTED Classification ===\n');

{
    // FLATTEN_TRANSPARENCY: category=transparency_overprint, implemented=false
    const [issue] = IssueNormalizer.normalize([{ code: 'IND_TRANS_001' }]);
    const signal = buildFindingSignal(issue, []);
    assert(signal.fixability === 'NOT_IMPLEMENTED', '5.1 TRANSPARENCY_PRESENT -> fixability=NOT_IMPLEMENTED', signal.fixability);
    assert(signal.fix_id === 'FLATTEN_TRANSPARENCY', '5.2 fix_id=FLATTEN_TRANSPARENCY', signal.fix_id);
    assert(signal.operator_review_reason === 'FIX_NOT_IMPLEMENTED', '5.3 operator_review_reason=FIX_NOT_IMPLEMENTED', signal.operator_review_reason);
    assert(signal.visual_sensitivity === true, '5.4 visual_sensitivity=true (transparency_overprint)');
    assert(signal.risk_level === 'HIGH', '5.5 risk_level=HIGH', signal.risk_level);
}

// ---------------------------------------------------------------------------
// PART 6 — visual_sensitivity signal
// ---------------------------------------------------------------------------
console.log('\n\n=== PART 6 — Visual Sensitivity Signal ===\n');

{
    // INK_TOTAL_COVERAGE_EXCESSIVE -> REDUCE_TOTAL_INK_COVERAGE, visually_sensitive=true on issue
    const [issue] = IssueNormalizer.normalize([{ code: 'IND_INK_001' }]);
    const signal = buildFindingSignal(issue, []);
    assert(signal.visual_sensitivity === true, '6.1 IND_INK_001 -> visual_sensitivity=true');
    assert(signal.fixability === 'NOT_IMPLEMENTED', '6.2 REDUCE_TOTAL_INK_COVERAGE not implemented -> NOT_IMPLEMENTED', signal.fixability);
    assert(signal.risk_level === 'HIGH', '6.3 risk_level=HIGH (destructiveFixRisk from normalizer)', signal.risk_level);
}

{
    // A finding with no fix strategy and no visually_sensitive flag -> false
    const [issue] = IssueNormalizer.normalize([{ code: 'IND_GEOM_007' }]); // TRIM_MARGIN_WARNING
    const signal = buildFindingSignal(issue, []);
    assert(signal.visual_sensitivity === false, '6.4 TRIM_MARGIN_WARNING -> visual_sensitivity=false');
}

// ---------------------------------------------------------------------------
// PART 7 — validator_required signal
// ---------------------------------------------------------------------------
console.log('\n\n=== PART 7 — Validator Required Signal ===\n');

{
    // Synthetic finding routed to VALIDATE_PDFX (validator_required=true)
    const issue = {
        id: 'PDFX_VALIDATION_REQUIRED',
        code: 'PDFX_VALIDATION_REQUIRED',
        repairStrategy: 'VALIDATE_PDFX',
        fixable: true
    };
    const signal = buildFindingSignal(issue, []);
    assert(signal.validator_required === true, '7.1 VALIDATE_PDFX -> validator_required=true');
    assert(signal.fixability === 'FIXABLE_REVIEW_REQUIRED', '7.2 VALIDATE_PDFX -> fixability=FIXABLE_REVIEW_REQUIRED', signal.fixability);
    assert(signal.operator_review_reason === 'VALIDATOR_REQUIRED', '7.3 operator_review_reason=VALIDATOR_REQUIRED', signal.operator_review_reason);
}

// ---------------------------------------------------------------------------
// PART 8 — missing_tool signal
// ---------------------------------------------------------------------------
console.log('\n\n=== PART 8 — Missing Tool Signal ===\n');

{
    // VALIDATE_PDFX requires toolchain ["verapdf"]; simulate it being unavailable
    const issue = {
        id: 'PDFX_VALIDATION_REQUIRED',
        code: 'PDFX_VALIDATION_REQUIRED',
        repairStrategy: 'VALIDATE_PDFX',
        fixable: true
    };
    const signal = buildFindingSignal(issue, ['verapdf']);
    assert(signal.missing_tool === 'verapdf', '8.1 missing_tool=verapdf when toolchain tool unavailable', signal.missing_tool);
    assert(signal.operator_review_reason === 'MISSING_TOOL:verapdf', '8.2 operator_review_reason=MISSING_TOOL:verapdf', signal.operator_review_reason);
    assert(signal.fixability === 'FIXABLE_REVIEW_REQUIRED', '8.3 fixability=FIXABLE_REVIEW_REQUIRED despite missing tool', signal.fixability);
}

{
    // No missing tools -> missing_tool=null
    const [issue] = IssueNormalizer.normalize([{ code: 'IND_GEOM_003' }]);
    const signal = buildFindingSignal(issue, ['verapdf']);
    assert(signal.missing_tool === null, '8.4 unrelated missing tool does not affect this finding');
}

// ---------------------------------------------------------------------------
// PART 9 — Governance invariants
// ---------------------------------------------------------------------------
console.log('\n\n=== PART 9 — Governance Invariants ===\n');

{
    const issues = IssueNormalizer.normalize([{ code: 'IND_GEOM_003' }, { code: 'IND_INK_001' }, { code: 'IND_TRANS_001' }]);
    const result = generateRecommendationSignals({}, issues);
    const gov = result.recommendation_signals_governance;
    assert(gov.signals_are_advisory_only === true, '9.1 signals_are_advisory_only=true');
    assert(gov.recommendation_authority === false, '9.2 recommendation_authority=false');
    assert(gov.auto_apply_authority === false, '9.3 auto_apply_authority=false');
    assert(gov.production_certified === false, '9.4 production_certified=false');
    assert(gov.standard_certified === false, '9.5 standard_certified=false');
    assert(gov.compliance_claim_allowed === false, '9.6 compliance_claim_allowed=false');

    assert(result.summary.total_findings === 3, '9.7 summary.total_findings=3');
    assert(result.summary.fixable_auto_count === 1, '9.8 summary.fixable_auto_count=1 (REBUILD_TRIMBOX)', result.summary.fixable_auto_count);
    assert(result.summary.not_implemented_count === 2, '9.9 summary.not_implemented_count=2', result.summary.not_implemented_count);
    assert(result.summary.visual_review_required_count === 2, '9.10 summary.visual_review_required_count=2 (ink + transparency)', result.summary.visual_review_required_count);
}

// ---------------------------------------------------------------------------
// PART 10 — ReportBuilder integration
// ---------------------------------------------------------------------------
console.log('\n\n=== PART 10 — ReportBuilder Integration ===\n');

{
    const builder = new ReportBuilder();
    const report = builder.build({
        issues: [{ id: 'TRIMBOX_MISSING', code: 'IND_GEOM_003', severity: 'error', message: 'TrimBox missing', fixable: true, fix_method: 'REBUILD_TRIMBOX', repairStrategy: 'REBUILD_TRIMBOX', safeToAutofix: true, destructiveFixRisk: 'LOW' }],
        riskSummary: { score: 10, level: 'LOW', criticals: 0 },
        metadata: {
            pages: 1,
            size: 1000,
            geometry: { pages: [{ page: 1, widthMm: 210, heightMm: 297 }], firstPage: { widthMm: 210, heightMm: 297 } },
            analysisIntegrity: {}
        },
        filePath: '/tmp/test.pdf',
        partial: false,
        warnings: [],
        analyzerCoverage: { registered: [], executed: [], partial: [], skipped: [], failed: [] },
        options: {}
    });

    assert(typeof report.recommendation_signals === 'object', '10.1 report includes recommendation_signals');
    assert(Array.isArray(report.recommendation_signals.findings), '10.2 recommendation_signals.findings is array');
    assert(report.recommendation_signals.findings.length === 1, '10.3 one finding signal generated');
    assert(report.recommendation_signals.findings[0].fixability === 'FIXABLE_AUTO', '10.4 finding signal fixability=FIXABLE_AUTO', report.recommendation_signals.findings[0].fixability);
    assert(report.recommendation_signals.recommendation_signals_governance.auto_apply_authority === false, '10.5 governance carried through ReportBuilder');
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------
const reportsDir = path.join(__dirname, '..', 'reports');
if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

const smokePassed = FAIL === 0;
const report = {
    generated_at: new Date().toISOString(),
    phase: '75A',
    repo: 'ppos-preflight-engine',
    category: 'engine_recommendation_signals',
    smoke_passed: smokePassed,
    governance: {
        signals_are_advisory_only: true,
        recommendation_authority: false,
        auto_apply_authority: false,
        production_certified: false,
        standard_certified: false,
        compliance_claim_allowed: false
    },
    signal_fields: [
        'finding_id', 'finding_code', 'fix_id', 'fixability', 'risk_level',
        'visual_sensitivity', 'missing_tool', 'validator_required', 'operator_review_reason'
    ],
    summary: { total: PASS + FAIL, passed: PASS, failed: FAIL },
    results
};

const jsonPath = path.join(reportsDir, 'phase75a_engine_recommendation_signals.json');
const mdPath   = path.join(reportsDir, 'phase75a_engine_recommendation_signals.md');
fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

const md = [
    '# Phase 75A — Engine Recommendation Signals',
    '',
    `**Generated:** ${report.generated_at}  `,
    `**Smoke:** ${smokePassed ? '✅ PASSED' : '❌ FAILED'}  `,
    `**Results:** ${PASS}/${PASS + FAIL} passed`,
    '',
    '## Signal Fields',
    report.signal_fields.map(f => `- \`${f}\``).join('\n'),
    '',
    '## Governance',
    '| Invariant | Value |',
    '|-----------|-------|',
    '| signals are advisory only | **true** |',
    '| recommendation_authority | **false** |',
    '| auto_apply_authority | **false** |',
    '| production_certified | **false** |',
    '| standard_certified | **false** |',
    '| compliance_claim_allowed | **false** |',
    '',
    '## Test Results',
    '| # | Test | Pass |',
    '|---|------|------|',
    ...results.map((r, i) => `| ${i+1} | ${r.label} | ${r.pass ? '✅' : '❌'} |`),
    ''
].join('\n');
fs.writeFileSync(mdPath, md);

console.log(`\n${'='.repeat(70)}`);
console.log(`Phase 75A — Engine Recommendation Signals`);
console.log(`Results: ${PASS}/${PASS + FAIL} passed${FAIL > 0 ? ` (${FAIL} FAILED)` : ''}`);
console.log(`Smoke: ${smokePassed ? 'PASSED ✅' : 'FAILED ❌'}`);
console.log(`Reports: ${jsonPath}`);
console.log('='.repeat(70));

process.exit(smokePassed ? 0 : 1);
