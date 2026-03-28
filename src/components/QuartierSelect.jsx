import MobileSelect from "./MobileSelect";
import { QUARTIERS_OUAGADOUGOU } from "@/lib/quartiers";

export default function QuartierSelect({ value, onValueChange, placeholder }) {
  return <MobileSelect 
    value={value} 
    onValueChange={onValueChange} 
    options={QUARTIERS_OUAGADOUGOU}
    placeholder={placeholder || "Sélectionnez un quartier..."}
  />;
}