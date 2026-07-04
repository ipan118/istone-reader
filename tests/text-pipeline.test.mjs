// Regression tests for the text pipeline (chapter/sentence splitting, OCR
// repair, reference stripping, section normalization). These lock in current
// behaviour so the heuristics can be tuned without silent regressions.
//
// Run with: node --test tests/
import test from "node:test";
import assert from "node:assert/strict";
import {
  splitIntoSentences,
  splitIntoParagraphs,
  splitPlainTextIntoSections,
  splitPdfPagesIntoSections,
  pdfTextItemsToString,
  repairOcrLineBreaks,
  removeRepeatedOcrLines,
  cleanDisplayText,
  sanitizeTextForSpeech,
  detectHeadingFromPage,
  hasStrongSentenceEnding,
  isMajorSectionTitle,
  detectSpeechLang,
  buildSectionPreview,
  countMeaningfulCharacters,
  normalizeBookSections,
  getSectionParagraphCount,
  segmentWithIntl,
} from "../text-pipeline.mjs";

test("splitIntoSentences: long Chinese prose splits at sentence ends", () => {
  const text =
    "在那个漫长而潮湿的夏天里，图书馆的旧窗子总是蒙着一层薄薄的水汽，让人看不清外面的街道和行人。" +
    "她每天下午都会坐在靠窗的位置上，安静地读完一整章才肯离开，仿佛那是一种不可打破的仪式。" +
    "后来的很多年里，她始终记得那种被文字包裹着的安全感，以及纸页翻动时细微而清脆的声音。";
  const sentences = splitIntoSentences(text);
  assert.equal(sentences.length, 3);
  assert.ok(sentences[0].endsWith("街道和行人。"));
  assert.ok(sentences[2].startsWith("后来的很多年里"));
});

test("splitIntoSentences: short fragments are merged to keep speech units stable", () => {
  // Deliberate behaviour: tiny sentences merge so speech does not stutter.
  const sentences = splitIntoSentences("今天下雨了。明天晴。我们出门。");
  assert.equal(sentences.length, 1);
});

test("splitIntoSentences: abbreviations and decimals do not split English text", () => {
  const sentences = splitIntoSentences(
    "Dr. Smith finished the report at 3.14 pm. He went home afterwards and slept deeply.",
  );
  assert.equal(sentences.length, 1);
  assert.ok(sentences[0].includes("3.14 pm."));
});

test("splitIntoParagraphs: hard-wrapped lines merge, blank-line paragraphs stay separate", () => {
  const text =
    "The lighthouse keeper climbed the narrow stairway before dawn and\n" +
    "checked the great lamp with steady patient hands while the wind\n" +
    "pressed hard against the tower walls outside in the darkness.\n\n" +
    "下一段独立存在。这一段和上一段之间有空行分隔，应当保持独立成段而不被合并进去，因为它的长度已经超过了最小段落字符数的要求，可以独立成段。";
  const paragraphs = splitIntoParagraphs(text);
  assert.equal(paragraphs.length, 2);
  assert.ok(paragraphs[0].includes("stairway before dawn and checked the great lamp"));
  assert.ok(paragraphs[1].startsWith("下一段独立存在。"));
});

test("splitPlainTextIntoSections: markdown headings become titled sections", () => {
  const text = [
    "# 第一章 出发",
    "清晨的码头堆满了木箱，水手们把缆绳一圈圈收好，准备迎接为期三个月的远航，任何人都没有想到后来的风暴。",
    "",
    "# 第二章 风暴",
    "第三天夜里，风暴毫无预兆地压了过来，船身在浪谷之间剧烈摇晃，所有人都被叫上了甲板，紧张地固定每一件可能滑动的货物。",
    "",
    "# 第三章 归途",
    "当他们终于看见海岸线的时候，没有人说话，只有海鸥的叫声在桅杆之间来回盘旋，仿佛在替他们发出劫后余生的欢呼。",
  ].join("\n");
  const sections = splitPlainTextIntoSections(text, "voyage.txt");
  assert.deepEqual(
    sections.map((section) => section.title),
    ["第一章 出发", "第二章 风暴", "第三章 归途"],
  );
});

test("splitPlainTextIntoSections: heading-less text falls back to length chunks", () => {
  const text = Array.from(
    { length: 40 },
    (_, i) => `这是第${i + 1}句持续不断的正文内容，专门用来验证没有标题时按长度回退分段的行为是否稳定可靠。`,
  ).join("");
  const sections = splitPlainTextIntoSections(text, "plain.txt");
  assert.ok(sections.length >= 1);
  assert.equal(sections[0].sourceHint, "按段落长度自动分段");
});

test("splitPdfPagesIntoSections: headings start sections, page breaks bridge mid-sentence", () => {
  const pages = [
    {
      pageNumber: 1,
      text: "第一章 山中来客\n山路在暮色里渐渐模糊，他背着一只旧木箱走进村子，箱子里装着没有人见过的乐器，村口的狗叫了两声就安静了下来",
      ocrUsed: false,
    },
    {
      pageNumber: 2,
      text: "，因为它闻到了熟悉的松香味道。老人在祠堂前的石阶上坐下，把木箱放在膝盖上，等待第一个好奇的孩子走过来。",
      ocrUsed: false,
    },
    {
      pageNumber: 3,
      text: "第二章 夜里的琴声\n那天夜里，村子里响起了从未听过的琴声，声音像泉水一样从祠堂的方向漫过来，连最沉的睡眠也被轻轻托起。",
      ocrUsed: false,
    },
  ];
  const sections = splitPdfPagesIntoSections(pages, "story.pdf");
  assert.equal(sections.length, 2);
  assert.equal(sections[0].title, "第一章 山中来客");
  assert.equal(sections[0].sourceHint, "第 1 - 2 页");
  // The page-1 → page-2 break lands mid-sentence and must not tear it apart.
  assert.ok(sections[0].text.includes("安静了下来，因为它闻到了"));
  assert.equal(sections[1].title, "第二章 夜里的琴声");
});

test("repairOcrLineBreaks: dehyphenates wraps and drops lone page numbers", () => {
  const repaired = repairOcrLineBreaks(
    "The infor-\nmation about cli-\nmate change is important.\n123\nNext line of text continues here.",
  );
  assert.ok(repaired.includes("information"));
  assert.ok(repaired.includes("climate"));
  assert.ok(!/\b123\b/.test(repaired));
});

test("removeRepeatedOcrLines: digit-normalized repeated headers are dropped", () => {
  // '第12期' / '第13期' / '第14期' normalize to the same key → running header.
  const cleaned = removeRepeatedOcrLines(
    [
      "晨光文摘 第12期 月刊合订本",
      "正文第一行讲述了完全不同的事情。",
      "晨光文摘 第13期 月刊合订本",
      "另一行独特的正文内容在这里继续讲述。",
      "晨光文摘 第14期 月刊合订本",
    ].join("\n"),
  );
  assert.equal(cleaned, "正文第一行讲述了完全不同的事情。\n另一行独特的正文内容在这里继续讲述。");
});

test("cleanDisplayText: strips bracketed citations and superscripts", () => {
  assert.equal(
    cleanDisplayText("研究表明[12]，全球气温上升趋势明显（3），详见附录¹。"),
    "研究表明，全球气温上升趋势明显，详见附录。",
  );
});

test("cleanDisplayText: removes spaces injected between CJK characters", () => {
  // PDF text layers / OCR often space out every glyph: 持 续 买 入.
  assert.equal(
    cleanDisplayText("持 续 买 入 ，基 于 百 年 金 融 数 据 。"),
    "持续买入，基于百年金融数据。",
  );
  // CJK↔Latin boundaries keep their space; CJK↔CJK loses it.
  assert.equal(cleanDisplayText("使用 Windows 声线 朗读 效果"), "使用 Windows 声线朗读效果");
  // Full-width ideographic spaces are treated as spaces and collapsed too.
  assert.equal(cleanDisplayText("第一章　总则　与　范围"), "第一章总则与范围");
});

test("pdfTextItemsToString: CJK items join tightly, Latin items keep spaces", () => {
  const item = (str, x) => ({ str, transform: [1, 0, 0, 1, x, 700] });
  assert.equal(
    pdfTextItemsToString([item("第", 10), item("一", 24), item("章", 38), item("星辰", 52)]),
    "第一章星辰",
  );
  assert.equal(
    pdfTextItemsToString([item("The", 10), item("quick", 42), item("fox", 96)]),
    "The quick fox",
  );
});

test("splitPdfPagesIntoSections: per-glyph-spaced heading pages still split", () => {
  const heading = pdfTextItemsToString([
    { str: "第", transform: [1, 0, 0, 1, 10, 800] },
    { str: "二", transform: [1, 0, 0, 1, 24, 800] },
    { str: "章", transform: [1, 0, 0, 1, 38, 800] },
    { str: "风暴", transform: [1, 0, 0, 1, 52, 800] },
  ]);
  const pages = [
    {
      pageNumber: 1,
      text: "开篇的正文内容足够长，讲述了远航前的准备工作，水手们把缆绳一圈圈收好，等待起航的号角在清晨响起。",
      ocrUsed: false,
    },
    {
      pageNumber: 2,
      text: `${heading}\n风暴在第三天夜里毫无预兆地压了过来，船身在浪谷之间剧烈摇晃，所有人都被叫上了甲板固定货物。`,
      ocrUsed: false,
    },
  ];
  const sections = splitPdfPagesIntoSections(pages, "storm.pdf");
  assert.equal(sections.length, 2);
  assert.equal(sections[1].title, "第二章风暴");
});

test("sanitizeTextForSpeech: brackets and dashes become natural pauses", () => {
  const spoken = sanitizeTextForSpeech("他翻开《百年孤独》——那本旧书（第3页），轻声读了起来……");
  assert.ok(spoken.includes("百年孤独"));
  assert.ok(!spoken.includes("《"));
  assert.ok(!spoken.includes("——"));
  assert.ok(!spoken.includes("（"));
});

test("detectHeadingFromPage: recognizes Chinese and English chapter headings", () => {
  assert.equal(detectHeadingFromPage("第三章 风起云涌\n正文第一行在这里。"), "第三章 风起云涌");
  assert.equal(detectHeadingFromPage("Chapter 12 The Storm\nBody text here."), "Chapter 12 The Storm");
  assert.equal(detectHeadingFromPage("这只是一段普通正文，不含标题。"), undefined);
});

test("hasStrongSentenceEnding: terminal punctuation, including inside quotes", () => {
  assert.equal(hasStrongSentenceEnding("他说完了。"), true);
  assert.equal(hasStrongSentenceEnding("他还没说完"), false);
  assert.equal(hasStrongSentenceEnding("“结束了。”"), true);
});

test("isMajorSectionTitle: chapter-shaped titles only", () => {
  assert.equal(isMajorSectionTitle("第十二章 起航"), true);
  assert.equal(isMajorSectionTitle("Chapter 3"), true);
  assert.equal(isMajorSectionTitle("随便的一句话"), false);
});

test("detectSpeechLang: routes Chinese, English and Japanese", () => {
  assert.equal(detectSpeechLang("今天天气很好，适合读书。"), "zh-CN");
  assert.ok(detectSpeechLang("The weather is lovely today.").startsWith("en-"));
  assert.equal(detectSpeechLang("雨がやんだら出かけましょう"), "ja-JP");
});

test("buildSectionPreview: truncates to the preview budget with ellipsis", () => {
  const preview = buildSectionPreview(
    "这是一个非常长的开头句子，用来测试预览截断行为是否符合三十个字符的限制要求。",
  );
  assert.ok(preview.endsWith("…"));
  assert.ok(preview.length <= 31);
  assert.equal(buildSectionPreview("短句。"), "短句。");
});

test("countMeaningfulCharacters: counts CJK, latin and digits only", () => {
  assert.equal(countMeaningfulCharacters("你好 hello 123 ——！"), 10);
});

test("normalizeBookSections: drops boilerplate, renumbers, computes reading fields", () => {
  const sections = normalizeBookSections(
    [
      {
        id: "s1",
        title: "版权信息",
        text: "版权所有 侵权必究\n某某出版社出版发行\nISBN 978-7-000-00000-0\n定价：39.00元",
        sourceHint: "p1",
      },
      {
        id: "s2",
        title: "第一章 灯塔",
        text: "守塔人在黎明前爬上狭窄的旋梯，用布满老茧的手检查那盏巨大的灯，风在塔外持续地拍打着墙壁。多年以来他都保持着同样的习惯，从不间断，也从不抱怨。",
        sourceHint: "p2",
      },
      {
        id: "s4",
        title: "第二章 集市",
        text: "清晨的集市上，面包师把新烤的面包整齐地码在木架上，孩子们提着风筝跑过石板路，旅人们交换着关于山路和渡船的见闻，一切都显得生机勃勃。",
        sourceHint: "p4",
      },
    ],
    { format: "PDF", fallbackTitle: "测试书" },
  );
  assert.equal(sections.length, 2);
  assert.deepEqual(
    sections.map((section) => section.id),
    ["section-1", "section-2"],
  );
  assert.equal(sections[0].title, "第一章 灯塔");
  assert.ok(sections[0].paragraphCount >= 1);
  assert.ok(sections[0].preview.length > 0);
  assert.ok(Array.isArray(sections[0].paragraphs));
});

test("getSectionParagraphCount: prefers precomputed count, falls back to text", () => {
  assert.equal(getSectionParagraphCount({ paragraphCount: 5 }), 5);
  assert.equal(getSectionParagraphCount({ text: "只有一段。" }), 1);
  assert.equal(getSectionParagraphCount(null), 0);
});

test("segmentWithIntl: produces sentence segments when Intl.Segmenter exists", () => {
  const segments = segmentWithIntl("第一句在这里。第二句也在这里。");
  if (globalThis.Intl?.Segmenter) {
    assert.ok(segments.length >= 2);
  } else {
    assert.deepEqual(segments, []);
  }
});
