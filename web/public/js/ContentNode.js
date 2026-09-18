const { useState, useEffect, useMemo, useRef } = React;

/**
 * Recursively renders a Content-shaped node (string, array, Bible link,
 * paragraph/heading/subtitle wrapper, or leaf text node with marks,
 * Strong's/lemma/morph, and footnotes) into React elements, gated by the
 * matching `settings.show*` flags.
 *
 * @param {object} props
 * @param {*} props.node - Content node in any shape the bible JSON emits
 * @param {object} props.settings - Display settings controlling which parts render (dark mode, show* toggles)
 * @param {(content: *) => void} [props.onFootnoteClick] - Called with the footnote's raw content on click; falls back to `alert()` when omitted
 * @param {(bibleLink: string) => void} [props.onBibleLinkClick] - Called with the raw `bibleLink` reference on click
 * @param {(abbr: object) => void} [props.onAbbrClick] - Called with the resolved `{ _id, name, description }` registry entry when an abbreviation is clicked
 */
function ContentNode({
  node,
  settings,
  onFootnoteClick,
  onBibleLinkClick,
  onAbbrClick,
}) {
  /** Version abbreviation registry, read before any early return since a hook may not sit behind a condition. */
  const abbreviations = React.useContext(AbbreviationContext);

  if (!node) return null;

  if (Array.isArray(node)) {
    return node.map((child, i) => (
      <ContentNode
        key={i}
        node={child}
        settings={settings}
        onFootnoteClick={onFootnoteClick}
        onBibleLinkClick={onBibleLinkClick}
        onAbbrClick={onAbbrClick}
      />
    ));
  }

  if (typeof node === "string") {
    return <span>{node}</span>;
  }

  if (typeof node === "object") {
    // --- Bible Reference Link ---
    if (node.bibleLink) {
      const display =
        node.content !== undefined ? (
          <ContentNode
            node={node.content}
            settings={settings}
            onFootnoteClick={onFootnoteClick}
            onBibleLinkClick={onBibleLinkClick}
            onAbbrClick={onAbbrClick}
          />
        ) : (
          node.bibleLink
        );
      return (
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            if (onBibleLinkClick) onBibleLinkClick(node.bibleLink);
          }}
          title={node.bibleLink}
          className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
        >
          {display}
        </a>
      );
    }

    // --- Abbreviation Reference ---
    // What prints and what it means come from the version registry, so an
    // unknown id degrades to the bare id rather than rendering nothing.
    // `validate` is what reports it.
    if (node.abbr) {
      const entry = abbreviations && abbreviations.get(node.abbr);
      if (!entry) return <span>{node.abbr}</span>;

      const description = entry.description
        ? getFootnoteText(
            entry.description,
            abbreviations,
            settings.showTransliteration,
          )
        : "";
      const display = (
        <ContentNode
          node={entry.name}
          settings={settings}
          onFootnoteClick={onFootnoteClick}
          onBibleLinkClick={onBibleLinkClick}
          onAbbrClick={onAbbrClick}
        />
      );

      if (!description) return <span>{display}</span>;

      return (
        <abbr
          title={description}
          onClick={() => onAbbrClick && onAbbrClick(entry)}
          className="cursor-help no-underline decoration-dotted underline-offset-2 hover:underline"
        >
          {display}
        </abbr>
      );
    }

    // --- Structural Wrappers ---

    if (node.paragraph) {
      if (
        typeof node.paragraph === "object" ||
        typeof node.paragraph === "string" ||
        Array.isArray(node.paragraph)
      ) {
        return (
          <p className="mb-4 indent-6">
            <ContentNode
              node={node.paragraph}
              settings={settings}
              onFootnoteClick={onFootnoteClick}
              onBibleLinkClick={onBibleLinkClick}
              onAbbrClick={onAbbrClick}
            />
          </p>
        );
      }
      // If it's a boolean flag on a text node, we handle it below.
    }

    if (node.heading) {
      if (!settings.showHeadings) return null;
      if (node.type === "acrostic") {
        return (
          <h4 className="text-lg font-bold mt-6 mb-3 text-gray-700 dark:text-gray-400 font-sans">
            <ContentNode
              node={node.heading}
              settings={settings}
              onFootnoteClick={onFootnoteClick}
              onBibleLinkClick={onBibleLinkClick}
              onAbbrClick={onAbbrClick}
            />
          </h4>
        );
      }
      return (
        <h3 className="text-xl font-bold mt-6 mb-3 text-gray-800 dark:text-gray-200 font-sans">
          <ContentNode
            node={node.heading}
            settings={settings}
            onFootnoteClick={onFootnoteClick}
            onBibleLinkClick={onBibleLinkClick}
            onAbbrClick={onAbbrClick}
          />
        </h3>
      );
    }

    if (node.subtitle) {
      if (!settings.showSubtitles) return null;
      return (
        <h4 className="text-lg font-semibold text-gray-600 dark:text-gray-400 mt-2 mb-2 font-sans italic">
          <ContentNode
            node={node.subtitle}
            settings={settings}
            onFootnoteClick={onFootnoteClick}
            onBibleLinkClick={onBibleLinkClick}
            onAbbrClick={onAbbrClick}
          />
        </h4>
      );
    }

    // --- Nested Content Object (content property with Strong's, morph, marks, etc.) ---
    if (
      node.content !== undefined &&
      !node.heading &&
      !node.subtitle &&
      typeof node.paragraph !== "object"
    ) {
      let nestedContent = (
        <ContentNode
          node={node.content}
          settings={settings}
          onFootnoteClick={onFootnoteClick}
          onBibleLinkClick={onBibleLinkClick}
          onAbbrClick={onAbbrClick}
        />
      );

      if (node.marks) {
        if (node.marks.includes("b")) nestedContent = <b>{nestedContent}</b>;
        if (node.marks.includes("i")) nestedContent = <i>{nestedContent}</i>;
        if (node.marks.includes("woc")) {
          let color = "";
          if (settings.showWoC === "red")
            color = settings.darkMode ? "#f87171" : "#8B0000";
          else if (settings.showWoC === "blue")
            color = settings.darkMode ? "#60a5fa" : "#1e40af";
          else if (settings.showWoC === "purple")
            color = settings.darkMode ? "#c084fc" : "#6b21a8";

          if (color) {
            nestedContent = <span style={{ color }}>{nestedContent}</span>;
          }
        }
        if (node.marks.includes("sc"))
          nestedContent = <span className="sc">{nestedContent}</span>;
        if (node.marks.includes("sup"))
          nestedContent = <sup>{nestedContent}</sup>;
      }

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
            className="font-mono font-bold text-gray-500 dark:text-gray-400 hover:underline"
          >
            {node.strong}
          </a>,
        );
      }
      if (settings.showLemma && node.lemma) {
        parsingInfo.push(
          <span
            key="l"
            className={`italic text-gray-400 ${parsingInfo.length > 0 ? "ml-1" : ""}`}
          >
            {node.lemma}
          </span>,
        );
      }
      if (settings.showMorph && node.morph) {
        parsingInfo.push(
          <span
            key="m"
            className={`text-gray-500 dark:text-gray-400 ${parsingInfo.length > 0 ? "ml-1" : ""}`}
          >
            {node.morph}
          </span>,
        );
      }

      const parsingSpan =
        parsingInfo.length > 0 ? (
          <span className="inline-flex align-baseline ml-1 text-[0.75em] select-none">
            {parsingInfo}
          </span>
        ) : null;

      const footnoteText = node.foot
        ? getFootnoteText(
            node.foot.content,
            abbreviations,
            settings.showTransliteration,
          )
        : "";
      const footnote =
        settings.showFootnotes && node.foot ? (
          <span
            className="text-blue-600 dark:text-blue-400 text-[0.6em] align-top cursor-pointer ml-0.5 hover:underline"
            title={footnoteText}
            onClick={() => {
              if (onFootnoteClick) {
                onFootnoteClick(node.foot.content);
              } else {
                alert(footnoteText);
              }
            }}
          >
            <Icons.Info />
          </span>
        ) : null;

      const isBlock = node.paragraph === true;

      return (
        <React.Fragment>
          {settings.paragraphMode && isBlock && (
            <span className="block mt-4 w-full"></span>
          )}
          <span className="inline">
            {nestedContent}
            {parsingSpan}
            {footnote}
            {settings.paragraphMode && node.break && <br />}
          </span>
          {!settings.paragraphMode && node.break && " "}
        </React.Fragment>
      );
    }

    // --- Text Node ---
    const { text: printedText, script: printedScript } = printedTextOf(
      node,
      settings.showTransliteration,
    );
    const scriptClass =
      printedScript === "H"
        ? "script-hebrew"
        : printedScript === "G"
          ? "script-greek"
          : "";

    let content = null;

    if (printedText) {
      content = (
        <span
          className={scriptClass}
          {...(printedScript === "H" ? { dir: "rtl" } : {})}
        >
          {printedText}
        </span>
      );
    }

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
        content = <span className="sc">{content}</span>;
      if (node.marks.includes("sup")) content = <sup>{content}</sup>;
    }

    const isBlock = node.paragraph === true;

    const footnoteText = node.foot
      ? getFootnoteText(
          node.foot.content,
          abbreviations,
          settings.showTransliteration,
        )
      : "";
    const footnote =
      settings.showFootnotes && node.foot ? (
        <span
          className="text-blue-600 dark:text-blue-400 text-[0.6em] align-top cursor-pointer ml-0.5 hover:underline"
          title={footnoteText}
          onClick={() => {
            if (onFootnoteClick) {
              onFootnoteClick(node.foot.content);
            } else {
              alert(footnoteText);
            }
          }}
        >
          <Icons.Info />
        </span>
      ) : null;

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
          className="font-mono font-bold text-gray-500 dark:text-gray-400 hover:underline"
        >
          {node.strong}
        </a>,
      );
    }
    if (settings.showLemma && node.lemma) {
      parsingInfo.push(
        <span
          key="l"
          className={`italic text-gray-400 ${
            parsingInfo.length > 0 ? "ml-1" : ""
          }`}
        >
          {node.lemma}
        </span>,
      );
    }
    if (settings.showMorph && node.morph) {
      parsingInfo.push(
        <span
          key="m"
          className={`text-gray-500 dark:text-gray-400 ${
            parsingInfo.length > 0 ? "ml-1" : ""
          }`}
        >
          {node.morph}
        </span>,
      );
    }

    const parsingSpan =
      parsingInfo.length > 0 ? (
        <span className="inline-flex align-baseline ml-1 text-[0.75em] select-none">
          {parsingInfo}
        </span>
      ) : null;

    return (
      <React.Fragment>
        {settings.paragraphMode && isBlock && (
          <span className="block mt-4 w-full"></span>
        )}
        <span className="inline">
          {content}
          {parsingSpan}
          {footnote}
          {settings.paragraphMode && node.break && <br />}
        </span>
        {!settings.paragraphMode && node.break && " "}
      </React.Fragment>
    );
  }

  return null;
}

window.ContentNode = ContentNode;
