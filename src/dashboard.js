'use strict';
(() => {
  const Core = globalThis.BiliCore;
  const ext = globalThis.browser || globalThis.chrome;
  const $ = id => document.getElementById(id);
  let state = {prefs: Core.normalizePrefs(), events: [], snapshots: [], saved: []};
  let feed = [];
  let fetchedAt = 0;
  let weightsDraft = {...state.prefs.topicWeights};
  let discoverModeChanged = false;
  const headings = {
    overview: ['概览', '了解最近的观看兴趣和当前推荐配置。'],
    discover: ['内容探索', '从公开榜单发现内容，自主控制展示顺序。'],
    rules: ['偏好与过滤', '调整兴趣权重，管理屏蔽规则。'],
    history: ['历史与数据', '管理配置快照、备份和隐私选项。']
  };

  async function request(payload) {
    const response = await ext.runtime.sendMessage(payload);
    if (!response?.ok) throw new Error(response?.error || '操作失败');
    return response.data;
  }

  function status(message, error = false) {
    const node = $('global-status');
    node.textContent = message;
    node.classList.toggle('error', error);
  }

  function node(tag, className, content) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (content !== undefined) element.textContent = String(content);
    return element;
  }

  function empty(container, message) {
    container.replaceChildren(node('div', 'empty', message));
  }

  function videoLink(video) {
    const a = node('a');
    a.href = `https://www.bilibili.com/video/${video.bvid}/`;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  }

  function dateString(timestamp) {
    return new Date(timestamp).toLocaleString('zh-CN', {year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'});
  }

  function renderOverview() {
    const stats = Core.statsFor(state.events, 30);
    $('overview-videos').textContent = stats.videos;
    $('overview-minutes').textContent = stats.minutes;
    $('overview-sessions').textContent = stats.sessions;
    const topicContainer = $('topic-bars');
    topicContainer.replaceChildren();
    const significant = stats.topics.filter(item => item.minutes > 0).slice(0, 8);
    if (!significant.length) empty(topicContainer, '暂无有效观看记录');
    else for (const item of significant) {
      const row = node('div', 'bar-line');
      row.appendChild(node('span', '', item.name));
      const track = node('div', 'bar-track');
      const fill = node('div', 'bar-fill');
      fill.style.width = `${Math.round(item.minutes / significant[0].minutes * 100)}%`;
      track.appendChild(fill);
      row.appendChild(track);
      row.appendChild(node('span', 'bar-value', `${item.minutes} 分`));
      topicContainer.appendChild(row);
    }
    const recentContainer = $('recent-watches');
    recentContainer.replaceChildren();
    const recent = state.events.slice().sort((a, b) => b.timestamp - a.timestamp).slice(0, 8);
    if (!recent.length) empty(recentContainer, '尚未记录观看。打开 B 站播放视频后会自动统计。');
    else for (const item of recent) {
      const row = node('div', 'recent-item');
      const left = node('div');
      const a = videoLink(item);
      a.textContent = item.title || item.bvid;
      left.appendChild(a);
      left.appendChild(node('small', '', item.upName || dateString(item.timestamp)));
      row.appendChild(left);
      row.appendChild(node('span', '', `${Math.round(item.watchedSeconds)} 秒`));
      recentContainer.appendChild(row);
    }
    document.querySelectorAll('.mode-card').forEach(button => {
      button.classList.toggle('active', button.dataset.mode === state.prefs.mode);
      button.setAttribute('aria-pressed', String(button.dataset.mode === state.prefs.mode));
    });
    $('header-state').textContent = `${state.prefs.enabled ? '正在运行' : '已暂停'} · ${({balanced:'均衡',focus:'聚焦',explore:'探索'})[state.prefs.mode]}`;
  }

  function renderRules() {
    weightsDraft = {...state.prefs.topicWeights};
    const container = $('weights');
    container.replaceChildren();
    for (const topic of Core.TOPIC_NAMES) {
      const row = node('label', 'weight-row');
      row.appendChild(node('span', '', topic));
      const input = node('input');
      input.type = 'range'; input.min = '0'; input.max = '5'; input.step = '1';
      input.value = String(weightsDraft[topic]);
      input.setAttribute('aria-label', `${topic}权重`);
      const output = node('output', '', input.value);
      input.addEventListener('input', () => { output.textContent = input.value; weightsDraft[topic] = Number(input.value); });
      row.append(input, output);
      container.appendChild(row);
    }
    for (const [key, field] of [
      ['blockedKeywords', 'blocked-keywords'], ['blockedUps', 'blocked-ups'],
      ['blockedUids', 'blocked-uids'], ['blockedVideos', 'blocked-videos']
    ]) $(field).value = (state.prefs[key] || []).join('\n');
    $('show-actions').checked = state.prefs.showActions;
    $('rules-show-filtered').checked = state.prefs.showFiltered;
  }

  function renderSnapshots() {
    const container = $('snapshot-list');
    container.replaceChildren();
    if (!state.snapshots.length) return empty(container, '还没有保存配置快照');
    for (const item of state.snapshots) {
      const row = node('div', 'snapshot-item');
      const info = node('div');
      info.append(node('strong', '', item.name), node('small', '', dateString(item.timestamp)));
      const actions = node('div', 'buttons');
      const apply = node('button', 'button light', '应用');
      apply.addEventListener('click', async () => {
        if (!confirm(`应用「${item.name}」？当前规则将被替换。`)) return;
        await action(async () => { await request({type:'SNAPSHOT_APPLY', id:item.id}); await reload(); status('配置已恢复'); });
      });
      const remove = node('button', 'button danger', '删除');
      remove.addEventListener('click', async () => {
        if (!confirm(`删除配置「${item.name}」？`)) return;
        await action(async () => { await request({type:'SNAPSHOT_DELETE', id:item.id}); await reload(); status('已删除快照'); });
      });
      actions.append(apply, remove);
      row.append(info, actions);
      container.appendChild(row);
    }
  }

  function renderSaved() {
    const container = $('saved-videos');
    container.replaceChildren();
    $('saved-count').textContent = `${state.saved.length} 条`;
    if (!state.saved.length) return empty(container, '在探索列表中点击“稍后看”，视频将保存在这里。');
    for (const item of state.saved) {
      const row = node('div', 'saved-item');
      const link = videoLink(item);
      link.textContent = item.title || item.bvid;
      const remove = node('button', '', '移除');
      remove.type = 'button';
      remove.addEventListener('click', () => action(async () => {
        await request({type: 'SAVED_TOGGLE', video: item});
        await reload();
        status('已从稍后看移除');
      }));
      row.append(link, remove);
      container.appendChild(row);
    }
  }

  function renderSettings() {
    $('settings-track-watch').checked = state.prefs.trackWatch;
    $('settings-enabled').checked = state.prefs.enabled;
  }

  function renderVideo(video, savedSet) {
    const card = node('article', 'video-card');
    const link = videoLink(video);
    if (video.cover && Core.validCover(video.cover)) {
      const img = node('img', 'video-cover');
      img.src = video.cover; img.alt = ''; img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      link.appendChild(img);
    } else link.appendChild(node('div', 'video-cover'));
    const body = node('div', 'video-body');
    const title = videoLink(video);
    title.className = 'video-title'; title.title = video.title; title.textContent = video.title || video.bvid;
    body.appendChild(title);
    body.appendChild(node('div', 'video-meta', `${video.upName || '未知 UP'} · ${video.source || '榜单'}`));
    body.appendChild(node('div', 'video-tags', video.topics.length ? video.topics.slice(0, 3).join(' / ') : '未识别主题'));
    const foot = node('div', 'video-foot');
    foot.appendChild(node('span', 'muted small', video.views ? `${new Intl.NumberFormat('zh-CN', {notation:'compact'}).format(video.views)} 播放` : ''));
    const save = node('button', '', savedSet.has(video.bvid) ? '取消稍后看' : '稍后看');
    save.type = 'button';
    save.addEventListener('click', () => action(async () => {
      const result = await request({type:'SAVED_TOGGLE', video});
      await reload();
      status(result.saved ? '已加入稍后看' : '已从稍后看移除');
    }));
    foot.appendChild(save);
    body.appendChild(foot);
    card.append(link, body);
    return card;
  }

  function renderFeed() {
    const container = $('feed-videos');
    container.replaceChildren();
    const mode = $('discover-mode').value;
    const needle = $('discover-search').value.trim().toLocaleLowerCase();
    const ranked = Core.rankVideos(feed, {...state.prefs, enabled:true, mode}, state.events, 100)
      .filter(item => !needle || `${item.title} ${item.upName}`.toLocaleLowerCase().includes(needle));
    const displayed = ranked.slice(0, 36);
    $('feed-count').textContent = feed.length ? `${displayed.length} / ${feed.length} 条` : '尚未获取候选视频';
    if (!displayed.length && feed.length) return empty(container, '没有符合当前过滤规则的视频。可调整关键词、权重或搜索条件。');
    const savedSet = new Set(state.saved.map(video => video.bvid));
    for (const video of displayed) container.appendChild(renderVideo(video, savedSet));
  }

  function render() {
    if (!discoverModeChanged) $('discover-mode').value = state.prefs.mode;
    renderOverview(); renderRules(); renderSnapshots(); renderSaved(); renderSettings(); renderFeed();
  }

  async function reload() {
    state = await request({type:'GET_STATE'});
    state.prefs = Core.normalizePrefs(state.prefs);
    render();
  }

  async function action(fn) {
    try { await fn(); }
    catch (error) { status(error.message || '操作失败', true); }
  }

  async function patch(value) {
    await action(async () => {
      await request({type:'PREFS_SET', patch:value});
      await reload();
      status('设置已保存');
    });
  }

  function switchView(view) {
    if (!headings[view]) return;
    document.querySelectorAll('.nav-link').forEach(button => button.classList.toggle('active', button.dataset.view === view));
    document.querySelectorAll('.view').forEach(section => section.classList.toggle('active', section.id === `view-${view}`));
    $('page-title').textContent = headings[view][0];
    $('page-subtitle').textContent = headings[view][1];
  }

  async function fetchFeed() {
    const button = $('fetch-feed');
    button.disabled = true;
    button.textContent = '正在获取…';
    $('feed-message').textContent = '正在从 B 站公开榜单请求视频。';
    try {
      const response = await request({type:'DISCOVER_FETCH'});
      feed = response.videos;
      fetchedAt = response.fetchedAt;
      renderFeed();
      const result = `获取 ${feed.length} 条候选视频`;
      const errors = response.errors.join('；');
      $('feed-message').textContent = errors ? `${result}。部分来源失败：${errors}` : `${result}。同一视频已去重。`;
      if (!feed.length) status('公开榜单暂不可用，请使用下方链接访问 B 站原页面。', true);
      else status('候选视频已更新');
    } catch (error) {
      $('feed-message').textContent = `加载失败：${error.message}。可使用下方链接访问 B 站热门。`;
      status(error.message, true);
    } finally {
      button.disabled = false; button.textContent = '重新获取';
    }
  }

  function bind() {
    document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => switchView(button.dataset.view)));
    document.querySelectorAll('.mode-card').forEach(button => button.addEventListener('click', () => patch({mode:button.dataset.mode})));
    $('save-weights').addEventListener('click', () => patch({topicWeights:{...weightsDraft}}));
    $('save-rules').addEventListener('click', () => {
      const patchData = {
        blockedKeywords: Core.parseList($('blocked-keywords').value),
        blockedUps: Core.parseList($('blocked-ups').value),
        blockedUids: Core.parseList($('blocked-uids').value).filter(uid => /^\d{1,24}$/.test(uid)),
        blockedVideos: Core.parseList($('blocked-videos').value).filter(Core.validBvid),
        showActions: $('show-actions').checked,
        showFiltered: $('rules-show-filtered').checked
      };
      void patch(patchData);
    });
    $('create-snapshot').addEventListener('click', () => action(async () => {
      await request({type:'SNAPSHOT_SAVE', name:$('snapshot-name').value});
      $('snapshot-name').value = '';
      await reload();
      status('配置快照已保存');
    }));
    $('fetch-feed').addEventListener('click', fetchFeed);
    $('discover-mode').addEventListener('change', () => { discoverModeChanged = true; renderFeed(); });
    $('discover-search').addEventListener('input', renderFeed);
    $('settings-track-watch').addEventListener('change', event => patch({trackWatch:event.target.checked}));
    $('settings-enabled').addEventListener('change', event => patch({enabled:event.target.checked}));
    $('export-data').addEventListener('click', () => action(async () => {
      const data = await request({type:'EXPORT'});
      const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
      const url = URL.createObjectURL(blob);
      const link = node('a'); link.href = url;
      link.download = `bilibili-preference-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
      status('备份已导出');
    }));
    $('import-file').addEventListener('change', event => action(async () => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) throw new Error('备份文件不能超过 2 MB');
      const data = JSON.parse(await file.text());
      if (!confirm('导入会替换当前设置、观看记录、配置快照和稍后看。是否继续？')) return;
      const result = await request({type:'IMPORT', data});
      await reload();
      status(`导入完成：${result.events} 条观看记录，${result.snapshots} 个快照`);
    }));
    $('clear-events').addEventListener('click', () => action(async () => {
      if (!confirm('确定清空所有本地观看记录？此操作不可撤销。')) return;
      await request({type:'CLEAR_EVENTS'}); await reload(); status('观看记录已清空');
    }));
    $('reset-all').addEventListener('click', () => action(async () => {
      if (!confirm('确定重置所有本地偏好、观看记录、配置快照与稍后看？此操作不可撤销。')) return;
      await request({type:'RESET_ALL'}); feed = [];
      await reload(); status('已重置');
    }));
  }

  bind();
  void reload().catch(error => status(error.message, true));
})();
