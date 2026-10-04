import { Pause, Play, Send, Square } from "lucide-react";
import Orb from "./Orb.jsx";

function Meter({ level, paused }) {
  return (
    <div className={`listen-meter${paused ? " is-paused" : ""}`} aria-hidden="true">
      {Array.from({ length: 18 }, (_, index) => {
        const wave = Math.abs(Math.sin(index * 0.7 + level * 9));
        const height = paused ? 8 : 8 + level * 40 * (0.35 + wave);
        return <span key={index} style={{ height: `${height}px` }} />;
      })}
    </div>
  );
}

export default function VoiceOverlay({
  open,
  state,
  permission,
  paused,
  level = 0,
  reducedMotion = false,
  onPause,
  onEnter,
  onEnd,
}) {
  if (!open) return null;

  const permissionCopy = {
    prompt: "Bodh needs the microphone to listen.",
    connecting: "Connecting to microphone…",
    denied: "Microphone access was denied. Enable it in the browser and try again.",
    error: "Could not reach the microphone.",
  }[permission];

  const listening = state === "listening" || state === "paused";

  return (
    <div className="listen-stage" role="dialog" aria-modal="true" aria-label="Listening">
      <p className={`listen-live${paused ? " is-paused" : ""}`}>
        <i />
        {paused ? "Paused" : permission === "connecting" ? "Connecting" : "Listening"}
      </p>
      {permissionCopy ? <p className="overlay-note">{permissionCopy}</p> : null}
      <Orb
        state={paused ? "paused" : state}
        level={paused ? 0 : level}
        reducedMotion={reducedMotion}
        onClick={listening ? onEnter : undefined}
      />
      <Meter level={paused ? 0 : level} paused={paused} />
      <p className="listen-copy">
        {paused
          ? "Recording is paused. Resume when you want to keep talking."
          : "Bodh is listening. Pause, stop, or send your question."}
      </p>
      <p className="micro">Sends on its own after 5 seconds of silence</p>
      <div className="listen-actions">
        <button type="button" className="ghost" onClick={onPause}>
          {paused ? <Play size={16} strokeWidth={1.5} /> : <Pause size={16} strokeWidth={1.5} />}
          {paused ? "Resume" : "Pause"}
        </button>
        <button type="button" className="talk overlay-enter" onClick={onEnter} disabled={!listening}>
          <Send size={16} strokeWidth={1.5} />
          Send
        </button>
        <button type="button" className="ghost listen-stop" onClick={onEnd}>
          <Square size={14} strokeWidth={1.5} />
          Stop
        </button>
      </div>
    </div>
  );
}

export function VoiceTurnStage({
  phase,
  question,
  draft,
  level = 0,
  reducedMotion = false,
  onSkip,
}) {
  const label = phase === "hearing" ? "Hearing you" : phase === "speaking" ? "Speaking" : "Thinking";
  return (
    <div className="listen-stage" role="status" aria-live="polite">
      <p className="listen-live">
        <i />
        {label}
      </p>
      <Orb
        state={phase === "speaking" ? "speaking" : "thinking"}
        level={level}
        reducedMotion={reducedMotion}
      />
      {question ? <p className="voice-question">{question}</p> : <p className="thinking">Hearing your question…</p>}
      {draft ? <p className="voice-draft">{draft}</p> : phase === "thinking" && question ? <p className="thinking">Thinking…</p> : null}
      {phase === "speaking" ? (
        <button type="button" className="ghost" onClick={onSkip}>
          Skip to chat
        </button>
      ) : null}
    </div>
  );
}
