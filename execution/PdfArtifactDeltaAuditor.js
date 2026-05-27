const fs = require('fs-extra');
const { execFile } = require('child_process');
const util = require('util');
const execFileAsync = util.promisify(execFile);

/**
 * PdfArtifactDeltaAuditor
 * 
 * Compares original and fixed PDFs to detect destructive changes
 * like downsampling, recompression, or significant size changes.
 */
class PdfArtifactDeltaAuditor {
    constructor() {
        this.missingTools = [];
    }

    async runProbe(bin, args) {
        try {
            const { stdout } = await execFileAsync(bin, args, { timeout: 10000 });
            return stdout;
        } catch (err) {
            const isNotInstalled = err.code === 'ENOENT' || (err.message && err.message.includes('ENOENT'));
            if (isNotInstalled && !this.missingTools.includes(bin)) {
                this.missingTools.push(bin);
            }
            return null;
        }
    }

    parsePdfImagesList(stdout) {
        if (!stdout) return [];
        const lines = stdout.split('\n').map(l => l.trim()).filter(Boolean);
        const images = [];
        // format of pdfimages -list:
        // page   num  type   width height color comp bpc  enc interp  object ID x-ppi y-ppi size ratio
        // skip headers (first 2 lines typically, look for '---')
        let inData = false;
        for (const line of lines) {
            if (line.startsWith('---')) {
                inData = true;
                continue;
            }
            if (!inData) continue;
            const parts = line.split(/\s+/);
            if (parts.length >= 10) {
                images.push({
                    width: parseInt(parts[3], 10) || 0,
                    height: parseInt(parts[4], 10) || 0,
                    color: parts[5],
                    enc: parts[8]
                });
            }
        }
        return images;
    }

    async getFallbackPageCount(filePath) {
        try {
            const { PDFDocument } = require('pdf-lib');
            const bytes = await fs.readFile(filePath);
            const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
            return pdfDoc.getPageCount();
        } catch (err) {
            return -1;
        }
    }

    async getPdfInfo(filePath) {
        let pages = -1;
        const stdout = await this.runProbe('pdfinfo', [filePath]);
        if (stdout) {
            const match = stdout.match(/Pages:\s+(\d+)/i);
            if (match && match[1]) {
                pages = parseInt(match[1], 10);
            }
        } else {
            pages = await this.getFallbackPageCount(filePath);
        }
        return { pages };
    }

    async getImagesInfo(filePath) {
        const stdout = await this.runProbe('pdfimages', ['-list', filePath]);
        return this.parsePdfImagesList(stdout);
    }

    async audit(originalPath, fixedPath, appliedRepairs = []) {
        this.missingTools = [];
        const delta = {
            delta_audit_degraded: false,
            original_size_bytes: 0,
            fixed_size_bytes: 0,
            size_delta_bytes: 0,
            size_delta_percent: 0,
            page_count_before: -1,
            page_count_after: -1,
            image_count_before: 0,
            image_count_after: 0,
            image_encoding_changes: false,
            image_colorspace_changes: false,
            image_dimension_changes: false,
            detected_lossy_recompression: false,
            detected_downsampling: false,
            detected_page_count_change: false,
            detected_significant_size_reduction: false,
            detected_significant_size_increase: false,
            certification_blockers: [],
            requires_human_review: false,
            production_certified: true
        };

        try {
            const origStat = await fs.stat(originalPath);
            const fixedStat = await fs.stat(fixedPath);
            delta.original_size_bytes = origStat.size;
            delta.fixed_size_bytes = fixedStat.size;
            delta.size_delta_bytes = delta.fixed_size_bytes - delta.original_size_bytes;
            if (delta.original_size_bytes > 0) {
                delta.size_delta_percent = Math.round((delta.size_delta_bytes / delta.original_size_bytes) * 100);
            }
        } catch (e) {
            // ignore
        }

        const origInfo = await this.getPdfInfo(originalPath);
        const fixedInfo = await this.getPdfInfo(fixedPath);
        delta.page_count_before = origInfo.pages;
        delta.page_count_after = fixedInfo.pages;

        const origImages = await this.getImagesInfo(originalPath);
        const fixedImages = await this.getImagesInfo(fixedPath);
        delta.image_count_before = origImages.length;
        delta.image_count_after = fixedImages.length;

        if (this.missingTools.length > 0) {
            delta.delta_audit_degraded = true;
            delta.missing_tools = this.missingTools;
        }

        if (delta.size_delta_percent <= -20) {
            delta.detected_significant_size_reduction = true;
            delta.certification_blockers.push('SIGNIFICANT_FILE_SIZE_REDUCTION');
        } else if (delta.size_delta_percent >= 50) {
            delta.detected_significant_size_increase = true;
            delta.certification_blockers.push('SIGNIFICANT_FILE_SIZE_INCREASE');
        }

        if (delta.page_count_before !== -1 && delta.page_count_after !== -1 && delta.page_count_before !== delta.page_count_after) {
            delta.detected_page_count_change = true;
            delta.certification_blockers.push('PAGE_COUNT_CHANGED');
        }

        if (origImages.length > 0 || fixedImages.length > 0) {
            if (origImages.length !== fixedImages.length) {
                delta.certification_blockers.push('IMAGE_COUNT_CHANGED');
            } else {
                for (let i = 0; i < origImages.length; i++) {
                    const origImg = origImages[i];
                    const fixedImg = fixedImages[i];
                    
                    if (origImg.width > fixedImg.width || origImg.height > fixedImg.height) {
                        delta.image_dimension_changes = true;
                        delta.detected_downsampling = true;
                        if (!delta.certification_blockers.includes('IMAGE_DOWNSAMPLING_DETECTED')) {
                            delta.certification_blockers.push('IMAGE_DOWNSAMPLING_DETECTED');
                        }
                    }

                    const isOrigLossless = origImg.enc && origImg.enc.toLowerCase().includes('flate');
                    const isFixedLossy = fixedImg.enc && (fixedImg.enc.toLowerCase().includes('jpeg') || fixedImg.enc.toLowerCase().includes('dct'));
                    if (isOrigLossless && isFixedLossy) {
                        delta.image_encoding_changes = true;
                        delta.detected_lossy_recompression = true;
                        if (!delta.certification_blockers.includes('LOSSY_IMAGE_RECOMPRESSION_DETECTED')) {
                            delta.certification_blockers.push('LOSSY_IMAGE_RECOMPRESSION_DETECTED');
                        }
                    }

                    if (origImg.color && fixedImg.color && origImg.color.toLowerCase() !== fixedImg.color.toLowerCase()) {
                        delta.image_colorspace_changes = true;
                        if (origImg.color.toLowerCase() === 'rgb' && fixedImg.color.toLowerCase() === 'cmyk') {
                            if (!delta.certification_blockers.includes('COLORSPACE_CONVERSION_REQUIRES_REVIEW')) {
                                delta.certification_blockers.push('COLORSPACE_CONVERSION_REQUIRES_REVIEW');
                            }
                        }
                    }
                }
            }
        }

        for (const repair of appliedRepairs) {
            if (repair.destructiveFixRisk === 'HIGH') {
                if (!delta.certification_blockers.includes('DESTRUCTIVE_REWRITE_REQUIRES_REVIEW')) {
                    delta.certification_blockers.push('DESTRUCTIVE_REWRITE_REQUIRES_REVIEW');
                }
            }
        }

        if (delta.certification_blockers.length > 0) {
            delta.requires_human_review = true;
            delta.production_certified = false;
        }

        return delta;
    }
}

module.exports = PdfArtifactDeltaAuditor;
