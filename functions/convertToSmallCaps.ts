/**
 * Converts "Lord GOD" and "LORD" patterns to small caps format.
 *
 * Rules:
 * 1. First pass: Convert "Lord GOD" to small caps for both words
 * 2. Second pass: Convert "LORD" to small caps, except when surrounded by other uppercase words
 *    - "O LORD" should be converted (special exception)
 *    - "THE LORD" in all-caps context should NOT be converted
 */

// Type definitions for content structures
type ContentArray = ContentElement[];
type ContentElement = string | ContentObject | ContentArray;
interface ContentObject {
  text?: string;
  content?: ContentElement;
  heading?: ContentElement;
  subtitle?: ContentElement;
  paragraph?: ContentElement | boolean;
  foot?: {
    type?: string;
    content: ContentElement;
  };
  marks?: string[];
  strong?: string;
  morph?: string;
  script?: string;
  lemma?: string;
  break?: boolean;
}

interface SmallCapsText {
  text: string;
  marks: string[];
}

/**
 * Check if a word is all uppercase (2+ chars)
 */
function isAllCaps(word: string): boolean {
  const cleaned = word.replace(/[^A-Za-z]/g, "");
  return cleaned.length >= 2 && cleaned === cleaned.toUpperCase();
}

/**
 * Get the word before and after a match position
 */
function getContextWords(
  text: string,
  matchStart: number,
  matchEnd: number
): { before: string; after: string } {
  const beforeText = text.slice(0, matchStart);
  const afterText = text.slice(matchEnd);

  // Get last word before match
  const beforeMatch = beforeText.match(/(\S+)\s*$/);
  const before = beforeMatch ? beforeMatch[1] : "";

  // Get first word after match
  const afterMatch = afterText.match(/^\s*(\S+)/);
  const after = afterMatch ? afterMatch[1] : "";

  return { before, after };
}

/**
 * Check if LORD should be converted based on surrounding context
 * Returns true if it should be converted, false if it should be left as-is
 */
function shouldConvertLord(
  text: string,
  matchStart: number,
  matchEnd: number
): boolean {
  const { before, after } = getContextWords(text, matchStart, matchEnd);

  // Check for "O LORD" pattern - should always convert
  if (before.toUpperCase() === "O") {
    return true;
  }

  // If preceded by an uppercase word (not "O"), don't convert
  if (before && isAllCaps(before)) {
    return false;
  }

  // If followed by an uppercase word, don't convert
  const afterCleaned = after.replace(/[^A-Za-z]/g, "");
  if (afterCleaned && isAllCaps(afterCleaned)) {
    return false;
  }

  return true;
}

/**
 * Converts "LORD" and "Lord GOD" patterns in a string to small caps format.
 *
 * @param text - The input string
 * @returns Either the original string (if no conversion needed) or an array of content elements
 */
export function convertToSmallCaps(
  text: string
): string | (string | SmallCapsText)[] {
  if (!text || typeof text !== "string") {
    return text;
  }

  const result: (string | SmallCapsText)[] = [];
  let lastIndex = 0;

  // Combined pattern for:
  // 1. "Lord GOD" or "Lord GOD's" (adon yhwh pattern)
  // 2. "LORD GOD" or "LORD GOD's"
  // 3. "LORD" or "LORD's" (standalone)
  const pattern = /\b(Lord|LORD)\s+(GOD(?:'s)?)\b|\b(LORD(?:'s)?)\b/g;

  let match;
  while ((match = pattern.exec(text)) !== null) {
    const fullMatch = match[0];
    const matchStart = match.index;
    const matchEnd = matchStart + fullMatch.length;

    // Check if this is "Lord GOD" or "LORD GOD" pattern
    if (match[1] && match[2]) {
      // Lord GOD or LORD GOD pattern
      const lordPart = match[1]; // "Lord" or "LORD"
      const godPart = match[2]; // "GOD" or "GOD's"

      // Add text before match
      if (matchStart > lastIndex) {
        result.push(text.slice(lastIndex, matchStart));
      }

      // "Lord GOD" (Adonai YHWH) - only GOD gets small caps
      // "LORD GOD" (YHWH Elohim) - both get small caps
      if (lordPart === "Lord") {
        // Adonai YHWH pattern - "Lord" stays regular, "GOD" becomes small caps
        result.push("Lord ");
        const godText =
          godPart.charAt(0).toUpperCase() +
          godPart.slice(1).toLowerCase().replace("'S", "'s");
        result.push({ text: godText, marks: ["sc"] });
      } else {
        // LORD GOD pattern - both become small caps
        result.push({ text: "Lord", marks: ["sc"] });
        result.push(" ");
        const godText =
          godPart.charAt(0).toUpperCase() +
          godPart.slice(1).toLowerCase().replace("'S", "'s");
        result.push({ text: godText, marks: ["sc"] });
      }

      lastIndex = matchEnd;
    } else if (match[3]) {
      // Standalone LORD or LORD's
      const lordMatch = match[3];

      // Check context to determine if we should convert
      if (!shouldConvertLord(text, matchStart, matchEnd)) {
        // Don't convert - just continue
        continue;
      }

      // Add text before match
      if (matchStart > lastIndex) {
        result.push(text.slice(lastIndex, matchStart));
      }

      // Convert LORD to Lord with sc, preserving possessive
      const hasApostrophe = lordMatch.includes("'");
      const lordText = hasApostrophe ? "Lord's" : "Lord";
      result.push({ text: lordText, marks: ["sc"] });

      lastIndex = matchEnd;
    }
  }

  // If no conversions were made, return original string
  if (result.length === 0) {
    return text;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    result.push(text.slice(lastIndex));
  }

  // Clean up: remove empty strings and merge adjacent strings
  const cleanedResult: (string | SmallCapsText)[] = [];
  for (const item of result) {
    if (typeof item === "string" && item === "") {
      continue;
    }
    if (
      typeof item === "string" &&
      cleanedResult.length > 0 &&
      typeof cleanedResult[cleanedResult.length - 1] === "string"
    ) {
      cleanedResult[cleanedResult.length - 1] += item;
    } else {
      cleanedResult.push(item);
    }
  }

  return cleanedResult;
}

/**
 * Recursively converts LORD/Lord GOD patterns in content structures.
 *
 * @param content - The content to convert (can be string, object, or array)
 * @returns The converted content
 */
export function convertContentToSmallCaps(
  content: ContentElement
): ContentElement {
  // Handle null/undefined
  if (content === null || content === undefined) {
    return content;
  }

  // Handle string content
  if (typeof content === "string") {
    return convertToSmallCaps(content);
  }

  // Handle array content
  if (Array.isArray(content)) {
    const result: ContentElement[] = [];
    for (const item of content) {
      const converted = convertContentToSmallCaps(item);
      // Flatten arrays that come from string conversions
      if (Array.isArray(converted)) {
        result.push(...converted);
      } else {
        result.push(converted);
      }
    }
    return flattenAdjacentStrings(result);
  }

  // Handle object content
  if (typeof content === "object") {
    const obj = content as ContentObject;
    const result: ContentObject = {};

    // Handle special content types
    if (obj.heading !== undefined) {
      const converted = convertContentToSmallCaps(obj.heading);
      result.heading = converted;
      return result;
    }

    if (obj.subtitle !== undefined) {
      const converted = convertContentToSmallCaps(obj.subtitle);
      result.subtitle = converted;
      return result;
    }

    // Handle footnote first (it can exist alongside other properties)
    if (obj.foot) {
      result.foot = {
        ...obj.foot,
        content: convertContentToSmallCaps(obj.foot.content) as ContentElement,
      };
    }

    // Handle paragraph wrapper (boolean type) - only if no other content properties
    if (
      obj.paragraph === true &&
      obj.content === undefined &&
      !obj.text &&
      !obj.foot
    ) {
      return { paragraph: true };
    }

    // Handle text property
    if (obj.text !== undefined) {
      // Check if this text already has sc mark and is "Lord"
      if (obj.marks?.includes("sc") && /^Lord/.test(obj.text)) {
        // Already converted, return as-is
        return { ...obj };
      }

      const converted = convertToSmallCaps(obj.text);

      if (typeof converted === "string") {
        // No conversion needed, preserve original object
        const newObj: ContentObject = { ...obj };
        if (result.foot) newObj.foot = result.foot;
        return newObj;
      }

      // Conversion happened - need to restructure
      if (obj.marks && obj.marks.length > 0) {
        // Has existing marks - wrap with marks and create content array
        // Child elements do NOT need parent marks duplicated - they inherit them
        const newObj: ContentObject = {
          marks: obj.marks,
          content: converted,
        };

        // Preserve other properties
        if (obj.paragraph) newObj.paragraph = obj.paragraph;
        if (obj.strong) newObj.strong = obj.strong;
        if (obj.morph) newObj.morph = obj.morph;
        if (obj.script) newObj.script = obj.script;
        if (obj.lemma) newObj.lemma = obj.lemma;
        if (obj.break) newObj.break = obj.break;
        if (result.foot) newObj.foot = result.foot;

        return newObj;
      }

      // No existing marks - create object with converted content
      const newObj: ContentObject = {
        content: converted,
      };

      // Preserve other properties
      if (obj.paragraph) newObj.paragraph = obj.paragraph;
      if (obj.strong) newObj.strong = obj.strong;
      if (obj.morph) newObj.morph = obj.morph;
      if (obj.script) newObj.script = obj.script;
      if (obj.lemma) newObj.lemma = obj.lemma;
      if (obj.break) newObj.break = obj.break;
      if (result.foot) newObj.foot = result.foot;

      return newObj;
    }

    // Handle content property (nested content)
    if (obj.content !== undefined) {
      const converted = convertContentToSmallCaps(obj.content);
      const newObj: ContentObject = {
        ...obj,
        content: converted,
      };
      if (result.foot) newObj.foot = result.foot;
      return newObj;
    }

    // Handle paragraph property that contains content (not boolean)
    if (obj.paragraph !== undefined && typeof obj.paragraph !== "boolean") {
      const converted = convertContentToSmallCaps(obj.paragraph);
      const newObj: ContentObject = { paragraph: converted };
      if (result.foot) newObj.foot = result.foot;
      return newObj;
    }

    // Copy other properties unchanged (handles paragraph:true with foot)
    const newObj: ContentObject = { ...obj };
    if (result.foot) newObj.foot = result.foot;
    return newObj;
  }

  return content;
}

/**
 * Flatten adjacent strings in an array
 */
function flattenAdjacentStrings(arr: ContentElement[]): ContentElement[] {
  const result: ContentElement[] = [];
  for (const item of arr) {
    if (
      typeof item === "string" &&
      result.length > 0 &&
      typeof result[result.length - 1] === "string"
    ) {
      result[result.length - 1] = (result[result.length - 1] as string) + item;
    } else {
      result.push(item);
    }
  }
  return result;
}

export default convertContentToSmallCaps;
