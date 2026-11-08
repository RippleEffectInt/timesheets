import { app } from "@azure/functions";
import { createLiveHandler } from "./live-handler.js";
const handler = createLiveHandler();
for (const route of ["bootstrap", "my-timesheet", "reports", "reopen"])
  app.http(route, {
    route,
    methods: ["GET", "PUT", "POST"],
    authLevel: "anonymous",
    handler,
  });
app.http("health", {
  route: "health",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: async () => ({
    jsonBody: {
      service: "Ripple Effect Timesheets",
      version: "0.4.0",
      authentication: "Microsoft bearer token required",
    },
    headers: { "Cache-Control": "no-store" },
  }),
});
