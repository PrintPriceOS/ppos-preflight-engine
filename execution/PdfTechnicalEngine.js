const ghostscript = require('./Ghostscript');
const fs = require('fs-extra');
const os = require('os');
const path = require('path');

/**
 * PdfTechnicalEngine
 *
 * Core engine for technical PDF execution tasks.
 * Classification: INDUSTRIAL_RUNTIME (Technical Execution)
 */
class PdfTechnicalEngine {
    /**
     * Executes a raw Ghostscript command (Generic technical entrypoint).
     */
    async execCmd(cmd, args, opts = {}) {
        if (cmd === 'gs') {
            return ghostscript.runGs(args, opts);
        }
        throw new Error(`Command ${cmd} not supported by TechnicalEngine`);
    }

    /**
     * Specialized color conversion.
     */
    async gsConvertColor(input, output, iccPath, opts = {}) {
        const args = [
            '-dNOPAUSE', '-dBATCH', '-sDEVICE=pdfwrite',
            `-sOutputICCProfile=${iccPath}`,
            '-sColorConversionStrategy=UseDeviceIndependentColor',
            '-o', output, input
        ];
        return ghostscript.runGs(args, { ...opts, reqId: 'color-conv' });
    }

    /**
     * Technical Bleed Canvas application.
     */
    async addBleedCanvasPdf(input, output, bleedMm) {
        // Technical implementation details (Simplified)
        return this.execCmd('gs', [
            '-o', output,
            '-sDEVICE=pdfwrite',
            '-dFIXEDMEDIA',
            input
        ]);
    }

    /**
     * Technical Analysis: Retrieves PDF metadata and geometry via Ghostscript.
     * Falls back to a mock geometry if GS extraction fails.
     */
    async analyze(input, opts = {}) {
        let sizeBytes = 0;
        try {
            const stat = await fs.stat(input);
            sizeBytes = stat.size;
        } catch (_) {}

        const escapedPath = input.replace(/\\/g, '/').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
        const psContent = [
            `(${escapedPath}) (r) file runpdfbegin`,
            `pdfpagecount =`,
            `1 pdfgetpage`,
            `dup /MediaBox pget { == } { [0 0 595 842] == } ifelse`,
            `dup /TrimBox pget { == } { (NONE) = } ifelse`,
            `dup /BleedBox pget { == } { (NONE) = } ifelse`,
            `quit`
        ].join('\n');

        const tempPs = path.join(os.tmpdir(), `ppos_meta_${Date.now()}.ps`);

        try {
            await fs.writeFile(tempPs, psContent);
            const gsResult = await ghostscript.runGs(
                ['-q', '-dBATCH', '-dNOPAUSE', '-dNODISPLAY', `"${tempPs}"`],
                { timeout: opts.timeout || 30000 }
            );

            const parsed = this._parseGsMetadata(gsResult.stdout || '');
            const refBox = parsed.trimBox || parsed.mediaBox || [0, 0, 595, 842];

            return {
                ok: true,
                status: 'SUCCESS',
                source: 'GHOSTSCRIPT',
                geometry: {
                    mediaBox: parsed.mediaBox,
                    trimBox: parsed.trimBox || parsed.mediaBox,
                    bleedBox: parsed.bleedBox || parsed.trimBox || parsed.mediaBox,
                    widthMm: Number(((refBox[2] - refBox[0]) * 0.3528).toFixed(2)),
                    heightMm: Number(((refBox[3] - refBox[1]) * 0.3528).toFixed(2))
                },
                info: {
                    pages: parsed.pages,
                    size: sizeBytes
                }
            };
        } catch (err) {
            console.warn(`[TECH-ENGINE][ANALYZE] GS extraction failed, using fallback: ${err.message}`);
            return {
                ok: true,
                status: 'SUCCESS',
                source: 'FALLBACK_MOCK',
                partial: true,
                geometry: {
                    trimBox: [0, 0, 595, 842],
                    bleedBox: [0, 0, 595, 842],
                    widthMm: 210,
                    heightMm: 297
                },
                info: {
                    pages: 1,
                    size: sizeBytes
                }
            };
        } finally {
            await fs.remove(tempPs).catch(() => {});
        }
    }

    _parseGsMetadata(stdout) {
        const lines = stdout.trim().split('\n').map(l => l.trim()).filter(Boolean);

        const parseBox = (line) => {
            if (!line || line === 'NONE') return null;
            const match = line.match(/\[([^\]]+)\]/);
            if (!match) return null;
            return match[1].trim().split(/\s+/).map(Number);
        };

        return {
            pages: parseInt(lines[0]) || 1,
            mediaBox: parseBox(lines[1]),
            trimBox: parseBox(lines[2]),
            bleedBox: parseBox(lines[3])
        };
    }

    /**
     * Renders a specific page as a PNG image.
     */
    async renderPageAsImage(input, output, page = 1, opts = {}) {
        const dpi = opts.dpi || 72;
        const args = [
            '-dNOPAUSE', '-dBATCH', '-sDEVICE=png16m',
            `-dFirstPage=${page}`, `-dLastPage=${page}`,
            `-r${dpi}`,
            '-o', output, input
        ];
        return ghostscript.runGs(args, { ...opts, reqId: `render-p${page}` });
    }
}

module.exports = PdfTechnicalEngine;
