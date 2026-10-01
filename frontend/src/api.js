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

export async function sendChatMessage({ message, conversationId }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);

  try {
    const response = await fetch(`${API_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        conversation_id: conversationId,
      }),
      signal: controller.signal,
    });

    const payload = await parseJson(response);
    if (!response.ok) {
      throw new Error(errorFromPayload(payload, response.status));
    }
    if (!payload?.response) {
      throw new Error("The server returned an empty response.");
    }
    return payload;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("The request timed out. Try again.");
    }
    if (error instanceof TypeError) {
      throw new Error(
        "Could not reach the NIB backend. Is it running at the configured API URL?"
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
        "Could not reach the NIB backend. Is it running at the configured API URL?"
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
