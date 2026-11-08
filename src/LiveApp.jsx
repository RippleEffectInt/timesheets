import React, { useEffect, useState } from "react";
import {
  PublicClientApplication,
  InteractionRequiredAuthError,
} from "@azure/msal-browser";
import { App } from "./App.jsx";
const tenant = "813ee105-1291-48e6-9381-e535253a68be";
const scopes = ["api://54b64b90-4ca1-463b-8290-8b285d5df68c/access_as_user"];
const client = new PublicClientApplication({
  auth: {
    clientId: "9595233b-3183-4568-8604-a194530e7fb6",
    authority: `https://login.microsoftonline.com/${tenant}`,
    redirectUri: window.location.origin + "/",
    postLogoutRedirectUri: window.location.origin + "/",
  },
  cache: { cacheLocation: "sessionStorage" },
});
const initialized = client
  .initialize()
  .then(() => client.handleRedirectPromise())
  .then((result) => {
    if (result?.account) client.setActiveAccount(result.account);
    else {
      const accounts = client.getAllAccounts();
      if (accounts.length === 1) client.setActiveAccount(accounts[0]);
    }
  });
export function LiveApp() {
  const [context, setContext] = useState(null),
    [error, setError] = useState(""),
    [ready, setReady] = useState(false),
    [service, setService] = useState(null);
  useEffect(() => {
    let active = true;
    async function start() {
      await initialized;
      if (!active) return;
      setReady(true);
      if (!client.getActiveAccount()) return;
      async function api(path, method = "GET", body) {
        let token;
        try {
          token = await client.acquireTokenSilent({
            scopes,
            account: client.getActiveAccount(),
          });
        } catch (e) {
          if (e instanceof InteractionRequiredAuthError) {
            await client.acquireTokenRedirect({
              scopes,
              account: client.getActiveAccount(),
            });
          }
          throw new Error("Please sign in again.");
        }
        const response = await fetch("/api/" + path, {
          method,
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${token.accessToken}`,
            "Content-Type": "application/json",
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        let result;
        try {
          result = await response.json();
        } catch {
          throw new Error(
            "The API is not available. Please contact your administrator.",
          );
        }
        if (!response.ok) throw new Error(result.error ?? "Request failed.");
        return result;
      }
      const data = await api("bootstrap");
      if (!active) return;
      setService({
        read: (_principal, _staff, year, month) =>
          api(`my-timesheet?year=${year}&month=${month}`),
        save: (_principal, record, action) =>
          api("my-timesheet", "PUT", { record, action }),
        report: () => api("reports"),
        reopen: (_principal, key, revision) =>
          api("reopen", "POST", { key, revision }),
      });
      setContext({ ...data, logout: () => client.logoutRedirect() });
    }
    start().catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, []);
  if (context && service)
    return <App service={service} liveContext={context} />;
  return (
    <main>
      <section className="card">
        <h1>Ripple Effect Timesheets</h1>
        <p>
          Sign in with your Ripple Effect Microsoft account to access your
          timesheet.
        </p>
        <p>No sample data is used on this site.</p>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        <button
          disabled={!ready}
          onClick={() =>
            client
              .loginRedirect({ scopes, prompt: "select_account" })
              .catch((e) => setError(e.message))
          }
        >
          {ready ? "Sign in with Microsoft" : "Preparing sign-in…"}
        </button>
        {ready && !error && client.getActiveAccount() && (
          <p>Checking your staff registration and SharePoint connection…</p>
        )}
      </section>
    </main>
  );
}
