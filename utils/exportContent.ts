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

  // Check for subtitle (future feature, skip for now)
  if ("subtitle" in content) {
    return "";
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
    if ("heading" in content || "subtitle" in content) {
      return; // Skip headings and subtitles in text export
    }

    if ("paragraph" in content && !("text" in content)) {
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
    if (obj.text) {
      // Build the text with formatting but without footnote
      let textPart = obj.text || "";

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
      if (obj.paragraph) {
        textPart = "¶ " + textPart;
      }

      textParts.push(textPart);

      if (obj.foot) {
        textParts.push(convertFootnoteToText(obj.foot));
      }

      if (obj.break) {
        textParts.push("␤");
      }
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
        prev.match(/[,.;:!?<>}]/) ||
        part.startsWith(" ")
      ) {
        return part;
      }
      return " " + part;
    })
    .join("");

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
      // Chapter header
      markdownLines.push(`## Chapter ${chapterNum}`);

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

      // Only add blank line after chapter header if first verse doesn't start with paragraph
      if (!firstVerseHasLeadingParagraph) {
        markdownLines.push("");
      }

      const chapterFootnotes: string[] = [];

      for (const verse of chapterVerses) {
        const verseText = convertVerseToMarkdown(verse, chapterFootnotes);
        markdownLines.push(verseText);
      }

      // Add chapter footnotes if any
      if (chapterFootnotes.length > 0) {
        markdownLines.push("");
        for (const footnote of chapterFootnotes) {
          markdownLines.push(`> ${footnote}`);
        }
        markdownLines.push("");
      }
    }

    const outputPath = path.join(outputDir, file.replace(".json", ".md"));
    fs.writeFileSync(outputPath, markdownLines.join("\n"), "utf-8");
    console.log(`Markdown conversion complete: ${outputPath}`);
  }
}

function convertVerseToMarkdown(
  verse: VerseSchema,
  chapterFootnotes: string[]
): string {
  // Use verse number from the verse object
  const verseNum = verse.verse;

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
      return; // Skip headings in markdown export
    }

    if ("subtitle" in content) {
      return; // Skip subtitles in markdown export
    }

    if ("paragraph" in content && !("text" in content)) {
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

    if (obj.text) {
      textParts.push(obj.text);

      if (obj.foot) {
        // Add footnote marker using letters (a, b, c...) cycling back to 'a' after 'z'
        const footnoteLetter = String.fromCharCode(
          97 + (chapterFootnotes.length % 26)
        ); // 97 = 'a'
        textParts.push(`<sup>${footnoteLetter}</sup>`);

        const footnoteContent = convertContentToText(obj.foot.content);
        chapterFootnotes.push(
          `- <sup>${footnoteLetter}</sup> ${verseNum}. ${footnoteContent}`
        );
      }

      // Add line break if needed
      if (obj.break) {
        textParts.push("<br>");
      }
    }
  }

  // Check if content starts with paragraph
  const content = verse.content;
  if (typeof content === "object" && !Array.isArray(content)) {
    if ("paragraph" in content || (content as ContentObject).paragraph) {
      hasLeadingParagraph = true;
    }
  } else if (Array.isArray(content) && content.length > 0) {
    const first = content[0];
    if (
      typeof first === "object" &&
      ("paragraph" in first || (first as ContentObject).paragraph)
    ) {
      hasLeadingParagraph = true;
    }
  }

  processContent(content, true);

  // Join text parts without adding spaces, as source data should include them
  let joinedText = textParts.join("");

  // Clean up multiple spaces
  joinedText = joinedText.replace(/ +/g, " ");

  // Fix spacing around punctuation (redundant but safe)
  joinedText = joinedText.replace(/ ([.,;:!?])/g, "$1");

  // Handle leading paragraph break
  const paragraphPrefix = hasLeadingParagraph ? "\n" : "";

  // Return with superscript verse number and space
  return `${paragraphPrefix}<sup>${verseNum}</sup> ${joinedText}`;
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
