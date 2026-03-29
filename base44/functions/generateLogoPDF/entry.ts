import { jsPDF } from "npm:jspdf@4.0.0";

Deno.serve(async (req) => {
  try {
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4"
    });

    // Couleur primaire (bleu)
    const primaryColor = [32, 120, 198];
    const white = [255, 255, 255];

    // Titre
    doc.setFontSize(24);
    doc.setTextColor(...primaryColor);
    doc.text("CDL APP", 105, 30, { align: "center" });

    // Sous-titre
    doc.setFontSize(12);
    doc.setTextColor(100, 100, 100);
    doc.text("Centrale des Livraisons - Ouagadougou", 105, 40, { align: "center" });

    // Grand logo au centre
    doc.setFillColor(...primaryColor);
    doc.rect(75, 60, 60, 60, "F");
    
    doc.setFontSize(48);
    doc.setTextColor(...white);
    doc.text("CDL", 105, 98, { align: "center" });

    // Description
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text("Plateforme de logistique et de livraison", 105, 140, { align: "center" });
    doc.text("Service rapide et fiable", 105, 150, { align: "center" });

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(180, 180, 180);
    doc.text("© 2026 CDL APP. Tous droits réservés.", 105, 280, { align: "center" });

    const pdfBytes = doc.output("arraybuffer");
    
    return new Response(pdfBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=CDL-Logo.pdf"
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});