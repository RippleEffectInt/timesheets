import test from "node:test";
import assert from "node:assert/strict";
import { unzipSync, strFromU8 } from "fflate";
import { JSDOM } from "jsdom";
import { createWorkbook } from "../src/export.js";
test("export is genuine OOXML ZIP with positive hours only and safe text", async () => {
  const bytes = await createWorkbook(
    [
      {
        staff: '=HYPERLINK("bad")',
        hours: 2.5,
        notes: "+SUM(1,2) & <example>\nSecond line",
      },
      { staff: "Blank omitted", hours: null },
      { staff: "Zero omitted", hours: 0 },
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
  assert.equal(doc.querySelector('c[r="I2"] v').textContent, "2.5");
  assert.equal(doc.querySelectorAll("sheetData row").length, 2);
  assert.doesNotMatch(doc.documentElement.textContent, /Blank omitted|Zero omitted/);
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

test('empty exports retain headings and live exports do not claim fictional data',async()=>{
 const files=unzipSync(await createWorkbook([{hours:0},{hours:null}],{}, {demo:false}));
 const doc=new JSDOM(strFromU8(files['xl/worksheets/sheet1.xml']),{contentType:'text/xml'}).window.document;
 assert.equal(doc.querySelectorAll('sheetData row').length,1);
 assert.doesNotMatch(strFromU8(files['xl/worksheets/sheet2.xml']),/FICTIONAL/);
});
