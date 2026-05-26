export default function ModuleDisabledState({
  title = "Module hidden",
  description = "This section is turned off in the mobile mirror settings.",
  compact = false,
}) {
  return (
    <div className={`module-disabled ${compact ? "module-disabled--compact" : ""}`}>
      <div className="module-disabled-badge">Off on mobile</div>
      <div className="module-disabled-title">{title}</div>
      <div className="module-disabled-copy">{description}</div>
    </div>
  );
}
