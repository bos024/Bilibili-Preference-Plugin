'use strict';
(() => {
  const Core = globalThis.BiliCore;
  const ext = globalThis.browser || globalThis.chrome;
  if (!Core || !ext) return;

  const CARD_SELECTOR = '.bili-video-card, .video-card, .rank-item, .video-page-card-small';
  const LINK_SELECTOR = 'a[href*="/video/BV"]';
  let prefs = Core.normalizePrefs();
  let scanTimer = 0;
  let lastUrl = location.href;
  let tracker = null;
  let toastTimer = 0;

  function send(payload) {
    return ext.runtime.sendMessage(payload).then(response => {
      if (!response?.ok) throw new Error(response?.error || '操作失败');
      return response.data;
    });
  }

  function videoInfo(card) {
    const link = card.querySelector(LINK_SELECTOR);
    const bvid = link?.getAttribute('href')?.match(/\/video\/(BV[A-Za-z0-9]{8,16})/)?.[1];
    if (!Core.validBvid(bvid)) return null;
    const titleElement = ['.bili-video-card__info--tit', '.video-name', 'p.title', '.title', '[title]']
      .map(selector => card.querySelector(selector)).find(Boolean);
    const authorElement = card.querySelector('.bili-video-card__info--author, .bili-video-card__info--owner, .up-name, .upname .name, .upname');
    const upLink = card.querySelector('a[href*="space.bilibili.com/"]');
    const upId = upLink?.getAttribute('href')?.match(/space\.bilibili\.com\/(\d+)/)?.[1] || '';
    return Core.normalizeVideo({
      bvid, title: titleElement?.getAttribute('title') || titleElement?.textContent || link?.title || '',
      upName: authorElement?.textContent || '', upId
    });
  }

  function toast(message) {
    let node = document.getElementById('bpp-toast');
    if (!node) {
      node = document.createElement('div');
      node.id = 'bpp-toast';
      node.setAttribute('role', 'status');
      document.body.appendChild(node);
    }
    node.textContent = message;
    node.classList.add('bpp-toast-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('bpp-toast-visible'), 2500);
  }

  function button(label, tooltip, callback) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'bpp-card-button';
    item.textContent = label;
    item.title = tooltip;
    item.addEventListener('click', async event => {
      event.preventDefault();
      event.stopPropagation();
      item.disabled = true;
      try { await callback(); }
      catch (error) { toast(error?.message || '操作失败'); }
      finally { item.disabled = false; }
    });
    return item;
  }

  function attachActions(card, info) {
    if (!prefs.enabled || !prefs.showActions) return;
    const actions = document.createElement('div');
    actions.className = 'bpp-card-actions';
    actions.appendChild(button('屏蔽', '不再显示这个视频', async () => {
      await send({type: 'BLOCK_VIDEO', bvid: info.bvid});
      toast('已屏蔽视频，可在插件设置中恢复');
    }));
    if (info.upName) actions.appendChild(button('不看 TA', '屏蔽这位 UP 主', async () => {
      await send({type: 'BLOCK_UP', upName: info.upName, upId: info.upId});
      toast('已屏蔽 UP 主，可在插件设置中恢复');
    }));
    const topic = Core.classify(info)[0];
    if (topic) actions.appendChild(button('更多类似', `提高「${topic}」的兴趣权重`, async () => {
      await send({type: 'PREFS_SET', patch: {topicWeights: {[topic]: 5}}});
      toast(`已提高「${topic}」的偏好权重`);
    }));
    card.appendChild(actions);
  }

  function updateCard(card) {
    const info = videoInfo(card);
    if (!info) return;
    const reason = Core.blockReason(info, prefs);
    const signature = `${info.bvid}|${info.title}|${info.upId}|${info.upName}|${reason}|${prefs.enabled}|${prefs.showActions}|${prefs.showFiltered}`;
    if (card.dataset.bppSignature === signature) return;
    card.dataset.bppSignature = signature;
    card.classList.remove('bpp-filtered', 'bpp-dimmed', 'bpp-card');
    card.querySelectorAll(':scope > .bpp-card-actions, :scope > .bpp-filter-reason').forEach(el => el.remove());
    if (!prefs.enabled) return;
    card.classList.add('bpp-card');
    if (reason) {
      if (!prefs.showFiltered) {
        card.classList.add('bpp-filtered');
        return;
      }
      card.classList.add('bpp-dimmed');
      const label = document.createElement('span');
      label.className = 'bpp-filter-reason';
      label.textContent = reason;
      card.appendChild(label);
    }
    attachActions(card, info);
  }

  function scan() {
    scanTimer = 0;
    if (!document.body) return;
    document.querySelectorAll(CARD_SELECTOR).forEach(card => updateCard(card));
  }

  function scheduleScan() {
    if (scanTimer) return;
    scanTimer = setTimeout(scan, 100);
  }

  function getCurrentBvid() {
    return location.pathname.match(/\/video\/(BV[A-Za-z0-9]{8,16})/)?.[1] || '';
  }

  function startWatch(bvid) {
    tracker = bvid ? {
      bvid, sessionId: `${bvid}:${Date.now()}:${Math.random().toString(36).slice(2, 6)}`,
      watchedSeconds: 0, lastSavedSeconds: 0, lastCurrentTime: null, video: null
    } : null;
  }

  function watchPayload() {
    if (!tracker || tracker.watchedSeconds < 3) return null;
    const title = document.querySelector('h1.video-title, .video-title')?.textContent?.trim() || document.title.replace(/_哔哩哔哩.*$/, '');
    const upNode = document.querySelector('.up-info-container .up-name, .up-name-container .up-name, .up-name');
    const upLink = document.querySelector('a[href*="space.bilibili.com/"]');
    return {
      kind: 'watch', sessionId: tracker.sessionId, bvid: tracker.bvid,
      title, upName: upNode?.textContent?.trim() || '',
      upId: upLink?.href?.match(/space\.bilibili\.com\/(\d+)/)?.[1] || '',
      watchedSeconds: Math.round(tracker.watchedSeconds),
      duration: Number.isFinite(tracker.video?.duration) ? tracker.video.duration : 0,
      timestamp: Date.now()
    };
  }

  function persistWatch(force = false) {
    if (!prefs.trackWatch || !tracker) return;
    const payload = watchPayload();
    if (!payload || (!force && payload.watchedSeconds - tracker.lastSavedSeconds < 6)) return;
    tracker.lastSavedSeconds = payload.watchedSeconds;
    void send({type: 'WATCH', event: payload}).catch(() => {});
  }

  function onTimeUpdate(event) {
    if (!prefs.trackWatch || !tracker || event.target?.tagName !== 'VIDEO') return;
    const video = event.target;
    if (tracker.video !== video) {
      tracker.video = video;
      tracker.lastCurrentTime = video.currentTime;
      return;
    }
    if (tracker.lastCurrentTime === null) { tracker.lastCurrentTime = video.currentTime; return; }
    const delta = video.currentTime - tracker.lastCurrentTime;
    tracker.lastCurrentTime = video.currentTime;
    if (!video.seeking && !video.paused && document.visibilityState === 'visible' && delta > 0 && delta <= 3) {
      tracker.watchedSeconds += delta;
    }
  }

  function onSeeking(event) {
    if (tracker && event.target === tracker.video) tracker.lastCurrentTime = tracker.video.currentTime;
  }

  function onEnded(event) {
    if (tracker && event.target === tracker.video) persistWatch(true);
  }

  function checkNavigation() {
    if (location.href === lastUrl) return;
    const previousBvid = tracker?.bvid || '';
    const nextBvid = getCurrentBvid();
    if (previousBvid !== nextBvid) {
      persistWatch(true);
      startWatch(nextBvid);
    }
    lastUrl = location.href;
    scheduleScan();
  }

  async function initialize() {
    try {
      const data = await ext.storage.local.get(Core.KEYS.prefs);
      prefs = Core.normalizePrefs(data[Core.KEYS.prefs]);
    } catch { /* The page still works without stored preferences. */ }
    startWatch(getCurrentBvid());
    scheduleScan();
    const observer = new MutationObserver(mutations => {
      if (mutations.some(change => change.addedNodes.length || change.removedNodes.length)) scheduleScan();
    });
    observer.observe(document.documentElement, {childList: true, subtree: true});
    ext.storage.onChanged.addListener(changes => {
      if (changes[Core.KEYS.prefs]) {
        const nextPrefs = Core.normalizePrefs(changes[Core.KEYS.prefs].newValue);
        if (prefs.trackWatch && !nextPrefs.trackWatch) persistWatch(true);
        prefs = nextPrefs;
        document.querySelectorAll('[data-bpp-signature]').forEach(node => delete node.dataset.bppSignature);
        scheduleScan();
      }
    });
    document.addEventListener('timeupdate', onTimeUpdate, true);
    document.addEventListener('seeking', onSeeking, true);
    document.addEventListener('ended', onEnded, true);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') persistWatch(true);
    });
    window.addEventListener('pagehide', () => persistWatch(true));
    window.addEventListener('popstate', checkNavigation);
    window.addEventListener('hashchange', checkNavigation);
    setInterval(checkNavigation, 1000);
    setInterval(persistWatch, 6000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, {once: true});
  else void initialize();
})();
