/**
 * SplitView 设置共享模块
 * 作用：
 * 1. 统一配置 schema（默认值、归一化、域名工具函数）。
 * 2. 提供版本迁移入口，避免多上下文各自演进导致契约漂移。
 * 3. 统一封装 storage 读写，确保写入格式一致。
 */
(function initSplitViewSettings(global) {
  'use strict';

  const STORAGE_KEY_SPLIT_SETTINGS = 'splitViewSettings';
  const SETTINGS_SCHEMA_VERSION = 2;

  const DEFAULT_SPLIT_SETTINGS = {
    version: SETTINGS_SCHEMA_VERSION,
    global: {
      defaultWidthPct: 40,
      minWidthPct: 20,
      maxWidthPct: 60,
      stepPct: 1
    },
    whitelist: {
      enabled: true,
      domains: []
    },
    siteOverrides: {}
  };

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function clampWidth(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    return Math.max(min, Math.min(max, Math.round(num)));
  }

  function normalizeDomain(input) {
    if (!input) return '';
    let domain = String(input).trim().toLowerCase();
    domain = domain.replace(/^https?:\/\//, '');
    domain = domain.split('/')[0];
    domain = domain.replace(/:\d+$/, '');
    domain = domain.replace(/^\.+|\.+$/g, '');
    domain = domain.replace(/^www\./, '');
    return domain;
  }

  function isValidDomain(domain) {
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain);
  }

  function getDomainKey(hostname) {
    const normalized = normalizeDomain(hostname);
    const parts = normalized.split('.').filter(Boolean);
    if (parts.length > 2) {
      return parts.slice(-2).join('.');
    }
    return normalized;
  }

  function matchDomainRule(hostname, domains) {
    const normalizedHost = normalizeDomain(hostname);
    for (const rawDomain of domains || []) {
      const domain = normalizeDomain(rawDomain);
      if (!domain) continue;
      if (normalizedHost === domain || normalizedHost.endsWith(`.${domain}`)) {
        return domain;
      }
    }
    return null;
  }

  const MIGRATIONS = {
    2(value) {
      const migrated = value && typeof value === 'object' ? deepClone(value) : {};
      migrated.version = 2;
      return migrated;
    }
  };

  function applyMigrations(raw) {
    let current = raw && typeof raw === 'object' ? deepClone(raw) : {};
    let version = Number(current.version);
    if (!Number.isInteger(version) || version < 1) {
      version = 1;
    }

    for (let targetVersion = version + 1; targetVersion <= SETTINGS_SCHEMA_VERSION; targetVersion++) {
      const migrate = MIGRATIONS[targetVersion];
      if (typeof migrate === 'function') {
        current = migrate(current);
      } else {
        current.version = targetVersion;
      }
    }

    current.version = SETTINGS_SCHEMA_VERSION;
    return current;
  }

  function normalizeSplitSettings(raw) {
    const migrated = applyMigrations(raw);
    const merged = deepClone(DEFAULT_SPLIT_SETTINGS);

    if (!migrated || typeof migrated !== 'object') return merged;
    merged.version = SETTINGS_SCHEMA_VERSION;

    if (migrated.global && typeof migrated.global === 'object') {
      merged.global.minWidthPct = clampWidth(migrated.global.minWidthPct, 10, 90);
      merged.global.maxWidthPct = clampWidth(
        migrated.global.maxWidthPct,
        merged.global.minWidthPct,
        90
      );
      merged.global.defaultWidthPct = clampWidth(
        migrated.global.defaultWidthPct,
        merged.global.minWidthPct,
        merged.global.maxWidthPct
      );
      merged.global.stepPct = clampWidth(migrated.global.stepPct, 1, 10);
    }

    if (migrated.whitelist && typeof migrated.whitelist === 'object') {
      merged.whitelist.enabled = migrated.whitelist.enabled !== false;
      if (Array.isArray(migrated.whitelist.domains)) {
        merged.whitelist.domains = Array.from(
          new Set(migrated.whitelist.domains.map(normalizeDomain).filter(Boolean))
        );
      }
    }

    if (migrated.siteOverrides && typeof migrated.siteOverrides === 'object') {
      const overrides = {};
      for (const [domainRaw, config] of Object.entries(migrated.siteOverrides)) {
        const domain = normalizeDomain(domainRaw);
        if (!domain || !config || typeof config !== 'object') continue;
        overrides[domain] = {
          widthPct: clampWidth(
            config.widthPct,
            merged.global.minWidthPct,
            merged.global.maxWidthPct
          )
        };
      }
      merged.siteOverrides = overrides;
    }

    return merged;
  }

  async function loadSplitSettings(storageArea) {
    const result = await storageArea.get(STORAGE_KEY_SPLIT_SETTINGS);
    const raw = result[STORAGE_KEY_SPLIT_SETTINGS];
    const normalized = normalizeSplitSettings(raw);
    const shouldPersist =
      !raw ||
      typeof raw !== 'object' ||
      Number(raw.version) !== SETTINGS_SCHEMA_VERSION ||
      JSON.stringify(raw) !== JSON.stringify(normalized);
    if (shouldPersist) {
      await storageArea.set({ [STORAGE_KEY_SPLIT_SETTINGS]: normalized });
    }
    return normalized;
  }

  async function saveSplitSettings(storageArea, settings) {
    const normalized = normalizeSplitSettings(settings);
    await storageArea.set({ [STORAGE_KEY_SPLIT_SETTINGS]: normalized });
    return normalized;
  }

  global.SplitViewSettings = Object.freeze({
    STORAGE_KEY_SPLIT_SETTINGS,
    SETTINGS_SCHEMA_VERSION,
    DEFAULT_SPLIT_SETTINGS,
    deepClone,
    clampWidth,
    normalizeDomain,
    isValidDomain,
    getDomainKey,
    matchDomainRule,
    normalizeSplitSettings,
    loadSplitSettings,
    saveSplitSettings
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
