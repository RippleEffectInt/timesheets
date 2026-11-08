# Integration contract and decisions

## Current boundary

The browser uses `createService(BrowserMockRepository, staff, projects)` and an openly simulated principal. This is a functional synthetic prototype, not a secure deployed application. `api/handler.js` provides an injectable HTTP boundary for a future Azure Functions trigger. Authentication defaults to rejection. `SharePointRepository` throws on every operation. No credentials, tenant IDs, site IDs, list IDs or assumed existing resources are embedded.

The next integration step must first confirm the actual SharePoint site/list status and reconcile the three original Excel schema guides. The fields below are a proposed mapping, not claims about existing lists or an instruction to provision them.

## Proposed SharePoint mapping

### Staff Register

| Concept | Proposed type / constraints |
| --- | --- |
| StaffId | Immutable unique text ID; never derive from display name |
| EntraObjectId | Unique verified user object ID, tenant-scoped |
| DisplayName | Text |
| Active | Boolean; deny inactive identities server-side |
| YEELDMember | Boolean |
| ThematicCoordinator | Boolean, independently true/false |

Reporting/reopen grants are not inferred from either membership flag. Group or role assignments and scope must be explicitly agreed. Mock staff IDs are fictional and must never be migrated as live users.

### Project Register

| Concept | Proposed type / constraints |
| --- | --- |
| ProjectId | Immutable unique text ID |
| DisplayName | Text; branding can change independently of ID |
| Active | Boolean |
| ProgrammeType | Explicit YEELD/thematic classification; one dedicated YEELD ID |

Current stable demo ID `project-yeeld` is separate from its YEELD label. Mapping to actual list IDs requires agreement. Decide whether coordinators see all active thematic projects or only assigned projects before live access.

### Monthly Timesheets

| Concept | Proposed type / constraints |
| --- | --- |
| PersonPeriodKey | Required unique indexed single-line text: `StaffId:YYYY-MM` |
| StaffId | Staff lookup or immutable ID with validated reference |
| Year / Month | Integer; 2000–2100 / 1–12 in prototype |
| Status | Choice: Draft, Submitted, Reopened (no approval state) |
| WeeklyEntriesJson | Plain multiline text holding versioned JSON, no rich text |
| YEELDNotes | Plain multiline text; prototype maximum 4,000 characters |
| ThematicNotes | Legacy shared context only, retained for compatibility |
| Revision / ETag | Server-generated optimistic concurrency token |
| Created / Modified / actor | Server-managed audit fields; add explicit submission/reopen audit events |

Example persisted JSON envelope:

```json
{
  "schemaVersion": 2,
  "entries": [
    {
      "projectId": "project-yeeld",
      "notes": "",
      "hours": { "2026-11-01": null, "2026-11-02": 0, "2026-11-09": 8, "2026-11-16": null, "2026-11-23": null, "2026-11-30": null }
    }
  ]
}
```

Keys are the first included date of each week portion, not necessarily Monday at month start. November 1 is a standalone Sunday portion; October's preceding Monday–Saturday portion belongs to October. Blank is JSON null, zero is numeric 0. Each project appears at most once. No implicit conversion from missing data to zero. Future schema migrations must be explicit and tested.

## Repository adapter

`get(personPeriodKey) -> record | null`, `list() -> records[]`, `put(record, expectedRevision) -> savedRecord`.

The production adapter must:

1. Enforce the unique PersonPeriodKey in SharePoint itself. Do not rely on a read-before-create check.
2. Use atomic conditional writes (ETag / If-Match) for updates. Map SharePoint concurrency failures to conflict responses; never silently overwrite.
3. Map versioned JSON, stable IDs, status and both note fields losslessly. Validate all data server-side, including stored JSON on read; unknown versions fail clearly.
4. Handle pagination, indexed filtering, throttling/retry limits, payload limits and unavailable registers. Do not return incomplete reports as complete. The mock `list()` contract is deliberately simple; implement server-scoped filtered queries/pagination before larger production reporting.
5. Use a least-privilege server identity with access limited to the approved site/lists and operations. The exact Graph/SharePoint grant mechanism must be chosen with the tenant administrator; no tenant-wide permission is assumed or requested by this build.
6. Fail closed when configuration, identity, membership, record ownership or capabilities cannot be verified. Never fall back to mock data in production.

## Production security gates

- Configure and verify Entra authentication and tenant restrictions. Map verified subject/tenant to an active Staff Register record; do not trust staff ID or role claims supplied by browser input.
- Run all service validation and access decisions in Azure Functions. Wire the UI through HTTP calls; do not include the mock identity selector or repository in a production build.
- Establish the supported SWA-to-Functions trust boundary. A client-principal header alone is not proof of identity on a publicly reachable API. Restrict direct access or independently validate issuer, audience, signature, expiry and tenant using the supported platform mechanism.
- Ordinary staff read/write only their own records. Explicit reporting and reopen grants require agreed scopes. Reporting may expose notes, so approve field visibility as well as staff/project scope. Apply the same rules to XLSX export and every API path.
- Prevent direct SharePoint list access from bypassing application rules. Resolve item/site permissions and service identity access with administrators. Frontend hiding is never sufficient.
- Add request body limits, origin/CSRF protections appropriate to the auth mode, secure response headers, rate limits, audit logging, retention and monitoring. Never log tokens or private notes.
- Production query and export processing must reauthorize each request. Include tests against actual platform identity and SharePoint permission boundaries before real staff data.

## Open decisions

- Phil confirmed the SharePoint lists have not been created. Confirm the target site and reconcile the original Excel guides before any separately authorized provisioning.
- Who can report, across which staff/projects, and can they see both notes fields? Who may reopen, must a reason be captured, and may staff reopen their own submission?
- Reminder channel, cadence, recipient permissions and opt-outs are unsettled. No reminder integration is implemented.
- Confirm whether all active thematic projects are available to each coordinator or require assignment; determine inactive-project editing and staff membership-change rules.
- Confirm submission completeness requirements, allowed hour precision and business caps. Prototype permits partial weeks and explicit zero, requires at least one entered value to submit, supports hundredths, and applies only physical calendar-hour caps.
- Confirm reporting treatment of draft/reopened records and whether a monthly summary worksheet is required. Current detail export is clearly labelled and includes all statuses.
- Confirm authoritative timezone, retention, audit, year range and operational ownership. UTC date arithmetic avoids DST drift for date-only month/week boundaries.

SQL is deferred. No deployment, push, merge, infrastructure provisioning or live service operation is part of this implementation.

## Version 0.2 notes change

Each thematic project entry now has a `notes` string (maximum 4,000 characters) in schemaVersion 2 JSON. YEELD continues using YEELDNotes. The former shared ThematicNotes field is retained as read-only legacy context and exported separately, never automatically attributed to a project. Actual SharePoint mapping must be reconciled with this revised requirement before provisioning. Local v1 migration retains revisions/status and persists only on an explicit save or reopen operation.
