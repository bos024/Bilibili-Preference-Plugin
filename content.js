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

// 只在视频页采集数据
if (location.pathname.startsWith('/video/')) {
  const videoId = location.pathname.split('/')[2];
  // 采集分区
  const section = document.querySelector('.first-channel')?.innerText || '';
  // 采集UP主
  const upName = document.querySelector('.up-name')?.innerText || '';
  // 采集时间
  const time = Date.now();
  // 发送到background
  browserAPI.runtime.sendMessage({
    type: 'log',
    data: {
      videoId,
      section,
      upName,
      time
    }
  });
}

// 监听来自popup的消息，执行推荐算法更改
browserAPI.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'changeRecommendation') {
    changeRecommendation(msg.profile);
  } else if (msg.type === 'quickChangeRecommendation') {
    quickChangeRecommendation(msg.profile);
  }
});

// 更改推荐算法的主要函数
async function changeRecommendation(profile) {
  console.log('开始更改B站推荐算法...', profile);

  // 三步并发执行
  await Promise.all([
    clearBrowsingHistorySilently(),
    simulateUserBehaviorSilently(profile),
    setUserPreferencesSilently(profile)
  ]);

  // 刷新页面
  setTimeout(() => {
    window.location.reload();
  }, 1000); // 可适当缩短
}

// 极速模式：只设置偏好，极快刷新
async function quickChangeRecommendation(profile) {
  await setUserPreferencesSilently(profile);
  setTimeout(() => {
    window.location.reload();
  }, 500);
}

// 静默清除浏览历史
async function clearBrowsingHistorySilently() {
  try {
    // 使用fetch API直接清除历史，而不是打开新页面
    const response = await fetch('https://www.bilibili.com/account/history', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'clear_history'
      })
    });
    
    if (response.ok) {
      console.log('已静默清除浏览历史');
    } else {
      console.log('清除历史失败，继续执行其他操作');
    }
  } catch (error) {
    console.error('清除历史失败:', error);
  }
}

// 静默模拟用户行为
async function simulateUserBehaviorSilently(profile) {
  try {
    const { sectionCount, upCount } = profile;
    const topSections = Object.entries(sectionCount || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([section]) => section);

    const topUps = Object.entries(upCount || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([up]) => up);

    // 并发请求分区
    const sectionPromises = topSections.map(section =>
      fetch(`https://www.bilibili.com/v/${encodeURIComponent(section)}/`, { method: 'GET' })
        .then(() => console.log(`静默访问分区: ${section}`))
        .catch(() => console.log(`访问分区失败: ${section}`))
    );

    // 并发请求UP主
    const upPromises = topUps.map(up =>
      fetch(`https://search.bilibili.com/upuser?keyword=${encodeURIComponent(up)}`, { method: 'GET' })
        .then(() => console.log(`静默搜索UP主: ${up}`))
        .catch(() => console.log(`搜索UP主失败: ${up}`))
    );

    // 并发等待所有请求完成
    await Promise.all([...sectionPromises, ...upPromises]);
    // 如需延时，可在此 sleep 一次
    // await sleep(200);

  } catch (error) {
    console.error('模拟用户行为失败:', error);
  }
}

// 静默设置用户偏好
async function setUserPreferencesSilently(profile) {
  try {
    // 使用fetch API直接设置偏好，而不是打开设置页面
    const interests = Object.keys(profile.sectionCount || {});
    
    const response = await fetch('https://www.bilibili.com/account/setting', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'set_preferences',
        interests: interests
      })
    });
    
    if (response.ok) {
      console.log('已静默设置用户偏好');
    } else {
      console.log('设置偏好失败，继续执行');
    }
  } catch (error) {
    console.error('设置偏好失败:', error);
  }
}

// 工具函数：延时
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 注入到页面的脚本，用于执行DOM操作
const injectedScript = `
  // 监听来自content script的消息
  window.addEventListener('message', (event) => {
    if (event.data.type === 'clearHistory') {
      eval(event.data.script);
    } else if (event.data.type === 'setPreferences') {
      eval(event.data.script);
    }
  });
`;

// 注入脚本到页面
const script = document.createElement('script');
script.textContent = injectedScript;
document.head.appendChild(script); 