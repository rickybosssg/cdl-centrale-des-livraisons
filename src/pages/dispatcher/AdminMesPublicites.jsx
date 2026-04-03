import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, Plus, Eye, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import moment from 'moment';

export default function AdminMesPublicites() {
  const navigate = useNavigate();
  const [pubs, setPubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');

  useEffect(() => {
    const load = async () => {
      try {
        const me = await base44.auth.me();
        if (me?.role !== 'admin') {
          navigate('/admin-dashboard');
          return;
        }
        const data = await base44.entities.Publicite.filter(
          { nom_annonceur: 'CDL Admin' },
          '-created_date',
          100
        );
        setPubs(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error('[AdminMesPublicites] Error:', e);
        toast.error('Erreur chargement');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [navigate]);

  const handleDelete = async (pub) => {
    if (!window.confirm('Supprimer cette publicité ?')) return;
    try {
      await base44.entities.Publicite.delete(pub.id);
      setPubs(prev => prev.filter(p => p.id !== pub.id));
      toast.success('Publicité supprimée');
    } catch (e) {
      toast.error('Erreur suppression');
    }
  };

  const handleToggle = async (pub) => {
    try {
      const newActive = !pub.active;
      await base44.entities.Publicite.update(pub.id, { active: newActive });
      setPubs(prev => prev.map(p => p.id === pub.id ? { ...p, active: newActive } : p));
      toast.success(newActive ? 'Activée' : 'Désactivée');
    } catch (e) {
      toast.error('Erreur');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const allPubs = pubs;
  const activePubs = pubs.filter(p => p.active);
  const inactivePubs = pubs.filter(p => !p.active);

  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin-dashboard')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Mes publicités</h1>
          <p className="text-xs text-muted-foreground">Admin</p>
        </div>
        <Button size="sm" onClick={() => navigate('/admin-creer-publicite')}>
          <Plus className="h-4 w-4 mr-1" /> Créer
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="all">Toutes ({allPubs.length})</TabsTrigger>
          <TabsTrigger value="active">Actives ({activePubs.length})</TabsTrigger>
          <TabsTrigger value="inactive">Inactives ({inactivePubs.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4 space-y-2">
          {allPubs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">Aucune publicité</div>
          ) : (
            allPubs.map(pub => <PubCard key={pub.id} pub={pub} onDelete={handleDelete} onToggle={handleToggle} />)
          )}
        </TabsContent>

        <TabsContent value="active" className="mt-4 space-y-2">
          {activePubs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">Aucune</div>
          ) : (
            activePubs.map(pub => <PubCard key={pub.id} pub={pub} onDelete={handleDelete} onToggle={handleToggle} />)
          )}
        </TabsContent>

        <TabsContent value="inactive" className="mt-4 space-y-2">
          {inactivePubs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">Aucune</div>
          ) : (
            inactivePubs.map(pub => <PubCard key={pub.id} pub={pub} onDelete={handleDelete} onToggle={handleToggle} />)
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PubCard({ pub, onDelete, onToggle }) {
  return (
    <Card>
      <CardContent className="p-3 flex items-center gap-3">
        {pub.image_url && (
          <img src={pub.image_url} alt="" className="h-16 w-16 rounded-lg object-cover flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{pub.titre}</p>
          <p className="text-xs text-muted-foreground">{moment(pub.created_date).format('DD/MM/YY')}</p>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${pub.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
            {pub.active ? '✅ Active' : '⚪ Inactive'}
          </span>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => onToggle(pub)}>
            <Eye className="h-3 w-3" />
          </Button>
          <Button size="sm" variant="outline" className="h-8 px-2 text-red-600 border-red-300" onClick={() => onDelete(pub)}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}