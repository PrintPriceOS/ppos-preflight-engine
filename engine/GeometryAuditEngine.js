const { CODES } = require('../interpretation/IndustrialFindingCodes');

/**
 * GeometryAuditEngine
 * 
 * Pure industrial module for validating PDF geometry.
 * Classification: INDUSTRIAL_RUNTIME (Technical Interpretation)
 */
class GeometryAuditEngine {
    constructor(config = {}) {
        this.config = {
            minBleedMm: config.minBleedMm || 3.0,
            safeAreaMm: config.safeAreaMm || 5.0,
            standardSpinePerSheetMm: config.standardSpinePerSheetMm || 0.1
        };
    }

    /**
     * Technical Bleed Audit.
     * Only audits bleed dimensions if both TrimBox and BleedBox are defined.
     */
    auditBleed(geometry, pageNum = 1) {
        const { trimBox, bleedBox } = geometry;
        if (!trimBox || !bleedBox) return { code: null };

        // [x1, y1, x2, y2]
        const bleedTop = bleedBox[3] - trimBox[3];
        const bleedBottom = trimBox[1] - bleedBox[1];
        const bleedLeft = trimBox[0] - bleedBox[0];
        const bleedRight = bleedBox[2] - trimBox[2];

        const toMm = (pt) => pt * 0.3528;

        const bleed = {
            top: toMm(bleedTop),
            bottom: toMm(bleedBottom),
            left: toMm(bleedLeft),
            right: toMm(bleedRight)
        };

        const minBleed = this.config.minBleedMm;
        const isMissing = bleed.top <= 0.01 && bleed.bottom <= 0.01 && bleed.left <= 0.01 && bleed.right <= 0.01;
        const isInsufficient = !isMissing && (bleed.top < minBleed || bleed.bottom < minBleed || bleed.left < minBleed || bleed.right < minBleed);

        let code = null;
        if (isMissing) code = CODES.GEOM_BLEED_MISSING;
        else if (isInsufficient) code = CODES.GEOM_BLEED_INSUFFICIENT;

        return {
            code,
            page: pageNum,
            severity: code ? 'warning' : null,
            analyzer: 'GeometryAuditEngine',
            confidence: 0.98,
            message: code === CODES.GEOM_BLEED_MISSING ? 'Bleed Zone Missing' : 'Insufficient Bleed',
            context: {
                bleedMm: bleed,
                thresholdMm: minBleed,
                is_valid: !code
            }
        };
    }

    /**
     * Document Classification (Technical Interpretation).
     */
    classifyDocument(geometry, pageCount) {
        const { trimBox } = geometry;
        if (!trimBox) return { code: CODES.TYPE_UNKNOWN, page: 1, severity: 'info', analyzer: 'GeometryAuditEngine', confidence: 0.98, context: { pageCount } };

        const widthMm = (trimBox[2] - trimBox[0]) * 0.3528;
        const heightMm = (trimBox[3] - trimBox[1]) * 0.3528;

        let typeCode = CODES.TYPE_FLYER;
        let spineMm = 0;

        const estimSpine = (pages) => (pages / 2) * (this.config.standardSpinePerSheetMm * 2);

        if (pageCount === 1) {
            if (widthMm > 300 || heightMm > 400) typeCode = CODES.TYPE_POSTER;
            else typeCode = CODES.TYPE_FLYER;
        } else if (pageCount <= 8) {
            typeCode = CODES.TYPE_BROCHURE;
        } else if (pageCount > 40) {
            typeCode = CODES.TYPE_BOOK_INTERIOR;
            spineMm = estimSpine(pageCount);
        } else {
            typeCode = CODES.TYPE_MAGAZINE;
            spineMm = estimSpine(pageCount);
        }

        return {
            code: typeCode,
            page: 1,
            severity: 'info',
            analyzer: 'GeometryAuditEngine',
            confidence: 0.98,
            context: {
                spineMm: Number(spineMm.toFixed(3)),
                widthMm: Number(widthMm.toFixed(2)),
                heightMm: Number(heightMm.toFixed(2)),
                pageCount
            }
        };
    }

    /**
     * Technical Geometry Audit.
     * Validates TrimBox vs MediaBox and checks BleedBox existence per page.
     */
    auditGeometry(geometry, pageNum = 1) {
        const { trimBox, mediaBox, bleedBox } = geometry;
        const findings = [];

        if (!trimBox) {
            findings.push({ 
                code: CODES.GEOM_TRIMBOX_MISSING, 
                page: pageNum,
                severity: 'error',
                analyzer: 'GeometryAuditEngine',
                confidence: 0.98,
                message: 'TrimBox Not Defined',
                context: { confidence: 0.95, fixRequired: true, safeToAutofix: true, destructiveFixRisk: "LOW" } 
            });
        } else {
            const isFinite = (box) => box && box.every(n => typeof n === 'number' && Number.isFinite(n));
            const hasPositiveArea = (box) => box && (box[2] - box[0]) > 0 && (box[3] - box[1]) > 0;

            if (!isFinite(trimBox) || !hasPositiveArea(trimBox)) {
                findings.push({ 
                    code: CODES.GEOM_TRIMBOX_INVALID, 
                    page: pageNum,
                    severity: 'error',
                    analyzer: 'GeometryAuditEngine',
                    confidence: 0.98,
                    message: 'Invalid TrimBox Dimensions',
                    context: { confidence: 0.95, fixRequired: true, safeToAutofix: true, destructiveFixRisk: "LOW" } 
                });
            }

            if (mediaBox && isFinite(mediaBox)) {
                const isOutside = trimBox[0] < mediaBox[0] || trimBox[1] < mediaBox[1] || 
                                 trimBox[2] > mediaBox[2] || trimBox[3] > mediaBox[3];
                
                if (isOutside) {
                    findings.push({ 
                        code: CODES.GEOM_TRIMBOX_OUTSIDE_MEDIABOX, 
                        page: pageNum,
                        severity: 'error',
                        analyzer: 'GeometryAuditEngine',
                        confidence: 0.98,
                        message: 'TrimBox Extends Outside MediaBox',
                        context: { confidence: 0.95, fixRequired: true, safeToAutofix: true, destructiveFixRisk: "LOW" } 
                    });
                }
            }
        }

        if (!bleedBox) {
            findings.push({
                code: CODES.GEOM_BLEEDBOX_MISSING,
                page: pageNum,
                severity: 'warning',
                analyzer: 'GeometryAuditEngine',
                confidence: 0.98,
                message: 'BleedBox Not Defined',
                context: { confidence: 0.95, fixRequired: false, safeToAutofix: true, destructiveFixRisk: "MEDIUM" }
            });
        }

        return findings;
    }

    /**
     * Unified analyze entrypoint for PreflightEngine.
     * Performs multi-page geometry consistency audits.
     */
    async analyze(filePath, options = {}) {
        const metadata = options.metadata || {};
        const geometry = metadata.geometry || {};
        const pageCount = metadata.pages || 0;

        const findings = [];
        const pages = Array.isArray(geometry.pages) && geometry.pages.length > 0 
            ? geometry.pages 
            : [{ page: 1, trimBox: geometry.trimBox, bleedBox: geometry.bleedBox, mediaBox: geometry.mediaBox }];

        for (const pageGeom of pages) {
            const pageNum = pageGeom.page || 1;
            const geomFindings = this.auditGeometry(pageGeom, pageNum);
            findings.push(...geomFindings);

            const bleedResult = this.auditBleed(pageGeom, pageNum);
            if (bleedResult && bleedResult.code) {
                findings.push(bleedResult);
            }
        }

        if (pages.length > 1) {
            let firstWidth = null;
            let firstHeight = null;
            let inconsistent = false;
            let firstOrientation = null;
            let mixedOrientation = false;

            for (const p of pages) {
                const box = p.trimBox || p.mediaBox;
                if (box && box.length === 4) {
                    const w = Number(((box[2] - box[0]) * 0.3528).toFixed(1));
                    const h = Number(((box[3] - box[1]) * 0.3528).toFixed(1));
                    const orient = w > h ? 'landscape' : 'portrait';

                    if (firstWidth === null) {
                        firstWidth = w;
                        firstHeight = h;
                        firstOrientation = orient;
                    } else {
                        if (Math.abs(w - firstWidth) > 1.0 || Math.abs(h - firstHeight) > 1.0) {
                            inconsistent = true;
                        }
                        if (orient !== firstOrientation) {
                            mixedOrientation = true;
                        }
                    }
                }
            }

            if (inconsistent) {
                findings.push({
                    code: CODES.GEOM_PAGE_SIZE_INCONSISTENT,
                    page: null,
                    severity: 'warning',
                    analyzer: 'GeometryAuditEngine',
                    confidence: 0.98,
                    message: 'Inconsistent Page Sizes Detected',
                    context: { message: 'Pages have inconsistent dimensions' }
                });
            }

            if (mixedOrientation) {
                findings.push({
                    code: CODES.GEOM_MIXED_PAGE_ORIENTATION,
                    page: null,
                    severity: 'warning',
                    analyzer: 'GeometryAuditEngine',
                    confidence: 0.98,
                    message: 'Mixed Page Orientation Detected',
                    context: { message: 'Document contains both landscape and portrait pages' }
                });
            }
        }

        // Page rotation detection (Eliminated filename heuristics)
        const strContext = `${metadata.toolOutputs?.pdfinfo || ''} ${metadata.toolOutputs?.mutool || ''}`.toLowerCase();
        const isRotated = strContext.includes('rotate') || strContext.includes('/rotate ');
        if (isRotated) {
            findings.push({
                code: CODES.GEOM_PAGE_ROTATION_DETECTED,
                page: 1,
                severity: 'warning',
                analyzer: 'GeometryAuditEngine',
                confidence: 0.98,
                message: 'Page Rotation Detected',
                context: { message: 'Document page has explicit rotation attribute' },
                evidence: {
                    tool: 'pdfinfo / mutool',
                    source: metadata.source || 'CLI_PROBE',
                    page: 1,
                    confidence: 0.98,
                    raw: 'Explicit rotation attribute detected in tool metadata'
                }
            });
        }

        const firstPageGeom = pages[0] || geometry;
        const typeResult = this.classifyDocument(firstPageGeom, pageCount);

        return { findings, metadata: { geometry, pageCount, documentType: typeResult } };
    }
}

module.exports = GeometryAuditEngine;
