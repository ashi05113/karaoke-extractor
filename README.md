# 🎤 Karaoke Extractor AI

A web application that uses **Demucs AI** to separate vocals from instrumentals in YouTube and Instagram Reel videos — giving you a ready-to-sing karaoke track in seconds.

> ⚠️ **Legal Notice:** Only process content you own or have explicit permission to use. This tool is intended for personal use on content you have rights to. Respect copyright law and the terms of service of source platforms.

---

## ✨ Features

- 🎹 **AI Vocal Separation** via Facebook's Demucs (state-of-the-art source separation)
- 📥 **YouTube & Instagram Reels** download via yt-dlp
- 🎵 **Three output tracks:** Instrumental (karaoke), Vocals Only, Original Audio
- 💾 **MP3 + WAV** download for each track
- 📊 **Progress tracking** with live status updates
- 🕐 **Processing history** in the UI
- 🌙 **Dark neon glassmorphism** UI — looks great on mobile too
- 🧹 **Auto-cleanup** of temp files after 1 hour

---

## 🗂 Project Structure

```
karaoke-extractor/
│
├── app.py               ← Flask backend (API + file serving)
├── requirements.txt     ← Python dependencies
├── Procfile             ← For Render / Heroku deployment
├── render.yaml          ← Render.com config
├── setup.bat            ← Windows one-click setup
├── start.bat            ← Windows one-click start
├── .gitignore
│
├── static/
│   ├── css/style.css    ← All styles (dark neon theme)
│   └── js/app.js        ← Frontend logic
│
├── templates/
│   └── index.html       ← Main page
│
├── downloads/           ← Temp: downloaded videos (auto-cleaned)
├── uploads/             ← Reserved for future drag-drop uploads
└── output/              ← Temp: processed audio files (auto-cleaned)
```

---

## 🪟 Windows Setup

### Prerequisites

| Tool    | Download |
|---------|----------|
| Python 3.10+ | https://python.org/downloads |
| FFmpeg  | https://www.gyan.dev/ffmpeg/builds/ → `ffmpeg-release-essentials.zip` |
| Git (optional) | https://git-scm.com |

#### FFmpeg Installation (Windows)
1. Download `ffmpeg-release-essentials.zip` from the link above
2. Extract to `C:\ffmpeg`
3. Open **System Properties → Environment Variables → Path** and add `C:\ffmpeg\bin`
4. Open a new terminal and verify: `ffmpeg -version`

### Install & Run

**Option A — One-click (recommended):**
```bat
setup.bat    ← installs everything
start.bat    ← starts the server + opens browser
```

**Option B — Manual:**
```bat
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Open your browser at **http://localhost:5000**

---

## 🐧 Linux / macOS Setup

```bash
# Install FFmpeg
# Ubuntu/Debian:
sudo apt install ffmpeg
# macOS:
brew install ffmpeg

# Create venv and install
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Run
python app.py
```

---

## 🚀 Deployment on Render.com

### Steps

1. **Push to GitHub:**
   ```bash
   git init
   git add .
   git commit -m "initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/karaoke-extractor.git
   git push -u origin main
   ```

2. **Create a new Web Service on Render:**
   - Go to https://dashboard.render.com → **New → Web Service**
   - Connect your GitHub repo

3. **Configure the service:**
   | Setting | Value |
   |---------|-------|
   | Runtime | Python 3 |
   | Build Command | `pip install -r requirements.txt` |
   | Start Command | `gunicorn app:app --workers 2 --timeout 600 --bind 0.0.0.0:$PORT` |
   | Instance Type | **Standard** (at minimum — Demucs is CPU-heavy) |

4. **Add environment variable:**
   - Key: `SECRET_KEY` → Value: (generate a random string)

5. **Add a Persistent Disk** (important — ephemeral storage loses files):
   - Mount path: `/opt/render/project/src`
   - Size: 10 GB minimum

6. **FFmpeg on Render:**
   Add a `build.sh` file and set it as the build command if FFmpeg isn't available:
   ```bash
   #!/usr/bin/env bash
   apt-get install -y ffmpeg
   pip install -r requirements.txt
   ```

7. Click **Deploy**. First deploy downloads the Demucs model (~300 MB) — allow 5–10 minutes.

### ⚠️ Render Free Tier Note
The free tier sleeps after inactivity and has limited CPU. Demucs requires significant compute — use the **Standard** plan or higher for reliable results.

---

## 🔌 API Reference

### `POST /api/extract`
Start a processing job.
```json
// Request
{ "url": "https://youtube.com/watch?v=..." }

// Response
{ "job_id": "uuid-here" }
```

### `GET /api/status/<job_id>`
Poll job status.
```json
{
  "status": "processing | done | error",
  "progress": 65,
  "message": "🤖 Running Demucs AI…",
  "title": "Video Title",
  "files": {
    "instrumental": { "mp3": "/download/.../instrumental.mp3", "wav": "...", "duration": 213.4, "size_mb": 4.2 },
    "vocals":       { ... },
    "original":     { ... }
  }
}
```

### `GET /download/<job_id>/<filename>`
Download a processed file (`instrumental.mp3`, `instrumental.wav`, `vocals.mp3`, `vocals.wav`, `original.mp3`, `original.wav`).

### `GET /api/history`
Returns list of recently completed jobs (last 10, in-memory only — resets on server restart).

---

## 🛠 Troubleshooting

| Problem | Fix |
|---------|-----|
| `ffmpeg not found` | Ensure FFmpeg is installed and on PATH |
| `demucs` takes very long | Normal — first run downloads the AI model (~300 MB). Subsequent runs are faster. |
| Instagram URL fails | Instagram requires cookies for some reels. Add `--cookies-from-browser chrome` to yt-dlp options in `app.py`. |
| Out of memory | Demucs needs ~4 GB RAM. Use a machine/VM with sufficient memory. |
| Port already in use | Change port: `python app.py` then edit `app.run(port=5001)` |

---

## 📦 Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Flask 3 (Python) |
| AI Model | Demucs (Facebook Research) — `htdemucs` |
| Download | yt-dlp |
| Audio | FFmpeg + pydub |
| Frontend | Vanilla HTML/CSS/JS |
| Fonts | Syne + JetBrains Mono (Google Fonts) |
| Deploy | Render.com / Gunicorn |

---

## 📄 License

MIT — see LICENSE file. Use responsibly and only on content you have rights to process.
