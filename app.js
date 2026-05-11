"use strict";

const MAX_FILE_SIZE = 30 * 1024 * 1024;
const MAX_DURATION_SEC = 600;
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT_MAP = { Db: "C#", Eb: "D#", Fb: "E", Gb: "F#", Ab: "G#", Bb: "A#", Cb: "B" };
const BEGINNER_CHORDS = new Set(["C", "D", "E", "F", "G", "A", "Am", "Dm", "Em", "A7", "B7", "D7", "E7", "G7"]);
const BEGINNER_7THS = new Set(["A7", "B7", "D7", "E7", "G7"]);
const API_ENDPOINT = "https://vineethwilson-swaram-chord-service.hf.space/analyze";
const API_TIMEOUT_MS = 300_000;
const SUPABASE_URL = "https://jfnccekkhffonkjkmxyf.supabase.co";
const SUPABASE_KEY = "sb_publishable_KJA4VzMAjt2WVEEg0JKMfg_lDrABAZK";
const MODEL_VERSION = "btc-v1";
const BASE_URL = "https://ecoliving-tips.github.io";
const PIPED_INSTANCES = [
  "https://api.piped.private.coffee",
  "https://pipedapi.wireway.ch",
];
const PIPED_CLIENT_MAX_RETRIES = 2;
const PIPED_CLIENT_RETRY_DELAY_MS = 2000;
const METADATA_TIMEOUT_MS = 8_000;
const AUDIO_DL_TIMEOUT_MS = 60_000;
const MIN_AUDIO_BYTES = 10_000;

let supabaseClient = null;

const state = {
  selectedFile: null,
  fileUrl: "",
  analysis: null,
  transpose: 0,
  beginner: false,
  capo: 0,
  difficulty: "easy",
  blocks: [],
  raf: 0,
  youtubeId: "",
  youtubeTimer: 0,
  youtubeStartAt: 0,
  youtubeOffset: 0,
  youtubePlaying: false,
  ytPlayer: null,
  ytReady: false,
  locked: false,
  serverWarm: false,
};

const els = {};

document.addEventListener("DOMContentLoaded", init);

function init() {
  cacheElements();
  bindEvents();
  warmUpServer();
  updateAnalyzeButtonState();
  drawIdleWave();
}

function cacheElements() {
  Object.assign(els, {
    form: document.querySelector("#finder-form"),
    finderShell: document.querySelector("#finder"),
    finderLock: document.querySelector("#finder-lock"),
    lockedNewSong: document.querySelector("#locked-new-song"),
    lockedSource: document.querySelector("#locked-source"),
    uploadZone: document.querySelector("#upload-zone"),
    fileInput: document.querySelector("#file-input"),
    selectedFile: document.querySelector("#selected-file"),
    selectedFileName: document.querySelector("#selected-file-name"),
    removeFile: document.querySelector("#remove-file"),
    youtubeUrl: document.querySelector("#youtube-url"),
    clearUrl: document.querySelector("#clear-url"),
    analyzeButton: document.querySelector("#analyze-button"),
    progressSection: document.querySelector("#progress-section"),
    progressTitle: document.querySelector("#progress-title"),
    progressPercent: document.querySelector("#progress-percent"),
    progressBar: document.querySelector("#progress-bar"),
    progressDetail: document.querySelector("#progress-detail"),
    stepSource: document.querySelector("#step-source"),
    stepAnalyze: document.querySelector("#step-analyze"),
    stepReady: document.querySelector("#step-ready"),
    stepSourceLabel: document.querySelector("#step-source-label"),
    errorSection: document.querySelector("#error-section"),
    errorMessage: document.querySelector("#error-message"),
    errorReset: document.querySelector("#error-reset"),
    results: document.querySelector("#results"),
    resultsTitle: document.querySelector("#results-title"),
    analysisSummary: document.querySelector("#analysis-summary"),
    metricKey: document.querySelector("#metric-key"),
    metricKeyLabel: document.querySelector("#metric-key-label"),
    metricCount: document.querySelector("#metric-count"),
    metricDuration: document.querySelector("#metric-duration"),
    audio: document.querySelector("#audio-player"),
    youtubeFrame: document.querySelector("#youtube-frame"),
    waveCanvas: document.querySelector("#wave-canvas"),
    playButton: document.querySelector("#play-button"),
    playIcon: document.querySelector("#play-icon"),
    pauseIcon: document.querySelector("#pause-icon"),
    seek: document.querySelector("#seek"),
    durationLabel: document.querySelector("#duration-label"),
    currentChord: document.querySelector("#current-chord"),
    currentTime: document.querySelector("#current-time"),
    modeOriginal: document.querySelector("#mode-original"),
    modeBeginner: document.querySelector("#mode-beginner"),
    transposeDown: document.querySelector("#transpose-down"),
    transposeUp: document.querySelector("#transpose-up"),
    transposeReset: document.querySelector("#transpose-reset"),
    transposeValue: document.querySelector("#transpose-value"),
    beginnerNote: document.querySelector("#beginner-note"),
    capoDisplay: document.querySelector("#capo-display"),
    difficultyDisplay: document.querySelector("#difficulty-display"),
    timeline: document.querySelector("#timeline"),
    newSong: document.querySelector("#new-song"),
    newSongTop: document.querySelector("#new-song-top"),
    copyChords: document.querySelector("#copy-chords"),
  });
}

function bindEvents() {
  els.form.addEventListener("submit", handleSubmit);
  els.uploadZone.addEventListener("click", () => els.fileInput.click());
  els.uploadZone.addEventListener("dragover", handleDragOver);
  els.uploadZone.addEventListener("dragleave", handleDragLeave);
  els.uploadZone.addEventListener("drop", handleDrop);
  els.fileInput.addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    if (file) setSelectedFile(file);
  });
  els.removeFile.addEventListener("click", clearSelectedFile);
  els.youtubeUrl.addEventListener("input", handleUrlInput);
  els.clearUrl.addEventListener("click", clearYouTubeUrl);
  els.errorReset.addEventListener("click", resetApp);
  els.newSong.addEventListener("click", resetApp);
  els.newSongTop.addEventListener("click", resetApp);
  els.lockedNewSong.addEventListener("click", resetApp);
  els.playButton.addEventListener("click", togglePlayback);
  els.seek.addEventListener("input", handleSeek);
  els.audio.addEventListener("loadedmetadata", syncAudioMetadata);
  els.audio.addEventListener("timeupdate", syncPlaybackUi);
  els.audio.addEventListener("play", startSync);
  els.audio.addEventListener("pause", stopSync);
  els.audio.addEventListener("ended", handleEnded);
  els.modeOriginal.addEventListener("click", () => setMode(false));
  els.modeBeginner.addEventListener("click", () => setMode(true));
  els.transposeDown.addEventListener("click", () => applyTranspose(-1));
  els.transposeUp.addEventListener("click", () => applyTranspose(1));
  els.transposeReset.addEventListener("click", () => applyTranspose(-state.transpose));
  els.copyChords.addEventListener("click", copyChordList);
}

function handleDragOver(event) {
  event.preventDefault();
  els.uploadZone.classList.add("dragging");
}

function handleDragLeave() {
  els.uploadZone.classList.remove("dragging");
}

function handleDrop(event) {
  event.preventDefault();
  els.uploadZone.classList.remove("dragging");
  const file = event.dataTransfer.files && event.dataTransfer.files[0];
  if (file) setSelectedFile(file);
}

function setSelectedFile(file) {
  if (file.size > MAX_FILE_SIZE) {
    showError(`This file is ${(file.size / 1024 / 1024).toFixed(1)} MB. Please keep uploads under 30 MB.`);
    return;
  }

  state.selectedFile = file;
  els.selectedFileName.textContent = file.name;
  els.selectedFile.hidden = false;
  els.uploadZone.hidden = true;
  clearYouTubeUrl();
  updateAnalyzeButtonState();
}

function clearSelectedFile() {
  state.selectedFile = null;
  els.fileInput.value = "";
  els.selectedFile.hidden = true;
  els.uploadZone.hidden = false;
  updateAnalyzeButtonState();
}

function handleUrlInput() {
  const hasUrl = Boolean(els.youtubeUrl.value.trim());
  els.clearUrl.hidden = !hasUrl;
  if (extractYouTubeId(els.youtubeUrl.value)) clearSelectedFile();
  updateAnalyzeButtonState();
}

function clearYouTubeUrl() {
  state.youtubeId = "";
  els.youtubeUrl.value = "";
  els.clearUrl.hidden = true;
  updateAnalyzeButtonState();
}

function updateAnalyzeButtonState() {
  if (state.locked) return;
  const hasFile = Boolean(state.selectedFile);
  const hasValidYouTubeUrl = Boolean(extractYouTubeId(els.youtubeUrl.value));
  els.analyzeButton.disabled = !(hasFile || hasValidYouTubeUrl);
}

function getSupabase() {
  if (!supabaseClient && window.supabase) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  }
  return supabaseClient;
}

function warmUpServer() {
  const baseUrl = API_ENDPOINT.replace(/\/analyze$/, "");
  fetch(`${baseUrl}/health`, { method: "GET", mode: "no-cors" })
    .then(() => {
      state.serverWarm = true;
    })
    .catch(() => {});
}

function getAudioDuration(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    let settled = false;
    const finish = (duration) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      audio.src = "";
      resolve(duration);
    };
    audio.preload = "metadata";
    audio.onloadedmetadata = () => finish(audio.duration);
    audio.onerror = () => finish(null);
    setTimeout(() => finish(null), 5000);
    audio.src = url;
  });
}

async function fetchYouTubeMetadata(videoId) {
  try {
    const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    return { videoTitle: data.title || "", channelName: data.author_name || "" };
  } catch {
    return null;
  }
}

function parseYouTubeTitle(videoTitle, channelName) {
  let title = videoTitle || "";
  const original = title;
  const noise = [
    /\s*[\(\[](?:official\s*(?:(?:music|lyric(?:s|al)?)\s*)?video\s*(?:clip)?|official\s*(?:audio|video\s*clip|visuali[sz]er)|lyric(?:s|al)?\s*video|audio|hd|hq|full\s*song|4k|remastered|visuali[sz]er|with\s*lyrics)[\)\]]/gi,
    /\s*\|\s*(?:official\s*(?:(?:music|lyric(?:s|al)?)\s*)?video\s*(?:clip)?|official\s*(?:audio|video\s*clip|visuali[sz]er)|lyric(?:s)?\s*video|audio|hd|hq|full\s*song)\s*$/gi,
    /\s*#\w+/g,
    /\s*[-\u2013\u2014]\s*(?:official\s*(?:(?:music|lyric(?:s|al)?)\s*)?video\s*(?:clip)?|official\s*(?:audio|video\s*clip|visuali[sz]er)|lyric(?:s|al)?\s*video|audio|hd|hq|4k|remastered)\s*$/gi,
    /\s+(?:official\s+(?:(?:music|lyric(?:s|al)?)\s+)?video\s*(?:clip)?|official\s+(?:audio|video\s*clip|visuali[sz]er)|lyric(?:s|al)?\s+video)\s*$/gi,
  ];
  noise.forEach((pattern) => {
    title = title.replace(pattern, "");
  });
  const pipeIndex = title.indexOf(" | ");
  if (pipeIndex > 0) title = title.slice(0, pipeIndex);
  title = title.trim();
  [noise[3], noise[4]].forEach((pattern) => {
    title = title.replace(pattern, "").trim();
  });
  const artist = (channelName || "Unknown Artist").replace(/\s*-\s*Topic$/i, "");
  return { artist, title: title || original };
}

function generateSlug(title, artist, videoId) {
  const slugify = (value) =>
    (value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

  let slug = slugify(title);
  const artistSlug = slugify(artist);
  if (slug && artistSlug && !slug.includes(artistSlug)) slug = `${slug}-${artistSlug}`;
  return slug || videoId || "unknown";
}

async function downloadAudioBlob(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AUDIO_DL_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Audio download HTTP ${response.status}`);
    const blob = await response.blob();
    if (blob.size < MIN_AUDIO_BYTES) throw new Error(`Audio too small (${blob.size} bytes)`);
    return blob;
  } finally {
    clearTimeout(timeout);
  }
}

function checkYouTubeDuration(durationSec) {
  if (durationSec && durationSec > MAX_DURATION_SEC) {
    const minutes = Math.floor(MAX_DURATION_SEC / 60);
    const error = new Error(`This video is too long. Please use videos under ${minutes} minutes for best results.`);
    error._noRetry = true;
    throw error;
  }
}

async function tryPiped(videoId) {
  for (const instance of PIPED_INSTANCES) {
    for (let attempt = 1; attempt <= PIPED_CLIENT_MAX_RETRIES; attempt += 1) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), METADATA_TIMEOUT_MS);
        const response = await fetch(`${instance}/streams/${videoId}`, { signal: controller.signal });
        clearTimeout(timeout);

        if (response.status === 500 && attempt < PIPED_CLIENT_MAX_RETRIES) {
          await wait(PIPED_CLIENT_RETRY_DELAY_MS);
          continue;
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        if (!data.audioStreams || !data.audioStreams.length) throw new Error("No audio streams");
        checkYouTubeDuration(data.duration);

        let stream = data.audioStreams.find((item) => item.itag === 140);
        if (!stream) {
          const candidates = data.audioStreams
            .filter((item) => item.bitrate && item.bitrate < 170000)
            .sort((a, b) => b.bitrate - a.bitrate);
          stream = candidates[0] || data.audioStreams[0];
        }

        const blob = await downloadAudioBlob(stream.url);
        const ext = stream.mimeType?.includes("webm") || stream.format === "WEBMA_OPUS" ? ".webm" : ".m4a";
        return { blob, title: data.title || videoId, ext };
      } catch (error) {
        if (error._noRetry) throw error;
        if (attempt < PIPED_CLIENT_MAX_RETRIES && String(error.message).includes("500")) {
          await wait(PIPED_CLIENT_RETRY_DELAY_MS);
          continue;
        }
        break;
      }
    }
  }
  return null;
}

async function fetchYouTubeAudio(videoId) {
  const piped = await tryPiped(videoId);
  if (piped) return piped;
  throw new Error("Could not fetch audio from YouTube. Please upload the audio file instead.");
}

async function handleSubmit(event) {
  event.preventDefault();
  if (state.locked) return;
  hideError();
  hideResults();

  const youtubeUrl = els.youtubeUrl.value.trim();
  const youtubeId = extractYouTubeId(youtubeUrl);

  if (!state.selectedFile && !youtubeId) {
    showError("Choose an audio file or paste a valid YouTube link first.");
    return;
  }

  const sourceLabel = state.selectedFile ? state.selectedFile.name : "YouTube link";
  lockFinder(sourceLabel, "Processing this song...");

  try {
    showProgress("Preparing", "Checking your input...", 6, "source");
    if (state.selectedFile) {
      await analyzeFile(state.selectedFile);
    } else {
      await analyzeYouTube(youtubeUrl, youtubeId);
    }
  } catch (error) {
    showError(error.message || "The song could not be analyzed.");
  } finally {
    hideProgress();
  }
}

async function analyzeFile(file) {
  setProgressSourceLabel("Loading uploaded audio...");
  showProgress("Loading audio", "Checking file size and duration...", 12, "source");
  const duration = await getAudioDuration(file);
  if (duration && duration > MAX_DURATION_SEC) {
    throw new Error("This track is longer than 10 minutes. Please use a shorter file.");
  }

  showProgress("Processing chords", "Sending audio to the Zaitun chord system...", 35, "analyze");
  const analysis = await callChordSystem(file, null);
  analysis.source = file.name;
  analysis.mode = "system";
  if (!analysis.duration && duration) analysis.duration = duration;

  setAudioSource(file);
  logChordFinderUsage(file, analysis);
  showProgress("Chords ready", "Building the synced chord timeline...", 100, "ready");
  await wait(260);
  showAnalysis(analysis);
}

async function analyzeYouTube(url, videoId) {
  state.youtubeId = videoId;
  setProgressSourceLabel("Fetching audio from YouTube...");
  showProgress("Fetching YouTube", "Preparing the YouTube link...", 18, "source");

  const cached = await checkChordCache(videoId);
  if (cached) {
    cached.mode = "youtube";
    cached.source = url;
    showProgress("Chords ready", "Loaded cached chords for this video...", 100, "ready");
    await showYouTubePlayer(videoId);
    await wait(260);
    showAnalysis(cached);
    return;
  }

  showProgress("Fetching YouTube", "Sending the link to the Zaitun chord system...", 32, "source");
  let fileToUpload = null;
  let analysis;

  try {
    analysis = await callChordSystem(null, url);
  } catch (error) {
    if (!error._youtubeExtractionFailed) throw error;

    showProgress("Fetching YouTube", "Server extraction failed. Trying browser-side fallback...", 46, "source");
    const fetched = await fetchYouTubeAudio(videoId);
    fileToUpload = new File([fetched.blob], `${fetched.title}${fetched.ext}`, { type: fetched.blob.type });
    showProgress("Processing chords", "Sending extracted audio to the Zaitun chord system...", 68, "analyze");
    analysis = await callChordSystem(fileToUpload, null);
  }

  analysis.mode = "youtube";
  analysis.source = url;
  showProgress("Processing chords", "The Zaitun chord system returned chords. Preparing playback...", 82, "analyze");
  await showYouTubePlayer(videoId);
  enrichAndStoreYouTubeResult(videoId, analysis);
  logChordFinderUsage(fileToUpload, analysis);
  showProgress("Chords ready", "Building the synced chord timeline...", 100, "ready");
  await wait(260);
  showAnalysis(analysis);
}

function setAudioSource(file) {
  clearMedia();
  state.fileUrl = URL.createObjectURL(file);
  els.audio.src = state.fileUrl;
  els.audio.hidden = false;
  els.youtubeFrame.hidden = true;
}

async function showYouTubePlayer(videoId) {
  clearMedia();
  state.youtubeId = videoId;
  state.ytReady = false;
  els.youtubeFrame.innerHTML = '<div id="youtube-player"></div>';
  els.youtubeFrame.hidden = false;
  els.audio.hidden = true;

  try {
    await loadYouTubeApi();
    state.ytPlayer = new YT.Player("youtube-player", {
      videoId,
      playerVars: {
        autoplay: 0,
        controls: 1,
        modestbranding: 1,
        rel: 0,
        playsinline: 1,
        origin: window.location.origin,
      },
      events: {
        onReady: () => {
          state.ytReady = true;
        },
        onStateChange: handleYouTubeStateChange,
      },
    });
  } catch {
    els.youtubeFrame.innerHTML = `<iframe title="YouTube playback" src="https://www.youtube.com/embed/${encodeURIComponent(videoId)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;
  }
}

function clearMedia() {
  stopSync();
  stopYouTubeClock();
  if (state.ytPlayer && typeof state.ytPlayer.destroy === "function") {
    state.ytPlayer.destroy();
  }
  state.ytPlayer = null;
  state.ytReady = false;
  if (state.fileUrl) {
    URL.revokeObjectURL(state.fileUrl);
    state.fileUrl = "";
  }
  els.audio.pause();
  els.audio.removeAttribute("src");
  els.audio.load();
  els.youtubeFrame.innerHTML = "";
  els.youtubeFrame.hidden = true;
  els.audio.hidden = false;
  state.youtubeId = "";
}

function showAnalysis(analysis) {
  state.analysis = normalizeRemoteAnalysis(analysis);
  state.transpose = 0;
  state.beginner = false;
  state.capo = 0;
  state.difficulty = "easy";

  els.results.hidden = false;
  lockFinder(state.analysis.source || "Current song", "Current song is loaded");
  els.resultsTitle.textContent = "Ready to play";
  els.analysisSummary.textContent = getSummaryText(state.analysis);
  els.metricKey.textContent = state.analysis.key || "-";
  els.metricKeyLabel.textContent = state.analysis.keySource === "system" ? "System key" : "Est. key";
  els.metricKey.title =
    state.analysis.keySource === "system"
      ? "Detected by the Zaitun chord system"
      : "Estimated from the detected chord roots";
  els.metricCount.textContent = String(state.analysis.chords.length);
  els.metricDuration.textContent = formatTime(state.analysis.duration || getAnalysisEndTime(state.analysis));
  els.durationLabel.textContent = formatTime(state.analysis.duration || getAnalysisEndTime(state.analysis));
  els.transposeValue.textContent = "0";
  els.modeOriginal.classList.add("active");
  els.modeBeginner.classList.remove("active");
  els.beginnerNote.hidden = true;
  renderTimeline();
  syncPlaybackUi();
  els.results.scrollIntoView({ behavior: "smooth", block: "start" });
}

function getSummaryText(analysis) {
  const keyText =
    analysis.keySource === "system"
      ? `${analysis.key || "The key"} came from the Zaitun chord system.`
      : `${analysis.key || "The key"} was estimated from the detected chord roots because the system did not return a key.`;
  if (analysis.confidence) {
    const confidence = Math.round(analysis.confidence * 100);
    return `${keyText} ${analysis.source || "Audio"} produced ${analysis.chords.length} chord regions with about ${confidence}% average confidence.`;
  }
  return `${keyText} ${analysis.source || "Audio"} produced ${analysis.chords.length} chord regions.`;
}

function renderTimeline() {
  const analysis = state.analysis;
  if (!analysis) return;
  const total = analysis.duration || getAnalysisEndTime(analysis);
  els.timeline.innerHTML = "";

  state.blocks = analysis.chords.map((event, index) => {
    const block = document.createElement("button");
    const display = getDisplayChord(event.chord);
    const original = transposeChord(event.chord, state.transpose);
    const showOriginal = state.beginner && display !== original;
    const width = clamp((event.duration / Math.max(1, total)) * 920, 78, 210);

    block.className = "chord-block";
    block.type = "button";
    block.style.minWidth = `${width}px`;
    block.dataset.index = String(index);
    block.innerHTML = `
      <span class="chord-name">${escapeHtml(display)}</span>
      ${showOriginal ? `<span class="chord-original">${escapeHtml(original)}</span>` : ""}
      <span class="chord-time">${formatTime(event.time)}</span>
    `;
    block.addEventListener("click", () => seekTo(event.time));
    els.timeline.appendChild(block);
    return block;
  });
}

function setMode(beginner) {
  state.beginner = beginner;
  els.modeOriginal.classList.toggle("active", !beginner);
  els.modeBeginner.classList.toggle("active", beginner);

  if (beginner && state.analysis) {
    state.capo = findOptimalCapo(state.analysis.chords, state.transpose);
    state.difficulty = computeDifficulty(state.analysis.chords, state.capo, state.transpose);
    els.capoDisplay.textContent = state.capo > 0 ? `Capo ${state.capo}` : "No capo";
    els.difficultyDisplay.textContent = titleCase(state.difficulty);
  }

  els.beginnerNote.hidden = !beginner;
  renderTimeline();
  syncPlaybackUi();
}

function applyTranspose(delta) {
  const next = clamp(state.transpose + delta, -11, 11);
  state.transpose = next;
  els.transposeValue.textContent = String(next);
  if (state.beginner) setMode(true);
  renderTimeline();
  syncPlaybackUi();
}

function togglePlayback() {
  if (!state.analysis) return;
  if (state.youtubeId || els.youtubeFrame.hidden === false) {
    toggleYouTubePlayback();
    return;
  }

  if (els.audio.paused) {
    els.audio.play().catch(() => showError("The browser blocked playback. Try pressing play again."));
  } else {
    els.audio.pause();
  }
}

function toggleYouTubePlayback() {
  if (state.ytPlayer && state.ytReady) {
    const playerState = state.ytPlayer.getPlayerState();
    if (playerState === 1 || playerState === 3) {
      state.ytPlayer.pauseVideo();
      state.youtubePlaying = false;
      state.youtubeOffset = getCurrentPlaybackTime();
      stopYouTubeClock();
      setPlayState(false);
    } else {
      state.ytPlayer.playVideo();
      state.youtubePlaying = true;
      startYouTubeClock();
      setPlayState(true);
    }
    return;
  }

  if (!state.youtubePlaying) {
    state.youtubePlaying = true;
    state.youtubeStartAt = performance.now();
    startYouTubeClock();
    setPlayState(true);
  } else {
    state.youtubePlaying = false;
    state.youtubeOffset = getCurrentPlaybackTime();
    stopYouTubeClock();
    setPlayState(false);
  }
}

function handleYouTubeStateChange(event) {
  if (event.data === 1 || event.data === 3) {
    state.youtubePlaying = true;
    startYouTubeClock();
    setPlayState(true);
  } else if (event.data === 0 || event.data === 2 || event.data === 5) {
    state.youtubePlaying = false;
    state.youtubeOffset = getCurrentPlaybackTime();
    stopYouTubeClock();
    setPlayState(false);
  }
  syncPlaybackUi();
}

function startYouTubeClock() {
  stopYouTubeClock();
  state.youtubeTimer = window.setInterval(syncPlaybackUi, 120);
}

function stopYouTubeClock() {
  if (state.youtubeTimer) window.clearInterval(state.youtubeTimer);
  state.youtubeTimer = 0;
}

function startSync() {
  stopSync();
  setPlayState(true);
  const tick = () => {
    syncPlaybackUi();
    state.raf = requestAnimationFrame(tick);
  };
  state.raf = requestAnimationFrame(tick);
}

function stopSync() {
  if (state.raf) cancelAnimationFrame(state.raf);
  state.raf = 0;
  if (!state.youtubePlaying) setPlayState(false);
}

function setPlayState(isPlaying) {
  els.playIcon.toggleAttribute("hidden", isPlaying);
  els.pauseIcon.toggleAttribute("hidden", !isPlaying);
  els.playButton.classList.toggle("is-playing", isPlaying);
  els.playButton.setAttribute("aria-label", isPlaying ? "Pause" : "Play");
  els.playButton.title = isPlaying ? "Pause" : "Play";
}

function syncAudioMetadata() {
  els.durationLabel.textContent = formatTime(els.audio.duration || 0);
}

function syncPlaybackUi() {
  if (!state.analysis) return;
  const time = getCurrentPlaybackTime();
  const duration = state.analysis.duration || els.audio.duration || getAnalysisEndTime(state.analysis);
  const activeIndex = findActiveChordIndex(time);

  els.currentTime.textContent = formatTime(time);
  els.currentChord.textContent = activeIndex >= 0 ? getDisplayChord(state.analysis.chords[activeIndex].chord) : "-";
  els.seek.value = String(clamp((time / Math.max(1, duration)) * 1000, 0, 1000));

  state.blocks.forEach((block, index) => {
    block.classList.toggle("active", index === activeIndex);
    block.classList.toggle("past", index < activeIndex);
  });

  const activeBlock = state.blocks[activeIndex];
  if (activeBlock) activeBlock.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
}

function getCurrentPlaybackTime() {
  if (!els.audio.hidden && els.audio.src) return els.audio.currentTime || 0;
  if (state.ytPlayer && state.ytReady && typeof state.ytPlayer.getCurrentTime === "function") {
    return state.ytPlayer.getCurrentTime() || 0;
  }
  if (state.youtubePlaying) {
    return state.youtubeOffset + (performance.now() - state.youtubeStartAt) / 1000;
  }
  return state.youtubeOffset || 0;
}

function handleSeek() {
  if (!state.analysis) return;
  const duration = state.analysis.duration || els.audio.duration || getAnalysisEndTime(state.analysis);
  const target = (Number(els.seek.value) / 1000) * duration;
  seekTo(target);
}

function seekTo(time) {
  if (!els.audio.hidden && els.audio.src) {
    els.audio.currentTime = time;
    if (els.audio.paused) els.audio.play().catch(() => {});
  } else if (state.ytPlayer && state.ytReady && typeof state.ytPlayer.seekTo === "function") {
    state.ytPlayer.seekTo(time, true);
    if (typeof state.ytPlayer.playVideo === "function") state.ytPlayer.playVideo();
  } else {
    state.youtubeOffset = time;
    if (state.youtubePlaying) state.youtubeStartAt = performance.now();
  }
  syncPlaybackUi();
}

function handleEnded() {
  stopSync();
  setPlayState(false);
  syncPlaybackUi();
}

function findActiveChordIndex(time) {
  const chords = state.analysis ? state.analysis.chords : [];
  let low = 0;
  let high = chords.length - 1;
  let result = -1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    if (chords[mid].time <= time) {
      result = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return result;
}

async function callChordSystem(file, youtubeUrl) {
  const formData = new FormData();
  if (file) formData.append("file", file);
  if (youtubeUrl) formData.append("youtube_url", youtubeUrl);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      const error = new Error(`Server error (${response.status}): ${text}`.trim());
      if (response.status === 502) {
        try {
          const body = JSON.parse(text);
          if (body.detail === "youtube_extraction_failed") error._youtubeExtractionFailed = true;
        } catch {
          /* ignore non-JSON error body */
        }
      }
      throw error;
    }

    state.serverWarm = true;
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function checkChordCache(videoId) {
  try {
    const client = getSupabase();
    if (!client) return null;
    const { data, error } = await client
      .from("generated_chords")
      .select("chords")
      .eq("video_id", videoId)
      .maybeSingle();
    if (error || !data || !data.chords || !data.chords.chords || !data.chords.chords.length) return null;
    return data.chords;
  } catch {
    return null;
  }
}

function storeChordCache(videoId, result, metadata) {
  try {
    const client = getSupabase();
    if (!client) return;
    const row = {
      video_id: videoId,
      chords: result,
      processing_time_ms: result.processing_time_ms || null,
    };
    if (metadata) {
      row.title = metadata.title || null;
      row.artist = metadata.artist || null;
      row.slug = metadata.slug || null;
      row.youtube_title = metadata.youtubeTitle || null;
    }
    client.from("generated_chords").upsert(row, { onConflict: "video_id" }).then(() => {}).catch(() => {});
  } catch {
    /* cache writes should never interrupt playback */
  }
}

function enrichAndStoreYouTubeResult(videoId, result) {
  fetchYouTubeMetadata(videoId)
    .then((metadata) => {
      if (!metadata) {
        storeChordCache(videoId, result, null);
        return;
      }
      const parsed = parseYouTubeTitle(metadata.videoTitle, metadata.channelName);
      storeChordCache(videoId, result, {
        title: parsed.title,
        artist: parsed.artist,
        slug: generateSlug(parsed.title, parsed.artist, videoId),
        youtubeTitle: metadata.videoTitle,
      });
    })
    .catch(() => storeChordCache(videoId, result, null));
}

function logChordFinderUsage(file, result) {
  try {
    const client = getSupabase();
    if (!client || !file) return;
    client
      .from("chord_finder_logs")
      .insert([
        {
          file_name: file.name,
          file_size_kb: Math.round(file.size / 1024),
          detected_key: result.key || null,
          chord_count: result.chords ? result.chords.length : 0,
          processing_time_ms: result.processing_time_ms || null,
        },
      ])
      .then(() => {})
      .catch(() => {});
  } catch {
    /* analytics should never interrupt playback */
  }
}

function normalizeRemoteAnalysis(raw) {
  const chords = (raw.chords || []).map((event, index, array) => {
    const time = Number(event.time ?? event.start ?? 0);
    const next = array[index + 1];
    const nextTime = next ? Number(next.time ?? next.start ?? time + 2) : null;
    let duration = Number(event.duration);
    if (!Number.isFinite(duration) || duration <= 0) duration = Number(event.end) - time;
    if ((!Number.isFinite(duration) || duration <= 0) && nextTime !== null) duration = nextTime - time;
    return {
      time,
      duration: Number.isFinite(duration) && duration > 0 ? duration : 2,
      chord: String(event.chord || event.label || "N.C."),
      confidence: Number(event.confidence || raw.confidence || 0.5),
    };
  });

  const endTime = chords.reduce((max, event) => Math.max(max, event.time + event.duration), 0);
  const systemKey = typeof raw.key === "string" && raw.key.trim() ? raw.key.trim() : "";
  return {
    key: systemKey || estimateKeyFromChords(chords),
    keySource: systemKey ? "system" : "estimated",
    chords,
    duration: Number(raw.duration || endTime || 0),
    confidence: Number(raw.confidence || average(chords.map((event) => event.confidence || 0))),
    source: raw.source || raw.title || "",
    mode: raw.mode || "remote",
  };
}

let youtubeApiPromise = null;

function loadYouTubeApi() {
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise((resolve, reject) => {
    const previousCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof previousCallback === "function") previousCallback();
      resolve();
    };

    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = reject;
    document.head.appendChild(script);
  });

  return youtubeApiPromise;
}

function drawIdleWave() {
  const canvas = els.waveCanvas;
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  paintCanvasBackground(ctx, width, height);
  ctx.strokeStyle = "rgba(34, 211, 238, 0.72)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let x = 0; x < width; x += 1) {
    const t = x / width;
    const y = height * 0.5 + Math.sin(t * Math.PI * 10) * 26 + Math.sin(t * Math.PI * 21) * 10;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.fillStyle = "rgba(242, 245, 242, 0.7)";
  ctx.font = "700 16px system-ui";
  ctx.fillText("Waveform appears here after upload", 26, height - 28);
}

function drawWaveform(samples, sampleRate) {
  const canvas = els.waveCanvas;
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const samplesPerPixel = Math.max(1, Math.floor(samples.length / width));

  ctx.clearRect(0, 0, width, height);
  paintCanvasBackground(ctx, width, height);

  ctx.strokeStyle = "rgba(34, 211, 238, 0.9)";
  ctx.lineWidth = 2;
  ctx.beginPath();

  for (let x = 0; x < width; x += 1) {
    const start = x * samplesPerPixel;
    let peak = 0;
    for (let i = start; i < start + samplesPerPixel && i < samples.length; i += 1) {
      peak = Math.max(peak, Math.abs(samples[i]));
    }
    const y1 = height / 2 - peak * height * 0.42;
    const y2 = height / 2 + peak * height * 0.42;
    ctx.moveTo(x, y1);
    ctx.lineTo(x, y2);
  }

  ctx.stroke();

  const duration = samples.length / sampleRate;
  ctx.fillStyle = "rgba(240, 184, 74, 0.82)";
  ctx.font = "800 15px system-ui";
  ctx.fillText(`Analyzed ${formatTime(duration)} of audio`, 24, 30);
}

function paintCanvasBackground(ctx, width, height) {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#0b0f10");
  gradient.addColorStop(0.55, "#12201e");
  gradient.addColorStop(1, "#201914");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.055)";
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 44) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
}

function showProgress(title, detail, percent, step = "source") {
  els.progressSection.hidden = false;
  els.progressTitle.textContent = title;
  els.progressDetail.textContent = detail;
  els.progressPercent.textContent = `${Math.round(percent)}%`;
  els.progressBar.style.width = `${clamp(percent, 0, 100)}%`;
  setProgressStep(step);
}

function hideProgress() {
  els.progressSection.hidden = true;
}

function setProgressSourceLabel(label) {
  els.stepSourceLabel.textContent = label;
}

function setProgressStep(activeStep) {
  const order = ["source", "analyze", "ready"];
  const stepEls = {
    source: els.stepSource,
    analyze: els.stepAnalyze,
    ready: els.stepReady,
  };
  const activeIndex = Math.max(0, order.indexOf(activeStep));

  order.forEach((step, index) => {
    const element = stepEls[step];
    element.classList.toggle("active", index === activeIndex);
    element.classList.toggle("complete", index < activeIndex);
  });
}

function lockFinder(sourceName, lockTitle) {
  const isProcessing = lockTitle === "Processing this song...";
  state.locked = true;
  els.form.classList.add("is-locked");
  els.finderShell.classList.add("is-processing");
  els.finderLock.hidden = false;
  els.lockedSource.textContent = sourceName || "Current song";
  els.finderLock.querySelector("span").textContent = lockTitle || "Current song is loaded";
  els.lockedNewSong.disabled = isProcessing;
  els.lockedNewSong.textContent = isProcessing ? "Processing..." : "Find new one";
  setInputControlsDisabled(true);
  els.analyzeButton.textContent = isProcessing ? "Processing..." : "Song loaded";
}

function unlockFinder() {
  state.locked = false;
  els.form.classList.remove("is-locked");
  els.finderShell.classList.remove("is-processing");
  els.finderLock.hidden = true;
  setInputControlsDisabled(false);
  els.analyzeButton.innerHTML = `
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M9 18V5l12-2v13"></path>
      <circle cx="6" cy="18" r="3"></circle>
      <circle cx="18" cy="16" r="3"></circle>
    </svg>
    Find chords
  `;
  updateAnalyzeButtonState();
}

function setInputControlsDisabled(disabled) {
  els.uploadZone.disabled = disabled;
  els.fileInput.disabled = disabled;
  els.removeFile.disabled = disabled;
  els.youtubeUrl.disabled = disabled;
  els.clearUrl.disabled = disabled;
  els.analyzeButton.disabled = disabled;
}

function showError(message) {
  els.errorMessage.textContent = message;
  els.errorSection.hidden = false;
}

function hideError() {
  els.errorSection.hidden = true;
}

function hideResults() {
  els.results.hidden = true;
}

function resetApp() {
  hideError();
  hideResults();
  hideProgress();
  unlockFinder();
  clearMedia();
  clearSelectedFile();
  clearYouTubeUrl();
  state.analysis = null;
  state.transpose = 0;
  state.beginner = false;
  state.capo = 0;
  state.blocks = [];
  state.youtubeOffset = 0;
  state.youtubePlaying = false;
  state.locked = false;
  els.currentChord.textContent = "-";
  els.currentTime.textContent = "0:00";
  els.seek.value = "0";
  setPlayState(false);
  drawIdleWave();
  document.querySelector("#finder").scrollIntoView({ behavior: "smooth", block: "start" });
}

function getDisplayChord(rawChord) {
  if (state.beginner) {
    const simple = simplifyChord(rawChord);
    return transposeChord(simple, -state.capo + state.transpose);
  }
  return transposeChord(rawChord, state.transpose);
}

function transposeChord(chord, semitones) {
  if (!chord || chord === "N.C." || semitones === 0) return chord;
  if (chord.includes("/")) {
    return chord
      .split("/")
      .map((part) => transposeChord(part, semitones))
      .join("/");
  }

  const parsed = parseChord(chord);
  if (parsed.root < 0) return chord;
  return NOTE_NAMES[mod(parsed.root + semitones, 12)] + parsed.quality;
}

function simplifyChord(chord) {
  if (!chord || chord === "N.C.") return chord;
  const base = chord.split("/")[0];
  const parsed = parseChord(base);
  if (parsed.root < 0) return base;
  const root = NOTE_NAMES[parsed.root];
  const quality = parsed.quality;

  if (quality === "m" || quality === "") return root + quality;
  if (quality === "5" || quality.includes("sus") || quality.includes("aug")) return root;
  if (quality.includes("dim")) return `${root}m`;
  if (quality.includes("m")) return `${root}m`;
  if (quality.startsWith("7") || quality.includes("7")) return BEGINNER_7THS.has(`${root}7`) ? `${root}7` : root;
  return root;
}

function findOptimalCapo(events, transpose) {
  let best = 0;
  let bestScore = -1;
  for (let capo = 0; capo <= 7; capo += 1) {
    let score = 0;
    for (const event of events) {
      const chord = transposeChord(simplifyChord(event.chord), -capo + transpose);
      if (BEGINNER_CHORDS.has(chord)) score += Math.max(0.5, event.duration || 1);
    }
    if (score > bestScore) {
      bestScore = score;
      best = capo;
    }
  }
  return best;
}

function computeDifficulty(events, capo, transpose) {
  const unique = new Set(events.map((event) => transposeChord(simplifyChord(event.chord), -capo + transpose)));
  let easy = 0;
  unique.forEach((chord) => {
    if (BEGINNER_CHORDS.has(chord)) easy += 1;
  });
  const ratio = easy / Math.max(1, unique.size);
  if (ratio >= 0.95) return "easy";
  if (ratio >= 0.68) return "moderate";
  return "advanced";
}

function parseChord(chord) {
  const match = String(chord).match(/^([A-G][#b]?)(.*)$/);
  if (!match) return { root: -1, quality: "" };
  const rootName = FLAT_MAP[match[1]] || match[1];
  return { root: NOTE_NAMES.indexOf(rootName), quality: match[2] || "" };
}

function estimateKeyFromChords(chords) {
  const roots = new Array(12).fill(0);
  chords.forEach((event) => {
    const root = parseChord(event.chord).root;
    if (root >= 0) roots[root] += event.duration || 1;
  });
  const root = roots.indexOf(Math.max(...roots));
  return root >= 0 ? NOTE_NAMES[root] : "C";
}

function extractYouTubeId(url) {
  const value = String(url || "").trim();
  const patterns = [
    /youtube\.com\/watch\?.*v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match) return match[1];
  }
  return "";
}

function copyChordList() {
  if (!state.analysis) return;
  const text = state.analysis.chords
    .map((event) => `${formatTime(event.time)}  ${getDisplayChord(event.chord)}`)
    .join("\n");
  navigator.clipboard
    .writeText(text)
    .then(() => {
      els.copyChords.textContent = "Copied";
      setTimeout(() => {
        els.copyChords.textContent = "Copy chords";
      }, 1200);
    })
    .catch(() => showError("Clipboard access is not available in this browser."));
}

function getAnalysisEndTime(analysis) {
  return analysis.chords.reduce((max, event) => Math.max(max, event.time + event.duration), 0);
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatTime(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  return `${minutes}:${String(secs).padStart(2, "0")}`;
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

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
