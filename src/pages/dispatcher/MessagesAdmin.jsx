import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, MessageCircle, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import ChatAdmin from "@/components/ChatAdmin";
import moment from "moment";

const ROLE_LABELS = {
  livreur: "🛵 Livreur",
  client: "👤 Client",
  partenaire: "🏪 Partenaire",
  commercial: "📣 Commercial",
};

export default function MessagesAdmin() {
  const navigate = useNavigate();
  const [adminUser, setAdminUser] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const load = async () => {
      const [me, msgs] = await Promise.all([
        base44.auth.me(),
        base44.entities.MessageAdmin.list("-created_date", 500),
      ]);
      setAdminUser(me);

      // Grouper par livreur_email (= email de l'utilisateur)
      const map = new Map();
      msgs.forEach(m => {
        if (!map.has(m.livreur_email)) {
          map.set(m.livreur_email, {
            email: m.livreur_email,
            role: m.sender_role === "admin" ? null : m.sender_role,
            lastMsg: m.contenu,
            lastDate: m.created_date,
            unread: 0,
          });
        }
        const conv = map.get(m.livreur_email);
        // Mettre à jour le dernier message
        if (new Date(m.created_date) > new Date(conv.lastDate)) {
          conv.lastMsg = m.contenu;
          conv.lastDate = m.created_date;
        }
        // Garder le rôle de l'utilisateur (pas admin)
        if (m.sender_role !== "admin" && m.sender_role) {
          conv.role = m.sender_role;
        }
        // Compter les non lus
        if (!m.lu_admin) conv.unread++;
      });

      setConversations(Array.from(map.values()).sort((a, b) => new Date(b.lastDate) - new Date(a.lastDate)));
      setLoading(false);
    };
    load();

    const unsub = base44.entities.MessageAdmin.subscribe((event) => {
      if (event.type === "create") {
        setConversations(prev => {
          const email = event.data.livreur_email;
          const exists = prev.find(c => c.email === email);
          if (exists) {
            return prev.map(c => c.email === email
              ? { ...c, lastMsg: event.data.contenu, lastDate: event.data.created_date, unread: event.data.lu_admin ? c.unread : c.unread + 1 }
              : c
            ).sort((a, b) => new Date(b.lastDate) - new Date(a.lastDate));
          }
          return [{ email, role: event.data.sender_role !== "admin" ? event.data.sender_role : null, lastMsg: event.data.contenu, lastDate: event.data.created_date, unread: event.data.lu_admin ? 0 : 1 }, ...prev];
        });
      }
    });
    return unsub;
  }, []);

  const filtered = conversations.filter(c =>
    !search || c.email.toLowerCase().includes(search.toLowerCase())
  );

  const totalUnread = conversations.reduce((s, c) => s + c.unread, 0);

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => { if (selected) setSelected(null); else navigate(-1); }} className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-muted">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2 flex-1">
          <MessageCircle className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold">{selected ? selected.email : "Messages"}</h1>
          {!selected && totalUnread > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{totalUnread}</span>
          )}
        </div>
      </div>

      {selected ? (
        <div className="space-y-2">
          <div className="p-2 rounded-xl bg-primary/5 border border-primary/20 text-xs text-primary font-medium">
            {ROLE_LABELS[selected.role] || "Utilisateur"} · {selected.email}
          </div>
          <ChatAdmin userEmail={selected.email} userRole={selected.role || "client"} currentUser={adminUser} />
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Rechercher par email..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              <MessageCircle className="h-10 w-10 mx-auto mb-2 opacity-30" />
              Aucune conversation
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(conv => (
                <button
                  key={conv.email}
                  onClick={() => setSelected(conv)}
                  className="w-full text-left p-4 rounded-xl border bg-card hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-primary">{ROLE_LABELS[conv.role] || "Utilisateur"}</span>
                        {conv.unread > 0 && (
                          <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{conv.unread}</span>
                        )}
                      </div>
                      <p className={`text-sm truncate ${conv.unread > 0 ? "font-semibold" : "text-muted-foreground"}`}>{conv.email}</p>
                      <p className="text-xs text-muted-foreground truncate">{conv.lastMsg}</p>
                    </div>
                    <p className="text-[10px] text-muted-foreground flex-shrink-0">{moment(conv.lastDate).fromNow()}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}