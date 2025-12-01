interface BBResult {
  text?: string;
  subtitle?: { text: string; footnotes?: { type?: string; text: string }[] };
  paragraphs?: number[];
  footnotes?: { type?: string; text: string }[];
}

export function convertGraphaiToBB(content: any): BBResult {
  // Handle string literals
  if (typeof content === "string") {
    return { text: content };
  }

  // Handle arrays - process each element and concatenate
  if (Array.isArray(content)) {
    const result: BBResult = {};
    let text = "";
    const paragraphs: number[] = [];
    const footnotes: { type?: string; text: string }[] = [];
    let previousEndsWithStrongs = false;

    for (let i = 0; i < content.length; i++) {
      const item = content[i];
      const itemResult = convertGraphaiToBB(item);

      if (!itemResult.text) itemResult.text = "";

      // Check if this item starts with a strongs tag
      const startsWithStrongs = itemResult.text.trim().startsWith("[strongs");

      // Handle paragraph markers
      if (itemResult.paragraphs) {
        for (const pos of itemResult.paragraphs) {
          if (pos === 0) {
            // This element starts a paragraph
            if (text.length > 0) {
              // Not the first element - record position at the space
              paragraphs.push(text.length);
              // Add space after recording position
              text += " ";
            } else {
              // First element - record position 0
              paragraphs.push(0);
            }
          } else {
            // Inner paragraph position (shouldn't happen in normal cases)
            paragraphs.push(text.length + pos);
          }
        }
      }

      // Add space between consecutive strongs tags
      if (
        previousEndsWithStrongs &&
        startsWithStrongs &&
        itemResult.paragraphs?.[0] !== 0
      ) {
        text += " ";
      }

      // Append text
      text += itemResult.text;

      // If item has subtitle, set it
      if (itemResult.subtitle) {
        result.subtitle = itemResult.subtitle;
      }

      // Add space after subtitle
      if (itemResult.text && itemResult.text.endsWith("»")) {
        text += " ";
      }

      // Check if this item ends with a strongs tag
      previousEndsWithStrongs = itemResult.text.trim().endsWith("/]");

      // Collect footnotes
      if (itemResult.footnotes) {
        footnotes.push(...itemResult.footnotes);
      }
    }

    result.text = text;
    if (paragraphs.length > 0) result.paragraphs = paragraphs;
    if (footnotes.length > 0) result.footnotes = footnotes;
    return result;
  }

  // Handle objects
  if (typeof content === "object" && content !== null) {
    // Handle heading
    if (content.heading) {
      const headingResult = convertGraphaiToBB(content.heading);
      return { text: `[heading]${headingResult.text}[/heading]` };
    }

    // Handle subtitle
    if (content.subtitle !== undefined) {
      const subResult = convertGraphaiToBB(content.subtitle);
      const subtitle: {
        text: string;
        footnotes?: { text: string; type?: string }[];
      } = {
        text: subResult.text || "",
      };
      if (subResult.footnotes && subResult.footnotes.length > 0) {
        subtitle.footnotes = subResult.footnotes;
      }
      return { subtitle };
    }

    let text = "";
    const paragraphs: number[] = [];
    const footnotes: { type?: string; text: string }[] = [];
    let leadingSpace = "";

    // Start with text content
    if (content.text) {
      text = content.text;

      // Extract leading space if script tag will be used
      if (content.script && text.startsWith(" ")) {
        leadingSpace = " ";
        text = text.trimStart();
      }
    }

    // Wrap with formatting marks
    if (content.marks && Array.isArray(content.marks)) {
      for (const mark of content.marks.slice().reverse()) {
        const tag = mark === "woc" ? "red" : mark;
        text = `[${tag}]${text}[/${tag}]`;
      }
    }

    // Wrap with script tags
    if (content.script) {
      const tag = content.script === "G" ? "greek" : "hebrew";
      text = `[${tag}]${text}[/${tag}]`;
    }

    // Re-add leading space outside script tags
    if (leadingSpace) {
      text = leadingSpace + text;
    }

    // Add footnote marker and collect footnote
    if (content.foot) {
      text += "°";
      const footResult = convertGraphaiToBB(content.foot.content);
      const footnote: { type?: string; text: string } = {
        type: content.foot.type,
        text: footResult.text || "",
      };
      footnotes.push(footnote);
    }

    // Add Strong's tag
    if (content.strong) {
      // Normalize: uppercase to lowercase, strip leading zeros
      const normalized = content.strong
        .toLowerCase()
        .replace(/^([gh])0+(\d)/, "$1$2");

      // Determine morphology attribute
      let morphAttr = "";
      if (content.morph) {
        const morphParts = content.morph.split("/");

        if (morphParts.length > 1) {
          // Dual morphology → use tvm/tvm2
          morphAttr = ` tvm="${morphParts[0]}"`;
          morphAttr += ` tvm2="${morphParts[1]}"`;
        } else {
          // Single morphology - check format per spec
          const morph = morphParts[0];
          if (morph.includes("-")) {
            // Contains hyphen → use 'm'
            morphAttr = ` m="${morph}"`;
          } else if (/^[A-Z]+$/.test(morph)) {
            // All caps, no hyphen → use 'm'
            morphAttr = ` m="${morph}"`;
          } else {
            // Otherwise (mixed case, numeric) → use 'tvm'
            morphAttr = ` tvm="${morph}"`;
          }
        }
      }

      // Add space before strongs tag if there's any text before it
      // (including leading space that was extracted)
      if (text.length > 0 || leadingSpace) {
        text += " ";
      }

      text += `[strongs id="${normalized}"${morphAttr} /]`;
    }
    if (content.break) {
      text += "\n";
    }

    // Mark paragraph position
    if (content.paragraph) {
      paragraphs.push(0);
    }

    const result: BBResult = { text };
    if (paragraphs.length > 0) result.paragraphs = paragraphs;
    if (footnotes.length > 0) result.footnotes = footnotes;
    return result;
  }

  // Fallback
  return { text: "" };
}
