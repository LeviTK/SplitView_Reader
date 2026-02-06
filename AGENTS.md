# AGENTS.md

本文件用于说明如何协作维护 SplitView Reader Chrome MV3 扩展。

## 交互语言要求
与用户沟通时一律使用中文（含问题、说明、总结与提问），除非用户明确要求使用其他语言。

## 项目目标
SplitView Reader 在页面内注入检查器，允许用户点击元素（或确认同级批量提取），并在右侧分屏面板渲染提取内容。支持富文本/Markdown 切换、复制/导出，以及站点规则驱动的内容展开。

## 入口与运行流程
- `background.js`（Service Worker）：处理 `chrome.action.onClicked`，注入 `content.css`、`lib/markdown-it.min.js`、`content.js`，并发送 `startSelection`。
- `content.js`（内容脚本）：初始化检查器、跟踪悬停元素、处理点击提取、加载站点规则、展开内容、提取 HTML、管理分屏面板 UI。
- `content.css`：高亮框、标签、通知与分屏面板样式。
- `manifest.json`：MV3 配置、权限与 `web_accessible_resources`（站点规则）。

典型流程：
1. 用户点击扩展图标。
2. 后台注入 CSS/JS 并发送 `startSelection`。
3. 内容脚本加载当前域名站点规则，启动检查器。
4. 悬停更新高亮框/标签；点击提取当前元素；点击标签弹出同级提取确认。
5. 提取的 HTML 在分屏面板显示；可切换模式与复制/导出。

## 关键状态与行为
- 检查器状态：`isInspecting`、`currentHoveredElement`、高亮元素引用。
- 分屏面板状态：`splitPanel`、`currentMode`、`currentContent`。
- `loadSiteRule()` 先尝试完整域名，再回退根域；规则文件位于 `site_rules/`。
- 提取流程：`expandContent()` → `extractElementContent()`。

## 站点规则格式
文件：`site_rules/<domain>.json`。
常用字段：
- `expandSelectors`：在提取根内点击的 CSS 选择器。
- `expandText`：按钮/链接文本匹配关键字。
- `collapseStyleFix`：复制/导出时的样式修复。

新增规则：
- 文件名使用域名（如 `example.com.json`）。
- JSON 必须合法（双引号、无尾逗号）。
- `manifest.json` 已暴露 `site_rules/*.json`。

## 必须保持的 DOM ID/类名
- `#splitview-highlight-box`、`#splitview-highlight-label`
- `#splitview-panel`、`.sv-header`、`.sv-content`、`.sv-btn`
- `#splitview-notification`
- `body.sv-split-active`

修改这些 ID/类名时，需同步更新 `content.js` 与 `content.css`。

## 重要约束与注意点
- 内容脚本使用捕获阶段监听（`addEventListener(..., true)`）拦截页面事件。
- `#splitview-highlight-label` 必须保持 `pointer-events: auto`，否则点击标签无法触发。
- 分屏布局通过 `body` 的 `padding-right: 40vw` 实现；关闭需恢复原始内联样式。
- HTML→Markdown 为轻量自实现（无外部解析器）。
- 复制源码会内联白名单样式，保证 EPUB 友好。
- PDF 导出通过 iframe + `window.print`；如需替换需提供等效策略。

## 本地开发/测试
无需构建步骤。
1. 打开 Chrome → `chrome://extensions/` → 开启开发者模式。
2. 点击“加载已解压的扩展程序”，选择项目根目录。
3. 打开网页后点击扩展图标，验证：
   - 悬停高亮/标签
   - 点击单项提取
   - 点击标签 → 同级提取确认
   - 富文本/Markdown 切换、复制、复制源码、PDF、关闭

## 文件一览
| 文件/目录 | 说明 |
|-----------|------|
| `background.js` | Service Worker，注入脚本与启动信号 |
| `content.js` | 检查器、提取逻辑、分屏 UI（~800 行） |
| `content.css` | 高亮框、面板、通知样式 |
| `manifest.json` | MV3 配置、权限声明 |
| `site_rules/` | 站点规则 JSON（twitter.com、x.com） |
| `lib/markdown-it.min.js` | Markdown 渲染库（由后台注入） |
| `icons/` | 扩展图标（16/48/128px） |

## 核心函数速查（content.js）
| 函数 | 作用 |
|------|------|
| `initInspector()` | 启动检查器，绑定事件监听 |
| `stopInspector()` | 停止检查器，移除事件监听 |
| `highlightElement(el)` | 更新高亮框位置与标签文本 |
| `handleLabelClick(target)` | 点击标签触发同级批量提取确认 |
| `getSiblings(target)` | 获取相似兄弟元素（同标签+类名） |
| `processExtraction(elements)` | 展开内容 → 提取 HTML → 显示面板 |
| `expandContent(root)` | 根据站点规则点击展开按钮 |
| `extractElementContent(el)` | 克隆并清理 DOM，返回 HTML |
| `showSplitView(html)` | 创建/更新分屏面板 |
| `loadSiteRule()` | 加载当前域名的站点规则 |
| `htmlToMarkdown(html)` | 轻量 HTML→Markdown 转换 |
| `copyHtmlSource()` | 复制内联样式的 HTML 源码 |
| `exportToPDF()` | iframe + print 导出 PDF |

## 站点规则示例
```json
// site_rules/twitter.com.json
{
  "host": "twitter.com",
  "expandSelectors": ["button[data-testid='tweet-text-show-more-link']"],
  "expandText": ["显示更多", "Show more", "Read more"],
  "removeSelectors": [],
  "collapseStyleFix": {
    "maxHeight": "none",
    "overflow": "visible",
    "-webkit-line-clamp": "unset"
  }
}
```

## 调试技巧
- **Service Worker 日志**：`chrome://extensions/` → 点击扩展的"Service Worker"链接
- **内容脚本日志**：目标页面的 DevTools Console
- **重新加载扩展**：修改代码后点击扩展卡片的刷新按钮
- **检查注入状态**：Console 输入 `window.splitViewInitialized`

## 版本发布规范
- 每次创建 Git Tag 前，必须先更新 `CHANGELOG.md` 中对应版本段落，写明本次变更内容（至少包含新增/修复/调整）。
- Tag 必须使用带注释标签（Annotated Tag），并在注释中包含对应版本更新摘要。
- 每次创建 Git Tag 后，需按顺序推送：先推送 `main`，再单独推送对应 Tag 到远程仓库。
- 如需修改已发布版本（例如 `v1.1.0`）的变更描述，必须在仓库中补充提交并同步更新该 Tag 指向。
- 更新已发布 Tag（重打 Tag）后，必须显式使用 `--force` 推送该 Tag，并在提交/沟通中说明“Tag 已重写”。

## 常见问题排查
| 问题 | 排查方向 |
|------|----------|
| 点击图标无反应 | 检查 `chrome.scripting` 权限、页面是否为 `chrome://` |
| 高亮框不跟随 | 检查 `highlightBox` 是否创建、z-index 冲突 |
| 标签点击无效 | 确认 `pointer-events: auto` 样式存在 |
| 站点规则未生效 | 检查文件名、JSON 格式、`web_accessible_resources` |

## 后续改造清单（按优先级）

### P0（优先修复）
1. **修复标签点击目标漂移**（`content.js`）  
   在 `handleMouseMove` 中排除 `#splitview-highlight-label`，并在点击标签时使用“上一次真实悬停元素”作为提取目标，避免误提取标签本身。
2. **限制 `expandContent` 的危险点击**（`content.js`）  
   文本匹配扩展时默认不点击 `a[href]`，仅点击 `button`、`[role="button"]` 或无跳转风险节点，避免触发页面跳转。
3. **收敛权限范围（最小权限）**（`manifest.json`）  
   评估并尽量缩小 `host_permissions`，保留 `activeTab + scripting` 动态注入主路径。

### P1（核心优化）
1. **消息协议类型化**（`background.js`、`content.js`）  
   统一消息常量与 payload 结构，避免字符串散落和后续扩展混乱。
2. **可选耗时逻辑迁移到 background**（`background.js`、`content.js`）  
   为网络请求/规则拉取等逻辑预留代理通道：content 发消息，background 执行并回传。
3. **面板 UI 隔离渲染预案**（`content.js`、`content.css`）  
   预留 Shadow DOM 迁移接口，遇到样式污染时可快速切换。
4. **清理遗留注释与失效分支**（`content.js`、`content.css`）  
   删除大段 `REMOVED` 与临时注释，保留必要设计说明。

### P2（稳定性与文档）
1. **文档与实现对齐**（`README.md`、`AGENTS.md`）  
   移除“批量锁定/Enter确认”等已失效描述，更新为当前真实流程。
2. **导出链路稳定性增强**（`content.js`）  
   为 `copyContent`、`copyHtmlSource`、`exportToPDF` 增加异常兜底与统一提示。
3. **新增最小回归用例清单**（`README.md`）  
   固化注入、悬停、单提取、同级提取、复制、PDF 六条手工回归路径。

---
