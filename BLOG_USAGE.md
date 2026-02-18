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
- 图片与附件：`static/uploads/`
  - 图片建议放：`static/uploads/images/`
  - 文件建议放：`static/uploads/files/`

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

3. 正文中引用图片/附件示例：

```md
![示例图片](/uploads/images/demo.png)
[下载附件](/uploads/files/demo.pdf)
```

---

## 4. 上传图片/附件

直接把文件复制到：

- 图片：`static/uploads/images/`
- 附件：`static/uploads/files/`

然后在 Markdown 中用 `/uploads/...` 路径引用。

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
2. 如果该文章对应图片不再需要，也可删除：
   - `static/uploads/images/old-image.png`
3. 提交并 push 后，线上会自动同步删除。

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
git push origin main
```

push 后会触发：

- GitHub Actions 自动构建 Hugo
- 自动执行 Pagefind 建索引
- 自动发布到 GitHub Pages

---

## 9. 首次上线检查（只需确认一次）

1. GitHub 仓库 `Settings -> Pages` 选择 `GitHub Actions`
2. `Custom domain` 填 `BlueDog.fun`
3. DNS 生效后勾选 `Enforce HTTPS`

---

## 10. 常见问题

1. 页面没更新  
检查 Actions 是否成功，失败就看日志。

2. 图片 404  
确认文件在 `static/uploads/...`，并且文章里路径是 `/uploads/...`。

3. 文章不显示  
确认 Front Matter 里 `draft: false`。

