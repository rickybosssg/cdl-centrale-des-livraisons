import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QUARTIERS_OUAGADOUGOU } from "@/lib/quartiers";

export default function QuartierSelect({ value, onValueChange, placeholder }) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder || "Sélectionner un quartier"} />
      </SelectTrigger>
      <SelectContent>
        {QUARTIERS_OUAGADOUGOU.map((q) => (
          <SelectItem key={q} value={q}>{q}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}