# Prototype validation — 3 November 2026

Environment: Node.js 24.19.0, npm 11.9.0.

- `npm test`: 13 passing tests. Covers clipped week boundaries across 2024–2030 and leap day; blank versus zero; invalid hours and calendar capacity; overlapping membership; duplicate/inactive projects; intersecting report filters; persisted draft restoration, separate notes and unique updates; revision conflicts; state transitions; access-denial rules; default-deny API identity; UI save/reload/submit, membership and report filter interactions; XLSX XML/ZIP structure and formula-looking text safety.
- `npm run build`: passed with Vite 7.3.7. Main JavaScript bundle approximately 225 kB / 73 kB gzip; no large-chunk warning.
- `npm audit --audit-level=low`: zero known vulnerabilities at validation time. This is a point-in-time dependency audit, not a security certification.
- Local Vite startup and HTTP smoke check: passed, HTTP 200. Server stopped after the check.
- Independent XLSX verification: Python openpyxl 3.1.5 opened a generated workbook and confirmed both worksheet names, numeric zero, blank cells, escaped text and literal `=1+1` text (not a formula).

The UI test uses jsdom and React Testing Library. A real-browser visual/accessibility review and live Azure/Entra/SharePoint end-to-end tests have not been performed. The API seam has unit tests but is not a registered Azure Function. Mock client-side permission checks are demonstrative only and do not provide real privacy enforcement.

Initial npm installation could not use the environment's default cache; using `/tmp/yeeld-npm-cache` resolved it. The initial spreadsheet/build dependency audit issues were removed by replacing the spreadsheet dependency with fflate-based OOXML generation and updating Vite. No remaining installation, test or build blocker was observed.

## Version 0.2 update

16 tests pass, including lossless v1 draft migration, independent thematic notes through save/submit/reopen, project-specific report notes, and selected-month/project-note UI interactions. The version 0.2 ZIP was clean-extracted, installed, tested and built, then checked for HTTP startup on 5184 and refusal to use an occupied port. No actual Windows or live-service testing was performed.

## Version 0.3 identity clarity

The person’s full name is prominently labelled Sample identity beside the selected month, with a polite screen-reader announcement when changed. An added UI test verifies switching staff and changing month. No authentication or access-control claim has been added; the demo banner and production security limitations remain.
