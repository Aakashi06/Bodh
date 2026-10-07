export default function Quiz({ quiz, attempt = { answers: {}, submitted: false }, onChange, onResults }) {
  const { answers, submitted } = attempt;
  const answered = Object.keys(answers).length;
  const score = quiz.questions.filter((question, index) => answers[index] === question.correct_index).length;
  return (
    <div className="msg-body">
      <p>{quiz.title}</p>
      <p className="micro" role="status">{submitted ? `Score: ${score}/${quiz.questions.length}` : `${answered}/${quiz.questions.length} answered`}</p>
      <ol className="q-list">
        {quiz.questions.map((question, index) => (
          <li key={index}>
            <span id={`question-${quiz.id}-${index}`}>{question.question}</span>
            <ul className="mcq-opts" role="radiogroup" aria-labelledby={`question-${quiz.id}-${index}`}>
              {question.options.map((option, optionIndex) => (
                <li key={optionIndex} className={answers[index] === optionIndex ? "is-selected" : ""}>
                  <label className="quiz-option">
                    <input type="radio" name={`quiz-${quiz.id}-${index}`} checked={answers[index] === optionIndex}
                      disabled={submitted} onChange={() => onChange({ answers: { ...answers, [index]: optionIndex }, submitted: false })} />
                    <span>{String.fromCharCode(65 + optionIndex)}. {option}</span>
                  </label>
                </li>
              ))}
            </ul>
            {submitted ? <p className="quiz-feedback">
              {answers[index] === question.correct_index ? "Correct." : `Correct answer: ${String.fromCharCode(65 + question.correct_index)}. ${question.options[question.correct_index]}.`} {question.explanation}
            </p> : null}
          </li>
        ))}
      </ol>
      <div className="cta-row">
        {submitted ? <><button type="button" className="talk" onClick={() => onResults(attempt)}>View results</button><button type="button" className="ghost" onClick={() => onChange({ answers: {}, submitted: false })}>Retry quiz</button></>
          : <button type="button" className="talk" disabled={answered !== quiz.questions.length} onClick={() => { const result = { answers, submitted: true }; onChange(result); onResults(result); }}>Submit answers</button>}
      </div>
    </div>
  );
}
