import ModuleDisabledState from "./ModuleDisabledState";

function formatPublishedLabel(value) {
  if (!value) {
    return "";
  }

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return "";
  }

  return new Date(parsed).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function NewsCard({ headlines = [], disabled = false }) {
  const items = Array.isArray(headlines) ? headlines.slice(0, 5) : [];

  return (
    <div className={`card news-card ${disabled ? "card--disabled" : ""}`}>
      <div className="card-title-row">
        <div className="card-title">News</div>
        <div className="chip">{disabled ? "Off" : `${items.length} headlines`}</div>
      </div>

      {disabled ? (
        <ModuleDisabledState
          title="News hidden"
          description="News updates are turned off for the mirror."
        />
      ) : items.length === 0 ? (
        <div className="news-empty">News is loading or temporarily unavailable.</div>
      ) : (
        <div className="news-list">
          {items.map((item) => (
            <div key={item.id || item.link || item.title} className="news-item">
              <div className="news-item-title">{item.title}</div>
              <div className="news-item-meta">
                <span>{item.source || "News"}</span>
                {item.published_at ? <span>{formatPublishedLabel(item.published_at)}</span> : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
