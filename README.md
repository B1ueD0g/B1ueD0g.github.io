# BlueDog Blog

Hugo + PaperMod + Pagefind + GitHub Pages。

## 固定内容目录（你后续只用这两个）

- 文章 Markdown：`content/posts/`
- 图片与附件：`static/uploads/`

推荐细分：

- 图片：`static/uploads/images/`
- 文件：`static/uploads/files/`

在文章中的引用写法：

```md
![配图](/uploads/images/example.png)
[附件下载](/uploads/files/example.pdf)
```

## About 与成果物

- About 页面：`content/about/index.md`
- 成果物页：`content/projects/`

## 部署流程

1. push 到 `main`
2. GitHub Actions 自动执行：
   - `hugo --gc --minify`
   - `npx -y pagefind --site public`
3. 自动发布到 GitHub Pages

## 域名 bluedog.website 配置

仓库已加入 `static/CNAME`，内容为 `bluedog.website`。  
你需要在域名 DNS 侧添加以下记录（根域方案）：

- `A` 记录到 `185.199.108.153`
- `A` 记录到 `185.199.109.153`
- `A` 记录到 `185.199.110.153`
- `A` 记录到 `185.199.111.153`

可选再加 `AAAA` 记录：

- `2606:50c0:8000::153`
- `2606:50c0:8001::153`
- `2606:50c0:8002::153`
- `2606:50c0:8003::153`

GitHub 仓库侧：

- `Settings -> Pages -> Source` 选 `GitHub Actions`
- 填写 `Custom domain: bluedog.website`
- DNS 生效后勾选 `Enforce HTTPS`
