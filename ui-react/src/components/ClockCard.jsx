import ModuleDisabledState from "./ModuleDisabledState";

export default function ClockCard({ clock, dateText, disabled = false }) {
  return (
    <div className={`clock-card ${disabled ? "card--disabled" : ""}`}>
      {disabled ? (
        <ModuleDisabledState
          title="Clock hidden"
          description="Date and time are turned off in the mobile mirror settings."
        />
      ) : (
        <div className="clock-main">
          <div className="clock" id="clock">{clock}</div>
          <div className="date" id="date">{dateText}</div>
        </div>
      )}
    </div>
  );
}
