// ppos-preflight-engine/src/core/RiskAnalyzer.ts
import { PreflightSpecs } from './PreflightEngine';

export class RiskAnalyzer {
    public analyze(specs: PreflightSpecs): string[] {
        const findings: string[] = [];

        if (specs.pageCount > 500) {
            findings.push('MAX_PAGE_COUNT_EXCEEDED');
        }

        if (specs.colorMode !== 'CMYK' && specs.colorMode !== 'GRAYSCALE') {
            findings.push('UNSUPPORTED_COLOR_PROFILE');
        }

        return findings;
    }
}
