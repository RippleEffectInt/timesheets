import { assert, newRecord, validateRecord } from "./domain.js";
import { keyFor } from "./repository.js";
/** In production principal must come ONLY from a verified server identity adapter.
 * In this browser demo it is deliberately simulated and offers no privacy protection. */
export function createService(repository, staff, projects) {
  const actor = (principal) => {
    const person = staff.find((s) => s.id === principal?.staffId);
    assert(
      person && principal?.authenticated === true,
      "Authentication required.",
    );
    return person;
  };
  const owner = (principal, staffId) => {
    const person = actor(principal);
    assert(
      person.id === staffId,
      "Access denied: only your own timesheet is editable.",
    );
    return person;
  };
  return {
    async read(principal, staffId, year, month) {
      const person = owner(principal, staffId);
      return (
        (await repository.get(keyFor(staffId, year, month))) ??
        newRecord(person, year, month)
      );
    },
    async save(principal, input, action = "save") {
      const person = owner(principal, input.staffId);
      assert(action === "save" || action === "submit", "Unsupported action.");
      const data = validateRecord(input, person, projects);
      const prior = await repository.get(data.key);
      assert(
        prior?.status !== "Submitted",
        "Submitted timesheets are locked until reopened.",
      );
      assert(
        Number.isInteger(input.revision) && input.revision >= 0,
        "Invalid revision.",
      );
      if (action === "submit")
        assert(
          data.entries.some((e) =>
            Object.values(e.hours).some((h) => h !== null),
          ),
          "Enter at least one value, including zero, before submitting.",
        );
      return repository.put(
        {
          ...data,
          status:
            action === "submit" ? "Submitted" : (prior?.status ?? "Draft"),
        },
        input.revision,
      );
    },
    async report(principal) {
      actor(principal);
      assert(
        principal.permissions?.includes("report:read"),
        "Reporting permission required.",
      );
      return repository.list();
    },
    async reopen(principal, key, revision) {
      actor(principal);
      assert(
        principal.permissions?.includes("timesheet:reopen"),
        "Reopen permission required.",
      );
      const prior = await repository.get(key);
      assert(
        prior?.status === "Submitted",
        "Only submitted timesheets can be reopened.",
      );
      return repository.put({ ...prior, status: "Reopened" }, revision);
    },
  };
}
