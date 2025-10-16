import * as fs from "fs";
import * as path from "path";

interface Book {
  _id: string;
  name: string;
  testament: string;
  alt: string[];
  order?: { [key: string]: number };
}

function showBookNames(orderType?: string): void {
  const filePath = path.join(
    __dirname,
    "..",
    "bible-books",
    "bible-books.json"
  );
  const data = fs.readFileSync(filePath, "utf-8");
  const books: Book[] = JSON.parse(data);

  let sortedBooks: Book[];

  if (orderType) {
    // Only books with the specified order type, sorted by order
    sortedBooks = books
      .filter((book) => book.order && book.order[orderType] !== undefined)
      .sort((a, b) => {
        const orderA = a.order![orderType];
        const orderB = b.order![orderType];
        return orderA - orderB;
      });
  } else {
    // Sort all books by name
    sortedBooks = books.sort((a, b) => a.name.localeCompare(b.name));
  }

  // Display the sorted book names
  sortedBooks.forEach((book, index) => {
    const prefix =
      orderType && book.order && book.order[orderType] !== undefined
        ? book.order[orderType].toString().padStart(2, " ")
        : (index + 1).toString().padStart(2, " ");
    console.log(`${prefix}. ${book.name}`);
  });
}

// Get the optional order type from command line arguments
const orderType = process.argv[2];
showBookNames(orderType);
