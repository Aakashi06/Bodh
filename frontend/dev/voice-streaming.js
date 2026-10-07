import { createVoiceReply } from "../src/voiceReply.js";

const response = "Photosynthesis is the process by which plants make food. Plants use sunlight, water, and carbon dioxide. Chlorophyll helps capture sunlight. Oxygen is released during this process.";
const expectedSentences = response.match(/[^.!?]+[.!?]/g).map((sentence) => sentence.trim());
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const button = document.querySelector("#run");

// Fail closed if this test ever accidentally attempts a real request.
let networkAttempts = 0;
window.fetch = async () => {
  networkAttempts += 1;
  throw new Error("Network calls are blocked in the local streaming test.");
};

button.addEventListener("click", async () => {
  button.disabled = true;
  document.querySelector("#log").textContent = "";
  document.querySelector("#generated").textContent = "";
  document.querySelector("#spoken").textContent = "";
  networkAttempts = 0;
  const startedAt = performance.now();
  const elapsed = () => (performance.now() - startedAt) / 1000;
  function log(message) {
    const entry = `[${elapsed().toFixed(2)}s] ${message}`;
    console.log(entry);
    document.querySelector("#log").textContent += `${entry}\n`;
  }
  const played = [];
  let firstSpeechAt;
  let generationFinishedAt;
  let playbackActive = false;
  let generationDuringPlayback = false;
  let speechError;
  let sentenceNumber = 0;
  const reply = createVoiceReply({
    signal: new AbortController().signal,
    // Invoked by the real splitter when it discovers a complete segment.
    async synthesize({ text }) {
      const number = ++sentenceNumber;
      log(`Sentence ${number} complete: ${text}`);
      log(`Sentence ${number} queued for local speech`);
      await delay(40); // Fake synthesis, without making a request.
      return { audio_base64: { number, text } };
    },
    async play(segment, onStart) {
      if (firstSpeechAt === undefined) firstSpeechAt = elapsed();
      playbackActive = true;
      played.push(segment.text);
      log(`Sentence ${segment.number} speech started (mock playback)`);
      onStart();
      await delay(1800); // Represents the time spent speaking this sentence.
      playbackActive = false;
      log(`Sentence ${segment.number} speech finished`);
    },
    onStart(text) { document.querySelector("#spoken").textContent = text; },
    onError(error) { speechError = error; log(`ERROR: ${error.message}`); },
  });
  try {
    log("Generation started");
    let generated = "";
    // Send cumulative snapshots exactly as sendChatStream does in the app.
    for (let offset = 0; offset < response.length; offset += 8) {
      await delay(100);
      generated += response.slice(offset, offset + 8);
      document.querySelector("#generated").textContent = generated;
      log(`Generation chunk: ${JSON.stringify(response.slice(offset, offset + 8))}`);
      if (playbackActive) generationDuringPlayback = true;
      reply.push(generated);
    }
    generationFinishedAt = elapsed();
    log("Generation finished");
    await reply.finish(generated);
    log("All speech finished");
    const checks = [
      ["Sentence 1 started BEFORE generation finished", firstSpeechAt !== undefined && firstSpeechAt < generationFinishedAt],
      ["Generation continued during playback", generationDuringPlayback],
      ["All four sentences played once, in order", JSON.stringify(played) === JSON.stringify(expectedSentences)],
      ["No speech pipeline errors", !speechError],
      ["External API calls: 0; blocked network attempts: 0", networkAttempts === 0],
    ];
    checks.forEach(([label, passed]) => log(`${passed ? "PASS" : "FAIL"}: ${label}`));
  } catch (error) {
    reply.cancel();
    log(`FAIL: ${error.message}`);
  } finally {
    button.disabled = false;
  }
});
