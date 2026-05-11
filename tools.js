"use strict";

const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT_MAP = { Db: "C#", Eb: "D#", Fb: "E", Gb: "F#", Ab: "G#", Bb: "A#", Cb: "B" };
const FLAT_DISPLAY = { "C#": "Db", "D#": "Eb", "F#": "Gb", "G#": "Ab", "A#": "Bb" };
const INTERVALS = {
  "": [0, 4, 7],
  m: [0, 3, 7],
  7: [0, 4, 7, 10],
  m7: [0, 3, 7, 10],
  M7: [0, 4, 7, 11],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  6: [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  9: [0, 4, 7, 10, 14],
  m9: [0, 3, 7, 10, 14],
  m7b5: [0, 3, 6, 10],
  dim7: [0, 3, 6, 9],
  add9: [0, 4, 7, 14],
  "7sus4": [0, 5, 7, 10],
  mM7: [0, 3, 7, 11],
};
const QUALITY_NAMES = {
  "": "Major",
  m: "Minor",
  7: "Dominant 7th",
  m7: "Minor 7th",
  M7: "Major 7th",
  sus2: "Suspended 2nd",
  sus4: "Suspended 4th",
  dim: "Diminished",
  aug: "Augmented",
  6: "Major 6th",
  m6: "Minor 6th",
  9: "Dominant 9th",
  m9: "Minor 9th",
  m7b5: "Half-diminished",
  dim7: "Diminished 7th",
  add9: "Add 9",
  "7sus4": "Dominant 7th sus4",
  mM7: "Minor major 7th",
};
const QUALITY_PRIORITY = {
  "": 1,
  m: 1,
  sus4: 0.96,
  sus2: 0.96,
  7: 0.93,
  m7: 0.93,
  dim: 0.9,
  aug: 0.9,
  6: 0.88,
  m6: 0.88,
  M7: 0.88,
  m7b5: 0.86,
  dim7: 0.86,
  add9: 0.84,
  "7sus4": 0.84,
  mM7: 0.82,
  9: 0.8,
  m9: 0.8,
};
const MAJOR_SCALE = [
  { semitones: 0, quality: "", label: "I" },
  { semitones: 2, quality: "m", label: "ii" },
  { semitones: 4, quality: "m", label: "iii" },
  { semitones: 5, quality: "", label: "IV" },
  { semitones: 7, quality: "", label: "V" },
  { semitones: 9, quality: "m", label: "vi" },
  { semitones: 11, quality: "dim", label: "vii°" },
];
const MINOR_SCALE = [
  { semitones: 0, quality: "m", label: "i" },
  { semitones: 2, quality: "dim", label: "ii°" },
  { semitones: 3, quality: "", label: "III" },
  { semitones: 5, quality: "m", label: "iv" },
  { semitones: 7, quality: "m", label: "v" },
  { semitones: 8, quality: "", label: "VI" },
  { semitones: 10, quality: "", label: "VII" },
];
const PRESETS = {
  major: [
    { name: "Pop", degrees: [0, 4, 5, 3], label: "I - V - vi - IV" },
    { name: "Rock", degrees: [0, 3, 4], label: "I - IV - V" },
    { name: "50s", degrees: [0, 5, 3, 4], label: "I - vi - IV - V" },
    { name: "Axis", degrees: [5, 3, 0, 4], label: "vi - IV - I - V" },
    { name: "Jazz ii-V-I", degrees: [1, 4, 0], label: "ii - V - I" },
    { name: "Pachelbel", degrees: [0, 4, 5, 2, 3, 0, 3, 4], label: "I - V - vi - iii - IV - I - IV - V" },
  ],
  minor: [
    { name: "Minor Pop", degrees: [0, 5, 2, 6], label: "i - VI - III - VII" },
    { name: "Andalusian", degrees: [0, 6, 5, 4], label: "i - VII - VI - V" },
    { name: "Minor Blues", degrees: [0, 3, 4], label: "i - iv - v" },
  ],
};

const identifierState = {
  audioCtx: null,
  analyser: null,
  stream: null,
  listening: false,
  raf: 0,
  lastFrameAt: 0,
  lastChordAt: 0,
  currentChord: "",
  vote: [],
  history: [],
};

const progressionState = {
  key: "C",
  mode: "major",
  chords: [],
  bpm: 100,
  audioCtx: null,
  masterGain: null,
  oscillators: [],
  timer: 0,
  playing: false,
};

document.addEventListener("DOMContentLoaded", () => {
  initToolNavigation();
  if (document.querySelector("#mic-btn")) initIdentifier();
  if (document.querySelector("#key-selector")) initProgressions();
});

function initToolNavigation() {
  const toggle = document.querySelector(".mobile-menu-toggle");
  const nav = document.querySelector(".mobile-nav");
  if (!toggle || !nav) return;
  toggle.addEventListener("click", () => {
    const expanded = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!expanded));
    toggle.classList.toggle("active", !expanded);
    nav.classList.toggle("open", !expanded);
  });
}

function initIdentifier() {
  const micBtn = document.querySelector("#mic-btn");
  micBtn.addEventListener("click", toggleIdentifierListening);
  document.querySelector("#copy-progression-btn").addEventListener("click", copyIdentifierHistory);
  document.querySelector("#clear-progression-btn").addEventListener("click", clearIdentifierHistory);
  document.querySelectorAll(".identifier-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".identifier-tab").forEach((item) => item.classList.remove("active"));
      tab.classList.add("active");
      const tabName = tab.dataset.tab;
      document.querySelector("#diagram-guitar").hidden = tabName !== "guitar";
      document.querySelector("#diagram-keyboard").hidden = tabName !== "keyboard";
    });
  });
}

async function toggleIdentifierListening() {
  if (identifierState.listening) {
    stopIdentifierListening();
    return;
  }
  await startIdentifierListening();
}

async function startIdentifierListening() {
  const status = document.querySelector("#mic-status");
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    status.textContent = "Microphone not supported in this browser.";
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 16384;
    analyser.smoothingTimeConstant = 0.5;
    audioCtx.createMediaStreamSource(stream).connect(analyser);
    Object.assign(identifierState, {
      audioCtx,
      analyser,
      stream,
      listening: true,
      lastFrameAt: 0,
      lastChordAt: 0,
      currentChord: "",
      vote: [],
    });
    document.querySelector("#mic-btn").classList.add("listening");
    document.querySelector("#mic-icon-off").hidden = true;
    document.querySelector("#mic-icon-on").hidden = false;
    document.querySelector("#volume-meter").hidden = false;
    document.querySelector("#result-area").hidden = false;
    status.textContent = "Listening... play a chord";
    analyzeIdentifierFrame();
  } catch (error) {
    status.textContent = error.name === "NotAllowedError" ? "Microphone access denied. Please allow access and try again." : "Could not access microphone.";
  }
}

function stopIdentifierListening() {
  identifierState.listening = false;
  if (identifierState.raf) cancelAnimationFrame(identifierState.raf);
  if (identifierState.stream) identifierState.stream.getTracks().forEach((track) => track.stop());
  if (identifierState.audioCtx) identifierState.audioCtx.close().catch(() => {});
  Object.assign(identifierState, { audioCtx: null, analyser: null, stream: null, raf: 0 });
  document.querySelector("#mic-btn").classList.remove("listening");
  document.querySelector("#mic-icon-off").hidden = false;
  document.querySelector("#mic-icon-on").hidden = true;
  document.querySelector("#volume-fill").style.width = "0%";
  document.querySelector("#mic-status").textContent = "Tap to start listening";
}

function analyzeIdentifierFrame(timestamp = 0) {
  if (!identifierState.listening || !identifierState.analyser || !identifierState.audioCtx) return;

  const data = new Float32Array(identifierState.analyser.frequencyBinCount);
  identifierState.analyser.getFloatFrequencyData(data);
  updateVolumeMeter(data);

  if (!identifierState.lastFrameAt || timestamp - identifierState.lastFrameAt >= 150) {
    identifierState.lastFrameAt = timestamp;
    const chroma = buildChroma(data, identifierState.audioCtx.sampleRate, identifierState.analyser.fftSize);
    const result = stabilizeIdentifierResult(identifyChord(chroma));
    renderIdentifierResult(result, timestamp);
  }
  identifierState.raf = requestAnimationFrame(analyzeIdentifierFrame);
}

function updateVolumeMeter(data) {
  let maxDb = -120;
  data.forEach((db) => {
    maxDb = Math.max(maxDb, db);
  });
  const level = clamp(((maxDb + 86) / 42) * 100, 0, 100);
  document.querySelector("#volume-fill").style.width = `${level}%`;
}

function buildChroma(data, sampleRate, fftSize) {
  const chroma = new Array(12).fill(0);
  const binHz = sampleRate / fftSize;
  data.forEach((db, bin) => {
    const frequency = bin * binHz;
    if (frequency < 55 || frequency > 1800 || db < -86) return;
    const midiFloat = 69 + 12 * Math.log2(frequency / 440);
    const midi = Math.round(midiFloat);
    const centsOffset = Math.abs(midiFloat - midi);
    const tuningWeight = Math.max(0, 1 - centsOffset / 0.5);
    const amplitude = Math.pow(10, db / 20);
    chroma[mod(midi, 12)] += amplitude * tuningWeight;
  });
  const max = Math.max(...chroma);
  return max ? chroma.map((value) => value / max) : chroma;
}

function identifyChord(chroma) {
  const total = chroma.reduce((sum, value) => sum + value, 0);
  if (total < 0.65) return null;
  let best = null;
  Object.entries(INTERVALS).forEach(([quality, intervals]) => {
    NOTES.forEach((rootName, root) => {
      const tones = new Set(intervals.map((interval) => mod(root + interval, 12)));
      let toneEnergy = 0;
      let outsideEnergy = 0;
      chroma.forEach((value, index) => {
        if (tones.has(index)) toneEnergy += value;
        else outsideEnergy += value;
      });
      const toneAverage = toneEnergy / tones.size;
      const outsideAverage = outsideEnergy / Math.max(1, 12 - tones.size);
      const score = (toneAverage + chroma[root] * 0.18 - outsideAverage * 0.62) * (QUALITY_PRIORITY[quality] || 0.8);
      if (!best || score > best.score) {
        best = {
          name: rootName + quality,
          quality,
          score,
          confidence: clamp((score - 0.28) / 0.55, 0, 1),
        };
      }
    });
  });
  return best && best.score >= 0.28 ? best : null;
}

function stabilizeIdentifierResult(result) {
  if (!result) {
    identifierState.vote = [];
    return null;
  }
  identifierState.vote.push(result.name);
  if (identifierState.vote.length > 5) identifierState.vote.shift();
  const count = identifierState.vote.filter((name) => name === result.name).length;
  return count >= 2 || result.confidence > 0.72 ? result : null;
}

function renderIdentifierResult(result, timestamp) {
  if (!result) {
    document.querySelector("#detected-chord-full").textContent = "Play a clear chord";
  document.querySelector("#confidence-fill").style.width = "0%";
  document.querySelector("#confidence-fill").className = "confidence-bar-fill";
  document.querySelector("#confidence-label").textContent = "0%";
    return;
  }
  const notes = getChordNotes(result.name);
  document.querySelector("#detected-chord").textContent = result.name;
  document.querySelector("#detected-chord-full").textContent = QUALITY_NAMES[result.quality] || "Chord";
  document.querySelector("#detected-notes").innerHTML = notes.map((note) => `<span>${escapeHtml(note)}</span>`).join("");
  const confidence = Math.round(result.confidence * 100);
  const fill = document.querySelector("#confidence-fill");
  fill.style.width = `${confidence}%`;
  fill.className = `confidence-bar-fill ${confidence >= 70 ? "high" : confidence >= 42 ? "medium" : "low"}`;
  document.querySelector("#confidence-label").textContent = `${Math.round(result.confidence * 100)}%`;
  document.querySelector("#diagram-area").hidden = false;
  renderChordDiagrams(result.name);

  if (result.name !== identifierState.currentChord && (!identifierState.lastChordAt || timestamp - identifierState.lastChordAt > 520)) {
    identifierState.currentChord = result.name;
    identifierState.lastChordAt = timestamp;
    addIdentifierHistory(result.name);
  }
}

function addIdentifierHistory(chord) {
  if (identifierState.history[identifierState.history.length - 1] !== chord) identifierState.history.push(chord);
  if (identifierState.history.length > 16) identifierState.history.shift();
  renderIdentifierHistory();
}

function renderIdentifierHistory() {
  document.querySelector("#history-area").hidden = identifierState.history.length === 0;
  document.querySelector("#history-chips").innerHTML = identifierState.history
    .map((chord, index) => `<span class="history-chip${index === identifierState.history.length - 1 ? " latest" : ""}">${escapeHtml(chord)}</span>`)
    .join("");
}

function copyIdentifierHistory() {
  if (!identifierState.history.length) return;
  copyText(identifierState.history.join(" -> "), document.querySelector("#copy-progression-btn"));
}

function clearIdentifierHistory() {
  identifierState.history = [];
  renderIdentifierHistory();
}

function initProgressions() {
  populateKeySelector();
  renderDiatonicPalette();
  renderPresets();
  renderTimeline();
  renderBpmDisplay();
  document.querySelector("#key-selector").addEventListener("change", handleKeySelect);
  document.querySelector("#prog-play-btn").addEventListener("click", toggleProgressionPlayback);
  document.querySelector("#prog-copy-btn").addEventListener("click", copyProgression);
  document.querySelector("#prog-clear-btn").addEventListener("click", clearProgression);
  document.querySelector("#bpm-down").addEventListener("click", () => changeBpm(-10));
  document.querySelector("#bpm-up").addEventListener("click", () => changeBpm(10));
}

function populateKeySelector() {
  const select = document.querySelector("#key-selector");
  const options = (mode) => NOTES.map((note) => {
    const display = FLAT_DISPLAY[note] || note;
    const selected = note === progressionState.key && mode === progressionState.mode ? " selected" : "";
    return `<option value="${note}-${mode}"${selected}>${display} ${titleCase(mode)}</option>`;
  }).join("");
  select.innerHTML = `<optgroup label="Major Keys">${options("major")}</optgroup><optgroup label="Minor Keys">${options("minor")}</optgroup>`;
}

function handleKeySelect(event) {
  const [key, mode] = event.target.value.split("-");
  progressionState.key = key;
  progressionState.mode = mode;
  clearProgression();
  renderDiatonicPalette();
  renderPresets();
}

function getDiatonicChords(rootNote = progressionState.key, mode = progressionState.mode) {
  const root = NOTES.indexOf(rootNote);
  const scale = mode === "minor" ? MINOR_SCALE : MAJOR_SCALE;
  return scale.map((degree) => {
    const note = NOTES[mod(root + degree.semitones, 12)];
    const name = note + degree.quality;
    return {
      name,
      displayName: readableChord(name),
      degree: degree.label,
      notes: getChordNotes(name),
    };
  });
}

function renderDiatonicPalette() {
  const chords = getDiatonicChords();
  const container = document.querySelector("#diatonic-palette");
  container.innerHTML = chords.map((chord, index) => `
    <button class="diatonic-card" type="button" data-index="${index}" title="Add ${escapeHtml(chord.displayName)}">
      <span class="diatonic-degree">${escapeHtml(chord.degree)}</span>
      <span class="diatonic-name">${escapeHtml(chord.displayName)}</span>
      <span class="diatonic-notes">${chord.notes.map(escapeHtml).join(" ")}</span>
      <div class="diatonic-diagram">${renderGuitarSVG(getGuitarShape(chord.name), chord.displayName)}</div>
    </button>
  `).join("");
  container.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => addToProgression(chords[Number(button.dataset.index)]));
  });
}

function renderPresets() {
  const presets = PRESETS[progressionState.mode] || PRESETS.major;
  const container = document.querySelector("#preset-buttons");
  container.innerHTML = presets.map((preset, index) => `
    <button class="preset-btn" type="button" data-index="${index}">
      <span class="preset-name">${escapeHtml(preset.name)}</span>
      <span class="preset-label">${escapeHtml(preset.label)}</span>
    </button>
  `).join("");
  container.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => loadPreset(presets[Number(button.dataset.index)]));
  });
}

function addToProgression(chord) {
  progressionState.chords.push(chord);
  renderTimeline();
}

function loadPreset(preset) {
  const diatonic = getDiatonicChords();
  progressionState.chords = preset.degrees.map((degree) => diatonic[degree]).filter(Boolean);
  stopProgressionPlayback();
  renderTimeline();
}

function renderTimeline() {
  const timeline = document.querySelector("#progression-timeline");
  const controls = document.querySelector("#progression-controls");
  const empty = document.querySelector("#prog-empty");
  const chords = progressionState.chords;
  empty.hidden = chords.length > 0;
  controls.hidden = chords.length === 0;
  timeline.innerHTML = chords.map((chord, index) => `
    <div class="progression-chip progression-chord" data-index="${index}">
      <span class="prog-chord-degree">${escapeHtml(chord.degree)}</span>
      <strong class="prog-chord-name">${escapeHtml(chord.displayName)}</strong>
      <button class="prog-chord-remove" type="button" aria-label="Remove ${escapeHtml(chord.displayName)}" data-index="${index}">&times;</button>
    </div>
    ${index < chords.length - 1 ? '<span class="prog-arrow">-&gt;</span>' : ""}
  `).join("");
  timeline.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => removeFromProgression(Number(button.dataset.index)));
  });
}

function removeFromProgression(index) {
  progressionState.chords.splice(index, 1);
  stopProgressionPlayback();
  renderTimeline();
}

function clearProgression() {
  progressionState.chords = [];
  stopProgressionPlayback();
  renderTimeline();
}

function changeBpm(delta) {
  progressionState.bpm = clamp(progressionState.bpm + delta, 40, 200);
  renderBpmDisplay();
}

function renderBpmDisplay() {
  document.querySelector("#bpm-display").textContent = `${progressionState.bpm} BPM`;
}

function toggleProgressionPlayback() {
  if (progressionState.playing) stopProgressionPlayback();
  else playProgression();
}

function playProgression() {
  if (!progressionState.chords.length) return;
  stopProgressionPlayback();
  const audioCtx = getAudioContext();
  progressionState.masterGain = audioCtx.createGain();
  progressionState.masterGain.gain.setValueAtTime(0.8, audioCtx.currentTime);
  progressionState.masterGain.connect(audioCtx.destination);
  progressionState.playing = true;
  document.querySelector("#prog-play-btn").textContent = "Stop";
  document.querySelector("#prog-play-btn").classList.add("active");

  const beat = 60 / progressionState.bpm;
  const chordDuration = beat * 2;
  const start = audioCtx.currentTime + 0.08;
  progressionState.chords.forEach((chord, index) => {
    playChord(chord.name, start + index * chordDuration, chordDuration - 0.04);
  });

  let index = 0;
  const highlight = () => {
    const chips = document.querySelectorAll(".progression-chip");
    chips.forEach((chip) => chip.classList.remove("play-highlight"));
    if (!progressionState.playing || index >= chips.length) {
      stopProgressionPlayback();
      return;
    }
    chips[index].classList.add("play-highlight");
    index += 1;
    progressionState.timer = setTimeout(highlight, chordDuration * 1000);
  };

  if (audioCtx.state === "suspended") audioCtx.resume().then(highlight);
  else highlight();
}

function stopProgressionPlayback() {
  progressionState.playing = false;
  if (progressionState.timer) clearTimeout(progressionState.timer);
  progressionState.timer = 0;
  progressionState.oscillators.forEach((oscillator) => {
    try {
      oscillator.stop();
    } catch {
      /* already stopped */
    }
  });
  progressionState.oscillators = [];
  if (progressionState.masterGain) {
    try {
      progressionState.masterGain.disconnect();
    } catch {
      /* already disconnected */
    }
  }
  progressionState.masterGain = null;
  const play = document.querySelector("#prog-play-btn");
  if (play) {
    play.textContent = "Play";
    play.classList.remove("active");
  }
  document.querySelectorAll(".progression-chip").forEach((chip) => chip.classList.remove("play-highlight"));
}

function playChord(chordName, startTime, duration) {
  const audioCtx = getAudioContext();
  const notes = getChordNotes(chordName);
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.22 / notes.length, startTime);
  gain.gain.linearRampToValueAtTime(0.18 / notes.length, startTime + 0.04);
  gain.gain.setValueAtTime(0.18 / notes.length, startTime + duration - 0.12);
  gain.gain.linearRampToValueAtTime(0.001, startTime + duration);
  gain.connect(progressionState.masterGain);
  notes.forEach((note, index) => {
    const oscillator = audioCtx.createOscillator();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(noteToFrequency(note, index < 3 ? 4 : 5), startTime);
    oscillator.connect(gain);
    oscillator.start(startTime);
    oscillator.stop(startTime + duration);
    progressionState.oscillators.push(oscillator);
  });
}

function getAudioContext() {
  if (!progressionState.audioCtx) progressionState.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return progressionState.audioCtx;
}

function copyProgression() {
  if (!progressionState.chords.length) return;
  const key = `${readableRoot(progressionState.key)} ${titleCase(progressionState.mode)}`;
  const chords = progressionState.chords.map((chord) => chord.displayName).join(" -> ");
  copyText(`${key}: ${chords}`, document.querySelector("#prog-copy-btn"));
}

function renderChordDiagrams(chordName) {
  const guitar = document.querySelector("#diagram-guitar");
  const keyboard = document.querySelector("#diagram-keyboard");
  const notes = getChordNotes(chordName);
  guitar.innerHTML = renderGuitarSVG(getGuitarShape(chordName), readableChord(chordName));
  keyboard.innerHTML = renderKeyboardSVG(notes);
}

function getChordNotes(chordName) {
  const parsed = parseChord(chordName);
  const intervals = INTERVALS[parsed.quality] || INTERVALS[""];
  return Array.from(new Set(intervals.map((interval) => NOTES[mod(parsed.root + interval, 12)])));
}

function getGuitarShape(chordName) {
  const normalized = normalizeChord(chordName);
  const open = {
    C: [-1, 3, 2, 0, 1, 0],
    D: [-1, -1, 0, 2, 3, 2],
    E: [0, 2, 2, 1, 0, 0],
    G: [3, 2, 0, 0, 0, 3],
    A: [-1, 0, 2, 2, 2, 0],
    Dm: [-1, -1, 0, 2, 3, 1],
    Em: [0, 2, 2, 0, 0, 0],
    Am: [-1, 0, 2, 2, 1, 0],
    C7: [-1, 3, 2, 3, 1, 0],
    D7: [-1, -1, 0, 2, 1, 2],
    E7: [0, 2, 0, 1, 0, 0],
    G7: [3, 2, 0, 0, 0, 1],
    A7: [-1, 0, 2, 0, 2, 0],
    B7: [-1, 2, 1, 2, 0, 2],
    Dsus4: [-1, -1, 0, 2, 3, 3],
    Asus2: [-1, 0, 2, 2, 0, 0],
    Dsus2: [-1, -1, 0, 2, 3, 0],
  };
  if (open[normalized]) return { frets: open[normalized], startFret: 0 };

  const parsed = parseChord(normalized);
  const root = NOTES[parsed.root];
  const eFret = { C: 8, "C#": 9, D: 10, "D#": 11, E: 0, F: 1, "F#": 2, G: 3, "G#": 4, A: 5, "A#": 6, B: 7 };
  const aFret = { C: 3, "C#": 4, D: 5, "D#": 6, E: 7, F: 8, "F#": 9, G: 10, "G#": 11, A: 0, "A#": 1, B: 2 };
  const quality = parsed.quality.startsWith("m") && parsed.quality !== "M7" ? "m" : "";
  const eShape = quality === "m" ? (n) => [n, n + 2, n + 2, n, n, n] : (n) => [n, n + 2, n + 2, n + 1, n, n];
  const aShape = quality === "m" ? (n) => [-1, n, n + 2, n + 2, n + 1, n] : (n) => [-1, n, n + 2, n + 2, n + 2, n];
  const useE = eFret[root] <= aFret[root];
  const fret = useE ? eFret[root] : aFret[root];
  return { frets: (useE ? eShape : aShape)(fret), startFret: Math.max(0, fret), barre: fret > 0 ? fret : 0 };
}

function renderGuitarSVG(shape, label) {
  const { frets, startFret, barre } = shape;
  const width = 138;
  const height = 164;
  const startX = 24;
  const startY = 34;
  const stringGap = 18;
  const fretGap = 26;
  let svg = `<svg class="guitar-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeHtml(label)} guitar diagram">`;
  svg += `<text x="${width / 2}" y="16" fill="currentColor" font-size="13" font-weight="800" text-anchor="middle">${escapeHtml(label)}</text>`;
  if (startFret > 0) svg += `<text x="12" y="${startY + fretGap - 6}" fill="currentColor" opacity=".65" font-size="11">${startFret}</text>`;
  if (startFret === 0) svg += `<rect x="${startX}" y="${startY - 3}" width="${stringGap * 5}" height="5" fill="currentColor" opacity=".85" rx="2"/>`;
  for (let fret = 0; fret <= 4; fret += 1) {
    const y = startY + fret * fretGap;
    svg += `<line x1="${startX}" y1="${y}" x2="${startX + stringGap * 5}" y2="${y}" stroke="currentColor" opacity=".32"/>`;
  }
  for (let string = 0; string < 6; string += 1) {
    const x = startX + string * stringGap;
    svg += `<line x1="${x}" y1="${startY}" x2="${x}" y2="${startY + fretGap * 4}" stroke="currentColor" opacity=".42"/>`;
  }
  if (barre) {
    const barreStrings = frets.map((fret, index) => (fret === barre ? index : -1)).filter((index) => index >= 0);
    if (barreStrings.length > 1) {
      const x1 = startX + barreStrings[0] * stringGap;
      const x2 = startX + barreStrings[barreStrings.length - 1] * stringGap;
      svg += `<rect x="${x1 - 5}" y="${startY + 8}" width="${x2 - x1 + 10}" height="10" rx="5" fill="#37c8a1"/>`;
    }
  }
  frets.forEach((fret, string) => {
    const x = startX + string * stringGap;
    if (fret === -1) svg += `<text x="${x}" y="${startY - 10}" fill="#ef6c5b" font-size="12" text-anchor="middle">x</text>`;
    else if (fret === 0) svg += `<circle cx="${x}" cy="${startY - 12}" r="4" fill="none" stroke="#37c8a1" stroke-width="1.5"/>`;
    else if (fret !== barre) {
      const relative = fret - (startFret > 0 ? startFret - 1 : 0);
      svg += `<circle cx="${x}" cy="${startY + (relative - 0.5) * fretGap}" r="6" fill="#37c8a1"/>`;
    }
  });
  ["E", "A", "D", "G", "B", "e"].forEach((string, index) => {
    svg += `<text x="${startX + index * stringGap}" y="${startY + fretGap * 4 + 18}" fill="currentColor" opacity=".65" font-size="9" text-anchor="middle">${string}</text>`;
  });
  svg += "</svg>";
  return svg;
}

function renderKeyboardSVG(activeKeys) {
  const white = ["C", "D", "E", "F", "G", "A", "B"];
  const black = [
    { note: "C#", left: 24 },
    { note: "D#", left: 54 },
    { note: "F#", left: 114 },
    { note: "G#", left: 144 },
    { note: "A#", left: 174 },
  ];
  let svg = '<svg class="keyboard-svg" width="228" height="112" viewBox="0 0 228 112" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Keyboard chord diagram">';
  white.forEach((note, index) => {
    const active = activeKeys.includes(note);
    svg += `<rect x="${10 + index * 30}" y="12" width="28" height="84" rx="4" fill="${active ? "#37c8a1" : "#f2f5f2"}" stroke="#101417"/>`;
    svg += `<text x="${24 + index * 30}" y="88" fill="#0F0B1A" font-size="10" font-weight="800" text-anchor="middle">${note}</text>`;
  });
  black.forEach((key) => {
    const active = activeKeys.includes(key.note);
    svg += `<rect x="${key.left}" y="12" width="18" height="54" rx="3" fill="${active ? "#F59E0B" : "#0F0B1A"}" stroke="#0F0B1A"/>`;
  });
  svg += "</svg>";
  return svg;
}

function normalizeChord(chordName) {
  const parsed = parseChord(chordName);
  if (parsed.root < 0) return chordName;
  return NOTES[parsed.root] + parsed.quality;
}

function parseChord(chordName) {
  const match = String(chordName || "").match(/^([A-G][#b]?)(.*)$/);
  if (!match) return { root: -1, quality: "" };
  const root = FLAT_MAP[match[1]] || match[1];
  return { root: NOTES.indexOf(root), quality: match[2] || "" };
}

function noteToFrequency(note, octave) {
  const index = NOTES.indexOf(FLAT_MAP[note] || note);
  if (index < 0) return 440;
  return 440 * Math.pow(2, (index - 9 + (octave - 4) * 12) / 12);
}

function readableChord(chordName) {
  const parsed = parseChord(chordName);
  if (parsed.root < 0) return chordName;
  return readableRoot(NOTES[parsed.root]) + parsed.quality;
}

function readableRoot(root) {
  return FLAT_DISPLAY[root] || root;
}

function copyText(text, button) {
  navigator.clipboard.writeText(text).then(() => flashButton(button, "Copied")).catch(() => {});
}

function flashButton(button, text) {
  if (!button) return;
  const previous = button.textContent;
  button.textContent = text;
  setTimeout(() => {
    button.textContent = previous;
  }, 1200);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function titleCase(value) {
  return String(value).replace(/^\w/, (char) => char.toUpperCase());
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function mod(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}
