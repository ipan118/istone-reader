# GitHub Upload Guide

如果这台电脑暂时没有 `git` 命令，最简单的方式是直接用 GitHub 网页上传。

## 推荐上传内容

请上传当前项目里的这些文件和文件夹：

- `assets/`
- `sample-books/`
- `vendor/`
- `app.js`
- `index.html`
- `styles.css`
- `manifest.webmanifest`
- `sw.js`
- `serve.py`
- `README.md`
- `PWA_RELEASE_GUIDE.md`
- `GITHUB_UPLOAD_GUIDE.md`
- `.gitignore`
- `smoke-test.cjs`
- `test.html`
- `vercel.json`
- `netlify.toml`

## 不建议上传

这些是本地测试截图或临时产物：

- `demo-test-preview.png`
- `diff-comment-check.png`
- `pwa-desktop-check.png`
- `pwa-desktop-final.png`
- `pwa-mobile-check.png`
- `pwa-mobile-final.png`
- `smoke-test-mobile.png`
- `__pycache__/`

## GitHub 网页上传步骤

1. 登录 GitHub。
2. 点击右上角 `+`，选择 `New repository`。
3. 仓库名可填：`vivid-reader-pwa` 或 `istone-reader`。
4. 选择 `Public` 或 `Private`。
5. 点击 `Create repository`。
6. 进入新仓库后，点击 `uploading an existing file`。
7. 把整理好的上传包里的文件和文件夹直接拖进去。
8. 页面下方填写提交说明，例如：`Initial upload of iStone Reader PWA`。
9. 点击 `Commit changes`。

## 上传后建议

上传完成后，优先检查：

- `index.html` 是否在仓库根目录
- `assets/` 和 `vendor/` 是否完整
- `manifest.webmanifest` 和 `sw.js` 是否存在

如果后续你在别的环境安装了 Git，再改用 `git clone / git add / git commit / git push` 会更方便。
