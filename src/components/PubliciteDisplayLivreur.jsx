import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { X } from 'lucide-react';

export default function PubliciteDisplayLivreur({ userId, userEmail, user, disponible, coursesToday }) {
  const [publicites, setPublicites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    console.log('✅ [COMPONENT] PubliciteDisplayLivreur LOADED');
    
    const loadPublicites = async () => {
      try {
        const allPubs = await base44.entities.Publicite.list('-created_date', 50);
        console.log('📊 Total pubs récupérées:', allPubs?.length || 0);
        
        if (allPubs && allPubs.length > 0) {
          console.log('✅ Au moins 1 pub trouvée');
          setPublicites(allPubs);
        } else {
          console.log('⚠️ Zéro pub en DB');
          setPublicites([]);
        }
      } catch (err) {
        console.error('❌ Erreur:', err);
      }
      setLoading(false);
    };

    loadPublicites();

    const unsub = base44.entities.Publicite.subscribe(() => {
      loadPublicites();
    });

    return unsub;
  }, []);

  if (dismissed) return null;

  return (
    <div style={{ display: 'block', width: '100%', zIndex: 9999, marginTop: '10px' }}>
      {/* BLOC TEST VISIBLE */}
      <div style={{
        background: 'red',
        color: 'white',
        padding: '20px',
        textAlign: 'center',
        fontSize: '18px',
        fontWeight: 'bold',
        minHeight: '120px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
      }}>
        PUB COMPONENT ACTIVE ✅
        <button
          onClick={() => setDismissed(true)}
          style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            background: 'white',
            border: 'none',
            cursor: 'pointer',
            padding: '5px',
            borderRadius: '50%',
          }}
        >
          ✕
        </button>
      </div>

      {/* INFO DEBUG */}
      <div style={{
        background: '#f0f0f0',
        padding: '10px',
        fontSize: '12px',
        fontFamily: 'monospace',
      }}>
        <p>Loading: {loading ? 'OUI' : 'NON'}</p>
        <p>Pubs trouvées: {publicites.length}</p>
        <p>UserId: {userId}</p>
        <p>UserEmail: {userEmail}</p>
      </div>

      {/* AFFICHER LES PUBS SI DISPO */}
      {!loading && publicites.length > 0 && (
        <div style={{ marginTop: '20px', padding: '20px', background: '#f9f9f9', border: '1px solid #ddd' }}>
          <h3>Publicités ({publicites.length})</h3>
          {publicites.map((pub, i) => (
            <div key={i} style={{
              background: 'white',
              padding: '15px',
              marginBottom: '10px',
              border: '1px solid #ddd',
              borderRadius: '8px',
            }}>
              <p><strong>Titre:</strong> {pub.titre}</p>
              <p><strong>Placement:</strong> {pub.placement}</p>
              <p><strong>Active:</strong> {pub.active ? 'OUI' : 'NON'}</p>
              {pub.image_url && (
                <img
                  src={pub.image_url}
                  alt={pub.titre}
                  style={{ maxWidth: '100%', height: 'auto', marginTop: '10px' }}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}