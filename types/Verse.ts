// Input data interface for processing raw Bible data
export default interface Verse {
  _id: string;
  text: string;
  footnotes?: Array<{
    type: string;
    text: string;
  }>;
  paragraphs?: number[];
}