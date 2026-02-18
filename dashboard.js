/* ============================================================
   SpeakUp — dashboard.js
   Reads session metadata from localStorage. No audio stored.
   ============================================================ */

let sessions = [];
let sortMode = 'date';

document.addEventListener('DOMContentLoaded', () => {
  applyTheme();
  loadSessions();
  personalizeHeader();
});

function applyTheme() {
  const dark = localStorage.getItem('speakup_dark') === 'true';
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
}

function personalizeHeader() {
  const name = localStorage.getItem('speakup_name');
  if (name) {
    document.getElementById('dashHeading').textContent = `${name}'s Sessions`;
    document.getElementById('dashSub').textContent =
      'Every practice session you have saved in this browser.';
  }
}

function loadSessions() {
  sessions = JSON.parse(localStorage.getItem('speakup_sessions') || '[]');
  computeSummary();
  renderSessions();
}

function computeSummary() {
  document.getElementById('totalSessions').textContent = sessions.length;

  const totalSec = sessions.reduce((a, s) => a + (s.duration || 0), 0);
  document.getElementById('totalMinutes').textContent = Math.round(totalSec / 60) + 'm';

  if (sessions.length === 0) {
    document.getElementById('avgSpeakRatio').textContent = '—';
    document.getElementById('bestStreak').textContent = '—';
    return;
  }

  const avgRatio = sessions.reduce((a, s) => {
    const d = s.duration || 1;
    return a + (s.speakingSec / d) * 100;
  }, 0) / sessions.length;
  document.getElementById('avgSpeakRatio').textContent = Math.round(avgRatio) + '%';

  // Compute best streak from session dates
  const dateSet = new Set(sessions.map(s => s.date.split('T')[0]));
  const sorted = Array.from(dateSet).sort();
  let best = 0, cur = 0, prev = null;
  sorted.forEach(d => {
    if (!prev) { cur = 1; }
    else {
      const diff = (new Date(d) - new Date(prev)) / 86400000;
      if (Math.round(diff) === 1) cur++;
      else cur = 1;
    }
    best = Math.max(best, cur);
    prev = d;
  });
  document.getElementById('bestStreak').textContent = best + ' d';
}

function sortBy(mode) {
  sortMode = mode;
  renderSessions();
}

function renderSessions() {
  const list = document.getElementById('sessionList');

  if (sessions.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="icon">🎙️</div>
        <h2>No sessions yet</h2>
        <p>Complete a practice session and save it to see your history here.</p>
        <a href="index.html" class="btn btn-primary" style="margin-top:16px;display:inline-flex;">Start Practicing</a>
      </div>`;
    return;
  }

  let sorted = [...sessions];
  if (sortMode === 'date') {
    sorted.sort((a, b) => new Date(b.date) - new Date(a.date));
  } else if (sortMode === 'speak') {
    sorted.sort((a, b) => b.speakingSec - a.speakingSec);
  }

  list.innerHTML = sorted.map(s => {
    const d = new Date(s.date);
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const duration = s.duration ? `${s.duration}s` : '—';
    const speakRatio = s.duration ? Math.round((s.speakingSec / s.duration) * 100) : 0;

    return `
    <div class="session-card">
      <div class="session-meta">
        <div class="session-topic">${escHtml(s.topic)}</div>
        <div class="session-date">${dateStr} · ${timeStr}</div>
      </div>
      <div class="session-stats">
        <span class="session-stat">Duration: <strong>${duration}</strong></span>
        <span class="session-stat">Speaking: <strong>${s.speakingSec}s</strong></span>
        <span class="session-stat">Silence: <strong>${s.silenceSec}s</strong></span>
        <span class="session-stat">Pauses: <strong>${s.pauses}</strong></span>
        <span class="session-stat">Speak ratio: <strong>${speakRatio}%</strong></span>
        ${s.wpm ? `<span class="session-stat">Pace: <strong>${s.wpm} wpm</strong></span>` : ''}
      </div>
      ${s.feedbackText ? `<div class="session-feedback">${escHtml(s.feedbackText)}</div>` : ''}
      ${s.note ? `
        <div style="margin-top:10px;padding:10px 14px;background:var(--blue-soft);border-radius:var(--radius-sm);font-size:15px;color:var(--text2);">
          <span style="font-weight:700;color:var(--blue);font-size:13px;text-transform:uppercase;letter-spacing:0.8px;">Your note</span><br/>
          ${escHtml(s.note)}
        </div>` : ''}
      <div style="display:flex;justify-content:flex-end;margin-top:12px;">
        <button class="btn btn-ghost" style="padding:6px 14px;font-size:14px;"
          onclick="deleteSession(${s.id})">Delete</button>
      </div>
    </div>`;
  }).join('');
}

function deleteSession(id) {
  sessions = sessions.filter(s => s.id !== id);
  localStorage.setItem('speakup_sessions', JSON.stringify(sessions));
  computeSummary();
  renderSessions();
  showToast('Session deleted.');
}

function clearAll() {
  if (!confirm('Delete ALL sessions? This cannot be undone.')) return;
  sessions = [];
  localStorage.removeItem('speakup_sessions');
  localStorage.removeItem('speakup_streak');
  localStorage.removeItem('speakup_streak_last');
  computeSummary();
  renderSessions();
  showToast('All sessions cleared.');
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2800);
}