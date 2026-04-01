import { useState } from "react";

export default function TestUpload() {
  const [preview, setPreview] = useState(null);
  const [fileName, setFileName] = useState(null);
  const [status, setStatus] = useState("En attente du clic...");

  const handleChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) { setStatus("❌ Aucun fichier sélectionné"); return; }
    setStatus(`✅ Fichier: ${file.name} — ${(file.size/1024).toFixed(1)} KB`);
    setFileName(file.name);
    setPreview(URL.createObjectURL(file));
  };

  return (
    <div style={{ padding: '16px', maxWidth: '360px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px' }}>🧪 Test Upload</h1>

      {/* Zone cliquable — label enveloppe l'input */}
      <label style={{
        display: 'block',
        textAlign: 'center',
        padding: '20px',
        background: '#3b82f6',
        color: 'white',
        borderRadius: '12px',
        fontSize: '16px',
        fontWeight: '600',
        cursor: 'pointer',
        marginBottom: '16px',
        WebkitTapHighlightColor: 'transparent',
      }}>
        📷 Choisir une photo
        <input
          type="file"
          accept="image/*"
          onChange={handleChange}
          style={{
            position: 'absolute',
            width: '1px',
            height: '1px',
            opacity: 0,
            overflow: 'hidden',
            clip: 'rect(0,0,0,0)',
          }}
        />
      </label>

      {/* Statut */}
      <div style={{ background: '#f1f5f9', borderRadius: '8px', padding: '12px', marginBottom: '16px', fontSize: '13px', color: '#334155' }}>
        {status}
      </div>

      {/* Aperçu */}
      {preview && (
        <div>
          <img src={preview} alt="aperçu" style={{ width: '100%', borderRadius: '10px', marginBottom: '8px' }} />
          <p style={{ fontSize: '12px', color: '#16a34a', fontWeight: '600' }}>✅ {fileName}</p>
        </div>
      )}
    </div>
  );
}