export const SIGNED_OUT = 'timesheets-explicit-signout';
/** One silent attempt per page load. Account ambiguity always requires a choice. */
export async function establishSession(client, scopes, storage) {
  if(storage.getItem(SIGNED_OUT)==='true') return null;
  const current=client.getActiveAccount();
  if(current)return current;
  const accounts=client.getAllAccounts();
  if(accounts.length>1)return null;
  if(accounts.length===1){client.setActiveAccount(accounts[0]);return accounts[0];}
  try {
    const result=await client.ssoSilent({scopes});
    if(result?.account){client.setActiveAccount(result.account);return result.account;}
  } catch { /* MFA, cookie restrictions or no session: show the normal sign-in button. */ }
  return null;
}

export const AUTO_REDIRECT_ATTEMPTED = 'timesheets-auto-redirect-attempted';
/** Persist before leaving the page; returning or refreshing cannot restart the redirect. */
export async function redirectIfNeeded(client, scopes, storage) {
  if(client.getActiveAccount() || client.getAllAccounts().length > 1) return false;
  try {
    if(storage.getItem(SIGNED_OUT)==='true' || storage.getItem(AUTO_REDIRECT_ATTEMPTED)==='true') return false;
    storage.setItem(AUTO_REDIRECT_ATTEMPTED,'true');
  } catch { return false; } // Without reliable storage, require an explicit click.
  try {
    // No select_account prompt: reuse the work session when Microsoft permits it.
    await client.loginRedirect({scopes});
    return true;
  } catch { return false; } // Keep the guard and offer the manual button.
}
