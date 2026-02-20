# 仓库结构说明

本仓库采用“内容、模板、静态资源、自动化脚本”分层结构，便于长期维护。

## 顶层目录职责

- `content/`
  - 站点内容源文件（Markdown）
  - `content/posts/archive/`：已发布文章
  - `content/posts/pending/`：待发布草稿
  - `content/about/`：About 页面
- `data/`
  - 结构化数据（当前主要用于 About 页面），文件：`data/about.yaml`
- `layouts/`
  - 对主题的模板覆盖（只放你自定义过的模板）
- `assets/`
  - 站点样式和前端资源（当前核心：`assets/css/extended/custom.css`）
- `static/`
  - 原样复制到站点根目录的静态资源
  - 包含字体、品牌图标、站点验证文件、`CNAME`
- `scripts/`
  - 运维/发布辅助脚本（元数据规范化、质检、IndexNow）
- `.github/workflows/`
  - CI/CD 工作流（构建部署、死链检查、可用性巡检）
- `themes/PaperMod/`
  - 上游主题子模块，不直接改；优先在 `layouts/` 和 `assets/` 覆盖

## 约束与规范

- 构建产物不入库：`public/`、`resources/`、`.hugo_build.lock`
- 主题修改优先“覆盖”而不是“改主题源码”
- 运行文档集中在 `docs/`，减少多份重复说明

## 本次整理变更

- 删除重复模板：`layouts/posts/list.html`（与 `layouts/posts/section.html` 内容一致）
- 删除重复域名文件：仓库根 `CNAME`（保留 `static/CNAME` 作为唯一来源）
- 文档分层：详细手册迁移至 `docs/USAGE.md`，根目录 `README.md` 保留入口信息
