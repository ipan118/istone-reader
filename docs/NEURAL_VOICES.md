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

## 官方语音包路线（下一阶段）

- 首选 sherpa-onnx WASM + Kokoro v1.1-zh（内含多名男声/女声，一次下载全都有），
  以及 AISHELL-3 多说话人 VITS 作为备选；
- 由本仓库出一个 `pack-build` 脚本，把上游发布的 wasm 运行时 + 模型 + 适配层
  engine.js 打成符合 format 1 的 zip，并附 SHA-256 校验；
- 模型体积超出 Vercel 静态托管限制，官方包走 GitHub Releases / 网盘分发，
  应用内保持「本地导入」为主通道（中国大陆可用）。
