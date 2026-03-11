/**
 * SignatureEngine
 * 
 * Technical evaluation of signature imposition and page counts.
 */
class SignatureEngine {
    evaluateSignatureImposition(input) {
        const { pageCount, bindingType, trimWidthMm, trimHeightMm } = input;

        const findings = [];
        const isMultipleOf4 = pageCount % 4 === 0;

        if (bindingType === 'saddle' && !isMultipleOf4) {
            findings.push({
                code: 'SIGNATURE_NOT_DIVISIBLE_BY_4',
                severity: 'error',
                message: `Saddle-stitched documents must be multiples of 4 pages. Found ${pageCount}.`
            });
        }

        return {
            pageCount,
            isMultipleOf4,
            findings
        };
    }
}

module.exports = new SignatureEngine();
