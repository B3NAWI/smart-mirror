export default function AppsCard() {
  return (
    <div className="card">
      <div className="card-title-row">
        <div className="card-title">Apps &amp; Shortcuts</div>
        <div className="chip">Future actions</div>
      </div>

      <div className="apps-row">
        <div className="app-pill"><span>▶</span> YouTube</div>
        <div className="app-pill"><span>🎵</span> Music</div>
        <div className="app-pill"><span>📰</span> News</div>
        <div className="app-pill"><span>🧠</span> AI Assistant</div>
        <div className="app-pill"><span>⚙️</span> Settings</div>
      </div>
    </div>
  );
}
