# BlueDog Blog 使用说明

本仓库是你的博客源码，技术栈：

- `Hugo + PaperMod`
- `Pagefind` 全文搜索
- `GitHub Actions` 自动发布到 `GitHub Pages`
- 自定义域名：`https://bluedog.website/`

## 1. 你最常改的文件

- 站点配置：`hugo.toml`
- 首页/风格：`assets/css/extended/custom.css`
- About Me 结构化资料：`data/about.yaml`
- About Me 页面配置：`content/about/index.md`
- 已发布文章：`content/posts/archive/`
- 待发布草稿：`content/posts/pending/`
- 元数据脚本：`scripts/normalize_post_metadata.py`
- 元数据质检脚本：`scripts/check_metadata_quality.py`
- IndexNow 提交脚本：`scripts/submit_indexnow.py`

## 2. 本地预览

```bash
cd "/Users/bluedog/Desktop/工作文件/自己的一些事情/Blog"
hugo server -D
```

浏览器打开：`http://localhost:1313`

说明：

- `-D` 会把 `draft: true` 的草稿也显示出来，方便你预览。

## 3. 新建文章（发布 / 草稿）

推荐两种方式：

1. 用 Hugo 模板新建（推荐）：

```bash
hugo new posts/archive/技术好文/你的文章名.md
```

2. 直接复制一篇已有文章改名改内容。

发布文章放在：

- `content/posts/archive/你的分类/xxx.md`

草稿文章放在：

- `content/posts/pending/xxx.md`

Front Matter 模板（可直接复制）：

```md
---
title: "文章标题"
date: 2026-02-19T12:00:00+08:00
draft: false
description: "一句话摘要（用于 SEO）"
summary: "列表页摘要（可与 description 一致）"
categories:
  - "技术好文"
tags:
  - "技术实践"
  - "零信任"
keywords:
  - "技术实践"
  - "零信任"
  - "BlueDog"
cover:
  image: "/branding/banner-logo.webp"
  alt: "BlueDog Blog Cover"
  caption: ""
  relative: false
  hidden: true
  hiddenInList: true
  hiddenInSingle: true
---

正文...
```

提示：

- 如果你还不想发布，把 `draft` 设为 `true`，或先放在 `pending` 目录。
- 图片继续用 PicGo 外链，不需要本地图片目录。

## 4. Description / Tags 设计规范（重点）

### description 规则

- 长度建议：`50-120` 字。
- 内容建议：一句话说清“问题 + 方法/结论”。
- 不建议：只写“原文地址”、纯链接、过短无信息文本。

### tags 规则（重设计，三层）

- 内容层（必选 1 个）：
  - `技术实践` / `技术译文` / `阅读思考` / `科研方法` / `草稿`
- 主题层（建议 1-3 个）：
  - `零信任` / `AI安全` / `数据安全` / `云安全` / `Kubernetes` / `API安全`
  - `漏洞研究` / `威胁情报` / `网络工具` / `DevSecOps` / `恶意软件`
- 表达层（可选 1-2 个）：
  - `实操指南` / `方法解析` / `治理实践` / `标准解读` / `读后总结`

每篇文章建议 `3-6` 个标签，结构建议为：`1 内容 + 1~3 主题 + 0~2 表达`。

### 批量规范化（已内置脚本）

```bash
cd "/Users/bluedog/Desktop/工作文件/自己的一些事情/Blog"
python3 scripts/normalize_post_metadata.py --apply
```

这个脚本会自动：

- 补齐缺失 `description`
- 按新规则重建 `tags` 与 `keywords`
- 保留正文不变

## 5. 发布新文章

如果文章在 `pending`：

1. 把文件移动到 `archive` 对应分类目录（推荐）。
2. 确认 `draft: false`。
3. 提交并推送：

```bash
cd "/Users/bluedog/Desktop/工作文件/自己的一些事情/Blog"
git add .
git commit -m "publish: 文章标题"
git push
```

推送后会自动触发 GitHub Actions 构建和发布。

## 6. 修改已有文章

1. 打开对应 `.md` 文件直接改内容。
2. 需要的话更新 `date`（可选）。
3. `git add . && git commit -m "update: 文章标题" && git push`

## 7. 删除文章

1. 删除对应的 `.md` 文件。
2. 提交推送：

```bash
cd "/Users/bluedog/Desktop/工作文件/自己的一些事情/Blog"
git add .
git commit -m "remove: 文章标题"
git push
```

## 8. 如何修改 About Me（结构化）

核心数据改这里：

- `data/about.yaml`

页面级配置改这里：

- `content/about/index.md`

常见可改字段（`data/about.yaml`）：

- `profile.roles`
- `highlights`
- `certifications`
- `honors`
- `works`
- `roadmap`

社交链接位置：

- `hugo.toml` 下的 `[[params.socialIcons]]`

当前邮箱图标行为：

- 点击邮箱图标不会跳转 `mailto`
- 会自动复制邮箱地址并弹出“已复制”提示

## 9. 发布流程（自动）

每次 `git push` 到 `main` 分支后，GitHub Actions 会自动执行：

1. `python3 scripts/check_metadata_quality.py`（元数据质检）
2. `hugo --gc --minify`
3. `npx -y pagefind --site public`
4. 发布到 GitHub Pages

工作流文件：

- `.github/workflows/hugo.yml`
- `.github/workflows/link-check.yml`（推送、PR、每周死链检查）
- `.github/workflows/uptime-check.yml`（每 30 分钟探测可用性）

## 10. 域名检查（出问题时看这里）

- `hugo.toml` 的 `baseURL`：`https://bluedog.website/`
- `CNAME` 文件内容：`bluedog.website`
- `static/4bae4031fdb246e2a0ca3d0ad07fdace.txt` 可访问
- GitHub Pages 设置里的 `Custom domain`：`bluedog.website`

如果网页没立刻更新：

1. 先看 GitHub Actions 是否完成。
2. 浏览器强刷：`Cmd + Shift + R`。

## 11. 统计脚本配置（Plausible / Umami）

在 `hugo.toml` 修改：

- `params.analytics.enabled = true`
- `params.analytics.provider = "plausible"` 或 `"umami"`
- Plausible 填 `params.analytics.plausible.domain`
- Umami 填 `params.analytics.umami.websiteId` 和 `script`

说明：

- 默认是关闭统计，开启后会自动注入脚本。
- 404 页面会自动上报一次 `404` 事件（若统计脚本已启用）。
- 其余事件已内置：`search_submit_home`、`search_enter`、`search_quick_tag_click`、`search_filter_year`、`search_filter_tag`、`outbound_click`、`tag_click`、`email_copy`

## 12. 收录与死链检查

在 `hugo.toml` 可选填写：

- `params.analytics.google.SiteVerificationTag`
- `params.analytics.bing.SiteVerificationTag`

向搜索引擎提交：

- `https://bluedog.website/sitemap.xml`

IndexNow 已在部署流程自动执行（失败不阻断发布）：

- `scripts/submit_indexnow.py`
- `static/4bae4031fdb246e2a0ca3d0ad07fdace.txt`

本地 dry-run 验证：

```bash
python3 scripts/submit_indexnow.py \
  --sitemap public/sitemap.xml \
  --host bluedog.website \
  --key 4bae4031fdb246e2a0ca3d0ad07fdace \
  --key-location https://bluedog.website/4bae4031fdb246e2a0ca3d0ad07fdace.txt \
  --dry-run
```
