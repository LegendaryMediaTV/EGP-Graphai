const { useEffect, useRef } = React;

function FootnoteModal({ content, onClose, settings }) {
  const modalRef = useRef(null);

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  if (!content) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full p-6 relative animate-in fade-in zoom-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
        >
          <Icons.Times />
        </button>
        <h3 className="text-lg font-bold mb-4 text-gray-900 dark:text-gray-100">
          Footnote
        </h3>
        <div className="text-gray-700 dark:text-gray-300 leading-relaxed">
          <ContentNode
            node={content}
            settings={{ ...settings, showFootnotes: false }}
          />
        </div>
      </div>
    </div>
  );
}

window.FootnoteModal = FootnoteModal;
