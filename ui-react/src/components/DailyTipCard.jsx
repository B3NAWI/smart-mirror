export default function DailyTipCard({ tip }) {
  return (
    <div className="card">
      <div className="card-title-row">
        <div className="card-title">Daily Tip</div>
        <div className="chip">Auto-updated</div>
      </div>

      <div className="quote-text" id="daily-tip">"{tip.text}"</div>
      <div className="quote-author" id="tip-source">— {tip.source}</div>
    </div>
  );
}
