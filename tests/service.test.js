import test from "node:test";
import assert from "node:assert/strict";
import { createService } from "../src/service.js";
import { MemoryRepository, BrowserMockRepository } from "../src/repository.js";
import { staff, projects } from "../src/fixtures.js";
import { createApiHandler } from "../api/handler.js";
const user = { staffId: staff[0].id, authenticated: true, permissions: [] };
const operator = { ...user, permissions: ["report:read", "timesheet:reopen"] };
const setup = () => {
  const repo = new MemoryRepository();
  return { repo, service: createService(repo, staff, projects) };
};
test("save restores values, zero, notes, and updates a single unique record", async () => {
  const { service, repo } = setup();
  let r = await service.read(user, user.staffId, 2026, 11);
  r.entries[0].hours["2026-11-01"] = "0";
  r.yeeldNotes = "One";
  r.thematicNotes = "Two";
  r = await service.save(user, r);
  assert.equal(r.revision, 1);
  r.yeeldNotes = "Updated";
  await service.save(user, r);
  const restored = await service.read(user, user.staffId, 2026, 11);
  assert.equal(restored.yeeldNotes, "Updated");
  assert.equal(restored.thematicNotes, "Two");
  assert.equal(restored.entries[0].hours["2026-11-01"], 0);
  assert.equal(restored.entries[0].hours["2026-11-02"], null);
  assert.equal((await repo.list()).length, 1);
  await assert.rejects(service.save(user, r), /changed elsewhere/);
});
test("service denies missing identity, other staff reads/writes, reports and reopen without grants", async () => {
  const { service } = setup();
  const r = await service.read(user, user.staffId, 2026, 11);
  await assert.rejects(
    service.read(null, user.staffId, 2026, 11),
    /Authentication/,
  );
  await assert.rejects(
    service.read(user, staff[1].id, 2026, 11),
    /Access denied/,
  );
  await assert.rejects(
    service.save(user, { ...r, staffId: staff[1].id }),
    /Access denied/,
  );
  await assert.rejects(service.report(user), /permission/);
  await assert.rejects(service.reopen(user, r.key, 0), /permission/);
});
test("submit locks edits; explicit reopen requires grant and preserves reopened state", async () => {
  const { service } = setup();
  let r = await service.read(user, user.staffId, 2026, 11);
  await assert.rejects(service.save(user, r, "submit"), /at least one/);
  r.entries[0].hours["2026-11-01"] = 0;
  r = await service.save(user, { ...r, status: "Submitted" });
  assert.equal(r.status, "Draft");
  r = await service.save(user, r, "submit");
  assert.equal(r.status, "Submitted");
  await assert.rejects(service.save(user, { ...r, status: "Draft" }), /locked/);
  await assert.rejects(service.reopen(operator, r.key, 0), /changed elsewhere/);
  r = await service.reopen(operator, r.key, r.revision);
  assert.equal(r.status, "Reopened");
  r = await service.save(user, r);
  assert.equal(r.status, "Reopened");
  assert.equal((await service.report(operator)).length, 1);
});
test("mock browser persistence restores entries and reports storage failures", async () => {
  let value = null;
  const storage = {
    getItem: () => value,
    setItem: (_, data) => {
      value = data;
    },
  };
  const first = new BrowserMockRepository([], storage);
  const service = createService(first, staff, projects);
  const r = await service.save(
    user,
    await service.read(user, user.staffId, 2026, 11),
  );
  assert.deepEqual(await new BrowserMockRepository([], storage).get(r.key), r);
  storage.setItem = () => {
    throw new Error("quota");
  };
  await assert.rejects(first.put(r, r.revision), /not been saved/);
  assert.equal((await first.get(r.key)).revision, r.revision);
});
test("API defaults fail closed and forged identity in a request cannot grant access", async () => {
  const { service } = setup();
  const request = new Request("https://example.invalid/api/reports", {
    headers: { "x-ms-client-principal": "forged" },
  });
  assert.equal((await createApiHandler({ service })(request)).status, 401);
  const handler = createApiHandler({ service, authenticate: async () => user });
  assert.equal((await handler(request)).status, 403);
  const other = await service.read(
    { ...user, staffId: staff[1].id },
    staff[1].id,
    2026,
    11,
  );
  assert.equal(
    (
      await handler(
        new Request("https://example.invalid/api/my-timesheet", {
          method: "PUT",
          body: JSON.stringify({ record: other }),
        }),
      )
    ).status,
    403,
  );
  assert.equal((await handler(new Request("https://example.invalid/api/my-timesheet", {method:"PUT",body:"{}"}))).status,400);
});

test("v1 browser drafts migrate losslessly; independent project notes survive save, submit and reopen", async () => {
  const legacy = {
    key: "demo-alex:2026-11",
    staffId: user.staffId,
    year: 2026,
    month: 11,
    schemaVersion: 1,
    revision: 3,
    status: "Draft",
    yeeldNotes: "YEELD old",
    thematicNotes: "Shared old context",
    entries: [
      {
        projectId: "project-yeeld",
        hours: Object.fromEntries(
          ["01", "02", "09", "16", "23", "30"].map((day) => [
            `2026-11-${day}`,
            day === "01" ? 0 : null,
          ]),
        ),
      },
      {
        projectId: "project-learning",
        hours: Object.fromEntries(
          ["01", "02", "09", "16", "23", "30"].map((day) => [
            `2026-11-${day}`,
            null,
          ]),
        ),
      },
      {
        projectId: "project-pathways",
        hours: Object.fromEntries(
          ["01", "02", "09", "16", "23", "30"].map((day) => [
            `2026-11-${day}`,
            null,
          ]),
        ),
      },
    ],
  };
  let raw = JSON.stringify([legacy]);
  const storage = {
    getItem: () => raw,
    setItem: (_, value) => {
      raw = value;
    },
  };
  let service = createService(
    new BrowserMockRepository([], storage),
    staff,
    projects,
  );
  let record = await service.read(user, user.staffId, 2026, 11);
  assert.equal(record.schemaVersion, 2);
  assert.equal(record.revision, 3);
  assert.equal(record.thematicNotes, "Shared old context");
  assert.equal(record.entries[1].notes, "");
  assert.equal(JSON.parse(raw)[0].schemaVersion, 1); // no eager overwrite
  record.entries[1].notes = "Learning only";
  record.entries[2].notes = "Pathways only";
  record = await service.save(user, record);
  service = createService(
    new BrowserMockRepository([], storage),
    staff,
    projects,
  );
  record = await service.read(user, user.staffId, 2026, 11);
  assert.deepEqual(
    record.entries.slice(1).map((e) => e.notes),
    ["Learning only", "Pathways only"],
  );
  record = await service.save(user, record, "submit");
  record = await service.reopen(operator, record.key, record.revision);
  assert.deepEqual(
    record.entries.slice(1).map((e) => e.notes),
    ["Learning only", "Pathways only"],
  );
  assert.equal(record.thematicNotes, "Shared old context");
  assert.equal(record.entries[0].hours["2026-11-01"], 0);
  assert.equal(record.entries[0].hours["2026-11-02"], null);
  record.entries[1].notes = "x".repeat(4001);
  await assert.rejects(service.save(user, record), /Project notes/);
});
