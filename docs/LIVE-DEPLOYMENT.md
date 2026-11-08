# Ripple Effect Timesheets: integration pilot

Production builds use Microsoft MSAL sign-in and an Azure Functions API. `npm run dev` remains the isolated synthetic demo, with the existing `yeeld-timesheets-demo-v1` browser drafts. Demo drafts are never imported into SharePoint. `npm run preview` serves the production sign-in build; the registered redirect is the Azure site, not localhost.

## Deployment

The Azure workflow builds `/`, deploys `dist`, and deploys `api` as managed Node 22 Functions on the existing Free Static Web App. Frontend build/test uses Node 24. Run `npm ci --ignore-scripts`, `npm ci --prefix api --ignore-scripts`, `npm test`, `npm run build`. The build copies canonical domain/service/repository modules from `src` to `api/shared`; do not edit those copies manually.

Backend Production application settings (never VITE_ settings):

- TIMESHEETS_TENANT_ID: 813ee105-1291-48e6-9381-e535253a68be
- TIMESHEETS_CLIENT_ID: 54b64b90-4ca1-463b-8290-8b285d5df68c
- TIMESHEETS_CLIENT_SECRET: supplied privately in Azure
- TIMESHEETS_WRITE_ENABLED: absent/false for the first read-only check. Set to exactly `true` only after successful sign-in, schema verification, confirmation of the staff identity and a controlled save/submit/reopen pilot is ready.

The frontend registration is 9595233b-3183-4568-8604-a194530e7fb6. Register the SPA redirect `https://wonderful-sky-070a66510.3.azurestaticapps.net/`. Grant delegated scope `api://54b64b90-4ca1-463b-8290-8b285d5df68c/access_as_user` and consent. Both v1 and v2 access tokens are independently verified by signature, tenant-specific issuer, expiry/not-before, API audience, delegated scope and frontend client ID. An ID token cannot substitute for an API access token. The Functions anonymous trigger setting means verification is implemented inside every protected handler; it does not mean anonymous access to records.

The API has Graph application `Lists.SelectedOperations.Selected`, with individual grants: Staff read, Projects read, Monthly Timesheets write. Do not add tenant-wide Sites.ReadWrite.All. The site and list IDs are explicit in `api/config.js`. The frontend never receives a Graph token or client secret. Server Graph credentials alone do not grant end users access: every request matches verified oid/tid to exactly one active Staff Register row. Staff access only their own record. Managers can additionally report/export all records, but cannot reopen them. Administrators additionally reopen submitted records. All roles can edit only their own timesheet. No manager approval workflow is implemented.

## SharePoint requirements and first connection

Populate Staff ID (unique stable text), Entra Object ID, Entra Tenant ID, Staff Email (internal `Title`), Access Level (Staff/Manager/Administrator), and all Yes/No choice fields. An active row must have applicable start/end dates. A blank membership/active choice is rejected. Staff IDs must be unique across the register. Project Codes must be populated, unique and immutable. Exactly one YEELD project is mapped to reserved internal ID `project-yeeld`; other projects use Project Code as their stable ID. Do not use the reserved ID for a different project. The initial adapter uses the Active flag for project availability; project date windows are not enforced yet.

The column mappings are explicit in `api/sharepoint-repository.js` and match Phil's supplied internal names, with capital `Title`. Period Key must enforce unique values (and be indexed). Reporting Year is a Choice column containing July–June financial years, such as `26/27` (July 2026–June 2027). The API reads the configured choices into the entry and report selectors. Stored period keys and weekly dates remain calendar-based; June 2027 is `2027-06` and is stored with Reporting Year `26/27`. Legacy Number year columns/records remain readable. Reporting Month supports Number, Text numeric values, or choices of English full month names / numeric month values. Weekly Entries JSON must be plain multiple-line text without append changes. Monthly Staff Member supports Text or single Person; for Person fields, the Staff Register must contain the corresponding StaffMemberLookupId on the same site. Multi-person and other lookup column types require an adapter change before writes. For a Person field whose display name isn't returned, the page uses the registered email as the identity label.

Stored weekly JSON is `{schemaVersion:2, revision:1, entries:[{projectId, hours:{"2026-11-01":null}, notes:""}]}`. The hours object contains every clipped week start, not just this abbreviated example. Both monthly note fields remain separate. Per-project thematic notes live inside each JSON entry. Existing browser sample data is not compatible with direct list import and is never imported automatically. Unknown live JSON formats fail closed instead of overwriting them.

A read-only pilot is the default. Sign in and check the prominent identity and month. A configuration error reports the missing/internal field or identity requirement. First connection requires the real tenant and list schema and has not been simulated as a successful live connection. `/api/health` is public and exposes only a version; `/api/bootstrap`, `/api/my-timesheet`, `/api/reports`, `/api/reopen` require a verified bearer token. Ordinary bootstrap responses contain only that person's public staff profile. Administrators receive staff names and IDs needed for reports, not other people's Entra identifiers or email.

After confirming the connection, enable writes for a controlled pilot. Test save/reload, separate notes and zero/blank, submit locking, Administrator reopen, an ordinary user's denied report access, and a second-tab stale update. Updates use numeric revisions plus SharePoint If-Match ETags; unique Period Key prevents simultaneous duplicate creation. A timeout may mean a write completed: reload before retrying. No automated retry of writes occurs. SharePoint direct permissions are separate from this application's policy and must be reviewed before staff rollout.

## Remaining rollout work

- Actual tenant sign-in, real column types, Graph permissions, and real save round-trips require a user-led pilot; synthetic tests do not establish them.
- The secret is temporary integration-pilot authentication. Replace it with a certificate or federated credential before general staff rollout, then rotate/revoke the pilot secret.
- Reporting/export is available to Managers and Administrators; reopening remains Administrator-only. Agree reminder channel and operational ownership; no reminders run.
- Review direct SharePoint access, retention, recovery, audit requirements and production monitoring. There is no separate reopen audit log in this version; SharePoint list version history should be configured appropriately.
- Large reports currently load list records with pagination; Graph throttling produces a retryable user error, not hidden partial totals. No SQL backend.
