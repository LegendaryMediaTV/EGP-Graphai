const { useState, useEffect, useMemo, useRef } = React;

function VerseRenderer({ verse, mode, settings, onFootnoteClick }) {
  const contentArray = Array.isArray(verse.content)
    ? verse.content
    : [verse.content];

  const preVerseNodes = [];
  const mainNodes = [];
  let split = false;

  for (const node of contentArray) {
    if (!split && (node.subtitle || node.heading)) {
      preVerseNodes.push(node);
    } else {
      split = true;
      mainNodes.push(node);
    }
  }

  let isParagraphStart = false;
  if (mainNodes.length > 0 && mainNodes[0].paragraph === true) {
    isParagraphStart = true;
    // Clone the first node and remove the paragraph flag so ContentNode doesn't render a double break
    mainNodes[0] = { ...mainNodes[0], paragraph: false };
  }

  return (
    <React.Fragment>
      <ContentNode
        node={preVerseNodes}
        settings={settings}
        onFootnoteClick={onFootnoteClick}
      />
      {settings.paragraphMode && isParagraphStart && <span className="block mt-4 w-full"></span>}
      {mode === "paragraph" && settings.showVerseNumbers && (
        <sup className="text-[0.6em] font-bold mr-1 text-gray-400 select-none">
          {verse.verse}
        </sup>
      )}
      <ContentNode
        node={mainNodes}
        settings={settings}
        onFootnoteClick={onFootnoteClick}
      />
      {mode === "paragraph" && " "}
    </React.Fragment>
  );
}

window.VerseRenderer = VerseRenderer;
