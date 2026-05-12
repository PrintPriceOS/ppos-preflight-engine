/**
 * PrintPrice OS — Preflight Engine
 * 
 * Canonical Entry Point.
 */
const PreflightEngine = require('./core/PreflightEngine');
const GeometryAuditEngine = require('./engine/GeometryAuditEngine');
const ColorAnalyzer = require('./analyzers/ColorAnalyzer');
const FontAnalyzer = require('./analyzers/FontAnalyzer');
const ImageAnalyzer = require('./analyzers/ImageAnalyzer');
const TransparencyAnalyzer = require('./analyzers/TransparencyAnalyzer');
const OverprintAnalyzer = require('./analyzers/OverprintAnalyzer');
const MarkAnalyzer = require('./analyzers/MarkAnalyzer');
const HeuristicAnalyzer = require('./analyzers/HeuristicAnalyzer');
const TechnicalEngine = require('./execution/PdfTechnicalEngine');
const AutofixExecutionEngine = require('./execution/AutofixExecutionEngine');
const FixPlanner = require('./fixes/FixPlanner');
const SpineCalculator = require('./engine/SpineCalculator');
const { CODES: FindingCodes } = require('./interpretation/IndustrialFindingCodes');

// Pre-configured "Standard" Industrial Engine
const createStandardEngine = () => {
    return new PreflightEngine([
        new GeometryAuditEngine(),
        new ColorAnalyzer(),
        new FontAnalyzer(),
        new ImageAnalyzer(),
        new TransparencyAnalyzer(),
        new OverprintAnalyzer(),
        new MarkAnalyzer(),
        new HeuristicAnalyzer()
    ]);
};

module.exports = {
    PreflightEngine,
    createStandardEngine,
    FixPlanner,
    GeometryAuditEngine,
    ColorAnalyzer,
    FontAnalyzer,
    ImageAnalyzer,
    TransparencyAnalyzer,
    OverprintAnalyzer,
    MarkAnalyzer,
    SpineCalculator,
    FindingCodes,
    AutofixExecutionEngine,
    PdfTechnicalEngine: TechnicalEngine,
    analyzers: {
        Geometry: GeometryAuditEngine,
        Color: ColorAnalyzer,
        Font: FontAnalyzer,
        Image: ImageAnalyzer,
        Transparency: TransparencyAnalyzer,
        Overprint: OverprintAnalyzer,
        Mark: MarkAnalyzer,
        Heuristic: HeuristicAnalyzer
    },
    execution: {
        Technical: TechnicalEngine,
        Fix: require('./execution/PdfFixEngine'),
        Autofix: AutofixExecutionEngine
    }
};
