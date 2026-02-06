# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

- 待补充。

## [v1.2.0] - 2026-02-06

### 新增
- 分屏布局完整挤压：新增三层挤压策略（html 宽度约束 + body 子容器限制 + fixed 元素调整），解决 x.com 等 SPA 站点页面内容未被挤压的问题。
- Fixed 元素智能处理（`svFixedSqueezer`）：自动扫描并调整 `position: fixed` 元素的宽度/偏移，使用 MutationObserver 处理动态新增的 fixed 元素，窗口 resize 时自动重算。
- 拖动分割线调整面板宽度：面板左侧新增可拖动的 resize handle，支持实时拖拽调整分屏比例（范围 20%~60%），拖动时禁用面板过渡动画以保持流畅。
- 站点规则新增 `hideOnSplit` 字段：支持在分屏模式下按 CSS 选择器隐藏指定元素，关闭面板后自动恢复。

### 修复
- 高亮标签顶部溢出：当元素贴近视口顶部时，标签自动移入高亮框可见区域内侧，避免超出页面不可见。

### 调整
- `manifest.json` 版本升级到 `1.2.0`。

## [v1.1.1] - 2026-02-06

- 修复选中后右侧不显示问题：提取链路增加异常兜底与显示前有效内容判定。
- 当提取结果为空时，不打开右侧面板，改为提示“未提取到可显示内容”。
- 右侧内容改为卡片式渲染：每条提取结果独立卡片展示，提升可读性。
- 分屏布局保持右侧固定面板 + 左侧挤压，并强化渲染稳定性。
- 增加内容脚本版本握手与监听去重：检测到旧版本脚本时自动重注入，避免刷新后仍运行旧逻辑。
- `manifest.json` 版本升级到 `1.1.1`。

## [v1.1.0] - 2026-02-06

- 新增分屏参数化配置：全局默认宽度（20%~60%，步长 1%）+ 站点独立宽度覆盖。
- 新增白名单站点策略：仅白名单站点使用参数化分屏，非白名单保持默认 40%。
- 面板内新增“设置”入口，可快速切换当前站点白名单和宽度覆盖并即时生效。
- 新增扩展设置页：`options.html`、`options.css`、`options.js`，支持完整配置管理。
- `manifest.json` 新增 `options_page` 并升级版本到 `1.1.0`。
- 分屏宽度由固定值改为动态配置：支持站点命中后自动应用有效宽度并实时调整页面 `padding-right`。
- 增加配置存储结构 `splitViewSettings`（`chrome.storage.local`），支持默认值回填与配置归一化。
- 分屏参数化（`content.js` + `content.css`）：新增配置模型 `splitViewSettings`、白名单站点匹配（含子域）、全局默认宽度 + 站点独立宽度覆盖；非白名单站点保持默认 40%；分屏宽度改为动态 CSS 变量（不再固定 `40vw`）。
- 面板内设置入口（`content.js`）：新增“设置”按钮；支持当前站点加入/移除白名单；支持当前站点独立宽度覆盖；支持实时保存并即时生效。
- 新增 Options 页面：`options.html`、`options.css`、`options.js`；支持全局宽度设置、白名单管理、站点覆盖管理、重置默认。
- 配置与文档更新：`manifest.json` 升级到 `1.1.0` 并新增 `options_page`；`README.md` 补充分屏参数化与设置页说明；`CHANGELOG.md` 新增 `v1.1.0` 版本记录。

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
