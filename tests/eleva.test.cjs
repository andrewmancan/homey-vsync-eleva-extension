const {test} = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const Eleva = require('../.homeybuild/tsvesync/devices/purifier/Eleva300X').default;
const ApiHelper = require('../.homeybuild/tsvesync/lib/ApiHelper').default;
const DeviceTypeManager = require('../.homeybuild/tsvesync/DeviceTypeManager').default;

// Synthetic values in the real response shape documented by pyvesync PR #546.
const fixture = () => ({powerSwitch: 1, workMode: 'auto', manualSpeedLevel: 3,
    fanSpeedLevel: 255, PM1: 2, PM25: 4, PM10: 6, filterLifePercent: 81,
    carbonFilterLifePercent: 63, screenSwitch: 1, childLockSwitch: 0});
const response = (raw) => ({code: 0, msg: 'request success', result: {code: 0, result: raw}});
const identity = {deviceType: 'LAP-C341S-WUSZ', uuid: 'TEST-UUID', cid: 'TEST-CID',
    macID: 'TEST-MAC', configModule: 'TEST-CONFIG', deviceRegion: 'US'};
const api = {getRegion: () => 'US', getTimeZone: () => 'America/Toronto',
    getToken: () => 'TEST-TOKEN', getAccountID: () => 'TEST-ACCOUNT', getUserCountryCode: () => 'CA'};

test('discovers the exact Eleva model without claiming unrelated models', async () => {
    const manager = new DeviceTypeManager(); await manager.loadDevices();
    assert.equal(manager.getDevice(identity.deviceType), Eleva);
    assert.equal(Eleva.hasModel('LAP-C341S-UNKNOWN'), false);
});

test('keeps all three particulate channels and the two filter lives distinct', () => {
    const s = Eleva.parseStatus(fixture());
    assert.deepEqual([s.pm1, s.pm25, s.pm10, s.hepaLife, s.carbonLife], [2,4,6,81,63]);
    assert.equal(s.actualLevel, null); assert.equal(s.manualLevel, 3);
});

test('missing or invalid sensors stay unknown, while genuine zero remains zero', () => {
    const s = Eleva.parseStatus({...fixture(), PM1: undefined, PM25: 0, PM10: 'bad', carbonFilterLifePercent: 101});
    assert.deepEqual([s.pm1,s.pm25,s.pm10,s.carbonLife], [null,0,null,null]);
    assert.throws(() => Eleva.parseStatus({PM25: 0}), /power state/);
});

test('uses documented bypassV2 payloads; Turbo is manual speed 4', async () => {
    const original = ApiHelper.callApi; const calls = [];
    ApiHelper.callApi = async (_api, path, method, body) => {
        calls.push({path,method,body}); return response({});
    };
    try {
        const d = new Eleva(api, identity);
        await d.setSwitch(true); await d.setLevel(4); await d.setPurifierMode('sleep');
        await d.setDisplay(false); await d.setChildLock(true);
        for (const call of calls) {
            assert.equal(call.path, '/cloud/v2/deviceManaged/bypassV2');
            assert.equal(call.method, 'post'); assert.equal(call.body.cid, identity.cid);
            assert.equal(call.body.configModule, identity.configModule);
        }
        assert.deepEqual(calls.map(c => c.body.payload), [
            {method:'setSwitch',source:'APP',data:{powerSwitch:1,switchIdx:0}},
            {method:'setLevel',source:'APP',data:{levelIdx:0,levelType:'wind',manualSpeedLevel:4}},
            {method:'setPurifierMode',source:'APP',data:{workMode:'sleep'}},
            {method:'setDisplay',source:'APP',data:{screenSwitch:0}},
            {method:'setChildLock',source:'APP',data:{childLockSwitch:1}},
        ]);
        await assert.rejects(d.setLevel(255)); await assert.rejects(d.setLevel(2.5));
        await assert.rejects(d.setPurifierMode('turbo')); assert.equal(calls.length,5);
    } finally { ApiHelper.callApi = original; }
});

test('rejects nested API errors instead of reporting a successful command', async () => {
    const d = new Eleva(api, identity);
    d.post = async () => ({code:0,msg:'request success',result:{code:-1,result:{}}});
    await assert.rejects(d.setSwitch(true), /request failed/);
    d.post = async () => ({code:0,msg:'request success',result:{code:0,result:{code:-2}}});
    await assert.rejects(d.setLevel(4), /request failed/);
});

class FakeHomeyDevice {
    constructor() {
        this.values = new Map(); this.listeners = {}; this.available = true; this.events = [];
        this.homey = {app:{}, __:(s)=>s, setInterval:(fn)=>{this.tick=fn;return 1;}, clearInterval:()=>{},
            flow:{getDeviceTriggerCard:(id)=>({trigger:async(_dev,tokens,state)=>this.events.push({id,tokens,state})})}};
    }
    hasCapability() {return true;}
    registerCapabilityListener(id,fn) {this.listeners[id]=fn;}
    async triggerCapabilityListener(id,value) {return this.listeners[id](value);}
    async setCapabilityValue(id,value) {this.values.set(id,value);}
    getCapabilityValue(id) {return this.values.get(id) ?? null;}
    getData() {return {id:identity.uuid,cid:identity.cid,macID:identity.macID};}
    getAvailable() {return this.available;}
    async setAvailable() {this.available=true;}
    async setUnavailable(reason) {this.available=false;this.reason=reason;}
    log() {}
    error() {}
}
const originalLoad = Module._load;
Module._load = function(name, ...args) {
    return name === 'homey' ? {Device:FakeHomeyDevice} : originalLoad.call(this,name,...args);
};
const HomeyEleva = require('../.homeybuild/drivers/eleva300x/device');
Module._load = originalLoad;

async function connected(raw = fixture()) {
    const adapter = new Eleva(api,identity); const commands=[];
    adapter.post = async (method,data) => {
        if (method === 'getPurifierStatus') return response(raw);
        commands.push({method,data});
        if (method === 'setSwitch') raw.powerSwitch=data.powerSwitch;
        if (method === 'setLevel') {raw.manualSpeedLevel=data.manualSpeedLevel;raw.workMode='manual';}
        if (method === 'setPurifierMode') raw.workMode=data.workMode;
        return response({});
    };
    const device = new HomeyEleva();
    device.homey.app.veSync={isLoggedIn:()=>true,getStoredDevice:()=>[adapter]};
    await device.onInit(); return {device,adapter,commands,raw};
}

test('Homey publishes independent readings and exposes unknown values honestly', async () => {
    const {device,raw}=await connected();
    assert.equal(device.getCapabilityValue('measure_pm25'),4);
    assert.equal(device.getCapabilityValue('measure_pm1_eleva'),2);
    assert.equal(device.getCapabilityValue('measure_carbon_filter_life_eleva'),63);
    delete raw.PM1; await device.updateDevice();
    assert.equal(device.getCapabilityValue('measure_pm1_eleva'),null);
});

test('selecting Turbo while off powers on before setting the manual level', async () => {
    const {device,commands}=await connected({...fixture(),powerSwitch:0});
    await device.triggerCapabilityListener('fanSpeed0to4',4);
    assert.deepEqual(commands.map(c=>c.method),['setSwitch','setLevel']);
    assert.equal(device.getCapabilityValue('onoff'),true);
    assert.equal(device.getCapabilityValue('eleva_mode'),'manual');
    assert.equal(device.getCapabilityValue('fanSpeed0to4'),4);
});

test('failed commands roll back optimistic UI and do not poison the command queue', async () => {
    const {device,adapter}=await connected();
    const post=adapter.post; adapter.post=async(method,data)=>method==='setSwitch'
        ? {code:-1,msg:'denied',result:{code:0,result:{}}} : post(method,data);
    await assert.rejects(device.triggerCapabilityListener('onoff',false),/request failed/);
    assert.equal(device.getCapabilityValue('onoff'),true);
    adapter.post=post; await device.triggerCapabilityListener('onoff',false);
    assert.equal(device.getCapabilityValue('onoff'),false);
});

test('cloud outage marks unavailable, retains last reading, and recovers on next poll', async () => {
    const {device,adapter}=await connected(); const post=adapter.post;
    adapter.post=async()=>{throw new Error('timeout');}; await device.updateDevice();
    assert.equal(device.getAvailable(),false); assert.equal(device.getCapabilityValue('measure_pm25'),4);
    await assert.rejects(device.triggerCapabilityListener('fanSpeed0to4',4),/unavailable/);
    adapter.post=post; await device.updateDevice(); assert.equal(device.getAvailable(),true);
});

test('sensor changes expose Flow tokens and threshold state after the initial poll', async () => {
    const {device,raw}=await connected(); raw.PM1=15;raw.PM25=20;raw.carbonFilterLifePercent=62;
    await device.updateDevice();
    assert.ok(device.events.some(e=>e.id==='eleva_pm1_changed' && e.tokens.value===15));
    assert.ok(device.events.some(e=>e.id==='pm25_above_threshold' && e.state.previous_pm25===4 && e.state.pm25===20));
    assert.ok(device.events.some(e=>e.id==='eleva_carbon_life_changed' && e.tokens.value===62));
});
