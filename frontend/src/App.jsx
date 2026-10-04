import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import ChatThread from "./components/ChatThread.jsx";
import CtaRow from "./components/CtaRow.jsx";
import Headline from "./components/Headline.jsx";
import Orb from "./components/Orb.jsx";
import Sidebar from "./components/Sidebar.jsx";
import SuggestionChips from "./components/SuggestionChips.jsx";
import ThemeToggle from "./components/ThemeToggle.jsx";
import VoiceOverlay, { VoiceTurnStage } from "./components/VoiceOverlay.jsx";
import { sendChatStream, sendSpeak, sendTranscription } from "./api.js";
import { pickRecorderMime } from "./hooks/useMic.js";
import { ensureQuizSuggestion, followUpsFor } from "./hooks/useSession.js";
import { persistTheme } from "./hooks/useUser.js";

function createConversationId() {
  return crypto.randomUUID ? crypto.randomUUID() : `conv-${Date.now()}`;
}

function statusCopy(state, permission) {
  if (permission === "denied") return "Microphone blocked";
  if (permission === "connecting") return "Connecting...";
  if (state === "listening") return "Listening...";
  if (state === "paused") return "Paused";
  if (state === "thinking") return "Thinking...";
  if (state === "speaking") return "Speaking...";
  if (state === "muted") return "Microphone muted";
  if (state === "error") return "Something went wrong";
  return "Tap to start talking";
}

function pickSuggestions(question, payload) {
  const fromApi = Array.isArray(payload?.suggestions)
    ? payload.suggestions.map((item) => String(item).trim()).filter(Boolean).slice(0, 3)
    : [];
  return ensureQuizSuggestion(fromApi.length ? fromApi : followUpsFor(question), question);
}

export default function App() {
  const conversationId = useMemo(() => createConversationId(), []);
  const recorderRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const audioRef = useRef(null);
  const audioUrlRef = useRef("");
  const rafRef = useRef(0);
  const stopRecordingRef = useRef(() => {});
  const recordingLiveRef = useRef(false);
  const pausedRef = useRef(false);
  const lastSoundRef = useRef(0);
  const lastLevelAtRef = useRef(0);
  const skipSpeakRef = useRef(() => {});
  const voiceTurnRef = useRef(null);
  const loadingRef = useRef(false);
  const SILENCE_MS = 5000;
  const SOUND_FLOOR = 0.045;

  const [theme, setTheme] = useState(() => {
    const stored = localStorage.getItem("bodh.theme");
    const next =
      stored === "light" || stored === "dark"
        ? stored
        : window.matchMedia?.("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    persistTheme(next);
    return next;
  });
  const [screen, setScreen] = useState("home");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState("");
  const [permission, setPermission] = useState("");
  const [level, setLevel] = useState(0);
  const [captions, setCaptions] = useState("");
  const [voiceTurn, setVoiceTurn] = useState(null);
  const reducedMotion = useMemo(
    () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
    []
  );

  const inChat = messages.length > 0 && !recording && !voiceTurn;
  const voiceLive = recording || Boolean(voiceTurn);
  const voiceState = error && !recording
    ? permission === "denied"
      ? "error"
      : "idle"
    : recording && paused
      ? "paused"
      : recording
        ? "listening"
        : loading
          ? "thinking"
          : speaking
            ? "speaking"
            : "idle";

  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    abortRef.current?.abort();
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
  }, []);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape" && (recording || speaking)) {
        event.preventDefault();
        endVoice();
      }
      if (inChat || event.code !== "Space" || event.repeat) return;
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      event.preventDefault();
      if (recording) stopRecording();
      else if (!loading && !speaking) startRecording();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    persistTheme(next);
    setTheme(next);
  }

  function watchLevel(sourceNode, context, { forRecording = false } = {}) {
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    sourceNode.connect(analyser);
    if (!sourceNode.mediaStream) analyser.connect(context.destination);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.min(1, Math.sqrt(sum / data.length) * 4);
      const now = Date.now();
      if (now - lastLevelAtRef.current > 80) {
        lastLevelAtRef.current = now;
        setLevel(rms);
      }
      if (forRecording && recordingLiveRef.current && !pausedRef.current) {
        if (rms >= SOUND_FLOOR) lastSoundRef.current = Date.now();
        else if (Date.now() - lastSoundRef.current >= SILENCE_MS) {
          recordingLiveRef.current = false;
          stopRecordingRef.current();
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  }

  function stopLevel() {
    cancelAnimationFrame(rafRef.current);
    setLevel(0);
  }

  function playResponse(audioBase64) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        setSpeaking(false);
        stopLevel();
        resolve();
      };
      if (!audioBase64) {
        finish();
        return;
      }
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      const bytes = Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
      audioUrlRef.current = url;
      const audio = audioRef.current;
      if (!audio) {
        finish();
        return;
      }
      audio.src = url;
      audio.onended = finish;
      audio.onerror = finish;
      skipSpeakRef.current = () => {
        audio.pause();
        audio.currentTime = 0;
        finish();
      };
      audio.onplay = () => {
        setSpeaking(true);
        try {
          const context = new AudioContext();
          if (!audio._bodhGraph) {
            audio._bodhGraph = context.createMediaElementSource(audio);
            watchLevel(audio._bodhGraph, context);
          }
        } catch {
          stopLevel();
        }
      };
      audio.play().catch(finish);
    });
  }

  function commitVoiceTurn(question, reply, payload) {
    if (!question) return;
    setMessages((prev) => [
      ...prev,
      { role: "user", content: question },
      { role: "assistant", content: reply || "" },
    ]);
    setSuggestions(pickSuggestions(question, payload || { suggestions: [] }));
    setVoiceTurn(null);
    voiceTurnRef.current = null;
    setSpeaking(false);
  }

  async function runVoiceTurn(transcript, languageCode) {
    const question = (transcript || "").trim();
    if (!question || loadingRef.current) return;
    const history = messages
      .filter((message) => !message.pending && message.content)
      .map((message) => ({ role: message.role, content: message.content }));
    const turn = { question, draft: "", phase: "thinking", languageCode };
    voiceTurnRef.current = turn;
    setVoiceTurn(turn);
    loadingRef.current = true;
    setLoading(true);
    const controller = new AbortController();
    abortRef.current = controller;
    let reply = "";
    let payload = { suggestions: [] };
    try {
      payload = await sendChatStream({
        message: question,
        conversationId,
        history,
        spoken: true,
        signal: controller.signal,
        onDelta(visible) {
          reply = visible;
          setVoiceTurn((prev) => (prev ? { ...prev, draft: visible } : prev));
        },
      });
      reply = payload.response || reply;
      setVoiceTurn((prev) => (prev ? { ...prev, draft: reply, phase: "speaking" } : prev));
      try {
        const spoken = await sendSpeak({ text: reply, languageCode });
        await playResponse(spoken.audio_base64);
      } catch {
        /* still land in chat if TTS fails */
      }
      commitVoiceTurn(question, reply, payload);
    } catch (err) {
      if (err.name === "AbortError") {
        commitVoiceTurn(question, reply, payload);
      } else {
        setError(err.message || "Voice request failed.");
        setVoiceTurn(null);
        voiceTurnRef.current = null;
      }
    } finally {
      loadingRef.current = false;
      setLoading(false);
      abortRef.current = null;
    }
  }

  function stopAsk() {
    abortRef.current?.abort();
    skipSpeakRef.current();
  }

  async function ask(text) {
    const question = (text || "").trim();
    if (!question || recordingLiveRef.current || loadingRef.current) return;
    setError("");
    setSuggestions([]);
    setScreen("home");
    const history = messages
      .filter((message) => !message.pending && message.content)
      .map((message) => ({ role: message.role, content: message.content }));
    setMessages((prev) => [
      ...prev,
      { role: "user", content: question },
      { role: "assistant", content: "", pending: true },
    ]);
    loadingRef.current = true;
    setLoading(true);
    setCaptions("");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const data = await sendChatStream({
        message: question,
        conversationId,
        history,
        signal: controller.signal,
        onDelta(visible) {
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === "assistant") {
              next[next.length - 1] = { ...last, content: visible, pending: true };
            }
            return next;
          });
        },
      });
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === "assistant") {
          next[next.length - 1] = { role: "assistant", content: data.response, pending: false };
        }
        return next;
      });
      setSuggestions(pickSuggestions(question, data));
    } catch (err) {
      if (err.name === "AbortError") {
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === "assistant" && last.pending && !last.content) return next.slice(0, -2);
          if (last?.role === "assistant") next[next.length - 1] = { ...last, pending: false };
          return next;
        });
      } else {
        setError(err.message || "Something went wrong.");
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && last.pending && !last.content) return prev.slice(0, -1);
          return prev.map((message, index) =>
            index === prev.length - 1 && message.pending ? { ...message, pending: false } : message
          );
        });
      }
    } finally {
      loadingRef.current = false;
      setLoading(false);
      abortRef.current = null;
    }
  }

  async function startRecording() {
    setError("");
    setPermission("connecting");
    setScreen("home");
    if (!navigator.mediaDevices?.getUserMedia) {
      setPermission("error");
      setError("This browser does not support the microphone.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setPermission("ready");
      streamRef.current = stream;
      chunksRef.current = [];
      const mimeType = pickRecorderMime();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.start();
      lastSoundRef.current = Date.now();
      pausedRef.current = false;
      recordingLiveRef.current = true;
      setPaused(false);
      setRecording(true);
      const context = new AudioContext();
      watchLevel(context.createMediaStreamSource(stream), context, { forRecording: true });
    } catch (err) {
      setPermission(err.name === "NotAllowedError" ? "denied" : "error");
      setError(err.name === "NotAllowedError" ? "Microphone access was denied." : "Could not access the microphone.");
    }
  }

  async function stopRecording() {
    const recorder = recorderRef.current;
    recordingLiveRef.current = false;
    pausedRef.current = false;
    setPaused(false);
    if (!recorder || recorder.state === "inactive") {
      setRecording(false);
      stopLevel();
      return;
    }
    setVoiceTurn({ question: "", draft: "", phase: "hearing" });
    setSuggestions([]);
    setRecording(false);
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
    stopLevel();
    if (!blob.size) {
      setVoiceTurn(null);
      setError("No audio was captured. Try again.");
      return;
    }
    try {
      const data = await sendTranscription({
        audioBlob: blob,
        filename: blob.type.includes("mp4") ? "audio.m4a" : "audio.webm",
        conversationId,
      });
      const transcript = (data.transcript || "").trim();
      setCaptions(transcript);
      setVoiceTurn({
        question: transcript,
        draft: "",
        phase: "thinking",
        languageCode: data.language_code,
      });
      await runVoiceTurn(transcript, data.language_code);
    } catch (err) {
      setError(err.message || "Voice request failed.");
      setVoiceTurn(null);
    }
  }

  function cancelRecording() {
    recordingLiveRef.current = false;
    pausedRef.current = false;
    setPaused(false);
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        /* already stopped */
      }
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
    setRecording(false);
    stopLevel();
  }

  function toggleVoicePause() {
    const recorder = recorderRef.current;
    if (!recording || !recorder) return;
    if (recorder.state === "recording") {
      recorder.pause();
      pausedRef.current = true;
      setPaused(true);
    } else if (recorder.state === "paused") {
      recorder.resume();
      lastSoundRef.current = Date.now();
      pausedRef.current = false;
      setPaused(false);
    }
  }

  function endVoice() {
    if (recording) cancelRecording();
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setSpeaking(false);
    setPaused(false);
    setRecording(false);
    stopLevel();
  }

  const recents = useMemo(() => {
    const asked = messages
      .filter((message) => message.role === "user")
      .map((message) => message.content)
      .slice(-8)
      .reverse();
    return asked.length ? { "This session": asked } : {};
  }, [messages]);

  function submitComposer(event) {
    event.preventDefault();
    const value = input;
    setInput("");
    ask(value);
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
        <button className="send" type="submit" disabled={!input.trim()}>Send</button>
      )}
    </form>
  );

  stopRecordingRef.current = stopRecording;

  return (
    <div className={`layout${collapsed ? " is-collapsed" : ""}`}>
      <Sidebar
        screen={screen}
        onNavigate={setScreen}
        collapsed={collapsed}
        onToggle={() => {
          if (window.innerWidth < 768) setMobileOpen((open) => !open);
          else setCollapsed((value) => !value);
        }}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        recents={recents}
        onOpenChat={() => setScreen("home")}
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
            onSkip={() => skipSpeakRef.current()}
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
            <ChatThread messages={messages} loading={loading} />
            {error ? <p className="err chat-err" role="alert">{error}</p> : null}
            {!loading ? <SuggestionChips items={suggestions} onPick={ask} /> : null}
            <div className="chat-dock">{composer}</div>
          </div>
        ) : null}

        {screen === "history" ? (
          <section className="panel">
            <h2>History</h2>
            {messages.length === 0 ? (
              <p className="micro">This session has no conversations yet.</p>
            ) : (
              <ChatThread messages={messages} loading={false} />
            )}
          </section>
        ) : null}

        {screen === "settings" ? (
          <section className="panel">
            <h2>Settings</h2>
            <p className="micro">Theme follows your last choice. First visit follows the system.</p>
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
          </section>
        ) : null}

        <audio ref={audioRef} className="sr-only" />
      </div>
    </div>
  );
}
