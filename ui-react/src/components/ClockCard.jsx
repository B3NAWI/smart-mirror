export default function ClockCard({ clock, dateText }) {
  return (
    <div className="clock-card">
      <div className="clock-main">
        <div className="clock" id="clock">{clock}</div>
        <div className="date" id="date">{dateText}</div>
      </div>
    </div>
  );
}
