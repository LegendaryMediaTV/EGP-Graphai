import Footnote from "./Footnote";

/**
 * Content type matching the flexible content-schema.json structure.
 * Can be a plain string, a structured object, or an array of content elements.
 */
type Content =
  | string
  | ContentObject
  | ContentNested
  | ContentHeading
  | ContentParagraph
  | ContentSubtitle
  | Content[];

/**
 * Plain text content object with optional formatting and metadata.
 * At minimum, one property must be present (text, strong, paragraph, etc.)
 */
interface ContentObject {
  text?: string; // Plain text content (optional - can have Strong's-only elements)
  script?: "G" | "H"; // Specifies the script of the text. If not specified, Latin script is assumed.
  marks?: ("i" | "b" | "woc" | "sc")[]; // Formatting marks: i = italic, b = bold, woc = words of Christ (red lettering), sc = small caps
  foot?: Footnote; // Optional footnote attached to the text
  strong?: string; // Strong's number in format G/H + 1-4 digits
  lemma?: string; // Lexical lemma in original script
  morph?: string; // Morphological code (i.e., Robinson or Packard format)
  paragraph?: boolean; // Indicates this text is the start of a new paragraph
  break?: boolean; // Indicates this text ends with a line break
}

/**
 * Nested content object with shared properties (e.g., Strong's number applying to multiple text elements).
 * Requires a content property containing nested content.
 */
interface ContentNested {
  content: Content; // Nested content array or element
  strong?: string; // Strong's number applying to the entire nested content
  lemma?: string; // Lexical lemma in original script
  morph?: string; // Morphological code (i.e., Robinson or Packard format)
  foot?: Footnote; // Optional footnote attached to the nested content
  paragraph?: boolean; // Indicates this content is the start of a new paragraph
  break?: boolean; // Indicates this content ends with a line break
}

/**
 * Heading content object
 */
interface ContentHeading {
  heading: Content;
}

/**
 * Paragraph content object
 */
interface ContentParagraph {
  paragraph: Content;
}

/**
 * Subtitle content object
 */
interface ContentSubtitle {
  subtitle: Content;
}

export default Content;
export type {
  ContentObject,
  ContentNested,
  ContentHeading,
  ContentParagraph,
  ContentSubtitle,
};
