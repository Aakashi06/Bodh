import { useState } from "react";
import Chat from "./Chat.jsx";
import Dashboard from "./Dashboard.jsx";
import Onboarding from "./Onboarding.jsx";
import { loadLearner, loadTheme, saveTheme } from "./learner.js";

export default function App() {
  const [learner, setLearner] = useState(() => loadLearner());
  const [screen, setScreen] = useState(learner ? "dashboard" : "onboarding");
  const [theme, setTheme] = useState(() => saveTheme(loadTheme()));

  function toggleTheme() {
    setTheme(saveTheme(theme === "dark" ? "light" : "dark"));
  }

  let view;
  if (!learner || screen === "onboarding") {
    view = (
      <Onboarding
        onComplete={(profile) => {
          setLearner(profile);
          setScreen("dashboard");
        }}
      />
    );
  } else if (screen === "chat") {
    view = <Chat learner={learner} onBack={() => setScreen("dashboard")} />;
  } else {
    view = <Dashboard learner={learner} onOpenChat={() => setScreen("chat")} />;
  }

  return (
    <>
      <button type="button" className="theme-toggle" onClick={toggleTheme}>
        {theme === "dark" ? "Light" : "Dark"}
      </button>
      {view}
    </>
  );
}
