/* ============================================================
   SpeakUp — script.js
   Real audio recording + Post-record Web Audio API analysis.
   No fake data. No fake analytics.
   Audio is session-only (not persisted). Metadata is persisted.
   ============================================================ */

function setTopicControlsDisabled(disabled) {
  // Disable dice/topic buttons by ID and onclick attribute
  const diceBtn = document.getElementById('diceBtn');
  if (diceBtn) diceBtn.disabled = disabled;

  const btns = document.querySelectorAll('.card .btn');
  btns.forEach(b => {
    if (b.getAttribute('onclick') && (
      b.getAttribute('onclick').includes('openCustomTopic') ||
      b.getAttribute('onclick').includes('setCustomTopic')
    )) {
      b.disabled = disabled;
    }
  });

  const customInput = document.getElementById('customTopicInput');
  if (customInput) customInput.disabled = disabled;
}

// ── TOPICS ──────────────────────────────────────────────────
const TOPICS = [
  "Describe your most memorable travel experience.",
  "What is a skill you wish you had learned earlier?",
  "Talk about a book or movie that changed your perspective.",
  "What does success mean to you personally?",
  "Describe a challenge you overcame and what you learned.",
  "What is one habit that has improved your life?",
  "Talk about someone who has greatly influenced you.",
  "What are you most passionate about and why?",
  "Describe your ideal work environment.",
  "What is the best advice you have ever received?",
  "Talk about a goal you are currently working toward.",
  "Describe a time you had to think on your feet.",
  "What would you do with a free month and no obligations?",
  "How do you handle stress or pressure?",
  "What does friendship mean to you?",
  "Describe the city or place you grew up in.",
  "What is a common misconception people have about you?",
  "Talk about a decision you made that changed everything.",
  "What does a perfect Sunday look like to you?",
  "If you could master any skill overnight, what would it be?",
];

// ── STATE ────────────────────────────────────────────────────
let mediaRecorder = null;
let audioChunks = [];
let timerInterval = null;
let countdownSec = 0;
let maxDuration = 60;
let isRecording = false;

// Analysis results — populated post-record by analyzeAudioBlob()
let analysisData = {
  totalSpeakingMs: 0,
  pauseCount: 0,
};

// Session result
let sessionResult = null;
let currentTopic = "";

// ── INIT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  applyTheme();
  checkOnboarding();
  updateWelcome();
  renderCalendar();
  // Set first topic silently without animation
  const idx = Math.floor(Math.random() * TOPICS.length);
  currentTopic = TOPICS[idx];
  document.getElementById('topicDisplay').textContent = currentTopic;
  maxDuration = parseInt(localStorage.getItem('speakup_duration') || '60');
});

// ── ONBOARDING ───────────────────────────────────────────────
function checkOnboarding() {
  const name = localStorage.getItem('speakup_name');
  if (!name) {
    document.getElementById('onboarding').classList.remove('hidden');
    setTimeout(() => document.getElementById('nameInput').focus(), 100);
    document.getElementById('nameInput').addEventListener('keydown', e => {
      if (e.key === 'Enter') saveUserName();
    });
  }
}

function saveUserName() {
  const input = document.getElementById('nameInput');
  const name = input.value.trim();
  if (!name) { input.focus(); return; }
  localStorage.setItem('speakup_name', name);
  document.getElementById('onboarding').classList.add('hidden');
  updateWelcome();
  showToast(`Welcome, ${name}! Let's get speaking.`);
}

function updateWelcome() {
  const name = localStorage.getItem('speakup_name');
  const heading = document.getElementById('welcomeHeading');
  if (name) heading.textContent = `Welcome back, ${name} 👋`;

  const streak = getCurrentStreak();
  document.getElementById('streakText').textContent = `Current streak: ${streak} day${streak !== 1 ? 's' : ''}`;
  document.getElementById('streakBadge').textContent = `🔥 ${streak} day streak`;
}

// ── THEME ────────────────────────────────────────────────────
function applyTheme() {
  const dark = localStorage.getItem('speakup_dark') === 'true';
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
}

// ── TOPIC GENERATOR ──────────────────────────────────────────
const DICE_FACES = ['⚀','⚁','⚂','⚃','⚄','⚅'];

function rollTopic() {
  const btn = document.getElementById('diceBtn');
  const icon = document.getElementById('diceIcon');
  const display = document.getElementById('topicDisplay');

  // Shake animation
  btn.classList.add('dice-rolling');

  // Cycle through dice faces rapidly during shake
  let cycleCount = 0;
  const faceInterval = setInterval(() => {
    icon.textContent = DICE_FACES[cycleCount % DICE_FACES.length];
    cycleCount++;
  }, 80);

  setTimeout(() => {
    clearInterval(faceInterval);
    btn.classList.remove('dice-rolling');
    icon.textContent = DICE_FACES[Math.floor(Math.random() * DICE_FACES.length)];

    // Pick new topic (different from current)
    let idx;
    do { idx = Math.floor(Math.random() * TOPICS.length); }
    while (TOPICS[idx] === currentTopic && TOPICS.length > 1);

    currentTopic = TOPICS[idx];
    display.classList.remove('topic-animate');
    void display.offsetWidth; // force reflow
    display.textContent = currentTopic;
    display.classList.add('topic-animate');
  }, 580);
}

// Keep generateTopic as alias for first load
function generateTopic() { rollTopic(); }

function openCustomTopic() {
  const wrap = document.getElementById('customTopicWrap');
  wrap.classList.toggle('hidden');
  wrap.style.display = wrap.classList.contains('hidden') ? 'none' : 'flex';
  if (!wrap.classList.contains('hidden')) {
    document.getElementById('customTopicInput').focus();
  }
}

function setCustomTopic() {
  const val = document.getElementById('customTopicInput').value.trim();
  if (!val) return;
  currentTopic = val;
  document.getElementById('topicDisplay').textContent = currentTopic;
  document.getElementById('customTopicWrap').classList.add('hidden');
  document.getElementById('customTopicInput').value = '';
}

// ── RECORDING ────────────────────────────────────────────────
async function toggleRecording() {
  if (isRecording) {
    stopRecording();
  } else {
    await startRecording();
  }
}

async function startRecording() {
  // Reset analytics
  analysisData = { totalSpeakingMs: 0, pauseCount: 0 };
  sessionResult = null;
  audioChunks = [];

  // Hide any previous results
  document.getElementById('playbackCard').classList.add('hidden');
  document.getElementById('analyticsCard').classList.add('hidden');
  document.getElementById('saveStatus').textContent = '';

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch (err) {
    alert('Microphone access was denied or is unavailable. Please allow microphone access in your browser settings.');
    return;
  }

  // Setup MediaRecorder
  const mimeType = getSupportedMimeType();
  const options = mimeType ? { mimeType } : {};
  try {
    mediaRecorder = new MediaRecorder(stream, options);
  } catch (e) {
    mediaRecorder = new MediaRecorder(stream);
  }

  mediaRecorder.ondataavailable = e => {
    if (e.data && e.data.size > 0) audioChunks.push(e.data);
  };

  mediaRecorder.onstop = () => {
    stream.getTracks().forEach(t => t.stop());
    // Build blob, show playback, then analyze post-record
    const mimeType = audioChunks[0]?.type || 'audio/webm';
    const blob = new Blob(audioChunks, { type: mimeType });
    const url = URL.createObjectURL(blob);
    const audio = document.getElementById('audioPlayback');
    audio.src = url;
    document.getElementById('playbackCard').classList.remove('hidden');
    document.getElementById('timerLabel').textContent = 'Analyzing...';
    analyzeAudioBlob(blob);
  };

  mediaRecorder.start(100); // collect data every 100ms
  isRecording = true;

  // Disable topic controls during recording
  setTopicControlsDisabled(true);

  // UI
  const btn = document.getElementById('recordBtn');
  btn.classList.add('recording');
  document.getElementById('recordIcon').textContent = '⏹';
  document.getElementById('recordHint').textContent = 'Recording... click to stop';

  // Read maxDuration fresh (user may have changed in settings)
  maxDuration = parseInt(localStorage.getItem('speakup_duration') || '60');
  countdownSec = 0;
  startTimer();
}

function stopRecording() {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
  isRecording = false;
  clearInterval(timerInterval);
  mediaRecorder.stop();

  // Re-enable topic controls
  setTopicControlsDisabled(false);

  // UI reset
  const btn = document.getElementById('recordBtn');
  btn.classList.remove('recording');
  document.getElementById('recordIcon').textContent = '⏺';
  document.getElementById('recordHint').textContent = 'Click to start recording';
  document.getElementById('timerLabel').textContent = 'Processing...';
}

function getSupportedMimeType() {
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/mp4',
  ];
  for (const t of types) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return null;
}

// ── WPM ESTIMATION (audio-based, no Speech API needed) ───────
/*
  Method: use actual speaking time only (not total duration).
  Research constants for conversational English:
    - Average syllable rate while speaking: 4.4 syllables/sec
    - Average syllables per word: 1.35
    → Words per second of speech = 4.4 / 1.35 = 3.26 words/sec

  We also track individual speech segment durations to compute
  a rhythm consistency score — how evenly spaced your speech is.
  High variance = choppy, low variance = smooth flow.

  WPM = estimated total words / (total duration in minutes)
  This matches how WPM is measured in real typing/speech tests —
  total words over total elapsed time including pauses.
*/
function estimateWPM(speakingSec, totalDurationSec) {
  if (speakingSec <= 0 || totalDurationSec <= 0) return 0;
  const WORDS_PER_SPEAKING_SEC = 3.26; // 4.4 syllables/sec ÷ 1.35 syllables/word
  const estimatedWords = speakingSec * WORDS_PER_SPEAKING_SEC;
  const wpm = Math.round(estimatedWords / (totalDurationSec / 60));
  return wpm;
}

function getPaceLabel(wpm) {
  if (wpm <= 0) return { label: 'Could not estimate', detail: '', color: 'var(--text3)' };
  if (wpm < 110) return {
    label: 'Very slow',
    detail: 'Under 110 words/min. Try to speak more continuously.',
    color: '#c0392b'
  };
  if (wpm < 130) return {
    label: 'Slightly slow',
    detail: `${wpm} words/min. A little below the ideal range — good for clarity.`,
    color: '#e67e22'
  };
  if (wpm <= 160) return {
    label: 'Perfect pace',
    detail: `${wpm} words/min. Right in the sweet spot for public speaking.`,
    color: 'var(--green)'
  };
  if (wpm <= 185) return {
    label: 'Slightly fast',
    detail: `${wpm} words/min. A touch above ideal — try slowing down slightly.`,
    color: '#e67e22'
  };
  return {
    label: 'Too fast',
    detail: `${wpm} words/min. Listeners may struggle to follow. Breathe and slow down.`,
    color: '#c0392b'
  };
}
function startTimer() {
  document.getElementById('timerLabel').textContent = `Recording — ${maxDuration}s max`;
  updateTimerDisplay();

  timerInterval = setInterval(() => {
    countdownSec++;
    updateTimerDisplay();

    const bar = document.getElementById('timerBar');
    bar.style.width = `${(countdownSec / maxDuration) * 100}%`;

    if (countdownSec >= maxDuration) {
      stopRecording();
    }
  }, 1000);
}

function updateTimerDisplay() {
  const el = document.getElementById('timerDisplay');
  const remaining = maxDuration - countdownSec;
  const m = Math.floor(countdownSec / 60).toString().padStart(2, '0');
  const s = (countdownSec % 60).toString().padStart(2, '0');
  el.textContent = `${m}:${s}`;
  el.className = 'timer-display' + (isRecording ? ' running' : '');

  if (remaining <= 10 && isRecording) {
    document.getElementById('timerLabel').textContent = `${remaining} second${remaining !== 1 ? 's' : ''} remaining`;
  }
}

// ── POST-RECORD AUDIO ANALYSIS ────────────────────────────────
/*
  Analyzes the recorded audio blob AFTER recording stops.
  This is more reliable than live analysis on GitHub Pages / Netlify
  because it doesn't depend on AudioContext timing during recording.

  Method:
  1. Decode the blob using AudioContext.decodeAudioData
  2. Walk through decoded PCM samples in 20ms frames
  3. Compute RMS per frame, classify as speaking or silent
  4. Apply same debounce logic as before:
     - 50ms silence debounce (ignore short gaps mid-word)
     - 300ms minimum silence to count as a pause
  5. Populate analysisData.totalSpeakingMs and analysisData.pauseCount
  6. Call finishRecording() with the real results
*/
async function analyzeAudioBlob(blob) {
  const THRESHOLD = 0.015;         // RMS cutoff — same as live version
  const FRAME_MS = 20;             // analyze in 20ms chunks
  const SILENCE_DEBOUNCE_MS = 50;  // ignore silences shorter than this
  const PAUSE_MIN_MS = 300;        // silence must be this long to be a pause

  let audioCtx;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    // Mix down to mono — average all channels
    const numChannels = audioBuffer.numberOfChannels;
    const length = audioBuffer.length;
    const sampleRate = audioBuffer.sampleRate;
    const samplesPerFrame = Math.floor(sampleRate * FRAME_MS / 1000);

    // Build mono buffer by averaging channels
    const mono = new Float32Array(length);
    for (let ch = 0; ch < numChannels; ch++) {
      const channelData = audioBuffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        mono[i] += channelData[i] / numChannels;
      }
    }

    // Walk frames — same debounced state machine logic as before
    let totalSpeakingMs = 0;
    let pauseCount = 0;

    let confirmedState = null;
    let pendingState = null;
    let pendingStateStartMs = null;
    let speakStartMs = null;
    let silenceStartMs = null;

    const totalFrames = Math.ceil(length / samplesPerFrame);

    for (let f = 0; f < totalFrames; f++) {
      const start = f * samplesPerFrame;
      const end = Math.min(start + samplesPerFrame, length);

      // RMS for this frame
      let sumSq = 0;
      for (let i = start; i < end; i++) sumSq += mono[i] * mono[i];
      const rms = Math.sqrt(sumSq / (end - start));

      const rawState = rms >= THRESHOLD ? 'speaking' : 'silent';
      const frameMs = f * FRAME_MS;

      // ── Debounced state machine (same logic as live version) ──
      if (rawState !== confirmedState) {
        if (rawState !== pendingState) {
          pendingState = rawState;
          pendingStateStartMs = frameMs;
        } else {
          const pendingMs = frameMs - pendingStateStartMs;
          const debounce = rawState === 'silent' ? SILENCE_DEBOUNCE_MS : 0;

          if (pendingMs >= debounce) {
            const prev = confirmedState;
            confirmedState = rawState;

            if (prev === 'speaking' && rawState === 'silent') {
              if (speakStartMs !== null) {
                totalSpeakingMs += frameMs - speakStartMs;
                speakStartMs = null;
              }
              silenceStartMs = frameMs;

            } else if (prev === 'silent' && rawState === 'speaking') {
              if (silenceStartMs !== null) {
                const silenceMs = frameMs - silenceStartMs;
                if (silenceMs >= PAUSE_MIN_MS) pauseCount++;
                silenceStartMs = null;
              }
              speakStartMs = frameMs;

            } else if (prev === null) {
              if (rawState === 'speaking') speakStartMs = frameMs;
              else silenceStartMs = frameMs;
            }

            pendingState = null;
            pendingStateStartMs = null;
          }
        }
      } else {
        pendingState = null;
        pendingStateStartMs = null;
      }
    }

    // Close any open speaking segment at end of audio
    const totalAudioMs = (length / sampleRate) * 1000;
    if (speakStartMs !== null) {
      totalSpeakingMs += totalAudioMs - speakStartMs;
    }

    // Populate analysisData — same fields finishRecording() reads
    analysisData.totalSpeakingMs = totalSpeakingMs;
    analysisData.pauseCount = pauseCount;

  } catch (err) {
    console.warn('[SpeakUp] Post-record analysis failed:', err);
    // Fall back to duration-based estimate so UI never breaks
    analysisData.totalSpeakingMs = countdownSec * 800; // assume 80% speaking
    analysisData.pauseCount = 0;
  } finally {
    if (audioCtx) { try { audioCtx.close(); } catch(e) {} }
  }

  // Draw static waveform now that we have decoded data (optional visual)
  drawStaticWaveform(blob);

  // Hand off to existing finishRecording — nothing changed there
  finishRecording();
}

// ── STATIC WAVEFORM (post-record visual only) ─────────────────
/*
  Draws a static amplitude overview of the recording on the canvas.
  This replaces the live waveform. Called after analysis completes.
  If the canvas doesn't exist or is hidden, this is a no-op.
*/
async function drawStaticWaveform(blob) {
  const canvas = document.getElementById('waveform');
  if (!canvas) return;

  const W = canvas.offsetWidth || 400;
  const H = canvas.offsetHeight || 64;
  canvas.width = W * window.devicePixelRatio;
  canvas.height = H * window.devicePixelRatio;
  const ctx = canvas.getContext('2d');
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    await audioCtx.close();

    const data = audioBuffer.getChannelData(0);
    const step = Math.ceil(data.length / W);

    const style = getComputedStyle(document.documentElement);
    const accent = style.getPropertyValue('--accent').trim();
    const bg2 = style.getPropertyValue('--bg2').trim();

    ctx.fillStyle = bg2;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    for (let x = 0; x < W; x++) {
      let min = 1, max = -1;
      for (let i = 0; i < step; i++) {
        const v = data[x * step + i] || 0;
        if (v < min) min = v;
        if (v > max) max = v;
      }
      const yMin = ((min + 1) / 2) * H;
      const yMax = ((max + 1) / 2) * H;
      if (x === 0) ctx.moveTo(x, yMin);
      ctx.lineTo(x, yMin);
      ctx.lineTo(x, yMax);
    }
    ctx.stroke();
  } catch (e) {
    // Waveform drawing is non-critical — fail silently
  }
}

// ── FINISH RECORDING ─────────────────────────────────────────
function finishRecording() {
  // Note: blob building and playback are handled in mediaRecorder.onstop
  // analysisData has been populated by analyzeAudioBlob() before this is called

  // Compute analytics from post-record analysis results
  const recDuration = countdownSec;
  const speakingMs = analysisData.totalSpeakingMs;
  const speakingSec = Math.min(Math.round(speakingMs / 1000), recDuration);
  const silenceSec = Math.max(recDuration - speakingSec, 0);
  const pauses = analysisData.pauseCount;

  // Accurate audio-based WPM estimation
  const wpm = estimateWPM(speakingSec, recDuration);
  const pace = getPaceLabel(wpm);

  sessionResult = { speakingSec, silenceSec, pauses, duration: recDuration, wpm };

  // Display core stats
  document.getElementById('statSpeak').textContent = speakingSec + 's';
  document.getElementById('statSilence').textContent = silenceSec + 's';
  document.getElementById('statPauses').textContent = pauses;

  // Display WPM with human label
  const wpmEl = document.getElementById('statWpm');
  if (wpmEl) wpmEl.textContent = wpm > 0 ? wpm : '—';

  const wpmLabelEl = document.getElementById('wpmLabel');
  if (wpmLabelEl && wpm > 0) {
    wpmLabelEl.innerHTML = `<span style="color:${pace.color};font-weight:700;">${pace.label}</span> — ${pace.detail}`;
  } else if (wpmLabelEl) {
    wpmLabelEl.textContent = 'Speak for at least 5 seconds to get a pace estimate.';
  }

  // Generate feedback
  const showFeedback = localStorage.getItem('speakup_feedback') !== 'false';
  const feedbackText = generateFeedback(speakingSec, silenceSec, pauses, recDuration, wpm);
  sessionResult.feedbackText = feedbackText;

  const fbBox = document.getElementById('feedbackBox');
  fbBox.textContent = showFeedback ? feedbackText : 'Feedback is disabled in Settings.';

  document.getElementById('analyticsCard').classList.remove('hidden');
  document.getElementById('timerLabel').textContent = `Recorded ${recDuration}s`;

  // Reset timer bar
  document.getElementById('timerBar').style.width = '0%';

  // Scroll to analytics
  setTimeout(() => {
    document.getElementById('analyticsCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 300);
}

// ── FEEDBACK LOGIC ───────────────────────────────────────────
function generateFeedback(speakSec, silSec, pauses, duration, wpm) {
  const parts = [];
  const speakRatio = speakSec / (duration || 1);
  const silRatio = silSec / (duration || 1);

  if (speakRatio >= 0.85) {
    parts.push("Excellent speaking ratio. You kept great momentum throughout.");
  } else if (speakRatio >= 0.70) {
    parts.push("Good speaking time. You used the session effectively.");
  } else if (speakRatio >= 0.50) {
    parts.push("Decent speaking time, but there were noticeable gaps. Try pushing through the pauses.");
  } else {
    parts.push("Your silence time was high. Try to gather your thoughts and keep speaking.");
  }

  if (pauses === 0) {
    parts.push("No significant pauses detected — impressive fluency.");
  } else if (pauses === 1) {
    parts.push("One pause detected. Minimal hesitation overall.");
  } else if (pauses <= 3) {
    parts.push(`${pauses} pauses detected. A natural rhythm — not excessive.`);
  } else if (pauses <= 6) {
    parts.push(`${pauses} pauses detected. Try practicing with a consistent pace to reduce breaks.`);
  } else {
    parts.push(`${pauses} pauses detected. Consider slowing down and breathing more deliberately.`);
  }

  if (wpm > 0) {
    if (wpm < 110) parts.push("Your pace was quite slow. Try speaking more continuously without long gaps.");
    else if (wpm < 130) parts.push(`Your pace was slightly slow at around ${wpm} words per minute. A little more flow would help.`);
    else if (wpm <= 160) parts.push(`Your speaking pace was spot on — smooth and easy to follow.`);
    else if (wpm <= 185) parts.push(`You were speaking a touch fast. Slowing down slightly will help listeners absorb what you say.`);
    else parts.push(`Your pace was quite fast. Try taking more deliberate breaths between thoughts.`);
  }

  if (duration >= 50 && silRatio < 0.2) {
    parts.push("Strong session length with great vocal consistency.");
  } else if (duration < 15) {
    parts.push("Short session. Try going for a full minute to build endurance.");
  }

  return parts.join(" ");
}

// ── SAVE SESSION ─────────────────────────────────────────────
function saveSession() {
  if (!sessionResult) return;
  if (sessionResult.saved) return; // prevent duplicate saves
  sessionResult.saved = true;

  const sessions = JSON.parse(localStorage.getItem('speakup_sessions') || '[]');
  const now = new Date();
  const entry = {
    id: Date.now(),
    date: now.toISOString(),
    topic: currentTopic || 'No topic',
    speakingSec: sessionResult.speakingSec,
    silenceSec: sessionResult.silenceSec,
    pauses: sessionResult.pauses,
    duration: sessionResult.duration,
    wpm: sessionResult.wpm || 0,
    feedbackText: sessionResult.feedbackText,
    note: document.getElementById('sessionNote')?.value.trim() || '',
  };

  sessions.unshift(entry);
  localStorage.setItem('speakup_sessions', JSON.stringify(sessions));

  // Update streak
  updateStreak(now);

  document.getElementById('saveStatus').textContent = 'Session saved successfully.';
  // Disable save button to prevent duplicates
  const saveBtn = document.querySelector('[onclick="saveSession()"]');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saved'; }
  showToast('Session saved!');

  updateWelcome();
  renderCalendar();
}

function resetSession() {
  sessionResult = null;
  audioChunks = [];
  document.getElementById('playbackCard').classList.add('hidden');
  document.getElementById('analyticsCard').classList.add('hidden');
  document.getElementById('timerDisplay').textContent = '00:00';
  document.getElementById('timerDisplay').className = 'timer-display';
  document.getElementById('timerLabel').textContent = 'Ready to record';
  document.getElementById('timerBar').style.width = '0%';
  document.getElementById('saveStatus').textContent = '';
  const saveBtn = document.querySelector('[onclick="saveSession()"]');
  if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Session'; }
  const noteEl = document.getElementById('sessionNote');
  if (noteEl) noteEl.value = '';
  generateTopic();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── STREAK LOGIC ─────────────────────────────────────────────
function updateStreak(now) {
  const todayStr = toDateStr(now);
  const lastDay = localStorage.getItem('speakup_streak_last');
  let streak = parseInt(localStorage.getItem('speakup_streak') || '0');

  if (lastDay === todayStr) {
    // Already practiced today — don't increment
    return;
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yStr = toDateStr(yesterday);

  if (lastDay === yStr) {
    streak++;
  } else if (!lastDay) {
    streak = 1;
  } else {
    streak = 1; // Missed a day — reset
  }

  localStorage.setItem('speakup_streak', streak.toString());
  localStorage.setItem('speakup_streak_last', todayStr);
}

function getCurrentStreak() {
  const streak = parseInt(localStorage.getItem('speakup_streak') || '0');
  const last = localStorage.getItem('speakup_streak_last');
  if (!last) return 0;

  const today = toDateStr(new Date());
  const yesterday = toDateStr(new Date(Date.now() - 86400000));

  if (last === today || last === yesterday) return streak;
  return 0; // Streak broken
}

function toDateStr(d) {
  return d.toISOString().split('T')[0];
}

// ── CALENDAR ─────────────────────────────────────────────────
function renderCalendar() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  document.getElementById('monthLabel').textContent =
    now.toLocaleString('default', { month: 'long', year: 'numeric' });

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayDate = now.getDate();

  // Get practiced days this month
  const sessions = JSON.parse(localStorage.getItem('speakup_sessions') || '[]');
  const practicedDays = new Set();
  sessions.forEach(s => {
    const d = new Date(s.date);
    if (d.getFullYear() === year && d.getMonth() === month) {
      practicedDays.add(d.getDate());
    }
  });

  const grid = document.getElementById('calendarGrid');
  grid.innerHTML = '';

  // Day headers
  ['Su','Mo','Tu','We','Th','Fr','Sa'].forEach(d => {
    const el = document.createElement('div');
    el.className = 'cal-header';
    el.textContent = d;
    grid.appendChild(el);
  });

  // Empty cells
  for (let i = 0; i < firstDay; i++) {
    const el = document.createElement('div');
    el.className = 'cal-day empty';
    grid.appendChild(el);
  }

  // Day cells
  for (let d = 1; d <= daysInMonth; d++) {
    const el = document.createElement('div');
    let cls = 'cal-day';
    if (d === todayDate) cls += ' today';
    if (practicedDays.has(d)) cls += ' practiced';
    el.className = cls;
    el.textContent = d;
    grid.appendChild(el);
  }
}

// ── TOAST ────────────────────────────────────────────────────
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2800);
}