import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, XCircle, AlertCircle, Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

const SECTIONS = [
  {
    id: "manifest",
    title: "AndroidManifest.xml",
    color: "border-blue-300 bg-blue-50",
    icon: "📄",
    instructions: "Fichier : android/app/src/main/AndroidManifest.xml",
    checks: [
      {
        id: "perm_camera",
        label: "Permission CAMERA",
        code: '<uses-permission android:name="android.permission.CAMERA" />',
        required: true,
      },
      {
        id: "perm_location",
        label: "Permission ACCESS_FINE_LOCATION",
        code: '<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />\n<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />',
        required: true,
      },
      {
        id: "perm_notif",
        label: "Permission POST_NOTIFICATIONS (Android 13+)",
        code: '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />',
        required: true,
      },
      {
        id: "perm_storage",
        label: "Permissions Stockage/Galerie",
        code: '<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />\n<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />\n<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="29" />',
        required: true,
      },
      {
        id: "perm_internet",
        label: "Permission INTERNET",
        code: '<uses-permission android:name="android.permission.INTERNET" />',
        required: true,
      },
      {
        id: "perm_vibrate",
        label: "Permission VIBRATE",
        code: '<uses-permission android:name="android.permission.VIBRATE" />',
        required: false,
      },
      {
        id: "capacitor_activity",
        label: "android:exported=\"true\" sur MainActivity",
        code: '<activity\n  android:name=".MainActivity"\n  android:exported="true"\n  android:launchMode="singleTask">',
        required: true,
      },
      {
        id: "fcm_service",
        label: "Service FCM déclaré",
        code: '<service\n  android:name="io.invertase.firebase.messaging.RNFirebaseMessagingService"\n  android:exported="false">\n  <intent-filter>\n    <action android:name="com.google.firebase.MESSAGING_EVENT" />\n  </intent-filter>\n</service>',
        required: true,
      },
    ],
  },
  {
    id: "build_gradle",
    title: "android/app/build.gradle",
    color: "border-green-300 bg-green-50",
    icon: "⚙️",
    instructions: "Incrémenter avant chaque build Play Store",
    checks: [
      {
        id: "version_code",
        label: "versionCode incrémenté (+1)",
        code: 'android {\n  defaultConfig {\n    versionCode 2   // ← incrémenter à chaque build\n    versionName "1.1.0"\n  }\n}',
        required: true,
      },
      {
        id: "min_sdk",
        label: "minSdkVersion >= 23",
        code: 'minSdkVersion 23',
        required: true,
      },
      {
        id: "target_sdk",
        label: "targetSdkVersion >= 34 (Play Store 2024)",
        code: 'targetSdkVersion 34',
        required: true,
      },
    ],
  },
  {
    id: "fcm",
    title: "Firebase & FCM",
    color: "border-orange-300 bg-orange-50",
    icon: "🔔",
    instructions: "Vérifications Firebase Cloud Messaging",
    checks: [
      {
        id: "google_services",
        label: "google-services.json présent dans android/app/",
        code: "android/app/google-services.json",
        required: true,
      },
      {
        id: "fcm_foreground",
        label: "Notifications app OUVERTE (FcmDeepLinkHandler via onForegroundMessage → toast sonner)",
        code: "// App.jsx — CAS 3 : onForegroundMessage → toast avec bouton 'Voir'",
        required: true,
      },
      {
        id: "fcm_background",
        label: "Notifications app EN ARRIÈRE-PLAN (SW postMessage → navigate)",
        code: "// App.jsx — CAS 2 : serviceWorker.addEventListener('message', onSwMsg)",
        required: true,
      },
      {
        id: "fcm_closed",
        label: "Notifications app FERMÉE (notif_route → sessionStorage → navigate)",
        code: "// App.jsx — CAS 1 : sessionStorage.getItem('cdl_notif_route')",
        required: true,
      },
      {
        id: "fcm_token_save",
        label: "Token FCM sauvegardé (AppLayoutWrapper → saveFcmToken)",
        code: "// AppLayoutWrapper.jsx — initFcm() → base44.functions.invoke('saveFcmToken', { token })",
        required: true,
      },
    ],
  },
  {
    id: "capacitor",
    title: "Capacitor / Plugins",
    color: "border-purple-300 bg-purple-50",
    icon: "📱",
    instructions: "Plugins Capacitor nécessaires",
    checks: [
      {
        id: "cap_camera",
        label: "@capacitor/camera installé",
        code: "npx cap sync android",
        required: true,
      },
      {
        id: "cap_geolocation",
        label: "@capacitor/geolocation installé",
        code: "npx cap sync android",
        required: true,
      },
      {
        id: "cap_push",
        label: "@capacitor/push-notifications installé",
        code: "npx cap sync android",
        required: true,
      },
      {
        id: "cap_sync",
        label: "npx cap sync android exécuté après npm run build",
        code: "npm run build && npx cap sync android",
        required: true,
      },
    ],
  },
  {
    id: "build",
    title: "Build AAB Play Store",
    color: "border-slate-300 bg-slate-50",
    icon: "🏗️",
    instructions: "Commandes de build dans Android Studio ou terminal",
    checks: [
      {
        id: "build_npm",
        label: "npm run build (Vite production build)",
        code: "npm run build",
        required: true,
      },
      {
        id: "build_cap_sync",
        label: "npx cap sync android",
        code: "npx cap sync android",
        required: true,
      },
      {
        id: "build_aab",
        label: "AAB généré via Android Studio → Build → Generate Signed Bundle",
        code: "Build > Generate Signed Bundle/APK > Android App Bundle > keystore > release",
        required: true,
      },
      {
        id: "build_r8",
        label: "R8/ProGuard activé (release build)",
        code: 'buildTypes {\n  release {\n    minifyEnabled true\n    proguardFiles getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro"\n  }\n}',
        required: false,
      },
    ],
  },
  {
    id: "functional",
    title: "Tests fonctionnels sur APK réelle",
    color: "border-red-300 bg-red-50",
    icon: "🧪",
    instructions: "Tester manuellement sur appareil Android physique",
    checks: [
      { id: "test_login", label: "✅ Connexion email / Facebook", required: true },
      { id: "test_multiprofil", label: "✅ Multi-profils — switch entre espaces", required: true },
      { id: "test_livreur_signup", label: "✅ Création profil livreur", required: true },
      { id: "test_camera", label: "✅ Upload documents via caméra APK", required: true },
      { id: "test_gallery", label: "✅ Upload documents via galerie APK", required: true },
      { id: "test_livreur_valid", label: "✅ Validation livreur par admin/staff", required: true },
      { id: "test_bedou_recharge", label: "✅ Recharge Bedou (avec preuve photo)", required: true },
      { id: "test_bedou_retrait", label: "✅ Retrait Bedou", required: true },
      { id: "test_course_create", label: "✅ Création course client", required: true },
      { id: "test_notif_livreur", label: "✅ Notification reçue livreur (foreground)", required: true },
      { id: "test_accept_course", label: "✅ Bouton accepter course → navigation", required: true },
      { id: "test_cancel_course", label: "✅ Annulation course client", required: true },
      { id: "test_tracking", label: "✅ Suivi live GPS sur carte", required: true },
      { id: "test_dispatch", label: "✅ Dispatch manuel staff", required: true },
      { id: "test_staff_delegation", label: "✅ Délégation personnel CDL", required: true },
      { id: "test_ads", label: "✅ Validation publicité annonceur", required: true },
      { id: "test_complaint", label: "✅ Réclamation support client", required: true },
      { id: "test_notif_closed", label: "✅ Clic notification app fermée → bonne page", required: true },
    ],
  },
];

export default function PlayStoreValidationFinal() {
  const navigate = useNavigate();
  const [checked, setChecked] = useState({});
  const [failed, setFailed] = useState({});

  const toggle = (id, status) => {
    if (status === "ok") {
      setChecked(p => ({ ...p, [id]: !p[id] }));
      setFailed(p => { const n = { ...p }; delete n[id]; return n; });
    } else {
      setFailed(p => ({ ...p, [id]: !p[id] }));
      setChecked(p => { const n = { ...p }; delete n[id]; return n; });
    }
  };

  const totalChecks = SECTIONS.flatMap(s => s.checks).length;
  const totalRequired = SECTIONS.flatMap(s => s.checks).filter(c => c.required).length;
  const totalOk = Object.values(checked).filter(Boolean).length;
  const totalKo = Object.values(failed).filter(Boolean).length;
  const requiredOk = SECTIONS.flatMap(s => s.checks).filter(c => c.required && checked[c.id]).length;
  const isReady = requiredOk === totalRequired && totalKo === 0;
  const progress = Math.round((totalOk / totalChecks) * 100);

  const copyCode = (code) => {
    navigator.clipboard.writeText(code).then(() => toast.success("Copié !"));
  };

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Validation Play Store</h1>
          <p className="text-xs text-muted-foreground">Checklist finale avant publication</p>
        </div>
      </div>

      {/* Résumé */}
      <div className={`rounded-2xl p-4 border-2 ${isReady ? "border-green-400 bg-green-50" : "border-amber-400 bg-amber-50"}`}>
        <div className="flex items-center gap-3">
          {isReady
            ? <CheckCircle2 className="h-8 w-8 text-green-600 flex-shrink-0" />
            : <AlertCircle className="h-8 w-8 text-amber-600 flex-shrink-0" />}
          <div>
            <p className={`font-extrabold text-lg ${isReady ? "text-green-800" : "text-amber-800"}`}>
              {isReady ? "✅ PRÊT POUR LE PLAY STORE" : "⏳ Validation en cours"}
            </p>
            <p className="text-xs text-muted-foreground">{totalOk}/{totalChecks} vérifications OK · {totalKo} échecs · {progress}% complété</p>
          </div>
        </div>
        {/* Barre de progression */}
        <div className="mt-3 h-2 bg-white/60 rounded-full overflow-hidden">
          <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Sections */}
      {SECTIONS.map(section => {
        const sectionOk = section.checks.filter(c => checked[c.id]).length;
        const sectionKo = section.checks.filter(c => failed[c.id]).length;
        return (
          <Card key={section.id} className={`border-2 ${section.color}`}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-sm">{section.icon} {section.title}</p>
                  <p className="text-xs text-muted-foreground">{section.instructions}</p>
                </div>
                <span className="text-xs font-bold text-muted-foreground">{sectionOk}/{section.checks.length}</span>
              </div>

              <div className="space-y-2">
                {section.checks.map(check => (
                  <div key={check.id} className="bg-white/80 rounded-xl p-3 space-y-2 border border-white">
                    <div className="flex items-start gap-2">
                      <div className="flex-1">
                        <p className={`text-xs font-semibold ${check.required ? "" : "text-muted-foreground"}`}>
                          {check.label}
                          {!check.required && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">optionnel</span>}
                        </p>
                        {check.code && (
                          <div className="mt-1 relative group">
                            <pre className="text-[10px] bg-slate-900 text-green-400 rounded-lg p-2 overflow-x-auto whitespace-pre-wrap">{check.code}</pre>
                            <button onClick={() => copyCode(check.code)} className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-700 rounded p-0.5">
                              <Copy className="h-2.5 w-2.5 text-white" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => toggle(check.id, "ok")}
                        className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-bold border-2 transition-all ${checked[check.id] ? "bg-green-500 border-green-500 text-white" : "border-green-300 text-green-700 hover:bg-green-50"}`}
                      >
                        <CheckCircle2 className="h-3 w-3" /> OK
                      </button>
                      <button
                        onClick={() => toggle(check.id, "ko")}
                        className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-bold border-2 transition-all ${failed[check.id] ? "bg-red-500 border-red-500 text-white" : "border-red-300 text-red-700 hover:bg-red-50"}`}
                      >
                        <XCircle className="h-3 w-3" /> Échec
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* Rapport final */}
      <Card className={`border-2 ${isReady ? "border-green-400" : "border-slate-300"}`}>
        <CardContent className="p-4 space-y-3">
          <p className="font-bold text-sm">📊 Rapport final</p>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tests réussis</span>
              <span className="font-bold text-green-600">{totalOk} / {totalChecks}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tests échoués</span>
              <span className={`font-bold ${totalKo > 0 ? "text-red-600" : "text-muted-foreground"}`}>{totalKo}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Requis complétés</span>
              <span className="font-bold">{requiredOk} / {totalRequired}</span>
            </div>
            <div className="flex justify-between border-t pt-2 mt-2">
              <span className="font-bold">Statut Play Store</span>
              <span className={`font-extrabold ${isReady ? "text-green-600" : "text-red-600"}`}>
                {isReady ? "✅ PRÊT" : "⛔ NON PRÊT"}
              </span>
            </div>
          </div>

          {totalKo > 0 && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200">
              <p className="text-xs font-bold text-red-700 mb-1">Bugs / Échecs détectés :</p>
              {SECTIONS.flatMap(s => s.checks).filter(c => failed[c.id]).map(c => (
                <p key={c.id} className="text-xs text-red-700">• {c.label}</p>
              ))}
            </div>
          )}

          {isReady && (
            <div className="p-3 rounded-xl bg-green-50 border border-green-200">
              <p className="text-xs font-bold text-green-700">✅ L'application CDL est validée et prête pour soumission sur Google Play Store.</p>
              <p className="text-xs text-green-600 mt-1">Générez l'AAB signé via Android Studio et soumettez via Play Console.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Guide commandes finales */}
      <Card className="border-slate-200">
        <CardContent className="p-4 space-y-3">
          <p className="font-bold text-sm">🖥️ Commandes finales (dans l'ordre)</p>
          {[
            { step: "1", cmd: "npm run build", desc: "Build production Vite" },
            { step: "2", cmd: "npx cap sync android", desc: "Synchroniser vers Android" },
            { step: "3", cmd: "npx cap open android", desc: "Ouvrir Android Studio" },
            { step: "4", cmd: "Build > Generate Signed Bundle > AAB", desc: "Générer l'AAB signé" },
            { step: "5", cmd: "play.google.com/console", desc: "Soumettre sur Play Console" },
          ].map(item => (
            <div key={item.step} className="flex items-center gap-3">
              <span className="h-7 w-7 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center flex-shrink-0">{item.step}</span>
              <div className="flex-1">
                <pre className="text-xs bg-slate-900 text-green-400 rounded-lg px-3 py-1.5 overflow-x-auto">{item.cmd}</pre>
                <p className="text-[10px] text-muted-foreground mt-0.5">{item.desc}</p>
              </div>
              <button onClick={() => copyCode(item.cmd)} className="flex-shrink-0">
                <Copy className="h-3 w-3 text-muted-foreground hover:text-primary" />
              </button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}