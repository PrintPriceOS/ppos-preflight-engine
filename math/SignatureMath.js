/**
 * SignatureMath
 * 
 * Imposition mathematics.
 */
class SignatureMath {
    getSignatureDecomposition(pageCount, signatureSize = 16) {
        const fullSigs = Math.floor(pageCount / signatureSize);
        const remainder = pageCount % signatureSize;

        return {
            full_signatures: fullSigs,
            remainder_pages: remainder,
            signature_size: signatureSize
        };
    }
}

module.exports = new SignatureMath();
