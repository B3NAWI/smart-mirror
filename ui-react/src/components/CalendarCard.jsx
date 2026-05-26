import ModuleDisabledState from "./ModuleDisabledState";

export default function CalendarCard({ calendar, onSelectDate, disabled = false }) {
  const today = new Date();
  const todayDay = today.getDate();
  const todayWeekday = today.toLocaleDateString("en-US", {
    weekday: "short",
  });
  const monthCount = calendar.cells.filter((cell) => cell.type === "day").length;
  const selectedItems = Array.isArray(calendar.selectedItems) ? calendar.selectedItems : [];

  return (
    <div className={`card calendar-card ${disabled ? "card--disabled" : ""}`}>
      <div className="card-title-row">
        <div className="card-title">Calendar</div>
        <div className="chip">{disabled ? "Off on mobile" : "Monthly glow"}</div>
      </div>

      {disabled ? (
        <ModuleDisabledState
          title="Calendar hidden"
          description="Calendar blocks are turned off in the mobile mirror settings."
        />
      ) : (
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
                {todayWeekday} - {monthCount} days
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
                  <button
                    type="button"
                    key={idx}
                    onClick={() => c.hasItems && onSelectDate?.(c.isoDate)}
                    className={[
                      "cal-cell",
                      "cal-day",
                      c.isToday ? "cal-today" : "",
                      c.hasItems ? "cal-day--has-items" : "",
                      c.isSelected ? "cal-day--selected" : "",
                      c.hasPending ? "cal-day--pending" : "",
                      c.hasCompleted && !c.hasPending ? "cal-day--completed" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    disabled={!c.hasItems}
                    aria-label={
                      c.hasItems
                        ? `${c.day}, ${c.itemCount} planned item${c.itemCount === 1 ? "" : "s"}`
                        : `${c.day}`
                    }
                  >
                    <span className="cal-day-number">{c.day}</span>
                    {c.hasItems ? (
                    <span className="cal-day-marker" aria-hidden="true">
                        {c.hasPending ? "+" : "o"}
                    </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="calendar-agenda-panel">
            {calendar.selectedDate && selectedItems.length > 0 ? (
              <>
                <div className="calendar-agenda-header">
                  <div className="calendar-agenda-title">{calendar.selectedLabel}</div>
                  <div className="calendar-agenda-chip">
                    {selectedItems.length} item{selectedItems.length === 1 ? "" : "s"}
                  </div>
                </div>
                <div className="calendar-agenda-list">
                  {selectedItems.map((item) => (
                    <div
                      key={item.id}
                      className={`calendar-agenda-item ${item.completed ? "calendar-agenda-item--done" : ""}`}
                    >
                      <div className="calendar-agenda-time">{item.time}</div>
                      <div className="calendar-agenda-copy">
                        <div className="calendar-agenda-item-title">{item.title}</div>
                        {item.detail ? (
                          <div className="calendar-agenda-item-detail">{item.detail}</div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="calendar-agenda-empty">
                Tap a marked date to preview the plans and tasks saved for that day.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
