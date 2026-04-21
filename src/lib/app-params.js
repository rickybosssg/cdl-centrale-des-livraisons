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

	// Avec server.url dans capacitor.config.json, la WebView charge depuis https://cdl.base44.app
	// donc window.location.href sera déjà https://cdl.base44.app/...
	// En mode file:// (vieux APK sans server.url), forcer manuellement
	const isFileProt = !isNode && window.location?.protocol === 'file:';
	const safeFromUrl = isFileProt
		? 'https://cdl.base44.app'
		: getAppParamValue("from_url", { defaultValue: !isNode ? window.location.href : '' });

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

	// Lire le token : priorité localStorage (post-OTP APK) > URL param
	const urlToken = getAppParamValue("access_token", { removeFromUrl: true });
	const storedToken = (() => {
		try { return isNode ? null : localStorage.getItem('base44_access_token'); }
		catch { return null; }
	})();
	const effectiveToken = urlToken || storedToken || null;

	return {
		appId: appId || 'MISSING_APP_ID',
		token: effectiveToken,
		fromUrl: safeFromUrl,
		functionsVersion: getAppParamValue("functions_version", { defaultValue: import.meta.env.VITE_BASE44_FUNCTIONS_VERSION }),
		appBaseUrl,
	}
}


export const appParams = {
	...getAppParams()
}