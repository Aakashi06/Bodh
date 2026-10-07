export function followUpsFor(question) {
  const raw = (question || "").replace(/\s+/g, " ").trim();
  if (raw.length < 8) return [];

  const topic = raw
    .replace(
      /^(what is|what's|whats|explain|define|tell me about|how does|how do|why is|why do|why does)\s+/i,
      ""
    )
    .replace(/[?!.,]+$/g, "")
    .trim();
  const label = topic.length >= 4 && topic.length <= 56 ? topic : "this";
  const askedForQuestions = /question|quiz|test me|practice/i.test(raw);

  if (askedForQuestions) {
    return [
      "Generate a quiz for me",
      "Make the questions a bit harder",
      "Explain the answers simply",
    ];
  }

  return [
    `Explain ${label} more simply`,
    `Give a real-life example of ${label}`,
    "Generate a quiz for me",
  ];
}
