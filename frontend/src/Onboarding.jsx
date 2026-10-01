import { useState } from "react";
import { BOARDS, CLASSES, LANGUAGES, SUBJECTS, createLearner } from "./learner.js";

export default function Onboarding({ onComplete }) {
  const [name, setName] = useState("");
  const [classLevel, setClassLevel] = useState("8");
  const [board, setBoard] = useState("CBSE");
  const [subjects, setSubjects] = useState(["Science", "Maths"]);
  const [language, setLanguage] = useState("Hinglish");
  const [error, setError] = useState("");

  function toggleSubject(subject) {
    setSubjects((prev) =>
      prev.includes(subject)
        ? prev.filter((item) => item !== subject)
        : [...prev, subject]
    );
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Enter a name or nickname.");
      return;
    }
    if (subjects.length === 0) {
      setError("Select at least one subject.");
      return;
    }
    onComplete(
      createLearner({
        name,
        classLevel,
        board,
        subjects,
        language,
      })
    );
  }

  return (
    <main className="app">
      <header className="header">
        <h1>NIB</h1>
        <p>Tell us a bit about you</p>
      </header>
      <form className="onboard" onSubmit={handleSubmit}>
        <label>
          Name / nickname
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="nickname"
          />
        </label>
        <label>
          Class
          <select
            value={classLevel}
            onChange={(event) => setClassLevel(event.target.value)}
          >
            {CLASSES.map((item) => (
              <option key={item} value={item}>
                Class {item}
              </option>
            ))}
          </select>
        </label>
        <label>
          Board
          <select value={board} onChange={(event) => setBoard(event.target.value)}>
            {BOARDS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend>Subjects</legend>
          <div className="chips">
            {SUBJECTS.map((subject) => (
              <label key={subject} className="chip">
                <input
                  type="checkbox"
                  checked={subjects.includes(subject)}
                  onChange={() => toggleSubject(subject)}
                />
                {subject}
              </label>
            ))}
          </div>
        </fieldset>
        <label>
          Preferred language
          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
          >
            {LANGUAGES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit">Start learning</button>
      </form>
    </main>
  );
}
