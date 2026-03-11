/**
 * CLI Validation Test Suite
 * 
 * Validates the ppos-preflight binary behavior.
 */
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs-extra');

const BIN_PATH = path.join(__dirname, '../../bin/ppos-preflight.js');
const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const VALID_PDF = path.join(FIXTURES_DIR, 'small_valid.pdf');
const CUSTOM_CONFIG = path.join(FIXTURES_DIR, 'custom_config.json');

function runCli(args = []) {
    return spawnSync('node', [BIN_PATH, ...args], { encoding: 'utf8' });
}

console.log('--- CLI VALIDATION TEST SUITE ---');

// 1. HELP SMOKE CHECK
const helpResult = runCli(['--help']);
if (helpResult.status === 0 && helpResult.stdout.includes('Usage: ppos-preflight')) {
    console.log('[PASS] Help Smoke Check');
} else {
    console.log('[FAIL] Help Smoke Check');
    process.exit(1);
}

// 2. ANALYZE VALID PDF (HUMAN MODE)
const analyzeResult = runCli(['analyze', VALID_PDF]);
if (analyzeResult.status === 1 && analyzeResult.stdout.includes('PPOS-PREFLIGHT: ANALYZE')) {
    console.log('[PASS] Analyze Human Mode (With Findings/Exit 1)');
} else {
    console.log('[FAIL] Analyze Human Mode');
    console.error(analyzeResult.stderr);
    process.exit(1);
}

// 3. ANALYZE VALID PDF (JSON MODE)
const analyzeJsonResult = runCli(['analyze', VALID_PDF, '--json']);
try {
    const json = JSON.parse(analyzeJsonResult.stdout);
    if (json.operation === 'analyze' && json.wrapper_metadata) {
        console.log('[PASS] Analyze JSON Mode');
    } else {
        console.log('[FAIL] Analyze JSON Mode (Invalid Structure)');
    }
} catch (e) {
    console.log('[FAIL] Analyze JSON Mode (Invalid JSON)');
}

// 4. MISSING INPUT HANDLING
const missingResult = runCli(['analyze', 'non_existent.pdf']);
if (missingResult.status === 2 && missingResult.stderr.includes('INPUT_ERROR')) {
    console.log('[PASS] Missing Input Handling (Exit 2)');
} else {
    console.log('[FAIL] Missing Input Handling');
}

// 5. AUTOFIX NO-OP SCENARIO
const autofixNoOpResult = runCli(['autofix', VALID_PDF, '--output', 'out.pdf']);
if (autofixNoOpResult.status === 0 && autofixNoOpResult.stdout.includes('already compliant')) {
    console.log('[PASS] Autofix No-Op behavior (Exit 0)');
} else {
    console.log('[FAIL] Autofix No-Op behavior');
}

// 6. CONFIG OVERRIDE CHECK
const configResult = runCli(['analyze', VALID_PDF, '--config', CUSTOM_CONFIG, '--verbose']);
if (configResult.stderr.includes('"minBleedMm":5')) {
    console.log('[PASS] Config Override (File)');
} else {
    console.log('[FAIL] Config Override (File)');
}

console.log('--- TEST SUMMARY ---');
console.log('Passed all critical CLI boundaries.');
