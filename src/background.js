'use strict';

// Chromium loads this file as a service worker. Firefox loads it as a background script.
if (!globalThis.BiliCore && typeof importScripts === 'function') importScripts('core.js');
const Core = globalThis.BiliCore;
const ext = globalThis.browser || globalThis.chrome;
const { KEYS } = Core;
let writeQueue = Promise.resolve();
let initialization;
let feedCache = null;

async function initialize() {
  const current = await ext.storage.local.get([KEYS.prefs, KEYS.events, KEYS.snapshots, KEYS.meta, KEYS.saved, 'history']);
  if (current[KEYS.meta]?.version === Core.VERSION) return;
  const existing = Array.isArray(current[KEYS.snapshots]) ? current[KEYS.snapshots] : [];
  const imported = current[KEYS.meta] ? [] : Core.legacySnapshots(current.history);
  await ext.storage.local.set({
    [KEYS.prefs]: Core.normalizePrefs(current[KEYS.prefs]),
    [KEYS.events]: Array.isArray(current[KEYS.events]) ? current[KEYS.events].map(Core.validEvent).filter(Boolean).slice(0, Core.MAX_EVENTS) : [],
    [KEYS.snapshots]: [...existing, ...imported].map(Core.normalizeSnapshot).filter(Boolean).slice(-Core.MAX_SNAPSHOTS),
    [KEYS.saved]: Array.isArray(current[KEYS.saved]) ? current[KEYS.saved].map(Core.normalizeVideo).filter(Boolean).slice(0, Core.MAX_SAVED) : [],
    [KEYS.meta]: {version: Core.VERSION, migratedAt: Date.now()}
  });
}

function ready() {
  if (!initialization) initialization = initialize().catch(error => { initialization = null; throw error; });
  return initialization;
}

function write(task) {
  const result = writeQueue.then(async () => { await ready(); return task(); });
  writeQueue = result.catch(() => {});
  return result;
}

async function getState() {
  await ready();
  const data = await ext.storage.local.get(Object.values(KEYS));
  return {
    prefs: Core.normalizePrefs(data[KEYS.prefs]),
    events: data[KEYS.events] || [],
    snapshots: data[KEYS.snapshots] || [],
    saved: data[KEYS.saved] || []
  };
}

async function patchPrefs(patch) {
  return write(async () => {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('无效的偏好设置');
    const data = await ext.storage.local.get(KEYS.prefs);
    const old = Core.normalizePrefs(data[KEYS.prefs]);
    const prefs = Core.normalizePrefs({
      ...old,
      ...patch,
      topicWeights: {...old.topicWeights, ...patch.topicWeights}
    });
    await ext.storage.local.set({[KEYS.prefs]: prefs});
    return prefs;
  });
}

async function recordWatch(event) {
  return write(async () => {
    const parsed = Core.validEvent(event);
    if (!parsed) throw new Error('观看记录格式不正确');
    const data = await ext.storage.local.get([KEYS.events, KEYS.prefs]);
    if (!Core.normalizePrefs(data[KEYS.prefs]).trackWatch) return { recorded: false };
    const previous = data[KEYS.events] || [];
    const events = Core.upsertWatch(previous, parsed);
    if (events !== previous && events[0]?.sessionId === parsed.sessionId) {
      await ext.storage.local.set({[KEYS.events]: events});
      return {recorded: true};
    }
    return {recorded: false};
  });
}

async function blockItem(msg) {
  const type = msg.type;
  if (type === 'BLOCK_VIDEO' && !Core.validBvid(msg.bvid)) throw new Error('视频 ID 无效');
  if (type === 'BLOCK_UP' && !(String(msg.upName || '').trim() || /^\d{1,24}$/.test(String(msg.upId || '')))) {
    throw new Error('UP 主信息不足');
  }
  return write(async () => {
    const data = await ext.storage.local.get(KEYS.prefs);
    const prefs = Core.normalizePrefs(data[KEYS.prefs]);
    if (type === 'BLOCK_VIDEO') prefs.blockedVideos = [msg.bvid, ...prefs.blockedVideos];
    else if (/^\d{1,24}$/.test(String(msg.upId || ''))) prefs.blockedUids = [String(msg.upId), ...prefs.blockedUids];
    else prefs.blockedUps = [String(msg.upName).trim(), ...prefs.blockedUps];
    const updated = Core.normalizePrefs(prefs);
    await ext.storage.local.set({[KEYS.prefs]: updated});
    return updated;
  });
}

async function saveSnapshot(name) {
  return write(async () => {
    const data = await ext.storage.local.get([KEYS.prefs, KEYS.snapshots]);
    const snapshot = Core.normalizeSnapshot({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: String(name || '').trim().slice(0, 70) || `配置 ${new Date().toLocaleDateString('zh-CN')}`,
      timestamp: Date.now(), prefs: data[KEYS.prefs]
    });
    const snapshots = [snapshot, ...(data[KEYS.snapshots] || [])].slice(0, Core.MAX_SNAPSHOTS);
    await ext.storage.local.set({[KEYS.snapshots]: snapshots});
    return snapshot;
  });
}

async function deleteSnapshot(id) {
  return write(async () => {
    const data = await ext.storage.local.get(KEYS.snapshots);
    const snapshots = (data[KEYS.snapshots] || []).filter(item => item.id !== id);
    await ext.storage.local.set({[KEYS.snapshots]: snapshots});
    return {count: snapshots.length};
  });
}

async function applySnapshot(id) {
  return write(async () => {
    const data = await ext.storage.local.get([KEYS.snapshots, KEYS.prefs]);
    const item = (data[KEYS.snapshots] || []).find(s => s.id === id);
    if (!item) throw new Error('配置不存在');
    const prefs = Core.normalizePrefs(item.prefs);
    // Do not change the user's current data-collection setting when applying an old snapshot.
    prefs.trackWatch = Core.normalizePrefs(data[KEYS.prefs]).trackWatch;
    await ext.storage.local.set({[KEYS.prefs]: prefs});
    return prefs;
  });
}

async function toggleSaved(raw) {
  return write(async () => {
    const video = Core.normalizeVideo(raw);
    if (!video) throw new Error('无法保存该视频');
    const data = await ext.storage.local.get(KEYS.saved);
    const saved = data[KEYS.saved] || [];
    const exists = saved.some(item => item.bvid === video.bvid);
    const next = exists ? saved.filter(item => item.bvid !== video.bvid) : [video, ...saved].slice(0, Core.MAX_SAVED);
    await ext.storage.local.set({[KEYS.saved]: next});
    return {saved: !exists, count: next.length};
  });
}

async function importData(input) {
  return write(async () => {
    if (!input || input.format !== 'bpp-backup' || input.version !== Core.VERSION) throw new Error('不支持的备份格式');
    if (!input.prefs || !Array.isArray(input.events) || !Array.isArray(input.snapshots) || !Array.isArray(input.saved)) throw new Error('备份内容不完整');
    const prefs = Core.normalizePrefs(input.prefs);
    const events = input.events.map(Core.validEvent).filter(Boolean).slice(0, Core.MAX_EVENTS);
    const snapshots = input.snapshots.map(Core.normalizeSnapshot).filter(Boolean).slice(0, Core.MAX_SNAPSHOTS);
    const saved = input.saved.map(Core.normalizeVideo).filter(Boolean).slice(0, Core.MAX_SAVED);
    await ext.storage.local.set({
      [KEYS.prefs]: prefs, [KEYS.events]: events, [KEYS.snapshots]: snapshots, [KEYS.saved]: saved,
      [KEYS.meta]: {version: Core.VERSION, migratedAt: Date.now()}
    });
    return {events: events.length, snapshots: snapshots.length, saved: saved.length};
  });
}

function fromPopular(item, source) {
  return Core.normalizeVideo({
    bvid: item.bvid, title: item.title, upName: item.owner?.name,
    upId: item.owner?.mid, category: item.tname, cover: item.pic,
    duration: item.duration, views: item.stat?.view, source
  });
}

async function fetchSource(source) {
  const endpoints = {
    popular: 'https://api.bilibili.com/x/web-interface/popular?pn=1&ps=40',
    ranking: 'https://api.bilibili.com/x/web-interface/ranking/v2?rid=0&type=all'
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(endpoints[source], {signal: controller.signal, credentials: 'omit', cache: 'no-store'});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (data.code !== 0 || !Array.isArray(data.data?.list)) throw new Error(`接口返回 ${data.code ?? '未知错误'}`);
    return data.data.list.map(item => fromPopular(item, source === 'popular' ? '热门' : '排行榜')).filter(Boolean);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchDiscovery() {
  if (feedCache && Date.now() - feedCache.time < 180000) return feedCache.value;
  const result = await Promise.allSettled([fetchSource('popular'), fetchSource('ranking')]);
  const videos = [];
  const errors = [];
  result.forEach((entry, index) => {
    if (entry.status === 'fulfilled') videos.push(...entry.value);
    else errors.push(`${index === 0 ? '热门' : '排行榜'}：${entry.reason?.message || '请求失败'}`);
  });
  const unique = [...new Map(videos.map(video => [video.bvid, video])).values()];
  const value = {videos: unique, errors, fetchedAt: Date.now()};
  if (unique.length) feedCache = {time: Date.now(), value};
  return value;
}

async function handleMessage(msg) {
  if (!msg || typeof msg.type !== 'string') throw new Error('无效请求');
  switch (msg.type) {
    case 'GET_STATE': return getState();
    case 'PREFS_SET': return patchPrefs(msg.patch);
    case 'WATCH': return recordWatch(msg.event);
    case 'BLOCK_VIDEO':
    case 'BLOCK_UP': return blockItem(msg);
    case 'SNAPSHOT_SAVE': return saveSnapshot(msg.name);
    case 'SNAPSHOT_APPLY': return applySnapshot(msg.id);
    case 'SNAPSHOT_DELETE': return deleteSnapshot(msg.id);
    case 'SAVED_TOGGLE': return toggleSaved(msg.video);
    case 'DISCOVER_FETCH': return fetchDiscovery();
    case 'EXPORT': {
      const state = await getState();
      return {format: 'bpp-backup', version: Core.VERSION, exportedAt: new Date().toISOString(), ...state};
    }
    case 'IMPORT': return importData(msg.data);
    case 'CLEAR_EVENTS': return write(async () => { await ext.storage.local.set({[KEYS.events]: []}); return {cleared: true}; });
    case 'RESET_ALL': return write(async () => {
      await ext.storage.local.set({
        [KEYS.prefs]: Core.normalizePrefs(), [KEYS.events]: [], [KEYS.snapshots]: [], [KEYS.saved]: []
      });
      // These two keys belonged to v2. Clear any remaining historical records.
      if (ext.storage.local.remove) await ext.storage.local.remove(['logs', 'history']);
      else await ext.storage.local.set({logs: [], history: {}});
      return {reset: true};
    });
    default: throw new Error('未知操作');
  }
}

ext.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // No external message endpoints are declared in the manifest.
  handleMessage(message).then(
    data => sendResponse({ok: true, data}),
    error => sendResponse({ok: false, error: error?.message || '操作失败'})
  );
  return true;
});

ext.runtime.onInstalled.addListener(() => { void ready(); });
