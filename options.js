const SplitViewSettings = globalThis.SplitViewSettings;
if (!SplitViewSettings) {
  throw new Error('SplitView settings module missing. Ensure split_settings.js is loaded first.');
}

const {
  DEFAULT_SPLIT_SETTINGS,
  deepClone,
  normalizeDomain,
  isValidDomain,
  clampWidth,
  loadSplitSettings: loadSettingsFromStorage,
  saveSplitSettings: saveSettingsToStorage
} = SplitViewSettings;

async function loadSettings() {
  return loadSettingsFromStorage(chrome.storage.local);
}

async function saveSettings(settings) {
  return saveSettingsToStorage(chrome.storage.local, settings);
}

function setStatus(message, isError = false) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.style.color = isError ? '#a12828' : '#0f6f3d';
  setTimeout(() => {
    if (status.textContent === message) {
      status.textContent = '';
    }
  }, 2000);
}

let settingsCache = deepClone(DEFAULT_SPLIT_SETTINGS);

function renderGlobal() {
  const range = document.getElementById('global-width-range');
  const number = document.getElementById('global-width-number');
  range.min = String(settingsCache.global.minWidthPct);
  range.max = String(settingsCache.global.maxWidthPct);
  range.step = String(settingsCache.global.stepPct);
  range.value = String(settingsCache.global.defaultWidthPct);
  number.min = String(settingsCache.global.minWidthPct);
  number.max = String(settingsCache.global.maxWidthPct);
  number.step = String(settingsCache.global.stepPct);
  number.value = String(settingsCache.global.defaultWidthPct);
}

function renderWhitelist() {
  const list = document.getElementById('whitelist-list');
  list.innerHTML = '';
  const domains = settingsCache.whitelist.domains;
  if (!domains.length) {
    const li = document.createElement('li');
    li.textContent = '暂无白名单站点';
    list.appendChild(li);
    return;
  }

  domains.forEach((domain) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${domain}</span><button data-domain="${domain}" data-action="remove-whitelist">移除</button>`;
    list.appendChild(li);
  });
}

function renderOverrides() {
  const list = document.getElementById('override-list');
  list.innerHTML = '';
  const entries = Object.entries(settingsCache.siteOverrides);
  if (!entries.length) {
    const li = document.createElement('li');
    li.textContent = '暂无站点独立宽度';
    list.appendChild(li);
    return;
  }

  entries
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([domain, cfg]) => {
      const li = document.createElement('li');
      li.innerHTML = `
        <span>${domain} - ${cfg.widthPct}%</span>
        <button data-domain="${domain}" data-action="remove-override">移除</button>
      `;
      list.appendChild(li);
    });
}

function renderAll() {
  renderGlobal();
  renderWhitelist();
  renderOverrides();
}

async function init() {
  settingsCache = await loadSettings();
  renderAll();

  const range = document.getElementById('global-width-range');
  const number = document.getElementById('global-width-number');

  range.addEventListener('input', () => {
    number.value = range.value;
  });
  number.addEventListener('input', () => {
    range.value = number.value;
  });

  document.getElementById('save-global').addEventListener('click', async () => {
    const width = clampWidth(number.value, settingsCache.global.minWidthPct, settingsCache.global.maxWidthPct);
    settingsCache.global.defaultWidthPct = width;
    settingsCache = await saveSettings(settingsCache);
    renderAll();
    setStatus('全局宽度已保存');
  });

  document.getElementById('add-whitelist').addEventListener('click', async () => {
    const input = document.getElementById('whitelist-input');
    const domain = normalizeDomain(input.value);
    if (!isValidDomain(domain)) {
      setStatus('域名格式不正确', true);
      return;
    }
    const set = new Set(settingsCache.whitelist.domains);
    set.add(domain);
    settingsCache.whitelist.domains = Array.from(set).sort();
    settingsCache = await saveSettings(settingsCache);
    input.value = '';
    renderWhitelist();
    setStatus('白名单已更新');
  });

  document.getElementById('whitelist-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action="remove-whitelist"]');
    if (!btn) return;
    const domain = normalizeDomain(btn.dataset.domain);
    settingsCache.whitelist.domains = settingsCache.whitelist.domains.filter(d => d !== domain);
    settingsCache = await saveSettings(settingsCache);
    renderWhitelist();
    setStatus('已移除白名单');
  });

  document.getElementById('add-override').addEventListener('click', async () => {
    const domainInput = document.getElementById('override-domain');
    const widthInput = document.getElementById('override-width');
    const domain = normalizeDomain(domainInput.value);
    if (!isValidDomain(domain)) {
      setStatus('域名格式不正确', true);
      return;
    }
    const width = clampWidth(widthInput.value, settingsCache.global.minWidthPct, settingsCache.global.maxWidthPct);
    settingsCache.siteOverrides[domain] = { widthPct: width };
    settingsCache = await saveSettings(settingsCache);
    domainInput.value = '';
    renderOverrides();
    setStatus('站点宽度已保存');
  });

  document.getElementById('override-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action="remove-override"]');
    if (!btn) return;
    const domain = normalizeDomain(btn.dataset.domain);
    delete settingsCache.siteOverrides[domain];
    settingsCache = await saveSettings(settingsCache);
    renderOverrides();
    setStatus('已移除站点覆盖');
  });

  document.getElementById('reset-defaults').addEventListener('click', async () => {
    settingsCache = await saveSettings(deepClone(DEFAULT_SPLIT_SETTINGS));
    renderAll();
    setStatus('已重置为默认配置');
  });
}

init().catch((err) => {
  console.error('SplitView options init failed:', err);
  setStatus('设置页加载失败', true);
});
