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

const PHASE71A_CAPABILITIES = [
    'GENERATE_ARTIFACT_HASH_MANIFEST',
    'VERIFY_ARTIFACT_HASH'
];

const PHASE71A_FINDING_CODES = {
    ARTIFACT_HASH_MANIFEST_GENERATED: 'IND_PKG_001',
    ARTIFACT_HASH_MANIFEST_INCOMPLETE: 'IND_PKG_002',
    ARTIFACT_HASH_VERIFIED: 'IND_PKG_003',
    ARTIFACT_HASH_MISMATCH: 'IND_PKG_004'
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
        throw new Error(`Required Phase 71A fixtures still missing: ${stillMissing.join(', ')}`);
    }
}

function checkPackageEvidenceGovernance(res, notes) {
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
    if (res.production_package_evidence_governance !== true) {
        ok = false;
        notes.push('Governance violation: production_package_evidence_governance must be true');
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

    // --- Test 1: FixRegistry Phase 71A capabilities ---
    {
        const notes = [];
        let pass = true;
        for (const capId of PHASE71A_CAPABILITIES) {
            const cap = getFixCapability(capId);
            if (!cap) {
                pass = false;
                notes.push(`Missing capability: ${capId}`);
                continue;
            }
            if (cap.category !== 'production_package_evidence') {
                pass = false;
                notes.push(`${capId}: expected category "production_package_evidence", got "${cap.category}"`);
            }
            if (cap.autofixable !== false) {
                pass = false;
                notes.push(`${capId}: autofixable must be false`);
            }
            if (cap.requires_human_review !== true) {
                pass = false;
                notes.push(`${capId}: requires_human_review must be true`);
            }
            if (cap.production_package_evidence_governance !== true) {
                pass = false;
                notes.push(`${capId}: production_package_evidence_governance must be true`);
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
            if (cap.phase !== '71A') {
                pass = false;
                notes.push(`${capId}: phase must be "71A", got "${cap.phase}"`);
            }
        }
        if (!notes.length) notes.push('All Phase 71A production_package_evidence capabilities registered with correct policy fields.');
        if (!pass) allPass = false;
        results.push({
            scenario: 'FixRegistry Phase 71A production_package_evidence capabilities check',
            status: pass ? 'VERIFIED' : 'FAILED',
            pass,
            notes
        });
    }

    // --- Test 2: IndustrialFindingCodes Phase 71A codes ---
    {
        const notes = [];
        let pass = true;
        for (const [key, val] of Object.entries(PHASE71A_FINDING_CODES)) {
            if (CODES[key] !== val) {
                pass = false;
                notes.push(`Missing or wrong code: CODES.${key} expected "${val}", got "${CODES[key]}"`);
            }
        }
        if (!notes.length) notes.push('All Phase 71A production package evidence finding codes registered correctly (IND_PKG_001-004).');
        if (!pass) allPass = false;
        results.push({
            scenario: 'IndustrialFindingCodes Phase 71A production package evidence codes',
            status: pass ? 'VERIFIED' : 'FAILED',
            pass,
            notes
        });
    }

    // --- Test 3: FixPlanner production_package_evidence guardrails ---
    {
        const notes = [];
        let pass = true;
        const planner = new FixPlanner();
        const fakeIssues = PHASE71A_CAPABILITIES.map(capId => ({
            id: capId,
            repairStrategy: capId,
            fixable: true
        }));
        for (const policyMode of ['SAFE', 'REVIEW_REQUIRED', 'EXPERIMENTAL']) {
            const plan = planner.plan(fakeIssues, policyMode);
            for (const fix of plan) {
                if (PHASE71A_CAPABILITIES.includes(fix.fix_id) && fix.planned === true) {
                    pass = false;
                    notes.push(`FixPlanner violation: ${fix.fix_id} must never be planned for auto-execution (policy: ${policyMode})`);
                }
                if (PHASE71A_CAPABILITIES.includes(fix.fix_id) && fix.skip_reason !== 'PRODUCTION_PACKAGE_EVIDENCE_ONLY_HUMAN_REVIEW_REQUIRED') {
                    pass = false;
                    notes.push(`FixPlanner violation: ${fix.fix_id} skip_reason must be PRODUCTION_PACKAGE_EVIDENCE_ONLY_HUMAN_REVIEW_REQUIRED, got "${fix.skip_reason}" (policy: ${policyMode})`);
                }
            }
        }
        if (!notes.length) notes.push('FixPlanner correctly blocks all Phase 71A production_package_evidence capabilities from auto-execution in any policy mode.');
        if (!pass) allPass = false;
        results.push({
            scenario: 'FixPlanner Phase 71A production_package_evidence guardrails',
            status: pass ? 'VERIFIED' : 'FAILED',
            pass,
            notes
        });
    }

    // --- Test 4: GENERATE_ARTIFACT_HASH_MANIFEST — full set of artifacts ---
    {
        const notes = [];
        let pass = true;
        const fakeFixAudit = { fix_audit_version: 2, fixes: ['REBUILD_TRIMBOX'] };
        const fakeValidationReport = { standard: 'PDF/X-4', passed: true };

        const res = await engine.generateArtifactHashManifest({
            original_path: origPath,
            fixed_path: fixedPath,
            review_path: fixedPath,
            certified_path: null,
            fix_audit: fakeFixAudit,
            validation_report: fakeValidationReport
        });

        const govOk = checkPackageEvidenceGovernance(res, notes);
        if (!govOk) pass = false;

        const ev = res.evidence || {};
        const hashFields = ['original_artifact_hash', 'fixed_artifact_hash', 'review_artifact_hash', 'fix_audit_hash', 'validation_report_hash'];
        for (const f of hashFields) {
            if (!ev[f] || typeof ev[f] !== 'string' || ev[f].length !== 64) {
                pass = false;
                notes.push(`${f} is missing or not a valid SHA-256 hex string`);
            }
        }
        if (ev.certified_artifact_hash !== null) {
            pass = false;
            notes.push('certified_artifact_hash must be null when certified_path is not provided');
        }
        if (!Array.isArray(ev.missing_hashes) || !ev.missing_hashes.includes('certified_artifact_hash')) {
            pass = false;
            notes.push('missing_hashes must include certified_artifact_hash');
        }
        if (ev.original_artifact_hash === ev.fixed_artifact_hash) {
            pass = false;
            notes.push('original_artifact_hash and fixed_artifact_hash must differ for different files');
        }
        if (ev.fixed_artifact_hash !== ev.review_artifact_hash) {
            pass = false;
            notes.push('fixed_artifact_hash and review_artifact_hash must match when pointed at the same file');
        }

        const noRawPaths = checkNoRawPaths(ev, notes);
        if (!noRawPaths) pass = false;

        if (pass) notes.push('GENERATE_ARTIFACT_HASH_MANIFEST produces stable SHA-256 hashes for file and in-memory artifacts, with missing artifacts flagged.');
        if (!pass) allPass = false;
        results.push({
            scenario: 'GENERATE_ARTIFACT_HASH_MANIFEST — full set of artifacts',
            status: pass ? 'APPLIED' : 'FAILED',
            pass,
            evidence_sample: {
                original_artifact_hash: ev.original_artifact_hash ? ev.original_artifact_hash.slice(0, 16) + '...' : null,
                fixed_artifact_hash: ev.fixed_artifact_hash ? ev.fixed_artifact_hash.slice(0, 16) + '...' : null,
                fix_audit_hash: ev.fix_audit_hash ? ev.fix_audit_hash.slice(0, 16) + '...' : null,
                validation_report_hash: ev.validation_report_hash ? ev.validation_report_hash.slice(0, 16) + '...' : null,
                missing_hashes: ev.missing_hashes
            },
            notes
        });
    }

    // --- Test 5: GENERATE_ARTIFACT_HASH_MANIFEST — all artifacts missing ---
    {
        const notes = [];
        let pass = true;
        const res = await engine.generateArtifactHashManifest({});
        const ev = res.evidence || {};

        const allFields = ['original_artifact_hash', 'fixed_artifact_hash', 'review_artifact_hash', 'certified_artifact_hash', 'fix_audit_hash', 'validation_report_hash'];
        for (const f of allFields) {
            if (ev[f] !== null) {
                pass = false;
                notes.push(`${f} must be null when no artifacts are provided`);
            }
        }
        if (!Array.isArray(ev.missing_hashes) || ev.missing_hashes.length !== allFields.length) {
            pass = false;
            notes.push('missing_hashes must list all 6 artifact fields when none are provided');
        }
        if (pass) notes.push('GENERATE_ARTIFACT_HASH_MANIFEST correctly returns null hashes and a complete missing_hashes list when no artifacts are provided.');
        if (!pass) allPass = false;
        results.push({
            scenario: 'GENERATE_ARTIFACT_HASH_MANIFEST — all artifacts missing',
            status: pass ? 'APPLIED' : 'FAILED',
            pass,
            notes
        });
    }

    // --- Test 6: GENERATE_ARTIFACT_HASH_MANIFEST — stability across calls ---
    {
        const notes = [];
        let pass = true;
        const res1 = await engine.generateArtifactHashManifest({ original_path: origPath, fixed_path: fixedPath });
        const res2 = await engine.generateArtifactHashManifest({ original_path: origPath, fixed_path: fixedPath });

        if (res1.evidence.original_artifact_hash !== res2.evidence.original_artifact_hash ||
            res1.evidence.fixed_artifact_hash !== res2.evidence.fixed_artifact_hash) {
            pass = false;
            notes.push('Artifact hashes are not stable across repeated calls on the same content');
        }
        if (pass) notes.push('Artifact hashes are stable: identical content produces identical hashes across calls.');
        if (!pass) allPass = false;
        results.push({
            scenario: 'GENERATE_ARTIFACT_HASH_MANIFEST — stability across calls',
            status: pass ? 'VERIFIED' : 'FAILED',
            pass,
            notes
        });
    }

    // --- Test 7: VERIFY_ARTIFACT_HASH — match ---
    {
        const notes = [];
        let pass = true;
        const manifest = await engine.generateArtifactHashManifest({ fixed_path: fixedPath });
        const expectedHash = manifest.evidence.fixed_artifact_hash;

        const res = await engine.verifyArtifactHash(fixedPath, expectedHash);
        const govOk = checkPackageEvidenceGovernance(res, notes);
        if (!govOk) pass = false;

        if (res.status !== 'VERIFIED') {
            pass = false;
            notes.push(`Expected status VERIFIED, got ${res.status}`);
        }
        if (res.evidence.matches !== true) {
            pass = false;
            notes.push('evidence.matches must be true for a matching artifact');
        }
        if (pass) notes.push('VERIFY_ARTIFACT_HASH correctly confirms a matching artifact hash.');
        if (!pass) allPass = false;
        results.push({
            scenario: 'VERIFY_ARTIFACT_HASH — match',
            status: pass ? 'VERIFIED' : 'FAILED',
            pass,
            notes
        });
    }

    // --- Test 8: VERIFY_ARTIFACT_HASH — mismatch ---
    {
        const notes = [];
        let pass = true;
        const res = await engine.verifyArtifactHash(fixedPath, 'f'.repeat(64));
        const govOk = checkPackageEvidenceGovernance(res, notes);
        if (!govOk) pass = false;

        if (res.status !== 'MISMATCH') {
            pass = false;
            notes.push(`Expected status MISMATCH, got ${res.status}`);
        }
        if (res.evidence.matches !== false) {
            pass = false;
            notes.push('evidence.matches must be false for a non-matching expected hash');
        }
        if (pass) notes.push('VERIFY_ARTIFACT_HASH correctly reports a mismatch when the content hash differs from the expected hash.');
        if (!pass) allPass = false;
        results.push({
            scenario: 'VERIFY_ARTIFACT_HASH — mismatch',
            status: pass ? 'VERIFIED' : 'FAILED',
            pass,
            notes
        });
    }

    // --- Test 9: Governance overclaim regression ---
    {
        const notes = [];
        let pass = true;
        const res1 = await engine.generateArtifactHashManifest({ original_path: origPath, fixed_path: fixedPath });
        const res2 = await engine.verifyArtifactHash(fixedPath, res1.evidence.fixed_artifact_hash);
        const serialized = JSON.stringify(res1) + JSON.stringify(res2);
        for (const phrase of FORBIDDEN_OVERCLAIM_PHRASES) {
            if (serialized.toLowerCase().includes(phrase.toLowerCase())) {
                pass = false;
                notes.push(`Overclaim detected: "${phrase}"`);
            }
        }
        if (pass) notes.push('No Phase 71A operation produced production_certified, production_safe, or compliance overclaims.');
        if (!pass) allPass = false;
        results.push({
            scenario: 'Production package evidence governance overclaim regression',
            status: pass ? 'VERIFIED' : 'FAILED',
            pass,
            notes
        });
    }

    // --- Write report ---
    const report = {
        generated_at: new Date().toISOString(),
        phase: '71A',
        repo: 'ppos-preflight-engine',
        category: 'production_package_evidence',
        smoke_passed: allPass,
        governance: {
            production_package_evidence_governance: true,
            artifact_hash_manifest_is_evidence_only: true,
            hash_presence_implies_trust: false,
            hash_match_implies_certification: false,
            trust_inferred_from_filenames: false,
            emits_raw_paths: false
        },
        core_principle: 'Production package evidence is identity/evidence generation only. Stable SHA-256 content hashes for original, fixed, review, certified, fix_audit, and validation_report artifacts enable downstream packaging without inferring trust from filenames or paths. Hash presence or a hash match never certifies print-readiness, production approval, or standards compliance.',
        target_capabilities: PHASE71A_CAPABILITIES,
        finding_codes_added: [
            'IND_PKG_001 (ARTIFACT_HASH_MANIFEST_GENERATED)',
            'IND_PKG_002 (ARTIFACT_HASH_MANIFEST_INCOMPLETE)',
            'IND_PKG_003 (ARTIFACT_HASH_VERIFIED)',
            'IND_PKG_004 (ARTIFACT_HASH_MISMATCH)'
        ],
        forbidden_overclaims_checked: FORBIDDEN_OVERCLAIM_PHRASES,
        results
    };

    fs.ensureDirSync(REPORTS_DIR);
    const jsonPath = path.join(REPORTS_DIR, 'phase71a_engine_artifact_hash_manifest.json');
    fs.writeJsonSync(jsonPath, report, { spaces: 2 });
    console.log(`\nReport written: ${jsonPath}`);

    const passCount = results.filter(r => r.pass).length;
    const failCount = results.filter(r => !r.pass).length;

    const md = [
        '# Phase 71A — Engine Production Package Evidence Source',
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
        `| hash_presence_implies_trust | false |`,
        `| hash_match_implies_certification | false |`,
        `| trust_inferred_from_filenames | false |`,
        `| emits_raw_paths | false |`,
        `| artifact_hash_manifest_is_evidence_only | true |`,
        '',
        '## Core Principle',
        '',
        `> ${report.core_principle}`,
        '',
        '## Capabilities Added',
        '',
        PHASE71A_CAPABILITIES.map(c => `- \`${c}\``).join('\n'),
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

    const mdPath = path.join(REPORTS_DIR, 'phase71a_engine_artifact_hash_manifest.md');
    fs.writeFileSync(mdPath, md, 'utf8');
    console.log(`Report written: ${mdPath}`);

    if (!allPass) {
        console.error('\nPhase 71A smoke FAILED. See report for details.');
        process.exit(1);
    } else {
        console.log('\nPhase 71A smoke PASSED.');
    }
}

main().catch(err => {
    console.error('Phase 71A smoke error:', err);
    process.exit(1);
});
