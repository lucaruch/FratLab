/* Pure musical and backup operations, shared by the UI and Node tests. */
(function (g) {
  "use strict";
  const mod = (n) => ((n % 12) + 12) % 12;
  const intervalNames = [
    "Uníssono",
    "2ª menor",
    "2ª maior",
    "3ª menor",
    "3ª maior",
    "4ª justa",
    "Trítono",
    "5ª justa",
    "6ª menor",
    "6ª maior",
    "7ª menor",
    "7ª maior",
    "Oitava",
  ];
  function harmonicField(root, mode = "major") {
    const steps =
      mode === "minor" ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
    const degrees =
      mode === "minor"
        ? ["i", "ii°", "III", "iv", "v", "VI", "VII"]
        : ["I", "ii", "iii", "IV", "V", "vi", "vii°"];
    return steps.map((step, i) => {
      const intervals = [
        0,
        mod(steps[(i + 2) % 7] - step),
        mod(steps[(i + 4) % 7] - step),
      ];
      const quality =
        intervals[1] === 4 ? "" : intervals[2] === 6 ? "dim" : "m";
      return { root: mod(root + step), quality, intervals, degree: degrees[i] };
    });
  }
  function frequencyToNote(frequency, a4 = 440) {
    if (!Number.isFinite(frequency) || frequency <= 0 || a4 < 400 || a4 > 480)
      return null;
    const exact = 69 + 12 * Math.log2(frequency / a4),
      midi = Math.round(exact);
    return {
      midi,
      pc: mod(midi),
      octave: Math.floor(midi / 12) - 1,
      cents: (exact - midi) * 100,
      frequency: a4 * 2 ** ((midi - 69) / 12),
    };
  }
  // YIN-style cumulative normalized difference. Downsampling keeps the live
  // detector light enough for mobile; only a confident single pitch is returned.
  function detectPitch(input, sampleRate) {
    if (
      !input ||
      input.length < 256 ||
      !Number.isFinite(sampleRate) ||
      sampleRate < 8000
    )
      return null;
    const stride = Math.max(1, Math.floor(sampleRate / 12000)),
      rate = sampleRate / stride;
    const data = new Float64Array(Math.floor(input.length / stride));
    let mean = 0,
      energy = 0;
    for (let i = 0; i < data.length; i++) {
      data[i] = input[i * stride];
      mean += data[i];
    }
    mean /= data.length;
    for (let i = 0; i < data.length; i++) {
      data[i] -= mean;
      energy += data[i] * data[i];
    }
    if (Math.sqrt(energy / data.length) < 0.008) return null;
    const maxLag = Math.min(
        Math.floor(rate / 55),
        Math.floor(data.length / 2) - 1,
      ),
      minLag = Math.max(2, Math.floor(rate / 1400));
    const difference = new Float64Array(maxLag + 1),
      window = data.length - maxLag;
    difference[0] = 1;
    let sum = 0;
    for (let lag = 1; lag <= maxLag; lag++) {
      let value = 0;
      for (let i = 0; i < window; i++) {
        const delta = data[i] - data[i + lag];
        value += delta * delta;
      }
      sum += value;
      difference[lag] = sum ? (value * lag) / sum : 1;
    }
    for (let lag = minLag; lag < maxLag - 1; lag++) {
      if (difference[lag] > 0.15) continue;
      while (lag + 1 < maxLag && difference[lag + 1] < difference[lag]) lag++;
      const a = difference[lag - 1],
        b = difference[lag],
        c = difference[lag + 1],
        denominator = 2 * (a - 2 * b + c);
      const offset = denominator ? (a - c) / denominator : 0;
      const frequency = rate / (lag + Math.max(-1, Math.min(1, offset)));
      return frequency >= 55 && frequency <= 1400
        ? { frequency, confidence: 1 - b }
        : null;
    }
    return null;
  }
  function tapTempo(taps) {
    if (taps.length < 2) return null;
    const intervals = taps.slice(1).map((t, i) => t - taps[i]);
    if (intervals.some((i) => i <= 0 || i > 2000)) return null;
    return Math.max(
      40,
      Math.min(
        240,
        Math.round(
          60000 / (intervals.reduce((a, b) => a + b, 0) / intervals.length),
        ),
      ),
    );
  }
  function validateBackup(payload, tunings) {
    if (
      !payload ||
      payload.app !== "fretlab" ||
      payload.version !== 1 ||
      !Array.isArray(payload.shapes) ||
      payload.shapes.length > 500
    )
      throw Error(
        "Backup inválido. Use um arquivo JSON exportado pelo FretLab (até 500 shapes).",
      );
    const ids = new Set(),
      regions = ["0:12", "0:5", "3:9", "5:12", "9:17", "12:24", "0:24"];
    return payload.shapes.map((s) => {
      if (
        !s ||
        typeof s.id !== "string" ||
        !s.id ||
        s.id.length > 120 ||
        ids.has(s.id) ||
        !Array.isArray(s.selected) ||
        !s.selected.length ||
        s.selected.length > 150 ||
        s.selected.some(
          (k) =>
            typeof k !== "string" || !/^([0-5]):([0-9]|1[0-9]|2[0-4])$/.test(k),
        ) ||
        !Object.hasOwn(tunings, s.tuning) ||
        !regions.includes(s.region) ||
        !["free", "chord", "scale"].includes(s.mode) ||
        !["sharp", "flat", "sol"].includes(s.notation) ||
        (s.root !== null &&
          (!Number.isInteger(s.root) || s.root < 0 || s.root > 11))
      )
        throw Error(
          "O arquivo contém um shape inválido. Nenhum dado foi importado.",
        );
      for (const [field, max] of [
        ["title", 100],
        ["student", 80],
        ["notes", 1800],
      ])
        if (typeof s[field] !== "string" || s[field].length > max)
          throw Error("Texto inválido no backup. Nenhum dado foi importado.");
      ids.add(s.id);
      return {
        id: s.id,
        selected: [...new Set(s.selected)],
        tuning: s.tuning,
        region: s.region,
        mode: s.mode,
        notation: s.notation,
        root: s.root,
        left: !!s.left,
        allNotes: !!s.allNotes,
        intervals: !!s.intervals,
        title: s.title,
        student: s.student,
        notes: s.notes,
        favorite: !!s.favorite,
        updated:
          typeof s.updated === "string" &&
          Number.isFinite(Date.parse(s.updated))
            ? s.updated
            : new Date().toISOString(),
      };
    });
  }
  function mergeShapes(current, incoming) {
    const ids = new Set(current.map((s) => s.id)),
      added = incoming.filter((s) => !ids.has(s.id));
    if (current.length + added.length > 500)
      throw Error(
        "O limite é de 500 shapes. Exporte um backup antes de organizar sua coleção.",
      );
    return {
      shapes: [...added, ...current],
      added: added.length,
      skipped: incoming.length - added.length,
    };
  }
  g.Practice = {
    harmonicField,
    frequencyToNote,
    detectPitch,
    tapTempo,
    validateBackup,
    mergeShapes,
    intervalNames,
  };
})(globalThis);
