// Use unique Unicode placeholders that won't appear in Bible text
const OPEN_MARKER = "🔓";
const CLOSE_MARKER = "🔒";
const SELF_CLOSE_MARKER = "🔐";
const PARAGRAPH_SPLIT_MARKER = "\uE001";

function reorderObjectKeys(obj: any): any {
  const keyOrder = [
    "subtitle",
    "heading",
    "paragraph",
    "text",
    "script",
    "break",
    "marks",
    "foot",
    "strong",
    "morph",
    "lemma",
  ];

  const ordered: any = {};
  for (const key of keyOrder) {
    if (obj.hasOwnProperty(key)) {
      ordered[key] = obj[key];
    }
  }
  // Add any remaining keys
  for (const key in obj) {
    if (!ordered.hasOwnProperty(key)) {
      ordered[key] = obj[key];
    }
  }
  return ordered;
}

export function convertBBToGraphai(bb: {
  text?: string;
  paragraphs?: number[];
  footnotes?: { type?: string; text: string }[];
  heading?: string;
  headingFootnote?: { type?: string; text: string };
  subtitle?: { text: string; footnotes?: { type?: string; text: string }[] };
}): any[] {
  const footnotes = bb.footnotes ? [...bb.footnotes] : [];

  // Handle subtitle sub-object (new format)
  if (bb.subtitle) {
    const subtitleContent = parseBBText(
      bb.subtitle.text,
      bb.subtitle.footnotes || []
    );
    const mergedSubtitle = mergeConsecutiveStrings(subtitleContent);
    const subtitleElement = {
      subtitle:
        mergedSubtitle.length === 1 && typeof mergedSubtitle[0] === "string"
          ? mergedSubtitle[0]
          : mergedSubtitle,
    };
    // Add subtitle footnotes to the main footnotes array
    if (bb.subtitle.footnotes) {
      footnotes.push(...bb.subtitle.footnotes);
    }
    return [subtitleElement, ...parseBBText(bb.text || "", footnotes)];
  }

  // Fallback to legacy subtitle parsing from text
  // Inject paragraph markers into the text before processing
  // This avoids issues with indices shifting due to preprocessing or parsing
  let textWithMarkers = bb.text || "";
  let hasFirstParagraph = false;

  if (bb.paragraphs && bb.paragraphs.length > 0) {
    // Sort paragraphs descending to avoid index shifting during insertion
    const sortedParagraphs = [...bb.paragraphs].sort((a, b) => b - a);

    for (const pos of sortedParagraphs) {
      if (pos === 0) {
        hasFirstParagraph = true;
      } else if (pos > 0 && pos <= textWithMarkers.length) {
        // Replace the character at the paragraph position (usually a space) with the marker
        // If it's at the end, just append
        if (pos === textWithMarkers.length) {
          textWithMarkers += PARAGRAPH_SPLIT_MARKER;
        } else {
          textWithMarkers =
            textWithMarkers.substring(0, pos) +
            PARAGRAPH_SPLIT_MARKER +
            textWithMarkers.substring(pos + 1);
        }
      }
    }
  }

  let processedText = preprocessBBText(textWithMarkers);
  let elements: any[] = [];

  // Extract subtitle if present
  const subtitleMatch = processedText.match(/^«(.*?)»(?:\s|$)/);
  if (subtitleMatch) {
    const subtitleText = subtitleMatch[1];
    const subtitleContent = parseBBText(subtitleText, []);
    const mergedSubtitle = mergeConsecutiveStrings(subtitleContent);
    elements.push({
      subtitle:
        mergedSubtitle.length === 1 && typeof mergedSubtitle[0] === "string"
          ? mergedSubtitle[0]
          : mergedSubtitle,
    });
    // Remove the subtitle from the processed text
    processedText = processedText.substring(subtitleMatch[0].length);
  }

  elements = elements.concat(parseBBText(processedText, footnotes));

  // Handle paragraphs by splitting on the injected marker
  if (bb.paragraphs && bb.paragraphs.length > 0) {
    elements = applyParagraphMarkers(elements, hasFirstParagraph);
  }

  // Merge script tags with following Strong's tags
  elements = mergeScriptAndStrongs(elements);

  // Merge consecutive strings
  elements = mergeConsecutiveStrings(elements);

  // Handle heading if present
  if (bb.heading) {
    let headingText = preprocessBBText(bb.heading);
    // Remove trailing footnote marker if present in heading text (e.g. "Title°")
    // The actual footnote content is in bb.headingFootnote
    headingText = headingText.replace(/°$/, "");

    const headingContent = parseBBText(headingText, []);
    const mergedHeading = mergeConsecutiveStrings(headingContent);

    let headingValue: any =
      mergedHeading.length === 1 && typeof mergedHeading[0] === "string"
        ? mergedHeading[0]
        : mergedHeading;

    if (bb.headingFootnote) {
      const footText = preprocessBBText(bb.headingFootnote.text);
      const footContent = parseBBText(footText, []);
      const footObj = {
        type: bb.headingFootnote.type || "stu",
        content:
          footContent.length === 1 && typeof footContent[0] === "string"
            ? footContent[0]
            : mergeConsecutiveStrings(footContent),
      };

      // Attach footnote to the heading content
      if (typeof headingValue === "string") {
        headingValue = { text: headingValue, foot: footObj };
      } else if (Array.isArray(headingValue)) {
        // If array, attach to last element
        const lastIdx = headingValue.length - 1;
        if (lastIdx >= 0) {
          if (typeof headingValue[lastIdx] === "string") {
            headingValue[lastIdx] = {
              text: headingValue[lastIdx],
              foot: footObj,
            };
          } else {
            headingValue[lastIdx].foot = footObj;
          }
        } else {
          // Should not happen if heading text exists
          headingValue.push({ foot: footObj });
        }
      } else if (typeof headingValue === "object") {
        headingValue.foot = footObj;
      }
    }

    elements.unshift({ heading: headingValue });
  }

  // If no elements, return empty array
  if (elements.length === 0) {
    return [];
  }

  // Reorder object keys for logical ordering
  elements = elements.map((elem) => {
    if (typeof elem === "object" && elem !== null) {
      return reorderObjectKeys(elem);
    }
    return elem;
  });

  // Remove empty text properties
  elements = elements.map((elem) => {
    if (
      typeof elem === "object" &&
      elem !== null &&
      "text" in elem &&
      elem.text === ""
    ) {
      const { text, ...rest } = elem;
      return rest;
    }
    return elem;
  });

  return elements;
}

function preprocessBBText(text: string): string {
  let processed = text;

  // Trim spaces inside red tags
  processed = processed.replace(/\[red\]\s+/g, "[red]");
  processed = processed.replace(/\s+\[\/red\]/g, "[/red]");

  // Trim leading whitespace from the whole text (preserve trailing for line breaks)
  processed = processed.trimStart();

  // Bugfixes for Greek punctuation
  processed = processed
    .replace(/(.)\[\/greek\]̈\[greek\]/g, "̈$1")
    .replace(/(.)\[\/greek\]̈/g, "̈$1[/greek]")
    .replace(/\[\/greek\]’ \[greek\]/g, "’ ")
    .replace(/\[\/greek\]’/g, "’[/greek]")
    .replace(/\[\/greek\] \[greek\]/g, " ");

  // Bugfixes for Hebrew TVM2
  processed = processed.replace(
    /(\[strongs id=\"h[0-9]+\" tvm=\"[0-9]+\")( \/\]) \(([0-9]+)\)/g,
    '$1 tvm2="$3"$2'
  );

  // Move spaces into script tags ONLY when the space follows a strongs tag
  // Pattern: [strongs...] [greek] becomes [strongs...][greek]
  processed = processed.replace(
    /(\[strongs[^\]]*\]) \[(greek|hebrew)\]/g,
    "$1[$2] "
  );

  // Replace BB code brackets with unique placeholders
  // Handle self-closing tags: [tag .../] -> 🔓tag ...🔐
  processed = processed.replace(
    /\[(strongs)\s+([^\]]*?)\/\]/g,
    `${OPEN_MARKER}$1 $2${SELF_CLOSE_MARKER}`
  );
  processed = processed.replace(
    /\[(strongs)\s*\/\]/g,
    `${OPEN_MARKER}$1${SELF_CLOSE_MARKER}`
  );

  // Handle opening tags: [tag] -> 🔓tag🔒
  processed = processed.replace(
    /\[(greek|hebrew|i|b|sc|red|verse)\]/g,
    `${OPEN_MARKER}$1${CLOSE_MARKER}`
  );

  // Handle closing tags: [/tag] -> 🔓/tag🔒
  processed = processed.replace(
    /\[\/(greek|hebrew|i|b|sc|red|verse)\]/g,
    `${OPEN_MARKER}/$1${CLOSE_MARKER}`
  );

  return processed;
}

function parseBBText(
  text: string,
  footnotes: { type?: string; text: string }[]
): any[] {
  let elements: any[] = [];
  const openRegex = new RegExp(
    `${OPEN_MARKER}([^${CLOSE_MARKER}${SELF_CLOSE_MARKER}]+?)(?:${CLOSE_MARKER}|${SELF_CLOSE_MARKER})`,
    "g"
  );
  let lastIndex = 0;
  let match;

  while ((match = openRegex.exec(text)) !== null) {
    // Add plain text before tag
    if (match.index > lastIndex) {
      const plainText = text.substring(lastIndex, match.index);
      addPlainText(plainText, elements, footnotes);
    }

    const tagContent = match[1];
    const isSelfClosing = match[0].endsWith(SELF_CLOSE_MARKER);

    // Self-closing tag
    if (isSelfClosing) {
      const tagStr = tagContent.trim();
      if (tagStr.startsWith("strongs ") || tagStr === "strongs") {
        const attrs = parseAttributes(tagStr);
        const strongObj: any = {};

        // Normalize Strong's: uppercase, strip leading zeros
        if (attrs.id) {
          const prefix = attrs.id[0].toUpperCase();
          const num = parseInt(attrs.id.slice(1), 10);
          strongObj.strong = prefix + num;
        }

        // Morphology
        if (attrs.m) {
          strongObj.morph = attrs.m;
        } else if (attrs.tvm) {
          strongObj.morph = attrs.tvm + (attrs.tvm2 ? "/" + attrs.tvm2 : "");
        }

        // Merge with previous element if it's a text string
        if (elements.length > 0) {
          const prev = elements[elements.length - 1];
          if (typeof prev === "string" && prev.trim().length > 0) {
            // Trim trailing space from previous string
            const trimmed = prev.trimEnd();
            elements[elements.length - 1] = { text: trimmed, ...strongObj };
          } else if (typeof prev === "object" && prev.text && !prev.strong) {
            // Merge into existing text object
            Object.assign(prev, strongObj);
          } else {
            elements.push(strongObj);
          }
        } else {
          elements.push(strongObj);
        }
      }
      // Ignore other self-closing tags
    } else {
      // Opening tag
      const tag = tagContent.trim();
      const closeTag = `${OPEN_MARKER}/${tag}${CLOSE_MARKER}`;
      const closeIndex = text.indexOf(closeTag, match.index + match[0].length);

      if (closeIndex !== -1) {
        const innerText = text.substring(
          match.index + match[0].length,
          closeIndex
        );

        if (tag === "greek" || tag === "hebrew") {
          elements.push({
            text: innerText,
            script: tag === "greek" ? "G" : "H",
          });
        } else if (tag === "verse") {
          const foot = {
            type: "var",
            content: `Originally verse ${innerText}.`,
          };

          if (elements.length > 0) {
            let lastElem = elements[elements.length - 1];
            if (typeof lastElem === "string") {
              elements[elements.length - 1] = {
                text: lastElem,
                foot: foot,
              };
            } else if (typeof lastElem === "object" && !lastElem.foot) {
              lastElem.foot = foot;
            } else {
              elements.push({ foot: foot });
            }
          } else {
            elements.push({ foot: foot });
          }
        } else if (tag === "heading") {
          const headingContent = parseBBText(innerText, []);
          const mergedHeading = mergeConsecutiveStrings(headingContent);
          elements.push({
            heading:
              mergedHeading.length === 1 && typeof mergedHeading[0] === "string"
                ? mergedHeading[0]
                : mergedHeading,
          });
        } else if (
          tag === "i" ||
          tag === "b" ||
          tag === "sc" ||
          tag === "red"
        ) {
          const mark = tag === "red" ? "woc" : tag;

          // Check if innerText contains more BB tags (nested tags)
          const hasNestedTags = innerText.includes(OPEN_MARKER);

          if (hasNestedTags) {
            // Parse nested content
            const nestedElements = parseBBText(innerText, []);

            // Apply this mark to all nested elements
            for (const nested of nestedElements) {
              if (typeof nested === "string") {
                elements.push({ text: nested, marks: [mark] });
              } else if (typeof nested === "object" && nested.text) {
                // Prepend the outer mark (not append) to maintain tag order
                const marks = nested.marks ? [mark, ...nested.marks] : [mark];
                elements.push({ ...nested, marks });
              } else {
                elements.push(nested);
              }
            }
          } else {
            // No nested tags - simple text
            // Check for nested marks on same text
            if (elements.length > 0) {
              const prev = elements[elements.length - 1];
              if (
                typeof prev === "object" &&
                prev.text === innerText &&
                prev.marks
              ) {
                // Nested marks on same text element
                prev.marks.push(mark);
              } else {
                elements.push({ text: innerText, marks: [mark] });
              }
            } else {
              elements.push({ text: innerText, marks: [mark] });
            }
          }
        }
        // Ignore verse tags and other unknown tags

        openRegex.lastIndex = closeIndex + closeTag.length;

        // Special handling for verse tag to skip space
        if (tag === "verse" && text[openRegex.lastIndex] === " ") {
          openRegex.lastIndex++;
        }
      }
      // If no closing tag, ignore (it's probably not a valid BB tag)
    }

    lastIndex = openRegex.lastIndex;
  }

  // Add remaining plain text
  if (lastIndex < text.length) {
    const plainText = text.substring(lastIndex);
    addPlainText(plainText, elements, footnotes);
  }

  return elements;
}

function addPlainText(
  text: string,
  elements: any[],
  footnotes: { type?: string; text: string }[]
): void {
  // Handle line breaks
  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Handle footnotes (° markers)
    const parts = line.split("°");

    for (let j = 0; j < parts.length; j++) {
      if (parts[j]) {
        elements.push(parts[j]);
      }

      // Add footnote after this part
      if (j < parts.length - 1 && footnotes.length > 0) {
        const footnote = footnotes.shift()!;
        const preprocessedFootnote = preprocessBBText(footnote.text);
        const footContent = parseBBText(preprocessedFootnote, []);

        // If footnote content is just a single string, use it directly
        const content =
          footContent.length === 1 && typeof footContent[0] === "string"
            ? footContent[0]
            : mergeConsecutiveStrings(footContent);

        const footObj: any = {
          foot: {
            type: footnote.type || "stu",
            content,
          },
        };

        // Attach footnote to last element
        const lastIdx = elements.length - 1;
        if (lastIdx >= 0) {
          if (typeof elements[lastIdx] === "string") {
            if (elements[lastIdx] === "") {
              elements[lastIdx] = footObj;
            } else {
              elements[lastIdx] = { text: elements[lastIdx], ...footObj };
            }
          } else {
            Object.assign(elements[lastIdx], footObj);
          }
        } else {
          elements.push(footObj);
        }
      }
    }

    // Add line break (except after last line)
    if (i < lines.length - 1) {
      const lastIdx = elements.length - 1;
      if (lastIdx >= 0) {
        if (typeof elements[lastIdx] === "string") {
          elements[lastIdx] = { text: elements[lastIdx], break: true };
        } else {
          elements[lastIdx].break = true;
        }
      }
    }
  }
}

function mergeScriptAndStrongs(elements: any[]): any[] {
  let result: any[] = [];

  for (let i = 0; i < elements.length; i++) {
    const elem = elements[i];

    // Check if this is a script element followed by space and Strong's
    if (typeof elem === "object" && elem.script && elem.text) {
      const next = i + 1 < elements.length ? elements[i + 1] : null;
      const nextNext = i + 2 < elements.length ? elements[i + 2] : null;

      // Pattern: [greek]text[/greek] [strongs...]
      // next is " ", nextNext is {strong:...}
      if (
        next &&
        typeof next === "string" &&
        next.trim() === "" &&
        nextNext &&
        typeof nextNext === "object" &&
        nextNext.strong &&
        !nextNext.text
      ) {
        // Merge script + strong + morph
        result.push({
          ...elem,
          strong: nextNext.strong,
          ...(nextNext.morph && { morph: nextNext.morph }),
        });
        i += 2; // Skip next two elements
      } else {
        result.push(elem);
      }
    } else {
      result.push(elem);
    }
  }

  // Remove whitespace-only strings between two Strong's-only objects
  // AND ensure all objects have text property
  result = result.filter((elem, i) => {
    if (typeof elem === "string" && elem.trim() === "") {
      const prev = i > 0 ? result[i - 1] : null;
      const next = i < result.length - 1 ? result[i + 1] : null;

      // Drop space between two strong-only objects
      if (
        prev &&
        typeof prev === "object" &&
        prev.strong &&
        next &&
        typeof next === "object" &&
        next.strong &&
        !next.text
      ) {
        return false;
      }
    }
    return true;
  });

  // Add empty text property to objects that don't have one
  result = result.map((elem) => {
    if (
      typeof elem === "object" &&
      !elem.text &&
      !elem.heading &&
      !elem.paragraph &&
      !elem.subtitle
    ) {
      return { text: "", ...elem };
    }
    return elem;
  });

  return result;
}

function applyParagraphMarkers(
  elements: any[],
  hasFirstParagraph: boolean
): any[] {
  const result: any[] = [];
  let isFirstElement = true;

  for (const elem of elements) {
    // Skip subtitles
    if (elem.subtitle !== undefined) {
      result.push(elem);
      continue;
    }

    const text = typeof elem === "string" ? elem : elem.text || "";

    // Check if this element contains the paragraph marker
    if (text.includes(PARAGRAPH_SPLIT_MARKER)) {
      const parts = text.split(PARAGRAPH_SPLIT_MARKER);

      for (let i = 0; i < parts.length; i++) {
        const partText = parts[i];

        // Determine if this part should start a new paragraph
        // The first part starts a paragraph only if hasFirstParagraph is true AND it's the very first element
        // Subsequent parts always start a new paragraph (because they follow a marker)
        let isParagraph = false;
        if (i === 0) {
          if (isFirstElement && hasFirstParagraph) {
            isParagraph = true;
          }
        } else {
          isParagraph = true;
        }

        if (partText.length > 0 || isParagraph) {
          if (typeof elem === "string") {
            if (isParagraph) {
              result.push({ text: partText, paragraph: true });
            } else {
              result.push(partText);
            }
          } else {
            const newElem = { ...elem, text: partText };
            if (isParagraph) {
              newElem.paragraph = true;
            }
            result.push(newElem);
          }
        }
      }
    } else {
      // No marker in this element
      if (isFirstElement && hasFirstParagraph) {
        if (typeof elem === "string") {
          result.push({ text: elem, paragraph: true });
        } else {
          result.push({ ...elem, paragraph: true });
        }
      } else {
        result.push(elem);
      }
    }

    isFirstElement = false;
  }

  return result;
}

function mergeConsecutiveStrings(elements: any[]): any[] {
  // First pass: merge consecutive strings
  const afterStringMerge = [];
  for (const elem of elements) {
    if (
      typeof elem === "string" &&
      afterStringMerge.length > 0 &&
      typeof afterStringMerge[afterStringMerge.length - 1] === "string"
    ) {
      afterStringMerge[afterStringMerge.length - 1] += elem;
    } else {
      afterStringMerge.push(elem);
    }
  }

  // Second pass: merge text objects with paragraph markers + strings + strong-tagged text objects
  const afterParagraphMerge = [];
  for (let i = 0; i < afterStringMerge.length; i++) {
    const elem = afterStringMerge[i];

    // NOTE: Do NOT drop or move leading paragraph markers
    // We intentionally keep objects like { text: "", strong: "G1161", paragraph: true }
    // as their own elements so the first Strong's-only token is preserved.

    // Check for pattern: {text, paragraph} + string + {text, strong}
    if (
      typeof elem === "object" &&
      elem.text &&
      elem.paragraph &&
      !elem.strong &&
      !elem.script &&
      i + 2 < afterStringMerge.length
    ) {
      const next1 = afterStringMerge[i + 1];
      const next2 = afterStringMerge[i + 2];

      // Check if next1 is a string and next2 has strong
      if (
        typeof next1 === "string" &&
        typeof next2 === "object" &&
        next2.text &&
        next2.strong
      ) {
        // Merge all three: paragraph text + string + strong text
        next2.text = elem.text + next1 + next2.text;
        next2.paragraph = true;
        i += 2; // Skip both next elements
        afterParagraphMerge.push(next2);
        continue;
      }
    }

    // Check for pattern: {text, paragraph} + {text, strong}
    if (
      typeof elem === "object" &&
      elem.text &&
      elem.paragraph &&
      !elem.strong &&
      !elem.script &&
      i + 1 < afterStringMerge.length
    ) {
      const next = afterStringMerge[i + 1];
      if (typeof next === "object" && next.text && next.strong) {
        // Merge text object with paragraph marker with following strong-tagged text object
        next.text = elem.text + next.text;
        next.paragraph = true;
        i++; // Skip the next element since we merged it
        afterParagraphMerge.push(next);
        continue;
      }
    }

    afterParagraphMerge.push(elem);
  }

  // Third pass: merge strings with following text objects that have strong numbers
  const result = [];
  for (let i = 0; i < afterParagraphMerge.length; i++) {
    const elem = afterParagraphMerge[i];
    if (typeof elem === "string" && i + 1 < afterParagraphMerge.length) {
      const next = afterParagraphMerge[i + 1];
      if (
        typeof next === "object" &&
        next.hasOwnProperty("text") &&
        next.strong
      ) {
        // Merge string with following text object that has a strong number
        // Trim trailing space from the string if the next text is empty/whitespace
        const stringToMerge = next.text.trim() === "" ? elem.trimEnd() : elem;
        next.text = stringToMerge + next.text;
        i++; // Skip the next element since we merged it
        result.push(next);
      } else {
        result.push(elem);
      }
    } else {
      result.push(elem);
    }
  }

  // Final pass: if the first element is the special
  // { text: "", strong: ..., paragraph: true } case,
  // ensure the second element does NOT also carry paragraph: true.
  if (
    result.length >= 2 &&
    typeof result[0] === "object" &&
    result[0].paragraph &&
    result[0].strong &&
    typeof result[0].text === "string" &&
    result[0].text === "" &&
    typeof result[1] === "object" &&
    result[1].paragraph
  ) {
    delete result[1].paragraph;
  }

  return result;
}

function parseAttributes(tagStr: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const parts = tagStr.split(/\s+/);

  for (const part of parts.slice(1)) {
    const eqIndex = part.indexOf("=");
    if (eqIndex !== -1) {
      const key = part.substring(0, eqIndex);
      const value = part.substring(eqIndex + 1).replace(/^["']|["']$/g, "");
      attrs[key] = value;
    }
  }

  return attrs;
}
