import fs from "fs";
import path from "path";
import Node from "../types/Node";
import Footnote from "../types/Footnote";
import Book from "../types/Book";
import VerseSchema from "../types/VerseSchema";

function convertNodeToText(node: Node): string {
  // Handle paragraph nodes
  if (node.type === "p") {
    return "¶ ";
  }

  // Handle line break nodes
  if (node.type === "n") {
    return "␤";
  }

  let result = node.text || "";

  // Add strong number after text with space
  if (node.strong) {
    if (result) {
      result += " " + node.strong;
    } else {
      result = node.strong;
    }
  }

  // Add morph in parentheses
  if (node.morph) {
    result += " (" + node.morph + ")";
  }

  return result;
}

/**
 * Render an array of nodes to plain text, inserting spaces between
 * nodes when appropriate (not inserting extra spaces around punctuation).
 */
function renderNodesToText(nodes: Node[]): string {
  const parts = nodes.map((node) => convertNodeToText(node));

  // Join parts with spacing rules similar to verse rendering
  const joined = parts
    .map((part, index) => {
      if (index === 0) return part;
      const prev = parts[index - 1] || "";
      const prevTrim = prev.trim();
      const partTrim = part.trim();
      // Don't add space if current part starts with punctuation or previous ends with punctuation
      if (partTrim.match(/^[,.;:!?\[\]]/) || prevTrim.match(/[,.;:!?\[\]]$/)) {
        return part;
      }
      return " " + part;
    })
    .join("");

  return joined;
}

function convertFootnoteToText(footnote: Footnote): string {
  const contentText = renderNodesToText(footnote.content);
  return `° {${contentText}}`;
}

function convertVerseToText(verse: VerseSchema): string {
  // Use chapter and verse from the verse object
  const chapter = verse.chapter.toString().padStart(3, "0");
  const verseNum = verse.verse.toString().padStart(3, "0");

  const textParts: string[] = [];
  const footnoteParts: string[] = [];

  for (const node of verse.content) {
    if (node.foot) {
      // Add footnote marker after the text
      textParts.push(node.text || "");
      footnoteParts.push(convertFootnoteToText(node.foot));
    } else {
      textParts.push(convertNodeToText(node));
    }
  }

  // Join text parts with spaces, but handle punctuation
  const joinedText = textParts
    .map((part, index) => {
      if (index === 0) return part;
      // Don't add space if current part starts with punctuation or previous part ends with punctuation
      const prevPart = textParts[index - 1];
      if (part.match(/^[,.;:!?]/) || prevPart.match(/[,.;:!?]$/)) {
        return part;
      }
      return " " + part;
    })
    .join("");

  // Combine text and footnote parts
  const fullText = joinedText + footnoteParts.join(" ");

  // Return with chapter:verse prefix
  return `${chapter}:${verseNum} ${fullText}`;
}

function convertBibleVersion(version: string): void {
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
    .filter((file: string) => file.endsWith(".json"));

  for (const file of files) {
    const inputPath = path.join(inputDir, file);
    const outputPath = path.join(outputDir, file.replace(".json", ".txt"));

    console.log(`Converting ${inputPath} to ${outputPath}`);

    const data: VerseSchema[] = JSON.parse(fs.readFileSync(inputPath, "utf-8"));

    const textLines = data.map((verse) => convertVerseToText(verse));

    fs.writeFileSync(outputPath, textLines.join("\n"), "utf-8");
  }
}

function convertBibleVersionToMarkdown(version: string): void {
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
    .filter((file: string) => file.endsWith(".json"));

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
      const firstVerseHasLeadingParagraph =
        chapterVerses.length > 0 &&
        chapterVerses[0].content.length > 0 &&
        chapterVerses[0].content[0].type === "p";

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

  // Check if verse starts with a paragraph break
  if (verse.content.length > 0 && verse.content[0].type === "p") {
    hasLeadingParagraph = true;
  }

  for (let i = 0; i < verse.content.length; i++) {
    const node = verse.content[i];

    if (node.type === "p") {
      // Skip the first paragraph break if it's leading (will be handled before verse number)
      if (!(i === 0 && hasLeadingParagraph)) {
        // Paragraph break - add a blank line
        textParts.push("\n\n");
      }
    } else if (node.type === "n") {
      // Line break - use HTML break tag for explicit line breaks in markdown
      textParts.push("<br>");
    } else if (node.text) {
      // Add the text
      textParts.push(node.text);

      if (node.foot) {
        // Add footnote marker using letters (a, b, c...) cycling back to 'a' after 'z'
        const footnoteLetter = String.fromCharCode(
          97 + (chapterFootnotes.length % 26)
        ); // 97 = 'a'
        textParts.push(`<sup>${footnoteLetter}</sup>`);

        const footnoteContent = convertFootnoteToMarkdown(node.foot);
        chapterFootnotes.push(
          `- <sup>${footnoteLetter}</sup> ${verseNum}. ${footnoteContent}`
        );
      }

      // Add space if next node is not punctuation text
      if (i < verse.content.length - 1) {
        const nextNode = verse.content[i + 1];
        if (
          !(
            nextNode &&
            !nextNode.type &&
            nextNode.text &&
            nextNode.text.match(/^[.,;:!?]/)
          )
        ) {
          textParts.push(" ");
        }
      }
    }
  }

  // Join text parts
  const joinedText = textParts.join("");

  // Handle leading paragraph break
  const paragraphPrefix = hasLeadingParagraph ? "\n" : "";

  // Return with superscript verse number and space
  return `${paragraphPrefix}<sup>${verseNum}</sup> ${joinedText}`;
}

function convertFootnoteToMarkdown(footnote: Footnote): string {
  return renderNodesToText(footnote.content);
}

function main(): void {
  const versionsDir = path.join(path.dirname(__dirname), "bible-versions");

  // Get all version directories
  const versions = fs.readdirSync(versionsDir).filter((item: string) => {
    const itemPath = path.join(versionsDir, item);
    return fs.statSync(itemPath).isDirectory();
  });

  for (const version of versions) {
    console.log(`Processing version: ${version}`);
    convertBibleVersion(version);
    convertBibleVersionToMarkdown(version);
  }

  console.log("Conversion complete!");
}

if (require.main === module) {
  main();
}
