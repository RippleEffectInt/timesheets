import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { build } from "esbuild";
import React from "react";
import { MemoryRepository } from "../src/repository.js";
import { createService } from "../src/service.js";
import { staff, projects, seedRecords } from "../src/fixtures.js";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost",
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.confirm = () => true;
await build({
  entryPoints: ["src/App.jsx"],
  outfile: "node_modules/.cache/app-ui-test.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  logLevel: "silent",
});
const { App } = await import("../node_modules/.cache/app-ui-test.mjs");
const { render, screen, fireEvent, waitFor, cleanup } = await import(
  "@testing-library/react"
);
test("entry screen restores, saves, submits, changes memberships and filters reports", async () => {
  const repo = new MemoryRepository(seedRecords());
  const service = createService(repo, staff, projects);
  render(React.createElement(App, { service }));
  await screen.findByLabelText("YEELD monthly notes");
  assert(screen.getByRole("heading", { name: "Thematic projects" }));
  const picker = screen.getByLabelText("Add active project");
  assert(![...picker.options].some((o) => o.value === "project-yeeld"));
  const input = screen.getByLabelText("YEELD hours 2026-11-01 to 2026-11-01");
  fireEvent.change(input, { target: { value: "0" } });
  fireEvent.change(screen.getByLabelText("YEELD monthly notes"), {
    target: { value: "Updated demo notes" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await screen.findByText("Draft saved on this browser.");
  assert.equal(
    (await repo.get("demo-alex:2026-11")).entries[0].hours["2026-11-01"],
    0,
  );
  fireEvent.click(screen.getByRole("button", { name: "Reload saved" }));
  await waitFor(() =>
    assert.equal(
      screen.getByLabelText("YEELD monthly notes").value,
      "Updated demo notes",
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Submit month" }));
  await screen.findByText(
    "Timesheet submitted. This is a status, not manager approval.",
  );
  assert(screen.getByLabelText("YEELD monthly notes").disabled);
  fireEvent.change(screen.getByLabelText("Simulated person"), {
    target: { value: "demo-morgan" },
  });
  await waitFor(() => assert(screen.getByLabelText("YEELD monthly notes")));
  assert.equal(
    screen.queryByRole("heading", { name: "Thematic projects" }),
    null,
  );
  fireEvent.change(screen.getByLabelText("Simulated person"), {
    target: { value: "demo-jamie" },
  });
  await screen.findByLabelText("Community learning monthly notes");
  assert.equal(screen.queryByLabelText("YEELD monthly notes"), null);
  fireEvent.change(screen.getByLabelText("Simulated permission"), {
    target: { value: "reporter" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Reporting" }));
  await screen.findByRole("heading", { name: "Weekly detail" });
  await waitFor(() =>
    assert(!screen.getByRole("button", { name: "Export XLSX" }).disabled),
  );
  fireEvent.change(screen.getByLabelText("Staff"), {
    target: { value: "demo-morgan" },
  });
  await waitFor(() =>
    assert.equal(screen.queryByRole("cell", { name: "Jamie Brook" }), null),
  );
  assert(screen.getAllByRole("cell", { name: "Morgan Vale" }).length > 0);
  cleanup();
});

test("month heading updates and separate project note inputs retain their own text", async () => {
  const repo = new MemoryRepository(seedRecords());
  render(
    React.createElement(App, { service: createService(repo, staff, projects) }),
  );
  await screen.findByLabelText("Community learning monthly notes");
  assert(screen.getByRole("heading", { name: "November 2026" }));
  assert(screen.getByText("Add a thematic project"));
  fireEvent.change(screen.getByLabelText("Add active project"), {
    target: { value: "project-pathways" },
  });
  fireEvent.change(screen.getByLabelText("Community learning monthly notes"), {
    target: { value: "Learning note" },
  });
  fireEvent.change(screen.getByLabelText("Youth pathways monthly notes"), {
    target: { value: "Pathways note" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await screen.findByText("Draft saved on this browser.");
  fireEvent.click(screen.getByRole("button", { name: "Reload saved" }));
  await waitFor(() =>
    assert.equal(
      screen.getByLabelText("Youth pathways monthly notes").value,
      "Pathways note",
    ),
  );
  assert.equal(
    screen.getByLabelText("Community learning monthly notes").value,
    "Learning note",
  );
  fireEvent.change(screen.getByLabelText("Month"), { target: { value: "12" } });
  await screen.findByRole("heading", { name: "December 2026" });
  cleanup();
});

test("prominent sample identity follows staff switches and stays alongside the selected month", async () => {
  const repo = new MemoryRepository(seedRecords());
  render(
    React.createElement(App, { service: createService(repo, staff, projects) }),
  );
  await screen.findByLabelText("YEELD monthly notes");
  const owner = screen.getByLabelText("Timesheet owner and period");
  assert.match(owner.textContent, /Sample identity/);
  assert.match(owner.textContent, /Alex Rowan/);
  assert.match(owner.textContent, /November 2026/);
  fireEvent.change(screen.getByLabelText("Simulated person"), {
    target: { value: "demo-morgan" },
  });
  await waitFor(() => assert.match(owner.textContent, /Morgan Vale/));
  assert.doesNotMatch(owner.textContent, /Alex Rowan/);
  fireEvent.change(screen.getByLabelText("Simulated person"), {
    target: { value: "demo-jamie" },
  });
  await waitFor(() => assert.match(owner.textContent, /Jamie Brook/));
  assert.doesNotMatch(owner.textContent, /Morgan Vale/);
  fireEvent.change(screen.getByLabelText("Month"), { target: { value: "12" } });
  await waitFor(() => assert.match(owner.textContent, /December 2026/));
  assert.match(owner.textContent, /Jamie Brook/);
  assert.match(
    screen.getByText(/Production requires verified server identity/)
      .textContent,
    /access controls/,
  );
  cleanup();
});
