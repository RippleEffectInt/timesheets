import { authenticate } from "./auth.js";
import { createGraph } from "./graph.js";
import { HttpError } from "./config.js";
import {
  mapStaff,
  mapProjects,
  resolvePrincipal,
  inspectSchema,
  createSharePointRepository,
  publicStaff,
} from "./sharepoint-repository.js";
import { createService } from "./shared/service.js";
import { periodKey } from "./shared/domain.js";
export function createLiveHandler({
  verify = authenticate,
  graph = createGraph(),
  env = process.env,
} = {}) {
  return async (request) => {
    const headers = {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    };
    const response = (status, jsonBody) => ({ status, headers, jsonBody });
    try {
      const identity = await verify(request);
      const path = new URL(request.url).pathname;
      const routes = {
        "/api/bootstrap": "GET",
        "/api/my-timesheet": ["GET", "PUT"],
        "/api/reports": "GET",
        "/api/reopen": "POST",
      };
      if (![routes[path]].flat().includes(request.method))
        return response(404, { error: "Route not found." });
      const staff = (await graph.all("staff")).map(mapStaff);
      const principal = resolvePrincipal(identity, staff);
      const admin = principal.permissions.includes("report:read");
      if ((path === "/api/reports" || path === "/api/reopen") && !admin)
        throw new HttpError(403, "Administrator permission required.");
      const writeEnabled = env.TIMESHEETS_WRITE_ENABLED === "true";
      if (["PUT", "POST"].includes(request.method) && !writeEnabled)
        throw new HttpError(
          403,
          "Saving is disabled during the read-only connection check.",
        );
      let body;
      if (["PUT", "POST"].includes(request.method)) {
        const raw = await request.text();
        if (raw.length > 200000)
          throw new HttpError(413, "Timesheet request is too large.");
        try {
          body = JSON.parse(raw);
        } catch {
          throw new HttpError(400, "Invalid JSON.");
        }
        if (!body || typeof body !== "object" || Array.isArray(body))
          throw new HttpError(400, "A JSON object is required.");
        if (
          path === "/api/my-timesheet" &&
          (!body.record ||
            typeof body.record !== "object" ||
            Array.isArray(body.record))
        )
          throw new HttpError(400, "A timesheet record is required.");
        if (
          path === "/api/reopen" &&
          (typeof body.key !== "string" ||
            !Number.isInteger(body.revision) ||
            body.revision < 1)
        )
          throw new HttpError(
            400,
            "A timesheet key and revision are required.",
          );
      }
      const schemas = await inspectSchema(graph);
      const projects = mapProjects(await graph.all("projects"));
      if (path === "/api/bootstrap")
        return response(200, {
          principal,
          staff: (admin
            ? staff
            : staff.filter((s) => s.id === principal.staffId)
          ).map(publicStaff),
          projects,
          writeEnabled,
          financialYears:
            schemas.timesheets.Reporting_x0020_Year.choice?.choices ?? null,
        });
      const repository = createSharePointRepository(
        graph,
        staff,
        schemas.timesheets,
        { writeEnabled },
      );
      const service = createService(repository, staff, projects);
      if (path === "/api/my-timesheet") {
        if (request.method === "GET") {
          const params = new URL(request.url).searchParams,
            year = Number(params.get("year")),
            month = Number(params.get("month"));
          periodKey(year, month);
          return response(
            200,
            await service.read(principal, principal.staffId, year, month),
          );
        }
        return response(
          200,
          await service.save(principal, body.record, body.action),
        );
      }
      if (path === "/api/reports")
        return response(200, await service.report(principal));
      return response(
        200,
        await service.reopen(principal, body.key, body.revision),
      );
    } catch (error) {
      if (error instanceof HttpError)
        return response(error.status, { error: error.message });
      if (error.constructor.name === "DomainError")
        return response(
          /permission|Access denied|Authentication/.test(error.message)
            ? 403
            : 400,
          { error: error.message },
        );
      return response(500, {
        error:
          "The request could not complete. Reload before retrying; a save may have completed.",
      });
    }
  };
}
