let logs = [];

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

browserAPI.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'log') {
    logs.push(msg.data);
    browserAPI.storage.local.set({ logs });
  } else if (msg.type === 'changeRecommendation') {
    // 处理推荐算法更改请求
    handleRecommendationChange(msg.profile, sender.tab);
  } else if (msg.type === 'aggregateNow') {
    aggregatePreferences();
    sendResponse();
    return true;
  }
});

// 处理推荐算法更改
async function handleRecommendationChange(profile, tab) {
  try {
    console.log('开始处理推荐算法更改...', profile);
    
    // 1. 清除当前浏览历史（静默操作）
    await clearBrowsingHistorySilently();
    
    // 2. 模拟用户行为（静默操作）
    await simulateUserBehaviorSilently(profile);
    
    // 3. 设置用户偏好（静默操作）
    await setUserPreferencesSilently(profile);
    
    // 4. 通知用户操作完成
    browserAPI.tabs.sendMessage(tab.id, {
      type: 'recommendationChanged',
      success: true
    });
    
  } catch (error) {
    console.error('推荐算法更改失败:', error);
    browserAPI.tabs.sendMessage(tab.id, {
      type: 'recommendationChanged',
      success: false,
      error: error.message
    });
  }
}

// 静默清除浏览历史
async function clearBrowsingHistorySilently() {
  return new Promise((resolve) => {
    // 使用fetch API直接清除历史，而不是打开新页面
    fetch('https://www.bilibili.com/account/history', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'clear_history'
      })
    }).then(() => {
      console.log('已静默清除浏览历史');
      resolve();
    }).catch(() => {
      console.log('清除历史失败，继续执行其他操作');
      resolve();
    });
  });
}

// 静默模拟用户行为
async function simulateUserBehaviorSilently(profile) {
  const { sectionCount, upCount } = profile;
  
  // 获取前3个最常访问的分区
  const topSections = Object.entries(sectionCount || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([section]) => section);
  
  // 获取前3个最常访问的UP主
  const topUps = Object.entries(upCount || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([up]) => up);
  
  // 静默访问分区页面（使用fetch而不是打开新标签页）
  for (const section of topSections) {
    await new Promise((resolve) => {
      fetch(`https://www.bilibili.com/v/${encodeURIComponent(section)}/`, {
        method: 'GET'
      }).then(() => {
        console.log(`静默访问分区: ${section}`);
        resolve();
      }).catch(() => {
        console.log(`访问分区失败: ${section}`);
        resolve();
      });
    });
  }
  
  // 静默搜索UP主
  for (const up of topUps) {
    await new Promise((resolve) => {
      fetch(`https://search.bilibili.com/upuser?keyword=${encodeURIComponent(up)}`, {
        method: 'GET'
      }).then(() => {
        console.log(`静默搜索UP主: ${up}`);
        resolve();
      }).catch(() => {
        console.log(`搜索UP主失败: ${up}`);
        resolve();
      });
    });
  }
}

// 静默设置用户偏好
async function setUserPreferencesSilently(profile) {
  return new Promise((resolve) => {
    // 使用fetch API直接设置偏好，而不是打开设置页面
    const interests = Object.keys(profile.sectionCount || {});
    
    fetch('https://www.bilibili.com/account/setting', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'set_preferences',
        interests: interests
      })
    }).then(() => {
      console.log('已静默设置用户偏好');
      resolve();
    }).catch(() => {
      console.log('设置偏好失败，继续执行');
      resolve();
    });
  });
}

// 每天聚合一次兴趣画像
function aggregatePreferences() {
  const today = new Date().toISOString().slice(0, 10);
  browserAPI.storage.local.get(['logs', 'history'], (res) => {
    const logs = res.logs || [];
    const history = res.history || {};
    // 统计分区
    const sectionCount = {};
    logs.forEach(log => {
      if (log.section) {
        sectionCount[log.section] = (sectionCount[log.section] || 0) + 1;
      }
    });
    // 统计UP主
    const upCount = {};
    logs.forEach(log => {
      if (log.upName) {
        upCount[log.upName] = (upCount[log.upName] || 0) + 1;
      }
    });
    history[today] = { sectionCount, upCount };
    browserAPI.storage.local.set({ history });
  });
}

// 使用定时器替代Alarm API（更兼容）
setInterval(aggregatePreferences, 24 * 60 * 60 * 1000); // 每24小时执行一次

// 如果支持Alarm API，则使用它
if (browserAPI.alarms) {
  browserAPI.alarms.create('aggregate', { periodInMinutes: 60 * 24 });
  browserAPI.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === 'aggregate') aggregatePreferences();
  });
} 