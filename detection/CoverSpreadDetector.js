/**
 * CoverSpreadDetector
 * 
 * Heuristics to detect cover spreads from PDF dimensions.
 */
class CoverSpreadDetector {
    detect(geometry) {
        if (!geometry) return { isSpreadLikely: false, confidence: 0 };

        const aspect = geometry.widthMm / geometry.heightMm;
        const isSpread = aspect > 1.5; // Simple heuristic: wide aspect ratio

        return {
            isSpreadLikely: isSpread,
            aspectRatio: Number(aspect.toFixed(2)),
            confidence: isSpread ? 0.9 : 0.5,
            sourceType: 'HEURISTIC_GEOMETRY'
        };
    }
}

module.exports = new CoverSpreadDetector();
