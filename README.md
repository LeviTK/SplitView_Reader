# SplitView Reader - Chrome MV3 分屏阅读插件

Arc 浏览器风格的页面内分屏阅读 Chrome 插件，支持点击提取网页内容并在右侧分屏阅读，支持富文本与 Markdown，提供沉浸式阅读体验。

## 🌟 核心特性

- **页面内分屏**：不依赖独立窗口或侧边栏，提取后在右侧展开阅读面板；支持按白名单站点启用参数化分屏宽度。左侧页面内容完整挤压（含 `position: fixed` 导航栏等），兼容 x.com 等复杂 SPA 站点。
- **拖动调整宽度**：面板左侧提供可拖动分割线，实时调整分屏比例（20%~60%）。
- **元素检查与提取**：
  - **悬停预览**：高亮鼠标当前元素并显示标签。
  - **单项提取**：点击当前元素立即提取并显示到右侧面板。
  - **同级提取**：点击标签后手动确认，可一次提取同级相似元素。
  - **退出检查**：按 `Esc` 取消当前检查模式。
- **自动展开内容**：内置站点规则引擎，支持在提取前自动点击“显示更多”、“Read more”按钮（如 X/Twitter），获取完整内容。
- **双模式阅读**：
  - **富文本模式**：按“每条提取结果一张卡片”展示内容，保留原始 HTML 结构与核心样式。
  - **Markdown 模式**：实时转换为 Markdown 格式，适合笔记与存档。
- **高级导出**：
  - **复制内容**：一键复制富文本或 Markdown。
  - **复制源码**：提取纯净 HTML 源码（带轻量化内联样式与绝对路径），兼容 EPUB 制作。
  - **PDF 导出**：将阅读面板内容导出为 PDF 文件。
- **视觉反馈**：提供清晰的高亮框与标签提示。
- **空结果处理**：当提取不到有效内容时，不打开右侧面板，直接通知提示。
- **参数化设置**：
  - 支持全局默认分屏宽度（20%~60%）。
  - 支持站点白名单与“当前站点独立宽度覆盖”。
  - 支持面板内快速设置与扩展 Options 页面完整管理。

## 🚀 架构与功能设计逻辑

本插件采用 **Inject Script** 模式，通过 `background.js` 在用户点击插件图标时动态向当前页面注入内容脚本，实现零侵入式的按需加载。

### 1. 启动与注入
- 用户点击插件图标触发 `chrome.action.onClicked`。
- `background.js` 向当前 Tab 注入 `content.css` 和 `content.js`（含 `markdown-it` 库）。
- 发送 `startSelection` 消息激活 `content.js` 中的检查器。

### 2. 交互流程 (Inspector Mode)
- **初始化**：加载当前域名的站点规则（`site_rules/<domain>.json`）。
- **悬停 (Hover)**：
  - `handleMouseMove` 计算鼠标下元素。
- **提取 (Extract)**：
  - 点击当前元素直接触发提取流程。
  - 点击标签可触发“同级元素批量提取”确认。
  - `expandContent` 根据规则自动展开内容（如模拟点击展开按钮）。
  - `extractElementContent` 净化 DOM（移除脚本/广告/相对路径转绝对路径）。
  - 对有效提取内容构建卡片，调用 `showSplitView`。

### 3. 分屏阅读 (Split View Panel)
- **布局**：提取后打开 `#splitview-panel`；对白名单站点按配置宽度分屏，非白名单保持默认 40%。
- **渲染**：
  - 富文本：按卡片结构渲染提取结果。
  - Markdown：按卡片分节转换为 Markdown。
- **工具栏**：提供模式切换、设置、复制、源码复制、PDF 导出与关闭功能。

## 📂 文件功能清单

### 核心运行文件 (当前生效)
| 文件路径 | 类型 | 功能设计意义 |
|---|---|---|
| `manifest.json` | 配置 | 定义 MV3 权限、Action、Web 资源（站点规则）及入口。 |
| `background.js` | 后台 | 监听图标点击事件，动态注入 CSS/JS，协调初始化消息。 |
| `content.js` | 核心逻辑 | 实现元素检查器、同级提取确认、站点规则加载、内容提取、分屏面板渲染与交互。 |
| `content.css` | 样式 | 定义高亮框、分屏面板及阅读内容的样式。 |
| `options.html/js/css` | 设置页 | 管理全局宽度、白名单站点与站点独立宽度覆盖。 |
| `lib/markdown-it.min.js` | 库 | 第三方库，用于在前端将 HTML 转换为 Markdown。 |
| `site_rules/*.json` | 规则配置 | 针对特定站点（如 x.com, twitter.com）定义的自动展开策略与样式修复规则。 |
| `icons/` | 资源 | 插件图标资源及生成脚本。 |

### 遗留/备用文件 (当前未启用)
> 以下文件属于早期开发阶段或备用方案，目前不在主链路中使用，但保留作为参考。

| 文件路径 | 类型 | 说明 |
|---|---|---|
| `splitview.*` | 独立窗口 | 原计划使用独立 Popup 窗口显示内容，现已改为页面内嵌入。 |
| `sidepanel.*` | 侧边栏 | 原计划使用 Chrome Side Panel API，现已废弃。 |
| `inspector.js` | 旧逻辑 | 独立的检查器逻辑，现已合并重构入 `content.js`。 |
| `popup.*` | 弹窗 | 默认的扩展弹窗，当前 Action 直接触发注入，不显示此弹窗。 |
| `styles.css` | 样式 | 配套 `popup.html` 的样式文件。 |

## 🛠️ 安装与开发

1. 克隆本项目。
2. 打开 Chrome 浏览器，进入 `chrome://extensions/`。
3. 开启右上角的 **开发者模式**。
4. 点击 **加载已解压的扩展程序**，选择本目录。
5. 打开任意网页（推荐 Twitter/X 帖子列表测试），点击插件图标即可使用。

## 📝 站点规则示例 (`site_rules/x.com.json`)

```json
{
  "host": "x.com",
  "expandSelectors": ["button[data-testid='tweet-text-show-more-link']"],
  "expandText": ["显示更多", "Show more"],
  "hideOnSplit": ["[data-testid='sidebarColumn']"],
  "collapseStyleFix": {
    "maxHeight": "none",
    "lineClamp": "unset"
  }
}
```

- `hideOnSplit`：分屏打开时隐藏匹配的元素，关闭后自动恢复。

## License

MIT License
