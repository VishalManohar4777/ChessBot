/* Verify chess.js move generation against known perft values.
 * Run:  node test_perft.js
 * All five depths should print "OK".
 */
const C = require("./chess.js");

const cases = [
  [C.startPosition(), [1, 20, 400, 8902, 197281, 4865609]]
];

let allOk = true;
for (const [state, expected] of cases) {
  for (let d = 1; d < expected.length; d++) {
    const got = C.perft(state, d);
    const ok = got === expected[d];
    if (!ok) allOk = false;
    console.log(`perft(${d}) = ${got}  expected ${expected[d]}  ${ok ? "OK" : "FAIL"}`);
  }
}
console.log(allOk ? "\nAll perft checks passed." : "\nPERFT MISMATCH — rules bug!");
process.exit(allOk ? 0 : 1);
