import fs from "fs";
import path from "path";
import Content, { ContentObject } from "../types/Content";
import Footnote from "../types/Footnote";
import VerseSchema from "../types/VerseSchema";

/**
 * Convert content (string, object, or array) to plain text for export
 */
function convertContentToText(content: Content): string {
  // Handle string content
  if (typeof content === "string") {
    return content;
  }

  // Handle array content
  if (Array.isArray(content)) {
    return renderContentToText(content);
  }

  // Handle object content
  // Check for heading (skip in exports)
  if ("heading" in content) {
    return "";
  }

  // Check for paragraph wrapper (not paragraph property on text)
  if ("paragraph" in content && !("text" in content)) {
    const paragraphContent = (content as any).paragraph as Content;
    if (
      paragraphContent !== undefined &&
      typeof paragraphContent !== "boolean"
    ) {
      const paragraphText = convertContentToText(paragraphContent);
      return "¶ " + paragraphText;
    }
    return "";
  }

  // Check for subtitle
  if ("subtitle" in content) {
    const subtitleText =
      typeof content.subtitle === "string"
        ? content.subtitle
        : convertContentToText(content.subtitle);
    return `«${subtitleText}» `;
  }

  // Handle text object
  const obj = content as ContentObject;
  let result = obj.text || "";

  // Add strong number after text with space
  if (obj.strong) {
    if (result.trim() === "") {
      result += obj.strong;
    } else {
      result += " " + obj.strong;
    }
  }

  // Add morph in parentheses
  if (obj.morph) {
    result += " (" + obj.morph + ")";
  }

  // Add line break marker if needed
  if (obj.break) {
    result += "␤";
  }

  // Add paragraph marker at the beginning if this starts a paragraph
  if (obj.paragraph) {
    result = "¶ " + result;
  }

  return result;
}

/**
 * Render an array of content to plain text, inserting spaces between
 * elements when appropriate (not inserting extra spaces around punctuation).
 */
function renderContentToText(content: Content[]): string {
  const parts = content.map((item) => convertContentToText(item));

  // Join parts without adding spaces, as source data should include them
  const joined = parts.join("");

  return joined;
}

/**
 * Process subtitle content, extracting text and footnotes
 */
function processSubtitleContent(
  content: Content,
  footnotes: string[],
  footnoteStartIndex: number = 0
): string {
  const textParts: string[] = [];
  let footnoteIndex = footnoteStartIndex;

  function processItem(item: Content): void {
    if (typeof item === "string") {
      textParts.push(item);
      return;
    }

    if (Array.isArray(item)) {
      item.forEach(processItem);
      return;
    }

    // Handle object
    const obj = item as ContentObject;

    if (obj.text) {
      textParts.push(obj.text);
    }

    if (obj.foot) {
      const letter = String.fromCharCode(97 + (footnoteIndex % 26));
      textParts.push(`<sup>${letter}</sup>`);
      const footnoteContent =
        typeof obj.foot.content === "string"
          ? obj.foot.content
          : convertContentToMarkdownText(obj.foot.content);
      footnotes.push(`- <sup>${letter}</sup> Subtitle. ${footnoteContent}`);
      footnoteIndex++;
    }
  }

  processItem(content);
  return textParts.join("");
}
/**
 * Process subtitle content for text export, extracting text and footnotes
 */
function processSubtitleContentText(
  content: Content,
  footnotes: Array<{ content: string }>
): string {
  const textParts: string[] = [];

  function processItem(item: Content): void {
    if (typeof item === "string") {
      textParts.push(item);
      return;
    }

    if (Array.isArray(item)) {
      item.forEach(processItem);
      return;
    }

    // Handle object
    const obj = item as ContentObject;

    if (obj.text) {
      textParts.push(obj.text);
    }

    if (obj.foot) {
      textParts.push("°");
      const footnoteContent =
        typeof obj.foot.content === "string"
          ? obj.foot.content
          : convertContentToText(obj.foot.content);
      textParts.push(` {${footnoteContent}}`);
      footnotes.push({ content: footnoteContent });
    }
  }

  processItem(content);
  return textParts.join("");
}

/**
 * Convert content to plain text for markdown (without Strong's numbers or morph codes)
 */
function convertContentToMarkdownText(content: Content): string {
  // Handle string content
  if (typeof content === "string") {
    return content;
  }

  // Handle array content
  if (Array.isArray(content)) {
    return content.map((item) => convertContentToMarkdownText(item)).join("");
  }

  // Handle object content
  // Check for heading (skip in exports)
  if ("heading" in content) {
    return "";
  }

  // Check for paragraph wrapper (not paragraph property on text)
  if ("paragraph" in content && !("text" in content)) {
    const paragraphContent = (content as any).paragraph as Content;
    if (
      paragraphContent !== undefined &&
      typeof paragraphContent !== "boolean"
    ) {
      return convertContentToMarkdownText(paragraphContent);
    }
    return "";
  }

  // Check for subtitle
  if ("subtitle" in content) {
    const subtitleText =
      typeof content.subtitle === "string"
        ? content.subtitle
        : convertContentToMarkdownText(content.subtitle);
    return subtitleText;
  }

  // Handle text object
  const obj = content as ContentObject;
  let result = obj.text || "";

  // Skip strong numbers and morph codes in markdown export

  return result;
}

function convertFootnoteToText(footnote: Footnote): string {
  const contentText = convertContentToText(footnote.content);
  return `° {${contentText}}`;
}

function convertVerseToText(verse: VerseSchema): string {
  // Use chapter and verse from the verse object
  const chapter = verse.chapter.toString().padStart(3, "0");
  const verseNum = verse.verse.toString().padStart(3, "0");

  // Helper function to extract footnotes and text from content
  function extractTextAndFootnotes(
    content: Content,
    textParts: string[],
    footnoteParts: string[]
  ): void {
    if (typeof content === "string") {
      textParts.push(content);
      return;
    }

    if (Array.isArray(content)) {
      for (const item of content) {
        extractTextAndFootnotes(item, textParts, footnoteParts);
      }
      return;
    }

    // Handle object content
    if ("heading" in content) {
      const headingText =
        typeof content.heading === "string"
          ? content.heading
          : convertContentToText(content.heading);
      textParts.push(`[[${headingText}]]`);
      return;
    }

    if ("subtitle" in content) {
      const subtitleFootnotes: Array<{ content: string }> = [];
      const subtitleText =
        typeof content.subtitle === "string"
          ? content.subtitle
          : processSubtitleContentText(content.subtitle, subtitleFootnotes);
      textParts.push(`«${subtitleText}»`);
      // Add subtitle footnotes to the footnote parts
      for (const fn of subtitleFootnotes) {
        footnoteParts.push(`Subtitle. ${fn.content}`);
      }
      return;
    }

    if (
      "paragraph" in content &&
      !("text" in content) &&
      !("foot" in content)
    ) {
      const paragraphContent = (content as any).paragraph as Content;
      if (
        paragraphContent !== undefined &&
        typeof paragraphContent !== "boolean"
      ) {
        extractTextAndFootnotes(paragraphContent, textParts, footnoteParts);
      }
      return;
    }

    // Handle text object
    const obj = content as ContentObject;
    let textPart = obj.text || "";

    if (obj.foot) {
      // For words with footnotes: text° Strong's (morph) {footnote}
      // If there's no text, just add the footnote marker
      if (textPart) {
        textPart += "°";
      } else {
        textPart = "°";
      }
      if (obj.strong) {
        textPart += " " + obj.strong;
      }
      if (obj.morph) {
        textPart += " (" + obj.morph + ")";
      }
      textPart += convertFootnoteToText(obj.foot).replace("° ", " "); // replace ° with space to add space before {
    } else {
      // For words without footnotes: text Strong's (morph)
      if (obj.strong) {
        if (textPart.trim() === "") {
          textPart += obj.strong;
        } else {
          textPart += " " + obj.strong;
        }
      }
      if (obj.morph) {
        textPart += " (" + obj.morph + ")";
      }
    }

    if (obj.paragraph) {
      textPart = "¶ " + textPart;
    }

    // Always add textPart if there's content (including just footnote markers)
    if (textPart) {
      textParts.push(textPart);
    }

    if (obj.break) {
      textParts.push("␤");
    }
  }

  const textParts: string[] = [];
  const footnoteParts: string[] = [];

  extractTextAndFootnotes(verse.content, textParts, footnoteParts);

  // Join text parts with proper spacing
  let joinedText = textParts
    .map((part, index) => {
      if (index === 0) return part;
      const prev = textParts[index - 1] || "";
      // Don't add space before/after line breaks, paragraph marks, or if starts/ends with punctuation or space
      if (
        part === "<br>" ||
        part === "\n\n" ||
        prev === "<br>" ||
        prev === "\n\n"
      ) {
        return part;
      }
      if (
        part.match(/^[<° .,;:!?]/) ||
        (prev.match(/[,.;:!?<>}]/) && !part.match(/^[A-Za-z0-9¶]/)) ||
        part.startsWith(" ")
      ) {
        return part;
      }
      return " " + part;
    })
    .join("")
    .trim(); // Remove leading/trailing whitespace

  // Combine text and footnote parts
  const fullText = joinedText;

  // Return with chapter:verse prefix
  return `${chapter}:${verseNum} ${fullText}`;
}

function convertBibleVersion(version: string, bookId?: string): void {
  const inputDir = path.join(
    path.dirname(__dirname),
    "bible-versions",
    version
  );
  const outputDir = path.join(
    path.dirname(__dirname),
    "exports",
    "text-vbv-strongs",
    version
  );

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Read all JSON files in the version directory
  const files = fs
    .readdirSync(inputDir)
    .filter((file: string) => file.endsWith(".json"))
    .filter((file: string) => !bookId || file.includes(`-${bookId}.json`));

  for (const file of files) {
    const inputPath = path.join(inputDir, file);
    const outputPath = path.join(outputDir, file.replace(".json", ".txt"));

    console.log(`Converting ${inputPath} to ${outputPath}`);

    const data: VerseSchema[] = JSON.parse(fs.readFileSync(inputPath, "utf-8"));

    const textLines = data.map((verse) => convertVerseToText(verse));

    fs.writeFileSync(outputPath, textLines.join("\n"), "utf-8");
  }
}

function convertBibleVersionToMarkdown(version: string, bookId?: string): void {
  const inputDir = path.join(
    path.dirname(__dirname),
    "bible-versions",
    version
  );
  const outputDir = path.join(
    path.dirname(__dirname),
    "exports",
    "markdown-par",
    version
  );

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Read all JSON files in the version directory
  const files = fs
    .readdirSync(inputDir)
    .filter((file: string) => file.endsWith(".json"))
    .filter((file: string) => !bookId || file.includes(`-${bookId}.json`));

  for (const file of files) {
    const inputPath = path.join(inputDir, file);
    const verses: VerseSchema[] = JSON.parse(
      fs.readFileSync(inputPath, "utf-8")
    );

    // Get book name from first verse
    if (verses.length === 0) continue;
    const firstVerse = verses[0];
    const bookID = firstVerse.book;

    // Group verses by chapter
    const chapters = new Map<number, VerseSchema[]>();
    for (const verse of verses) {
      const chapterNum = verse.chapter;
      if (!chapters.has(chapterNum)) {
        chapters.set(chapterNum, []);
      }
      chapters.get(chapterNum)!.push(verse);
    }

    // Sort chapters
    const sortedChapters = Array.from(chapters.entries()).sort(
      ([a], [b]) => a - b
    );

    const markdownLines: string[] = [];

    for (const [chapterNum, chapterVerses] of sortedChapters) {
      // Add blank line before chapter header if not the first chapter
      if (chapterNum > 1) {
        markdownLines.push("");
      }
      // Chapter header
      markdownLines.push(`## Chapter ${chapterNum}`);

      const chapterFootnotes: string[] = [];

      // Check for subtitle in first verse
      let hasSubtitle = false;
      if (chapterVerses.length > 0) {
        const firstContent = chapterVerses[0].content;
        if (Array.isArray(firstContent) && firstContent.length > 0) {
          const firstItem = firstContent[0];
          if (typeof firstItem === "object" && "subtitle" in firstItem) {
            const subtitleText =
              typeof firstItem.subtitle === "string"
                ? firstItem.subtitle
                : processSubtitleContent(
                    firstItem.subtitle,
                    chapterFootnotes,
                    0
                  );
            markdownLines.push("");
            markdownLines.push(`> _${subtitleText}_`);
            // Remove the subtitle from the verse content
            chapterVerses[0].content = firstContent.slice(1);
            hasSubtitle = true;
          }
        }
      }

      // Check for heading in first verse (after subtitle removal)
      if (chapterVerses.length > 0) {
        const firstContent = chapterVerses[0].content;
        if (Array.isArray(firstContent) && firstContent.length > 0) {
          const firstItem = firstContent[0];
          if (typeof firstItem === "object" && "heading" in firstItem) {
            const headingText =
              typeof firstItem.heading === "string"
                ? firstItem.heading
                : convertContentToMarkdownText(firstItem.heading);
            markdownLines.push("");
            markdownLines.push(`### ${headingText}`);
            // Remove the heading from the verse content
            chapterVerses[0].content = firstContent.slice(1);
          }
        }
      }

      // Check if first verse starts with paragraph break
      let firstVerseHasLeadingParagraph = false;
      if (chapterVerses.length > 0) {
        const firstContent = chapterVerses[0].content;
        if (typeof firstContent === "object" && !Array.isArray(firstContent)) {
          firstVerseHasLeadingParagraph =
            "paragraph" in firstContent ||
            !!(firstContent as ContentObject).paragraph;
        } else if (Array.isArray(firstContent) && firstContent.length > 0) {
          const first = firstContent[0];
          firstVerseHasLeadingParagraph =
            typeof first === "object" &&
            ("paragraph" in first || !!(first as ContentObject).paragraph);
        }
      }

      // Add blank line after chapter header/subtitle if no leading paragraph
      if (!firstVerseHasLeadingParagraph) {
        markdownLines.push("");
      }

      for (const verse of chapterVerses) {
        const verseText = convertVerseToMarkdown(verse, chapterFootnotes);
        markdownLines.push(verseText);
      }

      // Add chapter footnotes if any (no trailing blank line)
      if (chapterFootnotes.length > 0) {
        markdownLines.push("");
        for (const footnote of chapterFootnotes) {
          markdownLines.push(`> ${footnote}`);
        }
      }
    }

    const outputPath = path.join(outputDir, file.replace(".json", ".md"));
    fs.writeFileSync(outputPath, markdownLines.join("\n") + "\n", "utf-8");
    console.log(`Markdown conversion complete: ${outputPath}`);
  }
}

function convertVerseToMarkdown(
  verse: VerseSchema,
  chapterFootnotes: string[]
): string {
  // Use verse number from the verse object
  const verseNum = verse.verse;

  // Check if verse starts with a heading and extract it
  let headingPrefix = "";
  let processedContent = verse.content;

  if (Array.isArray(verse.content) && verse.content.length > 0) {
    const firstItem = verse.content[0];
    if (typeof firstItem === "object" && "heading" in firstItem) {
      const headingText =
        typeof firstItem.heading === "string"
          ? firstItem.heading
          : convertContentToMarkdownText(firstItem.heading);
      headingPrefix = `\n### ${headingText}\n`;
      // Remove heading from content to process
      processedContent = verse.content.slice(1);
    }
  }

  const textParts: string[] = [];
  let hasLeadingParagraph = false;

  // Helper function to process content recursively
  function processContent(content: Content, isFirst: boolean = false): void {
    if (typeof content === "string") {
      textParts.push(content);
      return;
    }

    if (Array.isArray(content)) {
      content.forEach((item, index) =>
        processContent(item, isFirst && index === 0)
      );
      return;
    }

    // Handle object content
    if ("heading" in content) {
      // Headings should have been extracted at chapter level, skip if encountered here
      return;
    }

    if ("subtitle" in content) {
      const subtitleText =
        typeof content.subtitle === "string"
          ? content.subtitle
          : convertContentToMarkdownText(content.subtitle);
      textParts.push(`> _${subtitleText}_`);
      return;
    }

    if (
      "paragraph" in content &&
      !("text" in content) &&
      !("foot" in content)
    ) {
      if (!(isFirst && !hasLeadingParagraph)) {
        textParts.push("\n\n");
      }
      if (
        content.paragraph !== undefined &&
        typeof content.paragraph !== "boolean"
      ) {
        processContent(content.paragraph);
      }
      return;
    }

    // Handle text object
    const obj = content as ContentObject;

    // Check for paragraph marker on text element
    if (obj.paragraph && isFirst) {
      hasLeadingParagraph = true;
    } else if (obj.paragraph) {
      textParts.push("\n\n");
    }

    // Process text if present
    if (obj.text) {
      textParts.push(obj.text);
    }

    // Process footnote (can exist with or without text)
    if (obj.foot) {
      // Add footnote marker using letters (a, b, c...) cycling back to 'a' after 'z'
      const footnoteLetter = String.fromCharCode(
        97 + (chapterFootnotes.length % 26)
      ); // 97 = 'a'
      textParts.push(`<sup>${footnoteLetter}</sup>`);

      const footnoteContent = convertContentToMarkdownText(obj.foot.content);
      chapterFootnotes.push(
        `- <sup>${footnoteLetter}</sup> ${verseNum}. ${footnoteContent}`
      );
    }

    // Add line break if needed
    if (obj.break) {
      textParts.push("<br>");
    }
  }

  // Check if content starts with paragraph (using processedContent after heading extraction)
  if (
    typeof processedContent === "object" &&
    !Array.isArray(processedContent)
  ) {
    if (
      "paragraph" in processedContent ||
      (processedContent as ContentObject).paragraph
    ) {
      hasLeadingParagraph = true;
    }
  } else if (Array.isArray(processedContent) && processedContent.length > 0) {
    const first = processedContent[0];
    if (
      typeof first === "object" &&
      ("paragraph" in first || (first as ContentObject).paragraph)
    ) {
      hasLeadingParagraph = true;
    }
  }

  processContent(processedContent, true);

  // Join text parts without adding spaces, as source data should include them
  let joinedText = textParts.join("");

  // Clean up multiple spaces
  joinedText = joinedText.replace(/ +/g, " ");

  // Fix spacing around punctuation (redundant but safe)
  joinedText = joinedText.replace(/ ([.,;:!?])/g, "$1");

  // Handle leading paragraph break
  const paragraphPrefix = hasLeadingParagraph ? "\n" : "";

  // Return with heading prefix (if any), paragraph prefix, verse number and text
  return `${headingPrefix}${paragraphPrefix}<sup>${verseNum}</sup> ${joinedText}`;
}

function main(): void {
  const translation = process.argv[2];
  const bookId = process.argv[3];

  const versionsDir = path.join(path.dirname(__dirname), "bible-versions");

  let versions: string[];
  if (translation) {
    versions = [translation];
  } else {
    versions = fs.readdirSync(versionsDir).filter((item: string) => {
      const itemPath = path.join(versionsDir, item);
      return fs.statSync(itemPath).isDirectory();
    });
  }

  for (const version of versions) {
    console.log(`Processing version: ${version}`);
    convertBibleVersion(version, bookId);
    convertBibleVersionToMarkdown(version, bookId);
  }

  console.log("Conversion complete!");
}

if (require.main === module) {
  main();
}
