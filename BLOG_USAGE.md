# Blog 使用手册（仅在 Blog 文件夹操作）

工作目录：

`/Users/bluedog/Desktop/工作文件/自己的一些事情/Blog`

---

## 1. 目录约定

- 个人主页：`content/about/index.md`
- 已发布归档：`content/posts/archive/`
- 待发布归档：`content/posts/pending/`（默认 `draft: true`）
- 原始资料：`docs-1111/`
- 样式文件：`assets/css/extended/custom.css`

---

## 2. 新增文章

把新文章放在 `content/posts/archive/你的分类/`，示例：

```md
---
title: "文章标题"
date: 2026-02-19T12:00:00+08:00
draft: false
categories:
  - "技术好文"
tags:
  - "零信任"
---

正文...
```

待发文章放在 `content/posts/pending/` 并保持 `draft: true`。

---

## 3. 图片写法（PicGo）

不使用本地上传目录，统一外链：

```md
![示例图片](https://your-cdn.example.com/2026/demo.png)
```

---

## 4. 修改与删除

- 修改文章：直接编辑对应 `.md`
- 删除文章：直接删除对应 `.md`
- 修改个人主页：编辑 `content/about/index.md`
- 修改样式：编辑 `assets/css/extended/custom.css`

---

## 5. 本地预览

```bash
cd "/Users/bluedog/Desktop/工作文件/自己的一些事情/Blog"
hugo server -D
```

打开：`http://localhost:1313`

---

## 6. 发布

```bash
cd "/Users/bluedog/Desktop/工作文件/自己的一些事情/Blog"
git add .
git commit -m "update blog"
git push
```

push 后会自动构建并发布到 GitHub Pages。

---

## 7. 域名检查

- `hugo.toml` 的 `baseURL` 为 `https://bluedog.website/`
- `static/CNAME` 内容为 `bluedog.website`
- GitHub Pages `Custom domain` 为 `bluedog.website`
- 勾选 `Enforce HTTPS`
