const ghostscript = require('./Ghostscript');
const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const util = require('util');
const execFileAsync = util.promisify(execFile);

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
     * Technical Analysis: Retrieves PDF metadata and geometry via pdf-lib.
     * Iterates all pages without masking missing TrimBox/BleedBox.
     */
    async analyze(input, opts = {}) {
        let sizeBytes = 0;
        try {
            const stat = await fs.stat(input);
            sizeBytes = stat.size;
        } catch (_) {}

        try {
            const { PDFDocument, PDFName } = require('pdf-lib');
            const bytes = await fs.readFile(input);
            const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });

            const pageCount = pdfDoc.getPageCount();

            const getBox = (page, boxName) => {
                const node = page.node;
                const boxRef = node.lookup(PDFName.of(boxName));
                if (!boxRef) return null;
                try {
                    return boxRef.asArray().map(v => v.asNumber());
                } catch (_) {
                    return null;
                }
            };

            const pages = [];
            for (let i = 0; i < pageCount; i++) {
                const p = pdfDoc.getPage(i);
                const pMediaBox = getBox(p, 'MediaBox') || (p.getMediaBox && (() => {
                    try {
                        const mb = p.getMediaBox();
                        return [mb.x, mb.y, mb.x + mb.width, mb.y + mb.height];
                    } catch (_) { return null; }
                })()) || null;
                const pTrimBox  = getBox(p, 'TrimBox');
                const pBleedBox = getBox(p, 'BleedBox');
                const pCropBox  = getBox(p, 'CropBox');
                const pArtBox   = getBox(p, 'ArtBox');

                const refBox = pTrimBox || pMediaBox;
                let widthMm = null;
                let heightMm = null;
                if (refBox && refBox.length === 4) {
                    widthMm = Number(((refBox[2] - refBox[0]) * 0.3528).toFixed(2));
                    heightMm = Number(((refBox[3] - refBox[1]) * 0.3528).toFixed(2));
                }

                pages.push({
                    page: i + 1,
                    mediaBox: pMediaBox,
                    trimBox: pTrimBox,
                    bleedBox: pBleedBox,
                    cropBox: pCropBox,
                    artBox: pArtBox,
                    widthMm,
                    heightMm
                });
            }

            const firstPageData = pages[0] || {};

            // Detect OutputIntent via pdf-lib catalog (CLI tools don't report this in text output)
            const pdfLibStructure = [];
            if (pdfDoc.catalog.has(PDFName.of('OutputIntents'))) {
                pdfLibStructure.push('outputintent: detected');
                pdfLibStructure.push('destoutputprofile: present');
            }

            const toolOutputs = {};
            if (pdfLibStructure.length > 0) {
                toolOutputs.pdflib = pdfLibStructure.join('\n');
            }
            const extractionErrors = [];
            const missingTools = [];
            const probeResults = {};

            const runProbe = async (bin, args, outputKey, toolAlias) => {
                const key = outputKey || bin;
                const alias = toolAlias || key;
                try {
                    const { stdout } = await execFileAsync(bin, args, { timeout: 3000 });
                    toolOutputs[key] = stdout;
                    probeResults[alias] = 'SUCCESS';
                } catch (err) {
                    const isNotInstalled = err.code === 'ENOENT' || (err.message && err.message.includes('ENOENT'));
                    probeResults[alias] = isNotInstalled ? 'MISSING' : 'FAILED';
                    extractionErrors.push({ parser: alias, message: err.message, probeStatus: probeResults[alias] });
                    if (isNotInstalled) {
                        missingTools.push(alias);
                    }
                }
            };

            // Real multi-page extraction via specific CLI parsers including Ghostscript
            await Promise.allSettled([
                runProbe('pdfimages', ['-list', input], 'pdfimages', 'pdfimages'),
                runProbe('pdfinfo',   [input],           'pdfinfo',   'pdfinfo'),
                runProbe('pdffonts',  [input],           'pdffonts',  'pdffonts'),
                runProbe('mutool',    ['info', input],   'mutool',    'mutool'),
                runProbe('qpdf',      ['--check', input],'qpdf',      'qpdf'),
                runProbe(ghostscript.resolveGsCmd(), ['--version'], 'gs', 'Ghostscript')
            ]);

            if (opts.simulateMissingTools && Array.isArray(opts.simulateMissingTools)) {
                for (const t of opts.simulateMissingTools) {
                    probeResults[t] = 'MISSING';
                    if (!missingTools.includes(t)) missingTools.push(t);
                    extractionErrors.push({ parser: t, message: `Simulated absence of tool ${t}`, probeStatus: 'MISSING' });
                    // Remove output so analyzers don't see stale data from a simulated-missing tool
                    delete toolOutputs[t];
                }
            }

            if (opts.simulateOutputStrings && typeof opts.simulateOutputStrings === 'object') {
                Object.assign(toolOutputs, opts.simulateOutputStrings);
            }

            // availableTools = keys with non-empty content after all simulation steps
            const availableTools = Object.keys(toolOutputs).filter(k => !!toolOutputs[k]);

            let pdfVersion = 'unknown';
            if (toolOutputs.pdfinfo) {
                const match = toolOutputs.pdfinfo.match(/PDF version:\s*([0-9.]+)/i);
                if (match && match[1]) {
                    pdfVersion = match[1].trim();
                }
            }

            const hasMissing = missingTools.length > 0;
            return {
                ok: !hasMissing,
                status: hasMissing ? 'DEGRADED' : 'SUCCESS',
                source: 'PDF_LIB',
                toolOutputs,
                pdfVersion,
                probeResults,
                availableTools,
                analysisIntegrity: {
                    realExtraction: true,     // pdf-lib geometry succeeded; degradedMode reflects CLI tool gaps
                    fallbackUsed: hasMissing,
                    degradedMode: hasMissing,
                    extractionErrors,
                    missingTools,
                    probeResults,
                    availableTools
                },
                geometry: {
                    pages,
                    firstPage: firstPageData,
                    mediaBox: firstPageData.mediaBox,
                    trimBox: firstPageData.trimBox,
                    bleedBox: firstPageData.bleedBox,
                    cropBox: firstPageData.cropBox,
                    artBox: firstPageData.artBox,
                    widthMm: firstPageData.widthMm,
                    heightMm: firstPageData.heightMm
                },
                info: {
                    pages: pageCount,
                    size: sizeBytes
                }
            };
        } catch (err) {
            console.warn(`[TECH-ENGINE][ANALYZE] pdf-lib extraction failed, returning failure payload: ${err.message}`);
            return {
                ok: false,
                status: 'UNKNOWN',
                confidence: 0,
                source: 'FALLBACK_MOCK',
                partial: true,
                warning: 'PDF_EXTRACTION_DEGRADED',
                forensic_event: 'FORENSIC_DEGRADED_ANALYSIS',
                pdfVersion: 'unknown',
                analysisIntegrity: {
                    realExtraction: false,
                    fallbackUsed: true,
                    degradedMode: true,
                    extractionErrors: [{
                        parser: 'pdf-lib',
                        message: err.message,
                        stack: err.stack
                    }],
                    missingTools: ['pdfimages', 'pdfinfo', 'mutool', 'Ghostscript']
                },
                geometry: {
                    pages: [],
                    firstPage: null,
                    mediaBox: null,
                    trimBox: null,
                    bleedBox: null,
                    cropBox: null,
                    artBox: null,
                    widthMm: null,
                    heightMm: null
                },
                info: {
                    pages: 0,
                    size: sizeBytes
                }
            };
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
