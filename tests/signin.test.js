import test from 'node:test';
import assert from 'node:assert/strict';
import {establishSession,SIGNED_OUT} from '../src/signin.js';
const storage=value=>({getItem:key=>key===SIGNED_OUT?value:null});
function mock(accounts=[],active=null){return {calls:0,getActiveAccount:()=>active,getAllAccounts:()=>accounts,setActiveAccount:a=>{active=a;},ssoSilent:async function(){this.calls++;return {account:{id:'verified-by-msal'}};}};}
test('silent sign-in adopts the result once and reuses cached identity',async()=>{const client=mock();assert.equal((await establishSession(client,['scope'],storage(null))).id,'verified-by-msal');await establishSession(client,['scope'],storage(null));assert.equal(client.calls,1);});
test('explicit sign-out and multiple accounts do not trigger automatic login',async()=>{for(const client of [mock([], {id:'old'}),mock([{id:'one'},{id:'two'}])]){assert.equal(await establishSession(client,[],storage(client.getActiveAccount()?'true':null)),null);assert.equal(client.calls,0);}});
test('one cached account is reused and interactive requirements fall back without redirect loops',async()=>{const client=mock([{id:'one'}]);assert.equal((await establishSession(client,[],storage(null))).id,'one');assert.equal(client.calls,0);const failed=mock();failed.ssoSilent=async()=>{throw Error('interaction required');};assert.equal(await establishSession(failed,[],storage(null)),null);});
