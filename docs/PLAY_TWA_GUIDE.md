# Google Play 上架指南（TWA 打包）

iStone Reader 以 Trusted Web Activity（TWA）形式上架 Google Play：Play 里安装的应用直接运行线上
PWA（无地址栏的全屏 Chrome），代码零改动，版本随网页部署自动更新。

## 前置条件（已就绪）

- HTTPS 正式域名（当前 istone-reader.vercel.app，建议后续换自有域名后同步改本指南）
- `manifest.webmanifest`：standalone、512px maskable 图标 ✔
- Service Worker 离线可用 ✔
- 隐私政策页 `privacy.html` ✔（Play 商店必填 URL）

## 步骤

1. **注册 Play 开发者账号**：一次性 $25，play.google.com/console。
2. **生成 TWA 工程**（本机需 Node + JDK17 + Android SDK）：
   ```bash
   npm i -g @bubblewrap/cli
   bubblewrap init --manifest https://istone-reader.vercel.app/manifest.webmanifest
   # 包名建议：app.istonereader.twa（与 .well-known/assetlinks.json 保持一致）
   bubblewrap build   # 生成 app-release-bundle.aab 和签名 keystore（务必备份 keystore）
   ```
3. **Play Console 创建应用并上传 AAB**，启用 Play App Signing。
4. **回填数字资产链接**：Play Console → 设置 → 应用完整性，复制 “App signing key certificate” 的
   SHA-256 指纹，替换仓库 `.well-known/assetlinks.json` 里的占位符并部署。
   验证通过后 TWA 才会以无浏览器界面运行（否则显示地址栏）。
5. **商店资料**：文案见 `docs/STORE_LISTING.md`；截图用真机浏览器打开应用截取（导入界面、
   朗读高亮、锁屏控制条各一张以上）。
6. **数据安全表单**：全部选择“不收集、不共享任何数据”（与隐私政策一致）；无广告；
   无第三方 SDK。

## 版本节奏

- 网页功能更新无需重发 AAB（TWA 加载线上版本）。
- 仅当 manifest 关键字段（名称/图标/起始 URL）或打包配置变化时 `bubblewrap update && bubblewrap build`
  重新上传。

## 后续（付费解锁时再做）

- Play Billing：TWA 内用 Digital Goods API + Payment Request 实现一次性内购（Pro 解锁）。
- 上线前把 `docs/STORE_LISTING.md` 中的 Pro 描述与实际门控功能对齐。
