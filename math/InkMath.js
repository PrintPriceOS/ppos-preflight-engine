/**
 * InkMath
 * 
 * Calculations for Total Ink Coverage (TAC).
 */
class InkMath {
    calculateTac(c, m, y, k) {
        return Number((c + m + y + k).toFixed(2));
    }
}

module.exports = new InkMath();
