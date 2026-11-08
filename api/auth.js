import { jwtVerify } from "jose";
import { createSigningKeys } from "./signing-keys.js";
import { TENANT, CLIENT, SPA, HttpError } from "./config.js";
const keys = createSigningKeys();
export async function authenticate(request, keySet = keys) {
  const authorization = request.headers.get("x-timesheets-authorization") ?? "";
  if (!/^Bearer [^\s]+$/i.test(authorization))
    throw new HttpError(401, "Sign in with your Ripple Effect account.");
  try {
    if (!globalThis.crypto?.subtle)
      throw Object.assign(new Error("WebCrypto unavailable"), {
        code: "AUTH_CRYPTO_UNAVAILABLE",
      });
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
    const checks = [
      [v2 || p.ver === "1.0", "AUTH_VERSION"],
      [p.tid === TENANT, "AUTH_TENANT"],
      [
        p.iss ===
          (v2
            ? `https://login.microsoftonline.com/${TENANT}/v2.0`
            : `https://sts.windows.net/${TENANT}/`),
        "AUTH_ISSUER",
      ],
      [!v2 || p.aud === CLIENT, "AUTH_AUDIENCE"],
      [(v2 ? p.azp : p.appid) === SPA, "AUTH_CLIENT"],
      [
        typeof p.scp === "string" &&
          p.scp.split(" ").includes("access_as_user"),
        "AUTH_SCOPE",
      ],
      [
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          p.oid,
        ),
        "AUTH_IDENTITY",
      ],
    ];
    const failed = checks.find(([valid]) => !valid);
    if (failed)
      throw Object.assign(new Error("Invalid claims"), { code: failed[1] });
    return { oid: p.oid.toLowerCase(), tid: p.tid };
  } catch (error) {
    // Fixed diagnostic codes only: never return token contents or upstream errors.
    const code =
      error.code === "ERR_JWT_CLAIM_VALIDATION_FAILED"
        ? ({
            aud: "AUTH_AUDIENCE",
            iss: "AUTH_ISSUER",
            scp: "AUTH_SCOPE",
            nbf: "AUTH_TIME",
          }[error.claim] ?? "AUTH_REQUIRED_CLAIM")
        : ({
            ERR_JWT_EXPIRED: "AUTH_EXPIRED",
            ERR_JWS_INVALID: "AUTH_TOKEN_FORMAT",
            ERR_JWT_INVALID: "AUTH_TOKEN_FORMAT",
            ERR_JOSE_ALG_NOT_ALLOWED: "AUTH_ALGORITHM",
            ERR_JOSE_NOT_SUPPORTED: "AUTH_UNSUPPORTED",
            ERR_JWK_INVALID: "AUTH_KEY_INVALID",
            ERR_JWKS_INVALID: "AUTH_KEYS_FORMAT",
            ERR_JWKS_MULTIPLE_MATCHING_KEYS: "AUTH_KEY_AMBIGUOUS",
            ERR_JOSE_GENERIC: "AUTH_KEY_RESPONSE",
            AUTH_CRYPTO_UNAVAILABLE: "AUTH_CRYPTO_UNAVAILABLE",
            AUTH_KEYS_DNS: "AUTH_KEYS_DNS",
            AUTH_KEYS_TLS: "AUTH_KEYS_TLS",
            AUTH_KEYS_TIMEOUT: "AUTH_KEYS_TIMEOUT",
            AUTH_KEYS_NETWORK: "AUTH_KEYS_NETWORK",
            AUTH_KEYS_ADDRESS: "AUTH_KEYS_ADDRESS",
            AUTH_KEYS_FORBIDDEN: "AUTH_KEYS_FORBIDDEN",
            AUTH_KEYS_THROTTLED: "AUTH_KEYS_THROTTLED",
            AUTH_KEYS_HTTP: "AUTH_KEYS_HTTP",
            AUTH_KEYS_JSON: "AUTH_KEYS_JSON",
            AUTH_KEYS_FORMAT: "AUTH_KEYS_FORMAT",
            ERR_JWS_SIGNATURE_VERIFICATION_FAILED: "AUTH_SIGNATURE",
            ERR_JWKS_TIMEOUT: "AUTH_KEYS_TIMEOUT",
            ERR_JWKS_NO_MATCHING_KEY: "AUTH_KEY_NOT_FOUND",
            AUTH_VERSION: "AUTH_VERSION",
            AUTH_TENANT: "AUTH_TENANT",
            AUTH_ISSUER: "AUTH_ISSUER",
            AUTH_AUDIENCE: "AUTH_AUDIENCE",
            AUTH_CLIENT: "AUTH_CLIENT",
            AUTH_SCOPE: "AUTH_SCOPE",
            AUTH_IDENTITY: "AUTH_IDENTITY",
          }[error.code] ??
          {
            ReferenceError: "AUTH_RUNTIME_REFERENCE",
            TypeError: "AUTH_RUNTIME_TYPE",
            NotSupportedError: "AUTH_CRYPTO_UNSUPPORTED",
            DataError: "AUTH_CRYPTO_DATA",
            OperationError: "AUTH_CRYPTO_OPERATION",
          }[error.name] ??
          "AUTH_VERIFICATION");
    throw new HttpError(
      401,
      `Your sign-in could not be verified (${code}). Please report this code to your administrator.`,
    );
  }
}
