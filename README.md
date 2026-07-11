# iStone Reader

轻量 PWA 听读工具，支持导入 `PDF / EPUB / TXT / MD`，自动生成章节导航，并调用当前设备可用语音进行朗读。所有解析和识别都在本地完成，不依赖外部服务。

## 功能

- 导入 `PDF / EPUB / TXT / MD`（支持多选批量导入）
- 本机书架：导入过的书自动保存（IndexedDB），下次打开自动恢复上次听读位置；支持一键备份/恢复（换机迁移）
- 扫描版 PDF OCR 识别（引擎与中英文模型已内置，离线可用）
- 大书 / 扫描书边解析边听：前几页就绪即可开始收听，剩余章节后台解析并自动追加；读到最新进度会在新章节就绪后自动续读
- 扫描识别结果按页缓存：导入中断后重新导入同一文件，已识别页直接复用，不再重跑 OCR
- 自动章节拆分和下拉章节导航
- 语音朗读、语速调节（按书记忆）、暂停与继续、上一句/下一句、底部迷你播放条
- 定时关闭（睡眠定时器，最后一分钟渐弱收尾）
- 锁屏/后台辅助：朗读时保持屏幕常亮（Wake Lock），回到前台自动续读，支持系统媒体控制（Media Session）
- 中文和英文语音自动匹配
- 正文字号调节
- 浅色/暗色界面，默认跟随系统主题
- 支持添加到电脑桌面和手机主屏幕，支持系统分享导入

## 本地运行

任意静态服务器均可，例如：

```bash
python3 -m http.server 4173 --bind 127.0.0.1
```

带 Windows 本机语音桥（可选，提供更稳定的本机声线）：

```bash
python serve.py --bind 127.0.0.1 --port 4173
```

打开：

```text
http://127.0.0.1:4173/
```

## PWA 发布

详细发布、浏览器访问和添加到桌面步骤见 `PWA_RELEASE_GUIDE.md`。

## 本地验证

文本管线（分章、分句、OCR 修复、引用剥离等）的回归测试无需浏览器：

```bash
node --test tests/text-pipeline.test.mjs
```

端到端回归（Playwright，覆盖冒烟、迷你播放条、媒体锚定、桌面模式布局、存储迁移、调速续播、导入进度、渐进导入 + OCR 缓存、子路径 SW 预缓存）：

```bash
npm install playwright
npx playwright install chromium
bash tests/e2e/run-all.sh
```

脚本自行启动/清理本地静态服务器；已有 Chromium 时可用 `CHROMIUM_PATH` 指定二进制而免下载。单独运行某一项：先起 `python3 -m http.server 4173 --bind 127.0.0.1`，再 `node tests/e2e/<脚本>.cjs`（可用 `TARGET_URL` 改地址）。`tests/e2e/fixtures/` 里的 PDF 夹具已入库，需重新生成时 `npm install pdf-lib` 后运行 `node tests/e2e/gen-pdfs.cjs`。

## 国内访问说明

`*.vercel.app` 域名在中国大陆经常无法直连。此时应用会以本机缓存版本运行（状态栏提示"无法连接更新服务器 · 正在使用本机缓存版本"），功能可正常使用但收不到更新。根治方式是给 Vercel 项目**绑定自定义域名**（Vercel → 项目 → Settings → Domains，任意注册商的域名即可）：自定义域名通常可从大陆直连；绑定后用新域名访问并重新"添加到主屏幕"。

## 目录说明

- `app.js` 应用主逻辑（解析调度、朗读、OCR、UI）
- `text-pipeline.mjs` 文本管线（分章、分句、段落重排、OCR 文本修复、引用剥离、章节规整；纯函数，浏览器与 Node 通用）
- `tests/` 文本管线回归测试（`node --test`）
- `library.js` 本机书架与进度持久化（IndexedDB）
- `privacy.html` 隐私政策页（零收集声明，商店上架必备）
- `docs/` Google Play TWA 上架指南与商店文案
- `.well-known/assetlinks.json` TWA 数字资产链接（上架时回填签名指纹）
- `sw.js` Service Worker（离线缓存与分享导入）
- `vendor/` 本地依赖：pdf.js、epub.js、jszip、Tesseract（含 `tessdata/` 中英文识别模型）
