/* Shared, dependency-free preference and ranking logic. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.BiliCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = 3;
  const KEYS = Object.freeze({
    prefs: 'bpp.prefs', events: 'bpp.events', snapshots: 'bpp.snapshots',
    meta: 'bpp.meta', saved: 'bpp.saved'
  });
  const TOPICS = Object.freeze({
    '科技': ['科技', '人工智能', 'AI', '大模型', '机器学习', '深度学习', '数码', '硬件', '芯片', '电脑', '显卡', '手机', '编程', '代码', '程序员', 'Python', 'JavaScript', '软件', '操作系统', '算法', '机器人'],
    '财经': ['财经', '金融', '经济', '投资', '基金', '股票', '证券', '量化', '宏观', '货币', '利率', '就业', '商业', '区块链', '比特币', '以太坊', '加密货币', '财报'],
    '知识': ['科普', '数学', '物理', '化学', '生物', '心理学', '哲学', '教育', '历史', '考古', '知识', '地理', '科学', '学习', '语言', '读书'],
    '游戏': ['游戏', '电竞', '电子竞技', '主机', '手游', '原神', '我的世界', 'Minecraft', 'LOL', '王者荣耀', 'Steam'],
    '动漫': ['动画', '动漫', '番剧', '漫画', '二次元', 'MAD', '手办', 'cosplay'],
    '影视': ['电影', '电视剧', '影视', '纪录片', '影评', '剧情', '导演', '演员', '短片'],
    '音乐': ['音乐', '歌曲', '唱歌', '演奏', '钢琴', '吉他', '乐队', '翻唱', '编曲', 'MV'],
    '运动': ['运动', '健身', '跑步', '篮球', '足球', '游泳', '训练', '瑜伽', '羽毛球', '网球'],
    '美食': ['美食', '做饭', '食谱', '料理', '探店', '烘焙', '火锅', '家常菜', '吃播'],
    '生活': ['生活', '日常', '家居', 'vlog', '宠物', '收纳', '穿搭', '护肤', '亲子'],
    '旅行': ['旅行', '旅游', '出行', '攻略', '景点', '徒步', '露营', '城市漫游'],
    '汽车': ['汽车', '新能源车', '试驾', '车型', '驾驶', '电动车', '自驾'],
    '娱乐': ['娱乐', '综艺', '搞笑', '鬼畜', '明星', '整活', '脱口秀', '娱乐圈']
  });
  const TOPIC_NAMES = Object.freeze(Object.keys(TOPICS));
  const MAX_EVENTS = 1200;
  const MAX_SNAPSHOTS = 40;
  const MAX_SAVED = 100;
  const DEFAULT_PREFS = Object.freeze({
    enabled: true,
    trackWatch: true,
    showActions: true,
    showFiltered: false,
    mode: 'balanced',
    topicWeights: Object.fromEntries(TOPIC_NAMES.map(name => [name, 2])),
    blockedKeywords: [],
    blockedUps: [],
    blockedUids: [],
    blockedVideos: []
  });

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const text = value => typeof value === 'string' ? value.trim() : '';
  const normalizeWord = value => text(value).toLocaleLowerCase();
  const uniqueText = (items, limit = 150) => {
    if (!Array.isArray(items)) return [];
    const seen = new Set();
    const result = [];
    for (const item of items) {
      const value = text(item).slice(0, 100);
      const key = normalizeWord(value);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      result.push(value);
      if (result.length >= limit) break;
    }
    return result;
  };

  function normalizePrefs(input) {
    const value = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    const topicWeights = {};
    for (const name of TOPIC_NAMES) {
      const n = Number(value.topicWeights?.[name]);
      topicWeights[name] = Number.isFinite(n) ? clamp(Math.round(n), 0, 5) : 2;
    }
    return {
      enabled: value.enabled !== false,
      trackWatch: value.trackWatch !== false,
      showActions: value.showActions !== false,
      showFiltered: value.showFiltered === true,
      mode: ['balanced', 'focus', 'explore'].includes(value.mode) ? value.mode : 'balanced',
      topicWeights,
      blockedKeywords: uniqueText(value.blockedKeywords),
      blockedUps: uniqueText(value.blockedUps),
      blockedUids: uniqueText(value.blockedUids),
      blockedVideos: [...new Set((Array.isArray(value.blockedVideos) ? value.blockedVideos : []).map(text).filter(validBvid))].slice(0, 150)
    };
  }

  function validBvid(value) { return /^BV[A-Za-z0-9]{8,16}$/.test(text(value)); }

  function normalizeVideo(raw) {
    if (!raw || !validBvid(raw.bvid)) return null;
    return {
      bvid: text(raw.bvid),
      title: text(raw.title).slice(0, 240),
      upName: text(raw.upName).slice(0, 100),
      upId: String(raw.upId || '').replace(/\D/g, '').slice(0, 24),
      category: text(raw.category).slice(0, 60),
      cover: validCover(raw.cover) ? (raw.cover.startsWith('//') ? 'https:' + raw.cover : raw.cover.replace(/^http:/, 'https:')) : '',
      duration: Number.isFinite(Number(raw.duration)) ? clamp(Math.round(Number(raw.duration)), 0, 86400) : 0,
      views: Number.isFinite(Number(raw.views)) ? Math.max(0, Math.round(Number(raw.views))) : 0,
      source: text(raw.source).slice(0, 25)
    };
  }

  function validCover(url) {
    if (typeof url !== 'string') return false;
    try {
      const parsed = new URL(url.startsWith('//') ? 'https:' + url : url);
      return (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
        (parsed.hostname === 'hdslb.com' || parsed.hostname.endsWith('.hdslb.com'));
    } catch { return false; }
  }

  function tokenMatch(haystack, needle) {
    if (!needle) return false;
    const source = haystack.toLocaleLowerCase();
    const part = needle.toLocaleLowerCase();
    let at = source.indexOf(part);
    while (at >= 0) {
      if (!/^[a-z0-9]+$/i.test(part)) return true;
      const left = at === 0 ? '' : source[at - 1];
      const right = source[at + part.length] || '';
      if (!/[a-z0-9]/i.test(left) && !/[a-z0-9]/i.test(right)) return true;
      at = source.indexOf(part, at + 1);
    }
    return false;
  }

  function classify(video) {
    const title = text(video?.title);
    const category = text(video?.category);
    const matches = [];
    for (const [name, words] of Object.entries(TOPICS)) {
      const hit = words.some(word => tokenMatch(title, word));
      const categoryHit = words.some(word => tokenMatch(category, word));
      if (hit || categoryHit) matches.push(name);
    }
    return matches;
  }

  function blockReason(video, prefs) {
    if (!video || !prefs?.enabled) return '';
    const bvid = text(video.bvid);
    const upName = normalizeWord(video.upName);
    const upId = text(video.upId);
    const title = normalizeWord(video.title);
    if (prefs.blockedVideos.includes(bvid)) return '已屏蔽视频';
    if (prefs.blockedUids.includes(upId) && upId) return '已屏蔽 UP 主';
    if (prefs.blockedUps.some(name => normalizeWord(name) === upName && upName)) return '已屏蔽 UP 主';
    const matched = prefs.blockedKeywords.find(word => title.includes(normalizeWord(word)) && normalizeWord(word));
    if (matched) return `关键词：${matched}`;
    if (prefs.mode === 'focus') {
      const wanted = TOPIC_NAMES.filter(name => prefs.topicWeights[name] >= 4);
      if (wanted.length) {
        const topics = classify(video);
        if (topics.length && !topics.some(name => wanted.includes(name))) return '不在聚焦主题中';
      }
    }
    return '';
  }

  function validEvent(raw) {
    if (!raw || raw.kind !== 'watch' || !validBvid(raw.bvid)) return null;
    const timestamp = Number(raw.timestamp);
    const watchedSeconds = Number(raw.watchedSeconds);
    if (!Number.isFinite(timestamp) || timestamp < 0 || !Number.isFinite(watchedSeconds)) return null;
    return {
      kind: 'watch',
      sessionId: text(raw.sessionId).slice(0, 110) || `${raw.bvid}:${Math.trunc(timestamp)}`,
      bvid: raw.bvid,
      title: text(raw.title).slice(0, 240),
      upName: text(raw.upName).slice(0, 100),
      upId: String(raw.upId || '').replace(/\D/g, '').slice(0, 24),
      watchedSeconds: clamp(Math.round(watchedSeconds), 0, 86400),
      duration: clamp(Number(raw.duration) || 0, 0, 86400),
      timestamp: Math.trunc(timestamp)
    };
  }

  function minimumWatchSeconds(duration) {
    return duration > 0 ? Math.min(8, Math.max(3, duration * 0.5)) : 8;
  }

  function upsertWatch(events, raw) {
    const next = validEvent(raw);
    if (!next || next.watchedSeconds < minimumWatchSeconds(next.duration)) return Array.isArray(events) ? events : [];
    const previous = Array.isArray(events) ? events : [];
    const index = previous.findIndex(item => item.sessionId === next.sessionId);
    if (index >= 0 && Number(previous[index].watchedSeconds) >= next.watchedSeconds) return previous;
    const list = previous.slice();
    if (index >= 0) {
      list.splice(index, 1);
    }
    list.unshift(next);
    return list.slice(0, MAX_EVENTS);
  }

  function statsFor(events, days = 30, now = Date.now()) {
    const cutoff = now - days * 86400000;
    const valid = (Array.isArray(events) ? events : [])
      .map(validEvent).filter(Boolean)
      .filter(event => event.timestamp >= cutoff && event.timestamp <= now + 60000 && event.watchedSeconds >= minimumWatchSeconds(event.duration));
    const videos = new Set();
    const ups = new Map();
    const topics = Object.fromEntries(TOPIC_NAMES.map(name => [name, 0]));
    let watchSeconds = 0;
    for (const event of valid) {
      videos.add(event.bvid);
      watchSeconds += event.watchedSeconds;
      if (event.upName) ups.set(event.upName, (ups.get(event.upName) || 0) + event.watchedSeconds);
      const categories = classify(event);
      for (const name of categories) topics[name] += event.watchedSeconds / categories.length;
    }
    return {
      videos: videos.size,
      sessions: valid.length,
      minutes: Math.round(watchSeconds / 60),
      topics: Object.entries(topics).sort((a, b) => b[1] - a[1]).map(([name, seconds]) => ({ name, minutes: Math.round(seconds / 60) })),
      ups: [...ups.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([name, seconds]) => ({ name, minutes: Math.round(seconds / 60) }))
    };
  }

  function scoreVideo(video, prefs, stats) {
    const topics = classify(video);
    const weights = topics.length ? topics.map(name => prefs.topicWeights[name] ?? 2) : [2];
    const interest = weights.reduce((a, b) => a + b, 0) / weights.length;
    const categoryMinutes = new Map((stats?.topics || []).map(item => [item.name, item.minutes]));
    const observed = topics.length ? topics.reduce((sum, t) => sum + (categoryMinutes.get(t) || 0), 0) / topics.length : 0;
    const novelty = 1 / Math.sqrt(1 + observed / 30);
    const learned = 0.45 + 0.55 * Math.min(1, Math.log1p(observed) / Math.log1p(120));
    const relevance = 0.7 * (interest / 5) + 0.3 * learned;
    if (prefs.mode === 'focus') return 0.95 * relevance + 0.05 * novelty;
    if (prefs.mode === 'explore') return 0.35 * relevance + 0.65 * novelty;
    return 0.85 * relevance + 0.15 * novelty;
  }

  function rankVideos(rawVideos, prefs, events, count = 36) {
    const stats = statsFor(events, 30);
    const seen = new Set();
    const candidates = [];
    for (const raw of rawVideos || []) {
      const video = normalizeVideo(raw);
      if (!video || seen.has(video.bvid) || blockReason(video, prefs)) continue;
      seen.add(video.bvid);
      candidates.push({ ...video, topics: classify(video), baseScore: scoreVideo(video, prefs, stats) });
    }
    const result = [];
    const authorCounts = new Map();
    const topicCounts = new Map();
    const max = Math.min(count, candidates.length);
    while (result.length < max) {
      let selected = -1;
      let topScore = -Infinity;
      for (let i = 0; i < candidates.length; i++) {
        const video = candidates[i];
        if (!video) continue;
        const authorPenalty = video.upId || video.upName
          ? (authorCounts.get(video.upId || video.upName) || 0) * (prefs.mode === 'explore' ? 0.22 : 0.13)
          : 0;
        const topicPenalty = video.topics.length
          ? video.topics.reduce((sum, topic) => sum + (topicCounts.get(topic) || 0), 0) / video.topics.length * (prefs.mode === 'explore' ? 0.07 : 0.025)
          : 0;
        const score = video.baseScore - authorPenalty - topicPenalty;
        if (score > topScore) { topScore = score; selected = i; }
      }
      if (selected < 0) break;
      const item = candidates[selected];
      candidates[selected] = null;
      authorCounts.set(item.upId || item.upName, (authorCounts.get(item.upId || item.upName) || 0) + 1);
      for (const topic of item.topics) topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
      result.push({ ...item, score: Math.round(topScore * 100) / 100 });
    }
    return result;
  }

  function normalizeSnapshot(raw) {
    if (!raw || typeof raw !== 'object' || !raw.prefs) return null;
    return {
      id: text(raw.id).slice(0, 100) || String(Date.now()),
      name: text(raw.name).slice(0, 70) || '未命名配置',
      timestamp: Number(raw.timestamp) || Date.now(),
      prefs: normalizePrefs(raw.prefs)
    };
  }

  function legacySnapshots(history) {
    if (!history || typeof history !== 'object' || Array.isArray(history)) return [];
    return Object.entries(history).slice(-MAX_SNAPSHOTS).map(([date, profile]) => {
      const original = profile?.sectionCount;
      const weights = { ...DEFAULT_PREFS.topicWeights };
      const values = Object.entries(original || {}).filter(([, n]) => Number(n) > 0);
      const max = Math.max(1, ...values.map(([, n]) => Number(n)));
      for (const [name, count] of values) {
        if (Object.hasOwn(weights, name)) weights[name] = clamp(Math.round(Number(count) / max * 5), 0, 5);
      }
      return normalizeSnapshot({id: `legacy-${date}`, name: `旧版画像 ${date}`, timestamp: Date.parse(date) || Date.now(), prefs: {...DEFAULT_PREFS, topicWeights:weights} });
    }).filter(Boolean);
  }

  function parseList(value) {
    return uniqueText(String(value || '').split(/[\n,，、;；]+/).map(item => item.trim()));
  }

  return Object.freeze({
    VERSION, KEYS, TOPICS, TOPIC_NAMES, MAX_EVENTS, MAX_SNAPSHOTS, MAX_SAVED,
    DEFAULT_PREFS, normalizePrefs, normalizeVideo, validBvid, validCover, classify, minimumWatchSeconds,
    blockReason, validEvent, upsertWatch, statsFor, scoreVideo, rankVideos,
    normalizeSnapshot, legacySnapshots, parseList
  });
});
