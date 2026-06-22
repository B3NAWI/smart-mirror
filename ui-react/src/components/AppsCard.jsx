const quickShortcuts = [
  { icon: "MU", name: "Music", hint: "Quick listening", tone: "cyan" },
  { icon: "FX", name: "Focus", hint: "Deep work mode", tone: "emerald" },
  { icon: "ST", name: "Settings", hint: "Mirror controls", tone: "slate" },
];

function buildMediaShortcut({ icon, name, tone, enabled, source, isPlaying }) {
  const isCurrentSource = source === name.toLowerCase();
  return {
    icon,
    name,
    tone,
    state: !enabled ? "Off" : isCurrentSource && isPlaying ? "Live" : "Ready",
    hint: !enabled
      ? `Turn ${name} back on from the mobile mirror settings.`
      : isCurrentSource
      ? `${name} is currently available on the mirror.`
      : `Send ${name} content to the mirror from the phone app.`,
  };
}

export default function AppsCard({ mediaVisibility, nowPlaying }) {
  const spotifyEnabled = mediaVisibility?.spotifyEnabled ?? true;
  const youtubeEnabled = mediaVisibility?.youtubeEnabled ?? true;
  const source = String(nowPlaying?.source || "").toLowerCase();
  const isPlaying = Boolean(nowPlaying?.isPlaying && nowPlaying?.title);

  const featuredShortcuts = [
    buildMediaShortcut({
      icon: "SP",
      name: "Spotify",
      tone: "emerald",
      enabled: spotifyEnabled,
      source,
      isPlaying,
    }),
    buildMediaShortcut({
      icon: "YT",
      name: "YouTube",
      tone: "red",
      enabled: youtubeEnabled,
      source,
      isPlaying,
    }),
  ];

  return (
    <div className="card apps-card">
      <div className="card-title-row">
        <div className="card-title">Apps &amp; Shortcuts</div>
        <div className="chip">
          {spotifyEnabled || youtubeEnabled ? "Linked" : "Off"}
        </div>
      </div>

      <div className="apps-stage">
        <div className="apps-banner">
          <div className="apps-banner-title">Mirror-ready actions</div>
          <div className="apps-banner-copy">
            Keep the phone app and mirror modules aligned so media shortcuts actually reflect what is enabled.
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
