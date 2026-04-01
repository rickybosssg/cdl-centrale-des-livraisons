/**
 * Formate un montant monétaire au standard CDL : 1 000 F CFA
 * @param {number} n - montant en F CFA
 * @returns {string} - ex: "1 000 F CFA"
 */
export function fmt(n) {
  return `${(n || 0).toLocaleString('fr-FR')} F CFA`;
}