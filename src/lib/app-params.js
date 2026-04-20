const isNode = typeof window === 'undefined';
const windowObj = isNode ? { localStorage: new Map() } : window;
const storage = windowObj.localStorage;

const toSnakeCase = (str) => {
	return str.replace(/([A-Z])/g, '_$1').toLowerCase();
}

const getAppParamValue = (paramName, { defaultValue = undefined, removeFromUrl = false } = {}) => {
	if (isNode) {
		return defaultValue;
	}
	const storageKey = `base44_${toSnakeCase(paramName)}`;
	const urlParams = new URLSearchParams(window.location.search);
	const searchParam = urlParams.get(paramName);
	if (removeFromUrl) {
		urlParams.delete(paramName);
		const newUrl = `${window.location.pathname}${urlParams.toString() ? `?${urlParams.toString()}` : ""
			}${window.location.hash}`;
		window.history.replaceState({}, document.title, newUrl);
	}
	if (searchParam) {
		storage.setItem(storageKey, searchParam);
		return searchParam;
	}
	if (defaultValue) {
		storage.setItem(storageKey, defaultValue);
		return defaultValue;
	}
	const storedValue = storage.getItem(storageKey);
	if (storedValue) {
		return storedValue;
	}
	return null;
}

// Détecte si on est dans un APK Capacitor (Android Studio)
const isCapacitorNative = () => {
	if (isNode) return false;
	if (window.location?.protocol === 'capacitor:') return true;
	if (typeof window.Capacitor !== 'undefined') return true;
	// Détecter file:// (WebView Android sans Capacitor configuré)
	if (window.location?.protocol === 'file:') return true;
	return false;
};

const getAppParams = () => {
	if (getAppParamValue("clear_access_token") === 'true') {
		storage.removeItem('base44_access_token');
		storage.removeItem('token');
	}

	const native = isCapacitorNative();

	// ✅ FIX 403: Utiliser cdl.base44.app (app subdomain) au lieu de app.base44.com (platform domain)
	const safeFromUrl = native
		? 'https://cdl.base44.app'
		: getAppParamValue("from_url", { defaultValue: window.location.href });

	// ✅ BLOQUER #1: appId depuis env VITE_BASE44_APP_ID (prioritaire sur URL param)
	const appIdFromEnv = import.meta.env.VITE_BASE44_APP_ID;
	const appId = appIdFromEnv || getAppParamValue("app_id");
	
	const appBaseUrl = 'https://cdl.base44.app';

	console.log('========================================');
	console.log('APP CONFIG - VITE_BASE44_APP_ID');
	console.log('========================================');
	console.log('VITE_BASE44_APP_ID: ' + (appIdFromEnv || 'MISSING'));
	console.log('appId final: ' + (appId || 'MISSING_APP_ID'));
	console.log('native mode: ' + native);
	console.log('appBaseUrl: ' + appBaseUrl);
	console.log('========================================');
	
	if (!appId) {
		console.error('ERREUR: appId manquant');
		if (!isNode && window.location?.pathname !== '/phone-auth') {
			console.error('Ajoute VITE_BASE44_APP_ID dans les secrets ou app_id= en URL');
		}
	}

	return {
		appId: appId || 'MISSING_APP_ID',
		token: getAppParamValue("access_token", { removeFromUrl: true }),
		fromUrl: safeFromUrl,
		functionsVersion: getAppParamValue("functions_version", { defaultValue: import.meta.env.VITE_BASE44_FUNCTIONS_VERSION }),
		appBaseUrl,
	}
}


export const appParams = {
	...getAppParams()
}