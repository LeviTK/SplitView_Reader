/**
 * 后台服务脚本 (Service Worker)
 * 功能：
 * 1. 监听插件图标点击事件 (chrome.action.onClicked)。
 * 2. 动态向当前标签页注入 CSS (content.css) 和 JS (lib/markdown-it.min.js, content.js)。
 * 3. 发送 'startSelection' 消息激活页面内的检查器。
 */
const ACTION_START_SELECTION = 'startSelection';
const CONTENT_SCRIPT_RUNTIME_VERSION = chrome.runtime.getManifest().version;
const SUPPORTED_PROTOCOLS = ['http:', 'https:'];
const RESTRICTED_URL_ERROR_FRAGMENT = 'Cannot access a chrome:// URL';

function isRestrictedUrlInjectionError(err) {
  return Boolean(err && err.message && err.message.includes(RESTRICTED_URL_ERROR_FRAGMENT));
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('SplitView Reader installed');
});

// 点击插件图标，启动框选模式
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url) return;

  let protocol = '';
  try {
    protocol = new URL(tab.url).protocol;
  } catch (err) {
    console.warn('SplitView: invalid tab URL, skip injection:', tab.url, err);
    return;
  }

  if (!SUPPORTED_PROTOCOLS.includes(protocol)) {
    console.warn('SplitView: unsupported page for injection:', tab.url);
    return;
  }

  // 注入 CSS
  try {
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ['content.css']
    });
  } catch (err) {
    if (isRestrictedUrlInjectionError(err)) {
      console.warn('SplitView: restricted page, skip CSS injection.');
      return;
    }
    console.error('Failed to inject CSS:', err);
  }

  // 检查内容脚本是否已注入且版本一致，避免重复注入旧代码
  let isScriptInjected = false;
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({
        initialized: !!window.splitViewInitialized,
        version: window.splitViewRuntimeVersion || null
      })
    });
    const scriptState = results && results[0] && results[0].result;
    if (
      scriptState &&
      scriptState.initialized &&
      scriptState.version === CONTENT_SCRIPT_RUNTIME_VERSION
    ) {
      isScriptInjected = true;
    }
  } catch (e) {
    // 忽略检查错误
  }

  if (!isScriptInjected) {
    // 注入 JS
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['lib/markdown-it.min.js', 'content.js']
      });
    } catch (err) {
      if (isRestrictedUrlInjectionError(err)) {
        console.warn('SplitView: restricted page, skip JS injection.');
        return;
      }
      console.error('Failed to inject JS:', err);
    }
  }

  // 发送启动消息，确保即使脚本已存在也能重新激活
  try {
    await chrome.tabs.sendMessage(tab.id, { action: ACTION_START_SELECTION });
  } catch (err) {
    // 忽略错误，可能是脚本刚注入还未准备好，或者已经自动启动
    console.log('Message sending failed (script might be initializing):', err);
  }
});
