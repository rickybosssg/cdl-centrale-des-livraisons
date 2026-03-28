import { useState, useRef, useEffect } from "react";
import { QUARTIERS_OUAGADOUGOU } from "@/lib/quartiers";
import { MapPin, ChevronDown } from "lucide-react";

export default function QuartierSelect({ value, onValueChange, placeholder }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value || "");
  const ref = useRef(null);

  useEffect(() => {
    if (!open) setQuery(value || "");
  }, [value, open]);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = query.trim()
    ? QUARTIERS_OUAGADOUGOU.filter(q => q.toLowerCase().includes(query.toLowerCase()))
    : QUARTIERS_OUAGADOUGOU;

  const handleSelect = (q) => {
    onValueChange(q);
    setQuery(q);
    setOpen(false);
  };

  const handleInputChange = (e) => {
    setQuery(e.target.value);
    onValueChange(e.target.value);
    setOpen(true);
  };

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={() => setOpen(true)}
          placeholder={placeholder || "Tapez ou sélectionnez un quartier..."}
          className="flex h-9 w-full rounded-md border border-input bg-transparent pl-9 pr-8 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <ChevronDown
          className={`absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground cursor-pointer transition-transform ${open ? "rotate-180" : ""}`}
          onClick={() => setOpen(o => !o)}
        />
      </div>

      {open && (
        <div className="absolute z-50 w-full mt-1 max-h-56 overflow-auto rounded-md border bg-popover text-popover-foreground shadow-md">
          {filtered.length > 0 ? (
            filtered.map((q) => (
              <div
                key={q}
                onMouseDown={() => handleSelect(q)}
                className={`px-3 py-2 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground ${value === q ? "bg-accent/50 font-medium" : ""}`}
              >
                {q}
              </div>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              Quartier "{query}" — appuyez sur Entrée pour confirmer
            </div>
          )}
        </div>
      )}
    </div>
  );
}