const {test} = require('node:test');
const assert = require('node:assert/strict');
const Recovery = require('../.homeybuild/lib/SessionRecovery').default;
const VeSync = require('../.homeybuild/tsvesync/VeSync').default;
const ApiHelper = require('../.homeybuild/tsvesync/lib/ApiHelper').default;

function setup(session, credentials = () => ({username:'test', password:'hashed-test'})) {
    let clock = 0; const messages = [];
    const recovery = new Recovery(session, credentials, m=>messages.push(m), ()=>clock);
    return {recovery, messages, time:n=>{clock=n;}};
}

test('login recovers after booting without Internet and throttles repeated failures', async () => {
    let online=false, logged=false, attempts=0;
    const s=setup({isLoggedIn:()=>logged, getDevices:async()=>[], login:async()=>{
        attempts++; if(!online) throw new Error('network down'); logged=true;return true;
    }});
    await s.recovery.tick(); await s.recovery.tick(); assert.equal(attempts,1);
    s.time(60_000); await s.recovery.tick(); assert.equal(attempts,2);
    s.time(120_000); await s.recovery.tick(); assert.equal(attempts,2);
    online=true;s.time(180_000); await s.recovery.tick(); assert.equal(attempts,3);assert.equal(logged,true);
});

test('healthy sessions are checked every 15 minutes without logging in again', async () => {
    let checks=0, logins=0;
    const s=setup({isLoggedIn:()=>true,getDevices:async()=>{checks++;return[];},login:async()=>{logins++;return true;}});
    await s.recovery.tick();s.time(60_000);await s.recovery.tick();assert.equal(checks,1);
    s.time(900_000);await s.recovery.tick();assert.equal(checks,2);assert.equal(logins,0);
});

test('expired session is renewed and account errors back off for an hour', async () => {
    let logins=0;
    const s=setup({isLoggedIn:()=>true,getDevices:async()=>{throw new Error('token expired');},login:async()=>{logins++;return true;}});
    await s.recovery.tick();assert.equal(logins,1);
    let lockedAttempts=0;
    const locked=setup({isLoggedIn:()=>false,getDevices:async()=>[],login:async()=>{lockedAttempts++;throw new Error('account locked');}});
    await locked.recovery.tick();locked.time(900_000);await locked.recovery.tick();assert.equal(lockedAttempts,1);
    locked.time(3_600_000);await locked.recovery.tick();assert.equal(lockedAttempts,2);
    assert.ok(locked.messages.every(m=>!m.includes('hashed-test')));
});

test('concurrent checks cannot create overlapping authentication attempts', async () => {
    let release, attempts=0;
    const blocked=new Promise(resolve=>{release=resolve;});
    const s=setup({isLoggedIn:()=>false,getDevices:async()=>[],login:async()=>{attempts++;await blocked;return true;}});
    const first=s.recovery.tick();await s.recovery.tick();assert.equal(attempts,1);release();await first;
});

test('a failed device-list request preserves cached paired devices', async () => {
    const api=new VeSync();api.token='test-token';api.devices=[{test:'cached'}];
    const original=ApiHelper.callApi;
    ApiHelper.callApi=async()=>({code:-1,msg:'session expired'});
    try{await assert.rejects(api.getDevices(),/unavailable/);assert.deepEqual(api.getStoredDevice(),[{test:'cached'}]);}
    finally{ApiHelper.callApi=original;}
});

test('no saved credentials means no automatic login requests', async () => {
    let attempts=0;
    const s=setup({isLoggedIn:()=>false,getDevices:async()=>[],login:async()=>{attempts++;return true;}},()=>({username:'',password:''}));
    await s.recovery.tick();assert.equal(attempts,0);
});
