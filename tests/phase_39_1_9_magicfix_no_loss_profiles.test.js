const assert = require('assert');
const PdfFixEngine = require('../execution/PdfFixEngine');
const PreflightEngine = require('../core/PreflightEngine');
const PdfArtifactDeltaAuditor = require('../execution/PdfArtifactDeltaAuditor');
const AutofixExecutionEngine = require('../execution/AutofixExecutionEngine');

describe('Phase 39.1.9 - Magic Fix No-Loss Profiles', () => {
    let fixEngine;
    let preflight;
    let auditor;
    let autofix;

    before(() => {
        fixEngine = new PdfFixEngine();
        preflight = new PreflightEngine();
        auditor = new PdfArtifactDeltaAuditor();
        autofix = new AutofixExecutionEngine();
    });

    it('SAFE profile refuses CMYK', async () => {
        const res = await fixEngine.applyCmyk('input.pdf', 'output.pdf', 'iso_coated_v3.icc', { magicFixProfile: 'MAGIC_FIX_SAFE' });
        assert.strictEqual(res.success, false);
        assert.strictEqual(res.status, 'DESTRUCTIVE_FIX_REQUIRES_EXPLICIT_REVIEW_MODE');
        assert.strictEqual(res.requires_human_review, true);
    });

    it('DESTRUCTIVE_REVIEW profile allows CMYK and adds review fields', async () => {
        // We mock ghostscript runGs to avoid actual execution
        const ghostscript = require('../execution/Ghostscript');
        const origRunGs = ghostscript.runGs;
        ghostscript.runGs = async (args) => {
            const fs = require('fs-extra');
            const path = require('path');
            const outPath = args[args.indexOf('-o') + 1];
            await fs.ensureDir(path.dirname(outPath));
            await fs.writeFile(outPath, 'mock');
            return { ok: true };
        };

        const res = await fixEngine.applyCmyk('input.pdf', 'output.pdf', 'iso_coated_v3.icc', { magicFixProfile: 'MAGIC_FIX_DESTRUCTIVE_REVIEW' });
        assert.strictEqual(res.success, true);
        assert.strictEqual(res.requires_human_review, true);
        assert.strictEqual(res.production_certified, false);
        assert.ok(res.certification_blockers.includes('CONVERT_CMYK_REQUIRES_REVIEW'));
        assert.ok(res.ghostscript_args_sanitized.includes('-dDownsampleColorImages=false'));

        ghostscript.runGs = origRunGs;
    });

    it('Artifact delta detects size reduction', async () => {
        const fs = require('fs-extra');
        const origStat = fs.stat;
        fs.stat = async (path) => {
            if (path === 'original.pdf') return { size: 18269833 };
            if (path === 'fixed.pdf') return { size: 6733078 };
            return { size: 0 };
        };
        
        const origGetPdfInfo = auditor.getPdfInfo;
        auditor.getPdfInfo = async () => ({ pages: 1 });
        const origGetImagesInfo = auditor.getImagesInfo;
        auditor.getImagesInfo = async () => ([]);

        const delta = await auditor.audit('original.pdf', 'fixed.pdf', []);
        assert.strictEqual(delta.detected_significant_size_reduction, true);
        assert.ok(delta.certification_blockers.includes('SIGNIFICANT_FILE_SIZE_REDUCTION'));
        assert.strictEqual(delta.size_delta_percent, -63);

        fs.stat = origStat;
        auditor.getPdfInfo = origGetPdfInfo;
        auditor.getImagesInfo = origGetImagesInfo;
    });

    it('Artifact delta detects Flate to JPEG', async () => {
        const origGetImagesInfo = auditor.getImagesInfo;
        auditor.getImagesInfo = async (path) => {
            if (path === 'original.pdf') return [{ width: 100, height: 100, color: 'rgb', enc: 'flate' }];
            if (path === 'fixed.pdf') return [{ width: 100, height: 100, color: 'cmyk', enc: 'jpeg' }];
            return [];
        };

        const delta = await auditor.audit('original.pdf', 'fixed.pdf', []);
        assert.strictEqual(delta.detected_lossy_recompression, true);
        assert.ok(delta.certification_blockers.includes('LOSSY_IMAGE_RECOMPRESSION_DETECTED'));
        assert.ok(delta.certification_blockers.includes('COLORSPACE_CONVERSION_REQUIRES_REVIEW'));
        assert.strictEqual(delta.detected_downsampling, false);

        auditor.getImagesInfo = origGetImagesInfo;
    });
});
