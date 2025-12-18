import fs from "fs";
import path from "path";
import Content, { ContentObject } from "../types/Content";
import Footnote from "../types/Footnote";
import VerseSchema from "../types/VerseSchema";

// ============================================================================
// Core Content Rendering Options
// ============================================================================

interface RenderOptions {
  includeStrongs: boolean;
  includeMorph: boolean;
  includeFootnotes: boolean;
  footnoteStyle: "inline" | "reference";
  paragraphMarker: string;
  lineBreakMarker: string;
  headingWrapper: (text: string) => string;
  subtitleWrapper: (text: string) => string;
  footnoteMarker: (index: number) => string;
}

const TEXT_OPTIONS: RenderOptions = {
  includeStrongs: true,
  includeMorph: true,
  includeFootnotes: true,
  footnoteStyle: "inline",
  paragraphMarker: "¶ ",
  lineBreakMarker: " ␤",
  headingWrapper: (text) => `[[${text}]] `,
  subtitleWrapper: (text) => `«${text}» `,
  footnoteMarker: () => "°",
};

const MARKDOWN_OPTIONS: RenderOptions = {
  includeStrongs: false,
  includeMorph: false,
  includeFootnotes: true,
  footnoteStyle: "reference",
  paragraphMarker: "\n\n",
  lineBreakMarker: "<br>",
  headingWrapper: (text) => `\n### ${text}\n`,
  subtitleWrapper: (text) => `> _${text}_`,
  footnoteMarker: (index) =>
    `<sup>${String.fromCharCode(97 + (index % 26))}</sup>`,
};

// ============================================================================
// Core Rendering Functions
// ============================================================================

interface RenderContext {
  options: RenderOptions;
  footnotes: string[];
  verseNum?: number;
}

/**
 * Render any Content to a string based on options.
 */
function renderContent(content: Content, ctx: RenderContext): string {
  // String content
  if (typeof content === "string") {
    return content;
  }

  // Array content - join all rendered parts
  if (Array.isArray(content)) {
    return content.map((item) => renderContent(item, ctx)).join("");
  }

  // Object content - dispatch by type
  if ("heading" in content) {
    const inner = renderContent(content.heading, ctx);
    return ctx.options.headingWrapper(inner);
  }

  if ("subtitle" in content) {
    const inner = renderContent(content.subtitle, ctx);
    return ctx.options.subtitleWrapper(inner);
  }

  // Paragraph wrapper object - contains nested paragraph content (not a flag)
  if (
    "paragraph" in content &&
    content.paragraph !== undefined &&
    typeof content.paragraph !== "boolean"
  ) {
    return renderContent(content.paragraph, ctx);
  }

  // Text object (may have paragraph flag, strong, morph, etc.)
  return renderTextObject(content as ContentObject, ctx);
}

/**
 * Render a ContentObject (text with optional strong, morph, foot, paragraph, break)
 */
function renderTextObject(obj: ContentObject, ctx: RenderContext): string {
  const parts: string[] = [];

  // Paragraph marker at start (only for text format, markdown handles separately)
  if (obj.paragraph && ctx.options.footnoteStyle === "inline") {
    parts.push(ctx.options.paragraphMarker);
  }

  // Text content
  const text = obj.text || "";
  parts.push(text);

  // Footnote marker (after text, before Strong's)
  if (obj.foot && ctx.options.includeFootnotes) {
    const footIndex = ctx.footnotes.length;
    parts.push(ctx.options.footnoteMarker(footIndex));

    // Add footnote to collection
    const footnoteContent = renderContent(obj.foot.content, {
      ...ctx,
      options: { ...ctx.options, includeStrongs: false, includeMorph: false },
    });

    if (ctx.options.footnoteStyle === "inline") {
      parts.push(` {${footnoteContent}}`);
    } else {
      ctx.footnotes.push(
        `- ${ctx.options.footnoteMarker(footIndex)} ${ctx.verseNum}. ${footnoteContent}`
      );
    }
  }

  // Strong's number
  if (obj.strong && ctx.options.includeStrongs) {
    // Always add space before Strong's
    parts.push(" " + obj.strong);
  }

  // Morph code
  if (obj.morph && ctx.options.includeMorph) {
    parts.push(` (${obj.morph})`);
  }

  // Line break marker
  if (obj.break) {
    parts.push(ctx.options.lineBreakMarker);
  }

  return parts.join("");
}

// ============================================================================
// Verse Conversion Functions
// ============================================================================

/**
 * Convert a verse to plain text with Strong's numbers and morph codes.
 */
function convertVerseToText(verse: VerseSchema): string {
  const chapter = verse.chapter.toString().padStart(3, "0");
  const verseNum = verse.verse.toString().padStart(3, "0");

  const ctx: RenderContext = {
    options: TEXT_OPTIONS,
    footnotes: [],
    verseNum: verse.verse,
  };

  let text = renderContent(verse.content, ctx);

  // Clean up spacing issues
  text = text.replace(/^ +/, ""); // Remove leading spaces
  text = text.replace(/ +/g, " "); // Collapse multiple spaces

  return `${chapter}:${verseNum} ${text}`;
}

/**
 * Convert a verse to markdown format.
 */
function convertVerseToMarkdown(
  verse: VerseSchema,
  chapterFootnotes: string[]
): string {
  const ctx: RenderContext = {
    options: MARKDOWN_OPTIONS,
    footnotes: chapterFootnotes,
    verseNum: verse.verse,
  };

  // Check if verse starts with heading
  let headingPrefix = "";
  let processedContent = verse.content;

  if (Array.isArray(verse.content) && verse.content.length > 0) {
    const firstItem = verse.content[0];
    if (typeof firstItem === "object" && "heading" in firstItem) {
      const headingText = renderContent(firstItem.heading, {
        ...ctx,
        options: { ...ctx.options, includeFootnotes: false },
      });
      headingPrefix = `\n### ${headingText}\n`;
      processedContent = verse.content.slice(1);
    }
  }

  // Check for leading paragraph
  let hasLeadingParagraph = false;
  if (Array.isArray(processedContent) && processedContent.length > 0) {
    const first = processedContent[0];
    if (
      typeof first === "object" &&
      ("paragraph" in first || (first as ContentObject).paragraph)
    ) {
      hasLeadingParagraph = true;
    }
  } else if (
    typeof processedContent === "object" &&
    !Array.isArray(processedContent)
  ) {
    if (
      "paragraph" in processedContent ||
      (processedContent as ContentObject).paragraph
    ) {
      hasLeadingParagraph = true;
    }
  }

  let text = renderContent(processedContent, ctx);

  // Clean up extra spaces and leading space after verse number
  text = text.replace(/^ +/, ""); // Remove leading spaces
  text = text.replace(/ +/g, " ");
  text = text.replace(/ ([.,;:!?])/g, "$1");

  const paragraphPrefix = hasLeadingParagraph ? "\n" : "";

  return `${headingPrefix}${paragraphPrefix}<sup>${verse.verse}</sup> ${text}`;
}

// ============================================================================
// File I/O Functions (unchanged)
// ============================================================================

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

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const files = fs
    .readdirSync(inputDir)
    .filter(
      (file: string) => file.endsWith(".json") && file !== "_version.json"
    )
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

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const files = fs
    .readdirSync(inputDir)
    .filter(
      (file: string) => file.endsWith(".json") && file !== "_version.json"
    )
    .filter((file: string) => !bookId || file.includes(`-${bookId}.json`));

  for (const file of files) {
    const inputPath = path.join(inputDir, file);
    const verses: VerseSchema[] = JSON.parse(
      fs.readFileSync(inputPath, "utf-8")
    );

    if (verses.length === 0) continue;

    // Group verses by chapter
    const chapters = new Map<number, VerseSchema[]>();
    for (const verse of verses) {
      if (!chapters.has(verse.chapter)) {
        chapters.set(verse.chapter, []);
      }
      chapters.get(verse.chapter)!.push(verse);
    }

    const sortedChapters = Array.from(chapters.entries()).sort(
      ([a], [b]) => a - b
    );
    const markdownLines: string[] = [];

    for (const [chapterNum, chapterVerses] of sortedChapters) {
      if (chapterNum > 1) {
        markdownLines.push("");
      }
      markdownLines.push(`## Chapter ${chapterNum}`);

      const chapterFootnotes: string[] = [];

      // Check for subtitle in first verse
      if (chapterVerses.length > 0) {
        const firstContent = chapterVerses[0].content;
        if (Array.isArray(firstContent) && firstContent.length > 0) {
          const firstItem = firstContent[0];
          if (typeof firstItem === "object" && "subtitle" in firstItem) {
            const ctx: RenderContext = {
              options: { ...MARKDOWN_OPTIONS, includeFootnotes: true },
              footnotes: chapterFootnotes,
              verseNum: chapterVerses[0].verse,
            };
            const subtitleText = renderContent(firstItem.subtitle, ctx);
            markdownLines.push("");
            markdownLines.push(`> _${subtitleText}_`);
            chapterVerses[0].content = firstContent.slice(1);
          }
        }
      }

      // Check for heading in first verse
      if (chapterVerses.length > 0) {
        const firstContent = chapterVerses[0].content;
        if (Array.isArray(firstContent) && firstContent.length > 0) {
          const firstItem = firstContent[0];
          if (typeof firstItem === "object" && "heading" in firstItem) {
            const ctx: RenderContext = {
              options: { ...MARKDOWN_OPTIONS, includeFootnotes: false },
              footnotes: [],
            };
            const headingText = renderContent(firstItem.heading, ctx);
            markdownLines.push("");
            markdownLines.push(`### ${headingText}`);
            chapterVerses[0].content = firstContent.slice(1);
          }
        }
      }

      // Check for leading paragraph on first verse
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

      if (!firstVerseHasLeadingParagraph) {
        markdownLines.push("");
      }

      for (const verse of chapterVerses) {
        const verseText = convertVerseToMarkdown(verse, chapterFootnotes);
        markdownLines.push(verseText);
      }

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

// Export functions for testing
export { convertVerseToText, convertVerseToMarkdown };
