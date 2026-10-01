import { useMemo, useRef, useState } from "react";
import { sendChatMessage, sendVoiceMessage } from "./api.js";

function createConversationId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `conv-${Date.now()}`;
}

function playBase64Wav(audioBase64) {
  const src = `data:audio/wav;base64,${audioBase64}`;
  const audio = new Audio(src);
  audio.play().catch(() => {});
  return src;
}

function pickRecorderMime() {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

export default function Chat({ learner, onBack }) {
  const conversationId = useMemo(() => createConversationId(), []);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);

  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState("");
  const [lastAudioSrc, setLastAudioSrc] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    const text = input.trim();
    if (!text || loading || recording) {
      return;
    }

    setError("");
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setLoading(true);

    try {
      const data = await sendChatMessage({
        message: text,
        conversationId,
      });
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.response },
      ]);
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function startRecording() {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("This browser does not support microphone recording.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mimeType = pickRecorderMime();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.start();
      setRecording(true);
    } catch (err) {
      setError(
        err.name === "NotAllowedError"
          ? "Microphone permission was denied."
          : "Could not access the microphone."
      );
    }
  }

  async function stopRecording() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      setRecording(false);
      return;
    }

    const blob = await new Promise((resolve) => {
      recorder.onstop = () => {
        const type = (recorder.mimeType || "audio/webm").split(";")[0] || "audio/webm";
        resolve(new Blob(chunksRef.current, { type }));
      };
      recorder.stop();
    });

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setRecording(false);

    if (!blob.size) {
      setError("No audio was captured. Try recording again.");
      return;
    }

    const filename = blob.type.includes("mp4") ? "audio.m4a" : "audio.webm";
    setLoading(true);
    setError("");

    try {
      const data = await sendVoiceMessage({
        audioBlob: blob,
        filename,
        conversationId,
      });
      setMessages((prev) => [
        ...prev,
        { role: "user", content: data.transcript },
        { role: "assistant", content: data.response },
      ]);
      setLastAudioSrc(playBase64Wav(data.audio_base64));
    } catch (err) {
      setError(err.message || "Voice request failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app">
      <header className="header">
        <p className="nav-row">
          <button type="button" className="link" onClick={onBack}>
            Dashboard
          </button>
        </p>
        <h1>NIB</h1>
        <p>
          {learner.name} · Class {learner.classLevel}
        </p>
      </header>

      <section className="transcript" aria-live="polite">
        {messages.length === 0 && !loading && !recording ? (
          <p className="empty">Ask a question or record a voice message.</p>
        ) : null}
        {messages.map((message, index) => (
          <article
            key={`${message.role}-${index}`}
            className={`bubble ${message.role}`}
          >
            <span className="label">
              {message.role === "user" ? "You" : "NIB"}
            </span>
            <p>{message.content}</p>
          </article>
        ))}
        {recording ? <p className="status">Recording… click Stop when done.</p> : null}
        {loading ? <p className="status">NIB is thinking…</p> : null}
      </section>

      {lastAudioSrc ? (
        <audio className="playback" controls src={lastAudioSrc} />
      ) : null}

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}

      <form className="composer" onSubmit={handleSubmit}>
        <label htmlFor="message" className="sr-only">
          Message
        </label>
        <input
          id="message"
          name="message"
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask NIB something…"
          disabled={loading || recording}
          autoComplete="off"
        />
        <button type="submit" disabled={loading || recording || !input.trim()}>
          {loading ? "Sending…" : "Send"}
        </button>
        {recording ? (
          <button type="button" className="record stop" onClick={stopRecording}>
            Stop
          </button>
        ) : (
          <button
            type="button"
            className="record"
            onClick={startRecording}
            disabled={loading}
          >
            Record
          </button>
        )}
      </form>
    </main>
  );
}
