import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { useState } from "react";

export default function DownloadLogoPDF() {
  const [loading, setLoading] = useState(false);

  const downloadPDF = async () => {
    setLoading(true);
    try {
      const response = await base44.functions.invoke("generateLogoPDF", {});
      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "CDL-Logo.pdf";
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Erreur:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button onClick={downloadPDF} disabled={loading} className="gap-2">
      <Download className="h-4 w-4" />
      {loading ? "Génération..." : "Télécharger Logo PDF"}
    </Button>
  );
}