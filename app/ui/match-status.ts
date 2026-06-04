const portugalDateTime = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Lisbon",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export type StoredMatchStatus = "scheduled" | "finished";
export type DisplayMatchStatus = StoredMatchStatus | "live";

function portugalSortableDateTime(value: number) {
  const parts = portugalDateTime.formatToParts(value);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}T${byType.hour}:${byType.minute}:${byType.second}`;
}

export function displayStatusForPortugalTime(
  match: { kickoffAt: number; status: StoredMatchStatus },
  now = Date.now(),
): DisplayMatchStatus {
  if (match.status === "finished") return "finished";

  return portugalSortableDateTime(match.kickoffAt) <= portugalSortableDateTime(now)
    ? "live"
    : "scheduled";
}
