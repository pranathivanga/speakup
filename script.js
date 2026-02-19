/* ============================================================
   SpeakUp — script.js
   Post-record audio analysis (STABLE)
   ============================================================ */

/* ---------- STATE ---------- */
let mediaRecorder = null;
let audioChunks = [];
let timerInterval = null;
let countdownSec = 0;
let maxDuration = 60;
let isRecording = false;

let analysisData = {
  totalSpeakingMs: 0,
  pauseCount: 0,
};

let sessionResult = null;
let currentTopic = "";

/* ---------- RECORDING ---------- */
async function toggleRecording() {
  if (isRecording) stopRecording();
  else await startRecording();
}

async function startRecording() {
  analysisData = { totalSpeakingMs: 0, pauseCount: 0 };
  sessionResult = null;
  audioChunks = [];

  document.getElementById('playbackCard').classList.add('hidden');
  document.getElementById('analyticsCard').classList.add('hidden');
  document.getElementById('saveStatus').textContent = '';

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    alert('Mic permission denied');
    return;
  }

  mediaRecorder = new MediaRecorder(stream);
  mediaRecorder.ondataavailable = e => e.data.size && audioChunks.push(e.data);

  mediaRecorder.onstop = async () => {
    stream.getTracks().forEach(t => t.stop());
    const blob = new Blob(audioChunks, { type: 'audio/webm' });
    await analyzeRecording(blob);
    finishRecording(blob);
  };

  mediaRecorder.start();
  isRecording = true;

  document.getElementById('recordBtn').classList.add('recording');
  document.getElementById('recordIcon').textContent = '⏹';
  document.getElementById('recordHint').textContent = 'Recording... click to stop';

  maxDuration = parseInt(localStorage.getItem('speakup_duration') || '60');
  countdownSec = 0;
  startTimer();
}

function stopRecording() {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
  isRecording = false;
  clearInterval(timerInterval);
  mediaRecorder.stop();

  document.getElementById('recordBtn').classList.remove('recording');
  document.getElementById('recordIcon').textContent = '⏺';
  document.getElementById('recordHint').textContent = 'Click to start recording';
  document.getElementById('timerLabel').textContent = 'Processing...';
}

/* ---------- POST-RECORD ANALYSIS ---------- */
async function analyzeRecording(blob) {
  const audioCtx = new AudioContext();
  const buffer = await audioCtx.decodeAudioData(await blob.arrayBuffer());
  const samples = buffer.getChannelData(0);
  const rate = buffer.sampleRate;

  const FRAME = Math.floor(rate * 0.02);
  const THRESHOLD = 0.015;

  let speakingMs = 0;
  let pauseCount = 0;
  let inSpeech = false;
  let silenceMs = 0;

  for (let i = 0; i < samples.length; i += FRAME) {
    let sum = 0;
    for (let j = 0; j < FRAME && i + j < samples.length; j++) {
      sum += samples[i + j] ** 2;
    }
    const rms = Math.sqrt(sum / FRAME);
    const frameMs = (FRAME / rate) * 1000;

    if (rms >= THRESHOLD) {
      speakingMs += frameMs;
      if (!inSpeech && silenceMs >= 300) pauseCount++;
      silenceMs = 0;
      inSpeech = true;
    } else {
      silenceMs += frameMs;
      inSpeech = false;
    }
  }

  analysisData.totalSpeakingMs = speakingMs;
  analysisData.pauseCount = pauseCount;
}

/* ---------- FINISH ---------- */
function finishRecording(blob) {
  const url = URL.createObjectURL(blob);
  document.getElementById('audioPlayback').src = url;
  document.getElementById('playbackCard').classList.remove('hidden');

  const duration = countdownSec;
  const speakingSec = Math.min(Math.round(analysisData.totalSpeakingMs / 1000), duration);
  const silenceSec = Math.max(duration - speakingSec, 0);
  const pauses = analysisData.pauseCount;

  const wpm = estimateWPM(speakingSec, duration);
  const pace = getPaceLabel(wpm);

  sessionResult = { speakingSec, silenceSec, pauses, duration, wpm };

  document.getElementById('statSpeak').textContent = speakingSec + 's';
  document.getElementById('statSilence').textContent = silenceSec + 's';
  document.getElementById('statPauses').textContent = pauses;
  document.getElementById('statWpm').textContent = wpm || '—';
  document.getElementById('wpmLabel').innerHTML =
    wpm ? `<b>${pace.label}</b> — ${pace.detail}` : 'Speak longer for pace';

  document.getElementById('analyticsCard').classList.remove('hidden');
  document.getElementById('timerLabel').textContent = `Recorded ${duration}s`;
  document.getElementById('timerBar').style.width = '0%';
}

/* ---------- TIMER ---------- */
function startTimer() {
  document.getElementById('timerLabel').textContent = `Recording — ${maxDuration}s max`;
  timerInterval = setInterval(() => {
    countdownSec++;
    document.getElementById('timerDisplay').textContent =
      new Date(countdownSec * 1000).toISOString().substr(14, 5);
    document.getElementById('timerBar').style.width =
      `${(countdownSec / maxDuration) * 100}%`;
    if (countdownSec >= maxDuration) stopRecording();
  }, 1000);
}

/* ---------- PACE ---------- */
function estimateWPM(speakingSec, totalSec) {
  if (!speakingSec || !totalSec) return 0;
  return Math.round((speakingSec * 3.26) / (totalSec / 60));
}

function getPaceLabel(wpm) {
  if (wpm < 110) return { label: 'Slow', detail: 'Try smoother flow' };
  if (wpm <= 160) return { label: 'Perfect', detail: 'Great pace' };
  return { label: 'Fast', detail: 'Slow down slightly' };
}
