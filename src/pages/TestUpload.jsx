import { useState } from "react";

// Test comparatif : Méthode A (visible direct) vs Méthode B (overlay opacity)
export default function TestUpload() {
  const [resultA, setResultA] = useState(null);
  const [resultB, setResultB] = useState(null);
  const [previewA, setPreviewA] = useState(null);
  const [previewB, setPreviewB] = useState(null);

  const handleA = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setResultA(`✅ ${file.name}`);
    setPreviewA(URL.createObjectURL(file));
  };

  const handleB = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setResultB(`✅ ${file.name}`);
    setPreviewB(URL.createObjectURL(file));
  };

  return (
    <div style={{ padding: 16, maxWidth: 360, margin: "0 auto", fontFamily: "sans-serif" }}>
      <h2 style={{ fontSize: 18, fontWeight: "bold", marginBottom: 8 }}>🧪 Test Upload Comparatif</h2>
      <p style={{ fontSize: 12, color: "#64748b", marginBottom: 16 }}>Testez les 2 méthodes pour voir laquelle fonctionne sur votre appareil.</p>

      {/* MÉTHODE A : input direct visible (div relative + input opacity:0 inset:0) */}
      <div style={{ border: "2px solid #3b82f6", borderRadius: 12, padding: 12, marginBottom: 16 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: "#1d4ed8", marginBottom: 8 }}>Méthode A — Input overlay (actuelle)</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <div style={{ position: "relative", flex: 1, height: 50, borderRadius: 8, background: "#eff6ff", border: "1px solid #93c5fd", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#1d4ed8", pointerEvents: "none" }}>📷 Caméra</span>
            <input type="file" accept="image/*" capture="environment" onChange={handleA}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer" }} />
          </div>
          <div style={{ position: "relative", flex: 1, height: 50, borderRadius: 8, background: "#f9fafb", border: "1px solid #d1d5db", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#374151", pointerEvents: "none" }}>🖼️ Galerie</span>
            <input type="file" accept="image/*" onChange={handleA}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer" }} />
          </div>
        </div>
        {resultA && <p style={{ fontSize: 12, color: "#15803d", fontWeight: 600 }}>{resultA}</p>}
        {previewA && <img src={previewA} style={{ width: "100%", borderRadius: 8, marginTop: 8 }} alt="" />}
      </div>

      {/* MÉTHODE B : input natif brut, visible, sans aucun style de masquage */}
      <div style={{ border: "2px solid #10b981", borderRadius: 12, padding: 12, marginBottom: 16 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: "#065f46", marginBottom: 8 }}>Méthode B — Input natif brut (fallback)</p>
        <div style={{ marginBottom: 6 }}>
          <p style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>📷 Caméra :</p>
          <input type="file" accept="image/*" capture="environment" onChange={handleB}
            style={{ width: "100%", fontSize: 14, padding: "8px 0" }} />
        </div>
        <div style={{ marginBottom: 8 }}>
          <p style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>🖼️ Galerie :</p>
          <input type="file" accept="image/*" onChange={handleB}
            style={{ width: "100%", fontSize: 14, padding: "8px 0" }} />
        </div>
        {resultB && <p style={{ fontSize: 12, color: "#15803d", fontWeight: 600 }}>{resultB}</p>}
        {previewB && <img src={previewB} style={{ width: "100%", borderRadius: 8, marginTop: 8 }} alt="" />}
      </div>

      <p style={{ fontSize: 11, color: "#94a3b8", textAlign: "center" }}>
        Si Méthode B fonctionne mais pas A → problème overlay CSS.<br/>
        Si aucune ne fonctionne → WebView bloque les file inputs.
      </p>
    </div>
  );
}