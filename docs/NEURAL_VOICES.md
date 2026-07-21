# 神经语音包（试验）

系统 TTS 只提供一个声音的手机（国产安卓 ROM 常见），可以通过导入「神经语音包」获得
真人感的男声/女声。语音包 = 开源 TTS 引擎 + 音色模型打包成的 .zip；导入后合成在
Web Worker 里**本机完成，不联网**，与应用「语音固定本机」的原则一致。

## 用户侧使用

1. 获取语音包 .zip（官方整理的包发布后会在这里给出下载与校验信息；也可经网盘等
   任意渠道传到手机——对中国大陆用户友好，不依赖境外直连）。
2. 打开应用 →「朗读控制」→「神经语音包（试验）」→「导入语音包（.zip）」。
3. 导入成功后，「语音选择」里会出现标注「· 神经语音」的音色，选中即自动试听。
4. 删除：语音包列表里点「删除」。

安全提示：语音包会在本机 Web Worker 中执行其中的引擎代码，请只导入可信来源的包。

## 语音包格式（format 1）

zip 根目录必须包含清单 `istone-voice-pack.json`：

```json
{
  "format": "istone-voice-pack",
  "version": 1,
  "id": "kokoro-zh",
  "label": "Kokoro 中文",
  "engine": "worker-js",
  "entry": "engine.js",
  "voices": [
    { "id": "yunjian", "name": "云健 · 男声", "lang": "zh-CN" },
    { "id": "xiaobei", "name": "晓北 · 女声", "lang": "zh-CN" }
  ]
}
```

- `engine: "worker-js"`：`entry` 指向的 JS 会作为 Web Worker 启动；
- zip 里其余文件（onnx 模型、词表等）在初始化时以 blob URL 交给引擎；
- 应用把每句话交给引擎合成，拿到 PCM 后编码 WAV 播放，走与锁屏控制条兼容的
  `<audio>` 通路；语速通过 `playbackRate` 应用，改语速不需要重新合成。

## Worker 协议

引擎（`entry` 脚本）在 Worker 作用域运行，与应用通过 postMessage 通信：

| 方向 | 消息 |
|---|---|
| 应用 → 引擎 | `{ type: "init", manifest, files: { 文件名: blobURL } }` |
| 引擎 → 应用 | `{ type: "ready" }` 或 `{ type: "error", message }` |
| 应用 → 引擎 | `{ type: "synthesize", id, text, voiceId, speed }` |
| 引擎 → 应用 | `{ type: "audio", id, sampleRate, samples: Float32Array }`（建议 transfer）或 `{ type: "error", id, message }` |

超时：初始化 25s，单句合成 30s。

## 最小引擎示例（测试用）

```js
// engine.js —— 生成 440Hz 正弦音的演示引擎（e2e 测试即用它验证全链路）
onmessage = (event) => {
  const message = event.data || {};
  if (message.type === "init") {
    postMessage({ type: "ready" });
    return;
  }
  if (message.type === "synthesize") {
    const sampleRate = 16000;
    const length = Math.floor(sampleRate * 0.15);
    const samples = new Float32Array(length);
    for (let i = 0; i < length; i += 1) {
      samples[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.2;
    }
    postMessage({ type: "audio", id: message.id, sampleRate, samples }, [samples.buffer]);
  }
};
```

## 官方语音包：如何构建与发布

仓库已内置完整的构建流水线（GitHub Actions：**Build voice pack**）：

1. GitHub 仓库页 → Actions → 「Build voice pack」→ Run workflow：
   - `source_space`：上游 sherpa-onnx WASM 中文 TTS 构建（Hugging Face 空间 ID）；
   - `max_sid`：多说话人模型扫描上限；流水线会自动合成各说话人样本、按基频
     （F0）挑出 2 个男声 + 2 个女声；
   - `release_tag`：填了就自动发布为 GitHub Release（zip + sha256）。
2. 流水线步骤：下载运行时 → 扫描说话人 → 组装 format 1 zip → **无头浏览器
   全链路验证**（引擎直测断言时长/响度 + 应用真实导入试听）→ 上传产物/发布。
3. 用户拿到 zip 后（Release 下载或经网盘转存到手机），在应用
   「朗读控制 → 神经语音包 → 导入语音包」导入即可。

本地开发用同一套脚本：

```bash
# 组装（--source 为本地目录或 HF 空间 ID）
node scripts/build-voice-pack.mjs --source <dir|space> --out dist/pack.zip \
  --id sherpa-zh-multi --label "中文多音色语音包" --voices dist/voices.json
# 扫描说话人（挑男/女声，需 playwright + Chromium）
node scripts/voice-pack-lab.cjs scan --runtime <dir> --max-sid 40
# 全链路验证
node scripts/voice-pack-lab.cjs verify --pack dist/pack.zip
```

分发说明：模型体积超出 Vercel 静态托管限制，官方包走 GitHub Releases / 网盘
分发；应用内以「本地导入」为主通道（中国大陆无需境外直连）。

## 当前状态与后续计划（2026-07）

**框架已上线（v42），语音包作为独立内容后续补充——新增声音无需更新应用。**

- 应用侧的语音包框架、导入/管理 UI、本机合成播放链路均已完成并测试通过，
  可用于任何符合 format 1 的语音包。
- 官方包尚未产出：`Build voice pack` 流水线的自动发现目前只能找到两个文件
  齐全的 sherpa-onnx wasm 空间，均不可用——`jacob-8/web-assembly-tts-sherpa-onnx-en_zh`
  对全部说话人输出静音（NaN），`k2-fsa/web-assembly-zh-en-tts-zipvoice`
  是音色克隆式模型（需参考音频，非多说话人）。即公开的现成 wasm 空间里暂时
  没有干净的中文多说话人模型。
- 因此当前策略：**先上线现有能力**（系统本机语音 + 4 档离线声音风格），
  神经语音包作为「进阶 · 可选」入口保留；待拿到可靠模型后，改为从
  sherpa-onnx 官方 GitHub Release 下载**指定的**已知可用模型（如
  vits-zh-aishell3）自建打包，产出官方包并发布 Release，用户导入即用。
- 由于语音包与应用解耦，后续新增/替换语音包都不需要发版更新应用。
