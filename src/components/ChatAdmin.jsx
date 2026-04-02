import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import moment from "moment";

const ROLE_LABELS = {
  admin: "Administrateur",
  livreur: "Livreur",
  client: "Client",
  partenaire: "Partenaire",
  commercial: "Commercial",
};

const QUICK_MESSAGES = [
  "Bonjour, votre dossier est en cours d'examen.",
  "Merci d'ajouter votre CNIB (recto + verso).",
  "Merci d'ajouter une photo de votre moto ou véhicule.",
  "Votre photo est floue, veuillez la reprendre.",
  "Veuillez compléter les informations manquantes.",
  "Votre dossier a été validé ✅",
  "Votre dossier a été refusé. Motif : ",
];

// Composant de messagerie admin générique (fonctionne avec livreur, client, partenaire, commercial)
export default function ChatAdmin({ userEmail, userRole = "livreur", currentUser: propUser }) {
  const [currentUser, setCurrentUser] = useState(propUser);
  const [messages, setMessages] = useState([]);
  const [newMsg, setNewMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [showQuick, setShowQuick] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!propUser) { base44.auth.me().then(setCurrentUser); }
    else { setCurrentUser(propUser); }
  }, [propUser]);

  const loadMessages = async () => {
    const data = await base44.entities.MessageAdmin.filter({ livreur_email: userEmail }, "created_date", 100);
    setMessages(data);
    const role = currentUser?.role === "admin" ? "lu_admin" : "lu_livreur";
    data.filter(m => !m[role]).forEach(m => {
      base44.entities.MessageAdmin.update(m.id, { [role]: true });
    });
  };

  useEffect(() => {
    if (!userEmail) return;
    loadMessages();
    const unsub = base44.entities.MessageAdmin.subscribe((event) => {
      if (event.data?.livreur_email !== userEmail) return;
      if (event.type === "create") setMessages(prev => [...prev, event.data]);
      else if (event.type === "update") setMessages(prev => prev.map(m => m.id === event.id ? event.data : m));
    });
    return unsub;
  }, [userEmail]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!newMsg.trim()) return;
    setSending(true);
    const isAdmin = currentUser?.role === "admin";
    await base44.entities.MessageAdmin.create({
      livreur_email: userEmail,
      sender_email: currentUser?.email,
      sender_role: isAdmin ? "admin" : userRole,
      contenu: newMsg.trim(),
      lu_admin: isAdmin,
      lu_livreur: !isAdmin,
    });
    // Notifier l'utilisateur si c'est l'admin qui envoie
    if (isAdmin) {
      await base44.entities.Notification.create({
        destinataire_email: userEmail,
        destinataire_role: userRole,
        titre: "📩 Nouveau message de l'Administrateur",
        message: newMsg.trim(),
        type: "info",
        lue: false,
      });
    }
    // Notifier les admins si c'est un utilisateur qui envoie
    if (!isAdmin) {
      const admins = await base44.entities.User.filter({ role: "admin" });
      await Promise.all(admins.map(admin =>
        base44.entities.Notification.create({
          destinataire_email: admin.email,
          destinataire_role: "admin",
          titre: `📩 Message de ${ROLE_LABELS[userRole] || userRole}`,
          message: `${currentUser?.full_name || userEmail} : ${newMsg.trim()}`,
          type: "info",
          lue: false,
        })
      ));
    }
    setNewMsg("");
    setSending(false);
  };

  const isMe = (msg) => msg.sender_email === currentUser?.email;
  const isAdmin = currentUser?.role === "admin";

  return (
    <div className="flex flex-col h-72">
      <div className="flex-1 overflow-y-auto space-y-2 p-2 bg-muted/30 rounded-lg mb-2">
        {messages.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">Aucun message pour l'instant</p>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${isMe(msg) ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm ${
              isMe(msg) ? "bg-primary text-white" : "bg-white border text-foreground"
            }`}>
              <p>{msg.contenu}</p>
              <p className={`text-[10px] mt-0.5 ${isMe(msg) ? "text-white/70 text-right" : "text-muted-foreground"}`}>
                {ROLE_LABELS[msg.sender_role] || msg.sender_role} · {moment(msg.created_date).format("HH:mm")}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      {/* Messages rapides admin */}
      {isAdmin && showQuick && (
        <div className="mb-2 p-2 rounded-lg bg-muted/50 border space-y-1">
          {QUICK_MESSAGES.map((msg, i) => (
            <button
              key={i}
              onClick={() => { setNewMsg(msg); setShowQuick(false); }}
              className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-primary/10 hover:text-primary transition-colors"
            >
              {msg}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        {isAdmin && (
          <Button
            size="icon"
            variant="outline"
            onClick={() => setShowQuick(v => !v)}
            title="Messages rapides"
            className="flex-shrink-0"
          >
            <span className="text-xs font-bold">⚡</span>
          </Button>
        )}
        <Input
          placeholder="Écrire un message..."
          value={newMsg}
          onChange={e => setNewMsg(e.target.value)}
          onKeyDown={e => e.key === "Enter" && sendMessage()}
          className="flex-1 text-sm"
        />
        <Button size="icon" onClick={sendMessage} disabled={sending || !newMsg.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}