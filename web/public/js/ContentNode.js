const { useState, useEffect, useMemo, useRef } = React;

function ContentNode({ node, settings }) {
  if (!node) return null;

  if (Array.isArray(node)) {
    return node.map((child, i) => (
      <ContentNode key={i} node={child} settings={settings} />
    ));
  }

  if (typeof node === "string") {
    return <span>{node}</span>;
  }

  if (typeof node === "object") {
    // --- Structural Wrappers ---

    if (node.paragraph) {
      // If it's a wrapper object { paragraph: ... }
      if (
        typeof node.paragraph === "object" ||
        typeof node.paragraph === "string" ||
        Array.isArray(node.paragraph)
      ) {
        return (
          <p className="mb-4 indent-6">
            <ContentNode node={node.paragraph} settings={settings} />
          </p>
        );
      }
      // If it's a boolean flag on a text node, we handle it below.
    }

    if (node.heading) {
      if (!settings.showHeadings) return null;
      return (
        <h3 className="text-xl font-bold mt-6 mb-3 text-gray-800 dark:text-gray-200 font-sans">
          <ContentNode node={node.heading} settings={settings} />
        </h3>
      );
    }

    if (node.subtitle) {
      if (!settings.showSubtitles) return null;
      return (
        <h4 className="text-lg font-semibold text-gray-600 dark:text-gray-400 mt-2 mb-2 font-sans italic">
          <ContentNode node={node.subtitle} settings={settings} />
        </h4>
      );
    }

    // --- Text Node ---
    let content = null;

    if (node.text) {
      content = <span>{node.text}</span>;
    } else {
      // If it's an object but has no 'text', 'heading', 'subtitle', or 'paragraph' wrapper,
      // it might be a malformed node or a node type we don't handle.
      // However, the error "Objects are not valid as a React child" usually happens when we try to render the object directly.
      // In the previous code, if node.text was missing, content remained null.
      // Then we returned <span>{content}...</span>.
      // If content is null, that's fine.
      // BUT, if we are recursively calling ContentNode, and passing an object that isn't handled, it returns null.
      // The error likely comes from somewhere else rendering the node directly.
      // Let's look at VerseRenderer.
    }

    // Formatting Marks
    if (node.marks) {
      if (node.marks.includes("b")) content = <b>{content}</b>;
      if (node.marks.includes("i")) content = <i>{content}</i>;
      if (node.marks.includes("woc")) {
        let color = "";
        if (settings.showWoC === "red")
          color = settings.darkMode ? "#f87171" : "#8B0000";
        else if (settings.showWoC === "blue")
          color = settings.darkMode ? "#60a5fa" : "#1e40af";
        else if (settings.showWoC === "purple")
          color = settings.darkMode ? "#c084fc" : "#6b21a8";

        if (color) {
          content = <span style={{ color }}>{content}</span>;
        }
      }
      if (node.marks.includes("sc"))
        content = (
          <span className="uppercase text-sm tracking-wider">{content}</span>
        );
    }

    // Paragraph break (boolean flag on text node)
    const isBlock = node.paragraph === true;

    // Footnotes
    const getFootnoteText = (content) => {
      if (typeof content === "string") return content;
      if (Array.isArray(content)) {
        return content
          .map((n) => (typeof n === "string" ? n : n.text))
          .join("");
      }
      return "";
    };

    const footnote =
      settings.showFootnotes && node.foot ? (
        <span
          className="text-blue-600 dark:text-blue-400 text-[0.6em] align-top cursor-pointer ml-0.5 hover:underline"
          title={getFootnoteText(node.foot.content)}
          onClick={() => {
            alert(getFootnoteText(node.foot.content));
          }}
        >
          <Icons.Info />
        </span>
      ) : null;

    // Strongs / Parsing
    let parsingInfo = [];
    if (settings.showStrongs && node.strong) {
      const strongsLink = node.strong.startsWith("H")
        ? `https://www.equipgodspeople.com/lexicons-word-study/old-testament-hebrew/strongs-${node.strong.toLowerCase()}`
        : `https://www.equipgodspeople.com/lexicons-word-study/new-testament-greek/strongs-${node.strong.toLowerCase()}`;

      parsingInfo.push(
        <a
          key="s"
          href={strongsLink}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono font-bold text-gray-500 dark:text-gray-400 hover:underline mr-1"
        >
          {node.strong}
        </a>
      );
    }
    if (settings.showLemma && node.lemma) {
      parsingInfo.push(
        <span key="l" className="italic text-gray-400 mr-1">
          {node.lemma}
        </span>
      );
    }
    if (settings.showMorph && node.morph) {
      parsingInfo.push(
        <span key="m" className="text-gray-500 dark:text-gray-400">
          {node.morph}
        </span>
      );
    }

    const parsingSpan =
      parsingInfo.length > 0 ? (
        <span className="inline-flex align-baseline ml-1 text-[0.75em] select-none">
          {parsingInfo}
        </span>
      ) : null;

    const scriptClass =
      node.script === "H"
        ? "script-hebrew"
        : node.script === "G"
        ? "script-greek"
        : "";

    return (
      <span
        className={`${isBlock ? "block mt-2" : ""} inline ${scriptClass}`}
        dir={node.script === "H" ? "rtl" : "ltr"}
      >
        {content}
        {parsingSpan}
        {footnote}
        {node.break && <br />}
      </span>
    );
  }

  return null;
}

window.ContentNode = ContentNode;
