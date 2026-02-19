# SpeakUp — Speaking Practice Web App

SpeakUp is a browser-based web application designed to help users improve spontaneous speaking and delivery.
It records short speaking sessions and analyzes speaking time, silence, pauses, and estimated speaking pace (WPM).

## Tech Stack
HTML5, CSS3, Vanilla JavaScript, MediaRecorder API, Web Audio API (post-record analysis), LocalStorage

## Key Features
- Real microphone recording
- Speaking vs silence detection
- Pause counting using RMS-based audio analysis
- Estimated speaking pace (WPM)
- Session history, streak tracking, and calendar view
- Local-only, privacy-friendly data storage

## Technical Note
Audio analysis is performed after recording using decoded audio buffers instead of live microphone analysis.
This approach improves reliability across browsers and environments.

## How to Run
- Open the project in a modern browser (Chrome recommended)
- Allow microphone access when prompted
- No backend or build steps required
