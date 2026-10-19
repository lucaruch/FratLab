const assert = require('node:assert/strict');
require('../dist/music.js');
const M = globalThis.Music;
let checks = 0;
for (let root = 0; root < 12; root++) {
  for (const [symbol, , intervals] of M.chords) {
    const notes = intervals.map(i => 60 + M.mod(root + i));
    assert(M.analyze(notes, root).chords.some(c => c.root === root && c.symbol === symbol));
    checks++;
  }
  for (const [label, intervals] of M.scales) {
    const notes = intervals.map(i => 60 + M.mod(root + i));
    assert(M.analyze(notes, root).exact.some(s => s.label === label));
    checks++;
  }
}
const inversion = M.analyze([52,55,60]).chords[0];
assert.equal(inversion.root, 0);
assert.equal(inversion.bass, 4);
assert.equal(M.analyze([60,64,67]).exact.length, 0);
assert(M.analyze([60,64,67]).compatible.length > 0);
assert.equal(M.analyze([60,61,62]).chords.length, 0);
console.log(`${checks + 5} musical checks passed.`);
