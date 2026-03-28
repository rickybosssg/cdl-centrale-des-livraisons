import { useState } from "react";
import { ChevronDown, MapPin } from "lucide-react";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import { useMediaQuery } from "@/hooks/use-mobile";

export default function MobileSelect({ value, onValueChange, options, placeholder, icon: Icon = MapPin }) {
  const [open, setOpen] = useState(false);
  const isMobile = useMediaQuery("(max-width: 640px)");

  if (!isMobile) {
    // Version desktop: affiche le select natif ou custom
    return (
      <div className="relative">
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onValueChange(e.target.value)}
          className="flex h-9 w-full rounded-md border border-input bg-transparent pl-9 pr-8 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      </div>
    );
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <button className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm text-left">
          <div className="flex items-center gap-2 flex-1">
            <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className={value ? "text-foreground" : "text-muted-foreground"}>
              {value || placeholder}
            </span>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        </button>
      </DrawerTrigger>
      <DrawerContent>
        <div className="max-w-lg mx-auto w-full px-4 py-4 pb-8">
          <h3 className="font-semibold mb-4 text-center">{placeholder}</h3>
          <div className="space-y-1 max-h-96 overflow-y-auto">
            {options.map((opt) => (
              <button
                key={opt}
                onClick={() => {
                  onValueChange(opt);
                  setOpen(false);
                }}
                className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
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
      </DrawerContent>
    </Drawer>
  );
}