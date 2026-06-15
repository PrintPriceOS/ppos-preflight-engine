'use strict';

const fs = require('fs-extra');
const path = require('path');
const PdfFixEngine = require('../execution/PdfFixEngine');
const { getFixCapability } = require('../fixes/FixRegistry');
const { CODES } = require('../interpretation/IndustrialFindingCodes');
const FixPlanner = require('../fixes/FixPlanner');

const FIXTURES_DIR = path.join(__dirname, '../fixtures/phase69a');
const REPORTS_DIR = path.join(__dirname, '../reports');
const CREATE_FIXTURES_SCRIPT = path.join(__dirname, 'create_phase69a_visual_diff_fixtures.js');

const REQUIRED_FIXTURES = [
    'original_document.pdf',
    'fixed_document.pdf'
];

const PHASE74A_CAPABILITIES = [
    'GENERATE_AUDIT_EVIDENCE_EXPORT'
];

const PHASE74A_FINDING_CODES = {
    AUDIT_EVIDENCE_EXPORT_GENERATED: 'IND_AUDIT_001',
    AUDIT_EVIDENCE_EXPORT_INCOMPLETE: 'IND_AUDIT_002',
    AUDIT_TOOL_VERSION_UNAVAILABLE: 'IND_AUDIT_003',
    AUDIT_VALIDATOR_EVIDENCE_MISSING: 'IND_AUDIT_004'
};

const FORBIDDEN_OVERCLAIM_PHRASES = [
    '"production_certified":true',
    '"production_safe":true',
    '"print_ready_claim_allowed":true',
    '"compliance_claim_allowed":true',
    '"standard_certified":true',
    '"trust_inferred_from_filename":true'
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
        throw new Error(`Required Phase 74A fixtures still missing: ${stillMissing.join(', ')}`);
    }
}

function checkAuditEvidenceGovernance(res, notes) {
    let ok = true;
    const serialized = JSON.stringify(res).toLowerCase();

    for (const phrase of FORBIDDEN_OVERCLAIM_PHRASES) {
        if (serialized.includes(phrase.toLowerCase())) {
            ok = false;
            notes.push(`Forbidden overclaim phrase detected: "${phrase}"`);
        }
    }

    if (res.production_certified === true) {
        ok = false;
        notes.push('Governance violation: production_certified=true is forbidden');
    }
    if (res.production_safe === true) {
        ok = false;
        notes.push('Governance violation: production_safe=true is forbidden');
    }
    if (res.requires_human_review !== true) {
        ok = false;
        notes.push('Governance violation: requires_human_review must be true');
    }
    if (res.audit_evidence_export_governance !== true) {
        ok = false;
        notes.push('Governance violation: audit_evidence_export_governance must be true');
    }
    if (!res.evidence || typeof res.evidence !== 'object') {
        ok = false;
        notes.push('Governance violation: evidence object is missing');
    }

    return ok;
}

function checkNoRawPaths(evidence, notes) {
    let ok = true;
    const str = JSON.stringify(evidence);
    const rawPathPatterns = [
        /[A-Za-z]:\\[^"]+\.(pdf|png|jpg)/g,
        /\/tmp\/[^"]+/g,
        /\/var\/[^"]+/g,
        /\/home\/[^"]+\.(pdf|png)/g
    ];
    for (const pattern of rawPathPatterns) {
        const matches = str.match(pattern);
        if (matches) {
            ok = false;
            notes.push(`Raw filesystem path detected in evidence: ${matches[0]}`);
        }
    }
    return ok;
}

async function main() {
    const results = [];
    const engine = new PdfFixEngine();
    let allPass = true;

    await ensureFixtures();

    const origPath = path.join(FIXTURES_DIR, 'original_document.pdf');
    const fixedPath = path.join(FIXTURES_DIR, 'fixed_document.pdf');

    const fakeFindings = [
        { id: 'BLEED_MISSING', code: 'IND_GEOM_002', severity: 'warning', category: 'GEOMETRY', message: 'Bleed missing', fixable: true, repairStrategy: 'APPLY_BLEED' },
        { id: 'PDFX_CLAIMED_BUT_NOT_VALIDATED', code: 'IND_COMPLIANCE_005', severity: 'error', category: 'COMPLIANCE', message: 'PDF/X claimed but not validated', fixable: false }
    ];

    const fakeFixAudit = { fix_audit_version: 2, fixes: ['REBUILD_TRIMBOX'] };
    const fakeValidationReport = { standard: 'PDF/X-4', validation_passed: true, validator_name: 'verapdf' };

    // --- Test 1: FixRegistry Phase 74A capabilities ---
    {
        const notes = [];
        let pass = true;
        for (const capId of PHASE74A_CAPABILITIES) {
            const cap = getFixCapability(capId);
            if (!cap) {
                pass = false;
                notes.push(`Missing capability: ${capId}`);
                continue;
            }
            if (cap.category !== 'audit_evidence_export') {
                pass = false;
                notes.push(`${capId}: expected category "audit_evidence_export", got "${cap.category}"`);
            }
            if (cap.autofixable !== false) {
                pass = false;
                notes.push(`${capId}: autofixable must be false`);
            }
            if (cap.requires_human_review !== true) {
                pass = false;
                notes.push(`${capId}: requires_human_review must be true`);
            }
            if (cap.audit_evidence_export_governance !== true) {
                pass = false;
                notes.push(`${capId}: audit_evidence_export_governance must be true`);
            }
            if (cap.emits_raw_paths !== false) {
                pass = false;
                notes.push(`${capId}: emits_raw_paths must be false`);
            }
            if (cap.production_certified !== false) {
                pass = false;
                notes.push(`${capId}: production_certified must be false`);
            }
            if (cap.production_safe !== false) {
                pass = false;
                notes.push(`${capId}: production_safe must be false`);
            }
            if (cap.phase !== '74A') {
                pass = false;
                notes.push(`${capId}: phase must be "74A", got "${cap.phase}"`);
            }
        }
        if (!notes.length) notes.push('Phase 74A audit_evidence_export capability registered with correct policy fields.');
        if (!pass) allPass = false;
        results.push({
            scenario: 'FixRegistry Phase 74A audit_evidence_export capability check',
            status: pass ? 'VERIFIED' : 'FAILED',
            pass,
            notes
        });
    }

    // --- Test 2: IndustrialFindingCodes Phase 74A codes ---
    {
        const notes = [];
        let pass = true;
        for (const [key, val] of Object.entries(PHASE74A_FINDING_CODES)) {
            if (CODES[key] !== val) {
                pass = false;
                notes.push(`Missing or wrong code: CODES.${key} expected "${val}", got "${CODES[key]}"`);
            }
        }
        if (!notes.length) notes.push('All Phase 74A audit evidence export finding codes registered correctly (IND_AUDIT_001-004).');
        if (!pass) allPass = false;
        results.push({
            scenario: 'IndustrialFindingCodes Phase 74A audit evidence export codes',
            status: pass ? 'VERIFIED' : 'FAILED',
            pass,
            notes
        });
    }

    // --- Test 3: FixPlanner audit_evidence_export guardrails ---
    {
        const notes = [];
        let pass = true;
        const planner = new FixPlanner();
        const fakeIssues = Object.keys(PHASE74A_FINDING_CODES).map(key => ({
            id: key,
            code: PHASE74A_FINDING_CODES[key],
            repairStrategy: key,
            fixable: true
        }));
        for (const policyMode of ['SAFE', 'REVIEW_REQUIRED', 'EXPERIMENTAL']) {
            const plan = planner.plan(fakeIssues, policyMode);
            for (const fix of plan) {
                if (PHASE74A_CAPABILITIES.includes(fix.fix_id) && fix.planned === true) {
                    pass = false;
                    notes.push(`FixPlanner violation: ${fix.fix_id} must never be planned for auto-execution (policy: ${policyMode})`);
                }
                if (PHASE74A_CAPABILITIES.includes(fix.fix_id) && fix.skip_reason !== 'AUDIT_EVIDENCE_EXPORT_ONLY_HUMAN_REVIEW_REQUIRED') {
                    pass = false;
                    notes.push(`FixPlanner violation: ${fix.fix_id} skip_reason must be AUDIT_EVIDENCE_EXPORT_ONLY_HUMAN_REVIEW_REQUIRED, got "${fix.skip_reason}" (policy: ${policyMode})`);
                }
            }
        }
        if (!notes.length) notes.push('FixPlanner correctly blocks GENERATE_AUDIT_EVIDENCE_EXPORT from auto-execution in any policy mode.');
        if (!pass) allPass = false;
        results.push({
            scenario: 'FixPlanner Phase 74A audit_evidence_export guardrails',
            status: pass ? 'VERIFIED' : 'FAILED',
            pass,
            notes
        });
    }

    // --- Test 4: GENERATE_AUDIT_EVIDENCE_EXPORT — full inputs ---
    let fullResult = null;
    {
        const notes = [];
        let pass = true;

        const res = await engine.generateAuditEvidenceExport({
            findings: fakeFindings,
            fixes: [],
            original_path: origPath,
            fixed_path: fixedPath,
            review_path: fixedPath,
            certified_path: null,
            fix_audit: fakeFixAudit,
            validation_report: fakeValidationReport
        });
        fullResult = res;

        const govOk = checkAuditEvidenceGovernance(res, notes);
        if (!govOk) pass = false;

        const ev = res.evidence || {};
        if (!Array.isArray(ev.findings) || ev.findings.length !== fakeFindings.length) {
            pass = false;
            notes.push('evidence.findings must mirror the provided findings array');
        }
        if (!ev.findings.some(f => f.id === 'BLEED_MISSING')) {
            pass = false;
            notes.push('evidence.findings must preserve finding identity (BLEED_MISSING)');
        }
        if (!ev.artifact_hashes || typeof ev.artifact_hashes.original_artifact_hash !== 'string') {
            pass = false;
            notes.push('evidence.artifact_hashes must include original_artifact_hash');
        }
        if (!ev.tool_versions || typeof ev.tool_versions !== 'object') {
            pass = false;
            notes.push('evidence.tool_versions object is missing');
        }
        if (!ev.validator_evidence) {
            pass = false;
            notes.push('evidence.validator_evidence must be preserved when a validation_report is provided');
        }
        if (typeof ev.complete !== 'boolean') {
            pass = false;
            notes.push('evidence.complete must be a boolean');
        }

        const noRawPaths = checkNoRawPaths(ev, notes);
        if (!noRawPaths) pass = false;

        if (pass) notes.push('GENERATE_AUDIT_EVIDENCE_EXPORT aggregates findings, artifact hashes, tool versions, and validator evidence into one manifest.');
        if (!pass) allPass = false;
        results.push({
            scenario: 'GENERATE_AUDIT_EVIDENCE_EXPORT — full inputs',
            status: pass ? 'APPLIED' : 'FAILED',
            pass,
            evidence_sample: {
                code: res.code,
                status: res.status,
                findings_count: ev.findings ? ev.findings.length : 0,
                tool_versions: ev.tool_versions,
                complete: ev.complete,
                warnings: ev.warnings
            },
            notes
        });
    }

    // --- Test 5: GENERATE_AUDIT_EVIDENCE_EXPORT — empty inputs ---
    {
        const notes = [];
        let pass = true;

        const res = await engine.generateAuditEvidenceExport({});
        const govOk = checkAuditEvidenceGovernance(res, notes);
        if (!govOk) pass = false;

        const ev = res.evidence || {};
        if (!Array.isArray(ev.findings) || ev.findings.length !== 0) {
            pass = false;
            notes.push('evidence.findings must be an empty array when no findings are provided');
        }
        if (!Array.isArray(ev.fixes) || ev.fixes.length !== 0) {
            pass = false;
            notes.push('evidence.fixes must be an empty array when no fixes are provided');
        }
        if (ev.validator_evidence !== null) {
            pass = false;
            notes.push('evidence.validator_evidence must be null when no validation_report/validator_evidence is provided');
        }
        if (!ev.warnings.includes('VALIDATOR_EVIDENCE_MISSING')) {
            pass = false;
            notes.push('evidence.warnings must include VALIDATOR_EVIDENCE_MISSING when no validator evidence is provided');
        }
        if (ev.complete !== false) {
            pass = false;
            notes.push('evidence.complete must be false when artifacts/validator evidence are missing');
        }
        if (res.status !== 'AUDIT_EVIDENCE_EXPORT_INCOMPLETE' && res.status !== 'INCOMPLETE') {
            pass = false;
            notes.push(`Expected status to indicate incompleteness, got ${res.status}`);
        }

        if (pass) notes.push('GENERATE_AUDIT_EVIDENCE_EXPORT honestly reports an incomplete manifest when no artifacts, fixes, or validator evidence are provided.');
        if (!pass) allPass = false;
        results.push({
            scenario: 'GENERATE_AUDIT_EVIDENCE_EXPORT — empty inputs',
            status: pass ? 'APPLIED' : 'FAILED',
            pass,
            notes
        });
    }

    // --- Test 6: GENERATE_AUDIT_EVIDENCE_EXPORT — fixes preserved ---
    {
        const notes = [];
        let pass = true;

        const planner = new FixPlanner();
        const plan = planner.plan(fakeFindings, 'SAFE');

        const res = await engine.generateAuditEvidenceExport({
            findings: fakeFindings,
            fixes: plan,
            fixed_path: fixedPath
        });

        const ev = res.evidence || {};
        if (!Array.isArray(ev.fixes) || ev.fixes.length !== plan.length) {
            pass = false;
            notes.push('evidence.fixes must mirror the provided fix plan array');
        }
        for (const f of ev.fixes) {
            if (typeof f.fix_id !== 'string' && f.fix_id !== null) {
                pass = false;
                notes.push('Each fixes entry must have a fix_id string or null');
            }
            if (typeof f.requires_human_review !== 'boolean') {
                pass = false;
                notes.push('Each fixes entry must have a boolean requires_human_review');
            }
        }

        if (pass) notes.push('GENERATE_AUDIT_EVIDENCE_EXPORT preserves the fix plan (planned/skipped/skip_reason) for downstream audit consumption.');
        if (!pass) allPass = false;
        results.push({
            scenario: 'GENERATE_AUDIT_EVIDENCE_EXPORT — fixes preserved',
            status: pass ? 'APPLIED' : 'FAILED',
            pass,
            notes
        });
    }

    // --- Test 7: Stability across calls ---
    {
        const notes = [];
        let pass = true;

        const res1 = await engine.generateAuditEvidenceExport({
            findings: fakeFindings,
            original_path: origPath,
            fixed_path: fixedPath
        });
        const res2 = await engine.generateAuditEvidenceExport({
            findings: fakeFindings,
            original_path: origPath,
            fixed_path: fixedPath
        });

        if (res1.evidence.artifact_hashes.original_artifact_hash !== res2.evidence.artifact_hashes.original_artifact_hash ||
            res1.evidence.artifact_hashes.fixed_artifact_hash !== res2.evidence.artifact_hashes.fixed_artifact_hash) {
            pass = false;
            notes.push('Artifact hashes within the audit evidence export are not stable across repeated calls on the same content');
        }
        if (res1.evidence.findings.length !== res2.evidence.findings.length) {
            pass = false;
            notes.push('Findings export is not stable across repeated calls on the same input');
        }

        if (pass) notes.push('Audit evidence export is stable: identical inputs produce identical artifact hashes and findings export across calls.');
        if (!pass) allPass = false;
        results.push({
            scenario: 'GENERATE_AUDIT_EVIDENCE_EXPORT — stability across calls',
            status: pass ? 'VERIFIED' : 'FAILED',
            pass,
            notes
        });
    }

    // --- Test 8: Governance overclaim regression ---
    {
        const notes = [];
        let pass = true;
        const serialized = JSON.stringify(fullResult);
        for (const phrase of FORBIDDEN_OVERCLAIM_PHRASES) {
            if (serialized.toLowerCase().includes(phrase.toLowerCase())) {
                pass = false;
                notes.push(`Overclaim detected: "${phrase}"`);
            }
        }
        if (pass) notes.push('No Phase 74A operation produced production_certified, production_safe, or compliance overclaims.');
        if (!pass) allPass = false;
        results.push({
            scenario: 'Audit evidence export governance overclaim regression',
            status: pass ? 'VERIFIED' : 'FAILED',
            pass,
            notes
        });
    }

    // --- Write report ---
    const report = {
        generated_at: new Date().toISOString(),
        phase: '74A',
        repo: 'ppos-preflight-engine',
        category: 'audit_evidence_export',
        smoke_passed: allPass,
        governance: {
            audit_evidence_export_governance: true,
            evidence_export_is_evidence_only: true,
            hash_presence_implies_trust: false,
            tool_version_absence_implies_invalid: false,
            trust_inferred_from_filenames: false,
            emits_raw_paths: false
        },
        core_principle: 'The audit evidence export is a stable evidence manifest only. Aggregating findings, fixes, Phase 71A artifact content hashes, render/standards-validator tool versions, and Phase 68A validator evidence enables downstream audit bundling without inferring trust from filenames or paths. Missing tool versions or validator evidence are reported honestly as incomplete, never hidden or fabricated, and never imply production certification, standards compliance, or print-ready status.',
        target_capabilities: PHASE74A_CAPABILITIES,
        finding_codes_added: [
            'IND_AUDIT_001 (AUDIT_EVIDENCE_EXPORT_GENERATED)',
            'IND_AUDIT_002 (AUDIT_EVIDENCE_EXPORT_INCOMPLETE)',
            'IND_AUDIT_003 (AUDIT_TOOL_VERSION_UNAVAILABLE)',
            'IND_AUDIT_004 (AUDIT_VALIDATOR_EVIDENCE_MISSING)'
        ],
        forbidden_overclaims_checked: FORBIDDEN_OVERCLAIM_PHRASES,
        results
    };

    fs.ensureDirSync(REPORTS_DIR);
    const jsonPath = path.join(REPORTS_DIR, 'phase74a_engine_audit_evidence_export.json');
    fs.writeJsonSync(jsonPath, report, { spaces: 2 });
    console.log(`\nReport written: ${jsonPath}`);

    const passCount = results.filter(r => r.pass).length;
    const failCount = results.filter(r => !r.pass).length;

    const md = [
        '# Phase 74A — Engine Audit Evidence Export',
        '',
        `**Generated:** ${report.generated_at}  `,
        `**Repo:** ${report.repo}  `,
        `**Smoke passed:** ${allPass ? 'YES' : 'NO'}  `,
        `**Results:** ${passCount} passed, ${failCount} failed`,
        '',
        '## Governance',
        '',
        '| Field | Value |',
        '|---|---|',
        `| audit_evidence_export_governance | true |`,
        `| evidence_export_is_evidence_only | true |`,
        `| hash_presence_implies_trust | false |`,
        `| tool_version_absence_implies_invalid | false |`,
        `| trust_inferred_from_filenames | false |`,
        `| emits_raw_paths | false |`,
        '',
        '## Core Principle',
        '',
        `> ${report.core_principle}`,
        '',
        '## Capabilities Added',
        '',
        PHASE74A_CAPABILITIES.map(c => `- \`${c}\``).join('\n'),
        '',
        '## Finding Codes Added',
        '',
        report.finding_codes_added.map(c => `- ${c}`).join('\n'),
        '',
        '## Smoke Results',
        '',
        '| Scenario | Status | Pass |',
        '|---|---|---|',
        ...results.map(r => `| ${r.scenario} | ${r.status} | ${r.pass ? 'YES' : 'NO'} |`),
        ''
    ].join('\n');

    const mdPath = path.join(REPORTS_DIR, 'phase74a_engine_audit_evidence_export.md');
    fs.writeFileSync(mdPath, md, 'utf8');
    console.log(`Report written: ${mdPath}`);

    if (!allPass) {
        console.error('\nPhase 74A smoke FAILED. See report for details.');
        process.exit(1);
    } else {
        console.log('\nPhase 74A smoke PASSED.');
    }
}

main().catch(err => {
    console.error('Phase 74A smoke error:', err);
    process.exit(1);
});
