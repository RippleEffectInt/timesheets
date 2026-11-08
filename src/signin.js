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
