import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { X, Send, Sparkles, Loader2, ChevronDown, MessageCircle } from "lucide-react";
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

// Contexte intelligent par rôle
const CONTEXT_LABELS = {
  client:     "💬 Besoin d'aide ? ARIA est là",
  livreur:    "🛵 Trouver une course",
  commercial: "💰 Gagner de l'argent",
  partenaire: "🏪 Gérer ma boutique",
  admin:      "⚙️ Voir alertes",
  annonceur:  "📢 Optimiser campagnes",
};

export default function AriaButton({ userRole = "client" }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversation, setConversation] = useState(null);
  const [initDone, setInitDone] = useState(false);
  const [showTooltip, setShowTooltip] = useState(true);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const inactivityTimer = useRef(null);

  const role = userRole || "client";
  const suggestions = SUGGESTIONS[role] || SUGGESTIONS.client;
  const greeting = GREETINGS[role] || GREETINGS.client;
  const contextLabel = CONTEXT_LABELS[role] || CONTEXT_LABELS.client;

  // Tooltip visible 3s au chargement, puis réapparaît après 30s d'inactivité
  useEffect(() => {
    setShowTooltip(true);
    const timer = setTimeout(() => setShowTooltip(false), 3000);

    const resetInactivity = () => {
      clearTimeout(inactivityTimer.current);
      inactivityTimer.current = setTimeout(() => setShowTooltip(true), 30000);
    };

    const events = ['click', 'keydown', 'scroll', 'touchstart'];
    events.forEach(e => document.addEventListener(e, resetInactivity));

    return () => {
      clearTimeout(timer);
      clearTimeout(inactivityTimer.current);
      events.forEach(e => document.removeEventListener(e, resetInactivity));
    };
  }, []);

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
      {/* Styles animations */}
      <style>{`
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 20px rgba(29,113,205,0.6), 0 8px 24px rgba(29,113,205,0.35); }
          50% { box-shadow: 0 0 30px rgba(29,113,205,0.8), 0 8px 32px rgba(29,113,205,0.45); }
        }
        @keyframes subtle-bounce {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-4px); }
        }
        .aria-fab { animation: pulse-glow 3s ease-in-out infinite, subtle-bounce 2s ease-in-out infinite; }
        .aria-tooltip { animation: fadeIn 0.3s ease, fadeOut 0.3s ease 2.7s forwards; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeOut { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(8px); } }
      `}</style>

      {/* ── Tooltip contextuel ── */}
      {showTooltip && !open && (
        <div className="aria-tooltip fixed bottom-32 right-4 z-40 bg-gradient-to-r from-primary to-blue-700 text-white px-4 py-2.5 rounded-2xl shadow-xl text-sm font-semibold whitespace-nowrap pointer-events-none">
          {contextLabel}
          <div className="absolute -bottom-1 right-6 w-3 h-3 bg-gradient-to-r from-primary to-blue-700 rotate-45" />
        </div>
      )}

      {/* ── Bouton FAB circulaire premium ── */}
      <button
        onClick={() => {
          setOpen(v => !v);
          setShowTooltip(false);
        }}
        className={`aria-fab fixed bottom-24 right-5 z-50 flex items-center justify-center rounded-full transition-all duration-300 active:scale-90 flex-shrink-0 ${
          open
            ? "h-12 w-12 bg-gray-800 text-white"
            : "h-16 w-16 bg-gradient-to-br from-primary via-blue-600 to-violet-600 text-white hover:scale-110"
        }`}
        style={{
          boxShadow: open
            ? "0 4px 16px rgba(0,0,0,0.2)"
            : "0 8px 32px rgba(29,113,205,0.45), 0 0 20px rgba(29,113,205,0.3)",
        }}
        title={open ? "Fermer" : "Ouvrir ARIA"}
      >
        {open ? (
          <X className="h-6 w-6" />
        ) : (
          <MessageCircle className="h-8 w-8 drop-shadow-lg" />
        )}
      </button>

      {/* ── Panel chat ── */}
       {open && (
        <div
          className="fixed bottom-32 right-5 z-50 w-[calc(100vw-2.5rem)] max-w-sm bg-white rounded-3xl shadow-2xl border border-border flex flex-col overflow-hidden"
          style={{ height: "480px", animation: "slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1)" }}
        >


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