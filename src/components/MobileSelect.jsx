import { useState } from "react";
import { ChevronDown, MapPin, X, Search } from "lucide-react";

export default function MobileSelect({ value, onValueChange, options, placeholder, icon: Icon = MapPin }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = search.trim()
    ? options.filter(o => o.toLowerCase().includes(search.toLowerCase()))
    : options;

  return (
    <>
      {/* Déclencheur */}
      <button
        type="button"
        onClick={() => { setOpen(true); setSearch(""); }}
        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <span className={`truncate ${value ? "text-foreground" : "text-muted-foreground"}`}>
            {value || placeholder}
          </span>
        </div>
        <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-1" />
      </button>

      {/* Modal overlay */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-background rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold text-base">{placeholder}</h3>
              <button onClick={() => setOpen(false)} className="p-1 rounded-full hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Recherche */}
            <div className="p-3 border-b">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Rechercher..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 h-9 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  autoFocus
                />
              </div>
            </div>

            {/* Liste */}
            <div className="overflow-y-auto flex-1 p-2">
              {filtered.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-6">Aucun résultat</p>
              )}
              {filtered.map(opt => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => { onValueChange(opt); setOpen(false); }}
                  className={`w-full text-left px-4 py-3 rounded-lg text-sm transition-colors ${
                    value === opt
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "hover:bg-muted"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}