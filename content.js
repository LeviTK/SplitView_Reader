/**
 * 核心内容脚本 (Content Script)
 * 功能：
 * 1. 实现元素检查器 (Inspector)：悬停高亮、标签点击触发同级提取确认。
 * 2. 交互逻辑：点击单项提取，Esc 取消检查。
 * 3. 内容提取：根据 Site Rules 自动展开内容 (expandContent)、清洗 DOM。
 * 4. 分屏阅读器：在页面右侧渲染提取的内容 (富文本/Markdown)。
 * 5. 工具栏功能：复制、复制源码、PDF导出等。
 */
let isInspecting = false;
let highlightBox = null;
let highlightLabel = null;
let currentHoveredElement = null;
let lastRealHoveredElement = null;
const ACTION_START_SELECTION = 'startSelection';
const CONTENT_SCRIPT_RUNTIME_VERSION = chrome.runtime.getManifest().version;
const DEFAULT_FALLBACK_WIDTH_PCT = 40;
const SplitViewSettings = globalThis.SplitViewSettings;
if (!SplitViewSettings) {
  throw new Error('SplitView settings module missing. Ensure split_settings.js is injected first.');
}

const {
  STORAGE_KEY_SPLIT_SETTINGS,
  DEFAULT_SPLIT_SETTINGS,
  deepClone,
  clampWidth,
  normalizeDomain,
  getDomainKey,
  matchDomainRule,
  normalizeSplitSettings,
  loadSplitSettings: loadSplitSettingsFromStorage,
  saveSplitSettings: saveSplitSettingsToStorage
} = SplitViewSettings;

async function loadSplitSettings() {
  try {
    return await loadSplitSettingsFromStorage(chrome.storage.local);
  } catch (err) {
    console.warn('SplitView: load settings failed, use defaults.', err);
    return deepClone(DEFAULT_SPLIT_SETTINGS);
  }
}

async function saveSplitSettings(settings) {
  return saveSplitSettingsToStorage(chrome.storage.local, settings);
}

function getLayoutProfile(hostname, settings) {
  const normalized = normalizeSplitSettings(settings);
  const matchedDomain = normalized.whitelist.enabled
    ? matchDomainRule(hostname, normalized.whitelist.domains)
    : null;

  if (!matchedDomain) {
    return {
      widthPct: DEFAULT_FALLBACK_WIDTH_PCT,
      matchedDomain: null,
      isWhitelisted: false
    };
  }

  const override = normalized.siteOverrides[matchedDomain];
  const widthPct = override
    ? clampWidth(
        override.widthPct,
        normalized.global.minWidthPct,
        normalized.global.maxWidthPct
      )
    : clampWidth(
        normalized.global.defaultWidthPct,
        normalized.global.minWidthPct,
        normalized.global.maxWidthPct
      );

  return {
    widthPct,
    matchedDomain,
    isWhitelisted: true
  };
}

function refreshLayoutFromSettings() {
  currentLayoutProfile = getLayoutProfile(window.location.hostname, splitSettingsCache);
  applyPanelWidth(currentLayoutProfile.widthPct);
  syncSettingsPanelValues();

  if (document.body.classList.contains('sv-split-active')) {
    enableSplitLayout(currentLayoutProfile.widthPct);
  }
}

function initInspector() {
  if (isInspecting) return;
  isInspecting = true;
  
  if (!highlightBox) {
    createHighlightElements();
  }
  
  document.addEventListener('mousemove', handleMouseMove, true);
  document.addEventListener('click', handleClick, true);
  document.addEventListener('keydown', handleKeyDown, true);
  
  // 改变光标
  document.body.style.cursor = 'default';
  
  showNotification('Inspect Mode: Click to extract. Click Label for siblings.');
  console.log('SplitView Inspector Started');
}

function stopInspector() {
  isInspecting = false;
  
  document.removeEventListener('mousemove', handleMouseMove, true);
  document.removeEventListener('click', handleClick, true);
  document.removeEventListener('keydown', handleKeyDown, true);
  
  if (highlightBox) highlightBox.style.display = 'none';
  if (highlightLabel) highlightLabel.style.display = 'none';
  
  document.body.style.cursor = '';
}

function handleMouseMove(e) {
  if (!isInspecting) return;
  
  // 获取鼠标下的元素
  const element = document.elementFromPoint(e.clientX, e.clientY);
  
  if (
    !element ||
    element === highlightBox ||
    element === highlightLabel ||
    element.id === 'splitview-highlight-label' ||
    element.id === 'splitview-shadow-host' ||
    element.closest('#splitview-panel')
  ) return;
  
  if (element !== currentHoveredElement) {
    currentHoveredElement = element;
    lastRealHoveredElement = element;
    highlightElement(element);
  }
}

function handleClick(e) {
  if (!isInspecting) return;

  if (
    e.target === splitShadowHost ||
    (splitShadowHost && splitShadowHost.contains(e.target))
  ) return;

  if (e.target === highlightLabel) {
      e.preventDefault();
      e.stopPropagation();
      handleLabelClick(lastRealHoveredElement || currentHoveredElement);
      return;
  }

  e.preventDefault();
  e.stopPropagation();
  
  if (currentHoveredElement) {
      processExtraction([currentHoveredElement]);
  }
}

function handleLabelClick(target) {
    if (!target) return;
    
    // Check if user has enabled this custom option (simulated check)
    // Rule: "Custom option, default off". 
    // Since we don't have a settings UI, we'll assume for now it's enabled 
    // IF the site rule or a flag allows it. 
    // But user requirement says: "Need manual confirm... and rule needs user custom add".
    
    // For now, let's implement the logic but perhaps gate it with a confirm dialog
    // as per "Need user manual confirm".
    
    const siblings = getSiblings(target);
    if (siblings.length <= 1) {
        showNotification('No similar siblings found.');
        return;
    }
    
    if (confirm(`Extract ${siblings.length} similar items?`)) {
        processExtraction(siblings);
    }
}

function getSiblings(target) {
    const parent = target.parentElement;
    if (!parent) return [target];
    
    const children = Array.from(parent.children);
    const tagName = target.tagName;
    const testId = target.getAttribute('data-testid');
    
    const getClassName = (el) => {
        if (typeof el.className === 'string') return el.className;
        if (el.className && typeof el.className.baseVal === 'string') return el.className.baseVal;
        return '';
    };
    const targetClass = getClassName(target);

    return children.filter(el => {
        if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) return false;
        if (getComputedStyle(el).display === 'none') return false; // Better hidden check
        
        if (testId) {
            return el.tagName === tagName && el.getAttribute('data-testid') === testId;
        }
        return el.tagName === tagName && getClassName(el) === targetClass;
    });
}

async function processExtraction(elements) {
    stopInspector();
    showNotification(`Extracting ${elements.length} item(s)...`);
    
    const extractedItems = [];

    try {
      for (const [index, el] of elements.entries()) {
          await expandContent(el);
          const content = extractElementContent(el);
          if (isMeaningfulHtml(content)) {
            extractedItems.push({
              index: index + 1,
              html: content
            });
          }
      }
    } catch (err) {
      console.error('SplitView: extraction failed.', err);
      showNotification('提取失败，请重试');
      return;
    }

    if (extractedItems.length === 0) {
      showNotification('未提取到可显示内容');
      return;
    }

    const finalContent = buildCardsHtml(extractedItems);
    showSplitView(finalContent, extractedItems).catch(err => {
      console.error('SplitView: show split view failed.', err);
      showNotification('分屏显示失败，请重试');
    });
}

function handleKeyDown(e) {
  if (!isInspecting) return;
  
  if (e.key === 'Escape') {
    stopInspector();
    showNotification('Inspect Mode Cancelled');
  }
  
}




function createHighlightElements() {
  highlightBox = document.createElement('div');
  highlightBox.id = 'splitview-highlight-box';
  document.body.appendChild(highlightBox);
  
  highlightLabel = document.createElement('div');
  highlightLabel.id = 'splitview-highlight-label';
  // Use a data attribute to make label distinguishable for clicks
  highlightLabel.setAttribute('data-action', 'siblings');
  highlightBox.appendChild(highlightLabel);
  
  // Forward click from label to document handler? 
  // No, we handle it in global handleClick by checking target
}



function highlightElement(element) {
  if (!element) return;
  
  const rect = element.getBoundingClientRect();
  
  // 更新高亮框位置
  highlightBox.style.display = 'block';
  highlightBox.style.top = (rect.top + window.scrollY) + 'px';
  highlightBox.style.left = (rect.left + window.scrollX) + 'px';
  highlightBox.style.width = rect.width + 'px';
  highlightBox.style.height = rect.height + 'px';
  
  // 更新标签
  const tagName = element.tagName.toLowerCase();
  const id = element.id ? '#' + element.id : '';
  const className = element.className && typeof element.className === 'string' ? '.' + element.className.split(' ')[0] : '';
  
  highlightLabel.style.display = 'block';
  highlightLabel.textContent = `${tagName}${id}${className}`;

  const visibleTop = Math.max(rect.top, 0);
  const labelOffset = visibleTop - rect.top;

  if (rect.top < 24) {
    highlightLabel.style.top = (labelOffset + 4) + 'px';
    highlightLabel.style.bottom = 'auto';
  } else {
    highlightLabel.style.top = '-24px';
    highlightLabel.style.bottom = 'auto';
  }
}

// ---------------------------------------------------------
// Site Rule Logic
// ---------------------------------------------------------

let currentSiteRule = null;

async function loadSiteRule() {
  const hostname = window.location.hostname;
  const noWww = hostname.replace(/^www\./, '');
  const parts = noWww.split('.');
  
  // Create domain candidates: m.twitter.com -> twitter.com
  const candidates = [];
  candidates.push(noWww);
  
  if (parts.length > 2) {
      // Try root domain (e.g., twitter.com from m.twitter.com)
      candidates.push(parts.slice(-2).join('.'));
  }
  
  for (const domain of candidates) {
      const rulePath = chrome.runtime.getURL(`site_rules/${domain}.json`);
      try {
        const response = await fetch(rulePath);
        if (response.ok) {
          currentSiteRule = await response.json();
          console.log('SplitView: Loaded site rule for', domain);
          return;
        }
      } catch (err) {
        // Ignore errors
      }
  }
}

// Helper to expand content based on rules
function isNavigationRiskNode(el) {
  if (!(el instanceof Element)) return true;

  // Avoid any element that is itself a link or sits inside a real link.
  if ((el.tagName === 'A' && el.hasAttribute('href')) || el.closest('a[href]')) {
    return true;
  }

  // Avoid form submit side effects.
  if (el.tagName === 'INPUT') {
    const type = (el.getAttribute('type') || '').toLowerCase();
    if (type === 'submit' || type === 'image') return true;
  }
  if (el.tagName === 'BUTTON') {
    const type = (el.getAttribute('type') || '').toLowerCase();
    if (type === 'submit' && el.closest('form')) return true;
  }

  return false;
}

function isSafeExpandableElement(el) {
  if (!(el instanceof HTMLElement)) return false;
  if (isNavigationRiskNode(el)) return false;

  const role = (el.getAttribute('role') || '').toLowerCase();
  const isButtonLike = el.tagName === 'BUTTON' || role === 'button';
  if (isButtonLike) return true;

  // Allow non-link nodes as a fallback for site-specific selectors.
  return el.tagName !== 'A';
}

async function expandContent(rootElement) {
  if (!currentSiteRule) return;
  
  const { expandSelectors, expandText } = currentSiteRule;
  let clicked = false;

  // 1. Try Selectors
  if (expandSelectors && expandSelectors.length > 0) {
    for (const selector of expandSelectors) {
      // Search within the root element first
      const buttons = rootElement.querySelectorAll(selector);
      for (const btn of buttons) {
        if (!isSafeExpandableElement(btn)) {
          console.log('SplitView: Skipped unsafe expand target (selector)', selector, btn);
          continue;
        }
        btn.click();
        clicked = true;
        console.log('SplitView: Clicked expand button (selector)', selector);
      }
    }
  }
  
  // 2. Try Text Matching if no selector hit (or as supplement)
  // Only if no selector action occurred? Or always? Let's do it if nothing happened yet
  // or maybe specific rules dictate text matching is needed.
  if (!clicked && expandText && expandText.length > 0) {
     // Naive text search on buttons/links
     const candidates = rootElement.querySelectorAll('button, a, [role="button"]');
     for (const el of candidates) {
         if (!isSafeExpandableElement(el)) continue;

         const text = el.innerText || el.textContent || '';
         if (expandText.some(t => text.includes(t))) {
             el.click();
             clicked = true;
             console.log('SplitView: Clicked expand button (text match)', text);
             break; // Click one is usually enough for a "Read more"
         }
     }
  }

  if (clicked) {
    // Wait for expansion with polling
    const start = Date.now();
    const timeout = 2000;
    const initialHeight = rootElement.scrollHeight;
    
    while (Date.now() - start < timeout) {
        await new Promise(r => setTimeout(r, 100));
        // Simple check: if height increased, assume content loaded
        if (rootElement.scrollHeight > initialHeight) {
            // Wait a bit more for render stabilization
            await new Promise(r => setTimeout(r, 300));
            break;
        }
    }
  }
}





// ---------------------------------------------------------
// 以下是分屏和内容提取逻辑 (保留之前的实现)
// ---------------------------------------------------------

function cleanNode(node) {
    node.querySelectorAll('script, style, link, meta, noscript, iframe, frame').forEach(el => el.remove());
    
    // Fix absolute URLs
    node.querySelectorAll('img').forEach(img => {
        if (img.src) img.setAttribute('src', img.src);
        if (img.srcset) img.setAttribute('srcset', img.srcset);
    });
    
    node.querySelectorAll('a').forEach(a => {
        if (a.href) a.setAttribute('href', a.href);
    });
    return node;
}

function extractElementContent(element) {
  const clone = element.cloneNode(true);
  cleanNode(clone);

  const INLINE_WHITELIST = [
    'font-family', 'font-size', 'font-weight', 'font-style', 'color',
    'background-color', 'background-image', 'background',
    'line-height', 'letter-spacing', 'text-align', 'text-decoration',
    'text-indent', 'text-transform', 'white-space', 'word-break', 'word-spacing',
    'overflow-wrap',
    'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'border', 'border-top', 'border-right', 'border-bottom', 'border-left',
    'border-radius', 'border-color', 'border-style', 'border-width',
    'display', 'flex-direction', 'flex-wrap', 'align-items', 'justify-content', 'gap',
    'flex-grow', 'flex-shrink', 'flex-basis',
    'align-self', 'order',
    'grid-template-columns', 'grid-template-rows', 'grid-gap',
    'list-style', 'list-style-type', 'list-style-position',
    'width', 'max-width', 'min-width', 'height', 'max-height', 'min-height',
    'overflow', 'overflow-x', 'overflow-y',
    'box-sizing', 'vertical-align', 'opacity',
    'position', 'inset', 'top', 'right', 'bottom', 'left', 'z-index',
    'float', 'clear',
    'object-fit', 'object-position', 'aspect-ratio',
    'visibility', 'clip-path',
    'filter',
    'transform',
    '-webkit-line-clamp'
  ];

  const ALWAYS_SKIP = new Set([
    'auto', 'initial', 'inherit', 'unset'
  ]);

  const SKIP_FOR_PROP = {
    'background-color': new Set(['transparent', 'rgba(0, 0, 0, 0)']),
    'background-image': new Set(['none']),
    'background': new Set(['transparent', 'rgba(0, 0, 0, 0)']),
    'text-indent': new Set(['0px']),
    'letter-spacing': new Set(['normal']),
    'word-spacing': new Set(['0px']),
    'opacity': new Set(['1']),
    'visibility': new Set(['visible']),
    'z-index': new Set(['auto']),
    'order': new Set(['0']),
    'float': new Set(['none']),
    'clear': new Set(['none']),
    'clip-path': new Set(['none']),
    'filter': new Set(['none']),
    'transform': new Set(['none']),
    'flex-grow': new Set(['0']),
    'flex-shrink': new Set(['1']),
    'flex-basis': new Set(['auto']),
    'align-self': new Set(['auto']),
    'object-fit': new Set(['fill']),
    'aspect-ratio': new Set(['auto']),
    '-webkit-line-clamp': new Set(['none']),
    'overflow-wrap': new Set(['normal']),
  };

  const originals = element.querySelectorAll('*');
  const clones = clone.querySelectorAll('*');

  const inlineStyles = (origEl, cloneEl) => {
    const cs = window.getComputedStyle(origEl);
    let styleStr = '';
    for (const prop of INLINE_WHITELIST) {
      const val = cs.getPropertyValue(prop);
      if (!val) continue;
      if (ALWAYS_SKIP.has(val)) continue;

      const perProp = SKIP_FOR_PROP[prop];
      if (perProp && perProp.has(val)) continue;

      if (prop === 'position' && val === 'fixed') {
        styleStr += 'position:relative;';
        continue;
      }

      styleStr += `${prop}:${val};`;
    }
    if (styleStr) {
      const existing = cloneEl.getAttribute('style') || '';
      cloneEl.setAttribute('style', existing + styleStr);
    }
  };

  inlineStyles(element, clone);

  for (let i = 0; i < originals.length && i < clones.length; i++) {
    inlineStyles(originals[i], clones[i]);
  }

  return clone.outerHTML;
}

let splitPanel = null;
let splitShadowHost = null;
let splitShadowRoot = null;
let originalBodyStyle = '';
let originalHtmlStyle = '';
let currentMode = 'rich'; // rich or markdown
let currentContent = '';
let currentExtractedItems = [];
let md = null;
const SPLIT_SHADOW_HOST_ID = 'splitview-shadow-host';
const SHADOW_PANEL_STYLES = `
  :host {
    all: initial;
    display: block;
    position: fixed;
    top: 0;
    right: 0;
    width: var(--sv-panel-width, 40vw);
    height: 100vh;
    z-index: 2147483646;
    transform: translateX(100%);
    transition: transform 0.3s ease;
  }

  :host(.open) {
    transform: translateX(0);
  }

  :host(.sv-dragging) {
    transition: none !important;
  }

  #splitview-panel {
    width: 100%;
    height: 100%;
    background: white;
    box-shadow: -4px 0 16px rgba(0, 0, 0, 0.1);
    display: flex;
    flex-direction: column;
    border-left: 1px solid #e1e1e1;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    box-sizing: border-box;
  }

  .sv-resize-handle {
    position: absolute;
    top: 0;
    left: -4px;
    width: 8px;
    height: 100%;
    cursor: col-resize;
    z-index: 1;
  }

  .sv-resize-handle::after {
    content: '';
    position: absolute;
    top: 0;
    left: 3px;
    width: 2px;
    height: 100%;
    background: transparent;
    transition: background 0.2s;
  }

  .sv-resize-handle:hover::after,
  .sv-resize-handle.active::after {
    background: #0071e3;
  }

  .sv-header {
    min-height: 50px;
    border-bottom: 1px solid #eee;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px;
    background: #fbfbfb;
    gap: 12px;
  }

  .sv-title {
    font-weight: 600;
    font-size: 14px;
    color: #333;
  }

  .sv-controls {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .sv-btn {
    border: 1px solid #ddd;
    background: white;
    border-radius: 4px;
    padding: 4px 10px;
    font-size: 12px;
    cursor: pointer;
    color: #555;
    transition: all 0.2s;
  }

  .sv-btn:hover {
    background: #f5f5f5;
    color: #000;
  }

  .sv-btn.active {
    background: #0071e3;
    color: white;
    border-color: #0071e3;
  }

  .sv-content {
    flex: 1;
    overflow-y: auto;
    padding: 24px;
    font-size: 16px;
    line-height: 1.6;
    color: #333;
    background: #f6f8fb;
  }

  .sv-cards {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .sv-card {
    overflow: hidden;
  }

  .sv-card-header {
    display: none;
  }

  .sv-card-body {
    padding: 0;
    overflow-x: hidden;
    word-break: break-word;
  }

  .sv-card-body > * {
    max-width: 100% !important;
    box-sizing: border-box !important;
  }

  .sv-card-body a {
    color: #0071e3;
  }

  .sv-settings-panel {
    display: none;
    border-bottom: 1px solid #eee;
    background: #fafafa;
    padding: 12px 16px;
    gap: 10px;
    flex-direction: column;
  }

  .sv-settings-panel.open {
    display: flex;
  }

  .sv-settings-line {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 12px;
    color: #333;
  }

  .sv-settings-line input[type="range"] {
    flex: 1;
  }

  .sv-content.markdown-mode {
    font-family: 'SF Mono', Monaco, Menlo, Consolas, monospace;
    white-space: pre-wrap;
    font-size: 14px;
    background: #f9f9f9;
  }

  .sv-content img {
    max-width: 100%;
    height: auto;
    border-radius: 8px;
    margin: 10px 0;
  }

  .sv-content blockquote {
    border-left: 4px solid #0071e3;
    margin: 0;
    padding-left: 16px;
    color: #666;
  }

  .sv-content pre {
    background: #f5f5f7;
    padding: 12px;
    border-radius: 8px;
    overflow-x: auto;
  }

  @media (max-width: 920px) {
    :host {
      width: min(90vw, 460px) !important;
    }

    .sv-header {
      align-items: flex-start;
    }
  }
`;
let splitSettingsCache = deepClone(DEFAULT_SPLIT_SETTINGS);
let currentLayoutProfile = {
  widthPct: DEFAULT_FALLBACK_WIDTH_PCT,
  matchedDomain: null,
  isWhitelisted: false
};

function getPanelElementById(id) {
  if (!splitPanel) return null;
  return splitPanel.querySelector(`#${id}`);
}

function getPanelContentElement() {
  return getPanelElementById('sv-content-body');
}

function ensureSplitPanelShadowRoot() {
  if (splitShadowRoot && splitShadowHost && splitShadowHost.isConnected) {
    return splitShadowRoot;
  }

  splitShadowHost = document.getElementById(SPLIT_SHADOW_HOST_ID);
  if (!splitShadowHost) {
    splitShadowHost = document.createElement('div');
    splitShadowHost.id = SPLIT_SHADOW_HOST_ID;
    document.body.appendChild(splitShadowHost);
  }

  splitShadowRoot = splitShadowHost.shadowRoot || splitShadowHost.attachShadow({ mode: 'open' });

  if (!splitShadowRoot.querySelector('style[data-sv-shadow-style]')) {
    const style = document.createElement('style');
    style.setAttribute('data-sv-shadow-style', '1');
    style.textContent = SHADOW_PANEL_STYLES;
    splitShadowRoot.appendChild(style);
  }

  return splitShadowRoot;
}

const svFixedSqueezer = (function createFixedSqueezer() {
  const SV_IDS = [
    SPLIT_SHADOW_HOST_ID,
    'splitview-panel',
    'splitview-highlight-box',
    'splitview-highlight-label',
    'splitview-notification'
  ];

  function isSplitViewEl(el) {
    if (!(el instanceof Element)) return false;
    if (SV_IDS.includes(el.id)) return true;
    if (el.closest('#splitview-panel')) return true;
    return false;
  }

  const adjusted = new Set();
  const originals = new WeakMap();
  let offsetPx = 0;
  let enabled = false;
  let mo = null;
  let onResize = null;
  const pending = new Set();
  let rafScheduled = false;

  function storeOriginal(el, props) {
    if (originals.has(el)) return;
    const saved = {};
    for (const p of props) saved[p] = el.style[p] || '';
    originals.set(el, saved);
  }

  function availableRight() {
    return window.innerWidth - offsetPx;
  }

  function adjustFixed(el) {
    if (!(el instanceof Element)) return;
    if (isSplitViewEl(el)) return;

    const cs = window.getComputedStyle(el);
    if (cs.position !== 'fixed') return;
    if (cs.display === 'none') return;

    const rect = el.getBoundingClientRect();
    if (rect.right <= availableRight() + 1) return;

    storeOriginal(el, ['right', 'maxWidth', 'boxSizing']);
    el.style.boxSizing = 'border-box';

    const isFullWidth = rect.left <= 1 && rect.width >= window.innerWidth * 0.8;

    if (isFullWidth) {
      el.style.right = `${offsetPx}px`;
    } else {
      const currentRight = parseFloat(cs.right);
      if (isFinite(currentRight) && cs.right !== 'auto') {
        el.style.right = `${currentRight + offsetPx}px`;
      } else {
        el.style.maxWidth = `${Math.max(0, availableRight() - rect.left)}px`;
      }
    }

    el.dataset.svFixedManaged = '1';
    adjusted.add(el);
  }

  function scanAll(root) {
    const els = (root || document.documentElement).querySelectorAll('*');
    for (const el of els) adjustFixed(el);
  }

  function restoreAll() {
    for (const el of adjusted) {
      if (!(el instanceof Element)) continue;
      const saved = originals.get(el);
      if (saved) {
        for (const [prop, val] of Object.entries(saved)) el.style[prop] = val;
      }
      delete el.dataset.svFixedManaged;
    }
    adjusted.clear();
  }

  function flushPending() {
    rafScheduled = false;
    for (const node of pending) {
      if (node instanceof Element) {
        adjustFixed(node);
        const children = node.querySelectorAll ? node.querySelectorAll('*') : [];
        for (const c of children) adjustFixed(c);
      }
    }
    pending.clear();
  }

  function schedulePending() {
    if (rafScheduled) return;
    rafScheduled = true;
    requestAnimationFrame(flushPending);
  }

  function startObserver() {
    if (mo) return;
    mo = new MutationObserver(mutations => {
      for (const m of mutations) {
        for (const n of m.addedNodes) {
          if (n.nodeType === 1) pending.add(n);
        }
        if (m.type === 'attributes' && m.target && m.target.nodeType === 1) {
          pending.add(m.target);
        }
      }
      if (pending.size > 0) schedulePending();
    });
    mo.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class']
    });
  }

  function stopObserver() {
    if (mo) { mo.disconnect(); mo = null; }
    pending.clear();
    rafScheduled = false;
  }

  function getPanelOffsetPx(widthPct) {
    if (splitShadowHost) {
      const rect = splitShadowHost.getBoundingClientRect();
      if (rect.width > 0) return Math.round(rect.width);
    }
    return Math.round(window.innerWidth * (widthPct / 100));
  }

  return {
    enable(widthPct) {
      if (enabled) restoreAll();
      enabled = true;
      offsetPx = getPanelOffsetPx(widthPct);
      scanAll();
      startObserver();
      if (!onResize) {
        onResize = () => {
          if (!enabled) return;
          offsetPx = getPanelOffsetPx(widthPct);
          restoreAll();
          scanAll();
        };
        window.addEventListener('resize', onResize, { passive: true });
      }
    },
    disable() {
      enabled = false;
      stopObserver();
      if (onResize) { window.removeEventListener('resize', onResize); onResize = null; }
      restoreAll();
    }
  };
})();

function getSettingsElements() {
  if (!splitPanel) return null;
  return {
    panel: splitPanel.querySelector('#sv-settings-panel'),
    toggleBtn: splitPanel.querySelector('#sv-settings'),
    hostLabel: splitPanel.querySelector('#sv-settings-host'),
    whitelistToggle: splitPanel.querySelector('#sv-site-whitelist'),
    overrideToggle: splitPanel.querySelector('#sv-site-override'),
    widthRange: splitPanel.querySelector('#sv-width-range'),
    widthValue: splitPanel.querySelector('#sv-width-value'),
    saveBtn: splitPanel.querySelector('#sv-settings-save')
  };
}

function applyPanelWidth(widthPct) {
  if (!splitShadowHost) return;
  splitShadowHost.style.setProperty('--sv-panel-width', `${widthPct}vw`);
}

function syncSettingsPanelValues() {
  const els = getSettingsElements();
  if (!els) return;

  const domainKey = getDomainKey(window.location.hostname);
  const globalCfg = splitSettingsCache.global;
  const isWhitelisted = Boolean(currentLayoutProfile.isWhitelisted);
  const hasOverride = Boolean(splitSettingsCache.siteOverrides[domainKey]);
  const suggestedWidth = hasOverride
    ? splitSettingsCache.siteOverrides[domainKey].widthPct
    : splitSettingsCache.global.defaultWidthPct;

  els.hostLabel.textContent = domainKey || normalizeDomain(window.location.hostname) || '-';
  els.whitelistToggle.checked = isWhitelisted;
  els.overrideToggle.checked = hasOverride;
  els.widthRange.min = String(globalCfg.minWidthPct);
  els.widthRange.max = String(globalCfg.maxWidthPct);
  els.widthRange.step = String(globalCfg.stepPct);
  els.widthRange.value = String(clampWidth(suggestedWidth, globalCfg.minWidthPct, globalCfg.maxWidthPct));
  els.widthValue.textContent = `${els.widthRange.value}%`;
}

function updateWidthPreview() {
  const els = getSettingsElements();
  if (!els) return;
  els.widthValue.textContent = `${els.widthRange.value}%`;
}

function isMeaningfulHtml(html) {
  if (!html || typeof html !== 'string') return false;
  const temp = document.createElement('div');
  temp.innerHTML = html;
  temp.querySelectorAll('br, hr').forEach(el => el.remove());

  const text = (temp.textContent || '').replace(/\s+/g, '');
  if (text.length > 0) return true;

  return Boolean(
    temp.querySelector('img, video, audio, svg, canvas, iframe, table, ul, ol, pre, code')
  );
}

function buildCardsHtml(items) {
  const cards = items.map((item, idx) => `
    <article class="sv-card" data-sv-index="${idx + 1}">
      <header class="sv-card-header">第 ${idx + 1} 项</header>
      <section class="sv-card-body">${item.html}</section>
    </article>
  `).join('');
  return `<div class="sv-cards">${cards}</div>`;
}

function renderContentSafe() {
  try {
    renderContent();
    return true;
  } catch (err) {
    console.error('SplitView: render failed.', err);
    showNotification('渲染失败，请重试');
    return false;
  }
}

async function handleSaveSettingsFromPanel() {
  const els = getSettingsElements();
  if (!els) return;

  const domainKey = getDomainKey(window.location.hostname);
  if (!domainKey) {
    showNotification('当前页面域名不可配置');
    return;
  }

  const widthPct = clampWidth(
    els.widthRange.value,
    splitSettingsCache.global.minWidthPct,
    splitSettingsCache.global.maxWidthPct
  );
  const next = normalizeSplitSettings(splitSettingsCache);
  const domains = new Set(next.whitelist.domains);

  if (els.whitelistToggle.checked) {
    domains.add(domainKey);
  } else {
    domains.delete(domainKey);
  }
  next.whitelist.domains = Array.from(domains);

  if (els.overrideToggle.checked) {
    next.siteOverrides[domainKey] = { widthPct };
  } else {
    delete next.siteOverrides[domainKey];
  }

  splitSettingsCache = await saveSplitSettings(next);
  refreshLayoutFromSettings();
  showNotification('分屏设置已保存');
}

async function showSplitView(content, extractedItems = []) {
  if (!isMeaningfulHtml(content)) {
    showNotification('未提取到可显示内容');
    return;
  }

  if (document.body.classList.contains('sv-split-active')) {
    resetSplitLayout();
  }

  currentContent = content;
  currentExtractedItems = extractedItems;
  
  if (!splitPanel) {
    createSplitPanel();
  }

  splitSettingsCache = await loadSplitSettings();
  refreshLayoutFromSettings();
  
  if (!renderContentSafe()) {
    return;
  }
  
  setTimeout(() => {
      splitShadowHost.classList.add('open');
  }, 10);
}

function resetSplitLayout() {
  svFixedSqueezer.disable();
  restoreHideOnSplit();
  restorePageRoots();

  if (svLayoutStyleEl && svLayoutStyleEl.parentNode) {
    svLayoutStyleEl.parentNode.removeChild(svLayoutStyleEl);
    svLayoutStyleEl = null;
  }

  document.body.classList.remove('sv-split-active');
  document.body.style.cssText = originalBodyStyle;
  document.documentElement.style.cssText = originalHtmlStyle;
}

function createSplitPanel() {
  if (splitPanel) return;

  const shadowRoot = ensureSplitPanelShadowRoot();

  splitPanel = document.createElement('div');
  splitPanel.id = 'splitview-panel';
  
  splitPanel.innerHTML = `
    <div class="sv-resize-handle" id="sv-resize-handle"></div>
    <div class="sv-header">
      <div class="sv-title">提取内容</div>
      <div class="sv-controls">
        <button class="sv-btn active" data-mode="rich">富文本</button>
        <button class="sv-btn" data-mode="markdown">Markdown</button>
        <button class="sv-btn" id="sv-settings">设置</button>
        <button class="sv-btn" id="sv-copy">复制</button>
        <button class="sv-btn" id="sv-copy-source" title="复制 HTML 源码">复制源码</button>
        <button class="sv-btn" id="sv-pdf">PDF</button>
        <button class="sv-btn" id="sv-close">✕</button>
      </div>
    </div>
    <div class="sv-settings-panel" id="sv-settings-panel">
      <div class="sv-settings-line">当前站点：<span id="sv-settings-host">-</span></div>
      <label class="sv-settings-line">
        <input type="checkbox" id="sv-site-whitelist">
        当前站点启用参数化分屏
      </label>
      <label class="sv-settings-line">
        <input type="checkbox" id="sv-site-override">
        当前站点使用单独宽度
      </label>
      <div class="sv-settings-line">
        <span>分屏宽度</span>
        <input type="range" id="sv-width-range" min="20" max="60" step="1" value="40">
        <span id="sv-width-value">40%</span>
      </div>
      <button class="sv-btn" id="sv-settings-save">保存设置</button>
    </div>
    <div class="sv-content" id="sv-content-body"></div>
  `;
  
  shadowRoot.appendChild(splitPanel);
  
  // Bind Events
  splitPanel.querySelector('#sv-close').addEventListener('click', closeSplitView);
  splitPanel.querySelector('#sv-settings').addEventListener('click', () => {
    const panel = splitPanel.querySelector('#sv-settings-panel');
    panel.classList.toggle('open');
  });
  splitPanel.querySelector('#sv-width-range').addEventListener('input', updateWidthPreview);
  splitPanel.querySelector('#sv-settings-save').addEventListener('click', () => {
    handleSaveSettingsFromPanel().catch(err => {
      console.error('SplitView: save settings failed.', err);
      showNotification('保存失败，请稍后重试');
    });
  });
  splitPanel.querySelector('#sv-copy').addEventListener('click', copyContent);
  splitPanel.querySelector('#sv-copy-source').addEventListener('click', copyHtmlSource);
  splitPanel.querySelector('#sv-pdf').addEventListener('click', exportToPDF);
  
  const modeBtns = splitPanel.querySelectorAll('[data-mode]');
  modeBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      modeBtns.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      currentMode = e.target.dataset.mode;
      renderContent();
    });
  });

  initResizeHandle();
}

function initResizeHandle() {
  const handle = splitPanel.querySelector('#sv-resize-handle');
  if (!handle) return;

  let dragging = false;
  let startX = 0;
  let startWidthPx = 0;

  const minPct = splitSettingsCache.global.minWidthPct || 20;
  const maxPct = splitSettingsCache.global.maxWidthPct || 60;

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    dragging = true;
    startX = e.clientX;
    startWidthPx = splitShadowHost.getBoundingClientRect().width;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    handle.classList.add('active');
    splitShadowHost.classList.add('sv-dragging');
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const delta = startX - e.clientX;
    const newWidthPx = Math.max(0, startWidthPx + delta);
    const newPct = Math.round((newWidthPx / window.innerWidth) * 100);
    const clamped = clampWidth(newPct, minPct, maxPct);

    applyPanelWidth(clamped);
    enableSplitLayout(clamped);
    currentLayoutProfile.widthPct = clamped;
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    handle.classList.remove('active');
    splitShadowHost.classList.remove('sv-dragging');
  });
}

let svLayoutStyleEl = null;
let originalRootStyles = new Map();

function ensureLayoutStyle() {
  if (svLayoutStyleEl && svLayoutStyleEl.parentNode) return svLayoutStyleEl;
  svLayoutStyleEl = document.createElement('style');
  svLayoutStyleEl.id = 'splitview-layout-style';
  svLayoutStyleEl.textContent = '';
  (document.head || document.documentElement).appendChild(svLayoutStyleEl);
  return svLayoutStyleEl;
}

const SV_SKIP_IDS = new Set([
  SPLIT_SHADOW_HOST_ID,
  'splitview-panel',
  'splitview-highlight-box',
  'splitview-highlight-label',
  'splitview-notification',
  'splitview-layout-style'
]);

function isSplitViewNode(el) {
  return el && el.id && SV_SKIP_IDS.has(el.id);
}

function squeezePageRoots(widthPct) {
  const contentWidth = (100 - widthPct) + 'vw';

  for (const child of document.body.children) {
    if (!(child instanceof HTMLElement)) continue;
    if (isSplitViewNode(child)) continue;

    const cs = getComputedStyle(child);
    const rect = child.getBoundingClientRect();
    const needsSqueezing =
      rect.width >= window.innerWidth * 0.9 ||
      cs.position === 'fixed' ||
      cs.position === 'absolute';

    if (!needsSqueezing) continue;

    if (!originalRootStyles.has(child)) {
      originalRootStyles.set(child, {
        width: child.style.width,
        maxWidth: child.style.maxWidth,
        minWidth: child.style.minWidth,
        boxSizing: child.style.boxSizing,
        overflowX: child.style.overflowX
      });
    }

    child.style.setProperty('max-width', contentWidth, 'important');
    child.style.setProperty('min-width', '0', 'important');
    child.style.setProperty('box-sizing', 'border-box', 'important');
    child.style.setProperty('overflow-x', 'hidden', 'important');

    if (cs.position === 'fixed') {
      child.style.setProperty('width', contentWidth, 'important');
    }
  }
}

function restorePageRoots() {
  for (const [el, saved] of originalRootStyles) {
    if (!(el instanceof HTMLElement)) continue;
    for (const [prop, val] of Object.entries(saved)) {
      el.style[prop] = val;
    }
  }
  originalRootStyles.clear();
}

let hiddenOnSplitEls = new Map();

function applyHideOnSplit() {
  if (!currentSiteRule || !currentSiteRule.hideOnSplit) return;
  for (const selector of currentSiteRule.hideOnSplit) {
    try {
      document.querySelectorAll(selector).forEach(el => {
        if (hiddenOnSplitEls.has(el)) return;
        hiddenOnSplitEls.set(el, el.style.display);
        el.style.setProperty('display', 'none', 'important');
      });
    } catch (e) { /* invalid selector */ }
  }
}

function restoreHideOnSplit() {
  for (const [el, originalDisplay] of hiddenOnSplitEls) {
    if (!(el instanceof HTMLElement)) continue;
    el.style.display = originalDisplay;
  }
  hiddenOnSplitEls.clear();
}

function enableSplitLayout(widthPct) {
  if (!document.body.classList.contains('sv-split-active')) {
    originalBodyStyle = document.body.style.cssText;
    originalHtmlStyle = document.documentElement.style.cssText;
    document.body.classList.add('sv-split-active');
  }

  const contentWidth = (100 - widthPct) + 'vw';
  const styleEl = ensureLayoutStyle();
  styleEl.textContent = `
    html {
      overflow-x: hidden !important;
      width: ${contentWidth} !important;
      max-width: ${contentWidth} !important;
    }
    body.sv-split-active {
      overflow-x: hidden !important;
      box-sizing: border-box !important;
      width: 100% !important;
      max-width: 100% !important;
    }
  `;

  squeezePageRoots(widthPct);
  applyHideOnSplit();
  svFixedSqueezer.enable(widthPct);
}

function closeSplitView() {
  resetSplitLayout();

  if (splitShadowHost) {
    splitShadowHost.classList.remove('open');
  }
}

function renderContent() {
  const container = getPanelContentElement();
  if (!container) {
    throw new Error('SplitView content container missing');
  }
  
  if (currentMode === 'rich') {
    container.innerHTML = currentContent;
    container.classList.remove('markdown-mode');
  } else {
    if (!md && window.markdownit) {
      md = window.markdownit();
    }
    
    if (md) {
      const markdown = currentExtractedItems.length > 0
        ? currentExtractedItems
          .map((item, idx) => `## 第 ${idx + 1} 项\n\n${htmlToMarkdown(item.html)}`)
          .join('\n\n')
        : htmlToMarkdown(currentContent);
      container.textContent = markdown; 
      container.classList.add('markdown-mode');
    } else {
      container.textContent = "Markdown library not loaded. Check background injection.";
    }
  }
}

function copyContent() {
  const btn = getPanelElementById('sv-copy');
  const container = getPanelContentElement();
  if (!btn || !container) {
    showNotification('无可复制内容');
    return;
  }
  
  const showSuccess = () => {
    const original = btn.textContent;
    btn.textContent = '已复制';
    setTimeout(() => {
        if (btn.isConnected) btn.textContent = original;
    }, 1500);
  };

  const showFailure = (err) => {
    console.error('Copy failed:', err);
    showNotification('复制失败，请检查剪贴板权限');
    const original = btn.textContent;
    btn.textContent = '失败';
    setTimeout(() => {
      if (btn.isConnected) btn.textContent = original;
    }, 1500);
  };

  if (currentMode === 'markdown') {
    const text = container.textContent;
    navigator.clipboard.writeText(text).then(showSuccess).catch(showFailure);
  } else {
    // Rich Text Mode: Copy from the panel DOM directly to get user selection or full content
    const selection = window.getSelection();
    let contentToCopy = null;

    // Check if selection is inside our container
    if (selection.rangeCount > 0 && container.contains(selection.getRangeAt(0).commonAncestorContainer)) {
        contentToCopy = selection.getRangeAt(0).cloneContents();
    } else {
        // No valid selection, copy everything
        contentToCopy = container.cloneNode(true);
    }

    // Create a temporary container to hold the content for processing
    const tempDiv = document.createElement('div');
    tempDiv.appendChild(contentToCopy);

    // Apply Site Rule Fixes (Collapse Styles)
    if (currentSiteRule && currentSiteRule.collapseStyleFix) {
        const fix = currentSiteRule.collapseStyleFix;
        const allEls = tempDiv.querySelectorAll('*');
        // Also apply to root if it's an element
        // tempDiv children are the roots of our copied content
        
        const applyFix = (el) => {
            if (fix.maxHeight) el.style.maxHeight = fix.maxHeight;
            if (fix.overflow) el.style.overflow = fix.overflow;
            if (fix.lineClamp) el.style.lineClamp = fix.lineClamp;
            if (fix['-webkit-line-clamp']) el.style.webkitLineClamp = fix['-webkit-line-clamp'];
        };

        Array.from(tempDiv.children).forEach(applyFix);
        allEls.forEach(applyFix);
    }

    // Apply inline styles to ensure consistency in EPUB
    const allElements = tempDiv.querySelectorAll('*');
    allElements.forEach(el => {
        // We can't get computed styles from the clone directly as it's not in DOM.
        // But the structure mirrors the live container. 
        // For simplicity and performance, we'll rely on the fact that we are copying
        // standard HTML tags. If we needed exact style matching, we'd have to 
        // traverse the original DOM elements corresponding to these clones.
        
        // Ensure images have absolute URLs
        if (el.tagName === 'IMG' && el.src) {
            el.src = el.src; // Browser normalizes to absolute URL
        }
    });

    const html = tempDiv.innerHTML;
    const text = tempDiv.innerText || tempDiv.textContent;
    
    // Try to write HTML + Plain Text
    try {
      const blobHtml = new Blob([html], { type: 'text/html' });
      const blobText = new Blob([text], { type: 'text/plain' });
      const data = [new ClipboardItem({
        'text/html': blobHtml,
        'text/plain': blobText
      })];
      
      navigator.clipboard.write(data).then(showSuccess).catch(err => {
        console.error('Clipboard write failed:', err);
        // Fallback
        navigator.clipboard.writeText(text).then(showSuccess).catch(showFailure);
      });
    } catch (e) {
      console.error('ClipboardItem not supported or failed:', e);
      navigator.clipboard.writeText(text).then(showSuccess).catch(showFailure);
    }
  }
}

function copyHtmlSource() {
  const container = getPanelContentElement();
  if (!container) {
    showNotification('无可复制内容');
    return;
  }
  // Copy full innerHTML source as plain text, with FULL computed inline styles
  
  // Clone the container to manipulate
  const clone = container.cloneNode(true);
  
  // Map original elements to clone elements to read computed styles
  // We use static NodeLists
  const originals = container.querySelectorAll('*');
  const clones = clone.querySelectorAll('*');
  
  // Helper to serialize computed style to string (Lightweight Version)
  const getComputedStyleString = (el, pseudo = null) => {
      const computed = window.getComputedStyle(el, pseudo);
      let styleStr = '';
      
      // Minimal whitelist for lightweight output
      const whitelist = [
          'font-family', 'font-size', 'font-weight', 'font-style', 'color',
          'background-color', 'line-height', 'text-align', 'text-decoration',
          'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
          'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
          'border', 'border-radius', 'display', 'list-style', 'width', 'max-width'
      ];

      whitelist.forEach(prop => {
          const val = computed.getPropertyValue(prop);
          // Simple filter for defaults to save space
          if (val && val !== 'none' && val !== 'auto' && val !== 'initial' && val !== 'normal' && val !== '0px') {
              styleStr += `${prop}:${val};`;
          }
      });
      return styleStr;
  };

  for (let i = 0; i < originals.length; i++) {
    const original = originals[i];
    const cloneEl = clones[i];
    
    // 1. Inline Styles (Lightweight)
    const styleStr = getComputedStyleString(original);
    if (styleStr) cloneEl.setAttribute('style', styleStr);
    
    // 2. Absolute URLs
    if (cloneEl.tagName === 'IMG' && cloneEl.getAttribute('src')) {
        cloneEl.src = original.src; 
    }
    if (cloneEl.tagName === 'A' && cloneEl.getAttribute('href')) {
        cloneEl.href = original.href;
    }
    
    // 3. Removed Pseudo-element handling for lightweight output
  }
  
  // Remove unwanted tags
  cleanNode(clone);

  const html = clone.innerHTML; // Use clone content directly
  // User usually wants the content itself. 
  // Let's stick to clone.innerHTML but verify if root element needs display:block explicitly set if not present.
  
  // Actually, for EPUB, having a clean HTML string is key. 
  // Let's just output the clone's HTML.
  
  const btn = getPanelElementById('sv-copy-source');
  if (!btn) {
    showNotification('复制失败：按钮不存在');
    return;
  }
  const original = btn.textContent;
  
  navigator.clipboard.writeText(html).then(() => {
    btn.textContent = '已复制';
    setTimeout(() => {
        if (btn.isConnected) btn.textContent = original;
    }, 1500);
  }).catch(err => {
    console.error('Copy source failed:', err);
    showNotification('复制源码失败，请检查剪贴板权限');
    btn.textContent = '失败';
    setTimeout(() => btn.textContent = original, 1500);
  });
}

function exportToPDF() {
  const container = getPanelContentElement();
  if (!container) {
    showNotification('无可导出内容');
    return;
  }

  // Use a hidden iframe to print only the content
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const iframeWindow = iframe.contentWindow;
  if (!iframeWindow) {
    showNotification('PDF 导出失败：无法创建打印上下文');
    document.body.removeChild(iframe);
    return;
  }
  const doc = iframeWindow.document;
  
  // Get CSS from content.css (or inline minimal styles)
  // We'll add base styles to ensure it looks good
  const styles = `
    body { 
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; 
      line-height: 1.6; 
      color: #333;
      padding: 20px;
    }
    img { max-width: 100%; height: auto; margin: 10px 0; }
    blockquote { border-left: 4px solid #0071e3; margin: 0; padding-left: 16px; color: #666; }
    pre { background: #f5f5f7; padding: 12px; border-radius: 8px; overflow-x: auto; white-space: pre-wrap; }
    h1, h2, h3 { color: #111; margin-top: 1.5em; }
    a { color: #0071e3; text-decoration: none; }
  `;

  doc.open();
  doc.write(`
    <html>
      <head>
        <title>Exported Content</title>
        <style>${styles}</style>
      </head>
      <body>
        ${container.innerHTML}
      </body>
    </html>
  `);
  doc.close();

  const cleanup = () => {
    if (iframe.parentNode) {
      iframe.parentNode.removeChild(iframe);
    }
  };

  const onAfterPrint = () => {
    iframeWindow.removeEventListener('afterprint', onAfterPrint);
    cleanup();
  };
  iframeWindow.addEventListener('afterprint', onAfterPrint);

  setTimeout(() => {
    try {
      iframeWindow.focus();
      iframeWindow.print();
    } catch (err) {
      console.error('PDF print failed:', err);
      showNotification('PDF 导出失败，请稍后重试');
      cleanup();
    }
  }, 500);

  // Fallback cleanup to avoid orphan iframe.
  setTimeout(cleanup, 15000);
}

// Reuse the HTML to Markdown logic
function htmlToMarkdown(html) {
  const temp = document.createElement('div');
  temp.innerHTML = html;
  
  function processNode(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent;
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    
    const tag = node.tagName.toLowerCase();
    let content = '';
    
    // Special handling for OL to get index
    if (tag === 'ol') {
        let index = 1;
        node.childNodes.forEach(c => {
            if (c.nodeType === Node.ELEMENT_NODE && c.tagName.toLowerCase() === 'li') {
                content += `${index}. ${processNode(c).trim()}\n`;
                index++;
            } else {
                content += processNode(c);
            }
        });
        return '\n' + content + '\n';
    }

    node.childNodes.forEach(c => content += processNode(c));
    
    switch(tag) {
      case 'h1': return '# ' + content + '\n\n';
      case 'h2': return '## ' + content + '\n\n';
      case 'h3': return '### ' + content + '\n\n';
      case 'h4': return '#### ' + content + '\n\n';
      case 'h5': return '##### ' + content + '\n\n';
      case 'h6': return '###### ' + content + '\n\n';
      case 'p': return content + '\n\n';
      case 'strong': case 'b': return '**' + content + '**';
      case 'em': case 'i': return '*' + content + '*';
      case 'li': return '- ' + content + '\n';
      case 'ul': return '\n' + content + '\n';
      case 'br': return '\n';
      case 'hr': return '\n---\n';
      case 'blockquote': return '> ' + content + '\n\n';
      case 'code': return '`' + content + '`';
      case 'pre': return '\n```\n' + content + '\n```\n\n';
      case 'a': 
        const href = node.getAttribute('href') || '';
        return `[${content}](${href})`;
      case 'img': 
        const alt = node.getAttribute('alt') || '';
        const src = node.getAttribute('src') || '';
        return `![${alt}](${src})`;
      case 'tr': return content + ' | '; // Simple table row approximation
      case 'td': case 'th': return content + ' ';
      default: return content;
    }
  }
  
  return processNode(temp).trim();
}

function showNotification(message) {
  let notification = document.getElementById('splitview-notification');

  if (!notification) {
    notification = document.createElement('div');
    notification.id = 'splitview-notification';
    document.body.appendChild(notification);
  }

  notification.textContent = message;
  notification.classList.add('show');

  setTimeout(() => {
    notification.classList.remove('show');
  }, 3000);
}

function handleRuntimeMessage(request) {
  if (request.action === ACTION_START_SELECTION) {
    (async () => {
      await loadSiteRule();
      initInspector();
    })();
  }
  return true;
}

function handleStorageChange(changes, areaName) {
  if (areaName !== 'local') return;
  const settingsChange = changes[STORAGE_KEY_SPLIT_SETTINGS];
  if (!settingsChange) return;

  const nextSettings = normalizeSplitSettings(settingsChange.newValue);
  if (JSON.stringify(nextSettings) === JSON.stringify(splitSettingsCache)) {
    return;
  }

  splitSettingsCache = nextSettings;
  refreshLayoutFromSettings();
}

if (!window.splitViewMessageListenerBound) {
  chrome.runtime.onMessage.addListener(handleRuntimeMessage);
  window.splitViewMessageListenerBound = true;
}

if (window.splitViewStorageChangeHandler) {
  chrome.storage.onChanged.removeListener(window.splitViewStorageChangeHandler);
}
window.splitViewStorageChangeHandler = handleStorageChange;
chrome.storage.onChanged.addListener(window.splitViewStorageChangeHandler);

window.splitViewRuntimeVersion = CONTENT_SCRIPT_RUNTIME_VERSION;
if (!window.splitViewInitialized) {
  window.splitViewInitialized = true;
}
