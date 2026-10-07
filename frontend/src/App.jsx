import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import QuizResults from "./components/QuizResults.jsx";
import ChatThread from "./components/ChatThread.jsx";
import CtaRow from "./components/CtaRow.jsx";
import Headline from "./components/Headline.jsx";
import Orb from "./components/Orb.jsx";
import Sidebar from "./components/Sidebar.jsx";
import SuggestionChips from "./components/SuggestionChips.jsx";
import ThemeToggle from "./components/ThemeToggle.jsx";
import VoiceOverlay, { VoiceTurnStage } from "./components/VoiceOverlay.jsx";
import { sendChatStream, sendQuiz, sendSpeak, sendTranscription } from "./api.js";
import { pickRecorderMime } from "./hooks/useMic.js";
import { followUpsFor } from "./hooks/useSession.js";
import { readTheme, persistTheme } from "./hooks/useUser.js";
import useConversations from "./hooks/useConversations.js";

function statusCopy(state, permission) {
  if (permission === "connecting") return "Connecting…";
  if (permission === "denied") return "Microphone blocked";
  return { listening: "Listening…", paused: "Paused", thinking: "Thinking…", speaking: "Speaking…", error: "Please try again" }[state] || "Tap to start talking";
}

function isQuizRequest(text) {
  return /\bquiz\b|test me|क्विज़|क्विज|प्रश्नोत्तरी/i.test(text);
}

export default function App() {
  const conversations = useConversations();
  const { messages, suggestions, id: conversationId } = conversations.active;
  const [theme, setTheme] = useState(readTheme);
  const [screen, setScreen] = useState("home");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState("idle");
  const [error, setError] = useState("");
  const [permission, setPermission] = useState("");
  const [level, setLevel] = useState(0);
  const [voiceTurn, setVoiceTurn] = useState(null);
  const [quizResults, setQuizResults] = useState(null);
  const inputRef = useRef(null);
  const audioRef = useRef(null);
  const operationRef = useRef(null);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const contextRef = useRef(null);
  const playbackContextRef = useRef(null);
  const playbackSourceRef = useRef(null);
  const playbackAnalyserRef = useRef(null);
  const finishPlaybackRef = useRef(null);
  const audioUrlRef = useRef("");
  const rafRef = useRef(0);
  const sendRecordingRef = useRef(null);
  const reducedMotion = useMemo(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false, []);
  const recording = phase === "listening" || phase === "paused";
  const paused = phase === "paused";
  const loading = !["idle", "listening", "paused"].includes(phase);
  const inChat = messages.length > 0 && !recording && !voiceTurn;
  const voiceLive = recording || Boolean(voiceTurn);
  const voiceState = error && phase === "idle" ? "error" : phase;

  useEffect(() => { persistTheme(theme); }, [theme]);
  function toggleTheme() { setTheme((value) => value === "dark" ? "light" : "dark"); }

  function stopLevel() { cancelAnimationFrame(rafRef.current); setLevel(0); }
  function releaseMicrophone() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    contextRef.current?.close().catch(() => {});
    contextRef.current = null;
    stopLevel();
  }
  function stopAsk() {
    const operation = operationRef.current;
    operationRef.current = null;
    operation?.controller.abort();
    finishPlaybackRef.current?.();
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    releaseMicrophone();
    if (operation) conversations.update(operation.conversationId, (item) => ({ messages: item.messages
      .filter((message) => message.id !== operation.replyId || message.content)
      .map((message) => message.id === operation.replyId ? { ...message, pending: false } : message) }));
    setVoiceTurn(null);
    setPhase("idle");
    setPermission("");
  }
  function endVoice() { stopAsk(); }
  useEffect(() => () => {
    operationRef.current?.controller.abort();
    finishPlaybackRef.current?.();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    cancelAnimationFrame(rafRef.current);
    contextRef.current?.close().catch(() => {});
    playbackContextRef.current?.close().catch(() => {});
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
  }, []);
  useEffect(() => {
    function onKey(event) {
      if (quizResults) return;
      if (event.key === "Escape") { if (operationRef.current) { event.preventDefault(); stopAsk(); } return; }
      if (screen !== "home" || inChat || event.code !== "Space" || event.repeat) return;
      if (["INPUT", "TEXTAREA", "BUTTON"].includes(document.activeElement?.tagName)) return;
      event.preventDefault();
      if (recording) stopRecording(); else startRecording();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function beginOperation() {
    if (operationRef.current) return null;
    const operation = { controller: new AbortController(), conversationId, replyId: crypto.randomUUID(), history: messages
      .filter((message) => message.content && !message.pending)
      .slice(-12).map(({ role, content }) => ({ role, content: content.slice(0, 8000) })) };
    operationRef.current = operation;
    setError(""); setScreen("home");
    return operation;
  }
  function isCurrent(operation) { return operationRef.current === operation && !operation.controller.signal.aborted; }
  function changeQuiz(messageId, attempt) {
    conversations.update(conversationId, (item) => ({ messages: item.messages.map((message) => message.id === messageId ? { ...message, attempt } : message) }));
  }
  async function answer(question, operation, spoken = false, languageCode) {
    conversations.update(operation.conversationId, (item) => ({
      title: item.messages.length ? item.title : question.slice(0, 80), suggestions: [],
      messages: [...item.messages, { id: crypto.randomUUID(), role: "user", content: question },
        { id: operation.replyId, role: "assistant", content: "", pending: true }],
    }));
    setPhase("thinking");
    const quizRequested = isQuizRequest(question);
    if (spoken) setVoiceTurn({ question, draft: "", phase: "thinking" });
    const options = { message: question, conversationId: operation.conversationId, history: operation.history, signal: operation.controller.signal };
    let payload;
    if (quizRequested) {
      payload = await sendQuiz(options);
      payload.response = `${payload.quiz.title}\n${payload.quiz.questions.map((q, i) => `${i + 1}. ${q.question}\n${q.options.map((o, j) => `${String.fromCharCode(65 + j)}. ${o}`).join("\n")}`).join("\n")}`;
      payload.quiz.id = operation.replyId;
      payload.suggestions = ["Explain this topic more simply", "Generate a harder quiz"];
    } else {
      payload = await sendChatStream({ ...options, spoken, onDelta(text) {
        if (!isCurrent(operation)) return;
        conversations.update(operation.conversationId, (item) => ({ messages: item.messages.map((message) => message.id === operation.replyId ? { ...message, content: text } : message) }));
        if (spoken) setVoiceTurn({ question, draft: text, phase: "thinking" });
      } });
    }
    if (!isCurrent(operation)) return;
    conversations.update(operation.conversationId, (item) => ({
      messages: item.messages.map((message) => message.id === operation.replyId ? { ...message, content: payload.response, quiz: payload.quiz, pending: false } : message),
      suggestions: payload.suggestions?.length ? payload.suggestions : followUpsFor(question),
    }));
    if (spoken && !quizRequested) {
      setVoiceTurn({ question, draft: payload.response, phase: "preparing" });
      setPhase("preparing");
      try {
        // Speak the entire answer in bounded segments, without silent truncation.
        const segments = payload.response.match(/[\s\S]{1,2200}(?:\s|$)|[\s\S]{1,2200}/g) || [];
        for (const segment of segments) {
          const audio = await sendSpeak({ text: segment, languageCode, signal: operation.controller.signal });
          if (!isCurrent(operation)) return;
          setVoiceTurn({ question, draft: payload.response, phase: "speaking" });
          setPhase("speaking");
          await playResponse(audio.audio_base64);
          if (!isCurrent(operation)) return;
        }
      } catch (err) {
        if (isCurrent(operation)) setError(`The answer is available below. ${err.message}`);
      }
    }
  }
  function finish(operation, err) {
    if (!isCurrent(operation)) return;
    if (err) {
      setError(err.message || "The request failed. Please try again.");
      conversations.update(operation.conversationId, (item) => ({ messages: item.messages
        .filter((message) => message.id !== operation.replyId || message.content)
        .map((message) => message.id === operation.replyId ? { ...message, pending: false } : message) }));
    }
    operationRef.current = null; setPhase("idle"); setVoiceTurn(null);
  }
  async function ask(text) {
    const question = text.trim();
    if (!question) return;
    if (question.length > 8000) { setError("Please keep your question under 8,000 characters."); return; }
    const operation = beginOperation();
    if (!operation) return;
    try { await answer(question, operation); finish(operation); }
    catch (err) { finish(operation, err); }
  }

  function monitor(analyser, operation, microphone = false) {
    stopLevel();
    const data = new Uint8Array(analyser.fftSize);
    let lastSound = Date.now();
    let lastRender = 0;
    const started = Date.now();
    function tick() {
      if (!operation || !isCurrent(operation)) return;
      analyser.getByteTimeDomainData(data);
      const rms = Math.min(1, Math.sqrt(data.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / data.length) * 4);
      const now = Date.now();
      if (now - lastRender > 80) { setLevel(rms); lastRender = now; }
      if (microphone) {
        if (recorderRef.current?.state === "paused" || rms >= 0.045) lastSound = now;
        if (now - lastSound >= 5000 || now - started >= 120000) { sendRecordingRef.current?.(); return; }
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    tick();
  }
  async function playResponse(base64) {
    if (!base64) throw new Error("No spoken audio was returned.");
    const audio = audioRef.current;
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = URL.createObjectURL(new Blob([Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))], { type: "audio/wav" }));
    audio.src = audioUrlRef.current;
    return new Promise((resolve, reject) => {
      let settled = false;
      function finish(err) {
        if (settled) return;
        settled = true; audio.pause(); audio.onended = null; audio.onerror = null;
        finishPlaybackRef.current = null; stopLevel();
        if (err) reject(err); else resolve();
      }
      finishPlaybackRef.current = () => finish();
      audio.onended = () => finish();
      audio.onerror = () => finish(new Error("Audio playback failed. Read the answer below."));
      try {
        if (!playbackContextRef.current) {
          const context = new AudioContext();
          playbackContextRef.current = context;
          playbackSourceRef.current = context.createMediaElementSource(audio);
          playbackAnalyserRef.current = context.createAnalyser();
          playbackSourceRef.current.connect(playbackAnalyserRef.current);
          playbackAnalyserRef.current.connect(context.destination);
        }
        playbackContextRef.current.resume().catch(() => {});
        monitor(playbackAnalyserRef.current, operationRef.current);
      } catch { /* Playback remains useful without an amplitude meter. */ }
      audio.play().catch(() => finish(new Error("Your browser blocked audio playback. Read the answer below.")));
    });
  }
  async function startRecording() {
    const operation = beginOperation();
    if (!operation) return;
    setPermission("connecting"); setPhase("connecting");
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error("This browser does not support microphone recording.");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!isCurrent(operation)) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;
      const mimeType = pickRecorderMime();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      const chunks = [];
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      operation.audioChunks = chunks;
      recorder.onerror = () => {
        if (recorder.state !== "inactive") recorder.stop();
        recorderRef.current = null; releaseMicrophone();
        finish(operation, new Error("Recording failed. Please try again."));
      };
      recorder.start(1000);
      setPermission("ready"); setPhase("listening");
      const context = new AudioContext(); contextRef.current = context;
      const analyser = context.createAnalyser(); context.createMediaStreamSource(stream).connect(analyser);
      monitor(analyser, operation, true);
    } catch (err) {
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      recorderRef.current = null; releaseMicrophone();
      setPermission(err.name === "NotAllowedError" ? "denied" : "error");
      finish(operation, new Error(err.name === "NotAllowedError" ? "Microphone access was denied. Enable it in browser settings." : err.message));
    }
  }
  async function stopRecording() {
    const operation = operationRef.current;
    const recorder = recorderRef.current;
    if (!operation || !recorder || operation.sending) return;
    operation.sending = true;
    setPhase("hearing"); setVoiceTurn({ phase: "hearing", question: "", draft: "" });
    try {
      const blob = await new Promise((resolve) => {
        recorder.onstop = () => resolve(new Blob(operation.audioChunks, { type: recorder.mimeType.split(";")[0] || "audio/webm" }));
        recorder.stop();
      });
      recorderRef.current = null; releaseMicrophone();
      if (!isCurrent(operation)) return;
      if (!blob.size) throw new Error("No audio was captured. Please try again.");
      const data = await sendTranscription({ audioBlob: blob, filename: blob.type.includes("mp4") ? "audio.m4a" : "audio.webm", conversationId: operation.conversationId, signal: operation.controller.signal });
      if (!isCurrent(operation)) return;
      if (!data.transcript?.trim()) throw new Error("No speech was recognized. Please try again.");
      await answer(data.transcript.trim(), operation, true, data.language_code);
      finish(operation);
    } catch (err) { finish(operation, err); }
  }
  sendRecordingRef.current = stopRecording;
  function toggleVoicePause() {
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") { recorder.pause(); setPhase("paused"); }
    else if (recorder?.state === "paused") { recorder.resume(); setPhase("listening"); }
  }
  function openConversation(id) { stopAsk(); conversations.open(id); setScreen("home"); setInput(""); setError(""); }
  function newChat() { stopAsk(); conversations.create(); setScreen("home"); setInput(""); setError(""); }
  const recents = { "Conversations": conversations.items.filter((item) => item.messages.length).map((item) => ({ id: item.id, title: item.title })) };
  function submitComposer(event) {
    event.preventDefault();
    if (operationRef.current || !input.trim()) return;
    ask(input); setInput("");
  }
  const composer = (
    <form className="composer" onSubmit={submitComposer}>
      <button
        type="button"
        className="icon-quiet composer-mic"
        onClick={startRecording}
        aria-label="Talk to Bodh"
        disabled={loading || recording}
      >
        <Mic size={16} strokeWidth={1.5} />
      </button>
      <label className="sr-only" htmlFor="q">Ask a question</label>
      <input
        id="q"
        ref={inputRef}
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder={loading ? "Bodh is answering…" : inChat ? "Ask a follow-up…" : "Ask about a concept…"}
      />
      {loading ? (
        <button className="send stop" type="button" onClick={stopAsk}>
          <Square size={12} fill="currentColor" />
          Stop
        </button>
      ) : (
        <button className="send" type="submit" disabled={!input.trim() || recording}>Send</button>
      )}
    </form>
  );


  return (
    <div className={`layout${collapsed ? " is-collapsed" : ""}`}>
      <Sidebar
        screen={screen}
        onNavigate={(next) => { stopAsk(); setScreen(next); }}
        collapsed={collapsed}
        onToggle={() => {
          if (window.innerWidth < 768) setMobileOpen((open) => !open);
          else setCollapsed((value) => !value);
        }}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        recents={recents}
        onOpenChat={openConversation}
        onNewChat={newChat}
      />

      <div className={`canvas${inChat || voiceLive || screen !== "home" ? " is-page" : ""}${inChat && screen === "home" ? " is-chat" : ""}`}>
        <ThemeToggle theme={theme} onToggle={toggleTheme} />

        {screen === "home" && recording ? (
          <VoiceOverlay
            open
            state={voiceState}
            permission={permission === "ready" ? "" : permission}
            paused={paused}
            level={level}
            reducedMotion={reducedMotion}
            onPause={toggleVoicePause}
            onEnter={stopRecording}
            onEnd={endVoice}
          />
        ) : null}

        {screen === "home" && voiceTurn && !recording ? (
          <VoiceTurnStage
            phase={voiceTurn.phase}
            question={voiceTurn.question}
            draft={voiceTurn.draft}
            level={level}
            reducedMotion={reducedMotion}
            onSkip={stopAsk}
            onCancel={stopAsk}
          />
        ) : null}

        {screen === "home" && !inChat && !recording && !voiceTurn ? (
          <div className="stage">
            <Headline />
            <div className="orb-wrap">
              <Orb
                state={voiceState}
                level={level}
                reducedMotion={reducedMotion}
                onClick={recording ? stopRecording : startRecording}
              />
            </div>
            <p className="status" aria-live="polite">
              {statusCopy(voiceState, permission)}
            </p>
            <CtaRow
              onTalk={startRecording}
              onType={() => inputRef.current?.focus()}
              busy={loading}
            />
            {composer}
            {error ? <p className="err" role="alert">{error}</p> : null}
            <p className="footer-note">No silly questions. Just new discoveries.</p>
          </div>
        ) : null}

        {screen === "home" && inChat ? (
          <div className="chat-shell">
            <ChatThread messages={messages} loading={loading} onQuizChange={changeQuiz} onQuizResults={(message, attempt) => setQuizResults({ messageId: message.id, quiz: message.quiz, attempt })} />
            {error ? <p className="err chat-err" role="alert">{error}</p> : null}
            {!loading ? <SuggestionChips items={suggestions} onPick={ask} /> : null}
            <div className="chat-dock">{composer}</div>
          </div>
        ) : null}

        {screen === "history" ? (
          <section className="panel">
            <h2>History</h2>
            {messages.length === 0 ? (
              <p className="micro">No questions in this conversation yet.</p>
            ) : (
              <ChatThread messages={messages} loading={false} onQuizChange={changeQuiz} onQuizResults={(message, attempt) => setQuizResults({ messageId: message.id, quiz: message.quiz, attempt })} />
            )}
          </section>
        ) : null}

        {screen === "settings" ? (
          <section className="panel">
            <h2>Settings</h2>
            <p className="micro">Theme follows your last choice. First visit follows the system.</p>
            <button type="button" className="ghost" onClick={toggleTheme}>Switch to {theme === "dark" ? "light" : "dark"} theme</button>
            <p className="micro">History is saved on this browser. Questions and recordings are sent to Sarvam to generate responses.</p>
            <button type="button" className="ghost" onClick={() => { if (window.confirm("Delete all saved conversations on this device?")) { stopAsk(); conversations.clear(); } }}>Clear saved history</button>
          </section>
        ) : null}

        {conversations.storageError ? <p className="err" role="alert">{conversations.storageError}</p> : null}
        {quizResults ? <QuizResults
          quiz={quizResults.quiz} attempt={quizResults.attempt}
          onClose={() => setQuizResults(null)}
          onRetry={() => {
            changeQuiz(quizResults.messageId, { answers: {}, submitted: false });
            setQuizResults(null);
          }}
        /> : null}
        <audio ref={audioRef} className="sr-only" />
      </div>
    </div>
  );
}
