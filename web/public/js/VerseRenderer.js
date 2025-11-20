const { useState, useEffect, useMemo, useRef } = React;

function VerseRenderer({ verse, mode, settings }) {
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

  return (
    <React.Fragment>
      <ContentNode node={preVerseNodes} settings={settings} />
      {mode === "paragraph" && settings.showVerseNumbers && (
        <sup className="text-[0.6em] font-bold mr-1 text-gray-400 select-none">
          {verse.verse}
        </sup>
      )}
      <ContentNode node={mainNodes} settings={settings} />
      {mode === "paragraph" && " "}
    </React.Fragment>
  );
}

window.VerseRenderer = VerseRenderer;
