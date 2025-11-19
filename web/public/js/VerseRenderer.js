const { useState, useEffect, useMemo, useRef } = React;

function VerseRenderer({ verse, mode, settings }) {
  return (
    <React.Fragment>
      {mode === "paragraph" && settings.showVerseNumbers && (
        <sup className="text-[0.6em] font-bold mr-1 text-gray-400 select-none">
          {verse.verse}
        </sup>
      )}
      <ContentNode node={verse.content} settings={settings} />
      {mode === "paragraph" && " "}
    </React.Fragment>
  );
}

window.VerseRenderer = VerseRenderer;
