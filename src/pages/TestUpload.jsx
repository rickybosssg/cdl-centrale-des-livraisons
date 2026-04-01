import { useState } from "react";

export default function TestUpload() {
  const [preview, setPreview] = useState(null);
  const [fileName, setFileName] = useState(null);
  const [log, setLog] = useState([]);

  const addLog = (msg) => setLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 9)]);

  const handleChange = (e) => {
    addLog("onChange déclenché");
    const file = e.target.files?.[0];
    if (!file) { addLog("❌ Aucun fichier sélectionné"); return; }
    addLog(`✅ Fichier sélectionné: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
    setFileName(file.name);
    const url = URL.createObjectURL(file);
    setPreview(url);
    addLog("✅ Aperçu généré");
  };

  return (
    <div className="p-4 space-y-4 max-w-sm mx-auto">
      <h1 className="text-xl font-bold">🧪 Test Upload Image</h1>
      <p className="text-sm text-muted-foreground">Page de diagnostic – cliquez le bouton pour choisir une image</p>

      {/* Zone upload - input overlay sur le bouton */}
      <div className="relative h-14 rounded-xl overflow-hidden border-2 border-primary bg-primary/10">
        <div className="absolute inset-0 flex items-center justify-center gap-2 text-primary font-semibold text-sm pointer-events-none">
          📷 Choisir une image
        </div>
        <input
          type="file"
          accept="image/*"
          onChange={handleChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          style={{ fontSize: '16px' }}
        />
      </div>

      {/* Aperçu */}
      {preview && (
        <div className="space-y-2">
          <img src={preview} alt="aperçu" className="w-full rounded-xl border object-cover max-h-48" />
          <p className="text-xs text-green-700 font-semibold bg-green-50 p-2 rounded-lg">✅ {fileName}</p>
        </div>
      )}

      {/* Logs */}
      <div className="bg-black rounded-xl p-3 space-y-1 min-h-[80px]">
        <p className="text-xs text-green-400 font-mono font-bold mb-2">Console debug :</p>
        {log.length === 0 && <p className="text-xs text-gray-500 font-mono">En attente du clic...</p>}
        {log.map((l, i) => (
          <p key={i} className="text-xs text-green-300 font-mono">{l}</p>
        ))}
      </div>

      <p className="text-xs text-center text-muted-foreground">
        Si aucune action après clic → problème WebView/navigateur.<br />
        Si aperçu visible → upload fonctionne.
      </p>
    </div>
  );
}