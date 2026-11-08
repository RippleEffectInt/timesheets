# Upgrade to Ripple Effect Timesheets 0.2 on Windows

The download still has the filename **yeeld-timesheets-windows-preview.zip** because it updates the existing Library item. The app inside is now **Ripple Effect Timesheets**. The dedicated YEELD project section remains YEELD.

1. In the old app, **Save draft** for any unsaved changes. Then in its PowerShell window press **Ctrl+C** (if Windows asks to terminate the batch job, answer Y). Close the old browser tab.
2. Download the updated ZIP into Downloads, replacing the previous downloaded ZIP or renaming the new one to the exact filename above. Keep your old extracted source folder as a fallback; do not extract over it.
3. Open PowerShell. Use Node **24 LTS** (check `node --version`). Paste:

```powershell
$zip = Join-Path $HOME 'Downloads\yeeld-timesheets-windows-preview.zip'
$app = Join-Path $HOME 'Ripple-Effect-Timesheets-Preview-v02'
if (-not (Test-Path -LiteralPath $zip)) { throw "ZIP not found at $zip. Adjust the path if your Downloads folder is elsewhere." }
if (Test-Path -LiteralPath $app) { throw "This directory already exists. Choose a fresh directory name before extracting." }
Expand-Archive -LiteralPath $zip -DestinationPath $app
Set-Location -LiteralPath $app
if (-not (Test-Path -LiteralPath '.\package.json')) { throw 'package.json must be directly in this folder.' }
npm.cmd ci --ignore-scripts
if ($LASTEXITCODE -ne 0) { throw 'Installation failed; resolve it before continuing.' }
npm.cmd run dev
```

The ZIP has no enclosing folder: do not add an extra `timesheets` subdirectory. `npm.cmd ci` is the clean installation command and uses the included lockfile. `npm.cmd` avoids PowerShell script execution-policy issues. No execution-policy change is needed.

4. Open **http://127.0.0.1:5184/** in the **same browser and browser profile** used before. Refresh the page if needed. You should see Ripple Effect Timesheets and the selected month (initially November 2026). Do not switch to `localhost:5184`, a private window, or a different profile if you want your previous sample drafts.

## What happens to saved drafts

- Source extraction does not erase browser storage. Keep site data; do not clear it during this upgrade.
- The app intentionally retains the original storage key `yeeld-timesheets-demo-v1` and URL/port.
- Old records are read as schema v2 while preserving hours (including blank versus zero), status, revision and YEELD notes. Migration is stored when you save or reopen a record.
- Old shared thematic notes remain visible in **Previous shared thematic notes**, read-only. They are not copied into every project because that would falsely attribute them. Copy relevant portions into each project's new notes box if desired. They are also kept in a separate export column.
- Project notes remain independent when saving, submitting and reopening. Removing a project removes its hours and notes after confirmation.
- Once a record is saved in the new version, do not run the older app against this browser's migrated data; the old version does not understand schema v2. The old source folder is not a backup of browser data.

Port 5184 remains distinct from GPF's 5173. If it is busy, stop the old YEELD/Ripple server; the new server deliberately will not switch ports. To start this version again later:

```powershell
Set-Location -LiteralPath (Join-Path $HOME 'Ripple-Effect-Timesheets-Preview-v02')
npm.cmd run dev
```

Everything remains fictional sample data with simulated identities. No SharePoint lists or live Microsoft 365 connection are needed. Packaged installation, tests, build and HTTP startup were checked on Linux with Node 24.19.0; actual Windows/PowerShell execution was unavailable and is not claimed as tested.
