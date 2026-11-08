import { createRemoteJWKSet, customFetch } from "jose";
import { TENANT } from "./config.js";
const address = `https://login.microsoftonline.com/${TENANT}/discovery/v2.0/keys`;
const failure = (code) =>
  Object.assign(new Error("Signing-key retrieval failed."), { code });
// Return categories only, never upstream messages, URLs, bodies or tokens.
export function networkCode(error) {
  const code = error?.cause?.code ?? error?.code;
  if (["ENOTFOUND", "EAI_AGAIN"].includes(code)) return "AUTH_KEYS_DNS";
  if (
    [
      "CERT_HAS_EXPIRED",
      "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
      "SELF_SIGNED_CERT_IN_CHAIN",
      "DEPTH_ZERO_SELF_SIGNED_CERT",
      "ERR_TLS_CERT_ALTNAME_INVALID",
    ].includes(code)
  )
    return "AUTH_KEYS_TLS";
  if (
    ["TimeoutError", "AbortError"].includes(error?.name) ||
    [
      "ETIMEDOUT",
      "UND_ERR_CONNECT_TIMEOUT",
      "UND_ERR_HEADERS_TIMEOUT",
    ].includes(code)
  )
    return "AUTH_KEYS_TIMEOUT";
  return "AUTH_KEYS_NETWORK";
}
export function createSigningKeys(fetcher = fetch) {
  return createRemoteJWKSet(new URL(address), {
    [customFetch]: async (url, options) => {
      if (url !== address) throw failure("AUTH_KEYS_ADDRESS");
      let response;
      try {
        response = await fetcher(url, options);
      } catch (error) {
        throw failure(networkCode(error));
      }
      if (response.status !== 200)
        throw failure(
          response.status === 403
            ? "AUTH_KEYS_FORBIDDEN"
            : response.status === 429
              ? "AUTH_KEYS_THROTTLED"
              : "AUTH_KEYS_HTTP",
        );
      // Validate a clone so jose still receives the untouched response.
      let data;
      try {
        data = await response.clone().json();
      } catch {
        throw failure("AUTH_KEYS_JSON");
      }
      if (!Array.isArray(data?.keys) || !data.keys.length)
        throw failure("AUTH_KEYS_FORMAT");
      return response;
    },
  });
}
