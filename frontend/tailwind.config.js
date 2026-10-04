/** Token map for Tailwind if added later. App uses CSS variables in tokens.css. */
export default {
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-hover": "var(--surface-hover)",
        sidebar: "var(--sidebar)",
        border: "var(--border)",
        text: "var(--text)",
        muted: "var(--text-muted)",
        accent: "var(--accent)",
        warm: "var(--accent-warm)",
        error: "var(--error)",
        success: "var(--success)",
      },
      fontFamily: {
        display: ["Newsreader", "serif"],
        ui: ["Inter", "sans-serif"],
      },
      borderRadius: {
        card: "12px",
        pill: "999px",
        nav: "10px",
      },
    },
  },
};
