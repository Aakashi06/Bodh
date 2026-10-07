const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

async function request(path, { signal, ...options }, read) {
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) cancel();
  const timer = setTimeout(() => { timedOut = true; cancel(); }, 150000);
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, { ...options, signal: controller.signal });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const detail = payload?.detail;
      throw new Error(typeof detail === "string" ? detail : `Request failed (${response.status}). Please try again.`);
    }
    return await read(response);
  } catch (error) {
    if (timedOut) throw new Error("The request timed out. Please try again.");
    if (error instanceof TypeError) throw new Error("Could not reach the Bodh backend. Check the API URL and connection.");
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}

function postJson(path, body, signal) {
  return request(path, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body), signal,
  }, (response) => response.json());
}

export function sendQuiz({ message, conversationId, history, signal }) {
  return postJson("/api/quiz", { message, conversation_id: conversationId, history }, signal);
}

export function sendChatStream({ message, conversationId, history = [], spoken = false, onDelta, signal }) {
  return request("/api/chat/stream", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, conversation_id: conversationId, history, spoken }), signal,
  }, async (response) => {
    if (!response.body) throw new Error("Streaming is unavailable in this browser.");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let result;
    function consume(event) {
      const dataLine = event.split("\n").find((line) => line.startsWith("data:"));
      if (!dataLine) return;
      const data = JSON.parse(dataLine.slice(5));
      if (data.error) throw new Error(data.error);
      if (typeof data.text === "string") onDelta?.(data.text);
      if (data.done) result = data;
    }
    try {
      while (true) {
        const { done, value } = await reader.read();
        buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";
        events.forEach(consume);
        if (done) break;
      }
      if (buffer.trim()) consume(buffer);
      if (!result?.response?.trim()) throw new Error("The answer was interrupted. Please try again.");
      return result;
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  });
}

export function sendSpeak({ text, languageCode, signal }) {
  return postJson("/api/speak", { text, language_code: languageCode || null }, signal);
}

export function sendTranscription({ audioBlob, filename, conversationId, signal }) {
  if (audioBlob.size > 8 * 1024 * 1024) throw new Error("Recording is too large. Please record a shorter question.");
  const form = new FormData();
  form.append("conversation_id", conversationId);
  form.append("file", audioBlob, filename);
  return request("/api/transcribe", { method: "POST", body: form, signal }, (response) => response.json());
}
