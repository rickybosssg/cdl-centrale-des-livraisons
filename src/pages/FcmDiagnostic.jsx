import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, XCircle, Loader2, RefreshCw } from "lucide-react";
import { requestNotificationPermission, registerFcmToken } from "@/lib/pushNotifications";
import { toast } from "sonner";

function StatusRow({ label, ok, detail }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b last:border-0">
      {ok === null ? (
        <Loader2 className="h-5 w-5 text-muted-foreground animate-spin mt-0.5" />
      ) : ok ? (
        <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
      ) : (
        <XCircle className="h-5 w-5 text-red-500 mt-0.5" />
      )}
      <div className="flex-1">
        <p className="text-sm font-medium">{label}</p>
        {detail && <p className="text-xs text-muted-foreground mt-0.5 break-all">{detail}</p>}
      </div>
    </div>
  );
}

export default function FcmDiagnostic() {
  const [checks, setChecks] = useState({
    permission: { ok: null, detail: "" },
    sw: { ok: null, detail: "" },
    token: { ok: null, detail: "" },
    tokenSaved: { ok: null, detail: "" },
  });
  const [sendingTest, setSendingTest] = useState(false);

  const runDiagnostic = async () => {
    setChecks({ permission: { ok: null, detail: "" }, sw: { ok: null, detail: "" }, token: { ok: null, detail: "" }, tokenSaved: { ok: null, detail: "" } });

    // 1. Permission
    const perm = Notification.permission;
    const permGranted = perm === "granted";
    if (!permGranted && perm === "default") {
      await requestNotificationPermission();
    }
    const permFinal = Notification.permission;
    setChecks(p => ({ ...p, permission: { ok: permFinal === "granted", detail: `État: ${permFinal}` } }));

    if (permFinal !== "granted") {
      setChecks(p => ({
        ...p,
        sw: { ok: false, detail: "Permission requise" },
        token: { ok: false, detail: "Permission requise" },
        tokenSaved: { ok: false, detail: "Permission requise" },
      }));
      return;
    }

    // 2. Service Worker
    try {
      const reg = await navigator.serviceWorker.getRegistration("/firebase-messaging-sw.js");
      const active = reg?.active;
      setChecks(p => ({
        ...p,
        sw: {
          ok: !!active,
          detail: active
            ? `Scope: ${reg.scope}, État: ${active.state}`
            : reg
            ? `Enregistré mais pas encore actif (état: ${reg.installing?.state || reg.waiting?.state || "inconnu"})`
            : "Aucun service worker trouvé",
        },
      }));
    } catch (e) {
      setChecks(p => ({ ...p, sw: { ok: false, detail: e.message } }));
    }

    // 3. Token FCM
    try {
      const token = await registerFcmToken();
      if (token) {
        setChecks(p => ({ ...p, token: { ok: true, detail: token.substring(0, 40) + "..." } }));

        // 4. Sauvegarder le token
        try {
          await base44.functions.invoke("saveFcmToken", { token });
          setChecks(p => ({ ...p, tokenSaved: { ok: true, detail: "Token enregistré en base" } }));
        } catch (e) {
          setChecks(p => ({ ...p, tokenSaved: { ok: false, detail: "Erreur sauvegarde: " + e.message } }));
        }
      } else {
        setChecks(p => ({
          ...p,
          token: { ok: false, detail: "Aucun token retourné (vérifier VAPID key)" },
          tokenSaved: { ok: false, detail: "Token manquant" },
        }));
      }
    } catch (e) {
      setChecks(p => ({
        ...p,
        token: { ok: false, detail: e.message },
        tokenSaved: { ok: false, detail: "Token manquant" },
      }));
    }
  };

  const sendTestNotif = async () => {
    setSendingTest(true);
    try {
      const me = await base44.auth.me();
      const res = await base44.functions.invoke("sendFcmNotification", {
        user_email: me.email,
        title: "🔔 Test CDL",
        body: "Si vous lisez ceci, les notifications fonctionnent !",
      });
      const d = res.data;
      if (d.sent > 0) {
        toast.success(`Notification envoyée sur ${d.sent} appareil(s) !`);
      } else {
        toast.error(`Envoi échoué: ${d.error || d.message || "Vérifiez le secret Firebase"}`);
      }
    } catch (e) {
      toast.error("Erreur: " + e.message);
    }
    setSendingTest(false);
  };

  useEffect(() => { runDiagnostic(); }, []);

  return (
    <div className="max-w-lg mx-auto p-4 space-y-4">
      <h1 className="text-xl font-bold">Diagnostic Notifications Firebase</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            Checks système
            <Button variant="ghost" size="icon" onClick={runDiagnostic}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-0">
          <StatusRow label="Permission navigateur" ok={checks.permission.ok} detail={checks.permission.detail} />
          <StatusRow label="Service Worker enregistré" ok={checks.sw.ok} detail={checks.sw.detail} />
          <StatusRow label="Token FCM généré" ok={checks.token.ok} detail={checks.token.detail} />
          <StatusRow label="Token sauvegardé en base" ok={checks.tokenSaved.ok} detail={checks.tokenSaved.detail} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Test d'envoi</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Envoie une notification push réelle vers votre appareil via Firebase. 
            Nécessite que le secret <code className="bg-muted px-1 rounded">FIREBASE_SERVICE_ACCOUNT_JSON</code> 
            soit configuré avec le JSON complet du compte de service.
          </p>
          <Button className="w-full" onClick={sendTestNotif} disabled={sendingTest || checks.tokenSaved.ok !== true}>
            {sendingTest ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : "🔔"}
            Envoyer une notification test
          </Button>
          {checks.tokenSaved.ok !== true && (
            <p className="text-xs text-amber-600 text-center">Complétez les checks ci-dessus d'abord</p>
          )}
        </CardContent>
      </Card>

      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="p-4">
          <p className="text-sm font-semibold text-amber-800 mb-2">⚠️ Correction requise</p>
          <p className="text-xs text-amber-700">
            Le secret <code>FIREBASE_SERVICE_ACCOUNT_JSON</code> contient actuellement un UUID invalide. 
            Il doit contenir le JSON complet du compte de service Firebase.
          </p>
          <ol className="text-xs text-amber-700 mt-2 space-y-1 list-decimal list-inside">
            <li>Firebase Console → Paramètres du projet</li>
            <li>Onglet "Comptes de service"</li>
            <li>Cliquer "Générer une nouvelle clé privée"</li>
            <li>Copier le contenu <em>complet</em> du fichier .json</li>
            <li>Coller dans le secret <code>FIREBASE_SERVICE_ACCOUNT_JSON</code></li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}