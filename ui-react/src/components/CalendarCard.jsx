export default function CalendarCard({ calendar }) {
  return (
    <div className="card">
      <div className="card-title-row">
        <div className="card-title">Calendar</div>
        <div className="chip">This month</div>
      </div>

      <div className="calendar-body">
        <div className="calendar-header-row">
          <div className="calendar-month" id="calendar-month">{calendar.title}</div>
        </div>

        <div className="calendar-grid" id="calendar-grid">
          {calendar.cells.map((c, idx) => {
            if (c.type === "header") return <div key={idx} className="cal-cell cal-header">{c.label}</div>;
            if (c.type === "empty") return <div key={idx} className="cal-cell"></div>;
            return (
              <div key={idx} className={`cal-cell cal-day ${c.isToday ? "cal-today" : ""}`}>
                {c.day}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
