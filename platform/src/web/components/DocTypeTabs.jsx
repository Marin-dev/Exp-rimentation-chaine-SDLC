import React, { useState } from "react";

/**
 * Tabs for document typologies. `types` = [{ key, label, items }].
 * Each tab shows its count; the active tab's documents are rendered via renderItem.
 * Empty types still show as a tab (so the phase's structure is visible) and
 * display an "À produire" placeholder.
 */
export default function DocTypeTabs({ types, renderItem, emptyHint = "À produire" }) {
  const list = types || [];
  const firstWithItems = list.find((t) => t.items.length > 0);
  const [active, setActive] = useState((firstWithItems || list[0])?.key);
  const activeType = list.find((t) => t.key === active) || list[0];
  if (!activeType) return null;

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 border-b border-ey-border pb-2 mb-3">
        {list.map((t) => {
          const isActive = t.key === active;
          const empty = t.items.length === 0;
          return (
            <button
              key={t.key}
              onClick={() => setActive(t.key)}
              className={`text-[12.5px] font-medium px-2.5 py-1 rounded-md transition ${
                isActive
                  ? "bg-ey-black text-white"
                  : empty
                  ? "text-ey-gray02 hover:bg-base-200"
                  : "text-ey-black hover:bg-base-200"
              }`}
            >
              {t.label}
              <span className={isActive ? "opacity-70 ml-1" : "text-ey-gray02 ml-1"}>({t.items.length})</span>
            </button>
          );
        })}
      </div>

      {activeType.items.length === 0 ? (
        <div className="text-[12.5px] text-ey-gray02 italic px-3 py-3 border border-dashed border-ey-border rounded-md">
          {emptyHint}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {activeType.items.map((doc) => renderItem(doc))}
        </div>
      )}
    </div>
  );
}
