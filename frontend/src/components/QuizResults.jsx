import { useEffect, useRef, useState } from "react";
import { CheckCircle2, XCircle, X } from "lucide-react";

function optionLabel(question, index) {
  return Number.isInteger(index) && question.options[index] !== undefined
    ? `${String.fromCharCode(65 + index)}. ${question.options[index]}`
    : "Not answered";
}

export default function QuizResults({ quiz, attempt, onClose, onRetry }) {
  const dialogRef = useRef(null);
  const [filter, setFilter] = useState("all");
  const answers = attempt.answers || {};
  const total = quiz.questions.length;
  const correct = quiz.questions.filter((question, index) => answers[index] === question.correct_index).length;
  const percentage = Math.round(correct / total * 100);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    dialog.showModal();
    dialog.scrollTop = 0;
    return () => {
      dialog.close();
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  return (
    <dialog ref={dialogRef} className="quiz-results" aria-labelledby="quiz-results-title"
      onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <header className="results-header">
        <div><p className="micro">Quiz complete</p><h2 id="quiz-results-title">Your results</h2><p className="results-topic">{quiz.title}</p></div>
        <button type="button" className="icon-quiet" aria-label="Close results" onClick={onClose} autoFocus><X size={20} /></button>
      </header>

      <section className="results-summary" aria-label="Score summary">
        <div className="results-score"><strong>{percentage}<span>%</span></strong><p>{correct} of {total} correct</p></div>
        <div className="results-stat"><CheckCircle2 aria-hidden="true" /><strong>{correct}</strong><span>Correct</span></div>
        <div className="results-stat"><XCircle aria-hidden="true" /><strong>{total - correct}</strong><span>Incorrect</span></div>
      </section>

      <section aria-labelledby="answer-review-title">
        <div className="results-review-header">
          <h3 id="answer-review-title">Answer review</h3>
          <div className="results-filters" aria-label="Filter questions">
            {[ ["all", "All"], ["correct", "Correct"], ["incorrect", "Incorrect"] ].map(([value, label]) => (
              <button type="button" className="chip" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>
            ))}
          </div>
        </div>
        <div className="results-questions">
          {quiz.questions.map((question, index) => {
            const isCorrect = answers[index] === question.correct_index;
            if (filter === "correct" && !isCorrect || filter === "incorrect" && isCorrect) return null;
            return (
              <article className="result-question" key={index}>
                <div className={`result-status ${isCorrect ? "is-correct" : "is-incorrect"}`}>
                  {isCorrect ? <CheckCircle2 size={18} aria-hidden="true" /> : <XCircle size={18} aria-hidden="true" />}
                  <span>Question {index + 1} · {isCorrect ? "Correct" : "Incorrect"}</span>
                </div>
                <h4>{question.question}</h4>
                <dl className="result-answers">
                  <div><dt>Your answer</dt><dd>{optionLabel(question, answers[index])}</dd></div>
                  <div><dt>Correct answer</dt><dd>{optionLabel(question, question.correct_index)}</dd></div>
                </dl>
                <p className="result-explanation"><strong>Why: </strong>{question.explanation}</p>
              </article>
            );
          })}
          {(filter === "incorrect" && correct === total || filter === "correct" && correct === 0) ?
            <p className="micro">No {filter} answers in this attempt.</p> : null}
        </div>
      </section>
      <footer className="results-actions">
        <button type="button" className="ghost" onClick={onClose}>Back to chat</button>
        <button type="button" className="talk" onClick={onRetry}>Retry quiz</button>
      </footer>
    </dialog>
  );
}
