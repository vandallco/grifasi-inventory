// Modal de movimientos de stock (overlay full-screen)
// Maneja #view-scan-modal: entrada/salida, cantidad (stepper + numpad),
// validación y registro vía DB.registrarMovimiento (RPC atómica).
(() => {
  // ── Estado interno ─────────────────────────────────────────
  let _producto = null;
  let _tipo = 'entrada';       // 'entrada' | 'salida'  (interno → DB)
  let _cantidad = 1;
  let _numpadBuf = '';

  // ── Helpers ────────────────────────────────────────────────
  function _toast(msg, tipo = 'success') {
    window.Toast?.show(msg, tipo);
  }

  function _modal() { return document.getElementById('view-scan-modal'); }
  function _q(sel) { const m = _modal(); return m ? m.querySelector(sel) : null; }
  function _qa(sel) { const m = _modal(); return m ? [...m.querySelectorAll(sel)] : []; }

  function _severidad(stock, minimo) {
    if (stock <= 0) return 'crit';
    if (stock <= (minimo ?? 0)) return 'warn';
    return 'ok';
  }

  function _unidad() {
    return (_producto && _producto.unidad) ? _producto.unidad : 'unidades';
  }

  // ── Render de toda la UI según el estado actual ────────────
  function _render() {
    if (!_producto) return;
    const stock  = Number(_producto.stock_actual) || 0;
    const result = _tipo === 'entrada' ? stock + _cantidad : stock - _cantidad;
    const invalid = _tipo === 'salida' && _cantidad > stock;

    // Stepper
    const qtyEl = _q('[data-qty-current]');
    if (qtyEl) qtyEl.textContent = _cantidad;
    _qa('[data-qty-unit]').forEach(el => el.textContent = _unidad());

    // Preview "resultará en X"
    const resEl = _q('[data-qty-result]');
    if (resEl) {
      resEl.textContent = result;
      resEl.classList.toggle('invalid', invalid);
    }
    _qa('[data-qty-result-unit]').forEach(el => el.textContent = _unidad());

    // Toggle entrada/salida
    _qa('[data-movement]').forEach(el => {
      if (el.classList.contains('sc-tg')) {
        const isThis = (el.dataset.movement === 'in' && _tipo === 'entrada') ||
                       (el.dataset.movement === 'out' && _tipo === 'salida');
        el.classList.toggle('active', isThis);
        el.setAttribute('aria-selected', isThis ? 'true' : 'false');
      }
    });
    const root = _q('.sc-root');
    if (root) root.dataset.movement = _tipo === 'entrada' ? 'in' : 'out';

    // Botón confirmar
    const confirmBtn = _q('[data-action="confirm-move"]');
    if (confirmBtn) {
      confirmBtn.classList.toggle('sc-confirm-in', _tipo === 'entrada');
      confirmBtn.classList.toggle('sc-confirm-out', _tipo === 'salida');
      confirmBtn.disabled = invalid || _cantidad < 1;
      const verb = _q('[data-confirm-verb]');
      if (verb) verb.textContent = _tipo;
      const cq = _q('[data-confirm-qty]');
      if (cq) cq.textContent = _cantidad;
    }
  }

  // ── Abrir / cerrar ─────────────────────────────────────────
  function openModal(producto, tipoInicial = 'entrada') {
    const m = _modal();
    if (!m || !producto) return;

    _producto = producto;
    _tipo = tipoInicial === 'salida' ? 'salida' : 'entrada';
    _cantidad = 1;
    _numpadBuf = '';

    // Datos del producto
    _qa('[data-product-sku]').forEach(el => el.textContent = producto.sku ?? '—');
    _qa('[data-product-name]').forEach(el => el.textContent = producto.nombre ?? '—');
    _qa('[data-product-brand]').forEach(el => el.textContent = producto.marca ?? '—');
    _qa('[data-stock-current]').forEach(el => el.textContent = Number(producto.stock_actual) || 0);
    _qa('[data-stock-unit]').forEach(el => el.textContent = _unidad());
    _qa('[data-stock-min]').forEach(el => el.textContent = producto.stock_minimo ?? '—');

    // Chip de severidad de stock
    const sev = _severidad(Number(producto.stock_actual) || 0, producto.stock_minimo);
    _qa('[data-stock-chip]').forEach(el => {
      el.classList.remove('sc-stock-ok', 'sc-stock-warn', 'sc-stock-crit');
      el.classList.add(`sc-stock-${sev}`);
    });

    // Limpiar motivo
    const reason = _q('[data-field="reason"]');
    if (reason) reason.value = '';

    // Cerrar numpad y limpiar cualquier toast/aviso previo (BUG: el cartel
    // de éxito no debe reaparecer al volver a abrir Agregar/Retirar).
    _closeNumpad();
    const toastWrap = _q('[data-toast]');
    if (toastWrap) toastWrap.hidden = true;
    window.Toast?.clear();

    _render();

    m.style.display = 'block';
    m.classList.add('visible');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    const m = _modal();
    if (!m) return;
    m.classList.remove('visible');
    m.style.display = 'none';
    document.body.style.overflow = '';
    _producto = null;
    document.dispatchEvent(new CustomEvent('modal:closed'));
  }

  // ── Numpad ─────────────────────────────────────────────────
  function _openNumpad() {
    _numpadBuf = String(_cantidad);
    const bd = _q('.np-backdrop');
    const sheet = _q('.np-sheet');
    if (bd) bd.hidden = false;
    if (sheet) sheet.hidden = false;
    _renderNumpad();
  }
  function _closeNumpad() {
    const bd = _q('.np-backdrop');
    const sheet = _q('.np-sheet');
    if (bd) bd.hidden = true;
    if (sheet) sheet.hidden = true;
  }
  function _renderNumpad() {
    const disp = _q('[data-numpad-display]');
    if (disp) disp.textContent = _numpadBuf === '' ? '0' : _numpadBuf;
  }
  function _numpadKey(key) {
    if (key === 'clear') { _numpadBuf = ''; }
    else if (key === 'back') { _numpadBuf = _numpadBuf.slice(0, -1); }
    else if (/^\d$/.test(key)) {
      if (_numpadBuf === '0') _numpadBuf = '';
      if (_numpadBuf.length < 5) _numpadBuf += key;
    }
    _renderNumpad();
  }
  function _acceptNumpad() {
    let n = parseInt(_numpadBuf, 10);
    if (!Number.isFinite(n) || n < 1) n = 1;
    _cantidad = n;
    _closeNumpad();
    _render();
  }

  // ── Confirmar movimiento ───────────────────────────────────
  async function _confirm() {
    if (!_producto) return;
    const stock = Number(_producto.stock_actual) || 0;

    if (!Number.isInteger(_cantidad) || _cantidad < 1) {
      _toast('Ingresá una cantidad mayor a 0', 'error');
      return;
    }
    if (_tipo === 'salida' && _cantidad > stock) {
      _toast(`No podés retirar más de ${stock} ${_unidad()}`, 'error');
      return;
    }

    const confirmBtn = _q('[data-action="confirm-move"]');
    if (confirmBtn) confirmBtn.disabled = true;

    try {
      const res = await window.DB.registrarMovimiento({
        producto_id: _producto.id,
        tipo: _tipo,
        cantidad: _cantidad,
        motivo: (_q('[data-field="reason"]')?.value || '').trim() || null,
      });

      const nuevoStock = (res && (res.stock_nuevo ?? res.stock_despues)) ??
        (_tipo === 'entrada' ? stock + _cantidad : stock - _cantidad);

      const skuActualizado = _producto.sku;
      _producto.stock_actual = nuevoStock;

      // Feedback vía toast global (capa fija, auto-descarte). NO usamos el
      // toast in-modal para que el cartel no quede pegado ni reaparezca.
      const titulo = _tipo === 'entrada' ? 'Entrada registrada' : 'Salida registrada';
      window.Toast?.show(`${titulo} · stock: ${nuevoStock} ${_unidad()}`, 'success');

      // Cerrar el modal primero (limpia su estado), luego refrescar pantallas.
      closeModal();
      _refreshScreens(skuActualizado);
    } catch (err) {
      if (confirmBtn) confirmBtn.disabled = false;
      _toast(err?.message ?? 'Error al registrar el movimiento', 'error');
    }
  }

  function _refreshScreens(sku) {
    // Detalle: re-render con stock e historial nuevos
    const detView = document.getElementById('view-detalle');
    if (detView && detView.style.display !== 'none' && sku) {
      window.Products?.initDetalle?.(sku);
    }
    // Inventario: refrescar lista
    const invView = document.getElementById('view-inventario');
    if (invView && invView.style.display !== 'none') {
      window.Products?.initInventario?.();
    }
    document.dispatchEvent(new CustomEvent('inventario:updated', { bubbles: true }));
  }

  // ── Delegación de eventos del modal ────────────────────────
  document.addEventListener('click', e => {
    const m = _modal();
    if (!m || m.style.display === 'none' || !m.contains(e.target)) return;

    // Toggle entrada/salida
    const tg = e.target.closest('[data-movement]');
    if (tg && tg.classList.contains('sc-tg')) {
      _tipo = tg.dataset.movement === 'out' ? 'salida' : 'entrada';
      _render();
      return;
    }

    const actEl = e.target.closest('[data-action]');
    if (!actEl) return;
    const act = actEl.dataset.action;

    switch (act) {
      case 'qty-plus':       _cantidad++; _render(); break;
      case 'qty-minus':      if (_cantidad > 1) { _cantidad--; _render(); } break;
      case 'qty-open-numpad': _openNumpad(); break;
      case 'close-numpad':   _closeNumpad(); break;
      case 'accept-numpad':  _acceptNumpad(); break;
      case 'confirm-move':   _confirm(); break;
      case 'cancel-move':
      case 'close-modal':    closeModal(); break;
      default:
        if (/^\d$/.test(act)) { /* no-op */ }
    }
  });

  // Teclas del numpad (data-np-key)
  document.addEventListener('click', e => {
    const m = _modal();
    if (!m || m.style.display === 'none' || !m.contains(e.target)) return;
    const key = e.target.closest('[data-np-key]');
    if (key) _numpadKey(key.dataset.npKey);
  });

  // ── Escanear encontró producto → abrir en modo entrada ─────
  document.addEventListener('scanner:found', e => {
    const { producto } = e.detail ?? {};
    if (producto) openModal(producto, 'entrada');
  });

  // ── API pública ────────────────────────────────────────────
  window.Movements = Object.freeze({ openModal, closeModal });
})();
