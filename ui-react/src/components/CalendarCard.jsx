export default function CalendarCard({ calendar }) {
  const today = new Date();
  const todayDay = today.getDate();
  const todayWeekday = today.toLocaleDateString("en-US", {
    weekday: "short",
  });
  const monthCount = calendar.cells.filter((cell) => cell.type === "day").length;

  return (
    <div className="card calendar-card">
      <div className="card-title-row">
        <div className="card-title">Calendar</div>
        <div className="chip">Monthly glow</div>
      </div>

      <div className="calendar-body">
        <div className="calendar-hero">
          <div className="calendar-hero-copy">
            <div className="calendar-month" id="calendar-month">{calendar.title}</div>
            <div className="calendar-subtitle">
              A calmer view of the month ahead.
            </div>
          </div>

          <div className="calendar-today-badge">
            <div className="calendar-today-label">Today</div>
            <div className="calendar-today-number">{todayDay}</div>
            <div className="calendar-today-meta">
              {todayWeekday} · {monthCount} days
            </div>
          </div>
        </div>

        <div className="calendar-frame">
          <div className="calendar-grid" id="calendar-grid">
            {calendar.cells.map((c, idx) => {
              if (c.type === "header") {
                return (
                  <div key={idx} className="cal-cell cal-header">
                    {c.label}
                  </div>
                );
              }

              if (c.type === "empty") {
                return <div key={idx} className="cal-cell cal-empty" />;
              }

              return (
                <div
                  key={idx}
                  className={`cal-cell cal-day ${c.isToday ? "cal-today" : ""}`}
                >
                  <span className="cal-day-number">{c.day}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
