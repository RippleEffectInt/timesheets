import { TENANT, CLIENT, SITE, LISTS, HttpError } from "./config.js";
export function createGraph({ fetcher = fetch, env = process.env } = {}) {
  let cached;
  const base = `https://graph.microsoft.com/v1.0/sites/${SITE}/lists/`;
  async function token() {
    if (
      env.TIMESHEETS_TENANT_ID !== TENANT ||
      env.TIMESHEETS_CLIENT_ID !== CLIENT ||
      !env.TIMESHEETS_CLIENT_SECRET
    )
      throw new HttpError(
        503,
        "The API connection settings are incomplete. Contact your administrator.",
      );
    if (cached?.expires > Date.now() + 60000) return cached.value;
    const result = await fetcher(
      `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        signal: AbortSignal.timeout(15000),
        body: new URLSearchParams({
          client_id: CLIENT,
          client_secret: env.TIMESHEETS_CLIENT_SECRET,
          scope: "https://graph.microsoft.com/.default",
          grant_type: "client_credentials",
        }),
      },
    );
    if (!result.ok)
      throw new HttpError(
        503,
        "The API could not authenticate its SharePoint connection.",
      );
    const data = await result.json();
    if (!data.access_token)
      throw new HttpError(503, "The API connection returned no token.");
    cached = {
      value: data.access_token,
      expires: Date.now() + Number(data.expires_in) * 1000,
    };
    return cached.value;
  }
  function allowed(url) {
    return Object.values(LISTS).some((id) => url.startsWith(`${base}${id}/`));
  }
  async function request(url, options = {}) {
    if (!allowed(url))
      throw new HttpError(502, "Unexpected SharePoint response address.");
    const result = await fetcher(url, {
      ...options,
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${await token()}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
    if (!result.ok) {
      if ([409, 412].includes(result.status))
        throw new HttpError(
          409,
          "This timesheet changed elsewhere. Reload before saving.",
        );
      throw new HttpError(
        502,
        `SharePoint request failed (${result.status}). Check the list configuration and application permissions.`,
      );
    }
    return result.status === 204 ? null : result.json();
  }
  async function all(list, suffix = "items?$expand=fields") {
    let url = `${base}${LISTS[list]}/${suffix}`,
      rows = [],
      seen = new Set();
    while (url) {
      if (seen.has(url) || seen.size >= 1000)
        throw new HttpError(502, "SharePoint pagination could not complete.");
      seen.add(url);
      const data = await request(url);
      if (!Array.isArray(data.value))
        throw new HttpError(502, "Unexpected SharePoint response.");
      rows.push(...data.value);
      url = data["@odata.nextLink"];
    }
    return rows;
  }
  return {
    all,
    request,
    url: (list, suffix) => `${base}${LISTS[list]}/${suffix}`,
  };
}
