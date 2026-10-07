import { useEffect, useState } from "react";

export function newConversation() {
  return { id: crypto.randomUUID(), title: "New conversation", messages: [], suggestions: [] };
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem("bodh.conversations"));
    if (Array.isArray(saved?.items) && saved.items.length && saved.items.every((item) =>
      typeof item.id === "string" && typeof item.title === "string" && Array.isArray(item.messages) && Array.isArray(item.suggestions) && item.messages.every((message) =>
        ["user", "assistant"].includes(message.role) && typeof message.content === "string" &&
        (!message.quiz || (Array.isArray(message.quiz.questions) && message.quiz.questions.every((question) =>
          typeof question.question === "string" && Array.isArray(question.options) && question.options.length === 4 && Number.isInteger(question.correct_index))))))) {
      return { items: saved.items.map((item) => ({ ...item,
        messages: item.messages.filter((message) => !message.pending || message.content).map((message) => ({ ...message, pending: false })),
      })), activeId: saved.items.some((item) => item.id === saved.activeId) ? saved.activeId : saved.items[0].id };
    }
  } catch { /* A blocked or invalid storage entry should not prevent startup. */ }
  const first = newConversation();
  return { items: [first], activeId: first.id };
}

export default function useConversations() {
  const [store, setStore] = useState(load);
  const [storageError, setStorageError] = useState("");
  const active = store.items.find((item) => item.id === store.activeId);
  useEffect(() => {
    try {
      localStorage.setItem("bodh.conversations", JSON.stringify(store));
      setStorageError("");
    } catch { setStorageError("History could not be saved on this device. Export or clear old conversations before refreshing."); }
  }, [store]);
  function update(id, changes) {
    setStore((prev) => ({ ...prev, items: prev.items.map((item) => item.id === id ? { ...item, ...changes(item) } : item) }));
  }
  return { active, items: store.items, storageError, update,
    open: (id) => setStore((prev) => ({ ...prev, activeId: id })),
    create: () => { const item = newConversation(); setStore((prev) => ({ items: [item, ...prev.items], activeId: item.id })); },
    clear: () => { const item = newConversation(); setStore({ items: [item], activeId: item.id }); },
  };
}
