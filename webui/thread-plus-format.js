export function timestamp(value) {
  const time = typeof value === "number" ? value : Date.parse(value || "");
  return Number.isFinite(time) && time > 0 ? time : 0;
}

export function relativeTime(value, now = Date.now()) {
  const time = timestamp(value);
  if (!time) return "";
  const minutes = Math.max(0, Math.floor((now - time) / 60_000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return shortDate(time, now);
}

export function shortDate(value, now = Date.now()) {
  const time = timestamp(value);
  if (!time) return "";
  return new Date(time).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(new Date(time).getFullYear() === new Date(now).getFullYear() ? {} : { year: "numeric" }),
  });
}

export function hasNewActivity(context, seenAt, selectedId) {
  return Boolean(context?.id && context.id !== selectedId && seenAt > 0 && timestamp(context.last_message) > seenAt);
}
