import { Home, History, Settings, PanelLeft, Menu, X } from "lucide-react";

const ICONS = { home: Home, history: History, settings: Settings };

export default function Sidebar({
  screen,
  onNavigate,
  collapsed,
  onToggle,
  mobileOpen,
  onCloseMobile,
  recents,
  onOpenChat,
}) {
  return (
    <>
      <button type="button" className="hamburger" onClick={onToggle} aria-label="Open menu">
        <Menu size={20} strokeWidth={1.5} />
      </button>
      {mobileOpen ? <button type="button" className="scrim" aria-label="Close menu" onClick={onCloseMobile} /> : null}
      <aside className={`sidebar${collapsed ? " is-collapsed" : ""}${mobileOpen ? " is-open" : ""}`}>
        <div className="sidebar-top">
          <button type="button" className="brand" onClick={() => onNavigate("home")}>
            <span className="mark-orbit" aria-hidden="true" />
            {!collapsed ? <span className="wordmark">bodh</span> : null}
          </button>
          <button type="button" className="icon-quiet hide-mobile" onClick={onToggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            {mobileOpen ? <X size={18} strokeWidth={1.5} /> : <PanelLeft size={18} strokeWidth={1.5} />}
          </button>
        </div>

        <nav className="side-nav" aria-label="Primary">
          {["home", "history", "settings"].map((id) => {
            const Icon = ICONS[id];
            const label = id[0].toUpperCase() + id.slice(1);
            return (
              <button
                key={id}
                type="button"
                className="side-item"
                aria-current={screen === id ? "page" : undefined}
                onClick={() => {
                  onNavigate(id);
                  onCloseMobile();
                }}
              >
                <span className="accent-dot" aria-hidden="true" />
                <Icon size={18} strokeWidth={1.5} />
                {!collapsed ? <span>{label}</span> : null}
              </button>
            );
          })}
        </nav>

        {!collapsed ? (
          <div className="recents">
            {Object.keys(recents).length === 0 ? (
              <p className="micro recents-empty">Your questions will land here.</p>
            ) : (
              Object.entries(recents).map(([group, items]) => (
                <div key={group}>
                  <p className="micro">{group}</p>
                  {items.map((title) => (
                    <button key={title} type="button" className="recent-title" onClick={() => { onOpenChat?.(); onCloseMobile(); }}>
                      {title}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        ) : null}

        <div className="sidebar-user">
          {!collapsed ? <p className="micro">Demo</p> : null}
        </div>
      </aside>
    </>
  );
}
