export default function Headline({ compact = false }) {
  const hour = new Date().getHours();
  const part = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  return (
    <header className={`headline-block enter${compact ? " is-compact" : ""}`}>
      <p className="eyebrow">Learning that listens.</p>
      <h1>Good {part}, what shall we understand today?</h1>
      {compact ? null : (
        <p className="subtitle">Ask a question, explore an idea, or pick up where you left off.</p>
      )}
    </header>
  );
}
