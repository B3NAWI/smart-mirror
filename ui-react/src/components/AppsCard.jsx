const featuredShortcuts = [
  {
    icon: "YT",
    name: "YouTube",
    hint: "Play videos and playlists on the mirror.",
    tone: "red",
    state: "Ready",
  },
  {
    icon: "AI",
    name: "AI Assistant",
    hint: "Ask, search, and trigger smart mirror actions.",
    tone: "violet",
    state: "Voice",
  },
];

const quickShortcuts = [
  { icon: "MU", name: "Music", hint: "Quick listening", tone: "cyan" },
  { icon: "NW", name: "News", hint: "Morning brief", tone: "amber" },
  { icon: "FX", name: "Focus", hint: "Deep work mode", tone: "emerald" },
  { icon: "ST", name: "Settings", hint: "Mirror controls", tone: "slate" },
];

export default function AppsCard() {
  return (
    <div className="card apps-card">
      <div className="card-title-row">
        <div className="card-title">Apps &amp; Shortcuts</div>
        <div className="chip">Ready</div>
      </div>

      <div className="apps-stage">
        <div className="apps-banner">
          <div className="apps-banner-title">Mirror-ready actions</div>
          <div className="apps-banner-copy">
            Keep your most useful tools calm, visible, and one gesture away.
          </div>
        </div>

        <div className="apps-feature-grid">
          {featuredShortcuts.map((item) => (
            <div key={item.name} className={`app-feature app-feature--${item.tone}`}>
              <div className="app-feature-top">
                <div className="app-orb">{item.icon}</div>
                <div className="app-feature-state">{item.state}</div>
              </div>

              <div className="app-feature-name">{item.name}</div>
              <div className="app-feature-hint">{item.hint}</div>
            </div>
          ))}
        </div>

        <div className="apps-quick-grid">
          {quickShortcuts.map((item) => (
            <div key={item.name} className={`app-quick app-quick--${item.tone}`}>
              <div className="app-quick-left">
                <div className="app-quick-orb">{item.icon}</div>
                <div className="app-quick-meta">
                  <div className="app-quick-name">{item.name}</div>
                  <div className="app-quick-hint">{item.hint}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
