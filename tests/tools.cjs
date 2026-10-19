/* Integration checks with controlled audio, microphone promises and wall time.
   No hardware permission or real five-minute wait is needed. */
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
require("../dist/music.js");
require("../dist/practice.js");
function environment() {
  let now = 0,
    nextTimer = 0,
    micCalls = 0,
    grantMic,
    rejectMic,
    failStorage = false;
  const elements = new Map(),
    timers = new Map(),
    frames = new Map(),
    storage = new Map(),
    nodes = [];
  class Element {
    constructor() {
      this.value = "";
      this.checked = false;
      this.disabled = false;
      this.hidden = false;
      this.textContent = "";
      this.innerHTML = "";
      this.style = {};
      this.dataset = {};
      this.attrs = {};
      const classes = new Set();
      this.classList = {
        add: (c) => classes.add(c),
        remove: (c) => classes.delete(c),
        toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)),
      };
    }
    setAttribute(k, v) {
      this.attrs[k] = String(v);
    }
    removeAttribute(k) {
      delete this.attrs[k];
    }
    getAttribute(k) {
      return this.attrs[k] ?? null;
    }
    addEventListener(name, callback) {
      this["on" + name] = callback;
    }
    click() {
      return this.onclick?.({ target: this });
    }
    closest() {
      return this;
    }
  }
  const get = (selector) => {
    if (!elements.has(selector)) elements.set(selector, new Element());
    return elements.get(selector);
  };
  const document = {
    querySelector: get,
    querySelectorAll: () => [],
    addEventListener(name, callback) {
      this["on" + name] = callback;
    },
    body: { append() {} },
    hidden: false,
    createElement: () => new Element(),
  };
  get("#studyMinutes").value = "5";
  get("#studyFocus").value = "Escalas";
  get("#earDifficulty").value = "basic";
  get("#progressionPreset").value = "pop";
  get("#shapeFilter").value = "all";
  function node() {
    const item = {
      stopped: false,
      connect() {},
      disconnect() {},
      start() {},
      stop() {
        this.stopped = true;
      },
      frequency: { value: 0 },
      gain: {
        value: 0,
        setValueAtTime() {},
        linearRampToValueAtTime() {},
        setTargetAtTime() {},
        exponentialRampToValueAtTime() {},
      },
    };
    nodes.push(item);
    return item;
  }
  const audio = {
    currentTime: 0,
    state: "running",
    sampleRate: 48000,
    createOscillator: node,
    createGain: node,
    createMediaStreamSource: node,
    createAnalyser: () => ({
      ...node(),
      getFloatTimeDomainData(buffer) {
        for (let i = 0; i < buffer.length; i++)
          buffer[i] = 0.3 * Math.sin((2 * Math.PI * 440 * i) / 48000);
      },
    }),
  };
  const FakeDate = class extends Date {
    constructor(value) {
      super(value ?? now);
    }
    static now() {
      return now;
    }
  };
  const context = {
    document,
    location: { hash: "" },
    Practice: globalThis.Practice,
    M: globalThis.Music,
    Date: FakeDate,
    performance: { now: () => now },
    audioCtx: audio,
    audioMaster: node(),
    saved: [],
    state: { id: null },
    navigator: {
      mediaDevices: {
        getUserMedia() {
          micCalls++;
          return new Promise((resolve, reject) => {
            grantMic = resolve;
            rejectMic = reject;
          });
        },
      },
    },
    localStorage: {
      getItem: (k) => storage.get(k) ?? null,
      setItem(k, v) {
        if (failStorage) throw Error("Quota exceeded");
        storage.set(k, v);
      },
    },
    ensureAudio: async () => audio,
    stopAudio() {},
    pluck() {},
    toast: (message) => (get("#toast").textContent = message),
    esc: (s) => String(s),
    setMasterVolume() {},
    renderLibrary() {},
    persist() {},
    showView() {},
    loadChord() {},
    crypto: require("node:crypto").webcrypto,
    Blob,
    URL,
    console,
    setTimeout(fn, delay) {
      const id = ++nextTimer;
      timers.set(id, { fn, due: now + delay });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    setInterval(fn, delay) {
      const id = ++nextTimer;
      timers.set(id, { fn, due: now + delay, interval: delay });
      return id;
    },
    clearInterval: (id) => timers.delete(id),
    requestAnimationFrame(fn) {
      const id = ++nextTimer;
      frames.set(id, fn);
      return id;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
    addEventListener() {},
  };
  context.window = context;
  vm.runInNewContext(
    fs.readFileSync(require.resolve("../dist/tools.js"), "utf8"),
    context,
    { filename: "tools.js" },
  );
  function advance(milliseconds) {
    now += milliseconds;
    audio.currentTime = now / 1000;
    for (const [id, t] of [...timers])
      if (t.due <= now) {
        if (t.interval) t.due = now + t.interval;
        else timers.delete(id);
        t.fn();
      }
  }
  return {
    context,
    get,
    storage,
    nodes,
    frames,
    advance,
    grant: (stream) => grantMic(stream),
    reject: (error) => rejectMic(error),
    get micCalls() {
      return micCalls;
    },
    set failStorage(value) {
      failStorage = value;
    },
  };
}
(async () => {
  let checks = 0;
  const e = environment();
  assert.equal(e.micCalls, 0, "Initialization must not access the microphone");
  checks++;
  await e.get("#metroStart").click();
  assert.equal(e.get("#transportDock").hidden, false);
  assert.equal(e.get("#metroStart").getAttribute("aria-pressed"), "true");
  checks += 2;
  e.advance(100);
  e.context.FretStudio.stopTransport();
  assert.equal(e.get("#transportDock").hidden, true);
  assert.equal(e.get("#metroStart").getAttribute("aria-pressed"), "false");
  checks += 2;
  e.get("#metroBpm").value = "240";
  e.get("#metroBpm").oninput({ target: e.get("#metroBpm") });
  assert.equal(e.get("#metroRange").value, 240);
  checks++;
  e.get("#progressionLoop").checked = false;
  e.get("#progressionLoop").onchange({ target: e.get("#progressionLoop") });
  await e.get("#progressionStart").click();
  for (let i = 0; i < 210; i++) e.advance(25);
  assert.equal(
    e.get("#progressionStart").getAttribute("aria-pressed"),
    "false",
  );
  assert.match(e.get("#progressionStatus").textContent, /concluída/);
  checks += 2;
  // A permission grant that arrives after cancellation must release its track.
  const activation = e.get("#tunerStart").click();
  await new Promise(setImmediate);
  e.context.FretStudio.stopTuner();
  let stops = 0;
  e.grant({
    getTracks: () => [
      {
        stop() {
          stops++;
        },
      },
    ],
  });
  await activation;
  assert.equal(stops, 1);
  assert.equal(e.get("#tunerStart").getAttribute("aria-pressed"), "false");
  checks += 2;
  const denied = e.get("#tunerStart").click();
  await new Promise(setImmediate);
  const denial = Error("Denied");
  denial.name = "NotAllowedError";
  e.reject(denial);
  await denied;
  assert.match(e.get("#tunerStatus").textContent, /não autorizou/);
  checks++;
  const granted = e.get("#tunerStart").click();
  await new Promise(setImmediate);
  e.grant({
    getTracks: () => [
      {
        stop() {
          stops++;
        },
      },
    ],
  });
  await granted;
  assert.equal(e.get("#tunerStart").getAttribute("aria-pressed"), "true");
  checks++;
  for (const [id, frame] of [...e.frames]) {
    e.frames.delete(id);
    frame(2000);
  }
  assert.equal(e.get("#tunerNote").textContent, "A4");
  assert.match(e.get("#tunerCents").textContent, /No ponto/);
  checks += 2;
  e.context.FretStudio.stopTuner();
  assert.equal(stops, 2);
  assert.equal(e.frames.size, 0);
  checks += 2;
  e.get("#studyMinutes").onchange();
  e.get("#studyStart").click();
  e.advance(1000);
  e.get("#studyStart").click();
  const paused = e.get("#studyTime").textContent;
  e.advance(100000);
  assert.equal(e.get("#studyTime").textContent, paused);
  checks++;
  e.get("#studyStart").click();
  e.advance(300000);
  assert.equal(e.get("#studyTime").textContent, "00:00");
  assert.equal(
    JSON.parse(e.storage.get("fretlab.progress")).sessions.length,
    1,
  );
  checks += 2;
  e.advance(300000);
  assert.equal(
    JSON.parse(e.storage.get("fretlab.progress")).sessions.length,
    1,
    "A completed session is recorded once",
  );
  checks++;
  const backup = {
    app: "fretlab",
    version: 1,
    shapes: [
      {
        id: "new-shape",
        selected: ["0:0"],
        tuning: "standard",
        region: "0:5",
        mode: "free",
        notation: "sharp",
        root: null,
        title: "Nova",
        student: "",
        notes: "",
        updated: new Date(0).toISOString(),
      },
    ],
  };
  e.failStorage = true;
  await e.get("#backupFile").onchange({
    target: {
      files: [{ size: 100, text: async () => JSON.stringify(backup) }],
      value: "selected",
    },
  });
  assert.equal(
    e.context.saved.length,
    0,
    "A failed storage write must not change the collection",
  );
  assert.match(e.get("#toast").textContent, /Não foi possível salvar/);
  checks += 2;
  e.failStorage = false;
  await e.get("#backupFile").onchange({
    target: {
      files: [{ size: 100, text: async () => JSON.stringify(backup) }],
      value: "selected",
    },
  });
  assert.equal(e.context.saved.length, 1);
  checks++;
  await e.get("#backupFile").onchange({
    target: {
      files: [{ size: 100, text: async () => JSON.stringify(backup) }],
      value: "selected",
    },
  });
  assert.equal(e.context.saved.length, 1);
  checks++;
  console.log(
    `${checks} audio scheduler, microphone lifecycle, study timer and storage integration checks passed.`,
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
