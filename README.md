# Zaitun Chords

A static chord finder for the Zaitun chord system. It supports:

- Audio upload analysis through the Zaitun chord system
- Synced playback timeline
- Transpose controls
- Beginner mode with capo suggestion
- YouTube URL analysis through the same system, with browser-side fallback

## Run locally

Open `index.html` directly, or serve the folder:

```sh
python3 -m http.server 4173
```

Then visit `http://localhost:4173`.

## System config

By default, the frontend calls the first-party Zaitun route:

```js
API_ENDPOINT = "/api/chords/analyze"
MAX_FILE_SIZE = 30 MB
MAX_DURATION_SEC = 600
API_TIMEOUT_MS = 300000
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
