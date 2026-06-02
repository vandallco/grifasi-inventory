// GRIFASI PERFORMANCE — Configuración
(() => {
  function _toast(msg, tipo = 'success') {
    window.Toast?.show(msg, tipo);
  }

  function _setInput(view, setting, val) {
    const el = view.querySelector(`[data-setting="${setting}"]`);
    if (el && (val ?? '') !== '') el.value = val;
  }

  function _setSegment(view, group, val) {
    if (val == null || val === '') return;
    view.querySelectorAll(`[data-segmented="${group}"] .cfg-seg-btn`).forEach(b => {
      b.classList.toggle('active', String(b.dataset.value) === String(val));
    });
  }

  const TIPS = [
    'Cambiá el PIN periódicamente para mantener segura tu cuenta del mostrador.',
    'Usá el escáner para registrar entradas y salidas sin buscar manualmente.',
    'El dashboard te muestra de un vistazo qué productos necesitan reposición.',
    'Exportá el inventario a CSV desde Configuración para hacer backups.',
    'Configurá el bot de WhatsApp para recibir alertas cuando un producto cruce el mínimo.',
    'El buscador acepta SKU, nombre, marca o categoría — escribí cualquier cosa.',
    'En Ventas, escaneá el código de barras para agregar productos al carrito al instante.',
    'El cooldown de alertas evita que el bot mande mensajes repetidos del mismo producto.',
    'Mantené actualizado el stock mínimo para que las alertas lleguen a tiempo.',
    'La app funciona sin internet — los datos se sincronizan cuando vuelve la conexión.',
    'Usá el auto-lock para que la sesión se cierre sola después de un rato de inactividad.',
    'Revisá las métricas semanalmente para entender qué productos rotan más.',
  ];

  let _tipIndex = 0;
  let _tipInterval = null;

  function _rotateTip() {
    _tipIndex = (_tipIndex + 1) % TIPS.length;
    document.querySelectorAll('.dk-cfg-tip p').forEach(function(el) {
      el.textContent = TIPS[_tipIndex];
    });
  }

  async function init() {
    const view = document.getElementById('view-config');
    if (!view) return;

    // Tip inicial aleatorio
    _tipIndex = Math.floor(Math.random() * TIPS.length);
    document.querySelectorAll('.dk-cfg-tip p').forEach(function(el) {
      el.textContent = TIPS[_tipIndex];
    });

    // Rotar cada 30 segundos
    if (!_tipInterval) {
      _tipInterval = setInterval(_rotateTip, 30_000);
    }

    // Cargar configuración desde Supabase
    const [numero, cooldown, metaActiva, nombreNeg, direccion] = await Promise.all([
      window.DB.obtenerConfig('whatsapp_numero_alerta'),
      window.DB.obtenerConfig('alerta_cooldown_horas'),
      window.DB.obtenerConfig('meta_api_activa'),
      window.DB.obtenerConfig('nombre_negocio'),
      window.DB.obtenerConfig('direccion'),
    ]);

    _setInput(view, 'bot-phone', numero);
    _setInput(view, 'shop-name', nombreNeg);
    _setInput(view, 'address', direccion);
    _setSegment(view, 'cooldown', cooldown);

    // Estado del bot
    const status = view.querySelector('[data-bot-status]');
    if (status) {
      const on = metaActiva === 'true';
      status.className = `cfg-status ${on ? 'cfg-status-on' : 'cfg-status-off'}`;
      status.innerHTML =
        `<span class="cfg-status-dot"></span><span>${on ? 'Activo' : 'Inactivo'}</span>`;
    }

    // Sin backend de sincronización: no mostrar datos ficticios
    view.querySelectorAll('[data-last-sync]').forEach(el => { el.textContent = '—'; });
    view.querySelectorAll('[data-next-sync]').forEach(el => { el.textContent = '—'; });

    // Versión de la app: viene del Service Worker (nombre del cache 'grifasi-vN')
    _renderAppVersion(view);
  }

  // Consulta al SW el nombre del cache actual (= versión) y lo formatea v1.0.N
  async function _renderAppVersion(view) {
    const els = view.querySelectorAll('[data-app-version]');
    if (!els.length) return;

    const cacheName = await _askSwVersion();
    const match = cacheName && cacheName.match(/v(\d+)/);
    const text = match ? `v1.0.${match[1]}` : '—';
    els.forEach(el => { el.textContent = text; });
  }

  function _askSwVersion() {
    return new Promise((resolve) => {
      if (!('serviceWorker' in navigator)) return resolve(null);
      const ctrl = navigator.serviceWorker.controller;
      if (!ctrl) return resolve(null);
      const ch = new MessageChannel();
      const t = setTimeout(() => resolve(null), 1500);
      ch.port1.onmessage = (e) => {
        clearTimeout(t);
        resolve(e.data?.cache ?? null);
      };
      try { ctrl.postMessage({ type: 'GET_VERSION' }, [ch.port2]); }
      catch { clearTimeout(t); resolve(null); }
    });
  }

  async function _persist(clave, valor) {
    try {
      await window.DB.actualizarConfig(clave, valor ?? '');
      _toast('Configuración guardada');
    } catch (err) {
      _toast('Error al guardar: ' + (err.message ?? err), 'error');
    }
  }

  const _SETTING_KEY = {
    'bot-phone': 'whatsapp_numero_alerta',
    'shop-name': 'nombre_negocio',
    'address':   'direccion',
  };

  async function _cambiarPin() {
    const pinActual = window.prompt('PIN actual:');
    if (!pinActual) return;
    const ok = await window.Auth.validatePin(pinActual);
    if (!ok) { _toast('PIN incorrecto', 'error'); return; }

    const nuevoPIN = window.prompt('Nuevo PIN (4 dígitos):');
    if (!nuevoPIN || !/^\d{4}$/.test(nuevoPIN)) {
      _toast('El PIN debe tener exactamente 4 dígitos', 'error');
      return;
    }
    const confirmar = window.prompt('Confirmar nuevo PIN:');
    if (nuevoPIN !== confirmar) { _toast('Los PINs no coinciden', 'error'); return; }

    try {
      await window.DB.actualizarConfig('pin_acceso', nuevoPIN);
      _toast('PIN actualizado');
    } catch (err) {
      _toast(err.message ?? 'Error al cambiar PIN', 'error');
    }
  }

  function _csvCell(v) {
    const s = String(v ?? '');
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  async function _exportCsv() {
    try {
      const productos = await window.DB.obtenerProductos({ soloActivos: false });
      const cols = ['sku', 'nombre', 'marca', 'categoria', 'unidad',
        'stock_actual', 'stock_minimo', 'precio_costo', 'precio_venta'];
      const rows = [cols.join(',')].concat(
        productos.map(p => cols.map(c => _csvCell(p[c])).join(','))
      );
      const blob = new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `inventario-grifasi-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      _toast('Inventario exportado');
    } catch (err) {
      _toast('Error al exportar: ' + (err.message ?? err), 'error');
    }
  }

  // ── Delegación de clicks ───────────────────────────────────
  document.addEventListener('click', e => {
    const view = document.getElementById('view-config');
    if (!view || view.style.display === 'none') return;

    // Controles segmentados (cooldown se persiste; autolock solo visual)
    const seg = e.target.closest('.cfg-seg-btn');
    if (seg && view.contains(seg)) {
      const wrap = seg.closest('[data-segmented]');
      wrap.querySelectorAll('.cfg-seg-btn').forEach(b => b.classList.remove('active'));
      seg.classList.add('active');
      if (wrap.dataset.segmented === 'cooldown') {
        _persist('alerta_cooldown_horas', seg.dataset.value);
      }
      return;
    }

    const actionEl = e.target.closest('[data-setting], [data-action]');
    if (!actionEl || !view.contains(actionEl)) return;

    const setting = actionEl.dataset.setting;
    const action  = actionEl.dataset.action;

    if (setting === 'change-pin')  { _cambiarPin(); return; }
    if (setting === 'export-csv')  { _exportCsv(); return; }
    if (action === 'logout')       { window.Auth.logout(); return; }
  });

  // Guardar inputs de texto al cambiar (no hay botón "guardar")
  document.addEventListener('change', e => {
    const view = document.getElementById('view-config');
    if (!view || view.style.display === 'none') return;
    const el = e.target.closest('[data-setting]');
    if (!el || !view.contains(el)) return;
    const key = _SETTING_KEY[el.dataset.setting];
    if (key) {
      if (!window.Auth.isAutenticado()) { _toast('Sin sesión activa', 'error'); return; }
      _persist(key, el.value.trim());
    }
  });

  Router.onRoute('config', init);

  window.Settings = Object.freeze({ init });
})();
