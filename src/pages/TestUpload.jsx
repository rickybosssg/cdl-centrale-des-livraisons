import { useState } from "react";

// Page de test minimale — aucun JS .click(), label enveloppe input directement
export default function TestUpload() {
  const [preview, setPreview] = useState(null);
  const [msg, setMsg] = useState("En attente...");

  const handle = (e, src) => {
    const file = e.target.files?.[0];
    if (!file) { setMsg(`❌ Aucun fichier (${src})`); return; }
    setMsg(`✅ ${src} : ${file.name} (${(file.size/1024).toFixed(1)} KB)`);
    setPreview(URL.createObjectURL(file));
    e.target.value = "";
  };

  return (
    <div style={{ padding: 16, maxWidth: 360, margin: "0 auto", fontFamily: "sans-serif" }}>
      <h2 style={{ fontSize: 18, fontWeight: "bold", marginBottom: 16 }}>🧪 Test Upload</h2>

      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        {/* CAMÉRA */}
        <label style={{
          position: "relative", flex: 1, display: "block",
          padding: "16px 0", borderRadius: 10, textAlign: "center",
          background: "#3b82f6", color: "white", fontSize: 14, fontWeight: 700,
          cursor: "pointer", WebkitTapHighlightColor: "transparent",
        }}>
          📷 Caméra
          <input
            type="file" accept="image/*" capture="environment"
            onChange={e => handle(e, "Caméra")}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer", fontSize: 16 }}
          />
        </label>

        {/* GALERIE */}
        <label style={{
          position: "relative", flex: 1, display: "block",
          padding: "16px 0", borderRadius: 10, textAlign: "center",
          background: "#6b7280", color: "white", fontSize: 14, fontWeight: 700,
          cursor: "pointer", WebkitTapHighlightColor: "transparent",
        }}>
          🖼️ Galerie
          <input
            type="file" accept="image/*"
            onChange={e => handle(e, "Galerie")}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer", fontSize: 16 }}
          />
        </label>
      </div>

      <div style={{ background: "#f1f5f9", borderRadius: 8, padding: 12, fontSize: 13, marginBottom: 12, color: "#334155" }}>
        {msg}
      </div>

      {preview && (
        <img src={preview} alt="aperçu" style={{ width: "100%", borderRadius: 10 }} />
      )}

      <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 12, textAlign: "center" }}>
        Si aucun picker ne s'ouvre → le WebView bloque les inputs file.<br/>
        Si galerie s'ouvre mais pas caméra → capture="environment" non supporté.
      </p>
    </div>
  );
}