import { sendSpeak } from "./api.js";

// Prepare the next sentence while the current one plays. Text becomes visible
// when its audio starts, so the response no longer runs ahead of the voice.
export function createVoiceReply({ languageCode, signal, play, onStart, onError, synthesize = sendSpeak }) {
  let queuedText = "";
  let visibleText = "";
  let synthesis = Promise.resolve();
  let playback = Promise.resolve();
  let stopped = false;
  let failed = false;

  function enqueue(segment) {
    const ready = synthesis.then(async () => {
      if (stopped || failed || signal.aborted) return null;
      try {
        return await synthesize({ text: segment.trim(), languageCode, signal });
      } catch (error) {
        return { error };
      }
    });
    // Only one synthesis request at a time; playback has its own ordered queue.
    synthesis = ready.then(() => {});
    playback = playback.then(async () => {
      const audio = await ready;
      if (!audio || stopped || failed || signal.aborted) return;
      try {
        if (audio.error) throw audio.error;
        await play(audio.audio_base64, () => {
          if (stopped || signal.aborted) return;
          visibleText += segment;
          onStart(visibleText.trim());
        });
      } catch (error) {
        if (!stopped && !signal.aborted) { failed = true; onError(error); }
      }
    });
  }

  function push(text, final = false) {
    if (stopped || signal.aborted) return;
    // Provider snapshots can revise their suffix. Never repeat spoken text.
    if (!text.startsWith(queuedText)) return;
    let remaining = text.slice(queuedText.length);
    while (remaining) {
      const sentence = remaining.match(/^.*?[.!?।](?=\s|$)/s);
      let length = sentence?.[0].length;
      if (!length && remaining.length >= 350) {
        length = remaining.lastIndexOf(" ", 350);
        if (length < 1) length = 350;
      }
      if (!length && final) length = Math.min(remaining.length, 2200);
      if (!length) break;
      length = Math.min(length, 2200);
      const segment = remaining.slice(0, length);
      queuedText += segment;
      remaining = remaining.slice(length);
      if (segment.trim()) enqueue(segment);
    }
  }

  return {
    push,
    finish: async (text) => { push(text, true); await playback; },
    cancel: () => { stopped = true; },
  };
}
