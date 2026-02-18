/* ============================================================
   SpeakUp — script.js
   Real audio recording + Web Audio API analysis
   No fake data. No fake analytics.
   Audio is session-only (not persisted). Metadata is persisted.
   ============================================================ */

function setTopicControlsDisabled(disabled) {
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
   "Something small that made you smile recently",
    "Your favorite time of day and why",
    "A simple pleasure people often overlook",
    "One food you never get tired of",
    "A habit you enjoy more than you admit",
    "A place where you feel calm and why",
    "A daily routine you secretly enjoy",
    "A sound you find comforting",
    "One thing you always look forward to",
    "What helps you unwind after a long day",
    "What does success mean to you right now?",
    "What makes a good conversation memorable?",
    "What does independence mean to you?",
    "Why is consistency harder than motivation?",
    "What makes something meaningful rather than impressive?",
    "What does confidence actually look like in daily life?",
    "Why do people fear change?",
    "What does it mean to truly listen to someone?",
    "How do small decisions shape big outcomes?",
    "What makes a habit stick long term?",
    "A moment that taught you something unexpectedly",
    "A time you surprised yourself",
    "A situation that didn't go as planned",
    "A lesson you learned the hard way",
    "A moment you still think about often",
    "A challenge that changed how you see yourself",
    "A decision you made without overthinking",
    "A time you had to adapt quickly",
    "A mistake that helped you grow",
    "A moment that shaped your confidence",
    "Describe your ideal do-nothing day",
    "If your personality were a color, what would it be?",
    "If your thoughts had a soundtrack today, what would it be?",
    "If your life were a movie genre today, what would it be?",
    "If you could pause time for an hour, what would you do?",
    "If your comfort zone could talk, what would it say?",
    "If you had to explain your life to a stranger in one minute, what would you say?",
    "If you could relive one ordinary day, which one would it be?",
    "What would your future self thank you for?",
    "If your mindset today were weather, what would it be?",
    "Is being busy the same as being productive?",
    "Is failure more useful than success?",
    "Do first impressions really matter?",
    "Is routine comforting or limiting?",
    "Is honesty always the best approach?",
    "Is talent more important than hard work?",
    "Does technology make life easier or more overwhelming?",
    "Is it better to plan or improvise?",
    "Is silence powerful in conversations?",
    "Are people naturally curious or taught to be curious?",
    "What does feeling at home mean to you?",
    "What makes a day feel fulfilling?",
    "What helps you feel grounded?",
    "What are you learning about yourself currently?",
    "What do you value more now than before?",
    "What kind of person do you want to become?",
    "What does growth look like in everyday life?",
    "What does patience mean to you?",
    "What helps you regain balance when overwhelmed?",
    "What does comfort mean beyond physical things?",
    "Describe an object near you as if it were important",
    "Talk about something random in your room",
    "Explain why rest is productive",
    "Describe your mindset today",
    "Talk about the last thing you learned",
    "Explain a simple concept as if teaching a child",
    "Defend an unpopular opinion playfully",
    "Explain why something ordinary is actually interesting",
    "Describe your week using only emotions",
    "Convince someone why learning never stops",
    "A skill you are currently developing",
    "A goal you are working toward and why",
    "How do you handle pressure?",
    "What motivates you when things feel hard?",
    "How do you approach learning something new?",
    "How do you deal with setbacks?",
    "What kind of work environment helps you thrive?",
    "What does responsibility mean to you?",
    "How do you define personal growth?",
    "What does teamwork mean to you?"
];

// ── STATE ────────────────────────────────────────────────────
let mediaRecorder = null;
let audioChunks = [];
let audioContext = null;
let analyser = null;
let sourceNode = null;
let animFrameId = null;
let timerInterval = null;
let countdownSec = 0;
let maxDuration = 60;
let isRecording = false;

let analysisData = {
  totalSpeakingMs: 0,
  pauseCount: 0,
  speakStart: null,
  silenceStart: null,
  lastState: null,
};

let sessionResult = null;
let currentTopic = "";

// ── INIT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  applyTheme();
  checkOnboarding();
  updateWelcome();
  renderCalendar();
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

  btn.classList.add('dice-rolling');

  let cycleCount = 0;
  const faceInterval = setInterval(() => {
    icon.textContent = DICE_FACES[cycleCount % DICE_FACES.length];
    cycleCount++;
  }, 80);

  setTimeout(() => {
    clearInterval(faceInterval);
    btn.classList.remove('dice-rolling');
    icon.textContent = DICE_FACES[Math.floor(Math.random() * DICE_FACES.length)];

    let idx;
    do { idx = Math.floor(Math.random() * TOPICS.length); }
    while (TOPICS[idx] === currentTopic && TOPICS.length > 1);

    currentTopic = TOPICS[idx];
    display.classList.remove('topic-animate');
    void display.offsetWidth;
    display.textContent = currentTopic;
    display.classList.add('topic-animate');
  }, 580);
}

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
  analysisData = { totalSpeakingMs: 0, pauseCount: 0, speakStart: null, silenceStart: null, lastState: null };
  sessionResult = null;
  audioChunks = [];

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

  // ── FIX: Create AudioContext and explicitly resume it ──
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }
  } catch (err) {
    alert('Could not start audio processing. Please try a different browser.');
    stream.getTracks().forEach(t => t.stop());
    return;
  }

  analyser = audioContext.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.0;
  sourceNode = audioContext.createMediaStreamSource(stream);
  sourceNode.connect(analyser);

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
    if (audioContext) { audioContext.close(); audioContext = null; }
    finishRecording();
  };

  mediaRecorder.start(100);
  isRecording = true;

  setTopicControlsDisabled(true);

  const btn = document.getElementById('recordBtn');
  btn.classList.add('recording');
  document.getElementById('recordIcon').textContent = '⏹';
  document.getElementById('recordHint').textContent = 'Recording... click to stop';

  maxDuration = parseInt(localStorage.getItem('speakup_duration') || '60');
  countdownSec = 0;
  startTimer();
  drawWaveform();
}

function stopRecording() {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
  isRecording = false;
  clearInterval(timerInterval);
  cancelAnimationFrame(animFrameId);
  finalizeAnalysis();
  mediaRecorder.stop();

  setTopicControlsDisabled(false);

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

// ── WPM ESTIMATION ───────────────────────────────────────────
function estimateWPM(speakingSec, totalDurationSec) {
  if (speakingSec <= 0 || totalDurationSec <= 0) return 0;
  const WORDS_PER_SPEAKING_SEC = 3.26;
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

// ── WAVEFORM + ANALYSIS ──────────────────────────────────────
function drawWaveform() {
  const canvas = document.getElementById('waveform');
  const ctx = canvas.getContext('2d');

  // ── FIX: Use clientWidth/clientHeight as fallback for GitHub Pages ──
  const W = canvas.offsetWidth || canvas.clientWidth || 400;
  const H = canvas.offsetHeight || canvas.clientHeight || 64;
  canvas.width = W * window.devicePixelRatio;
  canvas.height = H * window.devicePixelRatio;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Float32Array(bufferLength);

  const THRESHOLD = 0.015;
  const SILENCE_DEBOUNCE_MS = 50;
  const PAUSE_MIN_MS = 300;

  let pendingState = null;
  let pendingStateStart = null;
  let confirmedState = null;

  function draw() {
    if (!isRecording) {
      ctx.clearRect(0, 0, W, H);
      return;
    }

    animFrameId = requestAnimationFrame(draw);
    analyser.getFloatTimeDomainData(dataArray);

    let sumSq = 0;
    for (let i = 0; i < bufferLength; i++) sumSq += dataArray[i] * dataArray[i];
    const rms = Math.sqrt(sumSq / bufferLength);

    const rawState = rms >= THRESHOLD ? 'speaking' : 'silent';
    const now = performance.now();

    if (rawState !== confirmedState) {
      if (rawState !== pendingState) {
        pendingState = rawState;
        pendingStateStart = now;
      } else {
        const pendingMs = now - pendingStateStart;
        const debounce = rawState === 'silent' ? SILENCE_DEBOUNCE_MS : 0;

        if (pendingMs >= debounce) {
          const prev = confirmedState;
          confirmedState = rawState;

          if (prev === 'speaking' && rawState === 'silent') {
            if (analysisData.speakStart !== null) {
              analysisData.totalSpeakingMs += now - analysisData.speakStart;
              analysisData.speakStart = null;
            }
            analysisData.silenceStart = now;

          } else if (prev === 'silent' && rawState === 'speaking') {
            if (analysisData.silenceStart !== null) {
              const silenceMs = now - analysisData.silenceStart;
              if (silenceMs >= PAUSE_MIN_MS) {
                analysisData.pauseCount++;
              }
              analysisData.silenceStart = null;
            }
            analysisData.speakStart = now;

          } else if (prev === null) {
            if (rawState === 'speaking') analysisData.speakStart = now;
            else analysisData.silenceStart = now;
          }

          pendingState = null;
          pendingStateStart = null;
        }
      }
    } else {
      pendingState = null;
      pendingStateStart = null;
    }

    const isSpeaking = confirmedState === 'speaking';

    const style = getComputedStyle(document.documentElement);
    const accent = style.getPropertyValue('--accent').trim();
    const bg2 = style.getPropertyValue('--bg2').trim();

    ctx.fillStyle = bg2;
    ctx.fillRect(0, 0, W, H);
    ctx.lineWidth = 2;
    ctx.strokeStyle = isSpeaking ? accent : '#bbb';
    ctx.beginPath();

    const sliceW = W / bufferLength;
    for (let i = 0; i < bufferLength; i++) {
      const y = ((dataArray[i] + 1) / 2) * H;
      if (i === 0) ctx.moveTo(0, y);
      else ctx.lineTo(i * sliceW, y);
    }
    ctx.stroke();
  }

  draw();
}

function finalizeAnalysis() {
  const now = performance.now();
  if (analysisData.speakStart !== null) {
    analysisData.totalSpeakingMs += now - analysisData.speakStart;
    analysisData.speakStart = null;
  }
}

// ── FINISH RECORDING ─────────────────────────────────────────
function finishRecording() {
  const mimeType = audioChunks[0]?.type || 'audio/webm';
  const blob = new Blob(audioChunks, { type: mimeType });
  const url = URL.createObjectURL(blob);

  const audio = document.getElementById('audioPlayback');
  audio.src = url;
  document.getElementById('playbackCard').classList.remove('hidden');

  const recDuration = countdownSec;
  const speakingMs = analysisData.totalSpeakingMs;
  const speakingSec = Math.min(Math.round(speakingMs / 1000), recDuration);
  const silenceSec = Math.max(recDuration - speakingSec, 0);
  const pauses = analysisData.pauseCount;

  const wpm = estimateWPM(speakingSec, recDuration);
  const pace = getPaceLabel(wpm);

  sessionResult = { speakingSec, silenceSec, pauses, duration: recDuration, wpm };

  document.getElementById('statSpeak').textContent = speakingSec + 's';
  document.getElementById('statSilence').textContent = silenceSec + 's';
  document.getElementById('statPauses').textContent = pauses;

  const wpmEl = document.getElementById('statWpm');
  if (wpmEl) wpmEl.textContent = wpm > 0 ? wpm : '—';

  const wpmLabelEl = document.getElementById('wpmLabel');
  if (wpmLabelEl && wpm > 0) {
    wpmLabelEl.innerHTML = `<span style="color:${pace.color};font-weight:700;">${pace.label}</span> — ${pace.detail}`;
  } else if (wpmLabelEl) {
    wpmLabelEl.textContent = 'Speak for at least 5 seconds to get a pace estimate.';
  }

  const showFeedback = localStorage.getItem('speakup_feedback') !== 'false';
  const feedbackText = generateFeedback(speakingSec, silenceSec, pauses, recDuration, wpm);
  sessionResult.feedbackText = feedbackText;

  const fbBox = document.getElementById('feedbackBox');
  fbBox.textContent = showFeedback ? feedbackText : 'Feedback is disabled in Settings.';

  document.getElementById('analyticsCard').classList.remove('hidden');
  document.getElementById('timerLabel').textContent = `Recorded ${recDuration}s`;

  document.getElementById('timerBar').style.width = '0%';

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
  if (sessionResult.saved) return;
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

  updateStreak(now);

  document.getElementById('saveStatus').textContent = 'Session saved successfully.';
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

  if (lastDay === todayStr) return;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yStr = toDateStr(yesterday);

  if (lastDay === yStr) {
    streak++;
  } else if (!lastDay) {
    streak = 1;
  } else {
    streak = 1;
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
  return 0;
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

  ['Su','Mo','Tu','We','Th','Fr','Sa'].forEach(d => {
    const el = document.createElement('div');
    el.className = 'cal-header';
    el.textContent = d;
    grid.appendChild(el);
  });

  for (let i = 0; i < firstDay; i++) {
    const el = document.createElement('div');
    el.className = 'cal-day empty';
    grid.appendChild(el);
  }

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