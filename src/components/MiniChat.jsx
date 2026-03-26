import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Send, MessageSquare, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

const MESSAGES_RAPIDES = [
  "Je suis en route 🛵",
  "Je suis arrivé au point de départ",
  "Colis récupéré, en route pour la livraison",
  "Merci de m'appeler",
  "Je suis devant chez vous",
];

export default function MiniChat({ course, user }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [texte, setTexte] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  const courseTerminee = ["livree", "annulee"].includes(course.statut);

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      const data = await base44.entities.Message.filter({ course_id: course.id }, "created_date", 50);
      setMessages(data);
    };
    load();
    const unsub = base44.entities.Message.subscribe((event) => {
      if (event.data?.course_id === course.id) {
        if (event.type === "create") setMessages(prev => [...prev, event.data]);
      }
    });
    return unsub;
  }, [open, course.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const envoyer = async (contenu) => {
    if (!contenu.trim() || courseTerminee) return;
    setSending(true);
    await base44.entities.Message.create({
      course_id: course.id,
      sender_email: user.email,
      sender_name: user.full_name,
      sender_role: user.user_type,
      contenu: contenu.trim(),
    });
    setTexte("");
    setSending(false);
  };

  return (
    <div className="border rounded-xl overflow-hidden bg-card">
      {/* Header */}
      <button
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Chat avec {user.user_type === "client" ? "le livreur" : "le client"}</span>
        </div>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="border-t">
          {/* Messages */}
          <div className="h-48 overflow-y-auto p-3 space-y-2 bg-muted/20">
            {messages.length === 0 && (
              <p className="text-xs text-center text-muted-foreground pt-4">Aucun message. Démarrez la conversation !</p>
            )}
            {messages.map((msg) => {
              const isMe = msg.sender_email === user.email;
              return (
                <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] px-3 py-1.5 rounded-2xl text-sm ${
                    isMe
                      ? "bg-primary text-primary-foreground rounded-br-none"
                      : "bg-card border rounded-bl-none"
                  }`}>
                    {msg.contenu}
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {/* Messages rapides */}
          {!courseTerminee && (
            <div className="flex gap-1.5 px-3 py-2 overflow-x-auto">
              {MESSAGES_RAPIDES.map((m) => (
                <button
                  key={m}
                  onClick={() => envoyer(m)}
                  className="whitespace-nowrap text-[10px] px-2 py-1 rounded-full border bg-background hover:bg-muted transition-colors shrink-0"
                >
                  {m}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          {courseTerminee ? (
            <p className="text-xs text-center text-muted-foreground py-2 border-t">
              Chat clôturé - Course terminée
            </p>
          ) : (
            <div className="flex gap-2 p-3 border-t">
              <input
                className="flex-1 text-sm px-3 py-2 rounded-lg border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="Votre message..."
                value={texte}
                onChange={e => setTexte(e.target.value)}
                onKeyDown={e => e.key === "Enter" && envoyer(texte)}
              />
              <Button size="icon" onClick={() => envoyer(texte)} disabled={sending || !texte.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}