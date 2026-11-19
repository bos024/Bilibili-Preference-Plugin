const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../src/core.js');
const source = fs.readFileSync(path.join(__dirname,'../src/background.js'), 'utf8');

function harness(initial = {}, fakeFetch = async () => ({ok:true,json:async()=>({code:0,data:{list:[]}})})) {
  const store = {...initial};
  let listener;
  const chrome = {
    storage:{local:{
      get: async keys => Object.fromEntries((typeof keys==='string'?[keys]:keys).map(key=>[key,store[key]])),
      set: async value => Object.assign(store,value)
    }},
    runtime:{
      onMessage:{addListener:fn=>{listener=fn}},
      onInstalled:{addListener:()=>{}}
    }
  };
  vm.runInNewContext(source,{BiliCore:Core,chrome,fetch:fakeFetch,AbortController,setTimeout,clearTimeout,console,Math,Date});
  return {
    store,
    send: request => new Promise(resolve=>{
      const returned=listener(request,{id:'test'},resolve);
      assert.equal(returned,true);
    })
  };
}

async function ok(h, payload) {
  const result = await h.send(payload);
  assert.equal(result.ok,true,result.error);
  return result.data;
}

test('initialization migrates old snapshots and sets missing prefs', async () => {
  const h = harness({history:{'2025-04-01':{sectionCount:{财经:10}}}});
  const state = await ok(h,{type:'GET_STATE'});
  assert.equal(state.snapshots.length,1);
  assert.equal(state.prefs.mode,'balanced');
  assert.equal(h.store[Core.KEYS.meta].version,Core.VERSION);
  assert.equal(state.events.length,0);
});

test('settings, blocks and snapshots remain available after storage reads', async () => {
  const h = harness();
  await ok(h,{type:'PREFS_SET',patch:{mode:'focus',topicWeights:{科技:5}}});
  await ok(h,{type:'BLOCK_UP',upId:'98765',upName:'某 UP'});
  await ok(h,{type:'BLOCK_VIDEO',bvid:'BV1aa411c7mD'});
  const snapshot = await ok(h,{type:'SNAPSHOT_SAVE',name:'研究学习'});
  await ok(h,{type:'PREFS_SET',patch:{mode:'explore',blockedVideos:[]}});
  await ok(h,{type:'SNAPSHOT_APPLY',id:snapshot.id});
  const state=await ok(h,{type:'GET_STATE'});
  assert.equal(state.prefs.mode,'focus');
  assert.equal(state.prefs.topicWeights['科技'],5);
  assert.deepEqual(Array.from(state.prefs.blockedUids),['98765']);
  assert.deepEqual(Array.from(state.prefs.blockedVideos),['BV1aa411c7mD']);
  await ok(h,{type:'SNAPSHOT_DELETE',id:snapshot.id});
  assert.equal((await ok(h,{type:'GET_STATE'})).snapshots.length,0);
});

test('record writes merge watches without duplicates', async () => {
  const h=harness();
  const event={kind:'watch',bvid:'BV1aa411c7mD',title:'Python 编程',sessionId:'id1',timestamp:Date.now(),watchedSeconds:11};
  await ok(h,{type:'WATCH',event});
  await ok(h,{type:'WATCH',event:{...event,watchedSeconds:25}});
  const state=await ok(h,{type:'GET_STATE'});
  assert.equal(state.events.length,1);
  assert.equal(state.events[0].watchedSeconds,25);
  await ok(h,{type:'PREFS_SET',patch:{trackWatch:false}});
  assert.equal((await ok(h,{type:'WATCH',event:{...event,sessionId:'id2'}})).recorded,false);
});

test('saved items and backup import/export preserve data', async () => {
  const h=harness();
  const video={bvid:'BV1aa411c7mD',title:'可保存的标题',upName:'UP'};
  await ok(h,{type:'SAVED_TOGGLE',video});
  const data=await ok(h,{type:'EXPORT'});
  assert.equal(data.format,'bpp-backup');
  assert.equal(data.saved.length,1);
  await ok(h,{type:'RESET_ALL'});
  assert.equal((await ok(h,{type:'GET_STATE'})).saved.length,0);
  await ok(h,{type:'IMPORT',data});
  assert.equal((await ok(h,{type:'GET_STATE'})).saved.length,1);
  await ok(h,{type:'SAVED_TOGGLE',video});
  assert.equal((await ok(h,{type:'GET_STATE'})).saved.length,0);
});

test('discovery is deduplicated and partial failures are disclosed', async () => {
  const requests=[];
  const h=harness({},async url=>{
    requests.push(url);
    if(url.includes('ranking')) throw new Error('HTTP 412');
    return {ok:true,json:async()=>({code:0,data:{list:[{bvid:'BV1aa411c7mD',title:'科技热门',owner:{name:'UP',mid:12},pic:'https://i0.hdslb.com/a.jpg'}]}})};
  });
  const result=await ok(h,{type:'DISCOVER_FETCH'});
  assert.equal(result.videos.length,1);
  assert.equal(result.errors.length,1);
  assert.match(result.errors[0],/排行榜/);
  assert.equal(requests.length,2);
});

test('incorrect backup schema is refused without clearing existing state', async () => {
  const h=harness();
  await ok(h,{type:'PREFS_SET',patch:{mode:'focus'}});
  const result=await h.send({type:'IMPORT',data:{format:'wrong',version:Core.VERSION}});
  assert.equal(result.ok,false);
  assert.equal((await ok(h,{type:'GET_STATE'})).prefs.mode,'focus');
});

test('simultaneous block requests do not overwrite one another', async () => {
  const h = harness();
  await Promise.all([
    ok(h,{type:'BLOCK_VIDEO',bvid:'BV1aa411c7mD'}),
    ok(h,{type:'BLOCK_VIDEO',bvid:'BV2bb411c7mD'}),
    ok(h,{type:'BLOCK_UP',upId:'112233'})
  ]);
  const prefs=(await ok(h,{type:'GET_STATE'})).prefs;
  assert.equal(prefs.blockedVideos.length,2);
  assert.deepEqual(Array.from(prefs.blockedUids),['112233']);
});

test('reset clears current and v2 legacy browsing records', async () => {
  const h=harness({logs:[{section:'科技'}],history:{'2025-01-01':{sectionCount:{科技:1}}}});
  await ok(h,{type:'GET_STATE'});
  await ok(h,{type:'RESET_ALL'});
  assert.deepEqual(Array.from(h.store.logs),[]);
  assert.equal(Object.keys(h.store.history).length,0);
  assert.equal((await ok(h,{type:'GET_STATE'})).snapshots.length,0);
});
