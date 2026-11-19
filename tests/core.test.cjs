const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../src/core.js');

const video = (title, id = 'BV1aa411c7mD', extra = {}) => ({bvid:id, title, upName:'UP甲', upId:'123', ...extra});

test('preferences are normalized and invalid entries are rejected', () => {
  const prefs = Core.normalizePrefs({mode:'wrong', topicWeights:{财经:10,知识:-5,游戏:'NaN'}, blockedKeywords:['  AI  ','ai','区块链','']});
  assert.equal(prefs.mode, 'balanced');
  assert.equal(prefs.topicWeights['财经'], 5);
  assert.equal(prefs.topicWeights['知识'], 0);
  assert.equal(prefs.topicWeights['游戏'], 2);
  assert.deepEqual(prefs.blockedKeywords, ['AI', '区块链']);
  assert.equal(prefs.showFiltered, false);
});

test('classification uses title and category without treating every latin substring as a token', () => {
  assert.ok(Core.classify(video('Python 与机器学习实战')).includes('科技'));
  assert.ok(Core.classify(video('本周金融市场和宏观经济')).includes('财经'));
  assert.ok(Core.classify(video('任意标题', undefined, {category:'历史'})).includes('知识'));
  assert.ok(!Core.classify(video('CHAINING 示例')).includes('科技'));
});

test('hard blocks can be explained and are inactive when disabled', () => {
  const prefs = Core.normalizePrefs({blockedKeywords:['芯片'],blockedUps:['UP乙'],blockedUids:['123'],blockedVideos:['BV2bb411c7mD']});
  assert.equal(Core.blockReason(video('比较新的视频'),prefs), '已屏蔽 UP 主');
  assert.equal(Core.blockReason(video('芯片发布', 'BV1aa411c7mD', {upId:'8'}),prefs), '关键词：芯片');
  assert.equal(Core.blockReason(video('任意', 'BV2bb411c7mD', {upId:'8'}),prefs), '已屏蔽视频');
  assert.equal(Core.blockReason(video('芯片发布', 'BV1aa411c7mD', {upId:'8'}),{...prefs,enabled:false}), '');
});

test('focus mode preserves unclassified cards but filters known unrelated topics', () => {
  const prefs = Core.normalizePrefs({mode:'focus',topicWeights:{科技:5,财经:2,游戏:1}});
  assert.equal(Core.blockReason(video('Python 编程教程', 'BV1aa411c7mD', {upId:'8'}),prefs), '');
  assert.equal(Core.blockReason(video('游戏装备攻略', 'BV1aa411c7mD', {upId:'8'}),prefs), '不在聚焦主题中');
  assert.equal(Core.blockReason(video('完全不认识的特殊标题', 'BV1aa411c7mD', {upId:'8'}),prefs), '');
});

test('watch events are updated by session, not multiplied during periodic saves', () => {
  const start = {kind:'watch',bvid:'BV1aa411c7mD',title:'金融入门',sessionId:'s1',timestamp:Date.now(),watchedSeconds:12,duration:60};
  let events = Core.upsertWatch([],start);
  events = Core.upsertWatch(events,{...start,watchedSeconds:35});
  events = Core.upsertWatch(events,{...start,watchedSeconds:20});
  assert.equal(events.length,1);
  assert.equal(events[0].watchedSeconds,35);
  const stats = Core.statsFor(events);
  assert.equal(stats.videos,1);
  assert.equal(stats.sessions,1);
  assert.equal(stats.minutes,1);
  assert.equal(Core.upsertWatch(events,{...start,watchedSeconds:1}).length,1);
});

test('invalid watch events are discarded and event count is bounded', () => {
  assert.equal(Core.validEvent({kind:'watch',bvid:'wrong',timestamp:0,watchedSeconds:30}),null);
  let events = [];
  const base = Date.now();
  for(let i=0;i<Core.MAX_EVENTS+10;i++) events=Core.upsertWatch(events,{kind:'watch',bvid:'BV1aa411c7mD',sessionId:`s-${i}`,timestamp:base,watchedSeconds:20});
  assert.equal(events.length,Core.MAX_EVENTS);
  assert.equal(events[0].sessionId,`s-${Core.MAX_EVENTS+9}`);
});

test('ranking removes duplicate videos, respects exclusions, and promotes author diversity', () => {
  const prefs=Core.normalizePrefs({mode:'explore',blockedVideos:['BV3cc411c7mD']});
  const items=[
    video('AI 人工智能', 'BV1aa411c7mD',{upId:'123'}),
    video('机器学习教程', 'BV2bb411c7mD',{upId:'123'}),
    video('数学理论讲解', 'BV4dd411c7mD',{upId:'456'}),
    video('金融市场趋势', 'BV5ee411c7mD',{upId:'789'}),
    video('重复视频', 'BV1aa411c7mD',{upId:'123'}),
    video('已排除', 'BV3cc411c7mD',{upId:'888'})
  ];
  const result=Core.rankVideos(items,prefs,[],4);
  assert.equal(result.length,4);
  assert.equal(new Set(result.map(item=>item.bvid)).size,4);
  assert.ok(!result.some(item=>item.bvid==='BV3cc411c7mD'));
  assert.ok(result[0].upId !== result[1].upId);
});

test('untrusted image URLs and invalid IDs cannot enter discovery cards', () => {
  assert.equal(Core.normalizeVideo(video('abc','invalid')),null);
  assert.equal(Core.normalizeVideo(video('abc',undefined,{cover:'javascript:alert(1)'})).cover,'');
  assert.equal(Core.normalizeVideo(video('abc',undefined,{cover:'//i0.hdslb.com/test.jpg'})).cover,'https://i0.hdslb.com/test.jpg');
  assert.equal(Core.normalizeVideo(video('abc',undefined,{cover:'http://i0.hdslb.com/cover.jpg'})).cover,'https://i0.hdslb.com/cover.jpg');
  assert.equal(Core.normalizeVideo(video('abc',undefined,{cover:'https://hdslb.com.evil.org/a'})).cover,'');
});

test('legacy preference history imports as named snapshots rather than watched sessions', () => {
  const imported=Core.legacySnapshots({'2025-07-01':{sectionCount:{科技:12,财经:6}},'2025-07-02':{sectionCount:{游戏:8}}});
  assert.equal(imported.length,2);
  assert.equal(imported[0].prefs.topicWeights['科技'],5);
  assert.equal(imported[0].prefs.topicWeights['财经'],3);
  assert.ok(imported[1].name.includes('旧版画像'));
});

test('lists accept multiple separators and avoid duplicates', () => {
  assert.deepEqual(Core.parseList('  foo,bar\nFOO；baz  '), ['foo','bar','baz']);
});

test('valid watches require meaningful duration; short clips retain a proportional threshold', () => {
  const now=Date.now();
  const long={kind:'watch',bvid:'BV1aa411c7mD',sessionId:'long',timestamp:now,duration:900,watchedSeconds:5};
  const short={kind:'watch',bvid:'BV2bb411c7mD',sessionId:'short',timestamp:now,duration:6,watchedSeconds:4};
  assert.equal(Core.upsertWatch([],long).length,0);
  assert.equal(Core.upsertWatch([],short).length,1);
  assert.equal(Core.minimumWatchSeconds(6),3);
  assert.equal(Core.minimumWatchSeconds(900),8);
});

test('recorded watch time helps relevance in balanced mode, while explore promotes novelty', () => {
  const now=Date.now();
  const events=[{kind:'watch',bvid:'BV1aa411c7mD',sessionId:'s',timestamp:now,duration:7200,watchedSeconds:7200,title:'Python 编程 算法'}];
  const prefs=Core.normalizePrefs();
  const stats=Core.statsFor(events);
  const known=Core.scoreVideo(video('Python 编程'),prefs,stats);
  const unknown=Core.scoreVideo(video('旅游 景点攻略'),prefs,stats);
  assert.ok(known>unknown, `${known} should be greater than ${unknown}`);
  const exploring={...prefs,mode:'explore'};
  assert.ok(Core.scoreVideo(video('旅游 景点攻略'),exploring,stats)>Core.scoreVideo(video('Python 编程'),exploring,stats));
});


test('video IDs retain case sensitivity when rules are normalized', () => {
  const prefs = Core.normalizePrefs({blockedVideos:['BV1aa411c7mD','BV1AA411c7mD','BV1aa411c7mD']});
  assert.deepEqual(prefs.blockedVideos,['BV1aa411c7mD','BV1AA411c7mD']);
});
