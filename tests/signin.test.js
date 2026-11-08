import test from 'node:test';
import assert from 'node:assert/strict';
import {establishSession,SIGNED_OUT} from '../src/signin.js';
const storage=value=>({getItem:key=>key===SIGNED_OUT?value:null});
function mock(accounts=[],active=null){return {calls:0,getActiveAccount:()=>active,getAllAccounts:()=>accounts,setActiveAccount:a=>{active=a;},ssoSilent:async function(){this.calls++;return {account:{id:'verified-by-msal'}};}};}
test('silent sign-in adopts the result once and reuses cached identity',async()=>{const client=mock();assert.equal((await establishSession(client,['scope'],storage(null))).id,'verified-by-msal');await establishSession(client,['scope'],storage(null));assert.equal(client.calls,1);});
test('explicit sign-out and multiple accounts do not trigger automatic login',async()=>{for(const client of [mock([], {id:'old'}),mock([{id:'one'},{id:'two'}])]){assert.equal(await establishSession(client,[],storage(client.getActiveAccount()?'true':null)),null);assert.equal(client.calls,0);}});
test('one cached account is reused and interactive requirements fall back without redirect loops',async()=>{const client=mock([{id:'one'}]);assert.equal((await establishSession(client,[],storage(null))).id,'one');assert.equal(client.calls,0);const failed=mock();failed.ssoSilent=async()=>{throw Error('interaction required');};assert.equal(await establishSession(failed,[],storage(null)),null);});

test('failed silent SSO redirects once per tab, without forcing account selection',async()=>{
 const {redirectIfNeeded,AUTO_REDIRECT_ATTEMPTED}=await import('../src/signin.js');
 const map=new Map();const storage={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};
 const client=mock();let calls=0;
 client.loginRedirect=async options=>{calls++;assert.deepEqual(options,{scopes:['api-scope']});assert.equal(map.get(AUTO_REDIRECT_ATTEMPTED),'true');};
 assert.equal(await redirectIfNeeded(client,['api-scope'],storage),true);
 assert.equal(await redirectIfNeeded(client,['api-scope'],storage),false);assert.equal(calls,1);
});
test('sign-out, existing identity, ambiguous accounts and unavailable storage suppress automatic redirects',async()=>{
 const {redirectIfNeeded}=await import('../src/signin.js');
 for(const [client,store] of [[mock(),storage('true')],[mock([],{id:'active'}),storage(null)],[mock([{id:'a'},{id:'b'}]),storage(null)],[mock(),{getItem:()=>null,setItem:()=>{throw Error('blocked')}}]]){
 client.loginRedirect=async()=>assert.fail('Unexpected automatic redirect');assert.equal(await redirectIfNeeded(client,[],store),false);
 }
});
test('redirect failure keeps the guard so refresh cannot loop',async()=>{
 const {redirectIfNeeded}=await import('../src/signin.js');const map=new Map();const store={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};const client=mock();let calls=0;client.loginRedirect=async()=>{calls++;throw Error('network failure');};
 assert.equal(await redirectIfNeeded(client,[],store),false);assert.equal(await redirectIfNeeded(client,[],store),false);assert.equal(calls,1);
});
