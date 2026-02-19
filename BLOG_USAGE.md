# Blog 使用手册（仅在 Blog 文件夹操作）

工作目录：

`/Users/bluedog/Desktop/工作文件/自己的一些事情/Blog`

---

## 1. 目录约定

- 个人主页配置：`content/about/index.md`
- 个人主页结构化数据：`data/about.yaml`
- 已发布归档：`content/posts/archive/`
- 待发布归档：`content/posts/pending/`（默认 `draft: true`）
- 样式文件：`assets/css/extended/custom.css`
- 元数据规范化：`scripts/normalize_post_metadata.py`
- 元数据质检：`scripts/check_metadata_quality.py`

---

## 2. 新增文章

推荐用命令新建（会自动套用模板）：

```bash
hugo new posts/archive/技术好文/你的文章名.md
```

把新文章放在 `content/posts/archive/你的分类/`，示例：

```md
---
title: "文章标题"
date: 2026-02-19T12:00:00+08:00
draft: false
description: "一句话摘要（用于 SEO）"
summary: "列表页摘要"
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

待发文章放在 `content/posts/pending/` 并保持 `draft: true`。

---

## 3. Description 和 Tags 规范

- `description`：`50-120` 字，讲清主题和结论，不要只放链接、日期句。
- `tags` 使用三层：
  - 内容层：`技术实践` / `技术译文` / `阅读思考` / `科研方法` / `草稿`
  - 主题层：`零信任` / `AI安全` / `数据安全` / `云安全` / `Kubernetes` / `API安全` / `漏洞研究` / `威胁情报` / `网络工具` / `DevSecOps` / `恶意软件`
  - 表达层：`实操指南` / `方法解析` / `治理实践` / `标准解读` / `读后总结`
- 每篇建议 `3-6` 个标签：`1 内容 + 1~3 主题 + 0~2 表达`。

批量规范化：

```bash
python3 scripts/normalize_post_metadata.py --apply
```

质检（CI 同款）：

```bash
python3 scripts/check_metadata_quality.py
```

---

## 4. 图片写法（PicGo）

不使用本地上传目录，统一外链：

```md
![示例图片](https://your-cdn.example.com/2026/demo.png)
```

---

## 5. 修改与删除

- 修改文章：直接编辑对应 `.md`
- 删除文章：直接删除对应 `.md`
- 修改个人主页：编辑 `content/about/index.md`
- 修改样式：编辑 `assets/css/extended/custom.css`

---

## 6. 本地预览

```bash
cd "/Users/bluedog/Desktop/工作文件/自己的一些事情/Blog"
hugo server -D
```

打开：`http://localhost:1313`

---

## 7. 发布

```bash
cd "/Users/bluedog/Desktop/工作文件/自己的一些事情/Blog"
git add .
git commit -m "update blog"
git push
```

push 后会自动构建并发布到 GitHub Pages。

---

## 8. About Me 修改

- 结构化内容：`data/about.yaml`
- 页面开关与描述：`content/about/index.md`
- 社交链接：`hugo.toml` 里的 `[[params.socialIcons]]`

---

## 9. 域名检查

- `hugo.toml` 的 `baseURL` 为 `https://bluedog.website/`
- `static/CNAME` 内容为 `bluedog.website`
- GitHub Pages `Custom domain` 为 `bluedog.website`
- 勾选 `Enforce HTTPS`

---

## 10. 统计与可用性监控

- 统计开关：`hugo.toml` -> `params.analytics`
  - `enabled = true/false`
  - `provider = "plausible"` 或 `"umami"`
- 404 页面已支持统计事件上报
- 定时可用性检测工作流：`.github/workflows/uptime-check.yml`
