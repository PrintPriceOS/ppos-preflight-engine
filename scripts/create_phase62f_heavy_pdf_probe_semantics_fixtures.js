'use strict';
/**
 * Phase 62F-A — Create probe semantics fixture files.
 *
 * Creates synthetic probe transcript fixtures under:
 *   fixtures/phase62f/probe_transcripts/
 *
 * Does NOT require an actual PDF or large file.
 * Fixtures represent plausible CLI tool output for classifier testing.
 */

const fs = require('fs-extra');
const path = require('path');

const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures', 'phase62f', 'probe_transcripts');

const FIXTURES = [
    {
        file: 'qpdf_warning_hint_table.txt',
        content: [
            'checking heavy_test.pdf',
            '  qpdf: heavy_test.pdf (C linearization data: hint table: shared object 11 in hint table but not in computed list of 11 shared objects for this page: ignoring)',
            '  qpdf: heavy_test.pdf (C linearization data: hint table: shared object 12 in hint table but not in computed list of 12 shared objects for this page: ignoring)',
            '  qpdf: heavy_test.pdf (C linearization data: hint table: page 0 has 1 shared identifier entries, and the hint table has 1 shared object entries, but 2 objects are associated with this page; assuming hint table is wrong; ignoring)',
            '  qpdf: heavy_test.pdf (W hint table has object count 253 vs computed count 254: ignoring)',
            'No syntax or stream encoding errors found.',
            'WARNING: this file contains linearization data but the data is inconsistent'
        ].join('\n'),
        description: 'qpdf warning-only: hint table inconsistencies (non-fatal linearization warnings)'
    },
    {
        file: 'qpdf_fatal_xref.txt',
        content: [
            'checking damaged.pdf',
            'qpdf: damaged.pdf: ERROR: unable to find trailer dictionary while recovering damaged file',
            'qpdf: damaged.pdf: ERROR: invalid xref table -- trying to reconstruct',
            'qpdf: damaged.pdf: errors found while checking this file; this file may not be usable'
        ].join('\n'),
        description: 'qpdf fatal: broken xref / trailer — document not reliably usable'
    },
    {
        file: 'qpdf_timeout.json',
        content: JSON.stringify({
            tool: 'qpdf',
            command: 'qpdf --check heavy_file.pdf',
            exitCode: null,
            stdout: '',
            stderr: '',
            timedOut: true,
            signal: 'SIGTERM',
            killed: true,
            durationMs: 3000,
            outputAvailable: false,
            scenario: 'qpdf timed out on 853 MB PDF after 3000ms'
        }, null, 2),
        description: 'qpdf timeout synthetic fixture'
    },
    {
        file: 'pdfimages_invalid_font_weight_warning.txt',
        content: [
            'page   num  type   width height color comp bpc  enc interp  object ID x-ppi y-ppi size ratio',
            '--------------------------------------------------------------------------------------------',
            'Syntax Warning: Invalid Font Weight',
            '   1     0 image    3508   4961  cmyk    4   8  jpeg   no         7  0   300   300  1.2M 1.8%',
            '   1     1 image    3508   4961  cmyk    4   8  jpeg   no        10  0   300   300  1.1M 1.6%',
            '   2     0 image    1754   2480  cmyk    4   8  jpeg   no        15  0   150   150 523K 3.0%'
        ].join('\n'),
        description: 'pdfimages warning-only: Syntax Warning Invalid Font Weight with usable image table'
    },
    {
        file: 'pdfimages_fatal_no_output.txt',
        content: "Error: Couldn't open file 'corrupt.pdf': No such file or directory\n",
        description: 'pdfimages fatal: could not open file, no usable output'
    },
    {
        file: 'generic_tool_missing.json',
        content: JSON.stringify({
            tool: 'mutool',
            command: 'mutool info test.pdf',
            exitCode: 'ENOENT',
            stdout: '',
            stderr: '',
            error: { code: 'ENOENT', message: 'spawn mutool ENOENT' },
            timedOut: false,
            signal: null,
            durationMs: 1,
            outputAvailable: false,
            scenario: 'mutool not installed — ENOENT'
        }, null, 2),
        description: 'Generic tool missing (ENOENT) synthetic fixture'
    },
    {
        file: 'generic_oom_killed.json',
        content: JSON.stringify({
            tool: 'gs',
            command: 'gs -dNOPAUSE -dBATCH -sDEVICE=nullpage heavy_file.pdf',
            exitCode: null,
            stdout: 'Processing pages 1 through 64.\nPage 1\nPage 2\nPage 3\n',
            stderr: '',
            error: { killed: true, signal: 'SIGKILL', message: 'Command failed: gs ... (killed)' },
            timedOut: false,
            signal: 'SIGKILL',
            killed: true,
            durationMs: 45000,
            outputAvailable: true,
            scenario: 'Ghostscript killed by OOM killer after processing 3 of 64 pages'
        }, null, 2),
        description: 'Ghostscript OOM/SIGKILL synthetic fixture'
    }
];

async function main() {
    await fs.ensureDir(FIXTURES_DIR);
    let created = 0;
    for (const fx of FIXTURES) {
        const dest = path.join(FIXTURES_DIR, fx.file);
        await fs.writeFile(dest, fx.content, 'utf8');
        console.log(`  [OK] ${fx.file} — ${fx.description}`);
        created++;
    }
    console.log(`\nPhase 62F-A fixtures: ${created} files written to fixtures/phase62f/probe_transcripts/`);
}

main().catch(err => { console.error(err); process.exit(1); });
