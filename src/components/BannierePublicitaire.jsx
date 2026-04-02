import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import PubliciteTracker from "./PubliciteTracker";
import { X } from "lucide-react";

export default function BannierePublicitaire({ placement }) {
  const [pubs, setPubs] = useState([]);
  const [current, setCurrent] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const load = async () => {
      const today = new Date().toISOString().split("T")[0];
      const all = await base44.entities.Publicite.filter({ active: true }, "created_date", 20);
      const filtered = all.filter(p => {
        const matchPlacement = p.placement === placement || p.placement === "toutes_pages";
        const started = !p.date_debut || p.date_debut <= today;
        const notExpired = !p.date_fin || p.date_fin >= today;
        return matchPlacement && started && notExpired;
      });
      setPubs(filtered);
      // Track impression une seule fois par session par pub
      filtered.forEach(p => {
        const key = `pub_seen_${p.id}`;
        if (!sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, '1');
          base44.entities.Publicite.update(p.id, { impressions: (p.impressions || 0) + 1 });
        }
      });
    };
    load();
  }, [placement]);

  useEffect(() => {
    if (pubs.length <= 1) return;
    const interval = setInterval(() => {
      setCurrent(c => (c + 1) % pubs.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [pubs.length]);

  if (dismissed || pubs.length === 0) return null;

  const pub = pubs[current];

  const handleClick = async () => {
    try {
      const user = await base44.auth.me();
      await base44.functions.invoke('trackPubliciteInteraction', {
        publicite_id: pub.id,
        interaction_type: 'click',
        user_id: user?.id,
        user_email: user?.email,
        user_role: 'client',
      });
    } catch (err) {
      console.error('[BannierePublicitaire] Click tracking error:', err);
    }
    if (pub.lien_url) window.open(pub.lien_url, "_blank");
  };

  return (
    <PubliciteTracker publiciteId={pub.id} userRole="client">
      <div className="relative rounded-xl overflow-hidden shadow-sm border border-border">
        <div className="absolute top-1.5 left-2 z-10">
          <span className="text-[9px] bg-black/50 text-white px-1.5 py-0.5 rounded-full font-medium">Pub</span>
        </div>
        <button
          className="absolute top-1.5 right-1.5 z-10 h-5 w-5 rounded-full bg-black/50 flex items-center justify-center"
          onClick={() => setDismissed(true)}
        >
          <X className="h-3 w-3 text-white" />
        </button>

        <img
          src={pub.image_url}
          alt={pub.titre}
          className="w-full h-28 object-cover cursor-pointer"
          onClick={handleClick}
        />

        {pub.description && (
          <div
            className="px-3 py-2 bg-card cursor-pointer"
            onClick={handleClick}
          >
            <p className="text-xs font-semibold truncate">{pub.titre}</p>
            <p className="text-[10px] text-muted-foreground truncate">{pub.description}</p>
          </div>
        )}

        {pubs.length > 1 && (
          <div className="flex justify-center gap-1 py-1.5 bg-card">
            {pubs.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                className={`h-1.5 rounded-full transition-all ${i === current ? "w-4 bg-primary" : "w-1.5 bg-muted-foreground/30"}`}
              />
            ))}
          </div>
        )}
      </div>
    </PubliciteTracker>
  );
}