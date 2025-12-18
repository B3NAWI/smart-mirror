export default function TodayCard({ message }) {
  return (
    <div className="card">
      <div className="card-title-row">
        <div className="card-title">Today</div>
        <div className="chip">Overview</div>
      </div>

      <div className="time-message" id="time-of-day-message">{message}</div>

      <div className="event-list">
        <div className="event">
          <div className="event-time">09:00</div>
          <div className="event-title">Morning Focus</div>
        </div>
        <div className="event">
          <div className="event-time">13:00</div>
          <div className="event-title">Deep Work / Study</div>
        </div>
        <div className="event">
          <div className="event-time">19:00</div>
          <div className="event-title">Relax &amp; Recharge</div>
        </div>
      </div>
    </div>
  );
}
