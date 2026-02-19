# BlueDog Blog 使用说明

本仓库是你的博客源码，技术栈：

- `Hugo + PaperMod`
- `Pagefind` 全文搜索
- `GitHub Actions` 自动发布到 `GitHub Pages`
- 自定义域名：`https://bluedog.website/`

## 1. 你最常改的文件

- 站点配置：`hugo.toml`
- 首页/风格：`assets/css/extended/custom.css`
- About Me 页面：`content/about/index.md`
- 已发布文章：`content/posts/archive/`
- 待发布草稿：`content/posts/pending/`

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

1. 直接复制一篇已有文章改名改内容。
2. 手动新建一个 `.md` 文件到指定目录。

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
categories:
  - "技术好文"
tags:
  - "零信任"
---

正文...
```

提示：

- 如果你还不想发布，把 `draft` 设为 `true`，或先放在 `pending` 目录。
- 图片继续用 PicGo 外链，不需要本地图片目录。

## 4. 发布新文章

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

## 5. 修改已有文章

1. 打开对应 `.md` 文件直接改内容。
2. 需要的话更新 `date`（可选）。
3. `git add . && git commit -m "update: 文章标题" && git push`

## 6. 删除文章

1. 删除对应的 `.md` 文件。
2. 提交推送：

```bash
cd "/Users/bluedog/Desktop/工作文件/自己的一些事情/Blog"
git add .
git commit -m "remove: 文章标题"
git push
```

## 7. 如何修改 About Me

你只需要改这个文件：

- `content/about/index.md`

可改内容：

- 个人介绍正文
- 列表、链接、成果物等

社交链接位置：

- `hugo.toml` 下的 `[[params.socialIcons]]`

当前邮箱图标行为：

- 点击邮箱图标不会跳转 `mailto`
- 会自动复制邮箱地址并弹出“已复制”提示

## 8. 发布流程（自动）

每次 `git push` 到 `main` 分支后，GitHub Actions 会自动执行：

1. `hugo --gc --minify`
2. `npx -y pagefind --site public`
3. 发布到 GitHub Pages

工作流文件：

- `.github/workflows/hugo.yml`

## 9. 域名检查（出问题时看这里）

- `hugo.toml` 的 `baseURL`：`https://bluedog.website/`
- `CNAME` 文件内容：`bluedog.website`
- GitHub Pages 设置里的 `Custom domain`：`bluedog.website`

如果网页没立刻更新：

1. 先看 GitHub Actions 是否完成。
2. 浏览器强刷：`Cmd + Shift + R`。
