import { HttpError, TENANT } from "./config.js";
import { YEELD_ID, periodKey, migrateRecord } from "./shared/domain.js";
const fail = (message) => {
  throw new HttpError(503, message);
};
export const yes = (value) => value === "Yes";
const text = (value) => (typeof value === "string" ? value.trim() : "");
const validDate = (value) => !value || /^\d{4}-\d{2}-\d{2}/.test(value);
export function mapStaff(item) {
  const f = item.fields ?? {};
  if (
    !["Yes", "No"].includes(f.field_3) ||
    !["Yes", "No"].includes(f.field_4) ||
    !["Yes", "No"].includes(f.field_5)
  )
    fail("Staff membership and Active choices must be Yes or No.");
  if (!validDate(f.StartDate) || !validDate(f.EndDate))
    fail("A Staff Register date is invalid.");
  return {
    id: text(f.field_9),
    name: text(f.StaffMember) || text(f.Title),
    email: text(f.Title),
    yeeld: yes(f.field_3),
    thematic: yes(f.field_4),
    active: yes(f.field_5),
    access: text(f.field_8),
    oid: text(f.field_10).toLowerCase(),
    tid: text(f.field_11).toLowerCase(),
    start: f.StartDate?.slice(0, 10),
    end: f.EndDate?.slice(0, 10),
    lookupId: f.StaffMemberLookupId,
  };
}
function unique(rows, key, label) {
  const values = rows.map((r) => r[key]);
  if (values.some((v) => !v) || new Set(values).size !== values.length)
    fail(`${label} must be populated and unique.`);
}
export function resolvePrincipal(
  identity,
  staff,
  today = new Date().toISOString().slice(0, 10),
) {
  unique(staff, "id", "Staff ID");
  const matches = staff.filter(
    (s) => s.oid === identity.oid && s.tid === identity.tid,
  );
  if (matches.length !== 1)
    throw new HttpError(
      403,
      "Your account must match exactly one Staff Register entry by Entra Object ID and Tenant ID.",
    );
  const person = matches[0];
  if (
    !person.active ||
    (person.start && person.start > today) ||
    (person.end && person.end < today)
  )
    throw new HttpError(
      403,
      "Your Staff Register entry is not currently active.",
    );
  if (!["Staff", "Manager", "Administrator"].includes(person.access))
    throw new HttpError(
      403,
      "Your Staff Register Access Level is not configured.",
    );
  return {
    staffId: person.id,
    authenticated: true,
    permissions:
      person.access === "Administrator"
        ? ["report:read", "timesheet:reopen"]
        : [],
  };
}
export function mapProjects(items) {
  const result = items.map(({ fields: f }) => {
    if (
      !["Yes", "No"].includes(f.field_2) ||
      !["YEELD", "Other Project", "Non-project / Administration"].includes(
        f.field_3,
      )
    )
      fail("Project Active or Project Type choices are invalid.");
    const code = text(f.field_1);
    return {
      id: f.field_3 === "YEELD" ? YEELD_ID : code,
      code,
      name: text(f.Title),
      active: yes(f.field_2),
      type: f.field_3,
      order: Number(f.DisplayOrder) || 0,
    };
  });
  unique(result, "code", "Project Code");
  unique(result, "id", "Project identity (including a single YEELD project)");
  if (
    result.some((p) => !p.name) ||
    result.filter((p) => p.id === YEELD_ID && p.active).length !== 1
  )
    fail("Configure exactly one active YEELD project with a name and code.");
  return result.sort(
    (a, b) => a.order - b.order || a.name.localeCompare(b.name),
  );
}
const REQUIRED = {
  staff: [
    "Title",
    "StaffMember",
    "field_3",
    "field_4",
    "field_5",
    "field_8",
    "field_9",
    "field_10",
    "field_11",
  ],
  projects: ["Title", "field_1", "field_2", "field_3"],
  timesheets: [
    "Title",
    "StaffMember",
    "field_2",
    "Reporting_x0020_Year",
    "field_4",
    "field_5",
    "field_6",
    "field_7",
    "field_8",
    "Submittedat",
    "Lastsavedat",
    "field_11",
  ],
};
export async function inspectSchema(graph) {
  const schemas = {};
  for (const list of Object.keys(REQUIRED)) {
    const columns = await graph.all(list, "columns");
    schemas[list] = Object.fromEntries(columns.map((c) => [c.name, c]));
    const missing = REQUIRED[list].filter((name) => !schemas[list][name]);
    if (missing.length)
      fail(`${list} list is missing internal columns: ${missing.join(", ")}.`);
  }
  const t = schemas.timesheets;
  if (!t.field_4.enforceUniqueValues)
    fail("Monthly Timesheets Period Key must enforce unique values.");
  if (
    !t.field_6.text?.allowMultipleLines ||
    t.field_6.text?.appendChangesToExistingText ||
    t.field_6.text?.textType === "richText"
  )
    fail(
      "Weekly Entries JSON must be plain multiple-line text without append changes.",
    );
  if (!t.Reporting_x0020_Year.number)
    fail("Reporting Year must be a Number column.");
  if (!t.field_2.number && !t.field_2.choice && !t.field_2.text)
    fail("Reporting Month must be a Number, Choice or Text column.");
  if (!t.StaffMember.text && !t.StaffMember.personOrGroup)
    fail("Monthly Staff Member must be Text or Person.");
  return schemas;
}
const monthNames = Array.from({ length: 12 }, (_, i) =>
  new Date(2026, i, 1).toLocaleString("en-GB", { month: "long" }),
);
export function monthValue(month, column) {
  if (column.number) return month;
  if (column.choice) {
    const values = column.choice.choices;
    const found = [
      String(month),
      String(month).padStart(2, "0"),
      monthNames[month - 1],
    ].find((v) => values.includes(v));
    if (!found)
      fail("Reporting Month choices must contain month names or numbers 1–12.");
    return found;
  }
  return String(month);
}
export function decodeItem(item) {
  const f = item.fields ?? {};
  let data;
  try {
    data = JSON.parse(f.field_6);
  } catch {
    fail(
      "A saved timesheet has invalid Weekly Entries JSON. No data has been changed.",
    );
  }
  if (
    !data ||
    data.schemaVersion !== 2 ||
    !Array.isArray(data.entries) ||
    !Number.isInteger(data.revision) ||
    data.revision < 1
  )
    fail(
      "A saved timesheet uses an unsupported JSON format. No data has been changed.",
    );
  const year = Number(f.Reporting_x0020_Year),
    raw = f.field_2;
  const month = monthNames.includes(raw)
    ? monthNames.indexOf(raw) + 1
    : Number(raw);
  const staffId = text(f.field_11),
    key = `${staffId}:${periodKey(year, month)}`;
  if (
    f.field_4 !== key ||
    !["Draft", "Submitted", "Reopened"].includes(f.field_5)
  )
    fail("A saved timesheet has an invalid period key or status.");
  return migrateRecord({
    key,
    staffId,
    year,
    month,
    status: f.field_5,
    schemaVersion: 2,
    revision: data.revision,
    entries: data.entries,
    yeeldNotes: f.field_7 ?? "",
    thematicNotes: f.field_8 ?? "",
  });
}
export function createSharePointRepository(
  graph,
  staff,
  schema,
  { writeEnabled = false } = {},
) {
  async function find(key) {
    const escaped = String(key).replaceAll("'", "''");
    const rows = await graph.all(
      "timesheets",
      `items?$expand=fields&$filter=${encodeURIComponent(`fields/field_4 eq '${escaped}'`)}`,
    );
    if (rows.length > 1) fail("Duplicate timesheet period keys were found.");
    return rows[0] ?? null;
  }
  return {
    async get(key) {
      const item = await find(key);
      return item ? decodeItem(item) : null;
    },
    async list() {
      return (await graph.all("timesheets")).map(decodeItem);
    },
    async put(record, expectedRevision) {
      if (!writeEnabled)
        throw new HttpError(
          403,
          "Saving is disabled during the read-only connection check.",
        );
      const prior = await find(record.key),
        decoded = prior ? decodeItem(prior) : null;
      if ((decoded?.revision ?? 0) !== expectedRevision)
        throw new HttpError(
          409,
          "This timesheet changed elsewhere. Reload before saving.",
        );
      const person = staff.find((s) => s.id === record.staffId);
      if (!person) fail("Timesheet staff member is missing from the register.");
      const saved = { ...record, revision: expectedRevision + 1 };
      const fields = {
        Title: person.email,
        field_2: monthValue(record.month, schema.field_2),
        Reporting_x0020_Year: record.year,
        field_4: record.key,
        field_5: record.status,
        field_6: JSON.stringify({
          schemaVersion: 2,
          revision: saved.revision,
          entries: record.entries,
        }),
        field_7: record.yeeldNotes,
        field_8: record.thematicNotes,
        field_11: person.id,
        Lastsavedat: new Date().toISOString(),
        Submittedat:
          record.status === "Submitted"
            ? new Date().toISOString()
            : (prior?.fields?.Submittedat ?? null),
      };
      if (schema.StaffMember.personOrGroup) {
        if (!person.lookupId)
          fail("The staff Person field needs a SharePoint user value.");
        fields.StaffMemberLookupId = String(person.lookupId);
      } else fields.StaffMember = person.name;
      if (prior) {
        const etag = prior.eTag ?? prior["@odata.etag"];
        if (!etag) fail("SharePoint did not provide a concurrency token.");
        await graph.request(
          graph.url(
            "timesheets",
            `items/${encodeURIComponent(prior.id)}/fields`,
          ),
          {
            method: "PATCH",
            headers: { "If-Match": etag },
            body: JSON.stringify(fields),
          },
        );
      } else
        await graph.request(graph.url("timesheets", "items"), {
          method: "POST",
          body: JSON.stringify({ fields }),
        });
      return saved;
    },
  };
}
export function publicStaff(person) {
  return {
    id: person.id,
    name: person.name,
    yeeld: person.yeeld,
    thematic: person.thematic,
  };
}
