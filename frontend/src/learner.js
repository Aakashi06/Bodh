const STORAGE_KEY = "nib.learner";

export const CLASSES = ["5", "6", "7", "8", "9", "10"];
export const BOARDS = ["CBSE", "ICSE", "State Board", "Other"];
export const SUBJECTS = [
  "Maths",
  "Science",
  "English",
  "Social Science",
  "Hindi",
  "Computer",
];
export const LANGUAGES = ["English", "Hindi", "Hinglish"];

export function loadLearner() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveLearner(learner) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(learner));
  return learner;
}

export const THEME_KEY = "nib.theme";
export const XP_PER_LEVEL = 100;

export function loadTheme() {
  return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
}

export function saveTheme(theme) {
  localStorage.setItem(THEME_KEY, theme);
  document.documentElement.dataset.theme = theme;
  return theme;
}

export function levelFromXp(xp) {
  return Math.floor((xp || 0) / XP_PER_LEVEL) + 1;
}

export function xpIntoLevel(xp) {
  return (xp || 0) % XP_PER_LEVEL;
}

export function heatmapDays(activity = [], weeks = 13) {
  const counts = {};
  for (const item of activity) {
    const day =
      typeof item === "string" && /^\d{4}-\d{2}-\d{2}/.test(item)
        ? item.slice(0, 10)
        : item?.date;
    if (day) counts[day] = (counts[day] || 0) + (item.count || 1);
  }
  const days = [];
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const total = weeks * 7;
  for (let i = total - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ date: key, count: counts[key] || 0 });
  }
  return days;
}

export function createLearner({ name, classLevel, board, subjects, language }) {
  const progress = {};
  for (const subject of subjects) {
    progress[subject] = 0;
  }
  return saveLearner({
    id: crypto.randomUUID ? crypto.randomUUID() : `learner-${Date.now()}`,
    name: name.trim(),
    classLevel,
    board,
    subjects,
    language,
    xp: 0,
    streak: 0,
    progress,
    recentActivity: [],
    createdAt: new Date().toISOString(),
  });
}
