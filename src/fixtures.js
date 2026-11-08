import { newRecord, YEELD_ID } from "./domain.js";
export const staff = [
  { id: "demo-alex", name: "Alex Rowan", yeeld: true, thematic: true },
  { id: "demo-morgan", name: "Morgan Vale", yeeld: true, thematic: false },
  { id: "demo-jamie", name: "Jamie Brook", yeeld: false, thematic: true },
];
export const projects = [
  { id: YEELD_ID, name: "YEELD", active: true },
  { id: "project-learning", name: "Community learning", active: true },
  { id: "project-pathways", name: "Youth pathways", active: true },
  { id: "project-archive", name: "Archived pilot", active: false },
];
export function seedRecords() {
  return staff.flatMap((person, index) =>
    [10, 11].map((month) => {
      const record = newRecord(person, 2026, month);
      if (person.thematic)
        record.entries.push({
          projectId: "project-learning",
          notes: "Fictional example: workshop preparation.",
          hours: Object.fromEntries(
            Object.keys(newRecord(staff[0], 2026, month).entries[0].hours).map(
              (w) => [w, null],
            ),
          ),
        });
      record.entries.forEach((entry) => {
        const keys = Object.keys(entry.hours);
        entry.hours[keys[0]] = index + 2;
        entry.hours[keys[1]] = 0;
      });
      return {
        ...record,
        revision: 1,
        status: month === 10 ? "Submitted" : "Draft",
        yeeldNotes: person.yeeld
          ? "Fictional example: programme planning."
          : "",
        thematicNotes: "",
      };
    }),
  );
}
