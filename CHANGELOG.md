# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

- 待补充。

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
