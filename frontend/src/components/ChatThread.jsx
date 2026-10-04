import { useEffect, useRef } from "react";

function QuestionItem({ text }) {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const stem = lines[0] || text;
  const options = lines.slice(1).filter((line) => /^[A-Da-d][.)]/.test(line));
  return (
    <li>
      <span>{stem}</span>
      {options.length ? (
        <ul className="mcq-opts">
          {options.map((option) => (
            <li key={option}>{option}</li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function MessageBody({ text, pending }) {
  const lines = (text || "").split("\n");
  const numbered = [];
  const preface = [];
  let inList = false;

  for (const line of lines) {
    const match = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    if (match) {
      inList = true;
      numbered.push(match[2]);
    } else if (inList && /^\s*[A-Da-d][.)]\s+/.test(line)) {
      numbered[numbered.length - 1] = `${numbered[numbered.length - 1]}\n${line.trim()}`;
    } else if (!inList) {
      preface.push(line);
    } else if (line.trim()) {
      numbered[numbered.length - 1] = `${numbered[numbered.length - 1]} ${line.trim()}`;
    }
  }

  return (
    <div className="msg-body">
      {preface.join("\n").trim() ? <p>{preface.join("\n").trim()}</p> : null}
      {numbered.length ? (
        <ol className="q-list">
          {numbered.map((item, index) => (
            <QuestionItem key={`${index}-${item.slice(0, 24)}`} text={item} />
          ))}
        </ol>
      ) : null}
      {pending ? <span className="cursor-blink" aria-hidden="true" /> : null}
    </div>
  );
}

export default function ChatThread({ messages, loading, status }) {
  const threadRef = useRef(null);
  const last = messages[messages.length - 1];
  const waiting = loading && (!last || last.role !== "assistant" || !last.content);

  useEffect(() => {
    const node = threadRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages, loading, status]);

  return (
    <div className="chat-thread" ref={threadRef} aria-live="polite">
      {messages.map((message, index) => (
        <article key={index} className={`bubble bubble-${message.role}`}>
          <p className="micro">{message.role === "user" ? "You" : "Bodh"}</p>
          {message.role === "assistant" && !message.content && message.pending ? (
            <p className="thinking">Thinking…</p>
          ) : (
            <MessageBody text={message.content} pending={message.pending} />
          )}
        </article>
      ))}
      {status ? <p className="thinking">{status}</p> : null}
      {waiting && last?.role === "user" ? <p className="thinking">Thinking…</p> : null}
    </div>
  );
}
