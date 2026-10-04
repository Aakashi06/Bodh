/**
 * Mic wiring: getUserMedia → MediaRecorder for /api/voice.
 * Amplitude: AudioContext + AnalyserNode (fftSize 256), RMS of time-domain data → level 0..1.
 * TTS: decode base64 WAV, play via <audio>, MediaElementSource → same AnalyserNode for speaking level.
 * Space starts talking only when document.activeElement is not an input/textarea.
 */
export function pickRecorderMime() {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}
