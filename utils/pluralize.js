/**
 * Polish pluralization for "day".
 *
 * Polish has three grammatical number forms:
 *   1         → "dzień"  (singular)
 *   2-4       → "dni"    (paucal, also used for teens 12-14 and higher compounds)
 *   0, 5-21+  → "dni"    (plural)
 *
 * Since both paucal and plural map to "dni", a simple singular/other split
 * is sufficient for all positive integers used in this app (trial days remaining).
 */
const pluralizeDays = (count) => count === 1 ? 'dzień' : 'dni';

export { pluralizeDays };
