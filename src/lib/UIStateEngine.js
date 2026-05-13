/**
 * UIStateEngine — SOURCE UNIQUE pour les états UI globaux
 *
 * COMPATIBILITÉ : système événementiel — ne modifie rien d'existant
 * Gère : loaders, toasts, banners, modals, états erreur, retry
 *
 * Usage : UIStateEngine.toast.success(...), UIStateEngine.loading.show(key), etc.
 * LOGS : [ENGINE_INIT] [ENGINE_READY] [ENGINE_MIGRATION_OK] [ENGINE_ERROR]
 */

const ENGINE_VERSION = '1.0.0';

console.log(`[ENGINE_INIT] UIStateEngine v${ENGINE_VERSION}`);

// Registry des loaders actifs
const _loaders = new Map();
// Registry des listeners
const _listeners = new Map();

function emit(event, data) {
  const handlers = _listeners.get(event) || [];
  handlers.forEach(fn => { try { fn(data); } catch (_) {} });
}

function on(event, handler) {
  if (!_listeners.has(event)) _listeners.set(event, []);
  _listeners.get(event).push(handler);
  return () => {
    const arr = _listeners.get(event) || [];
    const idx = arr.indexOf(handler);
    if (idx > -1) arr.splice(idx, 1);
  };
}

const UIStateEngine = {
  version: ENGINE_VERSION,

  // ── Event bus (pour React components) ─────────────────────────────────────
  on,
  emit,

  // ── Loaders ────────────────────────────────────────────────────────────────

  loading: {
    show(key, label = '') {
      _loaders.set(key, { key, label, since: Date.now() });
      emit('loading:change', { key, active: true, label });
    },
    hide(key) {
      _loaders.delete(key);
      emit('loading:change', { key, active: false });
    },
    isActive(key) {
      return _loaders.has(key);
    },
    getAll() {
      return [..._loaders.values()];
    },
    isAnyActive() {
      return _loaders.size > 0;
    },
  },

  // ── Toasts (délègue à sonner si disponible, sinon console) ─────────────────

  toast: {
    _sonner: null,
    async _getSonner() {
      if (!this._sonner) {
        const mod = await import('sonner').catch(() => null);
        this._sonner = mod?.toast || null;
      }
      return this._sonner;
    },
    async success(msg, opts) {
      const t = await this._getSonner();
      if (t) t.success(msg, opts);
      else console.log(`[UI:toast:success] ${msg}`);
      console.log(`[ENGINE_MIGRATION_OK] UIStateEngine.toast.success | ${msg}`);
    },
    async error(msg, opts) {
      const t = await this._getSonner();
      if (t) t.error(msg, opts);
      else console.error(`[UI:toast:error] ${msg}`);
      console.log(`[ENGINE_ERROR] UIStateEngine.toast.error | ${msg}`);
    },
    async info(msg, opts) {
      const t = await this._getSonner();
      if (t) t(msg, opts);
      else console.info(`[UI:toast:info] ${msg}`);
    },
    async warning(msg, opts) {
      const t = await this._getSonner();
      if (t) t.warning ? t.warning(msg, opts) : t(msg, opts);
      else console.warn(`[UI:toast:warning] ${msg}`);
    },
  },

  // ── Banners ────────────────────────────────────────────────────────────────

  banner: {
    show(id, { message, type = 'info', persistent = false, action }) {
      emit('banner:show', { id, message, type, persistent, action });
      console.log(`[ENGINE_MIGRATION_OK] UIStateEngine.banner.show | id=${id} | type=${type}`);
    },
    hide(id) {
      emit('banner:hide', { id });
    },
  },

  // ── Modals ─────────────────────────────────────────────────────────────────

  modal: {
    open(id, data = {}) {
      emit('modal:open', { id, data });
      console.log(`[ENGINE_MIGRATION_OK] UIStateEngine.modal.open | id=${id}`);
    },
    close(id) {
      emit('modal:close', { id });
    },
  },

  // ── États erreur avec retry ────────────────────────────────────────────────

  error: {
    _errors: new Map(),

    set(key, message, retryFn = null) {
      UIStateEngine.error._errors.set(key, { message, retryFn, since: Date.now() });
      emit('error:set', { key, message, hasRetry: !!retryFn });
      console.log(`[ENGINE_ERROR] UIStateEngine.error.set | key=${key} | ${message}`);
    },
    clear(key) {
      UIStateEngine.error._errors.delete(key);
      emit('error:clear', { key });
    },
    get(key) {
      return UIStateEngine.error._errors.get(key) || null;
    },
    async retry(key) {
      const err = UIStateEngine.error._errors.get(key);
      if (err?.retryFn) {
        UIStateEngine.error.clear(key);
        try {
          await err.retryFn();
          console.log(`[ENGINE_MIGRATION_OK] UIStateEngine.error.retry | key=${key} | success`);
        } catch (e) {
          UIStateEngine.error.set(key, e.message, err.retryFn);
        }
      }
    },
  },
};

console.log(`[ENGINE_READY] UIStateEngine v${ENGINE_VERSION} chargé`);

export default UIStateEngine;