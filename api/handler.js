/** Framework-neutral handler for a future Azure Functions HTTP trigger.
 * No deployed route, live authentication implementation or SharePoint access is provided.
 * authenticate MUST verify the platform/token trust boundary and return a principal.
 * Never accept roles/staffId from request JSON, query strings or untrusted identity headers.
 */
export function createApiHandler({ service, authenticate = async () => null }) {
  return async (request) => {
    const headers = {
      "content-type": "application/json",
      "cache-control": "no-store",
    };
    const response = (status, jsonBody) => ({ status, headers, jsonBody });
    const principal = await authenticate(request);
    if (!principal?.authenticated)
      return response(401, { error: "Authentication required." });
    try {
      const url = new URL(request.url);
      const path = url.pathname;
      if (request.method === "GET" && path === "/api/my-timesheet")
        return response(
          200,
          await service.read(
            principal,
            principal.staffId,
            Number(url.searchParams.get("year")),
            Number(url.searchParams.get("month")),
          ),
        );
      if (request.method === "PUT" && path === "/api/my-timesheet") {
        const body = await request.json();
        // Service enforces ownership even if the submitted record forges staffId.
        return response(
          200,
          await service.save(principal, body.record, body.action),
        );
      }
      if (request.method === "GET" && path === "/api/reports")
        return response(200, await service.report(principal));
      if (request.method === "POST" && path === "/api/reopen") {
        const body = await request.json();
        return response(
          200,
          await service.reopen(principal, body.key, body.revision),
        );
      }
      return response(404, { error: "Route not found." });
    } catch (error) {
      if (error.name === "SyntaxError")
        return response(400, { error: "Invalid JSON." });
      if (error.constructor.name === "DomainError") {
        const status = /permission|Access denied|Authentication/.test(
          error.message,
        )
          ? 403
          : /changed elsewhere/.test(error.message)
            ? 409
            : 400;
        return response(status, { error: error.message });
      }
      return response(500, { error: "Request failed." });
    }
  };
}
