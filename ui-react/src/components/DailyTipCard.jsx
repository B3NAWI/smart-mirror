export default function DailyTipCard({ tip }) {
  return (
    <div className="card tip-card">
      <div className="card-title-row">
        <div className="card-title">Daily Tip</div>
        <div className="chip">Quiet focus</div>
      </div>

      <div className="tip-shell">
        <div className="tip-orb" aria-hidden="true">
          <div className="tip-orb-core">✦</div>
        </div>

        <div className="tip-copy">
          <div className="quote-mark" aria-hidden="true">“</div>
          <div className="quote-text" id="daily-tip">{tip.text}</div>

          <div className="quote-footer">
            <div className="quote-line" aria-hidden="true"></div>
            <div className="quote-author" id="tip-source">{tip.source}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
