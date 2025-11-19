function SettingsDrawer({
  isOpen,
  onClose,
  settings,
  setSettings,
  toggleSetting,
}) {
  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-40 flex justify-end">
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-[1px]"
        onClick={onClose}
      ></div>
      <div
        className={`relative w-80 h-full shadow-2xl flex flex-col ${
          settings.darkMode
            ? "bg-gray-800 text-gray-100"
            : "bg-white text-gray-900"
        }`}
      >
        <div className="p-4 border-b dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900">
          <h2 className="font-bold text-lg flex items-center gap-2">
            <Icons.Cog /> Settings
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
          >
            <Icons.Times />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Appearance */}
          <section>
            <h3 className="text-xs font-bold uppercase text-gray-500 mb-3 tracking-wider">
              Appearance
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Icons.Moon /> Dark Mode
                </span>
                <Toggle
                  checked={settings.darkMode}
                  onChange={() => toggleSetting("darkMode")}
                />
              </div>
              <div className="flex flex-col gap-2">
                <span className="flex items-center gap-2">
                  <Icons.Font /> Font Size ({settings.fontSize}px)
                </span>
                <input
                  type="range"
                  min="12"
                  max="32"
                  step="1"
                  value={settings.fontSize}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      fontSize: Number(e.target.value),
                    }))
                  }
                  className="w-full accent-blue-600"
                />
              </div>
            </div>
          </section>

          {/* Layout */}
          <section>
            <h3 className="text-xs font-bold uppercase text-gray-500 mb-3 tracking-wider">
              Layout
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span>Paragraph Mode</span>
                <Toggle
                  checked={settings.paragraphMode}
                  onChange={() => toggleSetting("paragraphMode")}
                />
              </div>
              <div className="flex items-center justify-between">
                <span>Show Verse Numbers</span>
                <Toggle
                  checked={settings.showVerseNumbers}
                  onChange={() => toggleSetting("showVerseNumbers")}
                />
              </div>
              <div className="flex items-center justify-between">
                <span>Show Headings</span>
                <Toggle
                  checked={settings.showHeadings}
                  onChange={() => toggleSetting("showHeadings")}
                />
              </div>
              <div className="flex items-center justify-between">
                <span>Show Subtitles</span>
                <Toggle
                  checked={settings.showSubtitles}
                  onChange={() => toggleSetting("showSubtitles")}
                />
              </div>
            </div>
          </section>

          {/* Study Tools */}
          <section>
            <h3 className="text-xs font-bold uppercase text-gray-500 mb-3 tracking-wider">
              Study Tools
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-medium">Words of Christ</span>
                <select
                  value={settings.showWoC}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      showWoC: e.target.value,
                    }))
                  }
                  className={`border rounded px-2 py-1 text-sm ${
                    settings.darkMode
                      ? "bg-gray-700 border-gray-600"
                      : "bg-gray-100 border-gray-300"
                  }`}
                >
                  <option value="none">None</option>
                  <option value="red">Red</option>
                  <option value="blue">Blue</option>
                  <option value="purple">Purple</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <span>Footnotes</span>
                <Toggle
                  checked={settings.showFootnotes}
                  onChange={() => toggleSetting("showFootnotes")}
                />
              </div>
              <div className="flex items-center justify-between">
                <span>Strong's Numbers</span>
                <Toggle
                  checked={settings.showStrongs}
                  onChange={() => toggleSetting("showStrongs")}
                />
              </div>
              <div className="flex items-center justify-between">
                <span>Morphology</span>
                <Toggle
                  checked={settings.showMorph}
                  onChange={() => toggleSetting("showMorph")}
                />
              </div>
              <div className="flex items-center justify-between">
                <span>Lemma</span>
                <Toggle
                  checked={settings.showLemma}
                  onChange={() => toggleSetting("showLemma")}
                />
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

window.SettingsDrawer = SettingsDrawer;
