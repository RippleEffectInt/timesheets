import test from "node:test";
import assert from "node:assert/strict";
import { unzipSync, strFromU8 } from "fflate";
import { JSDOM } from "jsdom";
import { createWorkbook } from "../src/export.js";
test("export is genuine OOXML ZIP with numeric zero, empty blank and safe text", async () => {
  const bytes = await createWorkbook(
    [
      {
        staff: '=HYPERLINK("bad")',
        hours: 0,
        notes: "+SUM(1,2) & <example>\nSecond line",
      },
      { staff: "Example", hours: null },
    ],
    { month: "11" },
  );
  assert.equal(Buffer.from(bytes).subarray(0, 2).toString(), "PK");
  const files = unzipSync(bytes);
  for (const content of Object.values(files))
    assert.doesNotThrow(
      () => new JSDOM(strFromU8(content), { contentType: "text/xml" }),
    );
  const doc = new JSDOM(strFromU8(files["xl/worksheets/sheet1.xml"]), {
    contentType: "text/xml",
  }).window.document;
  assert.equal(doc.querySelector('c[r="I2"] v').textContent, "0");
  assert.equal(doc.querySelector('c[r="I3"]').children.length, 0);
  assert.equal(doc.querySelector('c[r="B2"]').getAttribute("t"), "inlineStr");
  assert.equal(
    doc.querySelector('c[r="K2"] t').textContent,
    "+SUM(1,2) & <example>\nSecond line",
  );
  assert.equal(doc.querySelectorAll("f").length, 0);
  assert.match(strFromU8(files["xl/worksheets/sheet2.xml"]), /FICTIONAL/);
  assert.match(
    strFromU8(files["[Content_Types].xml"]),
    /spreadsheetml.sheet.main/,
  );
});
