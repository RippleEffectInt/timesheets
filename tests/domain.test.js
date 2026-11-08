import test from "node:test";
import assert from "node:assert/strict";
import {
  weeksForMonth,
  parseHours,
  newRecord,
  validateRecord,
  availableProjects,
  YEELD_ID,
  reportRows,
} from "../src/domain.js";
import { staff, projects, seedRecords } from "../src/fixtures.js";
test("weeks are Monday–Sunday clipped at both sides of month", () => {
  assert.deepEqual(weeksForMonth(2026, 11)[0], {
    id: "2026-11-01",
    start: "2026-11-01",
    end: "2026-11-01",
    days: 1,
  });
  assert.equal(weeksForMonth(2026, 10).at(-1).end, "2026-10-31");
  assert.equal(weeksForMonth(2026, 11).at(-1).end, "2026-11-30");
  assert.equal(weeksForMonth(2026, 12)[0].start, "2026-12-01");
});
test("all days appear exactly once through leap years and year boundaries", () => {
  for (let year = 2024; year <= 2030; year++)
    for (let month = 1; month <= 12; month++) {
      const weeks = weeksForMonth(year, month);
      assert.equal(
        weeks.reduce((n, w) => n + w.days, 0),
        new Date(Date.UTC(year, month, 0)).getUTCDate(),
      );
      weeks.forEach((w, i) => {
        if (i) assert.equal(new Date(w.start).getUTCDay(), 1);
        if (i < weeks.length - 1) assert.equal(new Date(w.end).getUTCDay(), 0);
      });
    }
  assert.equal(weeksForMonth(2024, 2).at(-1).end, "2024-02-29");
  assert.throws(() => weeksForMonth(2026, 13));
});
test("blank is distinct from explicit zero; invalid hours rejected", () => {
  assert.equal(parseHours(""), null);
  assert.equal(parseHours(null), null);
  assert.equal(parseHours("0"), 0);
  assert.equal(parseHours("1.25"), 1.25);
  for (const invalid of [
    -1,
    NaN,
    Infinity,
    "no",
    " ",
    "1e3",
    "1.001",
    false,
    {},
    undefined,
  ])
    assert.throws(() => parseHours(invalid));
});
test("overlap roles receive both sections without duplicating YEELD", () => {
  assert.deepEqual(
    availableProjects(staff[0], projects).map((p) => p.id),
    [YEELD_ID, "project-learning", "project-pathways"],
  );
  assert.equal(availableProjects(staff[1], projects).length, 1);
  assert(!availableProjects(staff[2], projects).some((p) => p.id === YEELD_ID));
});
test("validation rejects duplicate, inactive, unauthorized, wrong week and over-capacity entries", () => {
  const base = newRecord(staff[0], 2026, 11);
  const check = (r) => validateRecord(r, staff[0], projects);
  assert.throws(() =>
    check({ ...base, entries: [...base.entries, ...base.entries] }),
  );
  for (const projectId of ["project-archive", "missing"])
    assert.throws(() =>
      check({
        ...base,
        entries: [...base.entries, { ...base.entries[0], projectId }],
      }),
    );
  const wrongWeek = structuredClone(base);
  wrongWeek.entries[0].hours["2026-10-31"] = 2;
  assert.throws(() => check(wrongWeek));
  const high = structuredClone(base);
  high.entries[0].hours["2026-11-01"] = 25;
  assert.throws(() => check(high));
  const combined = structuredClone(base);
  combined.entries[0].hours["2026-11-01"] = 20;
  combined.entries.push({
    projectId: "project-learning",
    hours: { ...combined.entries[0].hours },
  });
  assert.throws(() => check(combined));
  assert.throws(() =>
    validateRecord(
      {
        ...newRecord(staff[1], 2026, 11),
        entries: [
          ...base.entries,
          { ...base.entries[0], projectId: "project-learning" },
        ],
      },
      staff[1],
      projects,
    ),
  );
  assert.throws(() => check({ ...base, entries: [] }));
});
test("report filters intersect and preserve blank and zero", () => {
  const rows = reportRows(seedRecords(), staff, projects, {
    month: "11",
    year: "2026",
    projectId: YEELD_ID,
    staffId: staff[0].id,
  });
  assert.equal(rows.length, 6);
  assert.equal(rows[1].hours, 0);
  assert.equal(rows[2].hours, null);
  assert(
    rows.every(
      (r) =>
        r.staffId === staff[0].id && r.month === 11 && r.projectId === YEELD_ID,
    ),
  );
});

test("reports keep project notes separate from legacy shared notes", () => {
  const record = newRecord(staff[0], 2026, 11);
  record.thematicNotes = "Unassigned legacy";
  record.entries.push({
    projectId: "project-learning",
    notes: "Learning only",
    hours: { ...record.entries[0].hours },
  });
  record.entries.push({
    projectId: "project-pathways",
    notes: "Pathways only",
    hours: { ...record.entries[0].hours },
  });
  const rows = reportRows([record], staff, projects);
  assert(
    rows
      .filter((r) => r.projectId === "project-learning")
      .every((r) => r.notes === "Learning only"),
  );
  assert(
    rows
      .filter((r) => r.projectId === "project-pathways")
      .every((r) => r.notes === "Pathways only"),
  );
  assert(
    rows
      .filter((r) => r.projectId !== YEELD_ID)
      .every((r) => r.legacyThematicNotes === "Unassigned legacy"),
  );
});
