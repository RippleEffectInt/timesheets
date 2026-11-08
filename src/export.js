import { zipSync, strToU8 } from "fflate";
const xml = (value) =>
  String(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
function worksheet(rows) {
  return (
    declaration +
    `<worksheet xmlns="${ns}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>` +
    rows
      .map(
        (row, i) =>
          `<row r="${i + 1}">` +
          row
            .map((value, j) => {
              const ref = `${String.fromCharCode(65 + j)}${i + 1}`;
              if (value === null || value === undefined)
                return `<c r="${ref}"/>`;
              if (typeof value === "number" && Number.isFinite(value))
                return `<c r="${ref}"><v>${value}</v></c>`;
              // Inline strings cannot become formulas, including values beginning with =, +, - or @.
              return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
            })
            .join("") +
          "</row>",
      )
      .join("") +
    "</sheetData></worksheet>"
  );
}
/** Minimal standards-based OOXML workbook, ZIP compressed with fflate; no Excel import support. */
export const loggedRows = (rows) => rows.filter(row => Number.isFinite(row.hours) && row.hours > 0);
export async function createWorkbook(rows, filters, {demo = true} = {}) {
  const includedRows = loggedRows(rows);
  const columns = [
    ["Staff ID", "staffId"],
    ["Staff", "staff"],
    ["Project ID", "projectId"],
    ["Project", "project"],
    ["Calendar year", "year"],
    ["Month", "month"],
    ["Week start", "weekStart"],
    ["Week end", "weekEnd"],
    ["Hours", "hours"],
    ["Status", "status"],
    ["Project monthly notes", "notes"],
    ["Previous shared thematic notes", "legacyThematicNotes"],
    ["Financial year (July–June)", "financialYear"],
  ];
  const sheets = [
    [
      columns.map((c) => c[0]),
      ...includedRows.map((row) => columns.map((c) => row[c[1]])),
    ],
    [
      [demo ? "Ripple Effect Timesheets — FICTIONAL DEMO DATA" : "Ripple Effect Timesheets"],
      [demo ? "Sample data; simulated permissions." : "Exported from SharePoint timesheets."],
      ["Only rows with hours greater than zero are exported. Blank and zero-hour rows are omitted."],
      ["All statuses are included; Submitted is not approval."],
      ["Monthly notes repeat on weekly rows."],
      ["Filters", JSON.stringify(filters)],
      ["Exported at", new Date().toISOString()],
    ],
  ];
  const files = {
    "[Content_Types].xml":
      declaration +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    "_rels/.rels":
      declaration +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    "xl/workbook.xml":
      declaration +
      `<workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Timesheet entries" sheetId="1" r:id="rId1"/><sheet name="About this export" sheetId="2" r:id="rId2"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels":
      declaration +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>',
    "xl/worksheets/sheet1.xml": worksheet(sheets[0]),
    "xl/worksheets/sheet2.xml": worksheet(sheets[1]),
  };
  return zipSync(
    Object.fromEntries(
      Object.entries(files).map(([name, text]) => [name, strToU8(text)]),
    ),
  );
}
export async function downloadWorkbook(rows, filters, options = {}) {
  const bytes = await createWorkbook(rows, filters, options);
  const url = URL.createObjectURL(
    new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `ripple-effect-${options.yeeldOnly ? "yeeld" : "timesheets"}${options.demo === false ? "" : "-demo"}.xlsx`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
