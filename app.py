"""
Karaoke Extractor AI - Flask Backend
Handles video download, audio extraction, and AI vocal separation using Demucs.
pydub removed — uses subprocess ffmpeg directly (Python 3.13 compatible).
Jobs stored in files so they survive worker restarts on Render free tier.
"""

import os
import uuid
import time
import json
import shutil
import threading
import subprocess
import sys
from pathlib import Path
from flask import Flask, render_template, request, jsonify, send_file
import yt_dlp
import ffmpeg

# ─── App Configuration ────────────────────────────────────────────────────────
app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "karaoke-extractor-secret-key")

BASE_DIR  = Path(__file__).parent
DOWNLOADS = BASE_DIR / "downloads"
UPLOADS   = BASE_DIR / "uploads"
OUTPUT    = BASE_DIR / "output"
JOBS_DIR  = BASE_DIR / "jobs"

for d in [DOWNLOADS, UPLOADS, OUTPUT, JOBS_DIR]:
    d.mkdir(exist_ok=True)

COOKIES_FILE = Path("/etc/secrets/youtube_cookies.txt")

ALLOWED_DOMAINS = [
    "youtube.com", "youtu.be", "www.youtube.com",
    "instagram.com", "www.instagram.com",
]

# ─── File-based Job Store (survives worker restarts) ──────────────────────────

def save_job(job_id: str, data: dict):
    try:
        with open(JOBS_DIR / f"{job_id}.json", "w") as f:
            json.dump(data, f)
    except Exception:
        pass


def load_job(job_id: str) -> dict | None:
    try:
        with open(JOBS_DIR / f"{job_id}.json") as f:
            return json.load(f)
    except Exception:
        return None


def update_job(job_id: str, **kwargs):
    job = load_job(job_id)
    if job:
        job.update(kwargs)
        save_job(job_id, job)


def delete_job(job_id: str):
    try:
        (JOBS_DIR / f"{job_id}.json").unlink(missing_ok=True)
    except Exception:
        pass


# ─── Helpers ──────────────────────────────────────────────────────────────────

def validate_url(url: str) -> bool:
    from urllib.parse import urlparse
    try:
        host = urlparse(url).netloc.lower()
        return any(host == d or host.endswith("." + d) for d in ALLOWED_DOMAINS)
    except Exception:
        return False


def get_audio_info(path: str) -> dict:
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "quiet", "-print_format", "json",
             "-show_format", str(path)],
            capture_output=True, text=True
        )
        info = json.loads(result.stdout)
        duration = float(info.get("format", {}).get("duration", 0))
        size_mb  = round(os.path.getsize(path) / (1024 * 1024), 2)
        return {"duration": round(duration, 1), "size_mb": size_mb}
    except Exception:
        return {"duration": 0, "size_mb": 0}


def ffmpeg_convert(src: str, dst: str, extra_args: list = []):
    cmd = ["ffmpeg", "-y", "-i", src] + extra_args + [dst]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg error: {result.stderr[-300:]}")


def cleanup_job_files(job_id: str, delay: int = 3600):
    def _delete():
        time.sleep(delay)
        for directory in [DOWNLOADS / job_id, OUTPUT / job_id]:
            if directory.exists():
                shutil.rmtree(directory, ignore_errors=True)
        delete_job(job_id)
    threading.Thread(target=_delete, daemon=True).start()


# ─── Core Processing Pipeline ─────────────────────────────────────────────────

def process_url(job_id: str, url: str):
    job_dir = DOWNLOADS / job_id
    out_dir = OUTPUT    / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    out_dir.mkdir(parents=True, exist_ok=True)

    try:
        # ── Step 1: Download ──────────────────────────────────────────────────
        update_job(job_id, status="processing", progress=5,
                   message="📥 Downloading video…")

        ydl_opts = {
            "format":      "bestaudio/best",
            "outtmpl":     str(job_dir / "%(title)s.%(ext)s"),
            "noplaylist":  True,
            "quiet":       True,
            "no_warnings": True,
            "extractor_args": {"youtube": {"player_client": ["web", "web_creator", "tv"]}},
            "http_headers": {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            },
        }

        # Add cookies if file is readable and non-empty
        try:
            with open(str(COOKIES_FILE), "r") as _f:
                if _f.read(10):
                    ydl_opts["cookiefile"] = str(COOKIES_FILE)
        except Exception:
            pass

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info        = ydl.extract_info(url, download=True)
            video_title = info.get("title", "audio")

        downloaded = list(job_dir.glob("*"))
        if not downloaded:
            raise FileNotFoundError("Download produced no files.")
        source_file = downloaded[0]

        update_job(job_id, progress=25, message="🎵 Extracting audio…",
                   title=video_title)

        # ── Step 2: Convert to WAV via FFmpeg ─────────────────────────────────
        wav_path = str(job_dir / "audio.wav")
        (
            ffmpeg
            .input(str(source_file))
            .output(wav_path, ac=2, ar=44100, acodec="pcm_s16le")
            .overwrite_output()
            .run(quiet=True)
        )

        orig_mp3 = str(out_dir / "original.mp3")
        orig_wav = str(out_dir / "original.wav")
        ffmpeg_convert(wav_path, orig_mp3, ["-b:a", "192k"])
        ffmpeg_convert(wav_path, orig_wav)

        update_job(job_id, progress=40, message="🤖 Running Demucs AI…")

        # ── Step 3: Demucs vocal separation ───────────────────────────────────
        demucs_out = job_dir / "demucs_out"
        demucs_out.mkdir(exist_ok=True)

        result = subprocess.run(
            [
                sys.executable, "-m", "demucs",
                "--two-stems", "vocals",
                "--out", str(demucs_out),
                "--mp3",
                wav_path,
            ],
            capture_output=True, text=True, timeout=600
        )

        if result.returncode != 0:
            raise RuntimeError(f"Demucs failed:\n{result.stderr[-500:]}")

        update_job(job_id, progress=80, message="💾 Packaging outputs…")

        # ── Step 4: Find Demucs output files ──────────────────────────────────
        stems_dir = list(demucs_out.rglob("no_vocals.*"))
        if not stems_dir:
            raise FileNotFoundError("Demucs output files not found.")

        stem_folder   = stems_dir[0].parent
        no_vocals_src = str(stems_dir[0])

        vocals_file = stem_folder / "vocals.mp3"
        if not vocals_file.exists():
            vocals_file = stem_folder / "vocals.wav"
        vocals_src = str(vocals_file)

        inst_mp3 = str(out_dir / "instrumental.mp3")
        inst_wav = str(out_dir / "instrumental.wav")
        ffmpeg_convert(no_vocals_src, inst_mp3, ["-b:a", "192k"])
        ffmpeg_convert(no_vocals_src, inst_wav)

        vox_mp3 = str(out_dir / "vocals.mp3")
        vox_wav = str(out_dir / "vocals.wav")
        if Path(vocals_src).exists():
            ffmpeg_convert(vocals_src, vox_mp3, ["-b:a", "192k"])
            ffmpeg_convert(vocals_src, vox_wav)

        # ── Step 5: Metadata ──────────────────────────────────────────────────
        files = {
            "instrumental": {
                "mp3": f"/download/{job_id}/instrumental.mp3",
                "wav": f"/download/{job_id}/instrumental.wav",
                **get_audio_info(inst_mp3),
            },
            "vocals": {
                "mp3": f"/download/{job_id}/vocals.mp3",
                "wav": f"/download/{job_id}/vocals.wav",
                **get_audio_info(vox_mp3),
            },
            "original": {
                "mp3": f"/download/{job_id}/original.mp3",
                "wav": f"/download/{job_id}/original.wav",
                **get_audio_info(orig_mp3),
            },
        }

        update_job(job_id, status="done", progress=100,
                   message="✅ Done!", files=files)
        cleanup_job_files(job_id, delay=3600)

    except Exception as exc:
        update_job(job_id, status="error", progress=0,
                   message=f"❌ Error: {str(exc)[:300]}")
        cleanup_job_files(job_id, delay=300)


# ─── Routes ───────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/extract", methods=["POST"])
def extract():
    data = request.get_json(silent=True) or {}
    url  = (data.get("url") or "").strip()

    if not url:
        return jsonify({"error": "No URL provided."}), 400
    if not validate_url(url):
        return jsonify({"error": "Only YouTube and Instagram URLs are supported."}), 400

    job_id = str(uuid.uuid4())
    job_data = {
        "status": "queued", "progress": 0, "message": "Queued…",
        "files": {}, "title": "", "url": url, "created": time.time(),
    }
    save_job(job_id, job_data)

    threading.Thread(target=process_url, args=(job_id, url), daemon=True).start()
    return jsonify({"job_id": job_id})


@app.route("/api/status/<job_id>")
def status(job_id: str):
    job = load_job(job_id)
    if not job:
        return jsonify({"error": "Job not found."}), 404
    return jsonify(job)


@app.route("/download/<job_id>/<filename>")
def download(job_id: str, filename: str):
    filename  = Path(filename).name
    file_path = OUTPUT / job_id / filename
    if not file_path.exists():
        return jsonify({"error": "File not found."}), 404
    return send_file(str(file_path), as_attachment=True)


@app.route("/api/history")
def history():
    recent = []
    try:
        for jfile in JOBS_DIR.glob("*.json"):
            try:
                with open(jfile) as f:
                    j = json.load(f)
                if j.get("status") == "done":
                    recent.append({
                        "job_id": jfile.stem,
                        "title": j.get("title", "Unknown"),
                        "status": j["status"],
                        "created": j.get("created", 0)
                    })
            except Exception:
                continue
    except Exception:
        pass
    recent.sort(key=lambda x: x["created"], reverse=True)
    return jsonify(recent[:10])


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
