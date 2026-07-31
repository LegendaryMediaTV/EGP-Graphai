export default interface Book {
  _id: string;
  name: string;
  alt: string[];
  order?: { [canon: string]: number | null };
}