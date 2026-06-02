// ============================================================
// Toast global
// ============================================================
// Capa fija (position: fixed) montada fuera del flujo scrolleable.
//   • Auto-descarte a los ~2.6s (no se acumulan).
//   • clear() para limpiar manualmente (ej: al abrir el modal de stock).
//   • Nunca quedan al final del documento ni ocupan espacio.
// Reemplaza los _toast sueltos que se agregaban a <body> sin posición.
// ============================================================

(() => {
  const DURATION = 2600;

  function _host() {
    let h = document.getElementById('app-toast-host');
    if (!h) {
      h = document.createElement('div');
      h.id = 'app-toast-host';
      h.className = 'app-toast-host';
      h.setAttribute('aria-live', 'polite');
      h.setAttribute('role', 'status');
      document.body.appendChild(h);
    }
    // Garantizar que siempre sea el último hijo del body (sobre todo lo demás)
    if (document.body.lastElementChild !== h) document.body.appendChild(h);
    return h;
  }

  function show(msg, tipo = 'success') {
    if (!msg) return;
    const host = _host();

    const t = document.createElement('div');
    t.className = `app-toast app-toast-${tipo === 'error' ? 'error' : 'success'}`;
    t.textContent = msg;
    host.appendChild(t);

    requestAnimationFrame(() => t.classList.add('is-in'));

    const kill = () => {
      t.classList.remove('is-in');
      t.classList.add('is-out');
      setTimeout(() => t.remove(), 240);
    };
    setTimeout(kill, DURATION);
  }

  function clear() {
    const h = document.getElementById('app-toast-host');
    if (h) h.innerHTML = '';
  }

  window.Toast = Object.freeze({ show, clear });
})();
