import Content from "./Content";

export default interface VerseSchema {
  book: string;
  chapter: number;
  verse: number;
  content: Content;
}
