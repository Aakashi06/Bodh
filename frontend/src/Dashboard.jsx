import { heatmapDays, levelFromXp, xpIntoLevel, XP_PER_LEVEL } from "./learner.js";

function intensity(count) {
  if (count >= 4) return 3;
  if (count >= 2) return 2;
  if (count >= 1) return 1;
  return 0;
}

export default function Dashboard({ learner, onOpenChat }) {
  const xp = learner.xp || 0;
  const streak = learner.streak || 0;
  const level = levelFromXp(xp);
  const into = xpIntoLevel(xp);
  const progressEntries = Object.entries(learner.progress || {});
  const activity = learner.recentActivity || [];
  const heat = heatmapDays(activity);
  const milestones = [
    { label: "Joined NIB", done: true },
    { label: "First session", done: activity.length > 0 },
    { label: "7-day streak", done: streak >= 7 },
    { label: "Level 2", done: level >= 2 },
  ];

  return (
    <main className="app">
      <header className="header">
        <h1>Hi, {learner.name}</h1>
        <p>
          Class {learner.classLevel} · {learner.board} · {learner.language}
        </p>
      </header>

      <section className="stats">
        <article>
          <span>XP</span>
          <strong>{xp}</strong>
        </article>
        <article>
          <span>Level {level}</span>
          <div className="bar">
            <i style={{ width: `${(into / XP_PER_LEVEL) * 100}%` }} />
          </div>
          <small>
            {into}/{XP_PER_LEVEL} to next
          </small>
        </article>
        <article>
          <span>Streak</span>
          <strong>{streak} days</strong>
        </article>
      </section>

      <section className="card">
        <h2>Milestones</h2>
        <ul className="milestones">
          {milestones.map((item) => (
            <li key={item.label} className={item.done ? "done" : ""}>
              {item.label}
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>Subjects</h2>
        {progressEntries.length === 0 ? (
          <p className="empty">No subjects yet.</p>
        ) : (
          <ul className="progress-list">
            {progressEntries.map(([subject, value]) => (
              <li key={subject}>
                <div className="row">
                  <span>{subject}</span>
                  <span>{value}%</span>
                </div>
                <div className="bar">
                  <i style={{ width: `${value}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>Learning activity</h2>
        <div className="heatmap" role="img" aria-label="Learning activity heatmap">
          {heat.map((day) => (
            <span
              key={day.date}
              className={`cell i${intensity(day.count)}`}
              title={`${day.date}: ${day.count}`}
            />
          ))}
        </div>
        <p className="empty">
          {activity.length === 0 ? "No activity yet." : `${activity.length} recent sessions`}
        </p>
      </section>

      <section className="card">
        <h2>Recent activity</h2>
        {activity.length === 0 ? (
          <p className="empty">No sessions yet. Start a chat to begin.</p>
        ) : (
          <ul>
            {activity.map((item, index) => (
              <li key={index}>{typeof item === "string" ? item : item.label || item.date}</li>
            ))}
          </ul>
        )}
      </section>

      <button type="button" className="primary" onClick={onOpenChat}>
        Continue learning
      </button>
    </main>
  );
}
