# BlueDog Blog

Hugo + PaperMod + Pagefind + GitHub Pages。

## 内容结构

- About 页面：`content/about/index.md`（来自 `docs-1111/AboutMe.md`）
- 已发文章归档：`content/posts/archive/`（来自 `docs-1111/已发文章归档/`）
- 待发文章归档：`content/posts/pending/`（来自 `docs-1111/待发文章归档/`，默认 `draft: true`）
- 原始素材目录：`docs-1111/`

## 图片策略

图片使用 PicGo 上传后，直接在 Markdown 中贴外链：

```md
![示例图片](https://your-cdn.example.com/2026/demo.png)
```

## 自动部署

push 到 `main` 后，GitHub Actions 自动执行：

1. `hugo --gc --minify`
2. `npx -y pagefind --site public`
3. 发布到 GitHub Pages

## 域名

- `baseURL`: `https://bluedog.website/`
- `static/CNAME`: `bluedog.website`
- GitHub Pages 的 `Custom domain` 也应为 `bluedog.website`
