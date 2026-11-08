import { assert, periodKey, migrateRecord } from "./domain.js";
/** Repository contract: get(key), list(), put(record, expectedRevision).
 * put must atomically enforce unique key + optimistic concurrency. */
export class MemoryRepository {
  constructor(records = []) {
    this.records = new Map(records.map((r) => [r.key, migrateRecord(r)]));
  }
  async get(key) {
    return structuredClone(this.records.get(key) ?? null);
  }
  async list() {
    return structuredClone([...this.records.values()]);
  }
  async put(record, expectedRevision) {
    const prior = this.records.get(record.key);
    assert(
      (prior?.revision ?? 0) === expectedRevision,
      "This timesheet changed elsewhere. Reload before saving.",
    );
    const saved = {
      ...structuredClone(record),
      revision: expectedRevision + 1,
    };
    this.records.set(saved.key, saved);
    return structuredClone(saved);
  }
}
/** Demo-only persistence. Browser storage is not a security boundary. */
export class BrowserMockRepository extends MemoryRepository {
  constructor(seed, storage = window.localStorage) {
    const raw = storage.getItem("yeeld-timesheets-demo-v1");
    let records = seed;
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) records = parsed;
      } catch {
        /* recover synthetic fixtures only */
      }
    }
    super(records);
    this.storage = storage;
  }
  async put(record, expectedRevision) {
    // Re-read shared storage so another tab's saved revision cannot be silently overwritten.
    // localStorage has no atomic CAS; production adapter MUST implement atomic concurrency.
    const raw = this.storage.getItem("yeeld-timesheets-demo-v1");
    if (raw)
      this.records = new Map(
        JSON.parse(raw).map((r) => [r.key, migrateRecord(r)]),
      );
    const before = new Map(this.records);
    const saved = await super.put(record, expectedRevision);
    try {
      this.storage.setItem(
        "yeeld-timesheets-demo-v1",
        JSON.stringify([...this.records.values()]),
      );
    } catch (error) {
      this.records = before;
      throw new Error(
        "Demo storage is unavailable or full. Your changes have not been saved.",
      );
    }
    return saved;
  }
}
export function keyFor(staffId, year, month) {
  return `${staffId}:${periodKey(year, month)}`;
}
