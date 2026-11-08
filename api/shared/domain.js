export const YEELD_ID = "project-yeeld";
export class DomainError extends Error {}
export function assert(ok, message) {
  if (!ok) throw new DomainError(message);
}
export function periodKey(year, month) {
  assert(
    Number.isInteger(year) &&
      year >= 2000 &&
      year <= 2100 &&
      Number.isInteger(month) &&
      month >= 1 &&
      month <= 12,
    "Choose a valid month and year (2000–2100).",
  );
  return `${year}-${String(month).padStart(2, "0")}`;
}
const iso = (date) => date.toISOString().slice(0, 10);
export function weeksForMonth(year, month) {
  periodKey(year, month);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const result = [];
  for (let day = 1; day <= last; ) {
    const start = new Date(Date.UTC(year, month - 1, day));
    const length = Math.min(7 - ((start.getUTCDay() + 6) % 7), last - day + 1);
    result.push({
      id: iso(start),
      start: iso(start),
      end: iso(new Date(Date.UTC(year, month - 1, day + length - 1))),
      days: length,
    });
    day += length;
  }
  return result;
}
export function parseHours(value) {
  if (value === "" || value === null) return null;
  assert(
    typeof value === "number" || typeof value === "string",
    "Hours must be a number or blank.",
  );
  assert(
    typeof value !== "string" || /^\d+(\.\d{1,2})?$/.test(value),
    "Use non-negative hours with up to two decimals.",
  );
  const hours = Number(value);
  assert(
    Number.isFinite(hours) &&
      hours >= 0 &&
      Math.abs(hours * 100 - Math.round(hours * 100)) < 1e-7,
    "Use non-negative hours with up to two decimals.",
  );
  return hours;
}
export const sum = (values) =>
  Math.round(values.reduce((a, b) => a + (b ?? 0), 0) * 100) / 100;
export function availableProjects(staff, projects) {
  return projects.filter(
    (p) => p.active && (p.id === YEELD_ID ? staff.yeeld : staff.thematic),
  );
}
/** Lossless v1 migration: shared thematic notes remain unassigned legacy context. */
export function migrateRecord(record) {
  if (!record) return record;
  assert(
    [1, 2].includes(record.schemaVersion),
    "Unsupported entries schema version.",
  );
  if (record.schemaVersion === 2) return structuredClone(record);
  return {
    ...structuredClone(record),
    schemaVersion: 2,
    entries: record.entries.map((entry) => ({
      ...structuredClone(entry),
      notes: "",
    })),
  };
}
export function newRecord(staff, year, month) {
  return {
    key: `${staff.id}:${periodKey(year, month)}`,
    staffId: staff.id,
    year,
    month,
    status: "Draft",
    revision: 0,
    schemaVersion: 2,
    entries: staff.yeeld
      ? [
          {
            projectId: YEELD_ID,
            notes: "",
            hours: Object.fromEntries(
              weeksForMonth(year, month).map((w) => [w.id, null]),
            ),
          },
        ]
      : [],
    yeeldNotes: "",
    thematicNotes: "",
  };
}
export function validateRecord(record, staff, projects) {
  assert(
    record && record.staffId === staff.id,
    "Staff identity does not match.",
  );
  assert(
    record.key === `${staff.id}:${periodKey(record.year, record.month)}`,
    "Invalid person-period key.",
  );
  assert(record.schemaVersion === 2, "Unsupported entries schema version.");
  assert(
    ["Draft", "Submitted", "Reopened"].includes(record.status),
    "Invalid status.",
  );
  assert(Array.isArray(record.entries), "Entries must be an array.");
  const allowed = new Set(availableProjects(staff, projects).map((p) => p.id));
  const weeks = weeksForMonth(record.year, record.month);
  const seen = new Set();
  const entries = record.entries.map((entry) => {
    assert(
      entry && allowed.has(entry.projectId),
      "Project is inactive or unavailable to this staff member.",
    );
    assert(
      !seen.has(entry.projectId),
      "A project can only appear once per month.",
    );
    seen.add(entry.projectId);
    assert(
      entry.hours &&
        typeof entry.hours === "object" &&
        Object.keys(entry.hours).length === weeks.length &&
        weeks.every((w) => Object.hasOwn(entry.hours, w.id)),
      "Hours must match this month’s clipped weeks.",
    );
    const hours = Object.fromEntries(
      weeks.map((w) => {
        const value = parseHours(entry.hours[w.id]);
        assert(
          value === null || value <= w.days * 24,
          "Hours exceed the calendar time available in this week portion.",
        );
        return [w.id, value];
      }),
    );
    assert(
      typeof entry.notes === "string" && entry.notes.length <= 4000,
      "Project notes must be text of at most 4,000 characters.",
    );
    return { projectId: entry.projectId, hours, notes: entry.notes };
  });
  assert(
    !staff.yeeld || seen.has(YEELD_ID),
    "The dedicated YEELD entry is required.",
  );
  for (const week of weeks)
    assert(
      sum(entries.map((e) => e.hours[week.id])) <= week.days * 24,
      "Combined project hours exceed the calendar time available.",
    );
  for (const field of ["yeeldNotes", "thematicNotes"])
    assert(
      typeof record[field] === "string" && record[field].length <= 4000,
      "Notes must be text of at most 4,000 characters.",
    );
  assert(
    staff.yeeld || record.yeeldNotes === "",
    "YEELD notes are unavailable for this staff member.",
  );
  assert(
    staff.thematic || record.thematicNotes === "",
    "Thematic notes are unavailable for this staff member.",
  );
  return {
    key: record.key,
    staffId: staff.id,
    year: record.year,
    month: record.month,
    schemaVersion: 2,
    entries,
    yeeldNotes: record.yeeldNotes,
    thematicNotes: record.thematicNotes,
  };
}
export function reportRows(records, staff, projects, filters = {}) {
  return records
    .map(migrateRecord)
    .filter(
      (r) =>
        (!filters.year || r.year === Number(filters.year)) &&
        (!filters.financialYear ||
          financialYear(r.year, r.month) === filters.financialYear) &&
        (!filters.month || r.month === Number(filters.month)) &&
        (!filters.staffId || r.staffId === filters.staffId),
    )
    .flatMap((r) =>
      r.entries
        .filter((e) => !filters.projectId || e.projectId === filters.projectId)
        .flatMap((e) =>
          weeksForMonth(r.year, r.month).map((w) => ({
            key: r.key,
            staffId: r.staffId,
            staff: staff.find((s) => s.id === r.staffId)?.name ?? r.staffId,
            projectId: e.projectId,
            project:
              projects.find((p) => p.id === e.projectId)?.name ?? e.projectId,
            year: r.year,
            financialYear: financialYear(r.year, r.month),
            month: r.month,
            weekStart: w.start,
            weekEnd: w.end,
            hours: e.hours[w.id],
            status: r.status,
            legacyThematicNotes:
              e.projectId === YEELD_ID ? "" : r.thematicNotes,
            notes: e.projectId === YEELD_ID ? r.yeeldNotes : e.notes,
          })),
        ),
    );
}

/** Financial years run July–June; persisted keys remain calendar YYYY-MM. */
export function financialYear(year, month) {
  periodKey(year, month);
  const start = year - (month < 7 ? 1 : 0);
  return `${String(start % 100).padStart(2, "0")}/${String((start + 1) % 100).padStart(2, "0")}`;
}
export function financialStart(value) {
  assert(
    typeof value === "string" && /^\d{2}\/\d{2}$/.test(value),
    "Invalid financial year.",
  );
  const start = 2000 + Number(value.slice(0, 2));
  assert(
    Number(value.slice(3)) === (start + 1) % 100,
    "Financial year must contain consecutive years.",
  );
  return start;
}
export function calendarYear(value, month) {
  const year = financialStart(value) + (month < 7 ? 1 : 0);
  periodKey(year, month);
  return year;
}
