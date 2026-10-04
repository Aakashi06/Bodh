export default function Orb({ state = "idle", level = 0, onClick, reducedMotion = false }) {
  const amp = reducedMotion ? 0 : Math.min(1, Math.max(0, level));
  const label = {
    idle: "Tap to start talking",
    listening: "Listening...",
    thinking: "Thinking...",
    speaking: "Speaking...",
    paused: "Paused",
    error: "Something went wrong",
  }[state];

  return (
    <button
      type="button"
      className={`orb orb-${state}${reducedMotion ? " static" : ""}`}
      style={{ "--amp": amp }}
      onClick={onClick}
      aria-label={label}
    >
      <span className="orb-floor" />
      <span className="orb-glow" />
      <span className="orb-aura" />
      <span className="orb-orbit o1" aria-hidden="true">
        <i />
      </span>
      <span className="orb-orbit o2" aria-hidden="true">
        <i />
      </span>
      <span className="orb-sphere">
        <span className="orb-core" />
        <span className="orb-swirl" />
        <span className="orb-caustic" />
        <span className="orb-gloss" />
        <span className="orb-spec" />
        <span className="orb-rim" />
      </span>
      {state === "listening" || state === "speaking" ? (
        <>
          <span className="ripple r1" />
          <span className="ripple r2" />
        </>
      ) : null}
    </button>
  );
}
