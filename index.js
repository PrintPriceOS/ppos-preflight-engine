/**
 * PrintPrice OS — Preflight Engine
 * 
 * Canonical Entry Point.
 */
const PreflightEngine = require('./core/PreflightEngine');
const GeometryAnalyzer = require('./engine/GeometryAuditEngine');
const HeuristicAnalyzer = require('./analyzers/HeuristicAnalyzer');
const TechnicalEngine = require('./execution/PdfTechnicalEngine');
const FixPlanner = require('./fixes/FixPlanner');

// Pre-configured "Standard" Industrial Engine
const createStandardEngine = () => {
    return new PreflightEngine([
        new GeometryAnalyzer(),
        new HeuristicAnalyzer()
    ]);
};

module.exports = {
    PreflightEngine,
    createStandardEngine,
    FixPlanner,
    analyzers: {
        Geometry: require('./engine/GeometryAuditEngine'),
        Heuristic: require('./analyzers/HeuristicAnalyzer')
    },
    execution: {
        Technical: require('./execution/PdfTechnicalEngine'),
        Fix: require('./execution/PdfFixEngine')
    }
};
