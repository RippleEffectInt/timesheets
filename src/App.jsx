import React, { useEffect, useMemo, useState } from "react";
import {
  availableProjects,
  reportRows,
  sum,
  weeksForMonth,
  YEELD_ID,
} from "./domain.js";
import {
  staff as demoStaff,
  projects as demoProjects,
  seedRecords,
} from "./fixtures.js";
import { BrowserMockRepository } from "./repository.js";
import { createService } from "./service.js";
import { downloadWorkbook } from "./export.js";
const months = Array.from({ length: 12 }, (_, i) =>
  new Date(2026, i).toLocaleString("en-GB", { month: "long" }),
);
const years = Array.from({ length: 101 }, (_, i) => 2000 + i);
export function App({ service: suppliedService, liveContext }) {
  const staff = liveContext?.staff ?? demoStaff;
  const projects = liveContext?.projects ?? demoProjects;
  const service = useMemo(
    () =>
      suppliedService ??
      createService(new BrowserMockRepository(seedRecords()), staff, projects),
    [suppliedService],
  );
  const [staffId, setStaffId] = useState(
    liveContext?.principal.staffId ?? staff[0].id,
  );
  const [role, setRole] = useState(
    liveContext?.principal.permissions.includes("report:read")
      ? "operator"
      : "staff",
  );
  const [page, setPage] = useState("entry");
  const [month, setMonth] = useState(
    liveContext ? new Date().getMonth() + 1 : 11,
  );
  const [year, setYear] = useState(
    liveContext ? new Date().getFullYear() : 2026,
  );
  const [record, setRecord] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [records, setRecords] = useState([]);
  const [filters, setFilters] = useState({
    month: "11",
    year: "2026",
    staffId: "",
    projectId: "",
  });
  const person = staff.find((s) => s.id === staffId);
  const principal = useMemo(
    () =>
      liveContext?.principal ?? {
        staffId,
        authenticated: true,
        permissions:
          role === "reporter"
            ? ["report:read"]
            : role === "operator"
              ? ["report:read", "timesheet:reopen"]
              : [],
      },
    [staffId, role, liveContext],
  );
  useEffect(() => {
    let active = true;
    setRecord(null);
    setError("");
    setMessage("");
    service
      .read(principal, staffId, year, month)
      .then((value) => {
        if (active) {
          setRecord(value);
          setDirty(false);
        }
      })
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [service, principal, staffId, year, month, refresh]);
  useEffect(() => {
    let active = true;
    setRecords([]);
    if (page === "reports")
      service
        .report(principal)
        .then((value) => active && setRecords(value))
        .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [service, principal, page, refresh]);
  useEffect(() => {
    const handler = (event) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  const changeContext = (fn) => {
    if (!dirty || window.confirm("Discard unsaved changes?")) {
      setDirty(false);
      setMessage("");
      setError("");
      fn();
    }
  };
  const edit = (fn) => {
    setRecord(fn);
    setDirty(true);
    setMessage("");
    setError("");
  };
  const run = async (fn) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const save = (action) =>
    run(async () => {
      const saved = await service.save(principal, record, action);
      setRecord(saved);
      setDirty(false);
      setMessage(
        action === "submit"
          ? "Timesheet submitted. This is a status, not manager approval."
          : liveContext
            ? "Draft saved to SharePoint."
            : "Draft saved on this browser.",
      );
    });
  const weeks = weeksForMonth(year, month);
  const rows = reportRows(records, staff, projects, filters);
  const total = record
    ? sum(
        record.entries.flatMap((e) =>
          Object.values(e.hours).map((h) =>
            h === "" || h === null ? null : Number(h),
          ),
        ),
      )
    : 0;
  const locked =
    (liveContext && !liveContext.writeEnabled) ||
    busy ||
    record?.status === "Submitted";
  const hoursTable = (entries) => (
    <div className="table-scroll">
      <table>
        <caption className="sr-only">
          Weekly hours for {months[month - 1]} {year}
        </caption>
        <thead>
          <tr>
            <th scope="col">Project</th>
            {weeks.map((w) => (
              <th scope="col" key={w.id}>
                {w.start.slice(8)}–{w.end.slice(8)}
                <small>
                  {w.days} {w.days === 1 ? "day" : "days"}
                </small>
              </th>
            ))}
            <th scope="col">Total</th>
            <th scope="col">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.projectId}>
              <th scope="row">
                {projects.find((p) => p.id === entry.projectId)?.name ??
                  entry.projectId}
              </th>
              {weeks.map((w) => (
                <td key={w.id}>
                  <input
                    aria-label={`${projects.find((p) => p.id === entry.projectId)?.name} hours ${w.start} to ${w.end}`}
                    inputMode="decimal"
                    type="number"
                    min="0"
                    max={w.days * 24}
                    step="0.01"
                    placeholder="—"
                    disabled={locked}
                    value={entry.hours[w.id] ?? ""}
                    onChange={(event) => {
                      const value = event.target.value;
                      edit((r) => ({
                        ...r,
                        entries: r.entries.map((e) =>
                          e.projectId === entry.projectId
                            ? { ...e, hours: { ...e.hours, [w.id]: value } }
                            : e,
                        ),
                      }));
                    }}
                  />
                </td>
              ))}
              <td className="numeric">
                {sum(Object.values(entry.hours).map((h) => Number(h)))}
              </td>
              <td>
                {entry.projectId !== YEELD_ID && (
                  <button
                    className="text-button"
                    disabled={locked}
                    aria-label={`Remove ${projects.find((p) => p.id === entry.projectId)?.name}`}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Remove this project, its hours and its notes from this month?",
                        )
                      )
                        edit((r) => ({
                          ...r,
                          entries: r.entries.filter(
                            (e) => e.projectId !== entry.projectId,
                          ),
                        }));
                    }}
                  >
                    Remove
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <>
      <div className="demo-banner">
        {liveContext
          ? liveContext.writeEnabled
            ? "Connected to SharePoint · Signed in with Microsoft"
            : "READ-ONLY CONNECTION CHECK · Signed in with Microsoft · Saving is disabled"
          : "FICTIONAL DEMO · Simulated identities and permissions · Saved only in this browser · No Microsoft 365 connection"}
      </div>
      <header>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            changeContext(() => setPage("entry"));
          }}
        >
          Ripple Effect<span>TIMESHEETS</span>
        </a>
        {liveContext ? (
          <div className="identity">
            <strong>{person.name}</strong>
            <button onClick={() => changeContext(liveContext.logout)}>
              Sign out
            </button>
          </div>
        ) : (
          <div className="identity">
            <label>
              Simulated person
              <select
                disabled={busy}
                value={staffId}
                onChange={(e) =>
                  changeContext(() => setStaffId(e.target.value))
                }
              >
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Simulated permission
              <select
                disabled={busy}
                value={role}
                onChange={(e) =>
                  changeContext(() => {
                    setRole(e.target.value);
                    setPage("entry");
                  })
                }
              >
                <option value="staff">Staff: own timesheet</option>
                <option value="reporter">Reporting demonstration</option>
                <option value="operator">
                  Reporting + reopen demonstration
                </option>
              </select>
            </label>
          </div>
        )}
      </header>
      <nav aria-label="Main navigation">
        <button
          aria-current={page === "entry" ? "page" : undefined}
          disabled={busy}
          onClick={() => changeContext(() => setPage("entry"))}
        >
          My Timesheet
        </button>
        <button
          aria-current={page === "reports" ? "page" : undefined}
          disabled={busy || role === "staff"}
          onClick={() => changeContext(() => setPage("reports"))}
        >
          Reporting
        </button>
        <span>
          {liveContext
            ? "Reports and reopening: Administrators only"
            : "Permission policy awaits agreement"}
        </span>
      </nav>
      <main>
        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}
        {message && (
          <div className="notice success" role="status">
            {message}
          </div>
        )}
        {page === "entry" ? (
          <>
            <div className="page-heading">
              <div>
                <p className="eyebrow">YOUR CONTRIBUTION, TOGETHER</p>
                <h1>My Timesheet</h1>
                <div
                  className="timesheet-owner"
                  aria-label="Timesheet owner and period"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  <div>
                    <span className="eyebrow">
                      {liveContext
                        ? "Signed in · Timesheet for"
                        : "Sample identity · Timesheet for"}
                    </span>
                    <h2 className="owner-name">{person.name}</h2>
                  </div>
                  <h2 className="selected-month">
                    {months[month - 1]} {year}
                  </h2>
                </div>
                <p>
                  Welcome, {person.name.split(" ")[0]}. Record your time in one
                  monthly view.
                </p>
              </div>
              <div className="period">
                <label>
                  Month
                  <select
                    disabled={busy}
                    value={month}
                    onChange={(e) =>
                      changeContext(() => setMonth(Number(e.target.value)))
                    }
                  >
                    {months.map((m, i) => (
                      <option key={m} value={i + 1}>
                        {m}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Year
                  <select
                    disabled={busy}
                    value={year}
                    onChange={(e) =>
                      changeContext(() => setYear(Number(e.target.value)))
                    }
                  >
                    {years.map((y) => (
                      <option key={y}>{y}</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
            {record ? (
              <>
                <div className="summary">
                  <div>
                    <span className={`status ${record.status.toLowerCase()}`}>
                      {record.status}
                    </span>
                    <span className="muted">
                      {dirty
                        ? "Unsaved changes"
                        : `Saved version ${record.revision}`}
                    </span>
                  </div>
                  <div>
                    <strong>{total.toLocaleString("en-GB")}</strong> hours this
                    month
                  </div>
                </div>
                <p className="hint">
                  Weeks run Monday–Sunday and stop at the month boundary. Blank
                  means not entered; <strong>0 means no time worked.</strong>{" "}
                  You can complete the week columns throughout the month or
                  together at month end.
                </p>
                {record.status === "Submitted" && (
                  <div className="notice">
                    {liveContext
                      ? "This month is submitted and locked. An Administrator can reopen it for corrections."
                      : "This month is submitted and locked. Reopen authority is still to be agreed; the demonstration is available under simulated permissions."}
                  </div>
                )}
                {person.yeeld && (
                  <section className="card">
                    <div className="section-title">
                      <div>
                        <span className="eyebrow">YOUR DEDICATED SECTION</span>
                        <h2>YEELD</h2>
                      </div>
                      <span className="tag">Preselected</span>
                    </div>
                    {hoursTable(
                      record.entries.filter((e) => e.projectId === YEELD_ID),
                    )}
                    <label className="notes">
                      YEELD monthly notes
                      <textarea
                        maxLength="4000"
                        disabled={locked}
                        value={record.yeeldNotes}
                        placeholder="What did you contribute this month?"
                        onChange={(e) => {
                          const value = e.target.value;
                          edit((r) => ({ ...r, yeeldNotes: value }));
                        }}
                      />
                    </label>
                  </section>
                )}
                {person.thematic && (
                  <section className="card">
                    <div className="section-title">
                      <div>
                        <span className="eyebrow">PROJECT CONTRIBUTIONS</span>
                        <h2>Thematic projects</h2>
                      </div>
                    </div>
                    <div className="project-picker">
                      <div>
                        <strong>Add a thematic project</strong>
                        <p>
                          Select an active project below to add its weekly hours
                          and monthly notes.
                        </p>
                      </div>
                      <label>
                        Add active project
                        <select
                          aria-label="Add active project"
                          value=""
                          disabled={locked}
                          onChange={(e) => {
                            const projectId = e.target.value;
                            if (projectId)
                              edit((r) => ({
                                ...r,
                                entries: [
                                  ...r.entries,
                                  {
                                    projectId,
                                    notes: "",
                                    hours: Object.fromEntries(
                                      weeks.map((w) => [w.id, null]),
                                    ),
                                  },
                                ],
                              }));
                          }}
                        >
                          <option value="">Choose a project…</option>
                          {availableProjects(person, projects)
                            .filter(
                              (p) =>
                                p.id !== YEELD_ID &&
                                !record.entries.some(
                                  (e) => e.projectId === p.id,
                                ),
                            )
                            .map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                        </select>
                      </label>
                    </div>
                    {record.entries
                      .filter((e) => e.projectId !== YEELD_ID)
                      .map((entry) => {
                        const projectName =
                          projects.find((p) => p.id === entry.projectId)
                            ?.name ?? entry.projectId;
                        return (
                          <div className="project-entry" key={entry.projectId}>
                            <h3>{projectName}</h3>
                            {hoursTable([entry])}
                            <label className="notes">
                              {projectName} monthly notes
                              <textarea
                                maxLength="4000"
                                disabled={locked}
                                value={entry.notes}
                                placeholder={`Notes for ${projectName} this month.`}
                                onChange={(event) => {
                                  const notes = event.target.value;
                                  edit((r) => ({
                                    ...r,
                                    entries: r.entries.map((e) =>
                                      e.projectId === entry.projectId
                                        ? { ...e, notes }
                                        : e,
                                    ),
                                  }));
                                }}
                              />
                            </label>
                          </div>
                        );
                      })}
                    {!record.entries.some((e) => e.projectId !== YEELD_ID) && (
                      <p className="empty">
                        Use Add active project above to start recording hours
                        and notes.
                      </p>
                    )}
                    {record.thematicNotes && (
                      <div className="legacy-notes">
                        <h3>Previous shared thematic notes</h3>
                        <p>
                          Preserved from the earlier demo. These notes were
                          shared across projects, so they have not been assigned
                          to any project. Copy relevant text into the project
                          notes above as needed.
                        </p>
                        <label className="notes">
                          Previous shared thematic notes
                          <textarea readOnly value={record.thematicNotes} />
                        </label>
                      </div>
                    )}
                  </section>
                )}
                <div className="actions">
                  <span>
                    {record.status === "Submitted"
                      ? "Submitted is a recording status, not approval."
                      : "Save as you go. Submit when the month is complete."}
                  </span>
                  <button
                    disabled={busy}
                    onClick={() =>
                      changeContext(() => setRefresh((n) => n + 1))
                    }
                  >
                    Reload saved
                  </button>
                  <button disabled={locked} onClick={() => save("save")}>
                    Save draft
                  </button>
                  <button
                    className="primary"
                    disabled={locked}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Submit this month and lock further edits? Blank cells will remain blank.",
                        )
                      )
                        save("submit");
                    }}
                  >
                    Submit month
                  </button>
                </div>
              </>
            ) : (
              <p role="status">Loading timesheet…</p>
            )}
          </>
        ) : (
          <>
            <div className="page-heading">
              <div>
                <p className="eyebrow">FICTIONAL DATA · ALL STATUSES</p>
                <h1>Reporting</h1>
                <p>
                  Explore recorded time. Blank cells are excluded from
                  entered-value counts.
                </p>
              </div>
              <button
                className="primary"
                disabled={busy || !rows.length}
                onClick={() => run(() => downloadWorkbook(rows, filters))}
              >
                Export XLSX
              </button>
            </div>
            <section className="card filters">
              {[
                ["month", "Month", months.map((m, i) => [String(i + 1), m])],
                ["year", "Year", years.map((y) => [String(y), y])],
                ["projectId", "Project", projects.map((p) => [p.id, p.name])],
                ["staffId", "Staff", staff.map((s) => [s.id, s.name])],
              ].map(([key, label, options]) => (
                <label key={key}>
                  {label}
                  <select
                    value={filters[key]}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, [key]: e.target.value }))
                    }
                  >
                    <option value="">All {label.toLowerCase()}s</option>
                    {options.map(([value, text]) => (
                      <option key={value} value={value}>
                        {text}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </section>
            <div className="metrics">
              <div>
                <span>Recorded hours</span>
                <strong>{sum(rows.map((r) => r.hours))}</strong>
              </div>
              <div>
                <span>Entered week / project cells</span>
                <strong>{rows.filter((r) => r.hours !== null).length}</strong>
              </div>
              <div>
                <span>Matching timesheets</span>
                <strong>{new Set(rows.map((r) => r.key)).size}</strong>
              </div>
            </div>
            <section className="card">
              <h2>Weekly detail</h2>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      {[
                        "Staff",
                        "Project",
                        "Week portion",
                        "Hours",
                        "Status",
                      ].map((h) => (
                        <th key={h} scope="col">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={`${r.key}:${r.projectId}:${r.weekStart}`}>
                        <td>{r.staff}</td>
                        <td>{r.project}</td>
                        <td>
                          {r.weekStart} → {r.weekEnd}
                        </td>
                        <td>
                          {r.hours === null ? (
                            <span className="muted">Not entered</span>
                          ) : (
                            r.hours
                          )}
                        </td>
                        <td>
                          <span className="status">{r.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!rows.length && (
                  <p className="empty">No entries match these filters.</p>
                )}
              </div>
            </section>
            {role === "operator" && (
              <section className="card">
                <h2>
                  {liveContext
                    ? "Reopen submitted timesheets"
                    : "Simulated reopen controls"}
                </h2>
                <p>
                  {liveContext
                    ? "Reopening allows the staff member to make corrections. It is not an approval."
                    : "Demonstrates the state transition only. Who may reopen real records is undecided."}
                </p>
                {records
                  .filter(
                    (r) =>
                      r.status === "Submitted" &&
                      rows.some((row) => row.key === r.key),
                  )
                  .map((r) => (
                    <div className="reopen-row" key={r.key}>
                      <span>
                        {staff.find((s) => s.id === r.staffId)?.name} ·{" "}
                        {months[r.month - 1]} {r.year}
                      </span>
                      <button
                        disabled={
                          busy || (liveContext && !liveContext.writeEnabled)
                        }
                        onClick={() =>
                          run(async () => {
                            await service.reopen(principal, r.key, r.revision);
                            setRefresh((n) => n + 1);
                            setMessage(
                              liveContext
                                ? "Timesheet reopened."
                                : "Demo timesheet reopened.",
                            );
                          })
                        }
                      >
                        Reopen
                      </button>
                    </div>
                  ))}
              </section>
            )}
          </>
        )}
        <footer>
          {liveContext
            ? "Ripple Effect Timesheets · Microsoft sign-in · SharePoint storage"
            : "Ripple Effect Timesheets · Prototype v0.4 · Fictional sample data. Browser controls do not enforce live privacy. Production requires verified server identity and access controls."}
        </footer>
      </main>
    </>
  );
}
