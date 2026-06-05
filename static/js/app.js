/**
 * Karaoke Extractor AI — Frontend Logic
 * Handles URL input, API calls, progress polling, and results rendering.
 */

// ─── State ────────────────────────────────────────────────────────────────────
let currentJobId   = null;
let pollInterval   = null;

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const urlInput      = document.getElementById('urlInput');
const extractBtn    = document.getElementById('extractBtn');
const inputCard     = document.getElementById('inputCard');
const progressCard  = document.getElementById('progressCard');
const progressFill  = document.getElementById('progressFill');
const progressMsg   = document.getElementById('progressMsg');
const progressTitle = document.getElementById('progressTitle');
const resultsSection= document.getElementById('resultsSection');
const resultsGrid   = document.getElementById('resultsGrid');
const historyModal  = document.getElementById('historyModal');
const historyList   = document.getElementById('historyList');

// Step indicators
const steps = [
  document.getElementById('step1'),
  document.getElementById('step2'),
  document.getElementById('step3'),
  document.getElementById('step4'),
];

// ─── Drag-and-drop URL onto the drop zone ─────────────────────────────────────
const dropZone = document.getElementById('dropZone');

document.addEventListener('dragover', e => {
  e.preventDefault();
  inputCard.classList.add('drag-active');
});
document.addEventListener('dragleave', e => {
  if (!inputCard.contains(e.relatedTarget)) {
    inputCard.classList.remove('drag-active');
  }
});
document.addEventListener('drop', e => {
  e.preventDefault();
  inputCard.classList.remove('drag-active');
  const text = e.dataTransfer.getData('text/plain') ||
               e.dataTransfer.getData('text/uri-list');
  if (text) {
    urlInput.value = text.trim();
    urlInput.dispatchEvent(new Event('input'));
  }
});

// Also handle paste anywhere on the page
document.addEventListener('paste', e => {
  const text = (e.clipboardData || window.clipboardData).getData('text');
  if (text && isUrl(text) && document.activeElement !== urlInput) {
    urlInput.value = text.trim();
  }
});

// Enter key triggers extraction
urlInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') startExtraction();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isUrl(str) {
  return /^https?:\/\/.+/.test(str.trim());
}

function formatDuration(secs) {
  if (!secs) return '—';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2,'0')}`;
}

function setStepState(index, state) {
  // state: 'active' | 'done' | '' (reset)
  steps.forEach((el, i) => {
    el.classList.remove('active', 'done');
    if (i < index)         el.classList.add('done');
    else if (i === index)  el.classList.add(state);
  });
}

function progressToStep(progress) {
  if (progress < 25)       return 0;
  else if (progress < 40)  return 1;
  else if (progress < 80)  return 2;
  else                      return 3;
}

// ─── Start Extraction ─────────────────────────────────────────────────────────
async function startExtraction() {
  const url = urlInput.value.trim();
  if (!url) {
    shake(urlInput);
    return;
  }
  if (!isUrl(url)) {
    shake(urlInput);
    showToast('Please enter a valid URL.');
    return;
  }

  extractBtn.disabled = true;
  showProgress();

  try {
    const res  = await fetch('/api/extract', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ url }),
    });
    const data = await res.json();

    if (!res.ok || data.error) {
      showError(data.error || 'Server error. Try again.');
      return;
    }

    currentJobId = data.job_id;
    startPolling();

  } catch (err) {
    showError('Could not reach the server. Is it running?');
  }
}

// ─── Polling ──────────────────────────────────────────────────────────────────
function startPolling() {
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(pollStatus, 2000);
}

async function pollStatus() {
  if (!currentJobId) return;
  try {
    const res  = await fetch(`/api/status/${currentJobId}`);
    const job  = await res.json();

    if (job.error) {
      clearInterval(pollInterval);
      showError(job.error);
      return;
    }

    // Update progress UI
    progressFill.style.width = job.progress + '%';
    progressMsg.textContent  = job.message || '…';
    setStepState(progressToStep(job.progress), 'active');

    if (job.title) progressTitle.textContent = job.title;

    if (job.status === 'done') {
      clearInterval(pollInterval);
      setTimeout(() => showResults(job), 500);
    } else if (job.status === 'error') {
      clearInterval(pollInterval);
      showError(job.message);
    }
  } catch (err) {
    // Network blip — keep polling
  }
}

// ─── UI State Transitions ─────────────────────────────────────────────────────
function showProgress() {
  progressFill.style.width = '0%';
  progressMsg.textContent  = 'Starting…';
  progressTitle.textContent = 'Processing…';
  steps.forEach(s => s.classList.remove('active','done'));
  progressCard.classList.remove('hidden');
  resultsSection.classList.add('hidden');
}

function showResults(job) {
  progressCard.classList.add('hidden');
  resultsSection.classList.remove('hidden');
  renderResults(job.files);
}

function showError(msg) {
  extractBtn.disabled = false;
  progressCard.classList.add('hidden');
  showToast('❌ ' + msg, 5000);
}

function resetApp() {
  currentJobId = null;
  if (pollInterval) clearInterval(pollInterval);
  urlInput.value = '';
  extractBtn.disabled = false;
  resultsSection.classList.add('hidden');
  progressCard.classList.add('hidden');
  resultsGrid.innerHTML = '';
}

// ─── Results Renderer ─────────────────────────────────────────────────────────
const TRACK_META = {
  instrumental: {
    label: '🎹 Instrumental (Karaoke)',
    sub:   'Vocals removed — perfect for singing along',
    css:   'instrumental',
    emoji: '🎹',
  },
  vocals: {
    label: '🎤 Vocals Only',
    sub:   'Isolated vocal track',
    css:   'vocals',
    emoji: '🎤',
  },
  original: {
    label: '🎵 Original Audio',
    sub:   'Unmodified audio extracted from video',
    css:   'original',
    emoji: '🎵',
  },
};

function renderResults(files) {
  resultsGrid.innerHTML = '';
  const order = ['instrumental', 'vocals', 'original'];

  order.forEach((key, idx) => {
    const f    = files[key];
    const meta = TRACK_META[key];
    if (!f) return;

    const card = document.createElement('div');
    card.className = 'track-card';
    card.style.animationDelay = (idx * 0.12) + 's';

    card.innerHTML = `
      <div class="track-header">
        <div class="track-icon ${meta.css}">${meta.emoji}</div>
        <div class="track-meta">
          <div class="track-name">${meta.label}</div>
          <div class="track-info">${meta.sub} · ${formatDuration(f.duration)} · ${f.size_mb} MB</div>
        </div>
      </div>
      <audio controls preload="none" src="${f.mp3}"></audio>
      <div class="download-row">
        <a class="dl-btn mp3" href="${f.mp3}" download>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
          </svg>
          MP3
        </a>
        <a class="dl-btn wav" href="${f.wav}" download>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
          </svg>
          WAV
        </a>
      </div>
    `;
    resultsGrid.appendChild(card);
  });
}

// ─── History Modal ────────────────────────────────────────────────────────────
async function showHistory() {
  historyModal.classList.remove('hidden');
  historyList.innerHTML = '<p class="history-empty">Loading…</p>';

  try {
    const res  = await fetch('/api/history');
    const data = await res.json();

    if (!data.length) {
      historyList.innerHTML = '<p class="history-empty">No completed jobs yet.</p>';
      return;
    }

    historyList.innerHTML = data.map(j => `
      <div class="history-item">
        <div>
          <div class="history-item-title">${escapeHtml(j.title || 'Unknown')}</div>
          <div class="history-item-time">${timeAgo(j.created)}</div>
        </div>
        <span class="tag">✓ Done</span>
      </div>
    `).join('');
  } catch {
    historyList.innerHTML = '<p class="history-empty">Could not load history.</p>';
  }
}

function closeHistory() {
  historyModal.classList.add('hidden');
}
historyModal.addEventListener('click', e => {
  if (e.target === historyModal) closeHistory();
});

// ─── Toast Notification ───────────────────────────────────────────────────────
function showToast(msg, duration = 3500) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  toast.style.cssText = `
    position:fixed; bottom:28px; left:50%; transform:translateX(-50%);
    background:rgba(20,24,32,.95); border:1px solid rgba(255,255,255,.12);
    color:#e8eaf6; font-family:'Syne',sans-serif; font-size:.88rem;
    padding:12px 22px; border-radius:999px;
    box-shadow:0 4px 24px rgba(0,0,0,.5);
    z-index:999; animation:toast-in .25s ease;
    backdrop-filter:blur(12px);
    max-width:90vw; text-align:center;
  `;

  const style = document.createElement('style');
  style.textContent = '@keyframes toast-in{from{opacity:0;transform:translateX(-50%) translateY(12px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}';
  document.head.appendChild(style);
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

// ─── Shake animation for invalid input ────────────────────────────────────────
function shake(el) {
  el.style.animation = 'none';
  el.offsetHeight; // reflow
  el.style.animation = 'shake .35s ease';
  if (!document.querySelector('#shake-style')) {
    const s = document.createElement('style');
    s.id = 'shake-style';
    s.textContent = '@keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}';
    document.head.appendChild(s);
  }
}

// ─── Utils ────────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  return str.replace(/[&<>"']/g, m =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

function timeAgo(ts) {
  const diff = Math.floor((Date.now() / 1000) - ts);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  return `${Math.floor(diff/3600)}h ago`;
}
