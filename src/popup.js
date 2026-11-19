'use strict';
(() => {
  const Core = globalThis.BiliCore;
  const ext = globalThis.browser || globalThis.chrome;
  const $ = id => document.getElementById(id);
  let prefs = Core.normalizePrefs();
  const descriptions = {
    balanced: '均衡相关性和内容多样性；原始页面只执行明确的过滤规则。',
    focus: '优先保留权重为 4–5 的主题；未知类别不会被误删。',
    explore: '控制台会更多地展示未深入观看过的主题。'
  };

  async function request(payload) {
    const response = await ext.runtime.sendMessage(payload);
    if (!response?.ok) throw new Error(response?.error || '操作失败');
    return response.data;
  }

  function status(message, isError = false) {
    $('status').textContent = message;
    $('status').classList.toggle('error', isError);
  }

  function draw() {
    $('enabled').checked = prefs.enabled;
    $('track-watch').checked = prefs.trackWatch;
    $('show-filtered').checked = prefs.showFiltered;
    document.querySelectorAll('[data-mode]').forEach(button => {
      const active = button.dataset.mode === prefs.mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    $('mode-hint').textContent = descriptions[prefs.mode];
  }

  async function patch(value) {
    try { prefs = await request({type: 'PREFS_SET', patch: value}); draw(); status('已保存'); }
    catch (error) { status(error.message, true); draw(); }
  }

  async function init() {
    try {
      const state = await request({type: 'GET_STATE'});
      prefs = Core.normalizePrefs(state.prefs);
      draw();
      const stats = Core.statsFor(state.events, 30);
      $('stat-videos').textContent = String(stats.videos);
      $('stat-minutes').textContent = String(stats.minutes);
      const top = stats.topics.filter(t => t.minutes > 0).slice(0, 3).map(t => t.name).join(' / ');
      $('top-topic').textContent = top ? `常看主题：${top}` : '暂无足够的观看记录';
    } catch (error) { status(error.message, true); }
  }

  $('enabled').addEventListener('change', event => patch({enabled: event.target.checked}));
  $('track-watch').addEventListener('change', event => patch({trackWatch: event.target.checked}));
  $('show-filtered').addEventListener('change', event => patch({showFiltered: event.target.checked}));
  document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => patch({mode: button.dataset.mode})));
  $('save-snapshot').addEventListener('click', async () => {
    try { await request({type: 'SNAPSHOT_SAVE'}); status('配置已保存，可在控制台恢复'); }
    catch (error) { status(error.message, true); }
  });
  $('open-dashboard').addEventListener('click', () => {
    ext.runtime.openOptionsPage().catch(error => status(error.message, true));
  });
  void init();
})();
