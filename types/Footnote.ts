import Content from "./Content";

export default interface Footnote {
  type?: "stu" | "trn" | "var" | "map" | "xrf"; // stu (study, default), trn (translation), var (textual criticism variant), map (map), xrf (cross-reference)
  content: Content;
}
