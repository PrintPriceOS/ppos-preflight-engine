/**
 * @ppos/preflight-engine
 * Standalone Product Kernel Entrypoint
 */

const SpineCalculator = require('./engine/SpineCalculator');
const GeometryAuditEngine = require('./engine/GeometryAuditEngine');
const InkMath = require('./math/InkMath');
const SignatureMath = require('./math/SignatureMath');
const SpineEngine = require('./math/SpineEngine');
const PdfFixEngine = require('./execution/PdfFixEngine');
const PdfTechnicalEngine = require('./execution/PdfTechnicalEngine');
const AutofixExecutionEngine = require('./execution/AutofixExecutionEngine');
const Ghostscript = require('./execution/Ghostscript');
const SignatureEngine = require('./execution/SignatureEngine');
const CoverSpreadDetector = require('./detection/CoverSpreadDetector');
const { CODES: FindingCodes } = require('./interpretation/industrialFindingCodes');

module.exports = {
    // Technical Engines
    GeometryAuditEngine,
    SpineCalculator,
    SignatureEngine,

    // Execution Hubs
    PdfTechnicalEngine,
    PdfFixEngine,
    AutofixExecutionEngine,

    // Core Utilities
    Ghostscript,
    CoverSpreadDetector,

    // Math Kernels
    InkMath,
    SignatureMath,
    SpineEngine,

    // Constants & Contracts
    FindingCodes
};
