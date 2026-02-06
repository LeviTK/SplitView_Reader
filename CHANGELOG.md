# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

- 待补充。

## [v1.0.9] - 2026-02-06

- 清理 `content.js` 中已下线批量模式相关遗留注释，降低维护噪音。
- 移除 `content.css` 中未使用的 `.splitview-batch-overlay` 样式及相关说明。
- 升级扩展清单版本：`manifest.json` `1.0.0 -> 1.0.9`。

## [v1.0.8] - 2026-02-06

- 针对受保护页面（如 `chrome://`）注入失败新增错误识别与降级处理。
- `insertCSS` 与 `executeScript` 遇到受保护 URL 错误时改为 `warn + return`，避免噪音错误日志。

## [v1.0.7] - 2026-02-06

- 完成本轮修复收尾，更新 `FIX_TODO.md` 全部任务状态。
- 执行脚本语法检查与仓库状态检查，确认当前修复链路可交付。

## [v1.0.6] - 2026-02-06

- 消息协议常量化：`background.js` 与 `content.js` 使用统一 `ACTION_START_SELECTION` 常量。
- 更新 `README.md`，移除失效的批量锁定/Enter/覆盖层描述，改为当前真实交互流程。
- 同步修正 `content.js` 文件头注释描述。

## [v1.0.5] - 2026-02-06

- 移除 `manifest.json` 中不必要的 `host_permissions`。
- 将 `web_accessible_resources.matches` 从 `<all_urls>` 收敛为 `http://*/*` 与 `https://*/*`。

## [v1.0.4] - 2026-02-06

- 增强复制流程错误处理，补齐 Markdown/Rich Text 分支失败兜底与提示。
- `copyHtmlSource` 增加空内容与失败提示保护。
- `exportToPDF` 增加上下文校验、`afterprint` 清理与超时清理兜底。

## [v1.0.3] - 2026-02-06

- 收紧 `expandContent` 文本匹配点击范围。
- 默认仅允许按钮类节点触发展开，不再点击 `a[href]`，避免页面跳转风险。

## [v1.0.2] - 2026-02-06

- 修复标签点击目标漂移：新增 `lastRealHoveredElement`。
- `handleMouseMove` 排除 `#splitview-highlight-label` 参与悬停目标计算。
- 点击标签时优先使用最后真实悬停元素进行同级提取。

## [v1.0.1] - 2026-02-06

- 新增 `.gitignore` 并忽略 `.DS_Store`。
- 将已跟踪的 `.DS_Store` 从 Git 索引移除（保留本地文件）。
- 新增修复文档：`REPAIR_PLAN.md`、`FIX_TODO.md`、`CHANGELOG.md`。
