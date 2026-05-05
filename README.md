# iStone Reader

轻量 PWA 听读工具，支持导入 `PDF / EPUB / TXT / MD`，自动生成章节导航，并调用当前设备可用语音进行朗读。

## 功能

- 导入 `PDF / EPUB / TXT / MD`
- 扫描版 PDF OCR 识别
- 自动章节拆分和下拉章节导航
- 语音朗读、语速调节、暂停与继续
- 中文和英文语音自动匹配
- 浅色/暗色两套 PWA 界面
- 支持添加到电脑桌面和手机主屏幕

## 本地运行

带 Windows 本机英文语音桥：

```powershell
cd D:\Codex\coding\projects\vivid-reader-pwa
python serve.py --bind 127.0.0.1 --port 4173
```

普通静态预览：

```powershell
cd D:\Codex\coding\projects\vivid-reader-pwa
python -m http.server 4173 --bind 127.0.0.1
```

打开：

```text
http://127.0.0.1:4173/
```

## PWA 发布

详细发布、浏览器访问和添加到桌面步骤见：

```text
PWA_RELEASE_GUIDE.md
```

## 本地验证

```powershell
$env:NODE_PATH='C:\Users\68284\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
& 'C:\Users\68284\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' .\smoke-test.cjs
```
