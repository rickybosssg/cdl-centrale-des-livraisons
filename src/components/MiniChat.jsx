import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Send, MessageSquare, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { vibrateLight } from "@/lib/vibration";
import moment from "moment";

const MESSAGES_RAPIDES = [
  "Je suis en route 🛵",
  "Je suis arrivé au point de départ",
  "Colis récupéré, en route",
  "Merci de m'appeler",
  "Je suis devant chez vous",
];

export default function MiniChat({ course, user }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [texte, setTexte] = useState("");
  const [sending, setSending] = useState(false);
  const [nonLus, setNonLus] = useState(0);
  const bottomRef = useRef(null);
  const openRef = useRef(open);
  const courseTerminee = ["livree", "annulee"].includes(course.statut);

  useEffect(() => { openRef.current = open; }, [open]);

  // Charger les messages via la fonction backend (contourne la RLS)
  const chargerMessages = async () => {
    const res = await base44.functions.invoke('getMessages', { course_id: course.id });
    if (res.data?.messages) setMessages(res.data.messages);
  };

  useEffect(() => {
    chargerMessages();
  }, [course.id]);

  // Souscription temps réel — TOUJOURS active (pas conditionnée à open)
  useEffect(() => {
    const unsub = base44.entities.Message.subscribe((event) => {
      if (event.data?.course_id !== course.id) return;
      if (event.type === "create") {
        const nouveau = event.data;
        // Recharger via backend pour avoir tous les messages sans restriction RLS
        chargerMessages();
        // Notification si message de l'autre
        if (nouveau.sender_email !== user.email) {
          vibrateLight();
          if (!openRef.current) {
            setNonLus(prev => prev + 1);
            toast.info("💬 Nouveau message", {
              description: `${nouveau.sender_name || "Inconnu"} : ${nouveau.contenu}`,
              duration: 3000,
            });
          }
        }
      }
    });
    return unsub;
  }, [course.id, user.email]);

  // Scroll auto vers le bas
  useEffect(() => {
    if (open) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }, [messages, open]);

  const ouvrir = () => {
    setOpen(o => !o);
    if (!open) setNonLus(0);
  };

  const envoyer = async (contenu) => {
    if (!contenu.trim() || courseTerminee || sending) return;
    setSending(true);
    vibrateLight();
    // Utilise la fonction backend pour contourner la RLS
    await base44.functions.invoke('sendMessage', {
      course_id: course.id,
      contenu: contenu.trim(),
      sender_role: user.user_type || 'client',
    });
    setTexte("");
    setSending(false);
  };

  return (
    <div className="border rounded-xl overflow-hidden bg-card">
      {/* Header */}
      <button
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
        onClick={ouvrir}
      >
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">
            Chat avec {user.user_type === "client" ? "le livreur" : "le client"}
          </span>
          {nonLus > 0 && !open && (
            <span className="h-5 min-w-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center animate-pulse">
              {nonLus}
            </span>
          )}
        </div>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="border-t">
          {/* Messages */}
          <div className="h-56 overflow-y-auto p-3 space-y-2 bg-muted/20">
            {messages.length === 0 && (
              <p className="text-xs text-center text-muted-foreground pt-6">
                Aucun message. Démarrez la conversation !
              </p>
            )}
            {messages.map((msg) => {
              const isMe = msg.sender_email === user.email;
              return (
                <div key={msg.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                  {!isMe && (
                    <span className="text-[10px] text-muted-foreground mb-0.5 ml-1">
                      {msg.sender_name || "—"}
                    </span>
                  )}
                  <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm ${
                    isMe
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-card border rounded-bl-sm"
                  }`}>
                    {msg.contenu}
                  </div>
                  <span className={`text-[10px] text-muted-foreground mt-0.5 ${isMe ? "mr-1" : "ml-1"}`}>
                    {isMe ? "Envoyé • " : ""}{moment(msg.created_date).format("HH:mm")}
                  </span>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {/* Messages rapides */}
          {!courseTerminee && (
            <div className="flex gap-1.5 px-3 py-2 overflow-x-auto border-t bg-background/50">
              {MESSAGES_RAPIDES.map((m) => (
                <button
                  key={m}
                  onClick={() => envoyer(m)}
                  className="whitespace-nowrap text-[10px] px-2.5 py-1.5 rounded-full border bg-background hover:bg-muted transition-colors shrink-0"
                >
                  {m}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          {courseTerminee ? (
            <p className="text-xs text-center text-muted-foreground py-3 border-t">
              Chat clôturé — Course terminée
            </p>
          ) : (
            <div className="flex gap-2 p-3 border-t">
              <input
                className="flex-1 text-sm px-3 py-2 rounded-lg border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="Écrire un message..."
                value={texte}
                onChange={e => setTexte(e.target.value)}
                onKeyDown={e => e.key === "Enter" && envoyer(texte)}
              />
              <Button
                size="icon"
                onClick={() => envoyer(texte)}
                disabled={sending || !texte.trim()}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}