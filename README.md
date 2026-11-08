# Ripple Effect Timesheets

**Windows preview:** start with [START-HERE-WINDOWS.md](START-HERE-WINDOWS.md). Extract directly to `$HOME\YEELD-Timesheets-Preview`; use Node 24 LTS and http://127.0.0.1:5184/.

Version 0.2: Ripple Effect branding, a prominent selected-month heading, a full-width project selector, and independent thematic project notes. See **UPGRADE-WINDOWS.md** when updating an existing preview.

An initial React timesheet prototype for YEELD staff and thematic coordinators, intended for a future Azure Static Web Apps frontend, Azure Functions API, and SharePoint Lists backend.

**Fictional demo only.** Names, projects and hours are synthetic. Identity and permission selectors simulate roles; anyone using this browser can switch them and inspect all demo data. There is no Entra sign-in, live privacy enforcement, SharePoint connection, deployment or reminder workflow.

## Run locally

Use Node.js **24 LTS** (tested with Node 24.19.0). The source package requires Node 24.x.

```sh
npm ci --ignore-scripts
npm run dev
```

Open **http://127.0.0.1:5184/**. The server only listens locally and refuses to silently change ports. If the environment's default npm cache is unavailable, append `--cache /tmp/yeeld-npm-cache` to `npm ci`.

```sh
npm test
npm run build
npm run preview
```

Demo data is persisted in browser localStorage under `yeeld-timesheets-demo-v1`. Reloading restores saved records. Unsaved edits warn before navigation. Clear this key to reset the fictional fixtures. Do not enter real staff information. The initial period is November 2026; October contains submitted examples for reopening. Switch simulated permissions to explore reporting and reopen behavior. These are demonstration capabilities, not agreed production roles.

## Implemented

- One record per stable staff ID and month, revision checks, Draft → Submitted → Reopened transitions. Submitted is **not approval**.
- Monday–Sunday week portions clipped to each month, including leap years; cross-month portions live in separate monthly records.
- A dedicated preselected YEELD section and active thematic project selection. Overlapping membership shows both. YEELD cannot be duplicated in thematic projects.
- Weekly columns can be filled weekly or together at month end. This does not add a separate monthly aggregate entry that could double-count time.
- YEELD monthly notes and separate monthly notes per thematic project, restored drafts, explicit zero versus blank, duplicate and invalid-hours validation, and total hours bounded by available calendar hours. The latter is a sanity cap, not an agreed working-hours policy.
- Month/year/project/staff reporting filters, totals, weekly detail and genuine XLSX export with blank/zero preservation. All statuses are included and shown explicitly; no approval or payroll interpretation is implied.
- Pure domain rules, repository interface, browser mock, service access checks, a framework-neutral future API handler with default-deny authentication, and a fail-closed SharePoint adapter placeholder.

## Structure

- `src/App.jsx`, `styles.css`: React UI and responsive styling.
- `src/domain.js`: week boundaries, validation, aggregation and reporting.
- `src/service.js`: ownership, permission, state and revision checks.
- `src/repository.js`: mock storage and repository contract.
- `src/fixtures.js`: synthetic registers and records.
- `src/export.js`: OOXML workbook generation with fflate ZIP compression.
- `api/handler.js`: future Azure Functions handler seam; not registered or deployed.
- `api/sharepoint-repository.js`: deliberately unconfigured adapter.
- `tests/`: date/data rules, service/API access constraints and workbook verification.
- `docs/INTEGRATION.md`: proposed schema, security requirements, open decisions.

## Limits and verification

Service checks are testable application logic but execute in the browser in this prototype and **cannot secure production data**. The future API must independently run these rules with verified server identity. The mock is intended for a single browser demo, not concurrent or multi-user use; localStorage cannot guarantee atomic compare-and-swap across tabs. Inactive projects are excluded from new entries; historical display is retained, but editing records with newly inactive projects needs an agreed production policy.

Phil has confirmed that the SharePoint lists have not been created. No live tenant, site, list, sign-in, deployment, reminder or end-to-end Azure/SharePoint behavior has been verified. No infrastructure resources or Microsoft 365 permissions have been created. SQL remains deferred. See integration notes before any real-data work.

## Existing demo data

The browser key `yeeld-timesheets-demo-v1` and port 5184 intentionally remain unchanged. Schema v1 records migrate to v2 on read, keeping hours, status, revision, YEELD notes and previous shared thematic notes. Each thematic entry gains its own `notes` string. Previous shared notes remain visible read-only and export in a separate column; no project attribution is inferred. Saving persists v2. Do not run the older app against migrated data. Migration is not a live SharePoint migration.
