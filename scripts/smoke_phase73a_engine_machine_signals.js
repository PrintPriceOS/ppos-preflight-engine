'use strict';
/**
 * Phase 73A Smoke Test — Engine Machine Capability Signals
 *
 * Validates:
 *  1. Module output shape and defaults on empty input
 *  2. Page signals (size, orientation, consistency, mixed orientation)
 *  3. Color signals (RGB detection, mixed color spaces, ICC missing, spot color)
 *  4. Ink signals (TAC exceeded, rich black, registration misuse, risk levels)
 *  5. Finishing / page marks signals (crop marks, bleed, registration marks)
 *  6. Standards signals (validated / claimed-not-validated / invalid / not claimed / unknown)
 *  7. Media requirements (bleed mm, CMYK conversion, paper passthrough)
 *  8. Governance invariants
 *  9. ReportBuilder integration
 */

const path = require('path');
const fs   = require('fs');

const { generateMachineCapabilitySignals } = require('../interpretation/MachineCapabilitySignals');
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

function assertFalse(condition, label, detail) {
    assert(!condition, label, detail);
}

// ---------------------------------------------------------------------------
// PART 1 — Module output shape and defaults
// ---------------------------------------------------------------------------
console.log('\n\n=== PART 1 — Output Shape and Defaults ===\n');

{
    const result = generateMachineCapabilitySignals({}, []);
    assert(typeof result.generated_at === 'string', '1.1 generated_at is string');
    assert(typeof result.page_signals === 'object', '1.2 page_signals is object');
    assert(typeof result.color_signals === 'object', '1.3 color_signals is object');
    assert(typeof result.ink_signals === 'object', '1.4 ink_signals is object');
    assert(typeof result.finishing_signals === 'object', '1.5 finishing_signals is object');
    assert(typeof result.standards_signals === 'object', '1.6 standards_signals is object');
    assert(typeof result.media_requirements === 'object', '1.7 media_requirements is object');
    assert(Array.isArray(result.warnings), '1.8 warnings is array');
    assert(result.page_signals.page_count === 0, '1.9 empty input: page_count=0');
    assert(result.warnings.includes('PAGE_COUNT_UNAVAILABLE'), '1.10 empty input: PAGE_COUNT_UNAVAILABLE warning');
    assert(result.warnings.includes('PAGE_SIZE_UNAVAILABLE'), '1.11 empty input: PAGE_SIZE_UNAVAILABLE warning');
    assert(result.page_signals.orientation === 'UNKNOWN', '1.12 empty input: orientation=UNKNOWN');
    assert(result.color_signals.color_mode === 'CMYK_OR_UNSPECIFIED', '1.13 empty input: color_mode=CMYK_OR_UNSPECIFIED');
    assert(result.ink_signals.ink_risk === 'LOW', '1.14 empty input: ink_risk=LOW');
    assert(result.finishing_signals.finishing_marks_risk === 'LOW', '1.15 empty input: finishing_marks_risk=LOW');
    assert(result.standards_signals.standard_status === 'UNKNOWN', '1.16 empty input: standard_status=UNKNOWN');
}

// ---------------------------------------------------------------------------
// PART 2 — Page signals
// ---------------------------------------------------------------------------
console.log('\n\n=== PART 2 — Page Signals ===\n');

{
    // A4 portrait, single page
    const metadata = {
        pages: 1,
        geometry: {
            pages: [{ page: 1, widthMm: 210, heightMm: 297 }],
            firstPage: { widthMm: 210, heightMm: 297 }
        }
    };
    const result = generateMachineCapabilitySignals(metadata, []);
    assert(result.page_signals.page_count === 1, '2.1 page_count=1');
    assert(result.page_signals.page_size_mm.width === 210, '2.2 page_size_mm.width=210');
    assert(result.page_signals.page_size_mm.height === 297, '2.3 page_size_mm.height=297');
    assert(result.page_signals.orientation === 'PORTRAIT', '2.4 A4 portrait → orientation=PORTRAIT');
    assert(result.page_signals.page_size_consistent === true, '2.5 single page → page_size_consistent=true');
    assert(result.page_signals.mixed_orientation_detected === false, '2.6 no mixed orientation finding → false');
}

{
    // Landscape A4 (width > height)
    const metadata = {
        pages: 1,
        geometry: { pages: [{ page: 1, widthMm: 297, heightMm: 210 }], firstPage: { widthMm: 297, heightMm: 210 } }
    };
    const result = generateMachineCapabilitySignals(metadata, []);
    assert(result.page_signals.orientation === 'LANDSCAPE', '2.7 wide page → orientation=LANDSCAPE');
}

{
    // Square page
    const metadata = {
        pages: 1,
        geometry: { pages: [{ page: 1, widthMm: 200, heightMm: 200 }], firstPage: { widthMm: 200, heightMm: 200 } }
    };
    const result = generateMachineCapabilitySignals(metadata, []);
    assert(result.page_signals.orientation === 'SQUARE', '2.8 equal width/height → orientation=SQUARE');
}

{
    // Inconsistent page sizes across pages
    const metadata = {
        pages: 2,
        geometry: {
            pages: [
                { page: 1, widthMm: 210, heightMm: 297 },
                { page: 2, widthMm: 148, heightMm: 210 }
            ],
            firstPage: { widthMm: 210, heightMm: 297 }
        }
    };
    const result = generateMachineCapabilitySignals(metadata, []);
    assert(result.page_signals.page_size_consistent === false, '2.9 differing page dims → page_size_consistent=false');
}

{
    // Mixed orientation finding present
    const metadata = {
        pages: 2,
        geometry: { pages: [{ page: 1, widthMm: 210, heightMm: 297 }], firstPage: { widthMm: 210, heightMm: 297 } }
    };
    const result = generateMachineCapabilitySignals(metadata, [{ id: 'PAGE_SIZE_INCONSISTENT', code: 'IND_GEOM_009' }]);
    assert(result.page_signals.page_size_consistent === false, '2.10 PAGE_SIZE_INCONSISTENT finding → page_size_consistent=false');
}

// ---------------------------------------------------------------------------
// PART 3 — Color signals
// ---------------------------------------------------------------------------
console.log('\n\n=== PART 3 — Color Signals ===\n');

{
    const result = generateMachineCapabilitySignals({}, [{ id: 'RGB_IMAGES_PRESENT', code: 'IND_IMG_017' }]);
    assert(result.color_signals.rgb_detected === true, '3.1 RGB finding → rgb_detected=true');
    assert(result.color_signals.color_mode === 'RGB_PRESENT', '3.2 RGB finding → color_mode=RGB_PRESENT');
}

{
    const result = generateMachineCapabilitySignals({}, [{ id: 'COLOR_MIXED_COLOR_SPACES', code: 'IND_COLOR_003' }]);
    assert(result.color_signals.mixed_color_spaces === true, '3.3 mixed color space finding → mixed_color_spaces=true');
    assert(result.color_signals.color_mode === 'MIXED_COLOR_SPACES', '3.4 mixed color space finding → color_mode=MIXED_COLOR_SPACES');
}

{
    const result = generateMachineCapabilitySignals({}, [{ id: 'COLOR_SPOT_COLOR_DETECTED', code: 'IND_COLOR_004' }]);
    assert(result.color_signals.spot_color_detected === true, '3.5 spot color finding → spot_color_detected=true');
}

{
    const result = generateMachineCapabilitySignals({}, [{ id: 'COLOR_ICC_PROFILE_MISSING', code: 'IND_COLOR_002' }]);
    assert(result.color_signals.icc_profile_missing === true, '3.6 ICC missing finding → icc_profile_missing=true');
}

{
    const result = generateMachineCapabilitySignals({}, []);
    assertFalse(result.color_signals.rgb_detected, '3.7 no findings → rgb_detected=false');
    assert(result.color_signals.color_mode === 'CMYK_OR_UNSPECIFIED', '3.8 no findings → color_mode=CMYK_OR_UNSPECIFIED');
}

// ---------------------------------------------------------------------------
// PART 4 — Ink signals
// ---------------------------------------------------------------------------
console.log('\n\n=== PART 4 — Ink Signals ===\n');

{
    const result = generateMachineCapabilitySignals({}, [{ id: 'COLOR_TOTAL_INK_COVERAGE_EXCEEDED', code: 'IND_COLOR_005' }]);
    assert(result.ink_signals.tac_exceeded === true, '4.1 TAC exceeded finding → tac_exceeded=true');
    assert(result.ink_signals.ink_risk === 'HIGH', '4.2 TAC exceeded → ink_risk=HIGH');
}

{
    const result = generateMachineCapabilitySignals({}, [{ id: 'INK_RICH_BLACK_TEXT', code: 'IND_INK_002' }]);
    assert(result.ink_signals.rich_black_risk === true, '4.3 rich black finding → rich_black_risk=true');
    assert(result.ink_signals.ink_risk === 'MEDIUM', '4.4 rich black only → ink_risk=MEDIUM');
}

{
    const result = generateMachineCapabilitySignals({}, [{ id: 'INK_REGISTRATION_COLOR_MISUSE', code: 'IND_INK_004' }]);
    assert(result.ink_signals.registration_color_misuse === true, '4.5 registration color misuse → flag true');
    assert(result.ink_signals.ink_risk === 'HIGH', '4.6 registration color misuse → ink_risk=HIGH');
}

{
    const result = generateMachineCapabilitySignals({}, [], { tac_measured: 312 });
    assert(result.ink_signals.tac_measured === 312, '4.7 tac_measured passed through from jobMeta');
}

{
    const result = generateMachineCapabilitySignals({}, []);
    assert(result.ink_signals.ink_risk === 'LOW', '4.8 no ink findings → ink_risk=LOW');
    assert(result.ink_signals.tac_measured === null, '4.9 no jobMeta → tac_measured=null');
}

// ---------------------------------------------------------------------------
// PART 5 — Finishing / page marks signals
// ---------------------------------------------------------------------------
console.log('\n\n=== PART 5 — Finishing / Page Marks Signals ===\n');

{
    const result = generateMachineCapabilitySignals({}, [{ id: 'CROP_MARKS_MISSING', code: 'IND_MARK_004' }, { id: 'BLEED_MISSING', code: 'IND_GEOM_002' }]);
    assert(result.finishing_signals.crop_marks_missing === true, '5.1 crop marks missing finding → flag true');
    assert(result.finishing_signals.bleed_missing === true, '5.2 bleed missing finding → flag true');
    assert(result.finishing_signals.finishing_marks_risk === 'HIGH', '5.3 crop marks + bleed missing → finishing_marks_risk=HIGH');
}

{
    const result = generateMachineCapabilitySignals({}, [{ id: 'BLEED_MISSING', code: 'IND_GEOM_002' }]);
    assert(result.finishing_signals.finishing_marks_risk === 'MEDIUM', '5.4 bleed missing only → finishing_marks_risk=MEDIUM');
}

{
    const result = generateMachineCapabilitySignals({}, [{ id: 'REGISTRATION_MARKS_INSIDE_TRIM', code: 'IND_MARK_008' }]);
    assert(result.finishing_signals.registration_marks_inside_trim === true, '5.5 registration marks inside trim → flag true');
    assert(result.finishing_signals.finishing_marks_risk === 'HIGH', '5.6 registration marks inside trim → finishing_marks_risk=HIGH');
}

{
    const result = generateMachineCapabilitySignals({}, [{ id: 'PAGE_MARKS_INCONSISTENT', code: 'IND_MARK_010' }]);
    assert(result.finishing_signals.page_marks_inconsistent === true, '5.7 page marks inconsistent → flag true');
    assert(result.finishing_signals.finishing_marks_risk === 'MEDIUM', '5.8 page marks inconsistent only → finishing_marks_risk=MEDIUM');
}

{
    const result = generateMachineCapabilitySignals({}, []);
    assert(result.finishing_signals.finishing_marks_risk === 'LOW', '5.9 no findings → finishing_marks_risk=LOW');
    assert(result.finishing_signals.bleed_missing === false, '5.10 no findings → bleed_missing=false');
}

// ---------------------------------------------------------------------------
// PART 6 — Standards signals
// ---------------------------------------------------------------------------
console.log('\n\n=== PART 6 — Standards Signals ===\n');

{
    const result = generateMachineCapabilitySignals({}, [{ id: 'STANDARD_VALIDATION_PASSED', code: 'IND_COMPLIANCE_026' }], { detected_standard: 'PDF/X-4' });
    assert(result.standards_signals.standard_status === 'VALIDATED', '6.1 STANDARD_VALIDATION_PASSED → standard_status=VALIDATED');
    assert(result.standards_signals.detected_standard === 'PDF/X-4', '6.2 detected_standard passed through');
}

{
    const result = generateMachineCapabilitySignals({}, [{ id: 'PDFX_CLAIMED_BUT_NOT_VALIDATED', code: 'IND_COMPLIANCE_005' }]);
    assert(result.standards_signals.standard_status === 'CLAIMED_NOT_VALIDATED', '6.3 claimed-not-validated → standard_status=CLAIMED_NOT_VALIDATED');
}

{
    const result = generateMachineCapabilitySignals({}, [{ id: 'PDFX_INVALID', code: 'IND_COMPLIANCE_004' }]);
    assert(result.standards_signals.standard_status === 'INVALID', '6.4 PDFX_INVALID → standard_status=INVALID');
    assert(result.standards_signals.standard_invalid === true, '6.5 standard_invalid=true');
}

{
    const result = generateMachineCapabilitySignals({}, [{ id: 'PDF_STANDARD_UNKNOWN', code: 'IND_COMPLIANCE_008' }]);
    assert(result.standards_signals.standard_status === 'NOT_CLAIMED', '6.6 PDF_STANDARD_UNKNOWN → standard_status=NOT_CLAIMED');
}

{
    const result = generateMachineCapabilitySignals({}, []);
    assert(result.standards_signals.standard_status === 'UNKNOWN', '6.7 no standards findings → standard_status=UNKNOWN');
    assert(result.standards_signals.detected_standard === null, '6.8 no jobMeta → detected_standard=null');
}

{
    // INVALID takes priority over VALIDATED if both present (defensive ordering)
    const result = generateMachineCapabilitySignals({}, [
        { id: 'PDFX_INVALID', code: 'IND_COMPLIANCE_004' },
        { id: 'STANDARD_VALIDATION_PASSED', code: 'IND_COMPLIANCE_026' }
    ]);
    assert(result.standards_signals.standard_status === 'INVALID', '6.9 INVALID takes priority over VALIDATED');
}

// ---------------------------------------------------------------------------
// PART 7 — Media requirements
// ---------------------------------------------------------------------------
console.log('\n\n=== PART 7 — Media Requirements ===\n');

{
    const result = generateMachineCapabilitySignals({}, []);
    assert(result.media_requirements.min_bleed_mm === 3, '7.1 default min_bleed_mm=3');
    assert(result.media_requirements.bleed_present === true, '7.2 no bleed finding → bleed_present=true');
    assert(result.media_requirements.paper_type === null, '7.3 no jobMeta → paper_type=null');
    assert(result.media_requirements.paper_gsm === null, '7.4 no jobMeta → paper_gsm=null');
}

{
    const result = generateMachineCapabilitySignals({}, [{ id: 'BLEED_MISSING', code: 'IND_GEOM_002' }]);
    assert(result.media_requirements.bleed_present === false, '7.5 bleed missing finding → bleed_present=false');
}

{
    const result = generateMachineCapabilitySignals({}, [{ id: 'RGB_IMAGES_PRESENT', code: 'IND_IMG_017' }]);
    assert(result.media_requirements.requires_cmyk_conversion === true, '7.6 RGB present → requires_cmyk_conversion=true');
}

{
    const result = generateMachineCapabilitySignals({}, [], { paper_type: 'coated', paper_gsm: 150 });
    assert(result.media_requirements.paper_type === 'coated', '7.7 paper_type passed through from jobMeta');
    assert(result.media_requirements.paper_gsm === 150, '7.8 paper_gsm passed through from jobMeta');
}

{
    const metadata = { geometry: { pages: [{ page: 1, widthMm: 210, heightMm: 297 }], firstPage: { widthMm: 210, heightMm: 297 } } };
    const result = generateMachineCapabilitySignals(metadata, []);
    assert(result.media_requirements.page_size_mm.width === 210, '7.9 media_requirements.page_size_mm mirrors page_signals');
}

// ---------------------------------------------------------------------------
// PART 8 — Governance invariants
// ---------------------------------------------------------------------------
console.log('\n\n=== PART 8 — Governance Invariants ===\n');

{
    const result = generateMachineCapabilitySignals({}, [{ id: 'STANDARD_VALIDATION_PASSED', code: 'IND_COMPLIANCE_026' }], { detected_standard: 'PDF/X-4' });
    const gov = result.machine_capability_signals_governance;
    assert(gov.signals_are_advisory_only === true, '8.1 signals_are_advisory_only=true');
    assert(gov.machine_match_authority === false, '8.2 machine_match_authority=false');
    assert(gov.production_certified === false, '8.3 production_certified=false even when standard validated');
    assert(gov.standard_certified === false, '8.4 standard_certified=false even when standard validated');
    assert(gov.compliance_claim_allowed === false, '8.5 compliance_claim_allowed=false');
}

// ---------------------------------------------------------------------------
// PART 9 — ReportBuilder integration
// ---------------------------------------------------------------------------
console.log('\n\n=== PART 9 — ReportBuilder Integration ===\n');

{
    const builder = new ReportBuilder();
    const report = builder.build({
        issues: [{ id: 'BLEED_MISSING', code: 'IND_GEOM_002', severity: 'warning', message: 'Bleed missing' }],
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

    assert(typeof report.machine_capability_signals === 'object', '9.1 report includes machine_capability_signals');
    assert(report.machine_capability_signals.finishing_signals.bleed_missing === true, '9.2 report signals reflect BLEED_MISSING finding');
    assert(report.machine_capability_signals.page_signals.page_count === 1, '9.3 report signals reflect page_count');
    assert(report.machine_capability_signals.machine_capability_signals_governance.production_certified === false, '9.4 report signals carry governance invariants');
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------
const reportsDir = path.join(__dirname, '..', 'reports');
if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

const smokePassed = FAIL === 0;
const report = {
    generated_at: new Date().toISOString(),
    phase: '73A',
    repo: 'ppos-preflight-engine',
    category: 'engine_machine_capability_signals',
    smoke_passed: smokePassed,
    governance: {
        signals_are_advisory_only: true,
        machine_match_authority: false,
        production_certified: false,
        standard_certified: false,
        compliance_claim_allowed: false
    },
    signal_groups: [
        'page_signals', 'color_signals', 'ink_signals',
        'finishing_signals', 'standards_signals', 'media_requirements'
    ],
    summary: { total: PASS + FAIL, passed: PASS, failed: FAIL },
    results
};

const jsonPath = path.join(reportsDir, 'phase73a_engine_machine_signals.json');
const mdPath   = path.join(reportsDir, 'phase73a_engine_machine_signals.md');
fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

const md = [
    '# Phase 73A — Engine Machine Capability Signals',
    '',
    `**Generated:** ${report.generated_at}  `,
    `**Smoke:** ${smokePassed ? '✅ PASSED' : '❌ FAILED'}  `,
    `**Results:** ${PASS}/${PASS + FAIL} passed`,
    '',
    '## Signal Groups',
    report.signal_groups.map(g => `- \`${g}\``).join('\n'),
    '',
    '## Governance',
    '| Invariant | Value |',
    '|-----------|-------|',
    '| signals are advisory only | **true** |',
    '| machine_match_authority | **false** |',
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
console.log(`Phase 73A — Engine Machine Capability Signals`);
console.log(`Results: ${PASS}/${PASS + FAIL} passed${FAIL > 0 ? ` (${FAIL} FAILED)` : ''}`);
console.log(`Smoke: ${smokePassed ? 'PASSED ✅' : 'FAILED ❌'}`);
console.log(`Reports: ${jsonPath}`);
console.log('='.repeat(70));

process.exit(smokePassed ? 0 : 1);
