import * as pdfjsLib from "./vendor/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdf.worker.min.mjs", import.meta.url).toString();

const SETTINGS_KEY = "vivid-reader-settings-v2";
const OCR_REMOTE = {
  workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js",
  corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@5",
};

const TONE_PRESETS = {
  neon: {
    label: "霓虹夜航",
    accentPrimary: "#ff4fa6",
    accentSecondary: "#4fe0ff",
    accentTertiary: "#ffb058",
    accentQuaternary: "#8a7dff",
    accentAux: "#5dffcf",
    backgroundStops: ["#07111f", "#0c1830", "#12152a"],
  },
  sunset: {
    label: "落日汽水",
    accentPrimary: "#ff6a5e",
    accentSecondary: "#4fe0ff",
    accentTertiary: "#ffd166",
    accentQuaternary: "#ff8fb7",
    accentAux: "#ffe6a8",
    backgroundStops: ["#160c18", "#24143a", "#0f2032"],
  },
  mint: {
    label: "薄荷冰川",
    accentPrimary: "#4cffc2",
    accentSecondary: "#5fd2ff",
    accentTertiary: "#ffe37a",
    accentQuaternary: "#4fa3ff",
    accentAux: "#d9fff2",
    backgroundStops: ["#07151a", "#0f2433", "#0c1b28"],
  },
  tech: {
    label: "量子蓝域",
    accentPrimary: "#28c7ff",
    accentSecondary: "#7cf7ff",
    accentTertiary: "#6f98ff",
    accentQuaternary: "#2455ff",
    accentAux: "#d9f4ff",
    backgroundStops: ["#04111b", "#08233d", "#09162e"],
  },
  dark: {
    label: "暗色",
    accentPrimary: "#0a84ff",
    accentSecondary: "#82c7ff",
    accentTertiary: "#3b82f6",
    accentQuaternary: "#1d4ed8",
    accentAux: "#d8ecff",
    backgroundStops: ["#0b1120", "#111827", "#0f172a"],
  },
  light: {
    label: "浅色",
    accentPrimary: "#0a6dd8",
    accentSecondary: "#5ea2ff",
    accentTertiary: "#8bbcff",
    accentQuaternary: "#2563eb",
    accentAux: "#d7e8ff",
    backgroundStops: ["#f6f8fc", "#eaf0f8", "#dde6f3"],
  },
};

const demoBookText = `# 序章 星光图书馆
凌晨两点，城市还亮着零星的窗。澄蓝色的自动门在雨里滑开，一家名为星光图书馆的夜读空间开始迎接第一批晚归的人。

馆员把灯光调成暖白色，书架边缘像被晨雾描了一层银线。每一本书都带着自己的节奏，有的安静，有的像要从纸页里跳出来。

# 第一章 把书变成会说话的朋友
林夏把一本厚厚的研究资料放到桌上，她想在通勤时继续读，但不想被密密麻麻的页面拖慢。

于是，她希望有一个阅读器，能把章节自动分出来，像地图一样给出入口，也能在需要休息眼睛的时候，用舒服的声音继续陪她往下走。

当她拖入文件后，系统先识别标题，再拆成清晰的章节卡片，最后把每个段落铺成适合手机阅读的长卷。

# 第二章 导航像在城市里换乘
好用的进度条不只是告诉你现在在哪里，更像地铁线路图，让你能快速从一段跳到另一段。

林夏想从方法学部分直接跳到讨论，她轻轻拖动章节滑条，界面就像换乘站一样把她送到正确的位置。

如果她记得一句话的大概位置，也可以通过朗读定位滑条，从语音播放的中途接着听。

# 第三章 声音决定陪伴感
有的人喜欢清亮的女声，有的人偏爱稳重的男声，也有人会按照语言或口音来选择。

因此，阅读器不应该只有一个固定声音，而是要把设备里可用的声音都摆出来，让使用者自己选。

不同的语速和语调，会让一本书呈现出完全不同的情绪，像同一段旋律换了不同乐器。

# 第四章 年轻化不是花哨
真正年轻的界面，不只是堆颜色，而是让信息层级清楚、互动轻快、每一次点击都让人觉得有回应。

所以这套界面选择鲜明渐变、圆角卡片和柔和的动态背景，让功能很多时依然保持轻盈。

当书被导入、章节被切开、声音开始播放，整个过程像把沉重资料变成可随身携带的阅读旅程。`;

const CHAPTER_HEADING_RE =
  /^(#{1,6}\s*.+|(?:chapter|part)\s+\d+[^\n]*|第[一二三四五六七八九十百千万0-9]+[章节卷部篇回][^\n]*|(?:序章|序言|前言|引言|后记|尾声|番外)[^\n]*)$/gim;
const QUICK_POINT_COUNT = 5;
const OCR_MIN_MEANINGFUL_CHARS = 36;
const OCR_RENDER_MIN_SCALE = 1.8;
const OCR_RENDER_MAX_SCALE = 3.2;
const OCR_TARGET_LONG_EDGE = 2800;
const OCR_MAX_PIXELS = 9_000_000;
const OCR_WEAK_MIN_CHARS = 56;
const OCR_WEAK_CONFIDENCE = 42;
const OCR_SYMBOL_RATIO_LIMIT = 0.32;
const HEADING_LINE_RE = /^(?:#{1,6}\s*.+|(?:chapter|part)\s+\d+[^\n]*|第[一二三四五六七八九十百千万0-9]+[章节卷部篇回][^\n]*|(?:序章|序言|前言|引言|后记|尾声|番外)[^\n]*)$/i;
const REFERENCE_HEADING_RE = /^(?:参考文献|references|bibliography)$/i;
const REFERENCE_SECTION_RE = /(?:^|\n)\s*(?:参考文献|references|bibliography)\s*(?:\n|$)[\s\S]*$/i;
const PRIORITY_VOICE_BUCKETS = ["zh-cn", "en-us", "en-gb", "en-global", "zh-tw", "ja-jp", "ko-kr", "fr-fr", "de-de", "es-es", "it-it"];
const CORE_VOICE_LIMITS = new Map([
  ["zh-cn", 3],
  ["en-us", 3],
  ["en-gb", 3],
  ["en-global", 2],
  ["zh-tw", 2],
]);
const PREFERRED_ZH_CN_VOICE_NAMES = ["xiaoxiao", "yunxi", "huihui", "xiaoyi", "xiaomeng", "xiaohan", "yunjian", "yunyang"];
const SENTENCE_END_RE = /[。！？!?\.]["”’')\]]*$/;
const SPEECH_FILTER_RE = /[—–―]+|\.{3,}|…+|[()（）\[\]【】{}<>《》「」『』]/g;
const BRACKET_REFERENCE_RE = /(?:\[(?:\d{1,3}(?:\s*[-,–]\s*\d{1,3})*)\]|\((?:\d{1,3}(?:\s*[-,–]\s*\d{1,3})*)\)|（(?:\d{1,3}(?:\s*[-,–]\s*\d{1,3})*)）|【(?:\d{1,3}(?:\s*[-,–]\s*\d{1,3})*)】)/g;
const SIMPLE_PAREN_REFERENCE_RE = /[（(【\[]\s*[¹²³⁴⁵⁶⁷⁸⁹⁰\d]{1,3}(?:\s*[-,–—]\s*[¹²³⁴⁵⁶⁷⁸⁹⁰\d]{1,3})*\s*[）)】\]]/g;
const LEADING_REFERENCE_RE = /(^|\n)\s*(?:\d{1,2}|[\[(（【]\d{1,3}[\])）】])(?=(?:\s|["“‘'（(【\[\u4e00-\u9fa5A-Za-z]))/g;
const INLINE_CJK_REFERENCE_RE = /(?<=[\u4e00-\u9fa5])\d{1,2}(?=(?:[，。；：、）》」』】\])]|$))/g;
const INLINE_END_REFERENCE_RE = /(?<=[\u4e00-\u9fa5）】〉》」』])[¹²³⁴⁵⁶⁷⁸⁹⁰\d]{1,3}(?=(?:[，。；：、,.!?！？;:）】〉》」』"'”’\s]|$))/g;
const SUPERSCRIPT_REFERENCE_RE = /[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g;
const LONE_NUMBER_LINE_RE = /^\s*\d{1,3}\s*$/gm;
const INLINE_SYMBOL_RE = /[#*_~^`|]/g;
const MIN_PARAGRAPH_CHARS = 56;
const IDEAL_PARAGRAPH_CHARS = 148;
const MAX_PARAGRAPH_CHARS = 250;
const WRAPPED_BLOCK_AVERAGE_LINE = 52;
const WRAPPED_BLOCK_SHORT_LINE = 48;
const OCR_SHORT_FRAGMENT_CHARS = 34;
const NON_BREAKING_ABBR_RE =
  /\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|Mt|No|Nos|Fig|Figs|Eq|Eqs|Dept|Univ|Inc|Ltd|Co|Corp|vs|etc|MD|PhD)\.$/i;
const INITIALISM_END_RE = /(?:\b[A-Z]\.){1,5}$/;
const OCR_NOISE_LINE_RE =
  /^(?:[-_~*•·|｜\s]+|\d{1,4}|page\s*\d{1,4}|第\s*\d{1,4}\s*页|[A-Z]?\d{1,3}[A-Z]?|[A-Z]{1,2})$/i;
const SHORT_SECTION_MERGE_CHARS = 360;
const AGGRESSIVE_SECTION_MERGE_CHARS = 820;
const KEEP_SECTION_TARGET_CHARS = 2200;
const MIN_EPUB_TOC_SPLIT_CHARS = 780;
const SECTION_PREVIEW_CHARS = 30;
const BOILERPLATE_TITLE_RE = /^(?:版权(?:信息|页)?|版权所有|侵权必究|目录|contents?|catalog|出版信息|联系(?:方式|我们)?|about|封面|扉页)$/i;
const BOILERPLATE_LINE_RE = /(?:版权所有|侵权必究|出版社|出版|发行|电子版|客服(?:热线|电话|邮箱)?|热线|邮箱|网址|官网|官方|微信(?:公众号|号)?|微博|ISBN|CIP|service@|https?:\/\/|www\.|责任编辑|装帧|定价|印刷|联系电话|copyright)/i;
const TOC_LINE_RE = /(?:^\s*(?:第[一二三四五六七八九十百千万0-9]+[章节卷部篇回]|chapter|part|contents?)\b)|(?:\.{2,}\s*\d+\s*$)|(?:\s+\d+\s*$)/i;
const PAGE_ARTIFACT_RE = /^(?:page\s*)?\d{1,4}$/i;
const GENERIC_SECTION_TITLE_RE = /^(?:section|chapter|part|正文|内容|片段|分段|章节|第\s*\d+\s*[章节卷部篇回]?|pdf\s*分段)\b/i;
const SPEECH_UNIT_IDEAL_CHARS = 150;
const SPEECH_UNIT_MAX_CHARS = 280;
const EXTRA_VOICE_LIMIT = 8;
const MAX_VISIBLE_VOICES = 14;
const SPEECH_RESET_DELAY_MS = 80;
const SPEECH_START_TIMEOUT_MS = 2600;
const SPEECH_RESTART_DEBOUNCE_MS = 220;
const SPEECH_VOICE_SWITCH_DELAY_MS = 140;
const SPEECH_SELF_TEST_TEXT = "这是朗读自检。如果你听到了这句话，说明浏览器发声已经正常。";

const PREFERRED_EN_VOICE_NAMES = ["aria", "jenny", "guy", "libby", "sonia", "ryan", "emma", "ava", "andrew", "sara", "zira", "david", "hazel"];
const BRIDGE_VOICE_PREFIX = "bridge://";
const DEFAULT_VOICE_URI = "system-default";
const WINDOWS_VOICE_ENDPOINT = "./api/windows-voices";
const WINDOWS_TTS_ENDPOINT = "./api/windows-tts";
const VOICE_CATALOG_WAIT_MS = 900;

const state = {
  book: null,
  allVoices: [],
  bridgeVoices: [],
  voices: [],
  currentSectionIndex: 0,
  currentParagraphIndex: 0,
  currentSentenceIndex: 0,
  currentSentenceStarts: [],
  renderedSentenceCount: 0,
  speechUnits: [],
  speaking: false,
  paused: false,
  activeUtterance: null,
  activeAudio: null,
  activeAudioUrl: "",
  voiceURI: "",
  rate: 1,
  pitch: 1,
  tonePreset: "light",
  toneDepth: 84,
  toneGlow: 54,
  ocrMode: "auto",
  ocrLanguage: "eng",
  ocrWorker: null,
  ocrWorkerKey: "",
  speechAttemptNonce: 0,
  rateRestartTimer: 0,
  speechRestartTimer: 0,
  voiceReloadTimer: 0,
  voiceCatalogRetryTimer: 0,
  voiceCatalogRetryCount: 0,
  speechAbortController: null,
};

const dom = {
  statusChip: document.getElementById("status-chip"),
  fileInput: document.getElementById("book-file-input"),
  loadDemoButton: document.getElementById("load-demo-button"),
  voiceSelect: document.getElementById("voice-select"),
  voiceReadyPill: document.getElementById("voice-ready-pill"),
  rateRange: document.getElementById("rate-range"),
  pitchRange: document.getElementById("pitch-range"),
  rateValue: document.getElementById("rate-value"),
  pitchValue: document.getElementById("pitch-value"),
  bookTitle: document.getElementById("book-title"),
  bookSubtitle: document.getElementById("book-subtitle"),
  bookFormatPill: document.getElementById("book-format-pill"),
  chapterCount: document.getElementById("chapter-count"),
  charCount: document.getElementById("char-count"),
  currentChapterMetric: document.getElementById("current-chapter-metric"),
  sentenceCount: document.getElementById("sentence-count"),
  bookProgressText: document.getElementById("book-progress-text"),
  speechProgressText: document.getElementById("speech-progress-text"),
  bookProgressFill: document.getElementById("book-progress-fill"),
  speechProgressFill: document.getElementById("speech-progress-fill"),
  speakButton: document.getElementById("speak-button"),
  pauseButton: document.getElementById("pause-button"),
  stopButton: document.getElementById("stop-button"),
  voiceTestButton: document.getElementById("voice-test-button"),
  voiceHint: document.getElementById("voice-hint"),
  chapterSelect: document.getElementById("chapter-select"),
  chapterSelectLabel: document.getElementById("chapter-select-label"),
  positionRange: document.getElementById("position-range"),
  positionRangeLabel: document.getElementById("position-range-label"),
  positionDotRow: document.getElementById("position-dot-row"),
  chapterChipList: document.getElementById("chapter-chip-list"),
  sectionLabelPill: document.getElementById("section-label-pill"),
  readerSectionTitle: document.getElementById("reader-section-title"),
  readerFormatPill: document.getElementById("reader-format-pill"),
  readerPositionPill: document.getElementById("reader-position-pill"),
  readerSourceHint: document.getElementById("reader-source-hint"),
  speechStateHint: document.getElementById("speech-state-hint"),
  readerBody: document.getElementById("reader-body"),
  tonePill: document.getElementById("tone-pill"),
  toneDepthRange: document.getElementById("tone-depth-range"),
  toneGlowRange: document.getElementById("tone-glow-range"),
  toneDepthValue: document.getElementById("tone-depth-value"),
  toneGlowValue: document.getElementById("tone-glow-value"),
  toneHelper: document.getElementById("tone-helper"),
  tonePresetButtons: [...document.querySelectorAll("[data-tone-preset]")],
  ocrModeSelect: document.getElementById("ocr-mode-select"),
  ocrLanguageSelect: document.getElementById("ocr-language-select"),
  ocrHelper: document.getElementById("ocr-helper"),
  themeMeta: document.querySelector('meta[name="theme-color"]'),
  speechDiagnostic: document.getElementById("speech-diagnostic"),
  speechDiagnosticTitle: document.getElementById("speech-diagnostic-title"),
  speechDiagnosticText: document.getElementById("speech-diagnostic-text"),
};

bootstrap();

async function bootstrap() {
  prepareToneControls();
  applyBrandCopy();
  hydrateSettings();
  applyToneFromState();
  refreshToneControls();
  refreshOcrHint();
  wireEvents();
  refreshSpeechControls();
  renderSpeechDiagnostics();
  void loadVoices();
  renderJumpButtons(dom.positionDotRow, 0, 0, () => {});

  if ("speechSynthesis" in window) {
    window.speechSynthesis.onvoiceschanged = () => {
      scheduleVoiceReload();
    };
  }
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("./sw.js")
      .then((registration) => registration.update().catch(() => Promise.resolve()))
      .catch(() => {
        // Non-critical enhancement.
      });
  }
  registerFileLaunchConsumer();
  void importSharedBookIfAvailable();
  window.addEventListener("beforeunload", () => {
    terminateOcrWorker();
  });
  if (!state.book) {
    loadDemoBook({ auto: true });
  }
}

function applyBrandCopy() {
  document.title = "iStone Reader";
  const brandBadge = document.querySelector(".brand-badge");
  const eyebrow = document.querySelector(".hero-copy .eyebrow");
  const heroTitle = document.querySelector(".hero-copy h1");
  const toneCaption = document.querySelector(".studio-block .block-heading span");

  if (brandBadge) {
    brandBadge.textContent = "iStone Reader";
  }
  if (eyebrow) {
    eyebrow.textContent = "简单方便的听读体验";
  }
  if (heroTitle) {
    heroTitle.textContent = "iStone Reader";
  }
  if (toneCaption) {
    toneCaption.textContent = "快速切换配色";
  }

  if (dom.rateRange) {
    dom.rateRange.min = "0.5";
    dom.rateRange.max = "3.0";
    dom.rateRange.step = "0.1";
    dom.rateRange.value = String(clamp(state.rate, 0.5, 3.0));
  }
  state.pitch = 1;
}

function prepareToneControls() {
  const presetButtons = [
    { key: "dark", label: "暗色" },
    { key: "light", label: "浅色" },
  ];

  dom.tonePresetButtons.forEach((button, index) => {
    const preset = presetButtons[index];
    if (!preset) {
      button.remove();
      return;
    }
    button.dataset.tonePreset = preset.key;
    button.textContent = preset.label;
  });

  dom.tonePresetButtons = [...document.querySelectorAll("[data-tone-preset]")];
  dom.toneDepthRange?.closest(".field-block")?.remove();
  dom.toneGlowRange?.closest(".field-block")?.remove();
}

function wireEvents() {
  dom.fileInput.addEventListener("change", async (event) => {
    const [file] = event.target.files ?? [];
    if (!file) {
      return;
    }
    await importBook(file);
    dom.fileInput.value = "";
  });

  dom.loadDemoButton.addEventListener("click", () => {
    loadDemoBook();
  });

  dom.voiceSelect.addEventListener("change", () => {
    state.voiceURI = dom.voiceSelect.value;
    refreshVoiceHint();
    handleVoiceChangeDuringPlayback();
  });

  dom.rateRange?.addEventListener("input", () => {
    state.rate = clamp(Number(dom.rateRange.value), 0.5, 3.0);
    dom.rateValue.textContent = `${state.rate.toFixed(1)}x`;
    applyRateChangeDuringPlayback();
  });

  dom.speakButton.addEventListener("click", () => {
    void startSpeech();
  });
  dom.pauseButton.addEventListener("click", () => {
    void togglePause();
  });
  dom.stopButton.addEventListener("click", () => stopSpeech());
  dom.voiceTestButton.addEventListener("click", () => {
    void runVoiceSelfTest();
  });

  dom.chapterSelect.addEventListener("change", () => {
    const max = Math.max(0, state.book?.sections.length - 1 || 0);
    setCurrentSection(clamp(Number(dom.chapterSelect.value), 0, max), {
      stopSpeaking: true,
      resetParagraph: true,
      resetSentence: true,
    });
  });

  dom.positionRange.addEventListener("input", () => {
    jumpToParagraph(clamp(Number(dom.positionRange.value), 0, Math.max(0, getCurrentParagraphs().length - 1)));
  });

  dom.tonePresetButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.tonePreset = button.dataset.tonePreset || "dark";
      applyToneFromState();
      refreshToneControls();
      saveSettings();
    });
  });

  dom.ocrModeSelect.addEventListener("change", async () => {
    state.ocrMode = dom.ocrModeSelect.value;
    await terminateOcrWorker();
    refreshOcrHint();
    saveSettings();
  });

  dom.ocrLanguageSelect.addEventListener("change", async () => {
    state.ocrLanguage = dom.ocrLanguageSelect.value;
    await terminateOcrWorker();
    refreshOcrHint();
    saveSettings();
  });
}

async function importSharedBookIfAvailable() {
  const url = new URL(window.location.href);
  if (url.searchParams.get("shared") !== "1") {
    return;
  }

  setStatus("正在接收分享文件");
  try {
    const response = await fetch("./shared-book", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("shared-file-missing");
    }
    const blob = await response.blob();
    const headerName = response.headers.get("X-Shared-Filename") || "";
    const filename = decodeURIComponent(headerName || "shared-book.pdf");
    const file = new File([blob], filename, {
      type: blob.type || guessMimeTypeFromName(filename),
      lastModified: Date.now(),
    });
    await importBook(file);
    window.history.replaceState({}, document.title, window.location.pathname || "./");
  } catch {
    setStatus("没有接收到可导入的分享文件");
  }
}

function registerFileLaunchConsumer() {
  if (!("launchQueue" in window) || typeof window.launchQueue?.setConsumer !== "function") {
    return;
  }

  window.launchQueue.setConsumer((launchParams) => {
    const [handle] = launchParams.files || [];
    if (!handle || typeof handle.getFile !== "function") {
      return;
    }
    void handle.getFile().then((file) => importBook(file)).catch(() => {
      setStatus("没有读取到系统传入的文件");
    });
  });
}

function guessMimeTypeFromName(fileName) {
  const extension = getExtension(fileName);
  return (
    {
      pdf: "application/pdf",
      epub: "application/epub+zip",
      txt: "text/plain",
      md: "text/markdown",
      markdown: "text/markdown",
    }[extension] || "application/octet-stream"
  );
}

function hydrateSettings() {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      return;
    }
    const settings = JSON.parse(raw);
    state.tonePreset = ["dark", "light"].includes(settings.tonePreset) ? settings.tonePreset : state.tonePreset;
    state.ocrMode = ["auto", "always", "off"].includes(settings.ocrMode) ? settings.ocrMode : state.ocrMode;
    state.ocrLanguage = ["eng", "eng+chi_sim"].includes(settings.ocrLanguage) ? settings.ocrLanguage : state.ocrLanguage;
  } catch {
    // Ignore malformed local settings.
  }
}

function saveSettings() {
  const payload = {
    tonePreset: state.tonePreset,
    ocrMode: state.ocrMode,
    ocrLanguage: state.ocrLanguage,
  };
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(payload));
}

function refreshSpeechControls() {
  dom.rateValue.textContent = `${state.rate.toFixed(1)}x`;
}

function renderSpeechDiagnostics(title, text, stateName = "idle") {
  const fallback = getPlatformSpeechChecks();
  dom.speechDiagnostic.dataset.state = stateName;
  dom.speechDiagnosticTitle.textContent = title || "朗读自检：待测试";
  dom.speechDiagnosticText.textContent = text || fallback;
}

function refreshToneControls() {
  const preset = TONE_PRESETS[state.tonePreset] || TONE_PRESETS.dark;
  dom.tonePill.textContent = preset.label;
  dom.toneHelper.textContent = `当前是 ${preset.label}。面板浓度越高越稳重，氛围光感越高越鲜明。`;
  dom.tonePresetButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.tonePreset === state.tonePreset);
  });
}

function refreshOcrHint() {
  dom.ocrModeSelect.value = state.ocrMode;
  dom.ocrLanguageSelect.value = state.ocrLanguage;
  const modeText =
    state.ocrMode === "auto" ? "遇到扫描页时自动识别" : state.ocrMode === "always" ? "所有 PDF 页都强制识别" : "已关闭扫描识别";
  const langText = state.ocrLanguage === "eng" ? "英文模型" : "中英混合模型";
  dom.ocrHelper.textContent = `${modeText}，当前使用 ${langText}。扫描版文件会比普通 PDF 更慢。`;
}

function scheduleVoiceReload() {
  window.clearTimeout(state.voiceReloadTimer);
  const delay = isSpeechActive() ? 600 : 80;
  state.voiceReloadTimer = window.setTimeout(() => {
    void loadVoices({ quiet: isSpeechActive() });
  }, delay);
}

function handleVoiceChangeDuringPlayback() {
  if (!state.book || state.paused || !isSpeechActive()) {
    return;
  }
  requestSpeechRestart("正在切换声音，当前句将重新朗读", SPEECH_VOICE_SWITCH_DELAY_MS);
}

function applyRateChangeDuringPlayback() {
  if (state.activeAudio) {
    state.activeAudio.playbackRate = clamp(state.rate, 0.5, 3.0);
    dom.speechStateHint.textContent = `语速已调整为 ${state.rate.toFixed(1)}x`;
    return;
  }

  if (!state.book || state.paused || !("speechSynthesis" in window)) {
    return;
  }
  if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
    return;
  }

  requestSpeechRestart(`语速已调整为 ${state.rate.toFixed(1)}x，正在应用到当前句`, SPEECH_RESTART_DEBOUNCE_MS);
}

function requestSpeechRestart(message, delayMs = SPEECH_RESTART_DEBOUNCE_MS) {
  if (!state.book) {
    return;
  }
  const sentences = getCurrentSentences();
  if (!sentences.length) {
    return;
  }

  const sentenceIndex = clamp(state.currentSentenceIndex, 0, Math.max(0, sentences.length - 1));
  state.speechAttemptNonce += 1;
  state.speaking = true;
  state.paused = false;
  window.clearTimeout(state.rateRestartTimer);
  window.clearTimeout(state.speechRestartTimer);
  cancelActiveSpeechTransport();
  clearActiveAudio();
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  dom.speechStateHint.textContent = message;
  state.speechRestartTimer = window.setTimeout(() => {
    if (!state.book || state.paused) {
      return;
    }
    void restartChapterSpeechFromIndex(sentenceIndex);
  }, delayMs);
}

function cancelActiveSpeechTransport() {
  if (state.speechAbortController) {
    try {
      state.speechAbortController.abort();
    } catch {
      // Ignore abort races.
    }
    state.speechAbortController = null;
  }
}

function applyToneFromState() {
  const preset = TONE_PRESETS[state.tonePreset] || TONE_PRESETS.dark;
  const root = document.documentElement.style;
  const isLight = state.tonePreset === "light";
  document.body.dataset.tone = state.tonePreset;
  document.documentElement.style.colorScheme = isLight ? "light" : "dark";

  root.setProperty("--accent-primary", preset.accentPrimary);
  root.setProperty("--accent-secondary", preset.accentSecondary);
  root.setProperty("--accent-tertiary", preset.accentTertiary);
  root.setProperty("--accent-quaternary", preset.accentQuaternary);
  root.setProperty("--accent-aux", preset.accentAux);
  root.setProperty("--panel-top", isLight ? "rgba(255, 255, 255, 0.96)" : "rgba(22, 28, 39, 0.96)");
  root.setProperty("--panel-bottom", isLight ? "rgba(247, 249, 252, 0.96)" : "rgba(15, 23, 42, 0.96)");
  root.setProperty(
    "--body-background",
    isLight
      ? "linear-gradient(180deg, #eef3f8 0%, #f8fafc 42%, #edf2f7 100%)"
      : "linear-gradient(180deg, #111827 0%, #0f172a 100%)",
  );
  root.setProperty("--button-gradient", `linear-gradient(135deg, ${preset.accentPrimary}, ${preset.accentTertiary})`);
  root.setProperty("--button-shadow", `0 14px 30px ${rgbaFromHex(preset.accentPrimary, 0.28)}`);
  root.setProperty(
    "--badge-background",
    `linear-gradient(120deg, ${rgbaFromHex(preset.accentPrimary, 0.24)}, ${rgbaFromHex(preset.accentSecondary, 0.24)})`,
  );
  root.setProperty(
    "--progress-gradient",
    `linear-gradient(90deg, ${preset.accentSecondary}, ${preset.accentQuaternary}, ${preset.accentPrimary})`,
  );
  root.setProperty("--accent-gradient", `linear-gradient(90deg, ${preset.accentTertiary}, ${preset.accentPrimary})`);
  root.setProperty(
    "--chip-active-gradient",
    `linear-gradient(135deg, ${rgbaFromHex(preset.accentPrimary, 0.28)}, ${rgbaFromHex(preset.accentSecondary, 0.24)})`,
  );
  root.setProperty(
    "--sentence-active-gradient",
    `linear-gradient(135deg, ${rgbaFromHex(preset.accentPrimary, 0.3)}, ${rgbaFromHex(preset.accentTertiary, 0.22)})`,
  );
  root.setProperty("--active-outline", rgbaFromHex(preset.accentSecondary, 0.46));
  root.setProperty("--active-surface", rgbaFromHex(preset.accentSecondary, 0.08));
  if (dom.themeMeta) {
    dom.themeMeta.setAttribute("content", isLight ? "#f6f8fc" : "#111827");
  }
}

function loadVoices() {
  if (!("speechSynthesis" in window)) {
    dom.voiceSelect.innerHTML = `<option value="">当前浏览器不支持语音朗读</option>`;
    dom.voiceReadyPill.textContent = "语音不可用";
    renderSpeechDiagnostics("朗读不可用", "当前浏览器不支持系统朗读。建议改用最新版 Edge、Chrome 或 iPhone 的 Safari。", "error");
    return;
  }

  const browserVoices = window.speechSynthesis
    .getVoices()
    .slice()
    .sort((left, right) => scoreVoice(right) - scoreVoice(left) || `${left.lang}-${left.name}`.localeCompare(`${right.lang}-${right.name}`));
  state.allVoices = browserVoices;
  const voices = filterPreferredVoices(browserVoices);

  state.voices = voices;
  dom.voiceSelect.innerHTML = "";

  if (!voices.length) {
    dom.voiceSelect.innerHTML = `<option value="">正在等待系统语音加载...</option>`;
    dom.voiceReadyPill.textContent = "语音加载中";
    renderSpeechDiagnostics(
      "等待系统语音",
      `浏览器已支持朗读，但还没拿到可用声音。${getVoiceEnvironmentGuidance()}${getPlatformSpeechChecks()}`,
      "warning",
    );
    return;
  }

  voices.forEach((voice) => {
    const option = document.createElement("option");
    option.value = voice.voiceURI;
    option.textContent = formatVoiceOptionLabel(voice);
    dom.voiceSelect.appendChild(option);
  });

  const preferredVoice = pickPreferredDefaultVoice(voices) || pickBestVoice(voices, navigator.language || "zh-CN");
  if (!state.voiceURI || !voices.some((voice) => voice.voiceURI === state.voiceURI)) {
    state.voiceURI = preferredVoice?.voiceURI || voices[0].voiceURI;
  }

  dom.voiceSelect.value = state.voiceURI || preferredVoice?.voiceURI || voices[0].voiceURI;
  state.voiceURI = dom.voiceSelect.value;
  dom.voiceReadyPill.textContent = `${voices.length} 种精选语音`;
  dom.voiceReadyPill.textContent = `${voices.length} 种可用语音`;
  refreshVoiceHint();
  renderSpeechDiagnostics(
    "朗读引擎已就绪",
    `当前设备已筛出 ${voices.length} 种更适合阅读的多语言声音。可以先点“测试发声”确认设备是否真的出声。`,
    "success",
  );
  renderSpeechDiagnostics(
    "朗读引擎已就绪",
    `当前页面拿到 ${voices.length} 种可用语音。下拉列表来自这台设备和当前浏览器，不是按书籍文本生成；真正朗读时才会尽量匹配句子的语言。`,
    "success",
  );
}

function refreshVoiceHint() {
  const voice = state.voices.find((item) => item.voiceURI === state.voiceURI);
  const counts = summarizeVoiceBuckets(state.voices);
  const englishHint = counts.english
    ? `当前列表里有 ${counts.english} 种英文语音。`
    : "当前设备没有暴露可用英文语音，若想听英文，需要先在这台设备或浏览器里安装 English TTS。";
  dom.voiceHint.textContent = voice
    ? `当前已选：${formatVoiceOptionLabel(voice)}。下拉列表来自这台设备和当前浏览器，不是按书籍语言生成；朗读时才会尽量按句子语言匹配声音。${englishHint} 手机端也只会显示手机自己支持的语音。`
    : `语音来自当前设备系统。不同手机、浏览器和系统语音包，看到的可选声音会不同。${englishHint}`;
  return;
  dom.voiceHint.textContent = voice
    ? `当前已选：${formatVoiceOptionLabel(voice)}。手机端不会继承电脑这套声音列表，而是显示该手机和当前浏览器自己支持的语音。`
    : "语音来自当前设备系统。不同手机、浏览器和系统语音包，看到的可选声音会不同。";
}

async function importBook(file) {
  try {
    setStatus(`正在解析 ${file.name}`);
    const extension = getExtension(file.name);
    let bookData;

    if (extension === "pdf") {
      bookData = await parsePdfFile(file);
    } else if (extension === "epub") {
      bookData = await parseEpubFile(file);
    } else if (["txt", "md", "markdown"].includes(extension)) {
      bookData = await parseTextFile(file);
    } else {
      throw new Error("暂不支持该格式，请使用 PDF / EPUB / TXT / MD。");
    }

    finalizeBook(bookData);
    setStatus(`${file.name} 已载入`);
  } catch (error) {
    console.error(error);
    stopSpeech({ silent: true });
    setStatus("解析失败");
    dom.readerBody.innerHTML = `
      <div class="empty-state">
        <strong>导入失败</strong>
        <p>${escapeHtml(error.message || "文件解析时出现问题。")}</p>
      </div>
    `;
  }
}

async function parseTextFile(file) {
  const rawText = await file.text();
  return {
    title: stripFileExtension(file.name),
    subtitle: "文本文件已按标题或段落长度自动拆分，并补上快速点位导航。",
    format: "TXT / MD",
    sections: splitPlainTextIntoSections(rawText, file.name),
    sourceHint: "优先按正式标题拆分；如果没有标题，则按文本体量自动分段。",
  };
}

async function parsePdfFile(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages = [];
  let ocrPageCount = 0;

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    setStatus(`PDF 解析中 ${pageNumber} / ${pdf.numPages}`);
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    let text = normalizeWhitespace(pdfTextItemsToString(content.items));
    let ocrUsed = false;

    if (shouldRunOcr(text)) {
      const ocrText = await recognizePdfPage(page, pageNumber, pdf.numPages);
      if (ocrText) {
        text = repairOcrLineBreaks(ocrText);
        ocrUsed = true;
        ocrPageCount += 1;
      }
    }

    pages.push({
      pageNumber,
      text,
      ocrUsed,
    });
  }

  const hasText = pages.some((page) => page.text.trim());
  if (!hasText) {
    if (state.ocrMode === "off") {
      throw new Error("这份 PDF 更像扫描图片，当前已关闭扫描识别。请打开扫描识别后重试。");
    }
    throw new Error("扫描版 PDF 仍未识别出文字，请尝试切换到中英混合识别。");
  }

  const sections = splitPdfPagesIntoSections(pages, file.name);
  return {
    title: stripFileExtension(file.name),
    subtitle: ocrPageCount
      ? `PDF 共 ${pdf.numPages} 页，其中 ${ocrPageCount} 页通过扫描识别补出正文。`
      : `PDF 共 ${pdf.numPages} 页，已转换为可朗读章节。`,
    format: "PDF",
    sections,
    sourceHint: ocrPageCount
      ? "已自动识别扫描页；如果需要中文扫描识别，可切到中英混合模式。"
      : "优先识别章标题；识别不到时自动按页数和文本长度回退分段。",
  };
}

async function parseEpubFile(file) {
  if (!window.ePub) {
    throw new Error("当前环境未加载 EPUB 解析组件。");
  }

  const buffer = await file.arrayBuffer();
  const book = window.ePub(buffer);
  await book.ready;
  const metadata = await book.loaded.metadata;
  const navigation = await book.loaded.navigation;
  const spineItems = book.spine?.spineItems || [];
  const tocMarkers = buildTocSpineMarkers(navigation.toc, spineItems);
  const spineSections = [];
  let tocPointer = 0;
  let activeTocTitle = "";

  for (let index = 0; index < spineItems.length; index += 1) {
    const item = spineItems[index];
    setStatus(`EPUB 解析中 ${index + 1} / ${spineItems.length}`);
    await item.load(book.load.bind(book));
    const html = item.document?.body?.innerHTML || item.document?.documentElement?.outerHTML || "";
    const text = normalizeWhitespace(htmlToPlainText(html));
    item.unload();

    if (!text.trim()) {
      continue;
    }

    while (tocPointer < tocMarkers.length && tocMarkers[tocPointer].spineIndex <= index) {
      activeTocTitle = tocMarkers[tocPointer].title;
      tocPointer += 1;
    }

    const title =
      activeTocTitle ||
      text.split(/\n+/).find((line) => line.trim().length >= 4 && line.trim().length <= 36) ||
      `章节 ${spineSections.length + 1}`;

    spineSections.push({
      id: `section-${spineSections.length + 1}`,
      title: cleanHeading(title),
      tocTitle: cleanHeading(activeTocTitle || ""),
      text,
      sourceHint: `EPUB spine ${index + 1}`,
      spineIndex: index + 1,
    });
  }

  const sections = mergeEpubSpineSections(spineSections, file.name);
  if (!sections.length) {
    throw new Error("EPUB 中没有解析出可阅读文本。");
  }

  return {
    title: metadata?.title || stripFileExtension(file.name),
    subtitle: metadata?.creator ? `作者：${metadata.creator}` : "EPUB 目录已拆分为可朗读章节。",
    format: "EPUB",
    sections,
    sourceHint: "优先沿用 EPUB 目录标题，适合直接按章节阅读。",
  };
}

function buildTocSpineMarkers(toc = [], spineItems = []) {
  return flattenToc(toc || [])
    .map((entry) => {
      const title = cleanHeading(entry.label || "");
      const spineIndex = findSpineIndexForHref(entry.href, spineItems);
      if (!title || spineIndex < 0) {
        return null;
      }
      return { title, spineIndex };
    })
    .filter(Boolean)
    .sort((left, right) => left.spineIndex - right.spineIndex);
}

function findSpineIndexForHref(href, spineItems) {
  const normalized = normalizeHref(href);
  if (!normalized) {
    return -1;
  }

  const directIndex = spineItems.findIndex((item) => normalizeHref(item.href) === normalized);
  if (directIndex >= 0) {
    return directIndex;
  }

  return spineItems.findIndex((item) => {
    const candidate = normalizeHref(item.href);
    return candidate.endsWith(normalized) || normalized.endsWith(candidate);
  });
}

function mergeEpubSpineSections(sections, fallbackName) {
  if (!sections.length) {
    return [];
  }

  const merged = [];
  let current = null;

  sections.forEach((section) => {
    const preferredTitle = cleanHeading(section.tocTitle || section.title || `章节 ${merged.length + 1}`);
    const cleanedText = stripLeadingHeadingFromText(normalizeWhitespace(section.text || ""), preferredTitle);
    if (!cleanedText) {
      return;
    }

    const tocKey = normalizeSectionKey(section.tocTitle || "");
    const titleKey = normalizeSectionKey(preferredTitle);
    const shouldStartNew =
      !current ||
      (tocKey && tocKey !== current.tocKey && current.text.length >= MIN_EPUB_TOC_SPLIT_CHARS) ||
      (!tocKey && titleKey && titleKey !== current.titleKey && current.text.length >= 2600) ||
      current.text.length >= 5400 ||
      current.spineCount >= 10;

    if (shouldStartNew) {
      if (current?.text.trim()) {
        merged.push(finalizeMergedEpubSection(current, merged.length));
      }
      current = {
        title: preferredTitle,
        tocKey,
        titleKey,
        text: cleanedText,
        startSpine: section.spineIndex,
        endSpine: section.spineIndex,
        spineCount: 1,
      };
      return;
    }

    if (current.title.startsWith("章节 ") && preferredTitle) {
      current.title = preferredTitle;
      current.titleKey = titleKey || current.titleKey;
      current.tocKey = tocKey || current.tocKey;
    }

    current.text = appendSectionText(current.text, cleanedText);
    current.endSpine = section.spineIndex;
    current.spineCount += 1;
  });

  if (current?.text.trim()) {
    merged.push(finalizeMergedEpubSection(current, merged.length));
  }

  return merged.length
    ? merged
    : fallbackChunkSections(
        sections.map((section) => section.text).join("\n\n"),
        stripFileExtension(fallbackName),
        "EPUB 未识别到稳定目录，已按文本长度回退分段",
      );
}

function finalizeMergedEpubSection(section, index) {
  return {
    id: `section-${index + 1}`,
    title: section.title || `章节 ${index + 1}`,
    text: section.text.trim(),
    sourceHint:
      section.startSpine === section.endSpine
        ? `EPUB spine ${section.startSpine}`
        : `EPUB spine ${section.startSpine} - ${section.endSpine}`,
  };
}

function appendSectionText(previous, next) {
  if (!next) {
    return previous;
  }
  return previous ? `${previous}\n\n${next}`.trim() : next.trim();
}

async function recognizePdfPage(page, pageNumber, totalPages) {
  if (!window.Tesseract) {
    if (state.ocrMode === "always") {
      throw new Error("扫描识别引擎未加载，请检查网络后重试。");
    }
    return "";
  }

  const worker = await ensureOcrWorker();
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = calculateOcrRenderScale(baseViewport);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);

  if (!context) {
    return "";
  }

  setStatus(`扫描识别中 ${pageNumber} / ${totalPages}`);
  await page.render({ canvasContext: context, viewport }).promise;
  const preparedCanvas = prepareCanvasForOcr(canvas);
  const firstResult = await recognizeWithOcrMode(worker, preparedCanvas, "3");
  const result = isWeakOcrCandidate(firstResult) ? pickBetterOcrCandidate(firstResult, await recognizeWithOcrMode(worker, preparedCanvas, "6")) : firstResult;
  preparedCanvas.width = 0;
  preparedCanvas.height = 0;
  canvas.width = 0;
  canvas.height = 0;
  return normalizeWhitespace(result.text || "");
}

function calculateOcrRenderScale(baseViewport) {
  const width = Math.max(1, baseViewport.width || 1);
  const height = Math.max(1, baseViewport.height || 1);
  const longEdge = Math.max(width, height);
  let scale = clamp(OCR_TARGET_LONG_EDGE / longEdge, OCR_RENDER_MIN_SCALE, OCR_RENDER_MAX_SCALE);
  const projectedPixels = width * height * scale * scale;
  if (projectedPixels > OCR_MAX_PIXELS) {
    scale *= Math.sqrt(OCR_MAX_PIXELS / projectedPixels);
  }
  return clamp(scale, 1.1, OCR_RENDER_MAX_SCALE);
}

function prepareCanvasForOcr(sourceCanvas) {
  const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
  if (!sourceContext) {
    return sourceCanvas;
  }

  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  const image = sourceContext.getImageData(0, 0, width, height);
  const data = image.data;
  let luminanceSum = 0;

  for (let index = 0; index < data.length; index += 4) {
    luminanceSum += data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
  }

  const pixelCount = Math.max(1, data.length / 4);
  const average = luminanceSum / pixelCount;
  const threshold = clamp(average - 12, 118, 210);
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const luminance = data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114;
      const contrasted = clamp((luminance - 128) * 1.22 + 128, 0, 255);
      const ink = contrasted < threshold;
      const value = ink ? 0 : 255;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;

      if (ink) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  sourceContext.putImageData(image, 0, 0);

  const padding = Math.round(Math.min(width, height) * 0.025);
  const cropX = clamp(minX - padding, 0, width - 1);
  const cropY = clamp(minY - padding, 0, height - 1);
  const cropRight = clamp(maxX + padding, 1, width);
  const cropBottom = clamp(maxY + padding, 1, height);
  const cropWidth = cropRight - cropX;
  const cropHeight = cropBottom - cropY;
  const hasUsefulCrop = cropWidth > width * 0.25 && cropHeight > height * 0.25 && cropWidth * cropHeight < width * height * 0.96;

  if (!hasUsefulCrop) {
    return sourceCanvas;
  }

  const preparedCanvas = document.createElement("canvas");
  preparedCanvas.width = cropWidth;
  preparedCanvas.height = cropHeight;
  preparedCanvas.getContext("2d")?.drawImage(sourceCanvas, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
  return preparedCanvas;
}

async function recognizeWithOcrMode(worker, canvas, pageSegMode) {
  await worker.setParameters({
    preserve_interword_spaces: "1",
    tessedit_pageseg_mode: pageSegMode,
    user_defined_dpi: "300",
  });
  const result = await worker.recognize(canvas);
  return {
    text: normalizeWhitespace(result.data?.text || ""),
    confidence: Number(result.data?.confidence || 0),
  };
}

function isWeakOcrCandidate(candidate) {
  const text = candidate?.text || "";
  const meaningful = countMeaningfulCharacters(text);
  const compactLength = text.replace(/\s/g, "").length || 1;
  const symbolRatio = (text.match(/[^\sA-Za-z0-9\u4e00-\u9fa5，。！？；：、,.!?;:'"“”‘’\-]/g) || []).length / compactLength;
  return meaningful < OCR_WEAK_MIN_CHARS || symbolRatio > OCR_SYMBOL_RATIO_LIMIT || (candidate.confidence > 0 && candidate.confidence < OCR_WEAK_CONFIDENCE);
}

function pickBetterOcrCandidate(left, right) {
  return scoreOcrCandidate(right) > scoreOcrCandidate(left) ? right : left;
}

function scoreOcrCandidate(candidate) {
  const text = candidate?.text || "";
  const meaningful = countMeaningfulCharacters(text);
  const compactLength = text.replace(/\s/g, "").length || 1;
  const symbolRatio = (text.match(/[^\sA-Za-z0-9\u4e00-\u9fa5，。！？；：、,.!?;:'"“”‘’\-]/g) || []).length / compactLength;
  return meaningful * 2 + Number(candidate?.confidence || 0) - symbolRatio * 120;
}

async function ensureOcrWorker() {
  const workerKey = state.ocrLanguage;
  if (state.ocrWorker && state.ocrWorkerKey === workerKey) {
    return state.ocrWorker;
  }

  await terminateOcrWorker();
  setStatus(`正在准备 OCR（${state.ocrLanguage === "eng" ? "英文" : "中英混合"}）`);
  state.ocrWorker = await window.Tesseract.createWorker(getOcrLanguageArgument(state.ocrLanguage), 1, {
    ...OCR_REMOTE,
    logger(message) {
      if (typeof message.progress === "number") {
        setStatus(`OCR 引擎准备中 ${Math.round(message.progress * 100)}%`);
      }
    },
  });
  await state.ocrWorker.setParameters({
    preserve_interword_spaces: "1",
    tessedit_pageseg_mode: "3",
    user_defined_dpi: "300",
  });
  state.ocrWorkerKey = workerKey;
  return state.ocrWorker;
}

async function terminateOcrWorker() {
  if (!state.ocrWorker) {
    state.ocrWorkerKey = "";
    return;
  }
  try {
    await state.ocrWorker.terminate();
  } catch {
    // Ignore worker shutdown failures.
  } finally {
    state.ocrWorker = null;
    state.ocrWorkerKey = "";
  }
}

function finalizeBook(bookData) {
  stopSpeech({ silent: true });

  const sanitizedSections = normalizeBookSections(bookData.sections
    .map((section, index) => ({
      id: section.id || `section-${index + 1}`,
      title: cleanHeading(section.title || `章节 ${index + 1}`),
      text: cleanDisplayText(section.text || ""),
      sourceHint: section.sourceHint || "",
    }))
    .filter((section) => section.text.trim()), {
      format: bookData.format,
      fallbackTitle: cleanHeading(bookData.title || "正文"),
    });

  if (!sanitizedSections.length) {
    throw new Error("没有解析出可阅读内容。");
  }

  state.book = {
    ...bookData,
    sections: sanitizedSections,
    totalCharacters: sanitizedSections.reduce((sum, section) => sum + section.text.length, 0),
    totalParagraphs: sanitizedSections.reduce((sum, section) => sum + getSectionParagraphCount(section), 0),
  };
  state.currentSectionIndex = 0;
  state.currentParagraphIndex = 0;
  state.currentSentenceIndex = 0;
  state.currentSentenceStarts = [];
  state.renderedSentenceCount = 0;
  state.speechUnits = [];

  renderBookMeta();
  renderChapterChips();
  setCurrentSection(0, { stopSpeaking: true, resetParagraph: true, resetSentence: true });
}

function renderBookMeta() {
  if (!state.book) {
    return;
  }

  dom.bookTitle.textContent = state.book.title;
  dom.bookSubtitle.textContent = state.book.subtitle || "已准备好按章节阅读与朗读。";
  dom.bookFormatPill.textContent = state.book.format;
  dom.readerFormatPill.textContent = state.book.format;
  dom.chapterCount.textContent = String(state.book.sections.length);
  dom.charCount.textContent = formatCount(state.book.totalCharacters);
  dom.currentChapterMetric.textContent = `1/${state.book.sections.length}`;
  dom.sentenceCount.textContent = "0";
  dom.chapterSelectLabel.textContent = `共 ${state.book.sections.length} 章 · ${state.book.totalParagraphs || 0} 段`;
  dom.bookProgressFill.style.width = "0%";
  dom.bookProgressText.textContent = "0%";
  dom.readerPositionPill.textContent = "0%";
  dom.positionRange.max = "0";
  dom.positionRange.value = "0";
  dom.positionRangeLabel.textContent = "0 / 0";
  renderJumpButtons(dom.positionDotRow, 0, 0, () => {});
}

function renderChapterChips() {
  dom.chapterSelect.innerHTML = "";
  dom.chapterChipList.innerHTML = "";
  if (!state.book) {
    return;
  }

  state.book.sections.forEach((section, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = formatSectionSelectLabel(section, index, state.book.sections.length);
    option.title = option.textContent;
    dom.chapterSelect.appendChild(option);
  });
}

function setCurrentSection(index, options = {}) {
  if (!state.book) {
    return;
  }

  const sectionCount = state.book.sections.length;
  const nextIndex = clamp(index, 0, sectionCount - 1);

  if (options.stopSpeaking) {
    stopSpeech({ silent: true });
  }

  state.currentSectionIndex = nextIndex;
  if (options.resetParagraph) {
    state.currentParagraphIndex = 0;
  }
  if (options.resetSentence) {
    state.currentSentenceIndex = 0;
  }

  renderCurrentSection();
  updateChipStates();
  updateProgressDisplays();
  updateSpeechProgress();
}

function renderCurrentSection() {
  if (!state.book) {
    return;
  }

  const section = getCurrentSection();
  const paragraphs = getParagraphsFromSection(section);
  const sentenceMap = [];
  const sentenceStarts = [];
  dom.readerBody.innerHTML = "";
  const flowPanel = document.createElement("article");
  flowPanel.className = "reader-flow-panel";

  paragraphs.forEach((paragraphText, paragraphIndex) => {
    const paragraph = document.createElement("p");
    paragraph.className = "reader-paragraph";
    paragraph.dataset.paragraphIndex = String(paragraphIndex);

    sentenceStarts.push(sentenceMap.length);
    const paragraphSentences = splitIntoSentences(paragraphText);
    paragraphSentences.forEach((sentence, sentencePosition) => {
      const sentenceIndex = sentenceMap.length;
      sentenceMap.push(sentence);
      const span = document.createElement("span");
      span.className = "reader-sentence";
      span.dataset.sentenceIndex = String(sentenceIndex);
      span.textContent = sentence;
      paragraph.appendChild(span);
      const nextSentence = paragraphSentences[sentencePosition + 1];
      if (nextSentence && shouldInsertSpaceBetween(sentence, nextSentence)) {
        paragraph.appendChild(document.createTextNode(" "));
      }
    });

    flowPanel.appendChild(paragraph);
  });

  dom.readerBody.appendChild(flowPanel);

  state.currentSentenceStarts = sentenceStarts;
  state.renderedSentenceCount = sentenceMap.length;
  state.speechUnits = buildSpeechUnits(sentenceMap);
  state.currentParagraphIndex = clamp(state.currentParagraphIndex, 0, Math.max(0, paragraphs.length - 1));
  state.currentSentenceIndex = clamp(state.currentSentenceIndex, 0, Math.max(0, state.renderedSentenceCount - 1));

  dom.readerSectionTitle.textContent = section.title;
  dom.readerSourceHint.textContent = section.sourceHint || state.book.sourceHint || "";
  dom.currentChapterMetric.textContent = `${state.currentSectionIndex + 1}/${state.book.sections.length}`;
  dom.sentenceCount.textContent = String(state.renderedSentenceCount);
  dom.sectionLabelPill.textContent = `第 ${state.currentSectionIndex + 1} 章`;
  dom.readerPositionPill.textContent = `${state.currentSectionIndex + 1} / ${state.book.sections.length}`;
  dom.chapterSelect.value = String(state.currentSectionIndex);
  dom.chapterSelectLabel.textContent = `${state.currentSectionIndex + 1} / ${state.book.sections.length}`;
  dom.positionRange.max = String(Math.max(0, paragraphs.length - 1));
  renderJumpButtons(dom.positionDotRow, paragraphs.length, state.currentParagraphIndex, (point) => {
    jumpToParagraph(point);
  });
  refreshReaderDashboardMeta(paragraphs);
  highlightParagraphAndScroll(state.currentParagraphIndex, { smooth: false });
  highlightSentence(state.currentSentenceIndex, { smooth: false });
}

function updateChipStates() {
  dom.chapterSelect.value = String(state.currentSectionIndex);
  if (!dom.chapterChipList.children.length) {
    return;
  }
  [...dom.chapterChipList.children].forEach((chip, index) => {
    chip.classList.toggle("active", index === state.currentSectionIndex);
    if (index === state.currentSectionIndex) {
      chip.scrollIntoView({ behavior: "auto", inline: "center", block: "nearest" });
    }
  });
}

function updateProgressDisplays() {
  if (!state.book) {
    return;
  }

  const paragraphs = getCurrentParagraphs();
  const totalSections = state.book.sections.length;
  const paragraphFactor = paragraphs.length > 1 ? state.currentParagraphIndex / (paragraphs.length - 1) : 0;
  const bookPercent = ((state.currentSectionIndex + paragraphFactor) / Math.max(1, totalSections)) * 100;
  dom.bookProgressFill.style.width = `${bookPercent.toFixed(1)}%`;
  dom.bookProgressText.textContent = `${Math.round(bookPercent)}%`;
  refreshReaderDashboardMeta(paragraphs, bookPercent);
  dom.positionRange.value = String(clamp(state.currentParagraphIndex, 0, Math.max(0, paragraphs.length - 1)));
  dom.positionRangeLabel.textContent = `${Math.min(paragraphs.length, state.currentParagraphIndex + 1)} / ${paragraphs.length || 0}`;
  renderJumpButtons(dom.positionDotRow, paragraphs.length, state.currentParagraphIndex, (point) => {
    jumpToParagraph(point);
  });
}

function updateSpeechProgress() {
  const max = Math.max(1, state.renderedSentenceCount - 1);
  const percent = state.renderedSentenceCount ? (state.currentSentenceIndex / max) * 100 : 0;
  if (dom.speechProgressFill) {
    dom.speechProgressFill.style.width = `${percent.toFixed(1)}%`;
  }
  if (dom.speechProgressText) {
    dom.speechProgressText.textContent = `${Math.round(percent)}%`;
  }
}

function jumpToParagraph(index) {
  if (!state.book) {
    return;
  }
  stopSpeech({ silent: true });
  const paragraphs = getCurrentParagraphs();
  state.currentParagraphIndex = clamp(index, 0, Math.max(0, paragraphs.length - 1));
  state.currentSentenceIndex = state.currentSentenceStarts[state.currentParagraphIndex] ?? 0;
  highlightParagraphAndScroll(state.currentParagraphIndex);
  highlightSentence(state.currentSentenceIndex, { smooth: false });
  updateProgressDisplays();
  updateSpeechProgress();
}

function jumpToSentence(index) {
  state.currentSentenceIndex = clamp(index, 0, Math.max(0, state.renderedSentenceCount - 1));
  const shouldResume = isSpeechActive();
  highlightSentence(state.currentSentenceIndex);
  updateSpeechProgress();
  if (shouldResume) {
    void restartChapterSpeechFromIndex(state.currentSentenceIndex);
  }
}

async function runVoiceSelfTest() {
  if (!("speechSynthesis" in window)) {
    renderSpeechDiagnostics("朗读不可用", "当前浏览器不支持系统朗读。建议改用最新版 Edge、Chrome 或 iPhone 的 Safari。", "error");
    return;
  }

  await waitForVoices();
  const selectedVoice = resolveVoiceForText(SPEECH_SELF_TEST_TEXT, { allowUserPreference: true });
  const utterance = buildSpeechUtterance(SPEECH_SELF_TEST_TEXT, selectedVoice);
  const attemptNonce = ++state.speechAttemptNonce;
  let started = false;

  renderSpeechDiagnostics("开始朗读自检", `将尝试用 ${selectedVoice?.name || "默认声音"} 说一句测试语。`, "warning");
  await resetSpeechEngine();

  const startWatchdog = window.setTimeout(() => {
    if (started || attemptNonce !== state.speechAttemptNonce) {
      return;
    }
    renderSpeechDiagnostics(
      "测试语音没有启动",
      `浏览器没有真正开始发声。优先检查${getPlatformSpeechChecks()}，以及系统是否装好了文字转语音引擎。`,
      "error",
    );
  }, SPEECH_START_TIMEOUT_MS);

  utterance.rate = 1;
  utterance.pitch = 1;
  utterance.volume = 1;
  utterance.onstart = () => {
    started = true;
    window.clearTimeout(startWatchdog);
    renderSpeechDiagnostics(
      "浏览器已开始发声",
      `如果你听到了测试语音，说明网页发声流程正常；如果没听到，优先检查${getPlatformSpeechChecks()}`,
      "success",
    );
  };
  utterance.onend = () => {
    started = true;
    window.clearTimeout(startWatchdog);
    renderSpeechDiagnostics(
      "测试语音已结束",
      `浏览器完成了测试播放。如果整个过程都没声音，问题更可能在设备音量、系统 TTS 或当前浏览器限制。${getPlatformSpeechChecks()}`,
      "warning",
    );
  };
  utterance.onerror = (event) => {
    started = true;
    window.clearTimeout(startWatchdog);
    handleSpeechError(event, "self-test");
  };
  window.speechSynthesis.speak(utterance);
}

function renderJumpButtons(container, totalCount, activeIndex, onJump) {
  container.innerHTML = "";
  if (!totalCount || totalCount <= 1) {
    return;
  }

  buildQuickPoints(totalCount).forEach((point) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "jump-button";
    button.title = formatQuickPointLabel(point, totalCount);
    button.setAttribute("aria-label", button.title);
    button.classList.toggle("active", point === activeIndex);
    button.addEventListener("click", () => onJump(point));
    container.appendChild(button);
  });
}

function highlightParagraphAndScroll(index, options = { smooth: true }) {
  const paragraphs = [...dom.readerBody.querySelectorAll(".reader-paragraph")];
  paragraphs.forEach((paragraph) => {
    paragraph.classList.toggle("active", Number(paragraph.dataset.paragraphIndex) === index);
  });
  const target = paragraphs.find((paragraph) => Number(paragraph.dataset.paragraphIndex) === index);
  if (target) {
    target.scrollIntoView({ behavior: options.smooth ? "smooth" : "auto", block: "nearest" });
  }
}

function highlightSentence(index, options = { smooth: true }) {
  const sentences = [...dom.readerBody.querySelectorAll(".reader-sentence")];
  sentences.forEach((sentence) => {
    sentence.classList.toggle("active", Number(sentence.dataset.sentenceIndex) === index);
  });

  const activeSentence = sentences.find((sentence) => Number(sentence.dataset.sentenceIndex) === index);
  if (activeSentence) {
    const paragraph = activeSentence.closest(".reader-paragraph");
    if (paragraph) {
      state.currentParagraphIndex = Number(paragraph.dataset.paragraphIndex);
      highlightParagraphAndScroll(state.currentParagraphIndex, options);
      updateProgressDisplays();
    }
  }
}

async function startSpeech() {
  if (!state.book) {
    setStatus("请先导入书籍");
    renderSpeechDiagnostics("还没有书", "请先导入一本书，再测试连续朗读。若只是想确认设备是否出声，请点“测试发声”。", "warning");
    return;
  }

  if (!("speechSynthesis" in window)) {
    setStatus("当前浏览器不支持朗读");
    renderSpeechDiagnostics("朗读不可用", "当前浏览器不支持系统朗读。建议改用最新版 Edge、Chrome 或 iPhone 的 Safari。", "error");
    return;
  }

  const sentences = getCurrentSentences();
  if (!sentences.length) {
    setStatus("当前章节没有可朗读内容");
    renderSpeechDiagnostics("当前章节无法朗读", "这一章没有拆出可读句子。请切换到其他章节或重新导入书籍。", "warning");
    return;
  }

  await waitForVoices();

  if (state.paused && (window.speechSynthesis.paused || window.speechSynthesis.speaking)) {
    window.speechSynthesis.resume();
    state.paused = false;
    state.speaking = true;
    dom.speechStateHint.textContent = "朗读已继续";
    renderSpeechDiagnostics("朗读已继续", `浏览器已继续播放。如果仍然没有声音，请检查${getPlatformSpeechChecks()}`, "success");
    return;
  }

  await restartChapterSpeechFromIndex(clamp(state.currentSentenceIndex, 0, sentences.length - 1));
}

async function restartChapterSpeechFromIndex(sentenceIndex) {
  await resetSpeechEngine();
  state.paused = false;
  state.speaking = true;
  speakSentenceAt(sentenceIndex);
}

function speakSentenceAt(sentenceIndex, fallbackTried = false) {
  const sentences = getCurrentSentences();
  if (sentenceIndex >= sentences.length) {
    state.speaking = false;
    state.paused = false;
    dom.speechStateHint.textContent = "本章朗读结束";
    updateSpeechProgress();
    renderSpeechDiagnostics("本章朗读结束", "浏览器已经完整播完本章。如果你完全没听到声音，请重点检查系统媒体音量或标签页静音。", "success");
    return;
  }

  const speechUnit = getSpeechUnitForSentence(sentenceIndex);
  const slicedUnit = speechUnit ? sliceSpeechUnit(speechUnit, sentenceIndex, sentences) : null;
  const speechText = slicedUnit?.text || sentences[sentenceIndex];
  const nextSentenceIndex = slicedUnit?.sentenceIndexes.at(-1) ?? sentenceIndex;
  const sanitizedSpeechText = sanitizeTextForSpeech(speechText);
  if (!sanitizedSpeechText) {
    speakSentenceAt(nextSentenceIndex + 1, fallbackTried);
    return;
  }

  const selectedVoice = resolveVoiceForText(sanitizedSpeechText, {
    allowUserPreference: !fallbackTried,
    forceUserPreference: !fallbackTried,
  });
  const utterance = buildSpeechUtterance(speechText, selectedVoice);
  const attemptNonce = ++state.speechAttemptNonce;
  let started = false;
  const startWatchdog = window.setTimeout(() => {
    if (started || attemptNonce !== state.speechAttemptNonce) {
      return;
    }
    renderSpeechDiagnostics(
      "朗读没有真正启动",
      `浏览器接收了命令，但没有开始发声。常见原因是当前声音不可用，或系统朗读引擎未准备好。${getPlatformSpeechChecks()}`,
      "warning",
    );
  }, SPEECH_START_TIMEOUT_MS);

  utterance.rate = state.rate;
  utterance.pitch = state.pitch;
  utterance.volume = 1;
  utterance.onstart = () => {
    started = true;
    window.clearTimeout(startWatchdog);
    state.currentSentenceIndex = sentenceIndex;
    state.activeUtterance = utterance;
    const snippet = sentences[sentenceIndex].trim().slice(0, 28);
    dom.speechStateHint.textContent = `正在朗读：${snippet}${sentences[sentenceIndex].length > 28 ? "..." : ""}`;
    highlightSentence(state.currentSentenceIndex);
    updateSpeechProgress();
    renderSpeechDiagnostics(
      "浏览器已开始发声",
      `当前使用 ${selectedVoice?.name || "默认声音"}。如果状态显示正在朗读但你还是没听到，请检查${getPlatformSpeechChecks()}`,
      "success",
    );
  };
  utterance.onboundary = (event) => {
    if (typeof event?.charIndex === "number" && slicedUnit?.boundaries?.length) {
      syncSpeechBoundary(slicedUnit.boundaries, event.charIndex);
    }
  };
  utterance.onend = () => {
    started = true;
    window.clearTimeout(startWatchdog);
    if (!state.speaking || state.paused) {
      return;
    }
    state.currentSentenceIndex = nextSentenceIndex + 1;
    updateSpeechProgress();
    speakSentenceAt(nextSentenceIndex + 1, false);
  };
  utterance.onerror = (event) => {
    started = true;
    window.clearTimeout(startWatchdog);
    state.speaking = false;
    state.paused = false;
    dom.speechStateHint.textContent = "语音朗读中断，请重新开始";
    if (!fallbackTried && shouldRetryWithFallbackVoice(event, selectedVoice)) {
      renderSpeechDiagnostics("当前声音不可用，正在切回默认声音", "浏览器拒绝了当前选中的声音，系统正在尝试默认声音。", "warning");
      state.voiceURI = "";
      loadVoices();
      void restartChapterSpeechFromIndex(sentenceIndex);
      return;
    }
    handleSpeechError(event, "chapter");
  };
  window.speechSynthesis.speak(utterance);
}

function togglePause() {
  if (!("speechSynthesis" in window) || (!window.speechSynthesis.speaking && !window.speechSynthesis.paused)) {
    return;
  }
  if (window.speechSynthesis.paused) {
    window.speechSynthesis.resume();
    state.paused = false;
    state.speaking = true;
    dom.speechStateHint.textContent = "朗读已继续";
    renderSpeechDiagnostics("朗读已继续", `如果仍然没有声音，请检查${getPlatformSpeechChecks()}`, "success");
  } else {
    window.speechSynthesis.pause();
    state.paused = true;
    state.speaking = false;
    dom.speechStateHint.textContent = "朗读已暂停";
    renderSpeechDiagnostics("朗读已暂停", "已暂停当前朗读，再次点击“暂停 / 继续”可以恢复。", "warning");
  }
}

function stopSpeech(options = {}) {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  state.speaking = false;
  state.paused = false;
  state.activeUtterance = null;
  updateSpeechProgress();
  if (!options.silent) {
    dom.speechStateHint.textContent = "朗读已停止";
    renderSpeechDiagnostics("朗读已停止", "浏览器已经停止播放。你可以点“测试发声”先排查设备是否出声，再继续整章朗读。", "warning");
  }
}

function splitPlainTextIntoSections(rawText, fallbackName) {
  const normalized = normalizeLineBreaks(rawText);
  const matches = [...normalized.matchAll(CHAPTER_HEADING_RE)];

  if (matches.length >= 2) {
    const sections = [];
    matches.forEach((match, index) => {
      const start = match.index ?? 0;
      const end = index + 1 < matches.length ? matches[index + 1].index ?? normalized.length : normalized.length;
      const heading = cleanHeading(match[0]);
      const content = normalized.slice(start + match[0].length, end).trim();
      if (!content) {
        return;
      }
      sections.push({
        id: `section-${sections.length + 1}`,
        title: heading,
        text: content,
        sourceHint: "按文本标题拆分",
      });
    });
    if (sections.length) {
      return sections;
    }
  }

  return fallbackChunkSections(normalized, stripFileExtension(fallbackName), "按段落长度自动分段");
}

function splitPdfPagesIntoSections(pages, fallbackName) {
  const sections = [];
  let current = null;

  pages.forEach((page, index) => {
    const heading = detectHeadingFromPage(page.text);
    const shouldStartNewSection =
      Boolean(heading) || !current || current.text.length > 2600 || current.pages.length >= 4;

    if (shouldStartNewSection) {
      if (current?.text.trim()) {
        sections.push(createPdfSection(current, sections.length));
      }
      current = {
        title: heading || `PDF 分段 ${sections.length + 1}`,
        text: "",
        pages: [],
      };
    }

    current.pages.push(page);
    current.text = `${current.text}\n\n${page.text}`.trim();

    if (index === pages.length - 1 && current.text.trim()) {
      sections.push(createPdfSection(current, sections.length));
    }
  });

  return sections.length
    ? sections
    : fallbackChunkSections(
        pages.map((page) => page.text).join("\n\n"),
        stripFileExtension(fallbackName),
        "未识别到 PDF 标题，已按文本长度自动分段",
      );
}

function createPdfSection(current, index) {
  const startPage = current.pages[0]?.pageNumber || 1;
  const endPage = current.pages[current.pages.length - 1]?.pageNumber || startPage;
  const ocrCount = current.pages.filter((page) => page.ocrUsed).length;
  return {
    id: `section-${index + 1}`,
    title: cleanHeading(current.title || `PDF 分段 ${index + 1}`),
    text: current.text.trim(),
    sourceHint: `第 ${startPage} - ${endPage} 页${ocrCount ? ` · OCR ${ocrCount} 页` : ""}`,
  };
}

function repairOcrLineBreaks(text) {
  const normalized = removeRepeatedOcrLines(
    normalizeLineBreaks(text)
      .replace(/([A-Za-z])-\s*\n\s*([A-Za-z])/g, "$1$2")
      .replace(/[ \t]+$/gm, "")
      .replace(/[|｜]{2,}/g, " ")
      .replace(/\b([A-Za-z])\s+([,.;:!?])\b/g, "$1$2")
      .replace(/\n\s*(?:第\s*)?\d{1,4}\s*(?:页|page)?\s*\n/gi, "\n")
      .replace(/\n{3,}/g, "\n\n"),
  )
    .replace(/([A-Za-z])-\s*\n\s*([A-Za-z])/g, "$1$2")
    .replace(/\n{3,}/g, "\n\n");
  const blocks = normalized.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);

  return blocks
    .map((block) => mergeWrappedLines(block).join("\n\n"))
    .join("\n\n")
    .replace(/([^\n。！？!?\.])\n(?=[^\n])/g, "$1 ")
    .replace(/[ \t]*([，。！？；：、,.!?;:])[ \t]*/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function removeRepeatedOcrLines(text) {
  const lines = normalizeLineBreaks(text).split("\n");
  const counts = new Map();

  lines.forEach((line) => {
    const key = normalizeOcrLineKey(line);
    if (key) {
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  });

  return lines
    .filter((line, index) => {
      const trimmed = normalizeWhitespace(line);
      if (!trimmed) {
        return true;
      }
      const key = normalizeOcrLineKey(trimmed);
      if (key && counts.get(key) >= 2 && trimmed.length <= 90) {
        return false;
      }
      if (shouldDropOcrNoiseLine(trimmed, index, lines.length)) {
        return false;
      }
      return true;
    })
    .join("\n");
}

function normalizeOcrLineKey(line) {
  const key = normalizeWhitespace(line)
    .toLowerCase()
    .replace(/\d+/g, "#")
    .replace(/[^a-z#\u4e00-\u9fa5]+/g, "");
  return key.length >= 8 ? key : "";
}

function shouldDropOcrNoiseLine(line, index, totalLines) {
  const trimmed = normalizeWhitespace(line);
  if (!trimmed) {
    return false;
  }
  if (OCR_NOISE_LINE_RE.test(trimmed)) {
    return true;
  }
  const meaningful = countMeaningfulCharacters(trimmed);
  const compactLength = trimmed.replace(/\s/g, "").length || 1;
  const symbolRatio = (trimmed.match(/[^\sA-Za-z0-9\u4e00-\u9fa5，。！？；：、,.!?;:'"“”‘’\-/#]/g) || []).length / compactLength;
  const nearPageEdge = index <= 2 || index >= totalLines - 3;
  return (nearPageEdge && trimmed.length <= 8 && meaningful <= 4) || (symbolRatio > 0.5 && meaningful <= 6);
}

function fallbackChunkSections(text, titleSeed, sourceHint) {
  const paragraphs = splitIntoParagraphs(text);
  const chunks = [];
  let bucket = [];
  let length = 0;

  paragraphs.forEach((paragraph) => {
    const nextLength = length + paragraph.length;
    if (bucket.length && nextLength > KEEP_SECTION_TARGET_CHARS) {
      chunks.push(bucket.join("\n\n"));
      bucket = [paragraph];
      length = paragraph.length;
      return;
    }
    bucket.push(paragraph);
    length = nextLength;
  });

  if (bucket.length) {
    chunks.push(bucket.join("\n\n"));
  }

  return chunks.map((chunk, index) => ({
    id: `section-${index + 1}`,
    title: `${titleSeed} · 分段 ${index + 1}`,
    text: chunk,
    sourceHint,
  }));
}

function detectHeadingFromPage(text) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 10);

  return lines.find((line) =>
    /^(chapter|part)\s+\d+|^第[一二三四五六七八九十百千万0-9]+[章节卷部篇回]|^(序章|序言|前言|引言|后记|尾声|番外)/i.test(line),
  );
}

function pdfTextItemsToString(items) {
  const normalizedItems = items
    .map((item) => ({
      text: item.str || "",
      x: item.transform?.[4] || 0,
      y: item.transform?.[5] || 0,
    }))
    .filter((item) => item.text.trim());

  normalizedItems.sort((left, right) => {
    if (Math.abs(left.y - right.y) > 2) {
      return right.y - left.y;
    }
    return left.x - right.x;
  });

  let currentY = null;
  let line = [];
  const lines = [];

  normalizedItems.forEach((item) => {
    if (currentY === null || Math.abs(item.y - currentY) <= 2.5) {
      line.push(item.text);
      currentY = currentY === null ? item.y : currentY;
      return;
    }

    lines.push(line.join(" "));
    line = [item.text];
    currentY = item.y;
  });

  if (line.length) {
    lines.push(line.join(" "));
  }

  return lines.join("\n");
}

function flattenToc(toc, collector = []) {
  if (!Array.isArray(toc)) {
    return collector;
  }
  toc.forEach((entry) => {
    collector.push(entry);
    if (entry.subitems?.length) {
      flattenToc(entry.subitems, collector);
    }
  });
  return collector;
}

function htmlToPlainText(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script,style,noscript").forEach((element) => element.remove());
  doc.querySelectorAll("br").forEach((element) => element.replaceWith("\n"));
  doc.querySelectorAll("p,div,section,article,li,h1,h2,h3,h4,h5,h6,blockquote").forEach((element) => {
    element.appendChild(doc.createTextNode("\n"));
  });
  return doc.body?.textContent || "";
}

function splitIntoParagraphs(text) {
  const blocks = buildParagraphBlocks(text);
  if (!blocks.length) {
    return [];
  }

  const paragraphs = [];

  blocks.forEach((block) => {
    const sentences = splitIntoSentences(block);
    if (!sentences.length) {
      paragraphs.push(block);
      return;
    }

    let bucket = "";
    sentences.forEach((sentence) => {
      const cleanSentence = normalizeWhitespace(sentence);
      if (!cleanSentence) {
        return;
      }

      if (!bucket) {
        bucket = cleanSentence;
        return;
      }

      const merged = `${bucket}${joinSentences(bucket, cleanSentence)}${cleanSentence}`.trim();
      const shouldKeepMerging =
        bucket.length < MIN_PARAGRAPH_CHARS ||
        cleanSentence.length < 16 ||
        merged.length <= IDEAL_PARAGRAPH_CHARS ||
        !hasStrongSentenceEnding(bucket);

      if (shouldKeepMerging && merged.length <= MAX_PARAGRAPH_CHARS) {
        bucket = merged;
        return;
      }

      paragraphs.push(bucket);
      bucket = cleanSentence;
    });

    if (bucket) {
      paragraphs.push(bucket);
    }
  });

  return mergeTinyParagraphs(paragraphs);
}

function splitIntoSentences(text) {
  const normalized = normalizeReadableText(text).replace(/\n+/g, " ");
  if (!normalized) {
    return [];
  }

  const segmented = segmentWithIntl(normalized);
  if (segmented.length) {
    return mergeUnsafeSentenceFragments(segmented);
  }

  const sentences = [];
  let buffer = "";

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    buffer += char;
    if (isSentenceBoundary(buffer, normalized.slice(index + 1))) {
      const sentence = normalizeWhitespace(buffer);
      if (sentence) {
        sentences.push(sentence);
      }
      buffer = "";
    }
  }

  const tail = normalizeWhitespace(buffer);
  if (tail) {
    sentences.push(tail);
  }

  return mergeUnsafeSentenceFragments(sentences);
}

function buildParagraphBlocks(text) {
  const normalized = cleanDisplayText(text);

  if (!normalized) {
    return [];
  }

  return normalized
    .split(/\n{2,}/)
    .map((block) => mergeWrappedLines(block))
    .flat()
    .map((block) => cleanDisplayText(block))
    .filter(Boolean);
}

function mergeWrappedLines(block) {
  const lines = block
    .split("\n")
    .map((line) => cleanDisplayText(line))
    .filter(Boolean);
  if (!lines.length) {
    return [];
  }

  const wrappedMode = looksLikeWrappedTextBlock(lines);
  const merged = [];
  lines.forEach((line) => {
    if (!merged.length) {
      merged.push(line);
      return;
    }

    const previous = merged[merged.length - 1];
    if (shouldStartNewParagraph(previous, line, wrappedMode)) {
      merged.push(line);
    } else {
      const cleanedPrevious = previous.replace(/-\s*$/, "");
      merged[merged.length - 1] = `${cleanedPrevious}${joinSentences(cleanedPrevious, line)}${line}`.trim();
    }
  });

  return merged;
}

function looksLikeWrappedTextBlock(lines) {
  if (lines.length < 3) {
    return false;
  }

  const averageLength = lines.reduce((sum, line) => sum + line.length, 0) / Math.max(lines.length, 1);
  const shortLineCount = lines.filter((line) => line.length <= WRAPPED_BLOCK_SHORT_LINE).length;
  const softEndingCount = lines.filter((line) => !hasStrongSentenceEnding(line)).length;

  return (
    averageLength <= WRAPPED_BLOCK_AVERAGE_LINE ||
    shortLineCount >= Math.ceil(lines.length * 0.6) ||
    softEndingCount >= Math.ceil(lines.length * 0.5)
  );
}

function shouldStartNewParagraph(previous, next, wrappedMode) {
  if (!previous || !next) {
    return true;
  }
  if (looksLikeStandaloneParagraph(previous) || looksLikeStandaloneParagraph(next) || looksLikeHardParagraphBreak(next)) {
    return true;
  }
  if (!wrappedMode) {
    if (!hasStrongSentenceEnding(previous)) {
      return false;
    }
    if (previous.length < 26 || next.length < 22) {
      return false;
    }
    return !(/[A-Za-z0-9]$/.test(previous) && /^[a-z0-9]/.test(next));
  }

  if (!hasStrongSentenceEnding(previous)) {
    return false;
  }
  if (previous.length >= MAX_PARAGRAPH_CHARS) {
    return true;
  }
  return previous.length >= IDEAL_PARAGRAPH_CHARS + 24 && next.length >= MIN_PARAGRAPH_CHARS;
}

function looksLikeHardParagraphBreak(text) {
  const trimmed = (text || "").trim();
  return (
    !trimmed ||
    isShortHeadingLine(trimmed) ||
    /^(?:[-*•●▪◦]|(?:\d+|[A-Za-z])[.)、])\s+/.test(trimmed) ||
    /^(?:(?:附录|摘要|结论|讨论|方法|结果|引言|致谢)(?:[:：\s]|$)|(?:appendix|abstract|introduction|methods?|results?|discussion|conclusion)\b)/i.test(trimmed)
  );
}

function isShortHeadingLine(text) {
  const trimmed = (text || "").trim();
  return Boolean(trimmed) && trimmed.length <= 42 && (HEADING_LINE_RE.test(trimmed) || /^[A-Z][A-Z\s:&/-]{3,}$/.test(trimmed));
}

function isSentenceBoundary(currentText, remainingText) {
  const char = (currentText || "").at(-1) || "";
  if (/[。！？!?…；;]/.test(char)) {
    return true;
  }
  if (char !== ".") {
    return false;
  }
  if (shouldKeepPeriodInsideSentence(currentText, remainingText)) {
    return false;
  }
  const next = (remainingText || "").trimStart();
  return !next || /^[“”"‘’'(\[]?[A-Z0-9\u4e00-\u9fa5]/.test(next);
}

function shouldKeepPeriodInsideSentence(currentText, remainingText) {
  const previous = normalizeWhitespace(currentText || "");
  const next = (remainingText || "").trimStart();
  if (!previous || !next) {
    return false;
  }
  if (NON_BREAKING_ABBR_RE.test(previous) || INITIALISM_END_RE.test(previous)) {
    return true;
  }
  if (/\d\.$/.test(previous) && /^\d/.test(next)) {
    return true;
  }
  if (/\b(?:ID|No|Ref|MRN|DOB|Tel|Fax|Vol)\s*[:#-]?\s*[A-Z0-9-]*\.$/i.test(previous)) {
    return true;
  }
  if (/\b[A-Za-z]{1,3}\.$/.test(previous) && /^[a-z]/.test(next)) {
    return true;
  }
  return false;
}

function mergeUnsafeSentenceFragments(sentences) {
  const merged = [];

  sentences
    .map((sentence) => normalizeWhitespace(sentence))
    .filter(Boolean)
    .forEach((sentence) => {
      if (!merged.length) {
        merged.push(sentence);
        return;
      }

      const previous = merged[merged.length - 1];
      if (shouldMergeSentenceFragment(previous, sentence)) {
        merged[merged.length - 1] = `${previous}${joinSentences(previous, sentence)}${sentence}`.trim();
        return;
      }

      merged.push(sentence);
    });

  return merged;
}

function shouldMergeSentenceFragment(previous, next) {
  const prev = normalizeWhitespace(previous || "");
  const upcoming = normalizeWhitespace(next || "");
  if (!prev || !upcoming) {
    return false;
  }
  if (shouldKeepPeriodInsideSentence(prev, upcoming)) {
    return true;
  }
  if (!hasStrongSentenceEnding(prev)) {
    return true;
  }
  if (prev.length < OCR_SHORT_FRAGMENT_CHARS && !looksLikeStandaloneParagraph(prev)) {
    return true;
  }
  if (/^[a-z,;:)\]]/.test(upcoming)) {
    return true;
  }
  return false;
}

function mergeTinyParagraphs(paragraphs) {
  const merged = [];

  paragraphs
    .map((paragraph) => cleanDisplayText(paragraph))
    .filter(Boolean)
    .forEach((paragraph) => {
      if (!merged.length) {
        merged.push(paragraph);
        return;
      }

      const previous = merged[merged.length - 1];
      const shouldMerge =
        paragraph.length < MIN_PARAGRAPH_CHARS &&
        previous.length < MAX_PARAGRAPH_CHARS &&
        !looksLikeStandaloneParagraph(paragraph);

      if (shouldMerge) {
        merged[merged.length - 1] = `${previous}${joinSentences(previous, paragraph)}${paragraph}`.trim();
        return;
      }

      merged.push(paragraph);
    });

  return merged;
}

function looksLikeStandaloneParagraph(text) {
  return (
    /[:：]\s*\S+$/.test(text) ||
    /^https?:\/\//i.test(text) ||
    /^\S+@\S+\.\S+$/.test(text) ||
    /^\[?\d{1,3}\]?$/.test(text) ||
    REFERENCE_HEADING_RE.test(text.trim())
  );
}

function segmentWithIntl(text) {
  if (!window.Intl?.Segmenter) {
    return [];
  }

  try {
    const locale = detectSpeechLang(text);
    const segmenter = new Intl.Segmenter(locale, { granularity: "sentence" });
    return [...segmenter.segment(text)]
      .map((item) => normalizeWhitespace(item.segment || ""))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function getCurrentSection() {
  return state.book.sections[state.currentSectionIndex];
}

function getCurrentParagraphs() {
  return getParagraphsFromSection(getCurrentSection());
}

function getParagraphsFromSection(section) {
  if (!section) {
    return [];
  }
  if (Array.isArray(section.paragraphs) && section.paragraphs.length) {
    return section.paragraphs.slice();
  }
  const paragraphs = splitIntoParagraphs(section.text);
  if (paragraphs.length) {
    section.paragraphs = paragraphs.slice();
    section.paragraphCount = paragraphs.length;
    return paragraphs;
  }
  return [normalizeWhitespace(section.text)].filter(Boolean);
}

function getCurrentSentences() {
  return [...dom.readerBody.querySelectorAll(".reader-sentence")].map((sentence) => sentence.textContent || "");
}

function findNextReadableSectionIndex(startIndex) {
  if (!state.book?.sections?.length) {
    return -1;
  }

  for (let index = startIndex; index < state.book.sections.length; index += 1) {
    const section = state.book.sections[index];
    const paragraphs = getParagraphsFromSection(section);
    const hasReadableSentences = paragraphs.some((paragraph) => splitIntoSentences(paragraph).some(Boolean));
    if (hasReadableSentences) {
      return index;
    }
  }

  return -1;
}

function buildSpeechUnits(sentences) {
  const units = [];
  let current = null;

  sentences.forEach((sentence, sentenceIndex) => {
    const cleanSentence = normalizeWhitespace(sentence);
    if (!cleanSentence) {
      return;
    }

    const lang = detectSpeechLang(cleanSentence);
    const shouldStartNew =
      !current ||
      lang !== current.lang ||
      current.text.length >= SPEECH_UNIT_MAX_CHARS ||
      (current.text.length >= SPEECH_UNIT_IDEAL_CHARS && hasStrongSentenceEnding(current.text));

    if (shouldStartNew) {
      if (current) {
        units.push(current);
      }
      current = {
        lang,
        text: cleanSentence,
        sentenceIndexes: [sentenceIndex],
      };
      return;
    }

    current.text = `${current.text}${joinSentences(current.text, cleanSentence)}${cleanSentence}`.trim();
    current.sentenceIndexes.push(sentenceIndex);
  });

  if (current) {
    units.push(current);
  }

  return units;
}

function getSpeechUnitForSentence(sentenceIndex) {
  return state.speechUnits.find((unit) => unit.sentenceIndexes.includes(sentenceIndex)) || null;
}

function sliceSpeechUnit(unit, startSentenceIndex, sentences) {
  const startOffset = unit.sentenceIndexes.indexOf(startSentenceIndex);
  const sentenceIndexes = startOffset >= 0 ? unit.sentenceIndexes.slice(startOffset) : unit.sentenceIndexes.slice();
  let text = "";
  const boundaries = [];

  sentenceIndexes.forEach((index) => {
    const sentenceText = normalizeWhitespace(sentences[index] || "");
    if (!sentenceText) {
      return;
    }
    const joiner = text ? joinSentences(text, sentenceText) : "";
    text += joiner;
    boundaries.push({
      sentenceIndex: index,
      start: text.length,
    });
    text += sentenceText;
  });

  return {
    text: text.trim(),
    sentenceIndexes,
    boundaries,
  };
}

function syncSpeechBoundary(boundaries, charIndex) {
  if (!boundaries.length) {
    return;
  }

  let activeSentenceIndex = boundaries[0].sentenceIndex;
  boundaries.forEach((boundary) => {
    if (charIndex >= boundary.start) {
      activeSentenceIndex = boundary.sentenceIndex;
    }
  });

  if (activeSentenceIndex !== state.currentSentenceIndex) {
    state.currentSentenceIndex = activeSentenceIndex;
    highlightSentence(state.currentSentenceIndex, { smooth: false });
    updateSpeechProgress();
  }
}

function buildQuickPoints(totalCount) {
  const points = new Set();
  if (totalCount <= QUICK_POINT_COUNT) {
    for (let index = 0; index < totalCount; index += 1) {
      points.add(index);
    }
    return [...points];
  }

  for (let slot = 0; slot < QUICK_POINT_COUNT; slot += 1) {
    const point = Math.round((slot / (QUICK_POINT_COUNT - 1)) * (totalCount - 1));
    points.add(point);
  }
  return [...points];
}

function formatQuickPointLabel(point, totalCount) {
  if (point === 0) {
    return `开头 1/${totalCount}`;
  }
  if (point === totalCount - 1) {
    return `结尾 ${totalCount}/${totalCount}`;
  }
  const percent = Math.round((point / Math.max(1, totalCount - 1)) * 100);
  return `${percent}% · ${point + 1}/${totalCount}`;
}

function shouldRunOcr(text) {
  if (state.ocrMode === "off") {
    return false;
  }
  if (state.ocrMode === "always") {
    return true;
  }
  return countMeaningfulCharacters(text) < OCR_MIN_MEANINGFUL_CHARS || looksLikeLowQualityPdfText(text);
}

function countMeaningfulCharacters(text) {
  const matches = text.match(/[A-Za-z0-9\u4e00-\u9fa5]/g);
  return matches?.length || 0;
}

function looksLikeLowQualityPdfText(text) {
  const normalized = normalizeWhitespace(text || "");
  if (!normalized) {
    return true;
  }

  const compact = normalized.replace(/\s/g, "");
  const meaningful = countMeaningfulCharacters(normalized);
  const symbolRatio = (compact.match(/[^\w\u4e00-\u9fa5，。！？；：、,.!?;:'"“”‘’\-]/g) || []).length / Math.max(1, compact.length);
  const lines = normalizeLineBreaks(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const tinyLineRatio = lines.filter((line) => countMeaningfulCharacters(line) <= 2).length / Math.max(1, lines.length);
  const averageLineLength = lines.reduce((sum, line) => sum + line.length, 0) / Math.max(1, lines.length);
  const mojibakeSignal = /[�□■◆◇�]{2,}|(?:[ÃÂæçèé]\S*){3,}/.test(normalized);

  return (
    mojibakeSignal ||
    (compact.length >= 30 && meaningful / compact.length < 0.45) ||
    symbolRatio > OCR_SYMBOL_RATIO_LIMIT ||
    (lines.length >= 8 && tinyLineRatio > 0.45) ||
    (lines.length >= 12 && averageLineLength < 5)
  );
}

function isSpeechActive() {
  return ("speechSynthesis" in window && (window.speechSynthesis.speaking || window.speechSynthesis.paused)) || state.speaking || state.paused;
}

function normalizeReadableText(text) {
  return normalizeLineBreaks(text)
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function stripReferenceArtifacts(text) {
  return normalizeLineBreaks(text)
    .replace(LONE_NUMBER_LINE_RE, "\n")
    .replace(LEADING_REFERENCE_RE, "$1")
    .replace(BRACKET_REFERENCE_RE, "")
    .replace(SIMPLE_PAREN_REFERENCE_RE, "")
    .replace(INLINE_CJK_REFERENCE_RE, "")
    .replace(INLINE_END_REFERENCE_RE, "")
    .replace(SUPERSCRIPT_REFERENCE_RE, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanDisplayText(text) {
  return normalizeReadableText(stripReferenceArtifacts(text));
}

function sanitizeTextForSpeech(text) {
  return cleanDisplayText(text)
    .replace(REFERENCE_SECTION_RE, "")
    .replace(SIMPLE_PAREN_REFERENCE_RE, "")
    .replace(SPEECH_FILTER_RE, (match) => (/[—–―]+|\.{3,}|…+/.test(match) ? "，" : ""))
    .replace(INLINE_SYMBOL_RE, "")
    .replace(/(^|\s)(?:\d{1,2}|[\[(（【]\d{1,3}[\])）】])(?=(?:\s|$))/g, "$1")
    .replace(INLINE_END_REFERENCE_RE, "")
    .replace(SUPERSCRIPT_REFERENCE_RE, "")
    .replace(/[;；:：/\\]+/g, "，")
    .replace(/，{2,}/g, "，")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function hasStrongSentenceEnding(text) {
  return /[。！？!?…]["”’')\]]*$/.test(text.trim());
}

function joinSentences(previous, next) {
  return shouldInsertSpaceBetween(previous, next) ? " " : "";
}

function shouldInsertSpaceBetween(previous, next) {
  const left = (previous || "").trim();
  const right = (next || "").trim();
  if (!left || !right || !/^[A-Za-z0-9]/.test(right)) {
    return false;
  }
  return /[A-Za-z0-9](?:[.!?;:,]["”’')\]]*)?$/.test(left);
}

function getVoiceBucket(lang) {
  const normalized = (lang || "").trim().toLowerCase().replace(/_/g, "-");
  if (
    normalized.startsWith("zh-cn") ||
    normalized.startsWith("zh-sg") ||
    normalized.startsWith("zh-hans") ||
    normalized.startsWith("cmn-hans")
  ) {
    return "zh-cn";
  }
  if (
    normalized.startsWith("zh-tw") ||
    normalized.startsWith("zh-hk") ||
    normalized.startsWith("zh-mo") ||
    normalized.startsWith("zh-hant") ||
    normalized.startsWith("cmn-hant")
  ) {
    return "zh-tw";
  }
  if (normalized.startsWith("en-us")) {
    return "en-us";
  }
  if (normalized.startsWith("en-gb")) {
    return "en-gb";
  }
  if (normalized.startsWith("en-")) {
    return "en-global";
  }
  return normalized;
}

function getVoiceBase(lang) {
  return getVoiceBucket(lang).split("-")[0];
}

function normalizeVoiceNameKey(name) {
  return (name || "")
    .toLowerCase()
    .replace(/\(natural\)|online|offline|multilingual|neural/g, "")
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "");
}

function getUserSelectedVoice(voices) {
  if (!state.voiceURI || state.voiceURI === DEFAULT_VOICE_URI) {
    return null;
  }
  return voices.find((voice) => voice.voiceURI === state.voiceURI) || null;
}

function isDefaultVoiceSelected() {
  return !state.voiceURI || state.voiceURI === DEFAULT_VOICE_URI;
}

function filterPreferredVoices(voices) {
  const sorted = voices.slice().sort((left, right) => scoreVoice(right) - scoreVoice(left) || `${left.lang}-${left.name}`.localeCompare(`${right.lang}-${right.name}`));
  const counts = new Map();
  const dedupe = new Set();
  const picked = [];
  const selectedVoice = getUserSelectedVoice(sorted);

  if (sorted.length <= MAX_VISIBLE_VOICES) {
    const visibleVoices = [];
    sorted.forEach((voice) => {
      const bucket = getVoiceBucket(voice.lang);
      const dedupeKey = `${bucket}:${normalizeVoiceNameKey(voice.name)}`;
      if (!bucket || dedupe.has(dedupeKey)) {
        return;
      }
      dedupe.add(dedupeKey);
      visibleVoices.push(voice);
    });
    return visibleVoices;
  }

  const tryPick = (voice, limit) => {
    const bucket = getVoiceBucket(voice.lang);
    const currentCount = counts.get(bucket) || 0;
    const dedupeKey = `${bucket}:${normalizeVoiceNameKey(voice.name)}`;
    if (!bucket || dedupe.has(dedupeKey) || currentCount >= limit || picked.length >= MAX_VISIBLE_VOICES) {
      return false;
    }
    counts.set(bucket, currentCount + 1);
    dedupe.add(dedupeKey);
    picked.push(voice);
    return true;
  };

  if (selectedVoice) {
    const bucket = getVoiceBucket(selectedVoice.lang);
    tryPick(selectedVoice, CORE_VOICE_LIMITS.get(bucket) || 1);
  }

  PRIORITY_VOICE_BUCKETS.forEach((bucket) => {
    const limit = CORE_VOICE_LIMITS.get(bucket) || 1;
    sorted.forEach((voice) => {
      if (getVoiceBucket(voice.lang) === bucket) {
        tryPick(voice, limit);
      }
    });
  });

  sorted.forEach((voice) => {
    if (picked.length >= Math.min(MAX_VISIBLE_VOICES, PRIORITY_VOICE_BUCKETS.length + EXTRA_VOICE_LIMIT)) {
      return;
    }
    const bucket = getVoiceBucket(voice.lang);
    tryPick(voice, CORE_VOICE_LIMITS.get(bucket) || 1);
  });

  if (!picked.length) {
    return sorted.slice(0, 8);
  }

  return picked;
}

function scoreVoice(voice) {
  const lang = getVoiceBucket(voice.lang);
  const name = (voice.name || "").toLowerCase();
  let score = 0;

  const priorityIndex = PRIORITY_VOICE_BUCKETS.indexOf(lang);
  if (priorityIndex >= 0) {
    score += 130 - priorityIndex * 8;
  } else if (getVoiceBase(lang) === getVoiceBase(navigator.language || "zh-CN")) {
    score += 32;
  }

  if (voice.default) {
    score += 18;
  }
  if (voice.localService) {
    score += 10;
  }
  if (isBridgeVoice(voice)) {
    score += 26;
  }
  if (lang === "zh-cn" && PREFERRED_ZH_CN_VOICE_NAMES.some((keyword) => name.includes(keyword))) {
    score += 40;
  }
  if (lang.startsWith("en-") && PREFERRED_EN_VOICE_NAMES.some((keyword) => name.includes(keyword))) {
    score += 22;
  }
  if (name.includes("natural")) {
    score += 8;
  }
  if (name.includes("neural")) {
    score += 6;
  }

  return score;
}

function formatVoiceOptionLabel(voice) {
  const bucket = getVoiceBucket(voice.lang);
  const bucketLabel =
    {
      "zh-cn": "中文简体",
      "zh-tw": "中文繁体",
      "en-us": "English US",
      "en-gb": "English UK",
      "en-global": "English",
      "ja-jp": "日本語",
      "ko-kr": "한국어",
      "fr-fr": "Français",
      "de-de": "Deutsch",
      "es-es": "Español",
      "it-it": "Italiano",
    }[bucket] || (voice.lang || "其他语音");
  const cleanName = cleanVoiceDisplayName(voice.name);
  return `${bucketLabel} · ${cleanName}${voice.default ? " · 默认" : ""}`;
}

function pickPreferredDefaultVoice(voices) {
  return (
    voices.find((voice) => {
      const lang = getVoiceBucket(voice.lang);
      const name = (voice.name || "").toLowerCase();
      return lang === "zh-cn" && PREFERRED_ZH_CN_VOICE_NAMES.some((keyword) => name.includes(keyword));
    }) ||
    voices.find((voice) => getVoiceBucket(voice.lang) === "zh-cn") ||
    null
  );
}

function buildSpeechUtterance(text, voice) {
  const speechText = sanitizeTextForSpeech(text);
  const utterance = new SpeechSynthesisUtterance(speechText);
  if (voice && voice.voiceURI !== DEFAULT_VOICE_URI) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  } else {
    utterance.lang = detectSpeechLang(speechText);
  }
  return utterance;
}

function resolveVoiceForText(text, options = {}) {
  const voices = state.allVoices.length
    ? state.allVoices
    : state.voices.length
      ? state.voices
      : "speechSynthesis" in window
        ? window.speechSynthesis.getVoices()
        : [];
  if (!voices.length || isDefaultVoiceSelected()) {
    return null;
  }

  const targetLang = detectSpeechLang(text);
  const selectedVoice = options.allowUserPreference === false ? null : getUserSelectedVoice(voices);

  if (selectedVoice) {
    if (options.forceUserPreference) {
      return selectedVoice;
    }
    const selectedBucket = getVoiceBucket(selectedVoice.lang);
    const targetBucket = getVoiceBucket(targetLang);
    if (!targetBucket || !selectedBucket || getVoiceBase(selectedBucket) === getVoiceBase(targetBucket)) {
      return selectedVoice;
    }
  }

  return pickBestVoice(voices, targetLang) || selectedVoice || voices[0];
}

function resolveFallbackVoiceForFailure(failedVoice, speechText) {
  const voices = state.allVoices.length ? state.allVoices : state.voices;
  if (!voices.length) {
    return null;
  }

  const failedURI = failedVoice?.voiceURI || "";
  const failedBucket = getVoiceBucket(failedVoice?.lang);
  const targetLang = detectSpeechLang(speechText);
  const candidates = voices.filter((voice) => voice.voiceURI !== failedURI);
  const sameBucketBridge = candidates.find((voice) => getVoiceBucket(voice.lang) === failedBucket && isBridgeVoice(voice));
  const sameBucket = candidates.find((voice) => getVoiceBucket(voice.lang) === failedBucket);
  const best = pickBestVoice(candidates, targetLang);

  return (
    (sameBucketBridge && { voice: sameBucketBridge, reason: "同语种 Windows 声线" }) ||
    (sameBucket && { voice: sameBucket, reason: "同语种备用声线" }) ||
    (best && { voice: best, reason: "默认可用声线" }) ||
    null
  );
}

function pickBestVoice(voices, targetLang) {
  if (!voices.length) {
    return null;
  }

  const normalized = getVoiceBucket(targetLang || navigator.language || "zh-CN");
  const base = normalized.split("-")[0];
  return (
    (normalized === "zh-cn" ? pickPreferredDefaultVoice(voices) : null) ||
    voices.find((voice) => voice.default && getVoiceBucket(voice.lang) === normalized) ||
    voices.find((voice) => getVoiceBucket(voice.lang) === normalized) ||
    voices.find((voice) => voice.default && getVoiceBucket(voice.lang).startsWith(base)) ||
    voices.find((voice) => getVoiceBucket(voice.lang).startsWith(base)) ||
    voices.find((voice) => voice.default) ||
    voices[0]
  );
}

async function waitForVoices(timeoutMs = 1800) {
  if (!("speechSynthesis" in window)) {
    return [];
  }

  const current = window.speechSynthesis.getVoices();
  if (current.length) {
    state.allVoices = current.slice();
    loadVoices();
    return current;
  }

  return await new Promise((resolve) => {
    let resolved = false;
    const finish = () => {
      if (resolved) {
        return;
      }
      resolved = true;
      const voices = window.speechSynthesis.getVoices();
      state.allVoices = voices.slice();
      loadVoices();
      resolve(voices);
    };

    const pollTimer = window.setInterval(() => {
      if (window.speechSynthesis.getVoices().length) {
        window.clearInterval(pollTimer);
        window.clearTimeout(timeoutTimer);
        finish();
      }
    }, 200);

    const timeoutTimer = window.setTimeout(() => {
      window.clearInterval(pollTimer);
      finish();
    }, timeoutMs);

    if (typeof window.speechSynthesis.addEventListener === "function") {
      window.speechSynthesis.addEventListener(
        "voiceschanged",
        () => {
          window.clearInterval(pollTimer);
          window.clearTimeout(timeoutTimer);
          finish();
        },
        { once: true },
      );
    }
  });
}

async function resetSpeechEngine() {
  if (!("speechSynthesis" in window)) {
    return;
  }
  try {
    window.speechSynthesis.resume();
  } catch {
    // Ignore resume failures.
  }
  if (window.speechSynthesis.speaking || window.speechSynthesis.pending || window.speechSynthesis.paused) {
    window.speechSynthesis.cancel();
    await new Promise((resolve) => window.setTimeout(resolve, SPEECH_RESET_DELAY_MS));
  }
}

function detectSpeechLang(text) {
  const normalized = text || "";
  const japaneseCount = (normalized.match(/[ぁ-ゟ゠-ヿ]/g) || []).length;
  const koreanCount = (normalized.match(/[가-힣]/g) || []).length;
  const cyrillicCount = (normalized.match(/[А-Яа-яЁё]/g) || []).length;
  const chineseCount = (normalized.match(/[\u4e00-\u9fa5]/g) || []).length;
  const latinCount = (normalized.match(/[A-Za-z]/g) || []).length;
  if (japaneseCount > 0) {
    return "ja-JP";
  }
  if (koreanCount > 0) {
    return "ko-KR";
  }
  if (cyrillicCount > 0) {
    return "ru-RU";
  }
  if (chineseCount > 0 && (latinCount === 0 || chineseCount * 4 >= latinCount)) {
    return /zh-(TW|HK|MO)/i.test(navigator.language || "") ? "zh-TW" : "zh-CN";
  }
  if (latinCount > 0) {
    return /en-GB/i.test(navigator.language || "") ? "en-GB" : "en-US";
  }
  return navigator.language || "zh-CN";
}

function shouldRetryWithFallbackVoice(event, selectedVoice) {
  const errorCode = event?.error || "";
  if (!selectedVoice || !state.voiceURI || selectedVoice.default) {
    return false;
  }
  return ["voice-unavailable", "language-unavailable", "synthesis-unavailable"].includes(errorCode);
}

function handleSpeechError(event, source) {
  const details = describeSpeechError(event?.error || "unknown");
  const prefix = source === "self-test" ? "自检失败" : "朗读失败";
  renderSpeechDiagnostics(`${prefix}：${details.title}`, details.message, details.state);
}

function describeSpeechError(errorCode) {
  const platformChecks = getPlatformSpeechChecks();
  const table = {
    "not-allowed": {
      title: "浏览器拦截了发声",
      message: `通常是浏览器不允许当前页面直接发声。请在一次真实点击后再试，并确认标签页没有静音。${platformChecks}`,
      state: "error",
    },
    "voice-unavailable": {
      title: "当前声音不可用",
      message: `当前选中的声音在这台设备上不可用。建议切回默认声音后再试。${platformChecks}`,
      state: "warning",
    },
    "language-unavailable": {
      title: "当前语言没有可用声音",
      message: `设备里没有适合当前语言的声音。可以切换别的声音，或在系统里安装对应语音包。${platformChecks}`,
      state: "warning",
    },
    "audio-busy": {
      title: "音频设备正忙",
      message: `音频输出可能正被别的应用占用。请暂停其他播放器，再试一次。${platformChecks}`,
      state: "warning",
    },
    "audio-hardware": {
      title: "没有可用音频输出",
      message: `浏览器找不到可用的扬声器或耳机。请先确认系统本身能正常播放其他音频。${platformChecks}`,
      state: "error",
    },
    "synthesis-unavailable": {
      title: "系统朗读引擎不可用",
      message: `浏览器存在朗读接口，但底层语音合成引擎当前不可用。Windows 请检查系统语音包，Android 请检查系统文字转语音引擎。${platformChecks}`,
      state: "error",
    },
    network: {
      title: "语音服务需要网络",
      message: `当前朗读引擎可能依赖网络，但网络不可用。请联网后再试，或换成本地声音。${platformChecks}`,
      state: "warning",
    },
    interrupted: {
      title: "朗读被中断",
      message: `当前朗读被其他操作打断了。通常重新点一次“开始朗读”即可恢复。`,
      state: "warning",
    },
    canceled: {
      title: "朗读被取消",
      message: `当前朗读队列已被取消。通常是你切章节、暂停或重新开始时触发的，这不是致命错误。`,
      state: "warning",
    },
    unknown: {
      title: "浏览器没有说明原因",
      message: `页面发声失败，但浏览器没有给出明确原因。优先检查${platformChecks}，再用“测试发声”重试。`,
      state: "error",
    },
  };
  return table[errorCode] || table.unknown;
}

function getPlatformSpeechChecks() {
  const ua = navigator.userAgent || "";
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);

  if (isIOS) {
    return "使用 Safari，且手机静音开关已关闭、媒体音量已打开。";
  }
  if (isAndroid) {
    return "手机媒体音量已开，并在系统设置里启用了“文字转语音(TTS)”引擎。";
  }
  return "浏览器标签页未静音、系统扬声器正常、系统音量和媒体音量都已打开。";
}

function isLikelyInAppBrowser() {
  const ua = (navigator.userAgent || "").toLowerCase();
  return /micromessenger|wechat|qq\/|weibo|line\/|fbav|fban|instagram|messenger|miuibrowser|huaweibrowser/.test(ua);
}

function isLikelyMobileDesktopMode() {
  return Boolean(window.matchMedia?.("(pointer: coarse)").matches && window.innerWidth >= 900);
}

function getVoiceEnvironmentGuidance() {
  const tips = [];
  if (!("speechSynthesis" in window)) {
    tips.push("当前浏览器本身不支持系统朗读。");
  }
  if (isLikelyInAppBrowser()) {
    tips.push("当前很像内置浏览器，它经常不会完整暴露手机系统语音。");
  }
  if (isLikelyMobileDesktopMode()) {
    tips.push("当前像是手机误开了桌面版网站，界面和语音能力都可能异常。");
  }
  if (window.matchMedia?.("(pointer: coarse)").matches) {
    tips.push("手机端只会显示这台手机和当前浏览器自己支持的语音，不会继承电脑上的 Windows 声线。");
  }
  return tips.join("");
}

function getOcrLanguageArgument(languageKey) {
  return languageKey.includes("+") ? languageKey.split("+") : languageKey;
}

function getExtension(fileName) {
  return fileName.split(".").pop()?.toLowerCase() || "";
}

function stripFileExtension(fileName) {
  return fileName.replace(/\.[^.]+$/, "");
}

function cleanHeading(input) {
  return input.replace(/^#+\s*/, "").replace(/\s+/g, " ").trim();
}

function normalizeLineBreaks(text) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function normalizeWhitespace(text) {
  return normalizeLineBreaks(text)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function normalizeHref(href) {
  return (href || "")
    .split("#")[0]
    .replace(/\\/g, "/")
    .replace(/^(\.\/)+/, "")
    .replace(/^\//, "")
    .trim()
    .toLowerCase();
}

function normalizeSectionKey(text) {
  return cleanHeading(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "");
}

function stripLeadingHeadingFromText(text, title) {
  const lines = normalizeLineBreaks(text).split("\n").map((line) => line.trim()).filter(Boolean);
  if (!lines.length) {
    return "";
  }

  const titleKey = normalizeSectionKey(title);
  if (titleKey && normalizeSectionKey(lines[0]) === titleKey) {
    const trimmed = lines.slice(1).join("\n").trim();
    return trimmed || lines[0];
  }

  return text.trim();
}

function normalizeBookSections(sections, options = {}) {
  const prepared = sections.map((section, index) => prepareSectionForReading(section, index)).filter(Boolean);
  const filtered = prepared.filter((section, index, collection) => !shouldDropSection(section, index, collection));
  const candidates = filtered.length ? filtered : prepared;
  const merged = mergeShortSections(candidates, options);

  return merged
    .map((section, index) => finalizeNormalizedSection(section, index, options))
    .filter(Boolean);
}

function prepareSectionForReading(section, index) {
  const rawLines = normalizeLineBreaks(section.text || "")
    .split("\n")
    .map((line) => cleanDisplayText(line))
    .filter(Boolean);
  const text = normalizeSectionBody(section.text || "");
  if (!text) {
    return null;
  }
  return {
    ...section,
    id: section.id || `section-${index + 1}`,
    title: cleanHeading(section.title || `Section ${index + 1}`),
    text,
    rawLines,
  };
}

function normalizeSectionBody(text) {
  const filteredBlocks = buildParagraphBlocks(text).filter((block) => !shouldDropBlock(block));
  if (!filteredBlocks.length) {
    return "";
  }
  return splitIntoParagraphs(filteredBlocks.join("\n\n")).join("\n\n").trim();
}

function shouldDropBlock(block) {
  const trimmed = cleanDisplayText(block);
  if (!trimmed) {
    return true;
  }
  if (PAGE_ARTIFACT_RE.test(trimmed) || REFERENCE_HEADING_RE.test(trimmed.trim())) {
    return true;
  }
  if (trimmed.length <= 96 && BOILERPLATE_LINE_RE.test(trimmed)) {
    return true;
  }
  return isLikelyTocBlock(trimmed);
}

function isLikelyTocBlock(text) {
  const lines = normalizeLineBreaks(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    return false;
  }
  const tocCount = lines.filter((line) => TOC_LINE_RE.test(line)).length;
  return tocCount >= 2 && tocCount >= Math.ceil(lines.length * 0.6);
}

function shouldDropSection(section, index, collection) {
  if (!section.text.trim()) {
    return true;
  }

  const title = section.title || "";
  const rawLines = section.rawLines || [];
  const boilerplateCount = rawLines.filter((line) => line.length <= 120 && BOILERPLATE_LINE_RE.test(line)).length;
  const tocCount = rawLines.filter((line) => TOC_LINE_RE.test(line)).length;
  const mostlyBoilerplate = rawLines.length >= 2 && boilerplateCount >= Math.ceil(rawLines.length * 0.5);
  const mostlyToc = rawLines.length >= 3 && tocCount >= Math.ceil(rawLines.length * 0.55);

  if (mostlyBoilerplate) {
    return true;
  }
  if (BOILERPLATE_TITLE_RE.test(title) && section.text.length < KEEP_SECTION_TARGET_CHARS) {
    return true;
  }
  if (mostlyToc && section.text.length < AGGRESSIVE_SECTION_MERGE_CHARS) {
    return true;
  }
  if (index === 0 && rawLines.length && rawLines.every((line) => BOILERPLATE_LINE_RE.test(line) || TOC_LINE_RE.test(line))) {
    return true;
  }
  return collection.length > 80 && isGenericSectionTitle(title) && section.text.length < SHORT_SECTION_MERGE_CHARS;
}

function mergeShortSections(sections, options = {}) {
  if (!sections.length) {
    return [];
  }

  const aggressive = (options.format === "EPUB" && sections.length > 60) || sections.length > 120;
  const mergeLimit = aggressive ? AGGRESSIVE_SECTION_MERGE_CHARS : SHORT_SECTION_MERGE_CHARS;
  const merged = [];

  sections.forEach((section) => {
    const previous = merged[merged.length - 1];
    const currentShort = section.text.length < mergeLimit;
    const previousShort = previous && previous.text.length < mergeLimit;
    const canSoftMerge =
      previous &&
      (aggressive || isGenericSectionTitle(previous.title) || isGenericSectionTitle(section.title));
    const shouldMerge =
      previous &&
      previous.text.length + section.text.length <= KEEP_SECTION_TARGET_CHARS &&
      (currentShort || previousShort) &&
      canSoftMerge &&
      (aggressive || !(isMajorSectionTitle(previous.title) && isMajorSectionTitle(section.title)));

    if (!shouldMerge) {
      merged.push({ ...section });
      return;
    }

    previous.text = appendSectionText(previous.text, section.text);
    previous.sourceHint = mergeSourceHint(previous.sourceHint, section.sourceHint);
    previous.rawLines = [...(previous.rawLines || []), ...(section.rawLines || [])];
    if (isGenericSectionTitle(previous.title) && !isGenericSectionTitle(section.title)) {
      previous.title = section.title;
    }
  });

  return merged;
}

function finalizeNormalizedSection(section, index, options = {}) {
  const paragraphs = splitIntoParagraphs(section.text);
  const text = paragraphs.join("\n\n").trim();
  if (!text) {
    return null;
  }

  const preview = buildSectionPreview(text);
  return {
    id: `section-${index + 1}`,
    title: resolveSectionTitle(section.title, preview, index, options.fallbackTitle),
    text,
    paragraphs,
    paragraphCount: paragraphs.length || 1,
    preview,
    sourceHint: section.sourceHint || "",
  };
}

function resolveSectionTitle(title, preview, index, fallbackTitle) {
  const cleanedTitle = cleanHeading(title || "");
  if (cleanedTitle && !BOILERPLATE_TITLE_RE.test(cleanedTitle) && !isGenericSectionTitle(cleanedTitle)) {
    return cleanedTitle;
  }
  if (preview) {
    return preview;
  }
  return `${fallbackTitle || "正文"} · ${index + 1}`;
}

function buildSectionPreview(text) {
  const sentence = splitIntoSentences(text)[0] || splitIntoParagraphs(text)[0] || "";
  const normalized = normalizeWhitespace(sentence);
  if (!normalized) {
    return "";
  }
  return normalized.length > SECTION_PREVIEW_CHARS ? `${normalized.slice(0, SECTION_PREVIEW_CHARS).trim()}…` : normalized;
}

function isGenericSectionTitle(title) {
  const normalized = cleanHeading(title || "");
  return !normalized || GENERIC_SECTION_TITLE_RE.test(normalized);
}

function isMajorSectionTitle(title) {
  const normalized = cleanHeading(title || "");
  return Boolean(normalized) && (HEADING_LINE_RE.test(normalized) || /^(?:chapter|part|section)\s+\d+/i.test(normalized));
}

function mergeSourceHint(previous, next) {
  if (!previous) {
    return next || "";
  }
  if (!next || previous === next) {
    return previous;
  }
  return `${previous} · ${next}`;
}

function getSectionParagraphCount(section) {
  return section?.paragraphCount || section?.paragraphs?.length || splitIntoParagraphs(section?.text || "").length || 0;
}

function refreshReaderDashboardMeta(paragraphs = getCurrentParagraphs(), bookPercent = null) {
  if (!state.book) {
    return;
  }

  const totalSections = state.book.sections.length;
  const currentParagraphs = paragraphs.length || 0;
  const safeParagraphCount = Math.max(1, currentParagraphs);
  const currentParagraph = currentParagraphs ? clamp(state.currentParagraphIndex + 1, 1, safeParagraphCount) : 0;
  const percent =
    typeof bookPercent === "number"
      ? bookPercent
      : ((state.currentSectionIndex + (currentParagraphs > 1 ? state.currentParagraphIndex / (currentParagraphs - 1) : 0)) /
          Math.max(1, totalSections)) *
        100;

  dom.chapterSelectLabel.textContent = `第 ${state.currentSectionIndex + 1}/${totalSections} 章 · ${currentParagraphs} 段`;
  dom.sectionLabelPill.textContent = currentParagraphs ? `${currentParagraph}/${safeParagraphCount} 段` : `第 ${state.currentSectionIndex + 1} 章`;
  dom.readerPositionPill.textContent = `${Math.round(percent)}%`;
}

function formatSectionSelectLabel(section, index, totalCount) {
  const prefix = totalCount > 1 ? `第 ${index + 1} 章` : "正文";
  const detail = section.preview && section.preview !== section.title ? ` · ${section.preview}` : "";
  const paragraphCount = getSectionParagraphCount(section);
  return `${prefix} · ${section.title}${detail} · ${paragraphCount} 段`;
}

isMajorSectionTitle = function (title) {
  const normalized = cleanHeading(title || "");
  return Boolean(normalized) && /^(?:chapter|part|section)\s+\d+|^第[\u4e00-\u9fa50-9零一二三四五六七八九十百千万两〇]+[章节卷部篇回]/i.test(normalized);
};

function cleanVoiceDisplayName(name) {
  const original = (name || "Unnamed").trim();
  const cleaned = original
    .replace(/^(?:Microsoft|Google|Apple|Android)\s+/i, "")
    .replace(/\((?:[^)]*(?:simplified|traditional|english|chinese|natural|neural|online|offline|united|kingdom|prc|taiwan)[^)]*)\)/gi, "")
    .replace(/\b(?:Natural|Neural|Online|Offline|Multilingual|Desktop)\b/gi, "")
    .replace(/\s+-\s+(?:Chinese|English|Japanese|Korean|Français|Deutsch|Español|Italiano).*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned || original;
}

function summarizeVoiceBuckets(voices) {
  return voices.reduce(
    (summary, voice) => {
      const bucket = getVoiceBucket(voice.lang);
      if (bucket.startsWith("en-")) {
        summary.english += 1;
      }
      if (bucket.startsWith("zh-")) {
        summary.chinese += 1;
      }
      return summary;
    },
    { chinese: 0, english: 0 },
  );
}

getVoiceBucket = function (lang) {
  const normalized = (lang || "").trim().toLowerCase().replace(/_/g, "-");
  if (
    normalized.startsWith("zh-cn") ||
    normalized.startsWith("zh-sg") ||
    normalized.startsWith("zh-hans") ||
    normalized.startsWith("cmn-hans")
  ) {
    return "zh-cn";
  }
  if (
    normalized.startsWith("zh-tw") ||
    normalized.startsWith("zh-hk") ||
    normalized.startsWith("zh-mo") ||
    normalized.startsWith("zh-hant") ||
    normalized.startsWith("cmn-hant")
  ) {
    return "zh-tw";
  }
  if (normalized.startsWith("en-us")) {
    return "en-us";
  }
  if (normalized.startsWith("en-gb")) {
    return "en-gb";
  }
  if (normalized.startsWith("en-")) {
    return "en-global";
  }
  return normalized;
};

scoreVoice = function (voice) {
  const lang = getVoiceBucket(voice.lang);
  const name = (voice.name || "").toLowerCase();
  let score = 0;

  const priorityIndex = PRIORITY_VOICE_BUCKETS.indexOf(lang);
  if (priorityIndex >= 0) {
    score += 130 - priorityIndex * 8;
  } else if (getVoiceBase(lang) === getVoiceBase(navigator.language || "zh-CN")) {
    score += 32;
  }

  if (voice.default) {
    score += 18;
  }
  if (voice.localService) {
    score += 10;
  }
  if (lang === "zh-cn" && PREFERRED_ZH_CN_VOICE_NAMES.some((keyword) => name.includes(keyword))) {
    score += 40;
  }
  if (lang.startsWith("en-") && PREFERRED_EN_VOICE_NAMES.some((keyword) => name.includes(keyword))) {
    score += 22;
  }
  if (name.includes("natural")) {
    score += 8;
  }
  if (name.includes("neural")) {
    score += 6;
  }

  return score;
};

formatVoiceOptionLabel = function (voice) {
  const bucket = getVoiceBucket(voice.lang);
  const bucketLabel =
    {
      "zh-cn": "中文简体",
      "zh-tw": "中文繁体",
      "en-us": "English US",
      "en-gb": "English UK",
      "en-global": "English",
      "ja-jp": "日本語",
      "ko-kr": "한국어",
      "fr-fr": "Français",
      "de-de": "Deutsch",
      "es-es": "Español",
      "it-it": "Italiano",
    }[bucket] || (voice.lang || "其他语音");
  const cleanName = cleanVoiceDisplayName(voice.name);
  const sourceTag = isBridgeVoice(voice) ? " · Windows稳定" : " · 浏览器";
  return `${bucketLabel} · ${cleanName}${sourceTag}${voice.default ? " · 默认" : ""}`;
};

refreshToneControls = function () {
  const preset = TONE_PRESETS[state.tonePreset] || TONE_PRESETS.dark;
  dom.tonePill.textContent = preset.label;
  dom.toneHelper.textContent = `当前已切换到 ${preset.label}。现在只保留贴近 Windows 风格的浅色和暗色两套配色。`;
  dom.tonePresetButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.tonePreset === state.tonePreset);
  });
};

refreshToneControls();

async function getBrowserVoicesForCatalog(timeoutMs = VOICE_CATALOG_WAIT_MS) {
  if (!("speechSynthesis" in window)) {
    return [];
  }

  const current = window.speechSynthesis.getVoices();
  if (current.length) {
    return current.slice();
  }

  return await new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(window.speechSynthesis.getVoices().slice());
    };
    const timer = window.setTimeout(finish, timeoutMs);
    if (typeof window.speechSynthesis.addEventListener === "function") {
      window.speechSynthesis.addEventListener(
        "voiceschanged",
        () => {
          window.clearTimeout(timer);
          finish();
        },
        { once: true },
      );
      return;
    }
    const previousHandler = window.speechSynthesis.onvoiceschanged;
    window.speechSynthesis.onvoiceschanged = () => {
      window.clearTimeout(timer);
      previousHandler?.();
      finish();
    };
  });
}

loadVoices = async function (options = {}) {
  const previousVoiceURI = state.voiceURI;
  const browserVoices = (await getBrowserVoicesForCatalog())
    .slice()
    .sort((left, right) => scoreVoice(right) - scoreVoice(left) || `${left.lang}-${left.name}`.localeCompare(`${right.lang}-${right.name}`));
  if (browserVoices.length) {
    state.voiceCatalogRetryCount = 0;
    window.clearTimeout(state.voiceCatalogRetryTimer);
  } else if (options.allowRetry !== false && state.voiceCatalogRetryCount < 3) {
    state.voiceCatalogRetryCount += 1;
    window.clearTimeout(state.voiceCatalogRetryTimer);
    state.voiceCatalogRetryTimer = window.setTimeout(() => {
      void loadVoices({ quiet: true, allowRetry: true });
    }, 900 * state.voiceCatalogRetryCount);
  }
  const bridgeVoices = selectBridgeSupplementVoices(browserVoices, await loadBridgeVoices());
  const mergedVoices = mergeVoiceCatalog(browserVoices, bridgeVoices);
  const voices = filterPreferredVoices(mergedVoices);
  state.allVoices = mergedVoices;
  state.voices = voices;
  dom.voiceSelect.innerHTML = "";
  {
    const defaultOption = document.createElement("option");
    defaultOption.value = DEFAULT_VOICE_URI;
    defaultOption.textContent = "跟随系统默认声音";
    dom.voiceSelect.appendChild(defaultOption);
  }

  if (!voices.length) {
    state.voiceURI = DEFAULT_VOICE_URI;
    dom.voiceSelect.value = DEFAULT_VOICE_URI;
    dom.voiceReadyPill.textContent = "默认声音可用";
    refreshVoiceHint();
    renderSpeechDiagnostics(
      "等待系统语音",
      `当前浏览器没有返回可选语音列表，但仍可尝试使用系统默认声音朗读。${getVoiceEnvironmentGuidance()}${getPlatformSpeechChecks()}`,
      "warning",
    );
    return;
  }

  voices.forEach((voice) => {
    const option = document.createElement("option");
    option.value = voice.voiceURI;
    option.textContent = formatVoiceOptionLabel(voice);
    dom.voiceSelect.appendChild(option);
  });

  const preferredVoice = pickPreferredDefaultVoice(voices) || pickBestVoice(voices, navigator.language || "zh-CN");
  if (previousVoiceURI === DEFAULT_VOICE_URI) {
    state.voiceURI = DEFAULT_VOICE_URI;
  } else if (previousVoiceURI && voices.some((voice) => voice.voiceURI === previousVoiceURI)) {
    state.voiceURI = previousVoiceURI;
  } else if (!state.voiceURI || !voices.some((voice) => voice.voiceURI === state.voiceURI)) {
    state.voiceURI = preferredVoice?.voiceURI || voices[0].voiceURI;
  }

  dom.voiceSelect.value = state.voiceURI;
  state.voiceURI = dom.voiceSelect.value || state.voiceURI;
  dom.voiceReadyPill.textContent = `${voices.length} 种精选语音`;
  refreshVoiceHint();
  if (!options.quiet) {
    renderSpeechDiagnostics(
      "朗读引擎已就绪",
      `当前已整理出 ${voices.length} 种更适合听读的语音。英文句子和英文数字会优先匹配英文声音。`,
      "success",
    );
  }
};

waitForVoices = async function (timeoutMs = 1800) {
  const bridgeVoices = selectBridgeSupplementVoices("speechSynthesis" in window ? window.speechSynthesis.getVoices() : [], await loadBridgeVoices());
  if (!("speechSynthesis" in window)) {
    state.allVoices = mergeVoiceCatalog([], bridgeVoices);
    state.voices = filterPreferredVoices(state.allVoices);
    return state.allVoices;
  }

  const current = window.speechSynthesis.getVoices();
  if (current.length || bridgeVoices.length) {
    state.allVoices = mergeVoiceCatalog(current, bridgeVoices);
    state.voices = filterPreferredVoices(state.allVoices);
    return state.allVoices;
  }

  return await new Promise((resolve) => {
    let resolved = false;
    const finish = async () => {
      if (resolved) {
        return;
      }
      resolved = true;
      const browserVoices = window.speechSynthesis.getVoices();
      const nextBridgeVoices = selectBridgeSupplementVoices(browserVoices, await loadBridgeVoices());
      state.allVoices = mergeVoiceCatalog(browserVoices, nextBridgeVoices);
      state.voices = filterPreferredVoices(state.allVoices);
      resolve(state.allVoices);
    };

    const timer = window.setTimeout(() => {
      void finish();
    }, timeoutMs);

    if (typeof window.speechSynthesis.addEventListener === "function") {
      window.speechSynthesis.addEventListener(
        "voiceschanged",
        () => {
          window.clearTimeout(timer);
          void finish();
        },
        { once: true },
      );
      return;
    }

    const previousHandler = window.speechSynthesis.onvoiceschanged;
    window.speechSynthesis.onvoiceschanged = () => {
      window.clearTimeout(timer);
      previousHandler?.();
      void finish();
    };
  });
};

detectSpeechLang = function (text) {
  const normalized = normalizeWhitespace(text || "");
  const japaneseCount = (normalized.match(/[ぁ-ゟ゠-ヿ]/g) || []).length;
  const koreanCount = (normalized.match(/[가-힣]/g) || []).length;
  const cyrillicCount = (normalized.match(/[А-Яа-яЁё]/g) || []).length;
  const chineseCount = (normalized.match(/[\u4e00-\u9fa5]/g) || []).length;
  const latinCount = (normalized.match(/[A-Za-z]/g) || []).length;
  const digitCount = (normalized.match(/\d/g) || []).length;
  const englishWordCount = (normalized.match(/[A-Za-z]{2,}/g) || []).length;
  const englishSignal =
    latinCount + englishWordCount * 1.5 + (latinCount > 0 || chineseCount === 0 ? digitCount * 1.25 : digitCount * 0.15);

  if (japaneseCount > 0) {
    return "ja-JP";
  }
  if (koreanCount > 0) {
    return "ko-KR";
  }
  if (cyrillicCount > 0) {
    return "ru-RU";
  }
  if (
    englishSignal > 0 &&
    (chineseCount === 0 ||
      englishSignal >= chineseCount * 1.35 ||
      (latinCount >= 2 && digitCount >= 2 && englishSignal >= chineseCount * 0.9))
  ) {
    return /en-GB/i.test(navigator.language || "") ? "en-GB" : "en-US";
  }
  if (chineseCount > 0) {
    return /zh-(TW|HK|MO)/i.test(navigator.language || "") ? "zh-TW" : "zh-CN";
  }
  if (latinCount > 0 || digitCount > 0) {
    return /en-GB/i.test(navigator.language || "") ? "en-GB" : "en-US";
  }
  return navigator.language || "zh-CN";
};

isSpeechActive = function () {
  const browserSpeaking = "speechSynthesis" in window && (window.speechSynthesis.speaking || window.speechSynthesis.paused);
  const audioSpeaking = Boolean(state.activeAudio && (!state.activeAudio.paused || state.paused));
  return browserSpeaking || audioSpeaking || state.speaking || state.paused;
};

function loadBridgeVoices() {
  return fetch(WINDOWS_VOICE_ENDPOINT, { cache: "no-store" })
    .then((response) => (response.ok ? response.json() : { voices: [] }))
    .then((payload) => {
      state.bridgeVoices = Array.isArray(payload?.voices)
        ? payload.voices
            .map((voice) =>
              voice?.name
                ? {
                    name: voice.name,
                    lang: voice.lang || "en-US",
                    voiceURI: `${BRIDGE_VOICE_PREFIX}${encodeURIComponent(voice.name)}`,
                    default: Boolean(voice.default),
                    localService: true,
                    source: "windows-bridge",
                  }
                : null,
            )
            .filter(Boolean)
        : [];
      return state.bridgeVoices;
    })
    .catch(() => {
      state.bridgeVoices = [];
      return [];
    });
}

function mergeVoiceCatalog(browserVoices, bridgeVoices) {
  const dedupe = new Set();
  return [...bridgeVoices, ...browserVoices].filter((voice) => {
    const key = canonicalVoiceKey(voice);
    if (!key || dedupe.has(key)) {
      return false;
    }
    dedupe.add(key);
    return true;
  });
}

function selectBridgeSupplementVoices(browserVoices, bridgeVoices) {
  return bridgeVoices;
}

function canonicalVoiceKey(voice) {
  const bucket = getVoiceBucket(voice?.lang);
  const name = normalizeVoiceNameKey(voice?.name)
    .replace(/^microsoft/, "")
    .replace(/desktop$/, "")
    .replace(/chinesesimplifiedprc|englishunitedstates|englishus/g, "");
  return `${bucket}:${name || voice?.voiceURI || ""}`;
}

function isBridgeVoice(voice) {
  return Boolean(voice?.source === "windows-bridge" || String(voice?.voiceURI || "").startsWith(BRIDGE_VOICE_PREFIX));
}

function getBridgeVoiceName(voice) {
  return decodeURIComponent(String(voice?.voiceURI || "").replace(BRIDGE_VOICE_PREFIX, "")) || voice?.name || "";
}

function clearActiveAudio() {
  cancelActiveSpeechTransport();
  if (state.activeAudio) {
    state.activeAudio.onplay = null;
    state.activeAudio.onended = null;
    state.activeAudio.onerror = null;
    state.activeAudio.pause();
    state.activeAudio.src = "";
    state.activeAudio = null;
  }
  if (state.activeAudioUrl) {
    URL.revokeObjectURL(state.activeAudioUrl);
    state.activeAudioUrl = "";
  }
}

function mapUiPitchToBrowserPitch(value) {
  return mapRange(clamp(value, 0.5, 3.0), 0.5, 3.0, 0.5, 2.0);
}

function buildVoiceSelfTestText(voice) {
  const bucket = getVoiceBucket(voice?.lang);
  if (bucket.startsWith("en")) {
    return "Hello, this is iStone Reader. Voice test 2026.";
  }
  return "这是 iStone Reader 的发声测试。如果你听到了，说明听读已经正常。";
}

async function playBridgeVoiceAudio(text, voice, handlers = {}) {
  const speechText = sanitizeTextForSpeech(text);
  if (!speechText) {
    handlers.onend?.();
    return null;
  }

  const controller = new AbortController();
  if (typeof handlers.nonce === "number") {
    state.speechAbortController = controller;
  }
  const response = await fetch(WINDOWS_TTS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: controller.signal,
    body: JSON.stringify({
      text: speechText,
      voice: getBridgeVoiceName(voice),
      lang: voice?.lang || detectSpeechLang(speechText),
      rate: clamp(state.rate, 0.5, 3.0),
      pitch: clamp(state.pitch, 0.5, 3.0),
    }),
  });

  if (!response.ok) {
    throw new Error(`bridge-tts-${response.status}`);
  }
  if (typeof handlers.nonce === "number" && handlers.nonce !== state.speechAttemptNonce) {
    return null;
  }

  const blob = await response.blob();
  if (typeof handlers.nonce === "number" && handlers.nonce !== state.speechAttemptNonce) {
    return null;
  }
  if (state.speechAbortController === controller) {
    state.speechAbortController = null;
  }
  clearActiveAudio();
  const audioUrl = URL.createObjectURL(blob);
  const audio = new Audio(audioUrl);
  state.activeAudio = audio;
  state.activeAudioUrl = audioUrl;

  audio.onplay = () => {
    if (typeof handlers.nonce === "number" && handlers.nonce !== state.speechAttemptNonce) {
      return;
    }
    handlers.onstart?.();
  };
  audio.onended = () => {
    if (typeof handlers.nonce === "number" && handlers.nonce !== state.speechAttemptNonce) {
      return;
    }
    if (state.activeAudio === audio) {
      state.activeAudio = null;
    }
    if (state.activeAudioUrl === audioUrl) {
      URL.revokeObjectURL(audioUrl);
      state.activeAudioUrl = "";
    }
    handlers.onend?.();
  };
  audio.onerror = () => {
    if (typeof handlers.nonce === "number" && handlers.nonce !== state.speechAttemptNonce) {
      return;
    }
    clearActiveAudio();
    handlers.onerror?.({ error: "audio-unavailable" });
  };

  await audio.play();
  return audio;
}

runVoiceSelfTest = async function () {
  const availableVoices = await waitForVoices();
  const selectedVoice =
    getUserSelectedVoice(availableVoices) ||
    getUserSelectedVoice(state.voices) ||
    pickBestVoice(availableVoices, navigator.language || "zh-CN") ||
    null;

  if (!selectedVoice) {
    renderSpeechDiagnostics("朗读不可用", `当前没有可用语音。${getPlatformSpeechChecks()}`, "error");
    return;
  }

  const sampleText = buildVoiceSelfTestText(selectedVoice);
  renderSpeechDiagnostics("开始朗读自检", `将尝试用 ${selectedVoice.name || "默认声音"} 说一句测试语。`, "warning");

  if (isBridgeVoice(selectedVoice)) {
    try {
      stopSpeech({ silent: true });
      await playBridgeVoiceAudio(sampleText, selectedVoice, {
        onstart: () => {
          renderSpeechDiagnostics(
            "浏览器已开始发声",
            `当前使用本机 Windows 声线 ${selectedVoice.name}。如果你没听到，请检查系统音量和扬声器。`,
            "success",
          );
        },
        onend: () => {
          renderSpeechDiagnostics("测试语音已结束", "本机英文桥接语音已完成测试播放。", "success");
        },
        onerror: () => {
          renderSpeechDiagnostics("英文桥接发声失败", "本机 Windows 声线没有成功播放，请稍后重试。", "error");
        },
      });
    } catch {
      renderSpeechDiagnostics("英文桥接发声失败", "本机 Windows 声线没有成功播放，请稍后重试。", "error");
    }
    return;
  }

  const utterance = buildSpeechUtterance(sampleText, selectedVoice);
  stopSpeech({ silent: true });
  await resetSpeechEngine();
  utterance.rate = clamp(state.rate, 0.5, 3.0);
  utterance.pitch = mapUiPitchToBrowserPitch(state.pitch);
  utterance.onstart = () => {
    renderSpeechDiagnostics(
      "浏览器已开始发声",
      `当前使用 ${selectedVoice.name || "默认声音"}。如果你没听到，请检查浏览器标签页和系统音量。`,
      "success",
    );
  };
  utterance.onend = () => {
    renderSpeechDiagnostics("测试语音已结束", "浏览器朗读测试已完成。", "success");
  };
  utterance.onerror = () => {
    renderSpeechDiagnostics("测试语音没有启动", `浏览器没有真正开始发声。${getPlatformSpeechChecks()}`, "error");
  };
  window.speechSynthesis.speak(utterance);
};

startSpeech = async function () {
  window.clearTimeout(state.speechRestartTimer);
  window.clearTimeout(state.rateRestartTimer);
  if (!state.book) {
    setStatus("请先导入书籍");
    renderSpeechDiagnostics("还没有书", "请先导入一本书，再开始听读。", "warning");
    return;
  }

  const sentences = getCurrentSentences();
  if (!sentences.length) {
    setStatus("当前章节没有可朗读内容");
    renderSpeechDiagnostics("当前章节无法朗读", "这一章没有拆出可读句子。", "warning");
    return;
  }

  if (state.paused && state.activeAudio) {
    await state.activeAudio.play();
    state.paused = false;
    state.speaking = true;
    dom.speechStateHint.textContent = "朗读已继续";
    return;
  }
  if (state.paused && "speechSynthesis" in window && (window.speechSynthesis.paused || window.speechSynthesis.speaking)) {
    window.speechSynthesis.resume();
    state.paused = false;
    state.speaking = true;
    dom.speechStateHint.textContent = "朗读已继续";
    return;
  }

  await waitForVoices();
  state.speaking = true;
  state.paused = false;
  await restartChapterSpeechFromIndex(clamp(state.currentSentenceIndex, 0, sentences.length - 1));
};

restartChapterSpeechFromIndex = async function (sentenceIndex) {
  const attemptNonce = ++state.speechAttemptNonce;
  clearActiveAudio();
  await resetSpeechEngine();
  if (attemptNonce !== state.speechAttemptNonce) {
    return;
  }
  state.speaking = true;
  state.paused = false;
  speakSentenceAt(sentenceIndex, false, attemptNonce);
};

speakSentenceAt = function (sentenceIndex, fallbackTried = false, attemptNonce = state.speechAttemptNonce, overrideVoice = null) {
  if (attemptNonce !== state.speechAttemptNonce) {
    return;
  }
  const sentences = getCurrentSentences();
  if (sentenceIndex >= sentences.length) {
    const nextSectionIndex = findNextReadableSectionIndex(state.currentSectionIndex + 1);
    if (nextSectionIndex >= 0) {
      setCurrentSection(nextSectionIndex, { resetParagraph: true, resetSentence: true });
      dom.speechStateHint.textContent = `正在续读第 ${nextSectionIndex + 1} 章`;
      renderSpeechDiagnostics("自动续读下一章", `当前章节已读完，正在继续第 ${nextSectionIndex + 1} 章。`, "success");
      void restartChapterSpeechFromIndex(0);
      return;
    }

    state.speaking = false;
    state.paused = false;
    dom.speechStateHint.textContent = "全书朗读结束";
    renderSpeechDiagnostics("全书朗读完成", "已经顺着整本书读到了末尾。", "success");
    updateSpeechProgress();
    return;
  }

  const speechUnit = getSpeechUnitForSentence(sentenceIndex);
  const slicedUnit = speechUnit ? sliceSpeechUnit(speechUnit, sentenceIndex, sentences) : null;
  const speechText = slicedUnit?.text || sentences[sentenceIndex];
  const nextSentenceIndex = slicedUnit?.sentenceIndexes.at(-1) ?? sentenceIndex;
  const sanitizedSpeechText = sanitizeTextForSpeech(speechText);

  if (!sanitizedSpeechText) {
    speakSentenceAt(nextSentenceIndex + 1, fallbackTried, attemptNonce);
    return;
  }

  const selectedVoice =
    overrideVoice ||
    resolveVoiceForText(sanitizedSpeechText, {
      allowUserPreference: !fallbackTried,
      forceUserPreference: !fallbackTried,
    });
  const snippet = sentences[sentenceIndex].trim().slice(0, 28);
  const voiceLabel = selectedVoice?.name || "默认声音";
  const voiceSource = isBridgeVoice(selectedVoice) ? "本机 Windows 声线" : "浏览器语音";

  const onStart = () => {
    if (attemptNonce !== state.speechAttemptNonce) {
      return;
    }
    state.currentSentenceIndex = sentenceIndex;
    dom.speechStateHint.textContent = `正在朗读：${snippet}${sentences[sentenceIndex].length > 28 ? "..." : ""}`;
    highlightSentence(state.currentSentenceIndex);
    updateSpeechProgress();
    renderSpeechDiagnostics("浏览器已开始发声", `当前使用 ${voiceSource} ${voiceLabel}。`, "success");
  };
  const onEnd = () => {
    if (attemptNonce !== state.speechAttemptNonce || !state.speaking || state.paused) {
      return;
    }
    state.currentSentenceIndex = nextSentenceIndex + 1;
    updateSpeechProgress();
    speakSentenceAt(nextSentenceIndex + 1, false, attemptNonce);
  };
  const onError = async (event) => {
    if (attemptNonce !== state.speechAttemptNonce) {
      return;
    }
    state.activeUtterance = null;
    if (!fallbackTried) {
      const fallback = resolveFallbackVoiceForFailure(selectedVoice, sanitizedSpeechText);
      if (fallback?.voice) {
        renderSpeechDiagnostics(
          "当前声音不可用，已自动换一条声线",
          `${voiceLabel} 没有成功播放，正在改用${fallback.reason} ${fallback.voice.name || "默认声音"} 继续当前句。`,
          "warning",
        );
        speakSentenceAt(sentenceIndex, true, attemptNonce, fallback.voice);
        return;
      }
    }
    state.speaking = false;
    state.paused = false;
    dom.speechStateHint.textContent = "语音朗读中断，请重新开始";
    const details = describeSpeechError(event?.error || event?.type || "");
    renderSpeechDiagnostics("朗读失败", `${details.title}。${details.message}`, details.state || "error");
  };

  if (selectedVoice && isBridgeVoice(selectedVoice)) {
    void playBridgeVoiceAudio(speechText, selectedVoice, {
      nonce: attemptNonce,
      onstart: onStart,
      onend: onEnd,
      onerror: onError,
    }).catch(() => {
      void onError();
    });
    return;
  }

  if (!("speechSynthesis" in window)) {
    void onError();
    return;
  }

  const utterance = buildSpeechUtterance(speechText, selectedVoice);
  state.activeUtterance = utterance;
  utterance.rate = clamp(state.rate, 0.5, 3.0);
  utterance.pitch = mapUiPitchToBrowserPitch(state.pitch);
  utterance.volume = 1;
  utterance.onstart = onStart;
  utterance.onboundary = (event) => {
    if (typeof event?.charIndex === "number" && slicedUnit?.boundaries?.length) {
      syncSpeechBoundary(slicedUnit.boundaries, event.charIndex);
    }
  };
  utterance.onend = onEnd;
  utterance.onerror = () => {
    void onError();
  };
  if (attemptNonce !== state.speechAttemptNonce) {
    return;
  }
  window.speechSynthesis.speak(utterance);
};

togglePause = async function () {
  if (state.activeAudio) {
    if (state.activeAudio.paused) {
      await state.activeAudio.play();
      state.paused = false;
      state.speaking = true;
      dom.speechStateHint.textContent = "朗读已继续";
    } else {
      state.activeAudio.pause();
      state.paused = true;
      state.speaking = false;
      dom.speechStateHint.textContent = "朗读已暂停";
    }
    return;
  }

  if (!("speechSynthesis" in window) || (!window.speechSynthesis.speaking && !window.speechSynthesis.paused)) {
    return;
  }
  if (window.speechSynthesis.paused) {
    window.speechSynthesis.resume();
    state.paused = false;
    state.speaking = true;
    dom.speechStateHint.textContent = "朗读已继续";
  } else {
    window.speechSynthesis.pause();
    state.paused = true;
    state.speaking = false;
    dom.speechStateHint.textContent = "朗读已暂停";
  }
};

stopSpeech = function (options = {}) {
  state.speechAttemptNonce += 1;
  window.clearTimeout(state.rateRestartTimer);
  window.clearTimeout(state.speechRestartTimer);
  clearActiveAudio();
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  state.speaking = false;
  state.paused = false;
  state.activeUtterance = null;
  updateSpeechProgress();
  if (!options.silent) {
    dom.speechStateHint.textContent = "朗读已停止";
  }
};

void loadVoices();

refreshVoiceHint = function () {
  const allVisibleVoices = state.voices.length ? state.voices : state.allVoices;
  const voice = allVisibleVoices.find((item) => item.voiceURI === state.voiceURI) || null;
  const voiceCounts = summarizeVoiceBuckets(allVisibleVoices);
  const englishVoiceHint = voiceCounts.english
    ? `当前列表里有 ${voiceCounts.english} 种英文语音。`
    : "当前设备还没有暴露可用英文语音；如果电脑本机装有 Windows 英文声线，刷新后会自动补进来。";
  const routingHint = voiceCounts.english
    ? "英文句子、英文数字和英文主导的片段会优先匹配英文声音。"
    : "如果手机上仍然看不到英文声音，说明这台手机自己的系统或浏览器尚未提供英文 TTS。";
  const stabilityHint =
    "标有 Windows稳定 的声线会走本机语音桥，通常最可靠；标有 浏览器 的声线由浏览器暴露，少数设备可能显示不同名字但实际听感接近默认声线。";
  const environmentHint = getVoiceEnvironmentGuidance();
  const defaultHint = isDefaultVoiceSelected()
    ? "当前正在使用系统默认声音；即使设备暂时没有返回可选语音列表，浏览器也可能直接发声。"
    : "";
  dom.voiceHint.textContent = voice
    ? `当前已选：${formatVoiceOptionLabel(voice)}。${environmentHint}${stabilityHint}${englishVoiceHint}${routingHint}`
    : `语音来自当前设备系统。不同手机、浏览器和系统语音包，看到的可选声音会不同。${defaultHint}${environmentHint}${stabilityHint}${englishVoiceHint}${routingHint}`;
};

function loadDemoBook(options = {}) {
  const demoSections = splitPlainTextIntoSections(demoBookText, "aurora-demo.txt");
  finalizeBook({
    title: "Aurora Demo",
    subtitle: "内置演示书 · 用于快速体验章节导航、快速点位和朗读控制",
    format: "TXT",
    sections: demoSections,
    sourceHint: "内置示例文本，适合马上预览年轻化阅读界面。",
  });
  setStatus(options.auto ? "已自动载入演示预览" : "演示书已载入");
}

function setStatus(text) {
  dom.statusChip.textContent = text;
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatCount(value) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function mapRange(value, inMin, inMax, outMin, outMax) {
  const ratio = (value - inMin) / (inMax - inMin);
  return outMin + ratio * (outMax - outMin);
}

function rgbaFromHex(hex, alpha) {
  const normalized = hex.replace("#", "");
  const bigint = Number.parseInt(normalized, 16);
  const red = (bigint >> 16) & 255;
  const green = (bigint >> 8) & 255;
  const blue = bigint & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha.toFixed(3)})`;
}
