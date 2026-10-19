/* Practice tools stay local, share the studio audio output and require no service. */
(() => {
  "use strict";
  const P = Practice,
    q = (s) => document.querySelector(s),
    qa = (s) => [...document.querySelectorAll(s)];
  const read = (key, fallback) => {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  };
  const stored = read("fretlab.practice", {});
  const prefs = {
    bpm: 100,
    beats: 4,
    subdivision: 1,
    accent: true,
    volume: 70,
    root: 0,
    mode: "major",
    bars: 1,
    loop: true,
    click: true,
    tuning: "standard",
    calibration: 440,
  };
  for (const [key, values] of Object.entries({
    beats: [2, 3, 4, 5, 6, 7],
    subdivision: [1, 2, 3, 4],
    mode: ["major", "minor"],
    bars: [1, 2, 4],
    tuning: Object.keys(M.tunings),
    calibration: [432, 440, 442],
  }))
    if (values.includes(stored[key])) prefs[key] = stored[key];
  for (const [key, min, max] of [
    ["bpm", 40, 240],
    ["volume", 0, 100],
    ["root", 0, 11],
  ])
    if (
      Number.isInteger(stored[key]) &&
      stored[key] >= min &&
      stored[key] <= max
    )
      prefs[key] = stored[key];
  for (const key of ["accent", "loop", "click"])
    if (typeof stored[key] === "boolean") prefs[key] = stored[key];
  function storePrefs() {
    try {
      localStorage.setItem("fretlab.practice", JSON.stringify(prefs));
    } catch {
      q("#metroStatus").textContent =
        "Preferências disponíveis nesta sessão. O navegador não permitiu salvar.";
    }
  }
  const statsRaw = read("fretlab.progress", {});
  const stats = {
    correct:
      Number.isInteger(statsRaw.correct) && statsRaw.correct >= 0
        ? statsRaw.correct
        : 0,
    total:
      Number.isInteger(statsRaw.total) && statsRaw.total >= 0
        ? statsRaw.total
        : 0,
    sessions: Array.isArray(statsRaw.sessions)
      ? statsRaw.sessions
          .filter(
            (s) =>
              s &&
              /^\d{4}-\d{2}-\d{2}$/.test(s.date) &&
              [5, 10, 15, 20, 30].includes(s.minutes),
          )
          .slice(-1000)
      : [],
  };
  stats.correct = Math.min(stats.correct, stats.total);
  function storeStats() {
    try {
      localStorage.setItem("fretlab.progress", JSON.stringify(stats));
    } catch {
      toast(
        "Progresso disponível só nesta sessão. O navegador não permitiu salvar.",
      );
    }
  }
  const localDate = () => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  };

  // Look ahead against the audio clock. Visual updates are separate from timing.
  let transport = null,
    transportTimer = null,
    transportRequest = 0;
  const cues = new Set(),
    clicks = new Set(),
    tones = new Set();
  let soundRequest = 0;
  const later = (fn, delay) => {
    const id = setTimeout(
      () => {
        cues.delete(id);
        fn();
      },
      Math.max(0, delay),
    );
    cues.add(id);
  };
  function stopNodes(nodes) {
    for (const node of nodes) {
      try {
        node.stop();
      } catch {}
    }
    nodes.clear();
  }
  function stopTones() {
    soundRequest++;
    stopNodes(tones);
  }
  function tone(midi, when, duration = 0.7, a4 = 440) {
    const osc = audioCtx.createOscillator(),
      gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.value = a4 * 2 ** ((midi - 69) / 12);
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(0.16, when + 0.015);
    gain.gain.setTargetAtTime(0.001, when + duration - 0.1, 0.04);
    osc.connect(gain);
    gain.connect(audioMaster);
    osc.start(when);
    osc.stop(when + duration + 0.05);
    tones.add(osc);
    osc.onended = () => tones.delete(osc);
  }
  function click(when, accent, subdivision) {
    const osc = audioCtx.createOscillator(),
      gain = audioCtx.createGain();
    osc.frequency.value = accent ? 1550 : subdivision ? 750 : 1050;
    gain.gain.setValueAtTime(accent ? 0.1 : subdivision ? 0.035 : 0.065, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.045);
    osc.connect(gain);
    gain.connect(audioMaster);
    osc.start(when);
    osc.stop(when + 0.05);
    clicks.add(osc);
    osc.onended = () => clicks.delete(osc);
  }
  function renderBeats() {
    q("#beatLights").innerHTML = Array.from(
      { length: prefs.beats },
      (_, i) => `<i${i === 0 ? ' class="accent"' : ""}></i>`,
    ).join("");
  }
  function stopTransport() {
    transportRequest++;
    clearInterval(transportTimer);
    transportTimer = null;
    transport = null;
    for (const id of cues) clearTimeout(id);
    cues.clear();
    stopNodes(clicks);
    stopAudio();
    q("#transportDock").hidden = true;
    q("#metroStart").textContent = "▶ Iniciar metrônomo";
    q("#metroStart").setAttribute("aria-pressed", "false");
    q("#progressionStart").textContent = "▶ Tocar sequência";
    q("#progressionStart").setAttribute("aria-pressed", "false");
    qa("#beatLights i,.sequence-item").forEach((el) => {
      el.classList.remove("current");
      el.removeAttribute("aria-current");
    });
    q("#metroStatus").textContent = "Pronto para praticar.";
    q("#progressionStatus").textContent = "O andamento acompanha o metrônomo.";
  }
  function schedule() {
    if (!transport || audioCtx.state !== "running") return;
    const active = transport;
    while (active.next < audioCtx.currentTime + 0.12) {
      const isProgression = active.kind === "progression",
        sub = isProgression ? 1 : prefs.subdivision;
      const beats = isProgression ? 4 : prefs.beats;
      const total = sequence.length * 4 * prefs.bars;
      if (isProgression && !prefs.loop && active.step >= total) {
        clearInterval(transportTimer);
        later(
          () => {
            stopTransport();
            q("#progressionStatus").textContent =
              "Sequência concluída. Boa prática!";
          },
          (active.next - audioCtx.currentTime) * 1000,
        );
        break;
      }
      const step = active.step,
        when = active.next,
        beat = Math.floor(step / sub) % beats;
      if (!isProgression || prefs.click)
        click(
          when,
          prefs.accent && step % (beats * sub) === 0,
          step % sub !== 0,
        );
      if (isProgression) {
        const index = Math.floor(step / (4 * prefs.bars)) % sequence.length,
          chord = sequence[index];
        if (step % 4 === 0) {
          const base = 48 + chord.root;
          pluck(base - 12, when, 1.5);
          chord.intervals.forEach((interval, i) =>
            pluck(base + interval, when + 0.015 * i, 1.5),
          );
        }
        later(
          () => {
            if (transport !== active) return;
            selectedChord = index;
            qa(".sequence-item").forEach((el, i) => {
              el.classList.toggle("current", i === index);
              if (i === index) el.setAttribute("aria-current", "step");
              else el.removeAttribute("aria-current");
            });
            q("#progressionStatus").textContent =
              `${chordNameFor(chord)} · compasso ${(Math.floor(step / 4) % (sequence.length * prefs.bars)) + 1} · batida ${beat + 1}/4`;
          },
          (when - audioCtx.currentTime) * 1000,
        );
      } else if (step % sub === 0) {
        later(
          () => {
            if (transport !== active) return;
            qa("#beatLights i").forEach((el, i) =>
              el.classList.toggle("current", i === beat),
            );
          },
          (when - audioCtx.currentTime) * 1000,
        );
      }
      active.step++;
      active.next += 60 / prefs.bpm / sub;
    }
  }
  async function startTransport(kind) {
    if (kind === "progression" && !sequence.length) {
      toast("Adicione ao menos um acorde à sequência.");
      return;
    }
    stopTransport();
    stopTuner();
    stopTones();
    const request = ++transportRequest;
    try {
      await ensureAudio();
      if (request !== transportRequest) return;
      transport = { kind, step: 0, next: audioCtx.currentTime + 0.07 };
      q("#transportDock").hidden = false;
      q("#transportLabel").textContent =
        `${kind === "metronome" ? "Metrônomo" : "Sequência"} · ${prefs.bpm} BPM`;
      const button = q(
        kind === "metronome" ? "#metroStart" : "#progressionStart",
      );
      button.textContent = "■ Parar";
      button.setAttribute("aria-pressed", "true");
      q("#metroStatus").textContent =
        kind === "metronome"
          ? "Em andamento. Você pode voltar ao estúdio."
          : "Pronto para praticar.";
      schedule();
      transportTimer = setInterval(schedule, 25);
    } catch {
      stopTransport();
      toast("Não foi possível iniciar o áudio. Verifique o som do navegador.");
    }
  }
  function setBpm(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    prefs.bpm = Math.max(40, Math.min(240, Math.round(parsed)));
    q("#metroBpm").value = prefs.bpm;
    q("#metroRange").value = prefs.bpm;
    q("#tempo").value = Math.min(200, prefs.bpm);
    q("#tempoValue").textContent = q("#tempo").value + " BPM";
    q("#progressionTempo").textContent = `${prefs.bpm} BPM · 4/4`;
    if (transport)
      q("#transportLabel").textContent =
        `${transport.kind === "metronome" ? "Metrônomo" : "Sequência"} · ${prefs.bpm} BPM`;
    storePrefs();
  }
  q("#metroBpm").oninput = (e) => {
    const value = Number(e.target.value);
    if (value >= 40 && value <= 240) setBpm(value);
  };
  q("#metroBpm").onchange = (e) => setBpm(e.target.value);
  q("#metroRange").oninput = (e) => setBpm(e.target.value);
  q("#bpmDown").onclick = () => setBpm(prefs.bpm - 1);
  q("#bpmUp").onclick = () => setBpm(prefs.bpm + 1);
  q("#metroStart").onclick = () =>
    transport?.kind === "metronome"
      ? stopTransport()
      : startTransport("metronome");
  let taps = [];
  q("#tapTempo").onclick = () => {
    const now = performance.now();
    if (taps.length && now - taps.at(-1) > 2000) taps = [];
    taps.push(now);
    taps = taps.slice(-8);
    const bpm = P.tapTempo(taps);
    if (bpm) {
      setBpm(bpm);
      q("#metroStatus").textContent = `Tap tempo: ${bpm} BPM.`;
    } else q("#metroStatus").textContent = "Toque novamente no ritmo desejado.";
  };
  for (const [id, key] of [
    ["metroBeats", "beats"],
    ["metroSubdivision", "subdivision"],
  ])
    q("#" + id).onchange = (e) => {
      prefs[key] = Number(e.target.value);
      renderBeats();
      storePrefs();
      if (transport?.kind === "metronome") startTransport("metronome");
    };
  q("#metroAccent").onchange = (e) => {
    prefs.accent = e.target.checked;
    storePrefs();
  };
  q("#masterVolume").oninput = (e) => {
    prefs.volume = Number(e.target.value);
    setMasterVolume(prefs.volume / 100);
    q("#masterVolumeValue").textContent = prefs.volume + "%";
    storePrefs();
  };
  q("#transportStop").onclick = stopTransport;
  q("#transportOpen").onclick = () => showView("tools");

  // Harmony uses diatonic triads, including the diminished seventh degree.
  let sequence = [],
    selectedChord = 0;
  const chordNameFor = (chord) =>
    M.name(chord.root) + (chord.quality === "dim" ? "°" : chord.quality);
  function persistSequence() {
    try {
      localStorage.setItem(
        "fretlab.sequence",
        JSON.stringify(
          sequence.map((c) => ({
            root: c.root,
            quality: c.quality,
            intervals: c.intervals,
            degree: c.degree,
          })),
        ),
      );
    } catch {
      toast("Sequência disponível só nesta sessão.");
    }
  }
  function renderField() {
    q("#harmonicField").innerHTML = P.harmonicField(prefs.root, prefs.mode)
      .map(
        (c, i) =>
          `<button class="harmonic-chord" data-degree="${i}" title="Adicionar ${esc(chordNameFor(c))}"><span>${c.degree}</span><strong>${esc(chordNameFor(c))}</strong><small>+ adicionar</small></button>`,
      )
      .join("");
  }
  function renderSequence() {
    q("#sequenceCount").textContent = `${sequence.length} / 16`;
    q("#progressionStart").disabled = !sequence.length;
    q("#progressionToStudio").disabled = !sequence.length;
    q("#progressionSequence").innerHTML = sequence.length
      ? sequence
          .map(
            (c, i) =>
              `<div class="sequence-item${i === selectedChord ? " selected" : ""}"><button data-select-chord="${i}" aria-pressed="${i === selectedChord}"><span>${i + 1}. ${esc(c.degree || "Acorde")}</span><strong>${esc(chordNameFor(c))}</strong></button><div><button data-move-chord="${i}" data-direction="-1" aria-label="Mover acorde ${i + 1} para a esquerda" ${i === 0 ? "disabled" : ""}>←</button><button data-move-chord="${i}" data-direction="1" aria-label="Mover acorde ${i + 1} para a direita" ${i === sequence.length - 1 ? "disabled" : ""}>→</button><button data-remove-chord="${i}" aria-label="Remover acorde ${i + 1}">×</button></div></div>`,
          )
          .join("")
      : '<p class="sequence-empty">Adicione acordes do campo harmônico ou carregue uma progressão.</p>';
  }
  function presetSequence() {
    if (transport?.kind === "progression") stopTransport();
    const type = q("#progressionPreset").value;
    if (type === "minor") prefs.mode = "minor";
    else prefs.mode = "major";
    q("#harmonyMode").value = prefs.mode;
    const degrees = {
      pop: [0, 4, 5, 3],
      jazz: [1, 4, 0],
      classic: [0, 3, 4],
      minor: [0, 5, 2, 6],
    }[type];
    const field = P.harmonicField(prefs.root, prefs.mode);
    sequence = degrees.map((i) => ({ ...field[i] }));
    selectedChord = 0;
    renderField();
    renderSequence();
    persistSequence();
    storePrefs();
  }
  q("#harmonyRoot").innerHTML = M.sharp
    .map((name, i) => `<option value="${i}">${name}</option>`)
    .join("");
  q("#harmonyRoot").onchange = (e) => {
    const delta = Number(e.target.value) - prefs.root;
    prefs.root = Number(e.target.value);
    if (transport?.kind === "progression") stopTransport();
    sequence = sequence.map((c) => ({ ...c, root: M.mod(c.root + delta) }));
    renderField();
    renderSequence();
    persistSequence();
    storePrefs();
  };
  q("#harmonyMode").onchange = (e) => {
    prefs.mode = e.target.value;
    renderField();
    storePrefs();
    q("#progressionStatus").textContent =
      "Campo harmônico alterado. Sua sequência foi mantida; carregue uma progressão para substituí-la.";
  };
  q("#loadProgression").onclick = presetSequence;
  q("#harmonicField").onclick = (e) => {
    const button = e.target.closest("[data-degree]");
    if (!button) return;
    if (sequence.length >= 16) {
      toast("Use até 16 acordes por sequência.");
      return;
    }
    if (transport?.kind === "progression") stopTransport();
    sequence.push(
      P.harmonicField(prefs.root, prefs.mode)[Number(button.dataset.degree)],
    );
    selectedChord = sequence.length - 1;
    renderSequence();
    persistSequence();
  };
  q("#progressionSequence").onclick = (e) => {
    const select = e.target.closest("[data-select-chord]"),
      move = e.target.closest("[data-move-chord]"),
      remove = e.target.closest("[data-remove-chord]");
    if (!select && !move && !remove) return;
    if (transport?.kind === "progression") stopTransport();
    if (select) selectedChord = Number(select.dataset.selectChord);
    if (move) {
      const i = Number(move.dataset.moveChord),
        j = i + Number(move.dataset.direction);
      if (j >= 0 && j < sequence.length) {
        [sequence[i], sequence[j]] = [sequence[j], sequence[i]];
        selectedChord = j;
      }
    }
    if (remove) {
      sequence.splice(Number(remove.dataset.removeChord), 1);
      selectedChord = Math.max(0, Math.min(selectedChord, sequence.length - 1));
    }
    renderSequence();
    persistSequence();
  };
  q("#clearProgression").onclick = () => {
    if (transport?.kind === "progression") stopTransport();
    sequence = [];
    selectedChord = 0;
    renderSequence();
    persistSequence();
  };
  q("#progressionStart").onclick = () =>
    transport?.kind === "progression"
      ? stopTransport()
      : startTransport("progression");
  q("#barsPerChord").onchange = (e) => {
    prefs.bars = Number(e.target.value);
    storePrefs();
    if (transport?.kind === "progression") startTransport("progression");
  };
  for (const [id, key] of [
    ["progressionLoop", "loop"],
    ["progressionClick", "click"],
  ])
    q("#" + id).onchange = (e) => {
      prefs[key] = e.target.checked;
      storePrefs();
    };
  q("#progressionToStudio").onclick = () => {
    const chord = sequence[selectedChord];
    if (!chord) return;
    stopTransport();
    const index = M.chords.findIndex((c) => c[0] === chord.quality);
    loadChord(chord.root, index);
    showView("studio");
  };

  // The stream is never connected to speakers, recorded or transmitted.
  let micStream = null,
    micSource = null,
    micAnalyser = null,
    micFrame = null,
    micRequest = 0,
    micPending = false;
  function resetTunerReading() {
    q("#tunerNote").textContent = "—";
    q("#tunerFrequency").textContent = "Aguardando uma nota";
    q("#tunerCents").textContent = "Toque uma corda por vez.";
    q("#tunerNeedle").style.left = "50%";
    q(".tuner-reading").classList.remove("in-tune");
  }
  function stopTuner() {
    micRequest++;
    micPending = false;
    cancelAnimationFrame(micFrame);
    micFrame = null;
    micStream?.getTracks().forEach((track) => track.stop());
    micStream = null;
    micSource?.disconnect();
    micAnalyser?.disconnect();
    micSource = null;
    micAnalyser = null;
    q("#tunerStart").textContent = "Ativar microfone";
    q("#tunerStart").setAttribute("aria-pressed", "false");
    resetTunerReading();
    q("#tunerStatus").textContent =
      "Microfone desligado. Use as cordas abaixo como referência sonora.";
  }
  async function startTuner() {
    if (micStream || micPending) {
      stopTuner();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      q("#tunerStatus").textContent =
        "Microfone indisponível neste navegador. Use o som de referência ou abra em HTTPS.";
      return;
    }
    stopTransport();
    stopTones();
    stopTuner();
    const request = ++micRequest;
    micPending = true;
    q("#tunerStart").textContent = "Cancelar ativação";
    q("#tunerStatus").textContent =
      "Autorize o microfone no navegador para afinar. Você pode cancelar aqui.";
    try {
      await ensureAudio();
      if (request !== micRequest) return;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
        video: false,
      });
      if (request !== micRequest) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      micPending = false;
      micStream = stream;
      micSource = audioCtx.createMediaStreamSource(stream);
      micAnalyser = audioCtx.createAnalyser();
      micAnalyser.fftSize = 4096;
      micSource.connect(micAnalyser);
      q("#tunerStart").textContent = "Desligar microfone";
      q("#tunerStart").setAttribute("aria-pressed", "true");
      q("#tunerStatus").textContent =
        "Microfone ativo · análise local. Toque uma corda e deixe o som sustentar.";
      const buffer = new Float32Array(4096);
      let last = 0,
        lastPitch = 0;
      const update = (now) => {
        if (request !== micRequest) return;
        if (now - last > 85) {
          last = now;
          micAnalyser.getFloatTimeDomainData(buffer);
          const pitch = P.detectPitch(buffer, audioCtx.sampleRate);
          if (pitch) {
            lastPitch = now;
            const note = P.frequencyToNote(pitch.frequency, prefs.calibration),
              cents = Math.round(note.cents);
            q("#tunerNote").textContent = M.name(note.pc) + note.octave;
            q("#tunerFrequency").textContent =
              pitch.frequency.toFixed(1) + " Hz";
            q("#tunerCents").textContent =
              Math.abs(cents) <= 5
                ? "No ponto. Boa afinação!"
                : `${cents > 0 ? "+" : ""}${cents} cents · ${cents > 0 ? "abaixe" : "suba"} a afinação`;
            q("#tunerNeedle").style.left =
              50 + Math.max(-45, Math.min(45, cents * 0.9)) + "%";
            q(".tuner-reading").classList.toggle(
              "in-tune",
              Math.abs(cents) <= 5,
            );
          } else if (now - lastPitch > 1200) resetTunerReading();
        }
        micFrame = requestAnimationFrame(update);
      };
      micFrame = requestAnimationFrame(update);
    } catch (error) {
      if (request !== micRequest) return;
      stopTuner();
      q("#tunerStatus").textContent =
        error.name === "NotAllowedError"
          ? "O navegador não autorizou o microfone. Permita o acesso nas configurações do site ou use o som de referência."
          : error.name === "NotFoundError"
            ? "Nenhum microfone encontrado. Use o som de referência."
            : "Não foi possível acessar o microfone. Verifique o dispositivo ou use o som de referência.";
    }
  }
  function renderReferences() {
    q("#referenceStrings").innerHTML = M.tunings[prefs.tuning].midi
      .map((midi, i) => ({ midi, string: i + 1 }))
      .reverse()
      .map(
        ({ midi, string }) =>
          `<button data-reference="${midi}" aria-label="Ouvir ${string}ª corda, ${M.name(midi)}${Math.floor(midi / 12) - 1}"><small>${string}ª</small><strong>${M.name(midi)}</strong><span>${Math.floor(midi / 12) - 1}</span></button>`,
      )
      .join("");
  }
  q("#tunerTuning").innerHTML = Object.entries(M.tunings)
    .map(([id, t]) => `<option value="${id}">${esc(t.name)}</option>`)
    .join("");
  q("#tunerTuning").onchange = (e) => {
    prefs.tuning = e.target.value;
    renderReferences();
    storePrefs();
  };
  q("#tunerCalibration").onchange = (e) => {
    prefs.calibration = Number(e.target.value);
    storePrefs();
  };
  q("#tunerStart").onclick = startTuner;
  q("#referenceStrings").onclick = async (e) => {
    const button = e.target.closest("[data-reference]");
    if (!button) return;
    stopTuner();
    stopTransport();
    stopTones();
    const request = soundRequest;
    try {
      await ensureAudio();
      if (request !== soundRequest) return;
      const midi = Number(button.dataset.reference);
      tone(midi, audioCtx.currentTime + 0.02, 1.5, prefs.calibration);
      const frequency = prefs.calibration * 2 ** ((midi - 69) / 12);
      q("#tunerNote").textContent = M.name(midi) + (Math.floor(midi / 12) - 1);
      q("#tunerFrequency").textContent = frequency.toFixed(1) + " Hz";
      q("#tunerCents").textContent =
        "Som de referência · compare com sua corda.";
    } catch {
      q("#tunerStatus").textContent =
        "Não foi possível reproduzir o som de referência.";
    }
  };

  // One first answer per question, with replay available before and after.
  let question = null,
    earRequest = 0;
  function renderEarStats() {
    q("#earCorrect").textContent = stats.correct;
    q("#earTotal").textContent = stats.total;
    q("#earAccuracy").textContent = stats.total
      ? Math.round((stats.correct / stats.total) * 100) + "%"
      : "—";
  }
  async function playQuestion() {
    if (!question) return;
    const current = question,
      request = ++earRequest;
    stopTransport();
    stopTuner();
    stopTones();
    const toneRequest = soundRequest;
    try {
      await ensureAudio();
      if (
        request !== earRequest ||
        question !== current ||
        toneRequest !== soundRequest
      )
        return;
      const when = audioCtx.currentTime + 0.04;
      tone(current.root, when, 0.65);
      tone(current.root + current.interval, when + 0.8, 0.75);
    } catch {
      q("#earFeedback").textContent =
        "Não foi possível iniciar o áudio. Verifique o som do navegador.";
    }
  }
  q("#earNew").onclick = () => {
    const intervals =
      q("#earDifficulty").value === "basic"
        ? [3, 4, 7, 12]
        : Array.from({ length: 12 }, (_, i) => i + 1);
    question = {
      root: 48 + Math.floor(Math.random() * 12),
      interval: intervals[Math.floor(Math.random() * intervals.length)],
      answered: false,
    };
    q("#earAnswers").innerHTML = intervals
      .map(
        (i) =>
          `<button class="button" data-interval="${i}">${P.intervalNames[i]}</button>`,
      )
      .join("");
    q("#earReplay").disabled = false;
    q("#earFeedback").textContent =
      "Qual é o intervalo? Você pode ouvir novamente antes de responder.";
    playQuestion();
  };
  q("#earReplay").onclick = playQuestion;
  q("#earResetStats").onclick = () => {
    stats.correct = 0;
    stats.total = 0;
    storeStats();
    renderEarStats();
    toast("Contagem de acertos zerada.");
  };
  q("#earDifficulty").onchange = () => {
    earRequest++;
    stopTones();
    question = null;
    q("#earAnswers").innerHTML = "";
    q("#earReplay").disabled = true;
    q("#earFeedback").textContent =
      "Dificuldade alterada. Inicie um novo desafio.";
  };
  q("#earAnswers").onclick = (e) => {
    const button = e.target.closest("[data-interval]");
    if (!button || !question || question.answered) return;
    question.answered = true;
    const correct = Number(button.dataset.interval) === question.interval;
    stats.total++;
    if (correct) stats.correct++;
    storeStats();
    renderEarStats();
    qa("[data-interval]").forEach((b) => {
      b.disabled = true;
      b.classList.toggle(
        "correct",
        Number(b.dataset.interval) === question.interval,
      );
      b.classList.toggle("incorrect", b === button && !correct);
    });
    q("#earFeedback").textContent = correct
      ? "Boa! " +
        P.intervalNames[question.interval] +
        ". Siga para o próximo desafio."
      : "É " +
        P.intervalNames[question.interval] +
        ". Ouça novamente e compare; depois tente outro desafio.";
  };

  // Wall-clock time avoids drift if the browser slows down in the background.
  let studyRemaining = 15 * 60000,
    studyEnd = 0,
    studyTicker = null,
    studyActive = false;
  function renderStudy() {
    const seconds = Math.max(0, Math.ceil(studyRemaining / 1000));
    q("#studyTime").textContent =
      String(Math.floor(seconds / 60)).padStart(2, "0") +
      ":" +
      String(seconds % 60).padStart(2, "0");
  }
  function renderStudyStats() {
    q("#studyToday").textContent =
      stats.sessions
        .filter((s) => s.date === localDate())
        .reduce((sum, s) => sum + s.minutes, 0) + " min";
    q("#studySessions").textContent = stats.sessions.length;
  }
  function studyTick() {
    if (!studyActive) return;
    studyRemaining = Math.max(0, studyEnd - Date.now());
    renderStudy();
    if (studyRemaining > 0) return;
    clearInterval(studyTicker);
    studyActive = false;
    q("#studyStart").textContent = "▶ Nova sessão";
    q("#studyMinutes").disabled = false;
    q("#studyFocus").disabled = false;
    stats.sessions.push({
      date: localDate(),
      minutes: Number(q("#studyMinutes").value),
      focus: q("#studyFocus").value,
    });
    stats.sessions = stats.sessions.slice(-1000);
    storeStats();
    renderStudyStats();
    q("#studyStatus").textContent =
      "Sessão concluída! Faça uma pausa e valorize sua evolução.";
    toast("Sessão de estudo concluída. Boa prática!");
  }
  q("#studyStart").onclick = () => {
    if (studyActive) {
      studyRemaining = Math.max(0, studyEnd - Date.now());
      studyActive = false;
      clearInterval(studyTicker);
      q("#studyStart").textContent = "▶ Continuar";
      q("#studyStatus").textContent = "Sessão pausada. Continue quando quiser.";
      renderStudy();
      return;
    }
    if (studyRemaining <= 0)
      studyRemaining = Number(q("#studyMinutes").value) * 60000;
    studyActive = true;
    studyEnd = Date.now() + studyRemaining;
    q("#studyStart").textContent = "Ⅱ Pausar";
    q("#studyMinutes").disabled = true;
    q("#studyFocus").disabled = true;
    q("#studyStatus").textContent =
      "Foco: " + q("#studyFocus").value + ". Uma nota de cada vez.";
    studyTicker = setInterval(studyTick, 250);
    studyTick();
  };
  function resetStudy() {
    clearInterval(studyTicker);
    studyActive = false;
    studyRemaining = Number(q("#studyMinutes").value) * 60000;
    q("#studyMinutes").disabled = false;
    q("#studyFocus").disabled = false;
    q("#studyStart").textContent = "▶ Iniciar sessão";
    q("#studyStatus").textContent = "Seu progresso fica salvo neste navegador.";
    renderStudy();
  }
  q("#studyReset").onclick = resetStudy;
  q("#studyMinutes").onchange = resetStudy;

  // Import is validated in full before one atomic storage write. Existing IDs
  // are retained; a repeated backup never overwrites or duplicates a shape.
  function commitShapes(next) {
    try {
      localStorage.setItem("fretlab.shapes", JSON.stringify(next));
      saved = next;
      q("#savedCount").textContent = saved.length;
      renderLibrary();
      return true;
    } catch {
      toast(
        "Não foi possível salvar a coleção. Exporte um backup ou libere espaço no navegador.",
      );
      return false;
    }
  }
  q("#shapeSearch").oninput = renderLibrary;
  q("#shapeFilter").onchange = renderLibrary;
  q("#shapeSort").onchange = renderLibrary;
  q("#savedShapes").addEventListener("click", (e) => {
    const favorite = e.target.closest("[data-favorite]"),
      duplicate = e.target.closest("[data-duplicate]");
    if (favorite) {
      const id = favorite.dataset.favorite,
        next = saved.map((s) =>
          s.id === id ? { ...s, favorite: !s.favorite } : s,
        );
      if (commitShapes(next) && state.id === id) {
        state.favorite = next.find((s) => s.id === id).favorite;
        persist();
      }
    }
    if (duplicate) {
      if (saved.length >= 500) {
        toast(
          "Limite de 500 shapes. Exporte um backup e organize sua coleção.",
        );
        return;
      }
      const item = saved.find((s) => s.id === duplicate.dataset.duplicate);
      if (!item) return;
      const copy = {
        ...structuredClone(item),
        id: "shape-" + crypto.randomUUID(),
        title: (item.title + " — cópia").slice(0, 100),
        updated: new Date().toISOString(),
      };
      if (commitShapes([copy, ...saved])) toast("Cópia adicionada à coleção.");
    }
  });
  q("#backupExport").onclick = () => {
    const blob = new Blob(
        [
          JSON.stringify(
            {
              app: "fretlab",
              version: 1,
              exportedAt: new Date().toISOString(),
              shapes: saved,
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
      url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download = "fretlab-backup-" + localDate() + ".json";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    toast("Backup exportado. Guarde o JSON em um lugar seguro.");
  };
  q("#backupImport").onclick = () => q("#backupFile").click();
  q("#backupFile").onchange = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024)
        throw Error("O backup deve ter até 2 MB.");
      const incoming = P.validateBackup(
          JSON.parse(await file.text()),
          M.tunings,
        ),
        result = P.mergeShapes(saved, incoming);
      if (commitShapes(result.shapes))
        toast(
          `${result.added} shapes importados. ${result.skipped} já estavam na coleção.`,
        );
    } catch (error) {
      toast(
        error instanceof SyntaxError
          ? "Arquivo JSON inválido. Nenhum shape foi alterado."
          : error.message,
      );
    }
  };

  // Resume preferences, not playback or microphone access.
  q("#metroBeats").value = prefs.beats;
  q("#metroSubdivision").value = prefs.subdivision;
  q("#metroAccent").checked = prefs.accent;
  q("#masterVolume").value = prefs.volume;
  q("#masterVolumeValue").textContent = prefs.volume + "%";
  setMasterVolume(prefs.volume / 100);
  setBpm(prefs.bpm);
  renderBeats();
  q("#harmonyRoot").value = prefs.root;
  q("#harmonyMode").value = prefs.mode;
  q("#barsPerChord").value = prefs.bars;
  q("#progressionLoop").checked = prefs.loop;
  q("#progressionClick").checked = prefs.click;
  const previousSequence = read("fretlab.sequence", null);
  if (Array.isArray(previousSequence) && previousSequence.length <= 16) {
    sequence = previousSequence
      .filter(
        (c) =>
          c &&
          Number.isInteger(c.root) &&
          c.root >= 0 &&
          c.root < 12 &&
          ["", "m", "dim"].includes(c.quality),
      )
      .map((c) => ({
        root: c.root,
        quality: c.quality,
        intervals:
          c.quality === "dim"
            ? [0, 3, 6]
            : c.quality === "m"
              ? [0, 3, 7]
              : [0, 4, 7],
        degree: typeof c.degree === "string" ? c.degree.slice(0, 8) : "",
      }));
    renderField();
    renderSequence();
  } else presetSequence();
  q("#tunerTuning").value = prefs.tuning;
  q("#tunerCalibration").value = prefs.calibration;
  renderReferences();
  renderEarStats();
  renderStudyStats();
  const routeFromHash = () => {
    const view = {
      "#estudio": "studio",
      "#shapes": "library",
      "#praticar": "tools",
    }[location.hash];
    if (view) showView(view);
  };
  window.addEventListener("hashchange", routeFromHash);
  routeFromHash();
  window.FretStudio = {
    stopTuner,
    stopTransport,
    isProgressionPlaying: () => transport?.kind === "progression",
  };
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      earRequest++;
      stopTransport();
      stopTuner();
      stopTones();
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      const wasPlaying = !!transport;
      earRequest++;
      stopTransport();
      stopTuner();
      stopTones();
      if (wasPlaying)
        q("#metroStatus").textContent =
          "Áudio pausado ao sair desta aba. Inicie novamente ao voltar.";
    } else studyTick();
  });
  window.addEventListener("pagehide", () => {
    stopTransport();
    stopTuner();
    stopTones();
  });
})();
