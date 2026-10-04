const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

function errorFromPayload(payload, status) {
  const detail = payload?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => item.msg || JSON.stringify(item)).join(" ");
  }
  return `Request failed (${status})`;
}

async function parseJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function sendChatStream({
  message,
  conversationId,
  history = [],
  spoken = false,
  onDelta,
  signal,
}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        conversation_id: conversationId,
        history,
        spoken,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const payload = await parseJson(response);
      throw new Error(errorFromPayload(payload, response.status));
    }
    if (!response.body) {
      throw new Error("Streaming is not available in this browser.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let visible = "";
    let donePayload = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() || "";
      for (const chunk of chunks) {
        const line = chunk
          .split("\n")
          .find((entry) => entry.startsWith("data: "));
        if (!line) continue;
        let data;
        try {
          data = JSON.parse(line.slice(6));
        } catch {
          continue;
        }
        if (data.error) {
          throw new Error(data.error);
        }
        if (data.delta) {
          visible += data.delta;
          onDelta?.(visible);
        }
        if (data.done) {
          donePayload = data;
        }
      }
    }

    const responseText = (donePayload?.response || visible || "").trim();
    if (!responseText) {
      throw new Error("The server returned an empty response.");
    }
    return {
      response: responseText,
      suggestions: donePayload?.suggestions || [],
      conversation_id: donePayload?.conversation_id || conversationId,
    };
  } catch (error) {
    if (error.name === "AbortError") {
      const abortError = new Error("stopped");
      abortError.name = "AbortError";
      throw abortError;
    }
    if (error instanceof TypeError) {
      throw new Error(
        "Could not reach the Bodh backend. Is it running at the configured API URL?"
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function sendSpeak({ text, languageCode }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);
  try {
    const response = await fetch(`${API_BASE_URL}/api/speak`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        language_code: languageCode || null,
      }),
      signal: controller.signal,
    });
    const payload = await parseJson(response);
    if (!response.ok) {
      throw new Error(errorFromPayload(payload, response.status));
    }
    if (!payload?.audio_base64) {
      throw new Error("No spoken audio was returned.");
    }
    return payload;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("The voice reply timed out.");
    }
    if (error instanceof TypeError) {
      throw new Error(
        "Could not reach the Bodh backend. Is it running at the configured API URL?"
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function sendTranscription({ audioBlob, filename, conversationId }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);
  const form = new FormData();
  form.append("conversation_id", conversationId);
  form.append("file", audioBlob, filename || "audio.webm");

  try {
    const response = await fetch(`${API_BASE_URL}/api/transcribe`, {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
    const payload = await parseJson(response);
    if (!response.ok) {
      throw new Error(errorFromPayload(payload, response.status));
    }
    if (!payload?.transcript) {
      throw new Error("Could not hear a question. Try again.");
    }
    return payload;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("The voice request timed out. Try again.");
    }
    if (error instanceof TypeError) {
      throw new Error(
        "Could not reach the Bodh backend. Is it running at the configured API URL?"
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function sendVoiceMessage({ audioBlob, filename, conversationId }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);
  const form = new FormData();
  form.append("conversation_id", conversationId);
  form.append("file", audioBlob, filename || "audio.webm");

  try {
    const response = await fetch(`${API_BASE_URL}/api/voice`, {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
    const payload = await parseJson(response);
    if (!response.ok) {
      throw new Error(errorFromPayload(payload, response.status));
    }
    if (!payload?.response || !payload?.audio_base64) {
      throw new Error("The server returned an incomplete voice response.");
    }
    return payload;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("The voice request timed out. Try again.");
    }
    if (error instanceof TypeError) {
      throw new Error(
        "Could not reach the Bodh backend. Is it running at the configured API URL?"
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
