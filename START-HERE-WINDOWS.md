# View Ripple Effect Timesheets on Windows

This is **fictional sample data only**, with simulated people and permissions. No SharePoint lists or Microsoft 365 account are needed. Do not enter real staff data. Nothing is deployed.

**Already running the previous ZIP? Follow UPGRADE-WINDOWS.md instead.**

## 1. Install Node.js

Install **Node.js 24 LTS for Windows** from the official Node.js website (https://nodejs.org/), accepting the npm component. Close and reopen PowerShell after installation. Check:

```powershell
node --version
npm.cmd --version
```

Node must report `v24.x.x` (this package was tested with `v24.19.0`). Use `npm.cmd` below to avoid PowerShell execution-policy errors with npm.ps1; no execution-policy change is needed.

## 2. Download and extract

Save the attached ZIP as **yeeld-timesheets-windows-preview.zip** in your Windows Downloads folder. If your browser adds a suffix such as `(1)`, rename it to the exact name first. Paste this into PowerShell:

```powershell
$zip = Join-Path $HOME 'Downloads\yeeld-timesheets-windows-preview.zip'
$app = Join-Path $HOME 'YEELD-Timesheets-Preview'
if (-not (Test-Path -LiteralPath $zip)) { throw "ZIP not found: $zip. Update the path if your Downloads folder is elsewhere." }
if (Test-Path -LiteralPath $app) { throw "Choose a new empty extraction directory: $app already exists." }
Expand-Archive -LiteralPath $zip -DestinationPath $app
Set-Location -LiteralPath $app
if (-not (Test-Path -LiteralPath '.\package.json')) { throw 'package.json should be directly in this directory. Check extraction.' }
npm.cmd ci --ignore-scripts
if ($LASTEXITCODE -ne 0) { throw 'Package installation failed; do not continue until it succeeds.' }
npm.cmd run dev
```

The ZIP has **no enclosing folder**: `package.json` and this guide will sit directly inside `$HOME\YEELD-Timesheets-Preview`. Do not create another `timesheets` subfolder. Installation needs internet access for public npm packages; the running demo uses local sample data only.

## 3. Open the app

Open **http://127.0.0.1:5184/** in your browser. Leave the PowerShell window running. Port **5184** is fixed and separate from GPF on **5173**. If 5184 is already busy, stop the previous YEELD preview; this app will not silently use another port.

- Start on November 2026. Alex demonstrates both YEELD and thematic membership.
- Save a draft, reload it, then submit when ready. Submitted is a status, not manager approval.
- Choose a **simulated permission** to try reporting, XLSX export or reopen controls. October has submitted sample records.
- All saved records remain only in this browser/profile at this origin. Keep using the same URL to see prior saves.
- Press **Ctrl+C** in PowerShell to stop. To reopen later:

```powershell
Set-Location -LiteralPath (Join-Path $HOME 'YEELD-Timesheets-Preview')
npm.cmd run dev
```

Optional checks, from that directory while the server is stopped:

```powershell
npm.cmd test
npm.cmd run build
```

## What was checked

The exact packaged source was extracted into a clean directory, installed with `npm ci --ignore-scripts`, tested, built and served at port 5184 in the Linux Codex environment using Node 24.19.0. HTTP startup and fixed-port behavior were checked. The Windows commands use standard PowerShell syntax, but **Windows/PowerShell execution was not available and has not been tested**. No live Microsoft 365 connection, production security or deployment is implied.

Further technical details are in README.md and docs/INTEGRATION.md. SharePoint lists are confirmed not yet created and are unnecessary for this preview.
