import fs from "fs";
import path from "path";
import Content, {
  ContentHeading,
  ContentNested,
  ContentObject,
} from "../types/Content";
import { writeFileAtomic } from "../functions/writeJsonFile";
import VerseSchema from "../types/VerseSchema";

// ============================================================================
// Core Content Rendering Options
// ============================================================================

/**
 * Per-format rendering knobs shared by every rendering function below.
 * `TEXT_OPTIONS` and `MARKDOWN_OPTIONS` are the two concrete configurations.
 */
interface RenderOptions {
  includeStrongs: boolean; // Whether to append Strong's numbers after words
  includeMorph: boolean; // Whether to append morphology codes after words
  includeFootnotes: boolean; // Whether footnote markers/content render at all
  footnoteStyle: "inline" | "reference"; // inline = °{...} at point of reference; reference = collected into a footer list
  paragraphMarker: string; // Text inserted at the start of a new paragraph
  lineBreakMarker: string; // Text inserted at an explicit line break
  headingWrapper: (text: string, type?: "standard" | "acrostic") => string; // Wraps rendered heading text; type selects standard vs. acrostic styling
  subtitleWrapper: (text: string) => string; // Wraps rendered subtitle text
  footnoteMarker: (index: number) => string; // Renders the marker for the footnote at the given 0-based index within the current footnotes list
}

/** Rendering configuration for the plain-text export (`exports/text-vbv-strongs`). */
const TEXT_OPTIONS: RenderOptions = {
  includeStrongs: true,
  includeMorph: true,
  includeFootnotes: true,
  footnoteStyle: "inline",
  paragraphMarker: "¶ ",
  lineBreakMarker: "␤",
  headingWrapper: (text, type) =>
    type === "acrostic" ? `[[[${text}]]] ` : `[[${text}]] `,
  subtitleWrapper: (text) => `«${text}» `,
  footnoteMarker: () => "°",
};

/**
 * Letter label for the nth footnote (0-based) in a chapter: a, b, ... z, aa,
 * ab, ... Chapters routinely carry more than 26 footnotes: NKJV1982 PSA 119
 * has 135, reaching "ee".
 */
function footnoteLabel(index: number): string {
  let remaining = index;
  let label = "";
  do {
    label = String.fromCharCode(97 + (remaining % 26)) + label;
    remaining = Math.floor(remaining / 26) - 1;
  } while (remaining >= 0);
  return label;
}

/**
 * Markdown heading marker for a heading's type: one level smaller for
 * acrostic (Hebrew acrostic stanza marker, e.g. Psalm 119) than standard.
 */
function markdownHeadingMarker(type?: "standard" | "acrostic"): string {
  return type === "acrostic" ? "####" : "###";
}

/** Rendering configuration for the markdown export (`exports/markdown-par`). */
const MARKDOWN_OPTIONS: RenderOptions = {
  includeStrongs: false,
  includeMorph: false,
  includeFootnotes: true,
  footnoteStyle: "reference",
  paragraphMarker: "\n\n",
  lineBreakMarker: "<br>",
  headingWrapper: (text, type) => `\n${markdownHeadingMarker(type)} ${text}\n`,
  subtitleWrapper: (text) => `> _${text}_`,
  footnoteMarker: (index) => `<sup>${footnoteLabel(index)}</sup>`,
};

// ============================================================================
// Core Rendering Functions
// ============================================================================

/** Threaded through every render call in a single conversion pass. */
interface RenderContext {
  options: RenderOptions; // Active TEXT_OPTIONS or MARKDOWN_OPTIONS
  footnotes: string[]; // Collected reference-style footnote lines (populated only when footnoteStyle is "reference"); the caller reads this back after rendering
  verseNum?: number; // Current verse number; falls back to this as the footnote prefix ("N.") when footnotePrefix isn't set
  footnotePrefix?: string; // "Subtitle." or "Heading." for special contexts
}

/**
 * Render any Content to a string based on options.
 */
function renderContent(content: Content, ctx: RenderContext): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content.map((item) => renderContent(item, ctx)).join("");
  }

  if ("heading" in content) {
    const inner = renderContent(content.heading, {
      ...ctx,
      footnotePrefix: "Heading.",
    });
    return ctx.options.headingWrapper(inner, (content as ContentHeading).type);
  }

  if ("subtitle" in content) {
    const inner = renderContent(content.subtitle, {
      ...ctx,
      footnotePrefix: "Subtitle.",
    });
    return ctx.options.subtitleWrapper(inner);
  }

  // Bible reference link - render content override when provided, else the reference text
  if ("bibleLink" in content) {
    if (content.content !== undefined) {
      return renderContent(content.content, ctx);
    }
    return content.bibleLink;
  }

  // Paragraph wrapper object - contains nested paragraph content (not a flag)
  if (
    "paragraph" in content &&
    content.paragraph !== undefined &&
    typeof content.paragraph !== "boolean"
  ) {
    return renderContent(content.paragraph, ctx);
  }

  // Nested content object (content property with optional strong, morph, foot, etc.)
  if (
    "content" in content &&
    !("heading" in content) &&
    !("subtitle" in content)
  ) {
    return renderNestedContent(content as ContentNested, ctx);
  }

  // Text object (may have paragraph flag, strong, morph, etc.)
  return renderTextObject(content as ContentObject, ctx);
}

/**
 * Render a ContentObject (text with optional strong, morph, foot, paragraph, break)
 */
function renderTextObject(obj: ContentObject, ctx: RenderContext): string {
  const parts: string[] = [];

  if (obj.paragraph) {
    // Text format needs a space before the marker to separate it from the
    // previous word's Strong's/morph
    if (ctx.options.footnoteStyle === "inline") {
      parts.push(" " + ctx.options.paragraphMarker);
    } else {
      parts.push(ctx.options.paragraphMarker);
    }
  }

  let text = obj.text || "";

  // Small caps render as uppercase in the text and markdown exports
  if (obj.marks?.includes("sc")) {
    text = text.toUpperCase();
  }

  parts.push(text);

  // Footnote marker and content come before Strong's/morph so users can
  // search/replace °{...} cleanly without affecting Strong's spacing
  if (obj.foot && ctx.options.includeFootnotes) {
    const footIndex = ctx.footnotes.length;
    parts.push(ctx.options.footnoteMarker(footIndex));

    const footnoteContent = renderContent(obj.foot.content, {
      ...ctx,
      options: { ...ctx.options, includeStrongs: false, includeMorph: false },
      footnotePrefix: undefined, // Don't propagate prefix to footnote content
    });

    if (ctx.options.footnoteStyle === "inline") {
      // No space before { so °{...} stays a clean search/replace target
      parts.push(`{${footnoteContent}}`);
      // A textless footnote-only element needs a trailing space so the next
      // content item is spaced correctly
      if (!text && !obj.strong) {
        parts.push(" ");
      }
    } else {
      const prefix = ctx.footnotePrefix || `${ctx.verseNum}.`;
      ctx.footnotes.push(
        `- ${ctx.options.footnoteMarker(footIndex)} ${prefix} ${footnoteContent}`
      );
    }
  }

  if (obj.strong && ctx.options.includeStrongs) {
    parts.push(" " + obj.strong);
  }

  if (obj.morph && ctx.options.includeMorph) {
    parts.push(` (${obj.morph})`);
  }

  if (obj.break) {
    parts.push(ctx.options.lineBreakMarker);
  }

  return parts.join("");
}

/**
 * Render a ContentNested — like renderTextObject, but the payload is nested
 * content rather than a text property.
 */
function renderNestedContent(obj: ContentNested, ctx: RenderContext): string {
  const parts: string[] = [];

  if (obj.paragraph) {
    // Text format needs a space before the marker to separate it from the
    // previous word's Strong's/morph
    if (ctx.options.footnoteStyle === "inline") {
      parts.push(" " + ctx.options.paragraphMarker);
    } else {
      parts.push(ctx.options.paragraphMarker);
    }
  }

  const nestedText = renderContent(obj.content, ctx);
  parts.push(nestedText);

  // Footnote marker and content come before Strong's/morph so °{...} stays a
  // clean search/replace target
  if (obj.foot && ctx.options.includeFootnotes) {
    const footIndex = ctx.footnotes.length;
    parts.push(ctx.options.footnoteMarker(footIndex));

    const footnoteContent = renderContent(obj.foot.content, {
      ...ctx,
      options: { ...ctx.options, includeStrongs: false, includeMorph: false },
      footnotePrefix: undefined,
    });

    if (ctx.options.footnoteStyle === "inline") {
      parts.push(`{${footnoteContent}}`);
      if (!nestedText && !obj.strong) {
        parts.push(" ");
      }
    } else {
      const prefix = ctx.footnotePrefix || `${ctx.verseNum}.`;
      ctx.footnotes.push(
        `- ${ctx.options.footnoteMarker(footIndex)} ${prefix} ${footnoteContent}`
      );
    }
  }

  if (obj.strong && ctx.options.includeStrongs) {
    parts.push(" " + obj.strong);
  }

  if (obj.morph && ctx.options.includeMorph) {
    parts.push(` (${obj.morph})`);
  }

  // Lemma is included when Strong's are shown, since the two are related
  if (obj.lemma && ctx.options.includeStrongs) {
    parts.push(` [${obj.lemma}]`);
  }

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

  text = text.replace(/^ +/, "");
  text = text.replace(/ +$/, "");
  text = text.replace(/ +/g, " ");

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

  let headingPrefix = "";
  let processedContent = verse.content;

  // A leading heading renders above the verse number rather than inline with the verse text
  if (Array.isArray(verse.content) && verse.content.length > 0) {
    const firstItem = verse.content[0];
    if (typeof firstItem === "object" && "heading" in firstItem) {
      const headingText = renderContent(firstItem.heading, {
        ...ctx,
        footnotePrefix: "Heading.",
      });
      const marker = markdownHeadingMarker((firstItem as ContentHeading).type);
      headingPrefix = `\n${marker} ${headingText}\n`;
      processedContent = verse.content.slice(1);
    }
  }

  // Whether the verse (after any heading is pulled out) opens its own paragraph, which decides the blank line below
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

  // For leading paragraphs, strip the leading \n\n since paragraphPrefix handles it
  if (hasLeadingParagraph) {
    text = text.replace(/^\n\n/, "");
  }

  text = text.replace(/^ +/, "");
  text = text.replace(/ +/g, " ");
  text = text.replace(/ ([.,;:!?])/g, "$1"); // Remove space before punctuation

  const paragraphPrefix = hasLeadingParagraph ? "\n" : "";

  return `${headingPrefix}${paragraphPrefix}<sup>${verse.verse}</sup> ${text}`;
}

// ============================================================================
// File I/O Functions
// ============================================================================

/**
 * Converts every book in a Bible version to plain text and writes the
 * results under `exports/text-vbv-strongs/<version>/`. Pass `bookId` to
 * limit the run to a single book's file.
 */
async function convertBibleVersion(
  version: string,
  bookId?: string
): Promise<void> {
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

    await writeFileAtomic(outputPath, textLines.join("\n"));
  }
}

/**
 * Converts every book in a Bible version to markdown, grouped by chapter,
 * and writes the results under `exports/markdown-par/<version>/`. Pulls a
 * chapter-opening subtitle and/or heading out of verse 1 to print above the
 * chapter heading rather than inline, and collects "reference"-style
 * footnotes into a per-chapter list at the end of each chapter. Pass
 * `bookId` to limit the run to a single book's file.
 */
async function convertBibleVersionToMarkdown(
  version: string,
  bookId?: string
): Promise<void> {
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

      // A leading subtitle prints above the chapter rather than inside verse 1
      if (chapterVerses.length > 0) {
        const firstContent = chapterVerses[0].content;
        if (Array.isArray(firstContent) && firstContent.length > 0) {
          const firstItem = firstContent[0];
          if (typeof firstItem === "object" && "subtitle" in firstItem) {
            const ctx: RenderContext = {
              options: { ...MARKDOWN_OPTIONS, includeFootnotes: true },
              footnotes: chapterFootnotes,
              verseNum: chapterVerses[0].verse,
              footnotePrefix: "Subtitle.",
            };
            const subtitleText = renderContent(firstItem.subtitle, ctx);
            markdownLines.push("");
            markdownLines.push(`> _${subtitleText}_`);
            chapterVerses[0].content = firstContent.slice(1);
          }
        }
      }

      // A leading heading prints above the chapter rather than inside verse 1
      if (chapterVerses.length > 0) {
        const firstContent = chapterVerses[0].content;
        if (Array.isArray(firstContent) && firstContent.length > 0) {
          const firstItem = firstContent[0];
          if (typeof firstItem === "object" && "heading" in firstItem) {
            const ctx: RenderContext = {
              options: { ...MARKDOWN_OPTIONS, includeFootnotes: true },
              footnotes: chapterFootnotes,
              footnotePrefix: "Heading.",
            };
            const headingText = renderContent(firstItem.heading, ctx);
            const marker = markdownHeadingMarker(
              (firstItem as ContentHeading).type
            );
            markdownLines.push("");
            markdownLines.push(`${marker} ${headingText}`);
            chapterVerses[0].content = firstContent.slice(1);
          }
        }
      }

      // Whether verse 1 opens its own paragraph, which decides the blank line
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
    await writeFileAtomic(outputPath, markdownLines.join("\n") + "\n");
    console.log(`Markdown conversion complete: ${outputPath}`);
  }
}

async function main(): Promise<void> {
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
    await convertBibleVersion(version, bookId);
    await convertBibleVersionToMarkdown(version, bookId);
  }

  console.log("Conversion complete!");
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Export failed with error:", error.message);
    process.exit(1);
  });
}

export { convertVerseToText, convertVerseToMarkdown };
