// ============================================================
// Router SPA (hash routing)
// ============================================================
// Rutas disponibles:
//   #login           → pública
//   #dashboard       → protegida
//   #inventario      → protegida
//   #escaner         → protegida
//   #bajo-stock      → protegida
//   #config          → protegida
//   #producto/:id    → protegida, param: id (UUID)
//   #nuevo-producto  → protegida
//
// Cada ruta tiene un <div id="view-{nombre}"> en index.html
// que se muestra/oculta con display block/none.
// ============================================================

(() => {
  // ── Definición de rutas ────────────────────────────────────

  // pattern: string que puede contener segmentos :param
  // viewId:  id del div en el DOM (sin el prefijo "view-")
  // publica: si true, no requiere autenticación
  const ROUTES = [
    { pattern: 'login',          viewId: 'login',         publica: true  },
    { pattern: 'dashboard',      viewId: 'dashboard',     publica: false },
    { pattern: 'inventario',     viewId: 'inventario',    publica: false },
    { pattern: 'escaner',        viewId: 'escaner',       publica: false },
    { pattern: 'bajo-stock',     viewId: 'bajo-stock',    publica: false },
    { pattern: 'ventas',         viewId: 'ventas',        publica: false },
    { pattern: 'metricas',       viewId: 'metricas',      publica: false },
    { pattern: 'config',         viewId: 'config',        publica: false },
    { pattern: 'producto/:id',   viewId: 'detalle',       publica: false },
    { pattern: 'nuevo-producto', viewId: 'crear-producto', publica: false },
  ];

  // ── Estado interno ─────────────────────────────────────────

  let _currentRoute = null;   // nombre del pattern activo
  let _params       = {};     // params extraídos del hash actual
  const _callbacks  = {};     // { [pattern]: [fn, ...] }

  // ── Helpers de parsing ─────────────────────────────────────

  // Extrae el hash sin '#', p.ej. 'producto/abc-123' de '#producto/abc-123'
  function _parseHash() {
    return window.location.hash.replace(/^#\/?/, '') || 'dashboard';
  }

  // Intenta hacer match entre los segmentos del hash y un pattern.
  // Retorna los params extraídos o null si no hay match.
  // Ej: hash='producto/abc', pattern='producto/:id' → { id: 'abc' }
  function _matchPattern(hash, pattern) {
    const hashParts    = hash.split('/');
    const patternParts = pattern.split('/');

    if (hashParts.length !== patternParts.length) return null;

    const params = {};
    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i].startsWith(':')) {
        params[patternParts[i].slice(1)] = decodeURIComponent(hashParts[i]);
      } else if (patternParts[i] !== hashParts[i]) {
        return null;
      }
    }
    return params;
  }

  function _findRoute(hash) {
    for (const route of ROUTES) {
      const params = _matchPattern(hash, route.pattern);
      if (params !== null) return { route, params };
    }
    return null;
  }

  // ── DOM ────────────────────────────────────────────────────

  function _showView(viewId) {
    document.querySelectorAll('[id^="view-"]').forEach(el => {
      el.style.display = 'none';
    });
    const el = document.getElementById(`view-${viewId}`);
    if (el) el.style.display = 'block';
  }

  // ── Navegación principal ───────────────────────────────────

  function _resolve() {
    const hash = _parseHash();
    const match = _findRoute(hash);

    // Ruta desconocida → al dashboard (o login si no autenticado)
    if (!match) {
      navigate(window.Auth?.isAutenticado() ? 'dashboard' : 'login');
      return;
    }

    const { route, params } = match;

    // Guard de autenticación
    if (!route.publica && !window.Auth?.isAutenticado()) {
      navigate('login');
      return;
    }

    // Si ya está autenticado y va a login, redirigir al dashboard
    if (route.pattern === 'login' && window.Auth?.isAutenticado()) {
      navigate('dashboard');
      return;
    }

    _params       = params;
    _currentRoute = route.pattern;

    _showView(route.viewId);
    _fireCallbacks(route.pattern, params, route.viewId);
  }

  function _fireCallbacks(pattern, params, viewId) {
    // Sello en <html data-route="..."> para que el CSS y el shell desktop reaccionen
    document.documentElement.dataset.route = pattern.replace(/[\/:]/g, '-');

    (_callbacks[pattern] || []).forEach(fn => {
      try { fn(params); } catch (e) { console.error(`[Router] Error en callback de '${pattern}':`, e); }
    });

    // Evento global para que el shell desktop (sidebar/topbar) actualice estado
    document.dispatchEvent(new CustomEvent('route:changed', {
      detail: { pattern, params, viewId }
    }));
  }

  // ── API pública ────────────────────────────────────────────

  /**
   * Navega a una ruta. Acepta con o sin '#'.
   * Ejemplos:
   *   navigate('dashboard')
   *   navigate('producto/abc-123')
   *   navigate('#escaner')
   */
  function navigate(ruta) {
    const limpia = ruta.replace(/^#\/?/, '');
    // Mismo hash → forzar _resolve() manualmente (hashchange no dispara)
    if (window.location.hash === `#${limpia}`) {
      _resolve();
    } else {
      window.location.hash = limpia;
    }
  }

  /**
   * Retorna el valor de un param de la ruta actual.
   * Ej: en #producto/abc → getParam('id') === 'abc'
   */
  function getParam(nombre) {
    return _params[nombre] ?? null;
  }

  /**
   * Registra un callback que se ejecuta cuando se activa una ruta.
   * Se puede llamar varias veces para la misma ruta (se acumulan).
   * El callback recibe los params de la ruta: fn({ id, ... })
   *
   * Ejemplos:
   *   Router.onRoute('dashboard',    () => Dashboard.init())
   *   Router.onRoute('producto/:id', ({ id }) => Producto.init(id))
   */
  function onRoute(patron, callback) {
    if (!_callbacks[patron]) _callbacks[patron] = [];
    _callbacks[patron].push(callback);
  }

  // ── Init ───────────────────────────────────────────────────

  // Esperar a que db:ready dispare antes de resolver la primera ruta,
  // para que los módulos de vistas puedan usar window.DB con seguridad.
  let _dbReady = false;
  let _pendingResolve = false;

  document.addEventListener('db:ready', () => {
    _dbReady = true;
    if (_pendingResolve) _resolve();
  });

  window.addEventListener('hashchange', () => {
    if (_dbReady) {
      _resolve();
    } else {
      _pendingResolve = true;
    }
  });

  // Resolución inicial
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (_dbReady) _resolve(); else _pendingResolve = true;
    });
  } else {
    if (_dbReady) _resolve(); else _pendingResolve = true;
  }

  // Botón "atrás" nativo del celular: el evento popstate/hashchange
  // ya está cubierto por el listener de hashchange de arriba.
  // No necesitamos history.pushState manual porque el hash routing
  // usa la API de hash del browser, que ya maneja el historial nativo.

  // Delegación global para [data-view] clicks
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-view]');
    if (!el) return;
    e.preventDefault();
    navigate(el.dataset.view);
  });

  window.Router = Object.freeze({ navigate, getParam, onRoute });
})();
