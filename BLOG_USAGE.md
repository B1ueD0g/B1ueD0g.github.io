# Blog 使用手册（仅在 Blog 文件夹操作）

本手册约定：**所有命令都在这个目录执行**

`/Users/bluedog/Desktop/工作文件/自己的一些事情/Blog`

---

## 1. 进入项目目录

```bash
cd "/Users/bluedog/Desktop/工作文件/自己的一些事情/Blog"
```

后续所有操作都从这里开始，不要在别的目录执行。

---

## 2. 固定目录规则

- 文章 Markdown：`content/posts/`
- About 页面：`content/about/index.md`
- 成果物页面：`content/projects/`

说明：图片不走本地目录，使用 PicGo 上传后直接外链引用。

---

## 3. 新增文章（上传博客）

1. 在 `content/posts/` 新建一个 `.md` 文件（例如 `my-new-post.md`）
2. 写入 Front Matter（头部信息）：

```md
---
title: "文章标题"
date: 2026-02-18T22:00:00+08:00
draft: false
summary: "一句话摘要"
tags: ["tag1", "tag2"]
---
```

3. 插入 PicGo 外链图片示例：

```md
![示例图片](https://your-cdn.example.com/2026/demo.png)
```

---

## 4. 图片工作流（PicGo）

1. 截图或选择图片
2. 在 PicGo 上传到你的 GitHub 图床
3. 复制外链
4. 粘贴到文章 Markdown

---

## 5. 修改博客

最常见修改位置：

- 修改文章：`content/posts/你的文章.md`
- 修改 About：`content/about/index.md`
- 修改成果物：`content/projects/*.md`
- 修改站点配置：`hugo.toml`
- 修改样式：`assets/css/extended/custom.css`

---

## 6. 删除博客

1. 删除文章文件（例如）：
   - `content/posts/old-post.md`
2. 提交并 push 后，线上会自动同步删除。

---

## 7. 本地预览

```bash
cd "/Users/bluedog/Desktop/工作文件/自己的一些事情/Blog"
hugo server -D
```

浏览器打开：`http://localhost:1313`

---

## 8. 发布到 GitHub Pages

每次改完后执行：

```bash
cd "/Users/bluedog/Desktop/工作文件/自己的一些事情/Blog"
git add .
git commit -m "update blog content"
git push
```

push 后会触发：

- GitHub Actions 自动构建 Hugo
- 自动执行 Pagefind 建索引
- 自动发布到 GitHub Pages

---

## 9. 首次上线检查（只需确认一次）

1. GitHub 仓库 `Settings -> Pages` 选择 `GitHub Actions`
2. `Custom domain` 填 `bluedog.website`
3. DNS 生效后勾选 `Enforce HTTPS`

---

## 10. 常见问题

1. 页面没更新  
检查 Actions 是否成功，失败就看日志。

2. 图片不显示  
确认 Markdown 里是完整外链，且图片仓库/图床仍可公开访问。

3. 文章不显示  
确认 Front Matter 里 `draft: false`。
