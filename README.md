# Zaitun Chords

A static chord finder for the Zaitun chord system. It supports:

- Audio upload analysis through the Zaitun chord system
- Synced playback timeline
- Transpose controls
- Beginner mode with capo suggestion
- Browser-based chord identifier
- Chord progression builder with playback
- YouTube URL analysis through the same system, with browser-side fallback

## Run locally

Open `index.html` directly, or serve the folder:

```sh
python3 -m http.server 4173
```

Then visit `http://localhost:4173`.

Standalone tools:

- `chord-identifier.html`
- `chord-progressions.html`

## System config

By default, the frontend calls the shared organization chord service:

```js
API_ENDPOINT = "https://vineethwilson-swaram-chord-service.hf.space/analyze"
MAX_FILE_SIZE = 30 MB
MAX_DURATION_SEC = 600
API_TIMEOUT_MS = 300000
MODEL_VERSION = "btc-v1"
BASE_URL = "https://ecoliving-tips.github.io"
```

The endpoint accepts `multipart/form-data` with either `file` or `youtube_url`, and returns:

```json
{
  "key": "G",
  "duration": 184,
  "confidence": 0.76,
  "chords": [
    { "time": 0, "duration": 2.4, "chord": "G" },
    { "time": 2.4, "duration": 2.4, "chord": "Em" }
  ]
}
```
