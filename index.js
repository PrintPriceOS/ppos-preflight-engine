/**
 * PrintPrice OS — Preflight Engine
 * 
 * Canonical Entry Point.
 */
const PreflightEngine = require('./core/PreflightEngine');
const GeometryAuditEngine = require('./engine/GeometryAuditEngine');
const GeometryAnalyzer = require('./analyzers/GeometryAnalyzer');
const ColorAnalyzer = require('./analyzers/ColorAnalyzer');
const FontAnalyzer = require('./analyzers/FontAnalyzer');
const ImageAnalyzer = require('./analyzers/ImageAnalyzer');
const TransparencyAnalyzer = require('./analyzers/TransparencyAnalyzer');
const OverprintAnalyzer = require('./analyzers/OverprintAnalyzer');
const MarkAnalyzer = require('./analyzers/MarkAnalyzer');
const PdfIntegrityAnalyzer = require('./analyzers/PdfIntegrityAnalyzer');
const HeuristicAnalyzer = require('./analyzers/HeuristicAnalyzer');
const TechnicalEngine = require('./execution/PdfTechnicalEngine');
const AutofixExecutionEngine = require('./execution/AutofixExecutionEngine');
const MagicFixEngine = require('./engine/MagicFixEngine');
const FixPlanner = require('./fixes/FixPlanner');
const SpineCalculator = require('./engine/SpineCalculator');
const { CODES: FindingCodes } = require('./interpretation/IndustrialFindingCodes');

// Pre-configured "Standard" Industrial Engine
const createStandardEngine = () => {
    return new PreflightEngine([
        new GeometryAnalyzer(),
        new ColorAnalyzer(),
        new FontAnalyzer(),
        new ImageAnalyzer(),
        new TransparencyAnalyzer(),
        new OverprintAnalyzer(),
        new PdfIntegrityAnalyzer(),
        new MarkAnalyzer(),
        new HeuristicAnalyzer()
    ]);
};

module.exports = {
    PreflightEngine,
    createStandardEngine,
    FixPlanner,
    GeometryAuditEngine,
    GeometryAnalyzer,
    ColorAnalyzer,
    FontAnalyzer,
    ImageAnalyzer,
    TransparencyAnalyzer,
    OverprintAnalyzer,
    PdfIntegrityAnalyzer,
    MarkAnalyzer,
    SpineCalculator,
    FindingCodes,
    AutofixExecutionEngine,
    MagicFixEngine,
    AutofixCommand: require('./src/runtime/commands/autofixCommand'),
    PdfTechnicalEngine: TechnicalEngine,
    analyzers: {
        Geometry: GeometryAnalyzer,
        Color: ColorAnalyzer,
        Font: FontAnalyzer,
        Image: ImageAnalyzer,
        Transparency: TransparencyAnalyzer,
        Overprint: OverprintAnalyzer,
        Integrity: PdfIntegrityAnalyzer,
        Mark: MarkAnalyzer,
        Heuristic: HeuristicAnalyzer
    },
    execution: {
        Technical: TechnicalEngine,
        Fix: require('./execution/PdfFixEngine'),
        Autofix: AutofixExecutionEngine
    }
};
