// 检测浏览器类型
function getBrowserType() {
  if (typeof browser !== 'undefined') {
    return 'firefox';
  } else if (typeof chrome !== 'undefined') {
    return 'chrome';
  }
  return 'unknown';
}

const browserAPI = getBrowserType() === 'firefox' ? browser : chrome;

// 预设的热门推荐算法
const PRESET_PROFILES = {
  '科技': {
    sectionCount: {
      '科技': 15,
      '数码': 12,
      '软件应用': 10,
      '计算机技术': 8,
      '人工智能': 6
    },
    upCount: {
      '科技UP主1': 8,
      '数码UP主1': 6,
      '编程UP主1': 5
    }
  },
  '生活': {
    sectionCount: {
      '生活': 15,
      '美食': 12,
      '时尚': 10,
      '运动': 8,
      '旅游': 6
    },
    upCount: {
      '生活UP主1': 8,
      '美食UP主1': 6,
      '时尚UP主1': 5
    }
  },
  '历史': {
    sectionCount: {
      '历史': 15,
      '人文': 12,
      '文化': 10,
      '地理': 8,
      '考古': 6
    },
    upCount: {
      '历史UP主1': 8,
      '人文UP主1': 6,
      '文化UP主1': 5
    }
  },
  '军事': {
    sectionCount: {
      '军事': 15,
      '武器': 12,
      '战争史': 10,
      '国防': 8,
      '战略': 6
    },
    upCount: {
      '军事UP主1': 8,
      '武器UP主1': 6,
      '战略UP主1': 5
    }
  },
  '娱乐': {
    sectionCount: {
      '娱乐': 15,
      '音乐': 12,
      '舞蹈': 10,
      '明星': 8,
      '综艺': 6
    },
    upCount: {
      '娱乐UP主1': 8,
      '音乐UP主1': 6,
      '舞蹈UP主1': 5
    }
  },
  '游戏': {
    sectionCount: {
      '游戏': 15,
      '电子竞技': 12,
      '单机游戏': 10,
      '网络游戏': 8,
      '手机游戏': 6
    },
    upCount: {
      '游戏UP主1': 8,
      '电竞UP主1': 6,
      '单机UP主1': 5
    }
  },
  '知识': {
    sectionCount: {
      '知识': 15,
      '科学': 12,
      '教育': 10,
      '哲学': 8,
      '心理学': 6
    },
    upCount: {
      '知识UP主1': 8,
      '科学UP主1': 6,
      '教育UP主1': 5
    }
  }
};

// 生成随机推荐算法
function generateRandomProfile() {
  return {
    sectionCount: {
      '科技': Math.floor(Math.random() * 10) + 1,
      '生活': Math.floor(Math.random() * 10) + 1,
      '历史': Math.floor(Math.random() * 10) + 1,
      '军事': Math.floor(Math.random() * 10) + 1,
      '娱乐': Math.floor(Math.random() * 10) + 1,
      '游戏': Math.floor(Math.random() * 10) + 1,
      '知识': Math.floor(Math.random() * 10) + 1
    },
    upCount: {
      '随机UP主1': Math.floor(Math.random() * 5) + 1,
      '随机UP主2': Math.floor(Math.random() * 5) + 1,
      '随机UP主3': Math.floor(Math.random() * 5) + 1
    }
  };
}

function renderProfile(profile) {
  const div = document.getElementById('current-profile');
  if (!profile) {
    div.innerText = '暂无画像';
    return;
  }
  div.innerHTML =
    '<b>分区：</b>' + Object.entries(profile.sectionCount || {}).map(([k, v]) => `${k}(${v})`).join(', ') + '<br>' +
    '<b>UP主：</b>' + Object.entries(profile.upCount || {}).map(([k, v]) => `${k}(${v})`).join(', ');
}

function renderHistory(history) {
  const ul = document.getElementById('history-list');
  ul.innerHTML = '';
  
  // 如果没有历史数据，显示预设选项
  if (Object.keys(history).length === 0) {
    renderPresetProfiles();
    return;
  }
  
  Object.entries(history).forEach(([date, profile]) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="date-text">${date}</span>
      <button class="apply-btn" data-action="apply" data-date="${date}" data-profile='${JSON.stringify(profile)}'>
        🎯 应用此推荐
      </button>
      <button class="preview-btn" data-action="preview" data-profile='${JSON.stringify(profile)}'>
        👁️ 预览
      </button>
    `;
    ul.appendChild(li);
  });
}

// 渲染预设推荐算法
function renderPresetProfiles() {
  const ul = document.getElementById('history-list');
  ul.innerHTML = '<li class="preset-header">🎯 选择预设推荐算法：</li>';
  
  Object.entries(PRESET_PROFILES).forEach(([name, profile]) => {
    const li = document.createElement('li');
    li.className = 'preset-item';
    li.innerHTML = `
      <span class="preset-name">${name}</span>
      <button class="apply-btn" data-action="apply" data-name="${name}" data-profile='${JSON.stringify(profile)}'>
        🛠️ 应用（完整）
      </button>
      <button class="quick-apply-btn" data-action="quick-apply" data-name="${name}" data-profile='${JSON.stringify(profile)}'>
        ⚡ 快速应用
      </button>
      <button class="preview-btn" data-action="preview" data-profile='${JSON.stringify(profile)}'>
        👁️ 预览
      </button>
    `;
    ul.appendChild(li);
  });
  // 添加随机选项
  const randomLi = document.createElement('li');
  randomLi.className = 'preset-item';
  randomLi.innerHTML = `
    <span class="preset-name">随机</span>
    <button class="apply-btn" data-action="apply" data-name="随机" data-random="true">
      🛠️ 应用（完整）
    </button>
    <button class="quick-apply-btn" data-action="quick-apply" data-name="随机" data-random="true">
      ⚡ 快速应用
    </button>
    <button class="preview-btn" data-action="preview" data-random="true">
      👁️ 预览
    </button>
  `;
  ul.appendChild(randomLi);
}

function renderRecommend(profile) {
  const div = document.getElementById('recommend');
  if (!profile) {
    div.innerText = '暂无推荐';
    return;
  }
  // 推荐分区和UP主
  const topSection = Object.entries(profile.sectionCount || {}).sort((a, b) => b[1] - a[1])[0]?.[0];
  const topUp = Object.entries(profile.upCount || {}).sort((a, b) => b[1] - a[1])[0]?.[0];
  let html = '';
  if (topSection) {
    html += `<a href="https://www.bilibili.com/v/${encodeURIComponent(topSection)}/" target="_blank">分区：${topSection}</a><br>`;
  }
  if (topUp) {
    html += `<a href="https://search.bilibili.com/upuser?keyword=${encodeURIComponent(topUp)}" target="_blank">UP主：${topUp}</a>`;
  }
  div.innerHTML = html || '暂无推荐';
}

// 完整模式：清除历史+模拟行为+设置偏好
function applyRecommendation(name, profile) {
  if (confirm(`确定要应用"${name}"的推荐算法吗？\n\n这将：\n1. 清除当前浏览历史\n2. 模拟该类型的用户行为\n3. 重新设置偏好\n4. 刷新页面应用新推荐\n\n点击确定开始操作...`)) {
    showLoadingState();
    updateProgressBar(10, '正在清除历史...');
    browserAPI.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (tabs[0] && tabs[0].url.includes('bilibili.com')) {
        browserAPI.tabs.sendMessage(tabs[0].id, {
          type: 'changeRecommendation',
          profile: profile
        }, (response) => {
          updateProgressBar(80, '正在刷新页面...');
          setTimeout(() => {
            updateProgressBar(100, '完成！正在刷新...');
            setTimeout(() => {
              hideLoadingState();
            }, 300);
          }, 500);
        });
      } else {
        alert('请在B站页面使用此功能！');
        hideLoadingState();
      }
    });
  }
}
// 极速模式：只设置偏好
function quickApplyRecommendation(name, profile) {
  if (confirm(`确定要快速应用"${name}"的推荐算法吗？\n\n这将：\n1. 重新设置偏好\n2. 刷新页面应用新推荐\n\n点击确定开始操作...`)) {
    showLoadingState();
    updateProgressBar(10, '正在设置偏好...');
    browserAPI.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (tabs[0] && tabs[0].url.includes('bilibili.com')) {
        browserAPI.tabs.sendMessage(tabs[0].id, {
          type: 'quickChangeRecommendation',
          profile: profile
        }, (response) => {
          updateProgressBar(80, '正在刷新页面...');
          setTimeout(() => {
            updateProgressBar(100, '完成！正在刷新...');
            setTimeout(() => {
              hideLoadingState();
            }, 300);
          }, 500);
        });
      } else {
        alert('请在B站页面使用此功能！');
        hideLoadingState();
      }
    });
  }
}

// 预览画像
function previewProfile(profile) {
  renderProfile(profile);
  renderRecommend(profile);
}

// 显示加载状态
function showLoadingState() {
  const loadingDiv = document.getElementById('loading');
  if (loadingDiv) {
    loadingDiv.style.display = 'block';
    updateProgressBar(0, '准备开始...');
  }
}

// 隐藏加载状态
function hideLoadingState() {
  const loadingDiv = document.getElementById('loading');
  if (loadingDiv) {
    loadingDiv.style.display = 'none';
  }
}

// 显示成功消息
function showSuccessMessage(message) {
  const successDiv = document.getElementById('success-message');
  if (successDiv) {
    successDiv.style.display = 'block';
    successDiv.textContent = message;
    setTimeout(() => {
      successDiv.style.display = 'none';
    }, 5000);
  }
}

// 添加一键清除信息茧房功能
function clearInformationBubble() {
  if (confirm('确定要清除信息茧房吗？\n\n这将应用"随机"推荐算法，让你接触到更多样化的内容。\n\n点击确定开始操作...')) {
    showLoadingState();
    
    // 使用预设的随机推荐算法
    const randomProfile = generateRandomProfile();
    
    browserAPI.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (tabs[0] && tabs[0].url.includes('bilibili.com')) {
        browserAPI.tabs.sendMessage(tabs[0].id, {
          type: 'changeRecommendation',
          profile: randomProfile
        });
        showSuccessMessage('正在清除信息茧房...');
      } else {
        alert('请在B站页面使用此功能！');
        hideLoadingState();
      }
    });
  }
}

// 事件委托处理按钮点击
function handleButtonClick(event) {
  const target = event.target;
  if (target.classList.contains('apply-btn') || target.classList.contains('quick-apply-btn') || target.classList.contains('preview-btn')) {
    const action = target.getAttribute('data-action');
    const name = target.getAttribute('data-name') || target.getAttribute('data-date') || '未知';
    const profileData = target.getAttribute('data-profile');
    const isRandom = target.getAttribute('data-random') === 'true';
    let profile;
    if (isRandom) {
      profile = generateRandomProfile();
    } else if (profileData) {
      try {
        profile = JSON.parse(profileData);
      } catch (error) {
        console.error('解析profile数据失败:', error);
        return;
      }
    }
    if (action === 'apply' && profile) {
      applyRecommendation(name, profile);
    } else if (action === 'quick-apply' && profile) {
      quickApplyRecommendation(name, profile);
    } else if (action === 'preview' && profile) {
      previewProfile(profile);
    }
  }
}

// 保证预设推荐算法始终可见
function renderAllProfiles() {
  browserAPI.storage.local.get(['history'], (res) => {
    const history = res.history || {};
    // 默认展示最新画像
    const dates = Object.keys(history).sort();
    const latest = dates[dates.length - 1];
    renderProfile(history[latest]);
    renderRecommend(history[latest]);
    renderHistory(history);
    renderPresetProfiles(); // 预设推荐算法始终可见
    
    // 添加清除信息茧房按钮
    const clearButton = document.getElementById('clear-bubble-btn');
    if (clearButton) {
      clearButton.onclick = clearInformationBubble;
    }
    
    // 添加事件委托监听器
    const historyList = document.getElementById('history-list');
    if (historyList) {
      historyList.addEventListener('click', handleButtonClick);
    }
  });
}
// 页面加载时渲染所有画像和预设
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderAllProfiles);
} else {
  renderAllProfiles();
}

// 获取当前画像按钮事件监听
document.addEventListener('DOMContentLoaded', function() {
  const refreshBtn = document.getElementById('refresh-profile-btn');
  if (refreshBtn) {
    refreshBtn.onclick = function() {
      refreshBtn.disabled = true;
      refreshBtn.textContent = '正在获取...';
      browserAPI.runtime.sendMessage({ type: 'aggregateNow' }, function() {
        // 聚合完成后刷新画像展示
        browserAPI.storage.local.get(['history'], (res) => {
          const history = res.history || {};
          const dates = Object.keys(history).sort();
          const latest = dates[dates.length - 1];
          renderProfile(history[latest]);
          renderRecommend(history[latest]);
          renderHistory(history);
          refreshBtn.disabled = false;
          refreshBtn.textContent = '获取当前画像';
        });
      });
    };
  }
});

// 进度条相关
function updateProgressBar(percent, text) {
  const bar = document.getElementById('progress-bar');
  const txt = document.getElementById('progress-text');
  if (bar) bar.style.width = percent + '%';
  if (txt && text) txt.textContent = text;
} 