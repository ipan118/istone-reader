// Text pipeline — the pure text machinery behind iStone Reader: chapter and
// sentence splitting, paragraph reflow, OCR text repair, reference stripping
// and section normalization. Everything here is framework-free and runs in
// both the browser and Node (`node --test tests/`), so the heuristics have a
// regression net. Keep this module free of DOM/state access.

export const CHAPTER_HEADING_RE =
  /^(#{1,6}\s*.+|(?:chapter|part)\s+\d+[^\n]*|第[一二三四五六七八九十百千万0-9]+[章节卷部篇回][^\n]*|(?:序章|序言|前言|引言|后记|尾声|番外)[^\n]*)$/gim;

export const HEADING_LINE_RE = /^(?:#{1,6}\s*.+|(?:chapter|part)\s+\d+[^\n]*|第[一二三四五六七八九十百千万0-9]+[章节卷部篇回][^\n]*|(?:序章|序言|前言|引言|后记|尾声|番外)[^\n]*)$/i;

export const REFERENCE_HEADING_RE = /^(?:参考文献|references|bibliography)$/i;

export const REFERENCE_SECTION_RE = /(?:^|\n)\s*(?:参考文献|references|bibliography)\s*(?:\n|$)[\s\S]*$/i;

export const SENTENCE_END_RE = /[。！？!?\.]["”’')\]]*$/;

export const SPEECH_FILTER_RE = /[—–―]+|\.{3,}|…+|[()（）\[\]【】{}<>《》「」『』]/g;

export const BRACKET_REFERENCE_RE = /(?:\[(?:\d{1,3}(?:\s*[-,–]\s*\d{1,3})*)\]|\((?:\d{1,3}(?:\s*[-,–]\s*\d{1,3})*)\)|（(?:\d{1,3}(?:\s*[-,–]\s*\d{1,3})*)）|【(?:\d{1,3}(?:\s*[-,–]\s*\d{1,3})*)】)/g;

export const SIMPLE_PAREN_REFERENCE_RE = /[（(【\[]\s*[¹²³⁴⁵⁶⁷⁸⁹⁰\d]{1,3}(?:\s*[-,–—]\s*[¹²³⁴⁵⁶⁷⁸⁹⁰\d]{1,3})*\s*[）)】\]]/g;

export const LEADING_REFERENCE_RE = /(^|\n)\s*(?:\d{1,2}|[\[(（【]\d{1,3}[\])）】])(?=(?:\s|["“‘'（(【\[\u4e00-\u9fa5A-Za-z]))/g;

export const INLINE_CJK_REFERENCE_RE = /(?<=[\u4e00-\u9fa5])\d{1,2}(?=(?:[，。；：、）》」』】\])]|$))/g;

export const INLINE_END_REFERENCE_RE = /(?<=[\u4e00-\u9fa5）】〉》」』])[¹²³⁴⁵⁶⁷⁸⁹⁰\d]{1,3}(?=(?:[，。；：、,.!?！？;:）】〉》」』"'”’\s]|$))/g;

export const SUPERSCRIPT_REFERENCE_RE = /[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g;

export const LONE_NUMBER_LINE_RE = /^\s*\d{1,3}\s*$/gm;

export const INLINE_SYMBOL_RE = /[#*_~^`|]/g;

export const MIN_PARAGRAPH_CHARS = 56;

export const IDEAL_PARAGRAPH_CHARS = 148;

export const MAX_PARAGRAPH_CHARS = 250;

export const WRAPPED_BLOCK_AVERAGE_LINE = 52;

export const WRAPPED_BLOCK_SHORT_LINE = 48;

export const OCR_SHORT_FRAGMENT_CHARS = 34;

export const NON_BREAKING_ABBR_RE =
  /\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|Mt|No|Nos|Fig|Figs|Eq|Eqs|Dept|Univ|Inc|Ltd|Co|Corp|vs|etc|MD|PhD)\.$/i;

export const INITIALISM_END_RE = /(?:\b[A-Z]\.){1,5}$/;

export const OCR_NOISE_LINE_RE =
  /^(?:[-_~*•·|｜\s]+|\d{1,4}|page\s*\d{1,4}|第\s*\d{1,4}\s*页|[A-Z]?\d{1,3}[A-Z]?|[A-Z]{1,2})$/i;

export const SHORT_SECTION_MERGE_CHARS = 360;

export const AGGRESSIVE_SECTION_MERGE_CHARS = 820;

export const KEEP_SECTION_TARGET_CHARS = 2200;

export const SECTION_PREVIEW_CHARS = 30;

export const BOILERPLATE_TITLE_RE = /^(?:版权(?:信息|页)?|版权所有|侵权必究|目录|contents?|catalog|出版信息|联系(?:方式|我们)?|about|封面|扉页)$/i;

export const BOILERPLATE_LINE_RE = /(?:版权所有|侵权必究|出版社|出版|发行|电子版|客服(?:热线|电话|邮箱)?|热线|邮箱|网址|官网|官方|微信(?:公众号|号)?|微博|ISBN|CIP|service@|https?:\/\/|www\.|责任编辑|装帧|定价|印刷|联系电话|copyright)/i;

export const TOC_LINE_RE = /(?:^\s*(?:第[一二三四五六七八九十百千万0-9]+[章节卷部篇回]|chapter|part|contents?)\b)|(?:\.{2,}\s*\d+\s*$)|(?:\s+\d+\s*$)/i;

export const PAGE_ARTIFACT_RE = /^(?:page\s*)?\d{1,4}$/i;

export const GENERIC_SECTION_TITLE_RE = /^(?:section|chapter|part|正文|内容|片段|分段|章节|第\s*\d+\s*[章节卷部篇回]?|pdf\s*分段)\b/i;

export function appendSectionText(previous, next) {
  if (!next) {
    return previous;
  }
  return previous ? joinFlowingText(previous, next) : next.trim();
}

// Joins two blocks of running text. When the first block stops mid-sentence
// (typical for page breaks), the boundary is bridged instead of becoming a
// paragraph break, so sentences are not torn apart.
function joinFlowingText(previous, next) {
  const left = (previous || "").trim();
  const right = (next || "").trim();
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }
  if (hasStrongSentenceEnding(left) || isShortHeadingLine(left.split("\n").pop() || "") || HEADING_LINE_RE.test(right.split("\n", 1)[0] || "")) {
    return `${left}\n\n${right}`;
  }
  const joiner = shouldInsertSpaceBetween(left, right) ? " " : "";
  return `${left}${joiner}${right}`;
}

export function splitPlainTextIntoSections(rawText, fallbackName) {
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

export function splitPdfPagesIntoSections(pages, fallbackName) {
  const sections = [];
  let current = null;

  pages.forEach((page, index) => {
    const heading = detectHeadingFromPage(page.text);
    // Splitting mid-sentence breaks the reading flow at every section edge,
    // so length-based splits wait for a sentence boundary (with a hard cap).
    const endsCleanly = !current || hasStrongSentenceEnding(current.text);
    const lengthSplit = current && endsCleanly && (current.text.length > 2600 || current.pages.length >= 4);
    const hardSplit = current && (current.text.length > 5200 || current.pages.length >= 7);
    const shouldStartNewSection = Boolean(heading) || !current || lengthSplit || hardSplit;

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
    current.text = joinFlowingText(current.text, page.text);

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

export function createPdfSection(current, index) {
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

export function repairOcrLineBreaks(text) {
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

export function removeRepeatedOcrLines(text) {
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

export function normalizeOcrLineKey(line) {
  const key = normalizeWhitespace(line)
    .toLowerCase()
    .replace(/\d+/g, "#")
    .replace(/[^a-z#\u4e00-\u9fa5]+/g, "");
  return key.length >= 8 ? key : "";
}

export function shouldDropOcrNoiseLine(line, index, totalLines) {
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

export function fallbackChunkSections(text, titleSeed, sourceHint) {
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

export function detectHeadingFromPage(text) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 10);

  return lines.find((line) =>
    /^(chapter|part)\s+\d+|^第[一二三四五六七八九十百千万0-9]+[章节卷部篇回]|^(序章|序言|前言|引言|后记|尾声|番外)/i.test(line),
  );
}

export function pdfTextItemsToString(items) {
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

export function splitIntoParagraphs(text) {
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

export function splitIntoSentences(text) {
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

export function buildParagraphBlocks(text) {
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

export function mergeWrappedLines(block) {
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

export function looksLikeWrappedTextBlock(lines) {
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

export function shouldStartNewParagraph(previous, next, wrappedMode) {
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

export function looksLikeHardParagraphBreak(text) {
  const trimmed = (text || "").trim();
  return (
    !trimmed ||
    isShortHeadingLine(trimmed) ||
    /^(?:[-*•●▪◦]|(?:\d+|[A-Za-z])[.)、])\s+/.test(trimmed) ||
    /^(?:(?:附录|摘要|结论|讨论|方法|结果|引言|致谢)(?:[:：\s]|$)|(?:appendix|abstract|introduction|methods?|results?|discussion|conclusion)\b)/i.test(trimmed)
  );
}

export function isShortHeadingLine(text) {
  const trimmed = (text || "").trim();
  return Boolean(trimmed) && trimmed.length <= 42 && (HEADING_LINE_RE.test(trimmed) || /^[A-Z][A-Z\s:&/-]{3,}$/.test(trimmed));
}

export function isSentenceBoundary(currentText, remainingText) {
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

export function shouldKeepPeriodInsideSentence(currentText, remainingText) {
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

export function mergeUnsafeSentenceFragments(sentences) {
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

export function shouldMergeSentenceFragment(previous, next) {
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

export function mergeTinyParagraphs(paragraphs) {
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

export function looksLikeStandaloneParagraph(text) {
  return (
    /[:：]\s*\S+$/.test(text) ||
    /^https?:\/\//i.test(text) ||
    /^\S+@\S+\.\S+$/.test(text) ||
    /^\[?\d{1,3}\]?$/.test(text) ||
    REFERENCE_HEADING_RE.test(text.trim())
  );
}

export function segmentWithIntl(text) {
  if (!globalThis.Intl?.Segmenter) {
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

export function countMeaningfulCharacters(text) {
  const matches = text.match(/[A-Za-z0-9\u4e00-\u9fa5]/g);
  return matches?.length || 0;
}

export function normalizeReadableText(text) {
  return normalizeLineBreaks(text)
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function stripReferenceArtifacts(text) {
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

export function cleanDisplayText(text) {
  return normalizeReadableText(stripReferenceArtifacts(text));
}

export function sanitizeTextForSpeech(text) {
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

export function hasStrongSentenceEnding(text) {
  return /[。！？!?…]["”’')\]]*$/.test(text.trim());
}

export function joinSentences(previous, next) {
  return shouldInsertSpaceBetween(previous, next) ? " " : "";
}

export function shouldInsertSpaceBetween(previous, next) {
  const left = (previous || "").trim();
  const right = (next || "").trim();
  if (!left || !right || !/^[A-Za-z0-9]/.test(right)) {
    return false;
  }
  return /[A-Za-z0-9](?:[.!?;:,]["”’')\]]*)?$/.test(left);
}

export function stripFileExtension(fileName) {
  return fileName.replace(/\.[^.]+$/, "");
}

export function cleanHeading(input) {
  return input.replace(/^#+\s*/, "").replace(/\s+/g, " ").trim();
}

export function normalizeLineBreaks(text) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function normalizeWhitespace(text) {
  return normalizeLineBreaks(text)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function normalizeSectionKey(text) {
  return cleanHeading(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "");
}

export function stripLeadingHeadingFromText(text, title) {
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

export function normalizeBookSections(sections, options = {}) {
  const prepared = sections.map((section, index) => prepareSectionForReading(section, index)).filter(Boolean);
  const filtered = prepared.filter((section, index, collection) => !shouldDropSection(section, index, collection));
  const candidates = filtered.length ? filtered : prepared;
  const merged = mergeShortSections(candidates, options);

  return merged
    .map((section, index) => finalizeNormalizedSection(section, index, options))
    .filter(Boolean);
}

export function prepareSectionForReading(section, index) {
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

export function normalizeSectionBody(text) {
  const filteredBlocks = buildParagraphBlocks(text).filter((block) => !shouldDropBlock(block));
  if (!filteredBlocks.length) {
    return "";
  }
  return splitIntoParagraphs(filteredBlocks.join("\n\n")).join("\n\n").trim();
}

export function shouldDropBlock(block) {
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

export function isLikelyTocBlock(text) {
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

export function shouldDropSection(section, index, collection) {
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

export function mergeShortSections(sections, options = {}) {
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

export function finalizeNormalizedSection(section, index, options = {}) {
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

export function resolveSectionTitle(title, preview, index, fallbackTitle) {
  const cleanedTitle = cleanHeading(title || "");
  if (cleanedTitle && !BOILERPLATE_TITLE_RE.test(cleanedTitle) && !isGenericSectionTitle(cleanedTitle)) {
    return cleanedTitle;
  }
  if (preview) {
    return preview;
  }
  return `${fallbackTitle || "正文"} · ${index + 1}`;
}

export function buildSectionPreview(text) {
  const sentence = splitIntoSentences(text)[0] || splitIntoParagraphs(text)[0] || "";
  const normalized = normalizeWhitespace(sentence);
  if (!normalized) {
    return "";
  }
  return normalized.length > SECTION_PREVIEW_CHARS ? `${normalized.slice(0, SECTION_PREVIEW_CHARS).trim()}…` : normalized;
}

export function isGenericSectionTitle(title) {
  const normalized = cleanHeading(title || "");
  return !normalized || GENERIC_SECTION_TITLE_RE.test(normalized);
}

export function mergeSourceHint(previous, next) {
  if (!previous) {
    return next || "";
  }
  if (!next || previous === next) {
    return previous;
  }
  return `${previous} · ${next}`;
}

export function getSectionParagraphCount(section) {
  return section?.paragraphCount || section?.paragraphs?.length || splitIntoParagraphs(section?.text || "").length || 0;
}

export function isMajorSectionTitle(title) {
  const normalized = cleanHeading(title || "");
  return Boolean(normalized) && /^(?:chapter|part|section)\s+\d+|^第[\u4e00-\u9fa50-9零一二三四五六七八九十百千万两〇]+[章节卷部篇回]/i.test(normalized);
}

export function detectSpeechLang(text) {
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
    return /en-GB/i.test(globalThis.navigator?.language || "") ? "en-GB" : "en-US";
  }
  if (chineseCount > 0) {
    return /zh-(TW|HK|MO)/i.test(globalThis.navigator?.language || "") ? "zh-TW" : "zh-CN";
  }
  if (latinCount > 0 || digitCount > 0) {
    return /en-GB/i.test(globalThis.navigator?.language || "") ? "en-GB" : "en-US";
  }
  return globalThis.navigator?.language || "zh-CN";
}
