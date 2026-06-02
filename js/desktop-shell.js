// ============================================================
// Desktop Shell
// ============================================================
// Renderiza sidebar + topbar (clases .dk-* de css/desktop.css)
// y mantiene su estado sincronizado con el Router.
// Solo se ve a partir de 1024px (CSS lo oculta en móvil).
// ============================================================

(() => {
  // ── Iconos (paths del prototipo desktop-chrome.jsx) ────────
  const ICONS = {
    home: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7"/><path d="M5 10v9h14v-9"/></svg>',
    inv:  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/></svg>',
    scan: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M21 7V5a2 2 0 0 0-2-2h-2"/><path d="M3 17v2a2 2 0 0 0 2 2h2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 12h10"/></svg>',
    warn: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5L21.5 20.5H2.5z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.5" r="0.5" fill="currentColor"/></svg>',
    cog:  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    cart: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h2l2.4 11.5a2 2 0 0 0 2 1.5h8.2a2 2 0 0 0 2-1.5L21 9H6"/><circle cx="9.5" cy="21" r="1"/><circle cx="17.5" cy="21" r="1"/></svg>',
    chart:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20h18"/><path d="M6 16V9"/><path d="M11 16V5"/><path d="M16 16v-8"/><path d="M21 16v-4"/></svg>',
    chevLeft: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3L5 8l5 5"/></svg>',
    logout: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"><path d="M14 17l5-5-5-5"/><path d="M19 12H9"/><path d="M11 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5"/></svg>',
  };

  // ── Mapa de metadata por ruta ───────────────────────────────
  const ROUTE_META = {
    dashboard: {
      active: 'dashboard', eyebrow: '', title: 'Buen día', sub: 'Resumen del inventario',
      actionsHtml: '<button class="dk-btn dk-btn-primary" type="button" data-view="escaner">Escanear</button>',
    },
    inventario: {
      active: 'inventario', eyebrow: 'Inventario', title: 'Productos', sub: 'Catálogo completo',
      actionsHtml: '<button class="dk-btn dk-btn-primary" type="button" data-view="nuevo-producto">+ Nuevo producto</button>',
    },
    escaner: {
      active: 'escaner', eyebrow: 'Escáner', title: 'Lector de código', sub: 'Acercá el código al cuadro',
      actionsHtml: '',
    },
    'bajo-stock': {
      active: 'bajo-stock', eyebrow: 'Alerta', title: 'Bajo stock', sub: 'Productos por debajo del mínimo',
      actionsHtml: '',
    },
    ventas: {
      active: 'ventas', eyebrow: 'Operación', title: 'Ventas', sub: 'Caja rápida',
      actionsHtml: '',
    },
    metricas: {
      active: 'metricas', eyebrow: 'Análisis', title: 'Métricas', sub: 'Resumen del período',
      actionsHtml: '',
    },
    config: {
      active: 'config', eyebrow: 'Sistema', title: 'Configuración', sub: 'Preferencias y datos del negocio',
      actionsHtml: '',
    },
    'producto/:id': {
      active: 'inventario', eyebrow: 'Producto', title: '—', sub: '', back: 'inventario',
      actionsHtml: '',
    },
    'nuevo-producto': {
      active: 'inventario', eyebrow: 'Inventario', title: 'Nuevo producto', sub: '', back: 'inventario',
      actionsHtml: '',
    },
    login: null,
  };

  // ── Render del sidebar ──────────────────────────────────────
  function _renderSidebar() {
    const el = document.querySelector('[data-dk-sidebar]');
    if (!el) return;
    el.innerHTML = `
      <div class="dk-sb-brand">
        <div class="brand-mark-lg" aria-hidden="true"><span></span><span></span><span></span></div>
        <div class="dk-sb-brand-text">
          <div class="dk-sb-brand-name">INVENTARIO</div>
          <div class="dk-sb-brand-sub">PERFORMANCE</div>
        </div>
      </div>

      <div class="dk-sb-eyebrow">Inventario</div>
      <nav class="dk-sb-nav" aria-label="Navegación principal">
        <a class="dk-nav-item" data-view="dashboard"  data-nav="dashboard">
          <span class="dk-nav-icon">${ICONS.home}</span><span class="dk-nav-label">Inicio</span>
        </a>
        <a class="dk-nav-item" data-view="ventas"     data-nav="ventas">
          <span class="dk-nav-icon">${ICONS.cart}</span><span class="dk-nav-label">Ventas</span>
        </a>
        <a class="dk-nav-item" data-view="metricas"   data-nav="metricas">
          <span class="dk-nav-icon">${ICONS.chart}</span><span class="dk-nav-label">Métricas</span>
        </a>
        <a class="dk-nav-item" data-view="inventario" data-nav="inventario">
          <span class="dk-nav-icon">${ICONS.inv}</span><span class="dk-nav-label">Inventario</span>
        </a>
        <a class="dk-nav-item" data-view="escaner"    data-nav="escaner">
          <span class="dk-nav-icon">${ICONS.scan}</span><span class="dk-nav-label">Escáner</span>
        </a>
        <a class="dk-nav-item" data-view="bajo-stock" data-nav="bajo-stock">
          <span class="dk-nav-icon">${ICONS.warn}</span><span class="dk-nav-label">Bajo stock</span>
          <span class="dk-nav-badge" data-dk-low-badge hidden>0</span>
        </a>
        <a class="dk-nav-item" data-view="config"     data-nav="config">
          <span class="dk-nav-icon">${ICONS.cog}</span><span class="dk-nav-label">Configuración</span>
        </a>
      </nav>

      <div class="dk-sb-spacer"></div>

      <div class="dk-sb-foot">
        <div class="dk-sb-user">
          <div class="dk-sb-avatar">GP</div>
          <div class="dk-sb-user-info">
            <div class="dk-sb-user-name">GRIFASI PERFORMANCE</div>
            <div class="dk-sb-user-role">Mostrador</div>
          </div>
        </div>
        <button class="dk-btn dk-btn-ghost" type="button" data-dk-logout>
          ${ICONS.logout}<span>Cerrar sesión</span>
        </button>
        <div class="dk-sb-version mono">v2.4</div>
      </div>
    `;
  }

  // ── Render del topbar (template; los slots se llenan por ruta) ─
  function _renderTopbar() {
    const el = document.querySelector('[data-dk-topbar]');
    if (!el) return;
    el.innerHTML = `
      <div class="dk-tb-left">
        <a class="dk-tb-back" data-tb-back hidden>${ICONS.chevLeft}<span>Volver</span></a>
        <div class="dk-tb-title-block">
          <div class="dk-tb-eyebrow" data-tb-eyebrow></div>
          <h1 class="dk-tb-title" data-tb-title></h1>
          <p class="dk-tb-sub" data-tb-sub></p>
        </div>
      </div>
      <div class="dk-tb-actions" data-tb-actions></div>
    `;
  }

  // ── Listener de cambio de ruta ──────────────────────────────
  function _onRouteChanged(detail) {
    const meta = ROUTE_META[detail.pattern] || null;

    // Sidebar: marcar item activo
    document.querySelectorAll('.dk-nav-item').forEach(n => {
      n.classList.toggle('active', meta && n.dataset.nav === meta.active);
    });

    if (!meta) return; // ej. login: el shell está oculto vía CSS

    // Topbar: actualizar slots
    const setText = (sel, txt) => {
      const e = document.querySelector(sel);
      if (e) { e.textContent = txt ?? ''; e.hidden = !txt; }
    };
    setText('[data-tb-eyebrow]', meta.eyebrow);
    setText('[data-tb-title]',   meta.title);
    setText('[data-tb-sub]',     meta.sub);

    const actions = document.querySelector('[data-tb-actions]');
    if (actions) actions.innerHTML = meta.actionsHtml || '';

    const back = document.querySelector('[data-tb-back]');
    if (back) {
      if (meta.back) { back.hidden = false; back.dataset.view = meta.back; }
      else { back.hidden = true; back.removeAttribute('data-view'); }
    }
  }

  // ── Init ────────────────────────────────────────────────────
  function _init() {
    _renderSidebar();
    _renderTopbar();

    document.addEventListener('route:changed', e => _onRouteChanged(e.detail));

    // Logout
    document.addEventListener('click', e => {
      const btn = e.target.closest('[data-dk-logout]');
      if (btn) {
        e.preventDefault();
        if (window.Auth?.logout) window.Auth.logout();
      }
    });

    // Si el router ya resolvió antes de que cargáramos, sincronizamos
    if (document.documentElement.dataset.route) {
      _onRouteChanged({
        pattern: document.documentElement.dataset.route.replace(/-/g, '/'),
        params: {}, viewId: null,
      });
    }
  }

  // ── API pública ─────────────────────────────────────────────
  function setTitle(text) {
    const el = document.querySelector('[data-tb-title]');
    if (el) el.textContent = text ?? '—';
  }
  function setLowCount(n) {
    const el = document.querySelector('[data-dk-low-badge]');
    if (!el) return;
    if (n > 0) { el.textContent = n; el.hidden = false; }
    else { el.hidden = true; }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }

  window.DesktopShell = Object.freeze({ setTitle, setLowCount });
})();
