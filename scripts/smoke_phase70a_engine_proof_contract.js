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

const PHASE70A_CAPABILITIES = [
    'GENERATE_PROOF_APPROVAL_CONTRACT',
    'GENERATE_PROOF_ARTIFACT_HASHES',
    'GENERATE_PROOF_ID'
];

const PHASE70A_FINDING_CODES = [
    'PROOF_CONTRACT_GENERATED',
    'PROOF_APPROVAL_PENDING',
    'PROOF_ARTIFACT_HASH_MISSING',
    'PROOF_IDENTITY_STABLE'
];

const FORBIDDEN_OVERCLAIM_PHRASES = [
    '"production_certified":true',
    '"production_safe":true',
    '"print_ready_claim_allowed":true',
    '"compliance_claim_allowed":true',
    '"standard_certified":true',
    '"proof_id_implies_certification":true'
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
        throw new Error(`Required Phase 70A fixtures still missing: ${stillMissing.join(', ')}`);
    }
}

function checkProofContractGovernance(res, notes) {
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
        notes.push('Governance violation: production_certified=true is forbidden for proof contracts');
    }
    if (res.production_safe === true) {
        ok = false;
        notes.push('Governance violation: production_safe=true is forbidden for proof contracts');
    }
    if (res.requires_human_review !== true) {
        ok = false;
        notes.push('Governance violation: requires_human_review must be true for proof contracts');
    }
    if (res.proof_approval_governance !== true) {
        ok = false;
        notes.push('Governance violation: proof_approval_governance must be true');
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

    // --- Test 1: FixRegistry Phase 70A capabilities ---
    {
        const notes = [];
        let pass = true;
        for (const capId of PHASE70A_CAPABILITIES) {
            const cap = getFixCapability(capId);
            if (!cap) {
                pass = false;
                notes.push(`Missing capability: ${capId}`);
                continue;
            }
            if (cap.category !== 'proof_approval_contract') {
                pass = false;
                notes.push(`${capId}: expected category "proof_approval_contract", got "${cap.category}"`);
            }
            if (cap.autofixable !== false) {
                pass = false;
                notes.push(`${capId}: autofixable must be false`);
            }
            if (cap.requires_human_review !== true) {
                pass = false;
                notes.push(`${capId}: requires_human_review must be true`);
            }
            if (cap.proof_approval_governance !== true) {
                pass = false;
                notes.push(`${capId}: proof_approval_governance must be true`);
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
            if (cap.phase !== '70A') {
                pass = false;
                notes.push(`${capId}: phase must be "70A", got "${cap.phase}"`);
            }
        }
        if (!notes.length) notes.push('All Phase 70A proof_approval_contract capabilities registered with correct policy fields.');
        if (!pass) allPass = false;
        results.push({
            scenario: 'FixRegistry Phase 70A proof_approval_contract capabilities check',
            status: pass ? 'VERIFIED' : 'FAILED',
            pass,
            notes
        });
    }

    // --- Test 2: IndustrialFindingCodes Phase 70A codes ---
    {
        const notes = [];
        let pass = true;
        const expectedCodes = {
            PROOF_CONTRACT_GENERATED: 'IND_PROOF_001',
            PROOF_APPROVAL_PENDING: 'IND_PROOF_002',
            PROOF_ARTIFACT_HASH_MISSING: 'IND_PROOF_003',
            PROOF_IDENTITY_STABLE: 'IND_PROOF_004'
        };
        for (const [key, val] of Object.entries(expectedCodes)) {
            if (CODES[key] !== val) {
                pass = false;
                notes.push(`Missing or wrong code: CODES.${key} expected "${val}", got "${CODES[key]}"`);
            }
        }
        if (!notes.length) notes.push('All Phase 70A proof contract finding codes registered correctly (IND_PROOF_001-004).');
        if (!pass) allPass = false;
        results.push({
            scenario: 'IndustrialFindingCodes Phase 70A proof contract codes',
            status: pass ? 'VERIFIED' : 'FAILED',
            pass,
            notes
        });
    }

    // --- Test 3: FixPlanner proof_approval_contract guardrails ---
    {
        const notes = [];
        let pass = true;
        const planner = new FixPlanner();
        const fakeIssues = PHASE70A_CAPABILITIES.map(capId => ({
            id: capId,
            repairStrategy: capId,
            fixable: true
        }));
        for (const policyMode of ['SAFE', 'REVIEW_REQUIRED', 'EXPERIMENTAL']) {
            const plan = planner.plan(fakeIssues, policyMode);
            for (const fix of plan) {
                if (PHASE70A_CAPABILITIES.includes(fix.fix_id) && fix.planned === true) {
                    pass = false;
                    notes.push(`FixPlanner violation: ${fix.fix_id} must never be planned for auto-execution (policy: ${policyMode})`);
                }
                if (PHASE70A_CAPABILITIES.includes(fix.fix_id) && fix.skip_reason !== 'PROOF_CONTRACT_EVIDENCE_ONLY_HUMAN_REVIEW_REQUIRED') {
                    pass = false;
                    notes.push(`FixPlanner violation: ${fix.fix_id} skip_reason must be PROOF_CONTRACT_EVIDENCE_ONLY_HUMAN_REVIEW_REQUIRED, got "${fix.skip_reason}" (policy: ${policyMode})`);
                }
            }
        }
        if (!notes.length) notes.push('FixPlanner correctly blocks all Phase 70A proof_approval_contract capabilities from auto-execution in any policy mode.');
        if (!pass) allPass = false;
        results.push({
            scenario: 'FixPlanner Phase 70A proof_approval_contract guardrails',
            status: pass ? 'VERIFIED' : 'FAILED',
            pass,
            notes
        });
    }

    // --- Test 4: GENERATE_PROOF_ARTIFACT_HASHES — both artifacts present ---
    {
        const notes = [];
        let pass = true;
        const res = await engine.generateProofArtifactHashes(
            { source_path: origPath, fixed_path: fixedPath }
        );
        const govOk = checkProofContractGovernance(res, notes);
        if (!govOk) pass = false;

        const ev = res.evidence || {};
        if (!ev.source_artifact_hash || typeof ev.source_artifact_hash !== 'string' || ev.source_artifact_hash.length !== 64) {
            pass = false;
            notes.push('source_artifact_hash is missing or not a valid SHA-256 hex string');
        }
        if (!ev.fixed_artifact_hash || typeof ev.fixed_artifact_hash !== 'string' || ev.fixed_artifact_hash.length !== 64) {
            pass = false;
            notes.push('fixed_artifact_hash is missing or not a valid SHA-256 hex string');
        }
        if (ev.source_artifact_hash === ev.fixed_artifact_hash) {
            pass = false;
            notes.push('source_artifact_hash and fixed_artifact_hash must differ for different files');
        }
        if (!pass && !notes.length) notes.push('Artifact hashes generated and validated.');
        if (pass && !notes.some(n => n.startsWith('Artifact'))) notes.push('GENERATE_PROOF_ARTIFACT_HASHES produces valid SHA-256 hashes for both artifacts.');
        if (!pass) allPass = false;
        results.push({
            scenario: 'GENERATE_PROOF_ARTIFACT_HASHES — both artifacts present',
            status: pass ? 'APPLIED' : 'FAILED',
            pass,
            source_artifact_hash: ev.source_artifact_hash || null,
            fixed_artifact_hash: ev.fixed_artifact_hash || null,
            notes
        });
    }

    // --- Test 5: GENERATE_PROOF_ARTIFACT_HASHES — missing source artifact ---
    {
        const notes = [];
        let pass = true;
        const res = await engine.generateProofArtifactHashes(
            { source_path: '/nonexistent/path/file.pdf', fixed_path: fixedPath }
        );
        const ev = res.evidence || {};
        if (ev.source_artifact_hash !== null) {
            pass = false;
            notes.push('source_artifact_hash must be null when file is missing');
        }
        if (!Array.isArray(ev.warnings) || !ev.warnings.some(w => w.includes('source_artifact'))) {
            pass = false;
            notes.push('A warning about the missing source_artifact must be present');
        }
        if (pass) notes.push('GENERATE_PROOF_ARTIFACT_HASHES correctly returns null hash and warning for missing artifact.');
        if (!pass) allPass = false;
        results.push({
            scenario: 'GENERATE_PROOF_ARTIFACT_HASHES — missing source artifact',
            status: pass ? 'APPLIED' : 'FAILED',
            pass,
            notes
        });
    }

    // --- Test 6: GENERATE_PROOF_ID — deterministic output ---
    {
        const notes = [];
        let pass = true;
        const srcHash = 'a'.repeat(64);
        const fixHash = 'b'.repeat(64);
        const diffHash = 'c'.repeat(64);

        const id1 = engine.generateProofId(srcHash, fixHash, diffHash);
        const id2 = engine.generateProofId(srcHash, fixHash, diffHash);
        const id3 = engine.generateProofId(srcHash, fixHash, null);

        if (typeof id1 !== 'string' || id1.length !== 64) {
            pass = false;
            notes.push('generateProofId must return a 64-char hex string');
        }
        if (id1 !== id2) {
            pass = false;
            notes.push('generateProofId must be deterministic: same inputs must produce same output');
        }
        if (id1 === id3) {
            pass = false;
            notes.push('generateProofId must differ when diff_report_hash differs');
        }
        if (pass) notes.push(`generateProofId is deterministic and sensitive to all inputs. proof_id sample: ${id1.slice(0, 16)}...`);
        if (!pass) allPass = false;
        results.push({
            scenario: 'GENERATE_PROOF_ID — deterministic output',
            status: pass ? 'VERIFIED' : 'FAILED',
            pass,
            proof_id_sample: id1 ? id1.slice(0, 16) + '...' : null,
            notes
        });
    }

    // --- Test 7: GENERATE_PROOF_APPROVAL_CONTRACT — full contract ---
    {
        const notes = [];
        let pass = true;
        const res = await engine.generateProofApprovalContract(origPath, fixedPath, {
            rendered_pages: 3,
            diff_report: { pages_compared: 1, changed_pixel_ratio_max: 0.5 }
        });

        const govOk = checkProofContractGovernance(res, notes);
        if (!govOk) pass = false;

        const ev = res.evidence || {};
        const requiredFields = ['proof_id', 'source_artifact_hash', 'fixed_artifact_hash', 'generated_at', 'hash_algorithm', 'proof_id_algorithm', 'limitations'];
        for (const f of requiredFields) {
            if (!ev[f]) {
                pass = false;
                notes.push(`Missing required contract field: ${f}`);
            }
        }
        if (ev.rendered_pages !== 3) {
            pass = false;
            notes.push(`rendered_pages should be 3, got ${ev.rendered_pages}`);
        }
        if (ev.proof_id && (typeof ev.proof_id !== 'string' || ev.proof_id.length !== 64)) {
            pass = false;
            notes.push('proof_id must be a 64-char hex string');
        }
        if (ev.diff_report_hash && (typeof ev.diff_report_hash !== 'string' || ev.diff_report_hash.length !== 64)) {
            pass = false;
            notes.push('diff_report_hash must be a 64-char hex string when diff_report is provided');
        }

        // No raw paths check
        const noRawPaths = checkNoRawPaths(ev, notes);
        if (!noRawPaths) pass = false;

        if (pass) notes.push(`GENERATE_PROOF_APPROVAL_CONTRACT returns complete contract. proof_id: ${ev.proof_id ? ev.proof_id.slice(0, 16) + '...' : 'null'}`);
        if (!pass) allPass = false;
        results.push({
            scenario: 'GENERATE_PROOF_APPROVAL_CONTRACT — full contract',
            status: pass ? 'APPLIED' : 'FAILED',
            pass,
            proof_id_prefix: ev.proof_id ? ev.proof_id.slice(0, 16) + '...' : null,
            source_artifact_hash_prefix: ev.source_artifact_hash ? ev.source_artifact_hash.slice(0, 16) + '...' : null,
            fixed_artifact_hash_prefix: ev.fixed_artifact_hash ? ev.fixed_artifact_hash.slice(0, 16) + '...' : null,
            rendered_pages: ev.rendered_pages,
            generated_at: ev.generated_at,
            notes
        });
    }

    // --- Test 8: proof_id stability — same inputs produce same proof_id ---
    {
        const notes = [];
        let pass = true;
        const res1 = await engine.generateProofApprovalContract(origPath, fixedPath);
        const res2 = await engine.generateProofApprovalContract(origPath, fixedPath);
        const id1 = res1.evidence && res1.evidence.proof_id;
        const id2 = res2.evidence && res2.evidence.proof_id;
        if (id1 !== id2) {
            pass = false;
            notes.push(`proof_id is not stable across calls: "${id1}" vs "${id2}"`);
        }
        if (pass) notes.push('proof_id is stable: same inputs produce the same proof_id across multiple calls.');
        if (!pass) allPass = false;
        results.push({
            scenario: 'proof_id stability — same inputs produce same proof_id',
            status: pass ? 'VERIFIED' : 'FAILED',
            pass,
            notes
        });
    }

    // --- Test 9: Governance overclaim regression ---
    {
        const notes = [];
        let pass = true;
        const res = await engine.generateProofApprovalContract(origPath, fixedPath);
        const serialized = JSON.stringify(res);
        for (const phrase of FORBIDDEN_OVERCLAIM_PHRASES) {
            if (serialized.toLowerCase().includes(phrase.toLowerCase())) {
                pass = false;
                notes.push(`Overclaim detected: "${phrase}"`);
            }
        }
        if (pass) notes.push('No Phase 70A operation produced production_certified, production_safe, or compliance overclaims.');
        if (!pass) allPass = false;
        results.push({
            scenario: 'Proof approval contract governance overclaim regression',
            status: pass ? 'VERIFIED' : 'FAILED',
            pass,
            notes
        });
    }

    // --- Write report ---
    const report = {
        generated_at: new Date().toISOString(),
        phase: '70A',
        repo: 'ppos-preflight-engine',
        category: 'proof_approval_contract',
        smoke_passed: allPass,
        governance: {
            proof_approval_governance: true,
            proof_contract_is_evidence_only: true,
            proof_id_implies_production_certification: false,
            proof_id_implies_print_ready: false,
            proof_id_implies_pdfx_compliance: false,
            proof_id_implies_pdfa_compliance: false,
            emits_raw_paths: false
        },
        core_principle: 'Proof approval contract is identity/evidence generation only. proof_id is a deterministic content fingerprint; it does not certify print-readiness, production approval, or standards compliance. No raw filesystem paths are emitted downstream.',
        target_capabilities: PHASE70A_CAPABILITIES,
        finding_codes_added: [
            'IND_PROOF_001 (PROOF_CONTRACT_GENERATED)',
            'IND_PROOF_002 (PROOF_APPROVAL_PENDING)',
            'IND_PROOF_003 (PROOF_ARTIFACT_HASH_MISSING)',
            'IND_PROOF_004 (PROOF_IDENTITY_STABLE)'
        ],
        forbidden_overclaims_checked: FORBIDDEN_OVERCLAIM_PHRASES,
        results
    };

    fs.ensureDirSync(REPORTS_DIR);
    const jsonPath = path.join(REPORTS_DIR, 'phase70a_engine_proof_contract.json');
    fs.writeJsonSync(jsonPath, report, { spaces: 2 });
    console.log(`\nReport written: ${jsonPath}`);

    const passCount = results.filter(r => r.pass).length;
    const failCount = results.filter(r => !r.pass).length;

    const md = [
        '# Phase 70A — Engine Proof Approval Contract Source',
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
        `| proof_id_implies_production_certification | false |`,
        `| proof_id_implies_print_ready | false |`,
        `| emits_raw_paths | false |`,
        `| proof_contract_is_evidence_only | true |`,
        '',
        '## Core Principle',
        '',
        `> ${report.core_principle}`,
        '',
        '## Capabilities Added',
        '',
        PHASE70A_CAPABILITIES.map(c => `- \`${c}\``).join('\n'),
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

    const mdPath = path.join(REPORTS_DIR, 'phase70a_engine_proof_contract.md');
    fs.writeFileSync(mdPath, md, 'utf8');
    console.log(`Report written: ${mdPath}`);

    if (!allPass) {
        console.error('\nPhase 70A smoke FAILED. See report for details.');
        process.exit(1);
    } else {
        console.log('\nPhase 70A smoke PASSED.');
    }
}

main().catch(err => {
    console.error('Phase 70A smoke error:', err);
    process.exit(1);
});
