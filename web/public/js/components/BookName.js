function BookName({ book }) {
  if (!book) return null;

  let text = "";
  let script = "";

  if (typeof book.name === "string") {
    text = book.name;
  } else if (typeof book.name === "object") {
    text = book.name.text;
    script = book.name.script;
  } else {
    return <span>Unknown Book</span>;
  }

  // If script is present, use the specific class. Otherwise use font-sans for UI consistency.
  const className =
    script === "H"
      ? "script-hebrew"
      : script === "G"
      ? "script-greek"
      : "font-sans";

  return <span className={className}>{text}</span>;
}

window.BookName = BookName;
