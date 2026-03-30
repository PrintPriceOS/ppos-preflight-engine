/**
 * PrintPrice OS — Preflight Engine
 * 
 * Canonical Entry Point.
 */
const PreflightEngine = require('./core/PreflightEngine');
const GeometryAuditEngine = require('./engine/GeometryAuditEngine');
const HeuristicAnalyzer = require('./analyzers/HeuristicAnalyzer');
const TechnicalEngine = require('./execution/PdfTechnicalEngine');
const FixPlanner = require('./fixes/FixPlanner');
const SpineCalculator = require('./engine/SpineCalculator');
const { CODES: FindingCodes } = require('./interpretation/IndustrialFindingCodes');

// Pre-configured "Standard" Industrial Engine
const createStandardEngine = () => {
    return new PreflightEngine([
        new GeometryAuditEngine(),
        new HeuristicAnalyzer()
    ]);
};

module.exports = {
    PreflightEngine,
    createStandardEngine,
    FixPlanner,
    GeometryAuditEngine,
    SpineCalculator,
    FindingCodes,
    analyzers: {
        Geometry: GeometryAuditEngine,
        Heuristic: HeuristicAnalyzer
    },
    execution: {
        Technical: TechnicalEngine,
        Fix: require('./execution/PdfFixEngine')
    }
};
