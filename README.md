SpeakUp 🎤

Impromptu speaking practice — right in your browser.

SpeakUp is a frontend-only web app that helps you practice imppromptu speaking by recording your response to a random prompt and analyzing how you speak, not what you say.

No account · No install · No backend

🔗 Live Demo: https://pranathivanga.github.io/speakup/


✨ Why SpeakUp?

Most speaking tools focus on content.
SpeakUp focuses on delivery.

It helps you improve articulation by tracking:

speaking time

silence time

pause frequency

All feedback is instant and private.

🚀 What SpeakUp does:

Each practice session:

🎲 generates a random speaking prompt

🎙️ records your voice for a fixed duration

📊 analyzes speaking vs silence in real time

⏸ detects meaningful pauses (not breath gaps)

📝 provides clear, plain-English feedback

💾 saves session history locally

Nothing is uploaded.
Everything stays in your browser.

🧩 Features:

🎙️ Real audio recording (MediaRecorder API)

⏱️ Configurable duration: 30 / 60 / 90 seconds

🎲 Random topic generator

📊 Speaking time, silence time, pause detection

📝 Human-readable feedback (no vague scores)

📅 Practice calendar with active days highlighted

🔥 Daily streak tracking

🌙 Dark mode

💾 Local persistence using localStorage

🧠 How the analysis works:

Voice activity detected using RMS amplitude (Web Audio API)

Speaking & silence measured using high-precision timestamps (performance.now)

Short breath gaps ignored to prevent false pauses

Speaking pace (WPM) estimated from actual speaking time

No speech-to-text
No content analysis
No AI guessing

🛠 Tech Stack:

Languages

HTML

CSS

Vanilla JavaScript

Browser APIs

MediaRecorder API

Web Audio API

localStorage

performance.now

No frameworks.
No dependencies.
No build step.

▶️ Run locally:
git clone https://github.com/yourusername/speakup
cd speakup
python -m http.server 8000


Open:
http://localhost:8000

A local server is required. Browser microphone access does not work with file:// URLs.
