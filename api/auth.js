import { createRemoteJWKSet, jwtVerify } from "jose";
import { TENANT, CLIENT, SPA, HttpError } from "./config.js";
const keys = createRemoteJWKSet(
  new URL(`https://login.microsoftonline.com/${TENANT}/discovery/v2.0/keys`),
);
export async function authenticate(request, keySet = keys) {
  const authorization = request.headers.get("authorization") ?? "";
  if (!/^Bearer [^\s]+$/i.test(authorization))
    throw new HttpError(401, "Sign in with your Ripple Effect account.");
  try {
    const { payload: p } = await jwtVerify(authorization.slice(7), keySet, {
      algorithms: ["RS256"],
      issuer: [
        `https://login.microsoftonline.com/${TENANT}/v2.0`,
        `https://sts.windows.net/${TENANT}/`,
      ],
      audience: [CLIENT, `api://${CLIENT}`],
      requiredClaims: ["exp", "iat", "nbf", "oid", "tid", "scp"],
      clockTolerance: 5,
    });
    const v2 = p.ver === "2.0";
    if (
      (!v2 && p.ver !== "1.0") ||
      p.tid !== TENANT ||
      p.iss !==
        (v2
          ? `https://login.microsoftonline.com/${TENANT}/v2.0`
          : `https://sts.windows.net/${TENANT}/`) ||
      p.aud !== (v2 ? CLIENT : `api://${CLIENT}`) ||
      (v2 ? p.azp : p.appid) !== SPA ||
      typeof p.scp !== "string" ||
      !p.scp.split(" ").includes("access_as_user") ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        p.oid,
      )
    )
      throw new Error("Invalid claims");
    return { oid: p.oid.toLowerCase(), tid: p.tid };
  } catch {
    throw new HttpError(
      401,
      "Your sign-in could not be verified. Please sign in again.",
    );
  }
}
