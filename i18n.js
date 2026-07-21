// Lightweight bilingual (English default / Chinese) i18n for the static UI.
//
// Markup elements carry a data-i18n key; the applier sets textContent, or
// innerHTML for keys whose translation contains markup (data-i18n-html), or
// attributes (data-i18n-attr="aria-label:key"). Language resolves from a saved
// override, else the browser language (zh* → zh, otherwise en). Adding a new
// language later is just another column in STRINGS — no markup changes.

const LANG_KEY = "istone-lang";
const SUPPORTED = ["en", "zh"];

export const STRINGS = {
  // hero
  "status.waiting": { en: "Waiting for a book", zh: "等待导入书籍" },
  "hero.eyebrow": { en: "Simple, hands-free listening", zh: "简单方便的听读体验" },
  "hero.desc": {
    en: "Turn PDF, EPUB, TXT and Markdown into a talking, chapter-based book. Multi-voice read-aloud, chapter splitting, progress navigation, and an immersive mobile interface.",
    zh: "把 PDF、EPUB、TXT、MD 一键导入成会说话的章节书。支持多语音朗读、章节拆分、进度导航和沉浸式移动端界面。",
  },
  "hero.import": { en: "Import a book", zh: "导入书籍" },
  "hero.wechat": { en: "Import from WeChat", zh: "导入微信文件" },
  "hero.demo": { en: "Load demo book", zh: "加载演示书" },
  "tag.chapters": { en: "Chapter nav", zh: "章节导航" },
  "tag.multivoice": { en: "Multi-voice", zh: "多语音" },
  "tag.ocr": { en: "Scan OCR", zh: "扫描 OCR" },
  "tag.share": { en: "Share to import", zh: "系统分享导入" },
  "tag.tone": { en: "Theme tint", zh: "色调调节" },
  "lang.toggle": { en: "中文", zh: "EN" },
  "lang.toggle.aria": { en: "Switch to Chinese", zh: "Switch to English" },

  // onboarding
  "onb.title": { en: "Start listening in three steps", zh: "三步开始听书" },
  "onb.got": { en: "Got it", zh: "知道了" },
  "onb.s1": {
    en: "Tap “Import a book” and pick a PDF / EPUB / TXT — scanned PDFs work too and are recognized automatically.",
    zh: "点「导入书籍」选择 PDF / EPUB / TXT——扫描版 PDF 也可以，会自动识别文字。",
  },
  "onb.s2": {
    en: "In “Read-aloud controls”, pick a voice you like — selecting one auto-previews a sentence.",
    zh: "在「朗读控制」里挑一个顺耳的声音，选中即自动试听一句。",
  },
  "onb.s3": {
    en: "Tap “Start reading”. Playback continues on the lock screen, where you can pause and skip.",
    zh: "点「开始朗读」。锁屏后播放继续，锁屏控制条可暂停、切句。",
  },

  // book panel
  "book.kicker": { en: "Book", zh: "Book" },
  "book.title": { en: "Book overview", zh: "书籍概览" },
  "book.pill.none": { en: "Not loaded", zh: "未载入" },
  "book.empty.title": { en: "No book open yet", zh: "还没有打开书" },
  "book.empty.sub": { en: "After importing, chapters are split and navigation is generated automatically.", zh: "导入后会自动拆分章节并生成导航。" },
  "metric.chapters": { en: "Chapters", zh: "章节数" },
  "metric.chars": { en: "Characters", zh: "总字数" },
  "metric.current": { en: "Current chapter", zh: "当前章节" },
  "metric.sentences": { en: "Sentences", zh: "朗读句数" },
  "progress.book": { en: "Book progress", zh: "全书进度" },
  "library.title": { en: "On-device shelf", zh: "本机书架" },
  "library.sub": { en: "Imported books are saved locally with listening progress", zh: "导入过的书自动保存，附带听读进度" },
  "library.backup": { en: "Back up shelf", zh: "备份书架" },
  "library.restore": { en: "Restore backup", zh: "恢复备份" },

  // voice panel
  "voice.kicker": { en: "Voice Studio", zh: "Voice Studio" },
  "voice.title": { en: "Read-aloud controls", zh: "朗读控制" },
  "voice.pill.waiting": { en: "Waiting for voices", zh: "等待语音" },
  "voice.select": { en: "Voice", zh: "语音选择" },
  "voice.style": { en: "Voice style", zh: "声音风格" },
  "style.standard": { en: "Standard · system voice", zh: "标准 · 系统原声" },
  "style.deep": { en: "Deep · fuller low tone", zh: "低沉 · 浑厚低音" },
  "style.bright": { en: "Bright · crisp high tone", zh: "清亮 · 明快高音" },
  "style.brisk": { en: "Brisk · slightly faster", zh: "轻快 · 稍微提速" },
  "voice.rate": { en: "Speed", zh: "语速" },
  "voice.rate.helper": { en: "Dragging applies to the current sentence immediately.", zh: "拖动后会立即应用到当前朗读句。" },
  "voice.timer": { en: "Sleep timer", zh: "定时关闭" },
  "timer.off": { en: "No timer", zh: "不定时" },
  "timer.15": { en: "Stop after 15 min", zh: "15 分钟后停止" },
  "timer.30": { en: "Stop after 30 min", zh: "30 分钟后停止" },
  "timer.60": { en: "Stop after 60 min", zh: "60 分钟后停止" },
  "timer.90": { en: "Stop after 90 min", zh: "90 分钟后停止" },
  "awake.label": {
    en: "Keep the screen on while reading",
    zh: "朗读时保持屏幕常亮",
  },
  "awake.small": {
    en: "If your device keeps playing with the screen off, you can turn this off to save power",
    zh: "你的设备若熄屏也能继续播放，可关闭以省电",
  },
  "neural.title": { en: "Neural voice pack (advanced · optional)", zh: "神经语音包（进阶 · 可选）" },
  "neural.sub": { en: "Import a voice pack for lifelike voices — synthesis stays fully on-device, offline", zh: "导入语音包即可获得真人感声音，合成全程在本机、不联网" },
  "neural.import": { en: "Import voice pack (.zip)", zh: "导入语音包（.zip）" },
  "neural.hint": {
    en: "This is an optional advanced feature. An official voice pack is in preparation and will be downloadable from the project page; importing it adds new voices with no app update needed. For a different sound right now, use the “Voice style” options above — they work offline on any phone. A voice pack bundles a synthesis engine and voice model (tens to hundreds of MB), stored only on your device; it runs code locally, so import packs only from trusted sources.",
    zh: "这是可选的进阶功能：官方语音包正在准备中，做好后会在项目主页提供下载，届时无需更新应用、导入即可新增声音。现在想要不同听感，先用上面的「声音风格」即可，任何手机都能离线使用。语音包内含合成引擎和音色模型（几十到上百 MB），只保存在本机；它会在本机执行代码，请只导入可信来源的语音包。",
  },
  "ctrl.speak": { en: "Start reading", zh: "开始朗读" },
  "ctrl.pause": { en: "Pause / Resume", zh: "暂停 / 继续" },
  "ctrl.stop": { en: "Stop", zh: "停止" },
  "ctrl.prevSentence": { en: "Prev sentence", zh: "上一句" },
  "ctrl.nextSentence": { en: "Next sentence", zh: "下一句" },
  "ctrl.prevChapter": { en: "Prev chapter", zh: "上一章" },
  "ctrl.nextChapter": { en: "Next chapter", zh: "下一章" },
  "ctrl.test": { en: "Test voice", zh: "测试发声" },
  "voice.hint": {
    en: "Voices all come from your device’s built-in system voices; read-aloud is offline. The available voices differ across phones and browsers.",
    zh: "语音全部使用设备本机的系统声线，朗读不联网。不同手机或浏览器看到的可选声音会不同。",
  },
  "diag.idle.title": { en: "Voice self-check: not tested", zh: "朗读自检：待测试" },
  "diag.idle.text": { en: "If there is no sound, this tells you whether it’s a browser limit, a missing system voice, or the device being muted.", zh: "如果没声音，这里会告诉你是浏览器限制、系统语音缺失，还是设备静音。" },
  "diag.export": { en: "Export diagnostics", zh: "导出诊断信息" },
  "voice.pill.default": { en: "Default voice available", zh: "默认声音可用" },
  "voice.pill.count": { en: "{n} curated voices", zh: "{n} 种精选语音" },
  "voice.hint.selected": { en: "Selected voice: {name}. Read-aloud is offline.", zh: "当前已选：{name}。朗读全程在本机、不联网。" },
  "tone.helper.applied": { en: "Switched to {label}. Two schemes are available: light and dark.", zh: "当前已切换到 {label}。可在浅色与暗色两套配色间快速切换。" },

  // tone & scan panel
  "tone.kicker": { en: "Tone & Scan", zh: "Tone & Scan" },
  "tone.title": { en: "Theme & recognition", zh: "色调与识别" },
  "tone.section": { en: "Panel theme", zh: "面板色调" },
  "tone.section.sub": { en: "Switch color scheme quickly", zh: "快速切换配色" },
  "tone.dark": { en: "Dark", zh: "暗色" },
  "tone.light": { en: "Light", zh: "浅色" },
  "tone.helper": { en: "Light suits long reading sessions; dark suits listening at night.", zh: "浅色适合长时间看屏，暗色适合夜间听读。" },
  "scan.section": { en: "Scanned-PDF recognition", zh: "扫描版 PDF 识别" },
  "scan.section.sub": { en: "Auto-recognizes pages with no selectable text", zh: "对没有可复制文字的页面自动补识别" },
  "scan.mode": { en: "Recognition mode", zh: "识别模式" },
  "scan.mode.auto": { en: "Auto-recognize scanned pages", zh: "自动识别扫描页" },
  "scan.mode.always": { en: "Force-recognize every PDF page", zh: "PDF 全页强制识别" },
  "scan.mode.off": { en: "Turn off scan recognition", zh: "关闭扫描识别" },
  "scan.lang": { en: "Recognition language", zh: "识别语言" },
  "scan.lang.mixed": { en: "Chinese + English", zh: "中英混合" },
  "scan.lang.zh": { en: "Simplified Chinese", zh: "简体中文" },
  "scan.lang.en": { en: "English", zh: "英文" },
  "scan.helper": { en: "The first recognition on a scanned PDF is slower because the engine and text model need to load.", zh: "扫描版 PDF 首次识别会更慢一些，因为需要准备识别引擎和文字模型。" },
  "scan.guide.title": { en: "Recognition tips", zh: "识别类型建议" },
  "scan.guide.good": { en: "Best: PDFs with selectable text, EPUB, TXT, Markdown, and clear, upright, single-column scans.", zh: "推荐：可复制文字的 PDF、EPUB、TXT、Markdown，以及清晰、正放、单栏的扫描 PDF。" },
  "scan.guide.hard": { en: "Harder: skewed photos, low resolution, two-column layouts, handwriting, dense tables/formulas, heavy watermarks, or messy mixed-language scans.", zh: "较困难：拍照歪斜、低分辨率、双栏排版、手写体、表格公式密集、水印严重、竖排古籍或中英混排很乱的扫描件。" },

  // reader
  "reader.kicker": { en: "Reader", zh: "Reader" },
  "reader.title.none": { en: "Import a book first", zh: "请先导入一本书" },
  "reader.dashboard": { en: "Listening dashboard", zh: "听读看板" },
  "reader.chapter": { en: "Chapter", zh: "章节选择" },
  "reader.fontsize": { en: "Text size", zh: "正文字号" },
  "reader.sourceHint": { en: "Supports chapter splitting with paragraph fallback.", zh: "支持自动按章节拆分与回退分段。" },
  "reader.stateIdle": { en: "Not reading yet", zh: "未开始朗读" },
  "reader.empty.title": { en: "Text appears here after you import a file.", zh: "导入文件后这里会显示正文。" },
  "reader.empty.sub": { en: "If a PDF has no proper headings, the text is split stably by page count and length so you can still navigate and listen.", zh: "如果 PDF 无法识别出正式标题，系统会按页数和文本长度稳定分段，仍然可以导航和朗读。" },

  // help
  "help.kicker": { en: "Guide", zh: "Guide" },
  "help.title": { en: "How to use", zh: "使用说明" },
  "help.pill": { en: "Start here", zh: "新手必读" },
  "help.s1.t": { en: "Import a book", zh: "导入书籍" },
  "help.s1.p": { en: "Tap “Import a book” at the top and choose a PDF, EPUB, TXT or MD file. On Android, after installing this app to your home screen, you can also “Share” a file from your file manager to iStone Reader.", zh: "点击顶部「导入书籍」，选择 PDF、EPUB、TXT 或 MD 文件。安卓手机把本应用安装到主屏幕后，也可以在文件管理器里对文件点「分享」选择 iStone Reader 直接导入。" },
  "help.s2.t": { en: "Start listening", zh: "开始听读" },
  "help.s2.p": { en: "In “Read-aloud controls”, choose a voice and speed, then tap “Start reading”. Pause/resume, prev/next sentence, and a sleep timer are all supported. Changing speed takes effect immediately without restarting.", zh: "在「朗读控制」里选好语音和语速，点「开始朗读」。支持暂停/继续、上一句/下一句、定时关闭。语速拖动后立即生效，不用重新开始。" },
  "help.s3.t": { en: "Shelf & progress", zh: "书架与进度" },
  "help.s3.p": { en: "Imported books are saved to your on-device shelf, and your position is recorded automatically. Next time you open the app, your last book and position are restored — no need to re-import.", zh: "导入过的书会自动保存到「本机书架」，听到哪里也会自动记录。下次打开应用会直接恢复上次的书和位置，不需要重新导入。" },
  "help.s4.t": { en: "Scanned PDFs", zh: "扫描版 PDF" },
  "help.s4.p": { en: "Scanned PDFs with no text layer use OCR automatically. The first recognition loads a model and is slower — watch the progress indicator at the top of the page.", zh: "没有文字层的扫描版 PDF 会自动启用 OCR 文字识别，首次识别需要加载识别模型，会慢一些，请耐心等待页面顶部的进度提示。" },
  "faq.title": { en: "FAQ", zh: "常见问题" },
  "faq.q1": { en: "I tapped read but hear nothing?", zh: "点了朗读没有声音？" },
  "faq.a1": { en: "First tap “Test voice” to confirm the device can make sound. Common causes: media volume is zero, the iPhone side mute switch is on, or the page is open inside an in-app browser (e.g. a chat app) — those restrict web speech. Open it in a system browser (Chrome, Edge or Safari) instead.", zh: "先点「测试发声」确认设备能出声。常见原因：手机媒体音量为零、iPhone 侧面静音拨片打开、或者页面是在微信等 App 内置浏览器里打开的——内置浏览器对网页朗读限制较多，建议点右上角菜单选「在浏览器中打开」，用系统自带的 Chrome、Edge 或 Safari 使用。" },
  "faq.q2": { en: "Reading stops after locking or switching apps?", zh: "锁屏或切到别的应用后朗读停了？" },
  "faq.a2": { en: "Web speech uses the phone’s system voices, and some phones interrupt it after locking. The app keeps the screen on while reading; if interrupted, returning to the page resumes from the current sentence. For long sessions keep the page in the foreground, or keep the phone charging with the screen on.", zh: "网页朗读使用手机系统语音，部分手机锁屏后会被系统中断。应用在朗读时会尽量保持屏幕常亮；如果被打断，回到本页面会自动从当前句继续。长时间听书建议保持页面在前台，或把手机充着电、屏幕常亮使用。" },
  "faq.q3": { en: "Why is the voice list different on each device?", zh: "语音列表为什么每台设备不一样？" },
  "faq.a3": { en: "Voices come from your device system and browser, so the available set differs. On Android you can install or update a TTS engine under Settings → Text-to-speech to get better voices; on iPhone, download higher-quality voices under Accessibility → Spoken Content → Voices.", zh: "朗读声音来自设备系统和浏览器，不同手机、不同浏览器能用的声音不同。安卓手机可以在系统设置的「文字转语音 / TTS」里安装或更新语音引擎来获得更好的中文声音；iPhone 可在「辅助功能 → 朗读内容 → 声音」里下载更高质量的语音。" },
  "faq.q4": { en: "Scan recognition is slow or inaccurate?", zh: "扫描版识别慢、或识别结果不准？" },
  "faq.a4": { en: "The first recognition loads a few-MB model and is much faster afterward. Clear, upright, single-column scans work best; skewed photos, low resolution, two columns, handwriting or heavy watermarks recognize noticeably worse. You can switch the recognition language under “Theme & recognition”.", zh: "首次识别需要加载几 MB 的识别模型，之后会快很多。清晰、摆正、单栏排版的扫描件效果最好；拍照倾斜、分辨率低、双栏、手写体或水印严重的页面识别效果会明显下降。可以在「色调与识别」里切换识别语言（默认中英混合，会按内容自动优化）。" },
  "faq.q5": { en: "What is a neural voice pack? How do I get lifelike voices?", zh: "什么是神经语音包？怎么获得真人声音？" },
  "faq.a5.html": { en: "A neural voice pack is an <strong>optional advanced feature</strong>: after importing a .zip pack you get lifelike voices, with synthesis running fully on your device, offline. It is separate from the app — <strong>adding voices later just means importing a new pack; the app itself needs no update</strong>. An official pack is in preparation and will be downloadable from the project page. Until then, use the “Voice style” options for a different sound, offline on any phone. Note: packs are large (tens to hundreds of MB), stored only on your device, and they run engine code locally, so import only from trusted sources.", zh: "神经语音包是一个<strong>可选的进阶功能</strong>：导入一个 .zip 语音包后，就能获得真人感的声音，合成全程在你的手机本机完成、不联网。它和应用是分开的——<strong>以后新增声音只需导入新语音包，应用本身不用更新</strong>。官方语音包正在准备中，做好后会在项目主页提供下载。在此之前，想要不同听感可以先用「声音风格」，任何手机都能离线使用。注意：语音包体积较大（几十到上百 MB），只保存在本机；它会在本机执行其中的引擎代码，请只导入可信来源发布的语音包。" },
  "faq.q6": { en: "Where are my books and progress stored? Are they uploaded?", zh: "我的书和进度存在哪里？会上传吗？" },
  "faq.a6": { en: "Nothing is uploaded. Parsing, recognition and read-aloud all happen on your own device, and the shelf and progress are stored only in your local browser. Note: clearing browser data (or private mode) wipes the shelf; switching devices or browsers does not sync.", zh: "不会上传。文件解析、识别和朗读全部在你自己的设备上完成，书架和进度只保存在本机浏览器里。注意：清除浏览器数据（或无痕模式）会清空书架；换设备或换浏览器不会同步。" },
  "faq.q7": { en: "How do I install it to my home screen?", zh: "如何安装到桌面 / 主屏幕？" },
  "faq.a7": { en: "Desktop Chrome / Edge: the install icon at the right of the address bar, or “Install app” in the menu. Android Chrome: menu → “Add to Home screen / Install app”. iPhone Safari: the share button → “Add to Home Screen”. Once installed it opens like a normal app.", zh: "电脑 Chrome / Edge：地址栏右侧的安装图标，或浏览器菜单里的「安装应用」。安卓 Chrome：右上角菜单 →「添加到主屏幕 / 安装应用」。iPhone Safari：底部分享按钮 →「添加到主屏幕」。安装后可像普通应用一样从桌面打开。" },
  "help.foot1": { en: "For other issues, tap “Test voice” and “Load demo book” to tell a device problem from a file problem.", zh: "遇到其他问题，可以先点「测试发声」和「加载演示书」排查是设备问题还是文件问题。" },
  "help.foot2.html": { en: "All data stays on your device; the app collects nothing · <a href=\"./privacy.html\" id=\"privacy-link\">Privacy policy</a>", zh: "所有数据仅保存在本机，应用不收集任何信息 · <a href=\"./privacy.html\" id=\"privacy-link\">隐私政策</a>" },

  // wechat dialog
  "wechat.title": { en: "Import a file received in WeChat", zh: "导入微信里收到的文件" },
  "wechat.close": { en: "Close", zh: "关闭" },
  "wechat.note1": { en: "WeChat keeps chat files in its own storage that web pages cannot read directly, so you must save the file out first. Follow the steps for your phone:", zh: "微信聊天里的文件存放在微信自己的空间里，网页无法直接读取，需要先「保存出来」再导入。请按你的手机类型操作：" },
  "wechat.android": { en: "Android", zh: "安卓手机" },
  "wechat.a1.html": { en: "In WeChat open the file, tap “···” at the top right, and choose <strong>“Save to phone”</strong>.", zh: "在微信里点开那个文件，点右上角「···」，选择<strong>「保存到手机」</strong>（部分机型叫「存储到手机」）。" },
  "wechat.a2.html": { en: "Fastest: open the system <strong>Files</strong> app, go to the “Download / WeiXin” folder, long-press the file and <strong>“Share”</strong>, then pick <strong>iStone Reader</strong> to import and parse it directly.<br /><span class=\"wechat-tip\">Requires the app to be installed to the home screen. If iStone Reader isn’t in the share list, install it first.</span>", zh: "最快的方式：打开系统<strong>「文件管理」</strong>，进入「下载 / Download / WeiXin」文件夹，长按文件选<strong>「分享 / 发送」</strong>，在分享列表里选择 <strong>iStone Reader</strong>，会直接导入并开始解析。<br /><span class=\"wechat-tip\">前提：已把本应用「添加到主屏幕 / 安装应用」。如果分享列表里没有 iStone Reader，请先安装。</span>" },
  "wechat.a3.html": { en: "Alternative: come back here, tap “Import a book”, and in the file picker open the <strong>WeiXin</strong> folder under “Download”.", zh: "备选方式：回到本页点「导入书籍」，在文件选择器里进入「下载（Download）」下的 <strong>WeiXin</strong> 文件夹选取文件。" },
  "wechat.ios": { en: "iPhone / iPad", zh: "iPhone / iPad" },
  "wechat.i1.html": { en: "In WeChat open the file, tap “···”, choose <strong>“Open with…”</strong>, then <strong>“Save to Files”</strong>.", zh: "在微信里点开那个文件，点右上角「···」，选择<strong>「用其他应用打开」</strong>，然后选<strong>「存储到\"文件\"」</strong>并保存。" },
  "wechat.i2.html": { en: "Come back here, tap “Import a book”, and pick the file from <strong>“Recents”</strong> or where you saved it in the Files sheet.", zh: "回到本页点「导入书籍」，在弹出的\"文件\"界面里打开<strong>「最近项目」</strong>或刚才保存的位置，点选文件即可。" },
  "wechat.note2": { en: "Tip: don’t use this app inside WeChat’s built-in browser (it’s restricted and can’t read aloud). Open it in a system browser and add it to your home screen.", zh: "提示：请不要在微信内置浏览器里使用本应用（限制较多且无法朗读），建议用系统浏览器打开并添加到主屏幕。" },

  // toast + tabs + mini
  "toast.update": { en: "New version ready · tap to refresh", zh: "新版本已就绪 · 点击刷新" },
  "tab.nav": { en: "Quick navigation", zh: "快速导航" },
  "tab.shelf": { en: "Shelf", zh: "书架" },
  "tab.import": { en: "Import", zh: "导入" },
  "tab.listening": { en: "Now playing", zh: "正在听" },
  "mini.chapterPrev": { en: "Ch−", zh: "上章" },
  "mini.chapterNext": { en: "Ch+", zh: "下章" },
  "mini.prev.aria": { en: "Previous sentence", zh: "上一句" },
  "mini.next.aria": { en: "Next sentence", zh: "下一句" },
  "mini.play.aria": { en: "Play or pause", zh: "播放或暂停" },
  "mini.prevChapter.aria": { en: "Previous chapter", zh: "上一章" },
  "mini.nextChapter.aria": { en: "Next chapter", zh: "下一章" },
  "mini.info.aria": { en: "Jump back to the sentence being read", zh: "回到正在朗读的位置" },
  "mini.title.idle": { en: "Not reading yet", zh: "未开始朗读" },
};

let currentLang = "en";

export function detectLang() {
  try {
    const saved = window.localStorage.getItem(LANG_KEY);
    if (SUPPORTED.includes(saved)) {
      return saved;
    }
  } catch {
    // ignore storage errors
  }
  const nav = (navigator.language || navigator.userLanguage || "en").toLowerCase();
  return nav.startsWith("zh") ? "zh" : "en";
}

export function getLang() {
  return currentLang;
}

export function t(key, lang = currentLang) {
  const entry = STRINGS[key];
  if (!entry) {
    return key;
  }
  return entry[lang] ?? entry.en ?? key;
}

export function applyI18n(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.getAttribute("data-i18n"));
  });
  root.querySelectorAll("[data-i18n-html]").forEach((el) => {
    el.innerHTML = t(el.getAttribute("data-i18n-html"));
  });
  root.querySelectorAll("[data-i18n-attr]").forEach((el) => {
    el.getAttribute("data-i18n-attr").split(";").forEach((pair) => {
      const [attr, key] = pair.split(":").map((s) => s.trim());
      if (attr && key) {
        el.setAttribute(attr, t(key));
      }
    });
  });
}

export function setLang(lang) {
  if (!SUPPORTED.includes(lang)) {
    return;
  }
  currentLang = lang;
  try {
    window.localStorage.setItem(LANG_KEY, lang);
  } catch {
    // ignore storage errors
  }
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  applyI18n();
  document.dispatchEvent(new CustomEvent("i18n:changed", { detail: { lang } }));
}

export function initI18n() {
  currentLang = detectLang();
  document.documentElement.lang = currentLang === "zh" ? "zh-CN" : "en";
  applyI18n();
  return currentLang;
}
