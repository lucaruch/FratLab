const assert = require("node:assert/strict");
require("../dist/music.js");
require("../dist/practice.js");
const P = globalThis.Practice,
  M = globalThis.Music;
let checks = 0;
for (let root = 0; root < 12; root++)
  for (const mode of ["major", "minor"]) {
    const field = P.harmonicField(root, mode);
    assert.equal(field.length, 7);
    for (const chord of field) {
      assert(
        M.analyze(
          chord.intervals.map((i) => 60 + M.mod(chord.root + i)),
          chord.root,
        ).chords.some(
          (c) => c.symbol === chord.quality && c.root === chord.root,
        ),
      );
      checks++;
    }
  }
for (const sampleRate of [44100, 48000])
  for (const frequency of [
    65.406, 82.407, 110, 146.832, 195.998, 246.942, 329.628, 440, 659.255,
  ])
    for (const harmonic of [0, 0.4]) {
      const signal = Float32Array.from(
        { length: 4096 },
        (_, i) =>
          0.3 * Math.sin((2 * Math.PI * frequency * i) / sampleRate) +
          harmonic * 0.3 * Math.sin((4 * Math.PI * frequency * i) / sampleRate),
      );
      const pitch = P.detectPitch(signal, sampleRate);
      assert(pitch, `No pitch at ${frequency}Hz`);
      const cents = Math.abs(1200 * Math.log2(pitch.frequency / frequency));
      assert(
        cents < 7,
        `${frequency}Hz: detected ${pitch.frequency}Hz, ${cents} cents off`,
      );
      checks++;
    }
assert.equal(P.detectPitch(new Float32Array(4096), 48000), null);
checks++;
let seed = 1;
const noise = Float32Array.from({ length: 4096 }, () => {
  seed = (seed * 16807) % 2147483647;
  return (seed / 2147483647 - 0.5) * 0.5;
});
assert.equal(P.detectPitch(noise, 44100), null);
checks++;
assert.equal(P.frequencyToNote(440).midi, 69);
assert.equal(P.frequencyToNote(432, 432).cents, 0);
assert.equal(P.frequencyToNote(0), null);
checks += 3;
assert.equal(P.tapTempo([0, 500, 1000, 1500]), 120);
assert.equal(P.tapTempo([1]), null);
assert.equal(P.tapTempo([0, 2200]), null);
checks += 3;
const shape = {
  id: "test-shape",
  selected: ["0:0", "1:1"],
  tuning: "standard",
  region: "0:5",
  mode: "chord",
  notation: "sharp",
  root: 0,
  left: false,
  allNotes: false,
  intervals: false,
  title: "Estudo",
  student: "Aluno",
  notes: "Prática",
  updated: "2026-10-19T00:00:00.000Z",
  favorite: true,
};
const backup = { app: "fretlab", version: 1, shapes: [shape] };
assert.deepEqual(P.validateBackup(backup, M.tunings), [shape]);
checks++;
for (const change of [
  { selected: ["0:25"] },
  { selected: ["7:0"] },
  { selected: [] },
  { root: 12 },
  { tuning: "__proto__" },
  { title: "x".repeat(101) },
  { notes: null },
  { region: "0:99" },
  { mode: "bad" },
]) {
  assert.throws(() =>
    P.validateBackup(
      { ...backup, shapes: [{ ...shape, ...change }] },
      M.tunings,
    ),
  );
  checks++;
}
assert.throws(() =>
  P.validateBackup({ ...backup, shapes: [shape, shape] }, M.tunings),
);
assert.throws(() => P.validateBackup({ ...backup, version: 2 }, M.tunings));
checks += 2;
const merge = P.mergeShapes([shape], [shape, { ...shape, id: "second" }]);
assert.equal(merge.added, 1);
assert.equal(merge.skipped, 1);
assert.equal(merge.shapes.length, 2);
checks += 3;
assert.throws(() =>
  P.mergeShapes(
    Array.from({ length: 500 }, (_, i) => ({ ...shape, id: String(i) })),
    [shape],
  ),
);
checks++;
console.log(`${checks} practice, pitch detection and backup checks passed.`);
