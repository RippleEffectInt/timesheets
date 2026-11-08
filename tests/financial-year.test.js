import test from "node:test";
import assert from "node:assert/strict";
import {
  financialYear,
  calendarYear,
  newRecord,
  reportRows,
} from "../src/domain.js";
import {
  reportingYearValue,
  decodeItem,
  createSharePointRepository,
} from "../api/sharepoint-repository.js";
test("July–June mapping preserves calendar keys and financial-year report boundaries", () => {
  for (const [year, month, label] of [
    [2026, 7, "26/27"],
    [2026, 12, "26/27"],
    [2027, 1, "26/27"],
    [2027, 6, "26/27"],
    [2027, 7, "27/28"],
  ]) {
    assert.equal(financialYear(year, month), label);
    assert.equal(calendarYear(label, month), year);
  }
  assert.throws(() => calendarYear("26/28", 1));
  const person = { id: "test", yeeld: true };
  const records = [
    [2026, 6],
    [2026, 7],
    [2027, 6],
    [2027, 7],
  ].map(([y, m]) => newRecord(person, y, m));
  const rows = reportRows(records, [person], [], { financialYear: "26/27" });
  assert.deepEqual(
    [...new Set(rows.map((r) => r.key))],
    ["test:2026-07", "test:2027-06"],
  );
  assert(rows.every((r) => r.financialYear === "26/27"));
});
test("SharePoint financial-year choices round-trip July and June without changing period keys", async () => {
  const person = {
    id: "test",
    name: "Test",
    email: "test@example.invalid",
    yeeld: true,
  };
  const schema = {
    Reporting_x0020_Year: { choice: { choices: ["26/27", "27/28"] } },
    field_2: { number: {} },
    StaffMember: { text: {} },
  };
  for (const [year, month] of [
    [2026, 7],
    [2027, 6],
  ]) {
    let fields;
    const graph = {
      all: async () => [],
      url: () => "/mock",
      request: async (_url, options) => {
        fields = JSON.parse(options.body).fields;
      },
    };
    const repo = createSharePointRepository(graph, [person], schema, {
      writeEnabled: true,
    });
    const saved = await repo.put(newRecord(person, year, month), 0);
    assert.equal(fields.Reporting_x0020_Year, "26/27");
    assert.deepEqual(decodeItem({ fields }), saved);
  }
  assert.throws(() => reportingYearValue(2035, 7, schema.Reporting_x0020_Year));
});
