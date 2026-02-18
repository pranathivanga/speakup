/* ============================================================
   SpeakUp — settings.js
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
});

function loadSettings() {
  // Apply theme first
  const dark = localStorage.getItem('speakup_dark') === 'true';
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  document.getElementById('darkToggle').checked = dark;

  // Name
  const name = localStorage.getItem('speakup_name') || '';
  document.getElementById('nameField').value = name;
  document.getElementById('nameField').addEventListener('keydown', e => {
    if (e.key === 'Enter') saveName();
  });

  // Duration
  const duration = localStorage.getItem('speakup_duration') || '60';
  const radio = document.querySelector(`input[name="duration"][value="${duration}"]`);
  if (radio) radio.checked = true;
  else document.getElementById('d60').checked = true; // default

  // Add listeners to duration radios
  document.querySelectorAll('input[name="duration"]').forEach(r => {
    r.addEventListener('change', () => {
      localStorage.setItem('speakup_duration', r.value);
      showToast(`Duration set to ${r.value} seconds.`);
    });
  });

  // Feedback toggle
  const feedback = localStorage.getItem('speakup_feedback') !== 'false';
  document.getElementById('feedbackToggle').checked = feedback;
}

function saveName() {
  const val = document.getElementById('nameField').value.trim();
  if (!val) return;
  localStorage.setItem('speakup_name', val);
  showToast(`Name saved: ${val}`);
}

function savePref(key, value) {
  localStorage.setItem(key, value.toString());
  showToast('Preference saved.');
}

function toggleDark(on) {
  localStorage.setItem('speakup_dark', on.toString());
  document.documentElement.setAttribute('data-theme', on ? 'dark' : 'light');
  showToast(on ? 'Dark mode on.' : 'Light mode on.');
}

function clearSessions() {
  if (!confirm('Clear all session history? This cannot be undone.')) return;
  localStorage.removeItem('speakup_sessions');
  localStorage.removeItem('speakup_streak');
  localStorage.removeItem('speakup_streak_last');
  showToast('All sessions cleared.');
}

function clearEverything() {
  if (!confirm('Reset EVERYTHING including your name, preferences, and sessions? This cannot be undone.')) return;
  localStorage.clear();
  showToast('All data cleared. Reloading...');
  setTimeout(() => location.href = 'index.html', 1200);
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2800);
}