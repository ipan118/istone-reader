# iStone Reader PWA 发布与安装指南

本项目当前最适合先发布为 PWA。发布后，用户可以直接用浏览器访问，也可以把它添加到电脑桌面或手机主屏幕。

## 1. 当前发布形态

- 代码形态：静态前端 PWA。
- 推荐平台：Vercel、Netlify、Cloudflare Pages、GitHub Pages。
- 必要条件：HTTPS 域名、`manifest.webmanifest`、`sw.js`、可访问的图标文件。
- 已补齐内容：PWA manifest、service worker、iOS 桌面图标、安卓常用 192/512 图标、Vercel/Netlify 基础配置。

注意：本地 `serve.py` 提供的是 Windows 本机英文语音桥接，适合本机测试。部署到公网后，网页会使用访问设备自己的浏览器/系统语音；如果要保证所有设备都有统一高质量声音，需要后续接云端 TTS 或原生端语音能力。

## 2. 本地预览

在项目目录启动：

```powershell
cd D:\Codex\coding\projects\vivid-reader-pwa
python serve.py --bind 127.0.0.1 --port 4173
```

电脑浏览器访问：

```text
http://127.0.0.1:4173/
```

如果只是测试静态 PWA，不需要 Windows 本机英文语音桥，也可以用：

```powershell
python -m http.server 4173 --bind 127.0.0.1
```

## 3. 局域网手机访问

电脑和手机连接同一个 Wi-Fi 后，在电脑 PowerShell 查看本机局域网地址：

```powershell
ipconfig
```

找到类似 `IPv4 地址 . . . . . . . . . . . . : 192.168.1.23` 的地址，然后用：

```powershell
python serve.py --bind 0.0.0.0 --port 4173
```

手机浏览器访问：

```text
http://电脑IPv4地址:4173/
```

示例：

```text
http://192.168.1.23:4173/
```

手机如果打不开，优先检查三件事：

- 手机和电脑是否在同一个 Wi-Fi。
- Windows 防火墙是否允许 Python 访问局域网。
- 启动命令是否用了 `--bind 0.0.0.0`。

## 3.1 手机导入书籍

当前支持两种网页端导入入口：

- 页面内“导入书籍”：适合浏览器能直接访问手机文件、下载目录或云盘同步目录的情况。
- 系统分享导入：安卓安装为 PWA 后，可在文件管理器、下载目录或部分云盘 App 中点“分享/打开方式”，选择 iStone Reader 导入 PDF、EPUB、TXT、MD。

需要注意：

- iOS Safari 对 PWA 接收分享文件的支持更受限制，通常仍以页面内文件选择为主。
- 微信聊天文件不能被普通网页直接读取；如果要从微信聊天记录里直接选文件，建议后续单独做微信小程序版本。
- 云盘导入可走两条路：先把文件下载到手机再导入，或后续接入网盘 OAuth/API 做“从云盘选择”。

## 4. 发布到 Vercel

推荐做法：

1. 把 `D:\Codex\coding\projects\vivid-reader-pwa` 推到 GitHub 仓库。
2. 登录 Vercel。
3. New Project，选择该仓库。
4. Framework Preset 选择 `Other`。
5. Build Command 留空。
6. Output Directory 留空或填 `.`。
7. Deploy。

发布成功后，Vercel 会给一个 HTTPS 地址，例如：

```text
https://your-project.vercel.app/
```

这个地址就是 PWA 公网入口。

## 5. 发布到 Netlify

方式一：拖拽发布。

1. 登录 Netlify。
2. 进入 Add new site。
3. 选择 Deploy manually。
4. 把项目文件夹拖进去。
5. 等待生成 HTTPS 地址。

方式二：Git 发布。

1. 把项目推到 GitHub。
2. Netlify 选择 Import from Git。
3. Publish directory 填 `.`。
4. Build command 留空。
5. Deploy。

## 6. 电脑端添加到桌面

### Chrome

1. 打开发布后的 HTTPS 地址。
2. 地址栏右侧如果出现安装图标，点击安装。
3. 如果没有安装图标，点右上角菜单。
4. 选择 Cast, save, and share 或 More tools。
5. 选择 Install page as app / Create shortcut。
6. 勾选 Open as window 后确认。

### Microsoft Edge

1. 打开发布后的 HTTPS 地址。
2. 点击右上角 `...`。
3. 选择 Apps。
4. 选择 Install this site as an app。
5. 确认安装。

安装后，Windows 开始菜单里会出现 `iStone Reader`，也可以固定到任务栏。

## 7. Android 添加到桌面

### Chrome Android

1. 用 Chrome 打开发布后的 HTTPS 地址。
2. 点击右上角 `...`。
3. 选择 Add to Home screen 或 Install app。
4. 确认名称为 `iStone Reader`。
5. 回到手机桌面打开图标。

如果看到的是 `Add to Home screen` 而不是 `Install app`，通常说明浏览器认为它更像网页快捷方式；仍然可以使用，但独立窗口体验可能弱一些。

## 8. iPhone / iPad 添加到主屏幕

1. 用 Safari 打开发布后的 HTTPS 地址。
2. 点击底部分享按钮。
3. 选择 Add to Home Screen。
4. 确认名称为 `iStone Reader`。
5. 点击 Add。

添加后，桌面会出现 `iStone Reader` 图标。iOS 上是否显示完整独立窗口，取决于 Safari 当前对 PWA 的支持和系统版本。

## 9. 发布前检查清单

- 首页能正常打开。
- `manifest.webmanifest` 能通过 HTTPS 访问。
- `sw.js` 能通过 HTTPS 访问。
- 图标路径 `assets/icon-180.png`、`assets/icon-192.png`、`assets/icon-512.png` 能访问。
- Chrome DevTools 的 Application 面板里能看到 Manifest 和 Service Worker。
- PDF/TXT/EPUB 导入至少各测一个样本。
- 电脑和手机各测一次语音列表，因为语音来自不同设备。
- 隐私说明需要写清：文件主要在浏览器本地处理；如果后续接云端 OCR/TTS，需要明确提示上传范围。

## 10. 当前阶段的限制

- 公网静态 PWA 不会继承你电脑上的 `Microsoft Zira Desktop`。它会使用访问者设备自己的语音。
- iPhone Safari 的语音、文件访问、后台播放能力与桌面 Chrome 不完全一致，需要实机测试。
- 微信内置浏览器不等于微信小程序，PWA 可以打开，但不能替代正式小程序发布。
- 大型扫描 PDF 的 OCR 速度取决于设备性能和网络加载识别模型的速度。
