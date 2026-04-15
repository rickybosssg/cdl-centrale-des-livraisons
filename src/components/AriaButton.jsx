import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { X, Send, Sparkles, Loader2, ChevronDown } from "lucide-react";
import ReactMarkdown from "react-markdown";

// Suggestions contextuelles par rôle
const SUGGESTIONS = {
  client: [
    "Comment commander un colis ?",
    "Suivre ma course en cours",
    "Quels sont les tarifs ?",
    "Comment utiliser mon Bedou ?",
  ],
  livreur: [
    "Comment accepter une course ?",
    "Comment voir mes gains du jour ?",
    "Que faire si je suis en retard ?",
    "Comment passer en ligne ?",
  ],
  commercial: [
    "Comment partager mon code promo ?",
    "Quand puis-je retirer mes gains ?",
    "Comment suivre mes filleuls ?",
    "Combien je gagne par parrainage ?",
  ],
  partenaire: [
    "Comment gérer ma boutique ?",
    "Comment traiter une commande ?",
    "Comment ajouter un produit ?",
    "Voir mes ventes du jour",
  ],
  admin: [
    "Voir les courses en attente",
    "Comment dispatcher manuellement ?",
    "Statistiques du jour",
    "Gérer les profils en attente",
  ],
  annonceur: [
    "Comment créer une publicité ?",
    "Voir mes statistiques de pub",
    "Comment cibler mes clients ?",
    "Comment recharger mon budget ?",
  ],
};

const GREETINGS = {
  client:     "Bonjour ! Je suis ARIA 👋\nComment puis-je vous aider aujourd'hui ?",
  livreur:    "Salut ! Je suis ARIA 🛵\nBesoin d'aide pour vos courses ?",
  commercial: "Bonjour ! Je suis ARIA 💼\nComment optimiser vos gains aujourd'hui ?",
  partenaire: "Bonjour ! Je suis ARIA 🏪\nComment gérer votre boutique ?",
  admin:      "Bonjour Admin ! Je suis ARIA ⚙️\nComment puis-je vous assister ?",
  annonceur:  "Bonjour ! Je suis ARIA 📢\nComment optimiser vos campagnes ?",
};

export default function AriaButton({ userRole = "client" }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversation, setConversation] = useState(null);
  const [initDone, setInitDone] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  const role = userRole || "client";
  const suggestions = SUGGESTIONS[role] || SUGGESTIONS.client;
  const greeting = GREETINGS[role] || GREETINGS.client;

  // Initialiser la conversation à l'ouverture
  useEffect(() => {
    if (!open || initDone) return;
    const init = async () => {
      try {
        const conv = await base44.agents.createConversation({
          agent_name: "aria",
          metadata: { role, started_at: new Date().toISOString() },
        });
        setConversation(conv);
        setMessages([{ role: "assistant", content: greeting }]);
        setInitDone(true);
      } catch (_) {
        setMessages([{ role: "assistant", content: greeting }]);
        setInitDone(true);
      }
    };
    init();
  }, [open]);

  // Scroll auto
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input à l'ouverture
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 300);
  }, [open]);

  // Abonnement temps réel
  useEffect(() => {
    if (!conversation?.id) return;
    const unsub = base44.agents.subscribeToConversation(conversation.id, (data) => {
      if (data.messages?.length > 0) {
        // Reconstruire : garder le greeting + messages agent
        const agentMsgs = data.messages.filter(m => m.role !== "system");
        setMessages([{ role: "assistant", content: greeting }, ...agentMsgs]);
      }
    });
    return unsub;
  }, [conversation?.id]);

  const sendMessage = async (text) => {
    const msg = text || input.trim();
    if (!msg || loading) return;
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: msg }]);
    setLoading(true);
    try {
      if (conversation) {
        await base44.agents.addMessage(conversation, { role: "user", content: msg });
      } else {
        // Fallback sans conversation
        setMessages(prev => [...prev, {
          role: "assistant",
          content: "Je suis ARIA ! Pour un service optimal, connectez-vous à votre compte CDL. 😊",
        }]);
      }
    } catch (_) {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Une erreur est survenue. Réessayez dans un instant.",
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* ── Bouton flottant ── */}
      <button
        onClick={() => setOpen(v => !v)}
        className={`fixed bottom-20 right-4 z-50 flex items-center gap-2 shadow-xl transition-all duration-300 active:scale-95 ${
          open
            ? "bg-gray-800 text-white px-3 py-2.5 rounded-2xl"
            : "bg-gradient-to-br from-primary to-blue-700 text-white px-4 py-3 rounded-2xl"
        }`}
        style={{ boxShadow: "0 4px 24px rgba(29,113,205,0.45)" }}
      >
        {open ? (
          <><X className="h-4 w-4" /><span className="text-xs font-bold">Fermer</span></>
        ) : (
          <><Sparkles className="h-4 w-4" /><span className="text-sm font-bold">ARIA</span></>
        )}
      </button>

      {/* ── Panel chat ── */}
      {open && (
        <div
          className="fixed bottom-36 right-4 z-50 w-[calc(100vw-2rem)] max-w-sm bg-white rounded-3xl shadow-2xl border border-border flex flex-col overflow-hidden"
          style={{ height: "420px", animation: "slideUp 0.25s ease" }}
        >
          <style>{`
            @keyframes slideUp {
              from { opacity: 0; transform: translateY(16px); }
              to   { opacity: 1; transform: translateY(0); }
            }
          `}</style>

          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-primary to-blue-700 flex-shrink-0">
            <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-white">ARIA</p>
              <p className="text-[10px] text-white/70">Assistante CDL • Toujours disponible</p>
            </div>
            <button onClick={() => setOpen(false)} className="text-white/70 hover:text-white p-1">
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-gray-50">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                {m.role === "assistant" && (
                  <div className="h-6 w-6 rounded-full bg-gradient-to-br from-primary to-blue-700 flex items-center justify-center mr-1.5 flex-shrink-0 mt-0.5">
                    <Sparkles className="h-3 w-3 text-white" />
                  </div>
                )}
                <div
                  className={`max-w-[82%] px-3 py-2 rounded-2xl text-sm ${
                    m.role === "user"
                      ? "bg-primary text-white rounded-br-sm"
                      : "bg-white border border-border text-foreground rounded-bl-sm shadow-sm"
                  }`}
                >
                  {m.role === "assistant" ? (
                    <ReactMarkdown
                      className="prose prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 text-sm"
                      components={{
                        p: ({ children }) => <p className="my-0.5 leading-relaxed">{children}</p>,
                        ul: ({ children }) => <ul className="my-1 ml-3 list-disc">{children}</ul>,
                        li: ({ children }) => <li className="my-0">{children}</li>,
                      }}
                    >
                      {m.content}
                    </ReactMarkdown>
                  ) : (
                    <p>{m.content}</p>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-full bg-gradient-to-br from-primary to-blue-700 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="h-3 w-3 text-white" />
                </div>
                <div className="bg-white border border-border px-3 py-2 rounded-2xl rounded-bl-sm shadow-sm">
                  <div className="flex gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Suggestions (si peu de messages) */}
          {messages.length <= 1 && (
            <div className="px-3 py-2 flex gap-1.5 overflow-x-auto flex-shrink-0 bg-gray-50 border-t border-border/50">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(s)}
                  className="flex-shrink-0 text-[11px] font-medium px-2.5 py-1.5 rounded-full bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 active:scale-95 transition-all whitespace-nowrap"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-t border-border bg-white flex-shrink-0">
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
              placeholder="Posez votre question..."
              className="flex-1 text-sm bg-gray-100 rounded-xl px-3 py-2 outline-none focus:bg-gray-50 focus:ring-1 focus:ring-primary/30 transition-all"
              disabled={loading}
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading}
              className="h-8 w-8 rounded-xl bg-primary text-white flex items-center justify-center disabled:opacity-40 active:scale-95 transition-all flex-shrink-0"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      )}
    </>
  );
}