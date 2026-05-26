import ModuleDisabledState from "./ModuleDisabledState";

export default function TodayCard({ todayPlan, disabled = false }) {
  const items = Array.isArray(todayPlan?.items) ? todayPlan.items : [];
  const chipLabel = disabled
    ? "Off on mobile"
    : todayPlan?.isLoading
    ? "Syncing"
    : `${items.length} items`;

  return (
    <div className={`card ${disabled ? "card--disabled" : ""}`}>
      <div className="card-title-row">
        <div className="card-title">Today</div>
        <div className="chip">{chipLabel}</div>
      </div>

      {disabled ? (
        <ModuleDisabledState
          title="Today is hidden"
          description="Reminders and day planning are turned off from the mobile app."
        />
      ) : (
        <>
          <div className="event-list">
            {items.length > 0 ? (
              items.map((item) => (
                <div
                  className={`event ${item.kind === "done" ? "event--done" : ""}`}
                  key={item.id}
                >
                  <div
                    className={`event-time ${item.kind === "done" ? "event-time--done" : ""}`}
                  >
                    {item.time}
                  </div>
                  <div
                    className={`event-title ${item.kind === "done" ? "event-title--done" : ""}`}
                  >
                    {item.title}
                  </div>
                  {item.kind === "done" ? (
                    <div className="event-status">Completed</div>
                  ) : null}
                </div>
              ))
            ) : (
              <div className="event">
                <div className="event-time">Now</div>
                <div className="event-title">
                  {todayPlan?.isLoading
                    ? "Loading today's agenda..."
                    : "No calendar events or tasks synced for today yet."}
                </div>
              </div>
            )}
          </div>

          <div className="event-list">
            <div className="event">
              <div className="event-time">Left</div>
              <div className="event-title">
                {todayPlan?.remainingTodosCount ?? 0} tasks remaining
              </div>
            </div>
            <div className="event">
              <div className="event-time">Done</div>
              <div className="event-title">
                {todayPlan?.completedTodosCount ?? 0} tasks completed
              </div>
            </div>
            <div className="event">
              <div className="event-time">High</div>
              <div className="event-title">
                {todayPlan?.highPriorityCount ?? 0} high-priority tasks
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
