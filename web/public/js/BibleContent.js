const { useState, useEffect, useMemo, useRef } = React;

function BibleContent({ content, settings }) {
  if (!content || content.length === 0)
    return (
      <div className="text-center text-gray-400 mt-10">
        Select a book and chapter to begin reading.
      </div>
    );

  const style = {
    fontSize: `${settings.fontSize}px`,
    fontFamily: '"Atkinson Hyperlegible", sans-serif',
  };

  // Extract footnotes
  const footnotes = useMemo(() => {
    if (!settings.showFootnotes) return [];
    const notes = [];
    let count = 0;

    const traverse = (node) => {
      if (!node) return;
      if (Array.isArray(node)) {
        node.forEach(traverse);
      } else if (typeof node === "object") {
        if (node.foot) {
          count++;
          notes.push({ id: count, content: node.foot.content });
          // Assign an ID to the node for linking (mutating the node copy would be ideal but we are reading state)
          // We'll handle the link in ContentNode by using a counter or context if possible,
          // but for now let's just render the list at the bottom.
        }
        if (node.paragraph) traverse(node.paragraph);
        if (node.heading) traverse(node.heading);
        if (node.subtitle) traverse(node.subtitle);
      }
    };

    content.forEach((verse) => traverse(verse.content));
    return notes;
  }, [content, settings.showFootnotes]);

  return (
    <div className="flex flex-col gap-8">
      {settings.paragraphMode ? (
        <div style={style} className="">
          {content.map((verse) => (
            <VerseRenderer
              key={`${verse.book}-${verse.chapter}-${verse.verse}`}
              verse={verse}
              mode="paragraph"
              settings={settings}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col" style={style}>
          {content.map((verse) => (
            <div
              key={`${verse.book}-${verse.chapter}-${verse.verse}`}
              className="flex gap-3 group hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded"
            >
              {settings.showVerseNumbers && (
                <span className="text-xs font-bold text-gray-400 w-8 text-right pt-1 shrink-0 select-none">
                  {verse.verse}
                </span>
              )}
              <div className="">
                <VerseRenderer verse={verse} mode="verse" settings={settings} />
              </div>
            </div>
          ))}
        </div>
      )}

      {footnotes.length > 0 && (
        <div className="mt-8 pt-4 border-t border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400">
          <h4 className="font-bold mb-2">Footnotes</h4>
          <ol className="list-decimal list-inside space-y-1">
            {footnotes.map((note, i) => (
              <li key={i}>
                <ContentNode
                  node={note.content}
                  settings={{ ...settings, showFootnotes: false }}
                />
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
window.BibleContent = BibleContent;
