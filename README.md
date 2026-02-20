# BlueDog Blog

BlueDog 的 Hugo 博客源码仓库。

- 线上地址：`https://bluedog.website/`
- 主题：`PaperMod`（本仓库在 `layouts/` 与 `assets/` 中做了覆盖与定制）
- 搜索：`Pagefind`
- 发布：`GitHub Actions -> GitHub Pages`

## 快速开始

```bash
cd "/Users/bluedog/Desktop/工作文件/自己的一些事情/Blog"
hugo server -D
```

打开：`http://localhost:1313`

## 仓库结构（核心）

- `content/`：文章与页面内容
- `data/`：结构化数据（About 页资料）
- `layouts/`：主题覆盖模板
- `assets/`：样式与前端资源
- `static/`：静态文件（字体、品牌资源、验证文件、`CNAME`）
- `scripts/`：元数据与收录自动化脚本
- `.github/workflows/`：CI/CD 工作流

## 文档入口

- 使用手册：`docs/USAGE.md`
- 结构说明：`docs/STRUCTURE.md`
- 兼容入口：`BLOG_USAGE.md`（重定向到 `docs/USAGE.md`）

## 发布流程（摘要）

推送到 `main` 后，自动执行：

1. 元数据质检
2. Hugo 构建
3. Pagefind 索引
4. 部署到 GitHub Pages

附加工作流：

- `Link Check`：仅手动触发 + 每周定时
- `Uptime Check`：定时巡检

## 维护建议

- 优先编辑 `docs/USAGE.md`，避免在多个文件重复维护同一套说明
- 不提交本地构建产物（`public/`、`resources/`、`.hugo_build.lock`）
