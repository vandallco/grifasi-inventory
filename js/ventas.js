// ventas.js — POS / caja rápida (Grifasi Performance)
// =====================================================
// Integrado a la SPA: usa window.DB (Supabase) y window.Router.
//   - Productos:  window.DB.obtenerProductos()
//   - Stock:      window.DB.registrarMovimiento({ producto_id, tipo:'salida', ... })
//   - Venta:      window.DB.registrarVenta({ ticket, total, items })  → tabla `ventas`
//   - Historial:  window.DB.obtenerVentas()
//   - Toasts:     window.Toast.show(...)
// Se inicializa por ruta: Router.onRoute('ventas', init).

const MAX_HISTORY = 30;

// ──────────────────────────────────────────────────────────────
// Estado
// ──────────────────────────────────────────────────────────────
const state = {
  query: '',
  cart: [],          // [{ sku, name, price, qty, stock }]
  recent: [],        // ventas desde Supabase
  activeTab: 'caja', // 'caja' | 'historial'
};

let _bound = false;

// Mapea el producto de la DB (campos en español) al shape del POS
function adaptProduct(p) {
  return {
    id:    p.id,
    sku:   p.sku,
    name:  p.nombre,
    price: Number(p.precio_venta) || 0,
    cost:  Number(p.precio_costo) || 0,
    stock: Number(p.stock_actual) || 0,
    min:   Number(p.stock_minimo) || 0,
  };
}
function adaptSale(v) {
  return {
    ticket: v.ticket || ('#' + String(v.id || '').slice(0, 6)),
    ts: v.created_at ? new Date(v.created_at).getTime() : Date.now(),
    items: Array.isArray(v.items) ? v.items : [],
    total: Number(v.total) || 0,
  };
}

function _getProductBySku(sku) {
  return state.products?.find(p => p.sku === sku) || null;
}
state.products = [];

// ──────────────────────────────────────────────────────────────
// Carga de datos (Supabase)
// ──────────────────────────────────────────────────────────────
async function loadProducts() {
  if (!window.DB?.obtenerProductos) { state.products = []; return; }
  try {
    const rows = await window.DB.obtenerProductos();
    state.products = (rows || []).map(adaptProduct);
  } catch (e) {
    console.error('[ventas] error al cargar productos:', e);
    state.products = [];
  }
}
async function loadHistory() {
  if (!window.DB?.obtenerVentas) { state.recent = []; return; }
  try {
    const rows = await window.DB.obtenerVentas(MAX_HISTORY);
    state.recent = (rows || []).map(adaptSale);
  } catch (e) {
    console.error('[ventas] error al cargar historial:', e);
    state.recent = [];
  }
}

// ──────────────────────────────────────────────────────────────
// Utilidades
// ──────────────────────────────────────────────────────────────
function fmtMoney(n) {
  return '$ ' + (n || 0).toLocaleString('es-AR');
}
function fmtTime(ts) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}
function fmtDateShort(ts) {
  const d = new Date(ts);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const yest = new Date(today); yest.setDate(today.getDate() - 1);
  const isYest = d.toDateString() === yest.toDateString();
  if (isToday) return 'Hoy';
  if (isYest)  return 'Ayer';
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }).toUpperCase();
}
function stockSeverity(p) {
  // crit: sin stock o ≤ 20% del mínimo · warn: entre 20% del mín y el mín · ok: arriba del mín
  if (!p) return 'crit';
  const min = p.min || 0;
  if (p.stock <= 0) return 'crit';
  if (min > 0 && p.stock <= Math.ceil(min * 0.2)) return 'crit';
  if (p.stock <= min) return 'warn';
  return 'ok';
}
function normalize(s) {
  return (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// ──────────────────────────────────────────────────────────────
// SVG icon helpers
// ──────────────────────────────────────────────────────────────
const ICO = {
  close: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l10 10M13 3L3 13"/></svg>`,
  plus: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>`,
  cart: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h2l2.4 11.5a2 2 0 0 0 2 1.5h8.2a2 2 0 0 0 2-1.5L21 9H6"/><circle cx="9.5" cy="21" r="1"/><circle cx="17.5" cy="21" r="1"/></svg>`,
  chev:  `<svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4l5 5-5 5"/></svg>`,
  minus: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/></svg>`,
};

// ──────────────────────────────────────────────────────────────
// Toasts → sistema global window.Toast
// ──────────────────────────────────────────────────────────────
function showToast({ tone = 'info', title, sub }) {
  const msg = title + (sub ? ` · ${sub}` : '');
  const type = (tone === 'crit' || tone === 'warn') ? 'error' : 'success';
  if (window.Toast?.show) window.Toast.show(msg, type);
}

// ──────────────────────────────────────────────────────────────
// Carrito
// ──────────────────────────────────────────────────────────────
function addToCart(sku) {
  const p = _getProductBySku(sku);
  if (!p) { showToast({ tone: 'crit', title: 'Producto no encontrado', sub: sku }); return; }
  if (p.stock <= 0) { showToast({ tone: 'crit', title: 'Sin stock', sub: p.name }); return; }
  const existing = state.cart.find(it => it.sku === sku);
  if (existing) {
    if (existing.qty + 1 > p.stock) {
      showToast({ tone: 'warn', title: 'Stock insuficiente', sub: `Solo quedan ${p.stock} de "${p.name}"` });
      return;
    }
    existing.qty += 1;
  } else {
    state.cart.push({ sku: p.sku, name: p.name, price: p.price, qty: 1, stock: p.stock });
  }
  showToast({ tone: 'info', title: 'Agregado', sub: p.name });
  renderCart();
  renderBottomBar();
}
function changeQty(sku, delta) {
  const item = state.cart.find(it => it.sku === sku);
  if (!item) return;
  const next = item.qty + delta;
  if (next <= 0) return removeFromCart(sku);
  const p = _getProductBySku(sku);
  if (p && next > p.stock) {
    showToast({ tone: 'warn', title: 'Stock insuficiente', sub: `Máximo: ${p.stock}` });
    return;
  }
  item.qty = next;
  renderCart();
  renderBottomBar();
}
function removeFromCart(sku) {
  state.cart = state.cart.filter(it => it.sku !== sku);
  renderCart();
  renderBottomBar();
}
function clearCart() {
  state.cart = [];
  renderCart();
  renderBottomBar();
}
function cartSubtotal() {
  return state.cart.reduce((s, it) => s + it.price * it.qty, 0);
}
function cartItemCount() {
  return state.cart.reduce((s, it) => s + it.qty, 0);
}

// ──────────────────────────────────────────────────────────────
// Checkout — descuenta stock (movimientos) + registra venta (Supabase)
// ──────────────────────────────────────────────────────────────
function generateTicket() {
  return '#' + String(Date.now()).slice(-6);
}

async function checkout() {
  if (!state.cart.length) return;
  if (!window.DB?.registrarMovimiento) {
    showToast({ tone: 'crit', title: 'Sin conexión a datos', sub: 'Probá recargar' });
    return;
  }

  const buttons = document.querySelectorAll('[data-action="checkout"]');
  buttons.forEach(b => b.disabled = true);

  try {
    const ticket = generateTicket();
    const total = cartSubtotal();
    const items = state.cart.map(it => ({
      sku: it.sku, name: it.name, price: it.price, qty: it.qty, subtotal: it.price * it.qty,
    }));

    // 1) Descontar stock: una salida por ítem (RPC atómica existente)
    for (const it of state.cart) {
      const p = _getProductBySku(it.sku);
      if (!p) continue;
      await window.DB.registrarMovimiento({
        producto_id: p.id,
        tipo: 'salida',
        cantidad: it.qty,
        motivo: `Venta ${ticket}`,
      });
    }

    // 2) Registrar la venta (ticket + detalle) en Supabase
    if (window.DB.registrarVenta) {
      await window.DB.registrarVenta({ ticket, total, items });
    }

    showToast({ tone: 'ok', title: 'Venta registrada', sub: `${ticket} · ${fmtMoney(total)}` });

    // 3) Limpiar carrito y refrescar stock + historial
    state.cart = [];
    closeSheet();
    await Promise.all([loadProducts(), loadHistory()]);
    renderProducts();
    renderCart();
    renderBottomBar();
    renderHistory();
    document.dispatchEvent(new CustomEvent('inventario:updated', { bubbles: true }));
  } catch (e) {
    console.error('[ventas] checkout error', e);
    showToast({ tone: 'crit', title: 'Error al registrar', sub: e?.message || 'Probá de nuevo' });
  } finally {
    document.querySelectorAll('[data-action="checkout"]').forEach(b => b.disabled = !state.cart.length);
  }
}

// ──────────────────────────────────────────────────────────────
// Render
// ──────────────────────────────────────────────────────────────
function renderProducts() {
  const grid = document.querySelector('#view-ventas [data-product-grid]');
  if (!grid) return;
  const all = state.products || [];
  const q = normalize(state.query);
  const filtered = q
    ? all.filter(p => normalize(p.name).includes(q) || normalize(p.sku).includes(q))
    : all;

  if (!filtered.length) {
    grid.innerHTML = `
      <div class="vt-grid-empty" style="grid-column: 1 / -1;">
        <div class="vt-grid-empty-title">${all.length ? 'Sin resultados' : 'Sin productos'}</div>
        <div class="vt-grid-empty-sub">${all.length ? 'Probá con otro término o escaneá el código.' : 'Cargá productos en Inventario.'}</div>
      </div>`;
    return;
  }

  grid.innerHTML = filtered.map(p => {
    const sev = stockSeverity(p);
    const noStock = p.stock <= 0;
    return `
      <button class="vt-prod" type="button" data-action="add" data-sku="${escapeHtml(p.sku)}" data-no-stock="${noStock}">
        <div class="vt-prod-head">
          <div class="vt-prod-name">${escapeHtml(p.name)}</div>
          <span class="vt-prod-stock vt-prod-stock-${sev}">${noStock ? 'SIN' : p.stock}</span>
        </div>
        <div class="vt-prod-sku">${escapeHtml(p.sku)}</div>
        <div class="vt-prod-foot">
          <span class="vt-prod-price">${fmtMoney(p.price)}</span>
          <span class="vt-prod-add">${ICO.plus}</span>
        </div>
      </button>`;
  }).join('');
}

function renderCart() {
  const lists = document.querySelectorAll('#view-ventas [data-cart-list]');
  const counts = document.querySelectorAll('#view-ventas [data-cart-count]');
  const subVal = document.querySelectorAll('#view-ventas [data-cart-subtotal]');
  const totalVal = document.querySelectorAll('#view-ventas [data-cart-total]');
  const clearBtns = document.querySelectorAll('#view-ventas [data-action="clear"]');
  const checkoutBtns = document.querySelectorAll('#view-ventas [data-action="checkout"]');
  const count = cartItemCount();
  const total = cartSubtotal();

  counts.forEach(el => el.textContent = count);
  subVal.forEach(el => el.textContent = fmtMoney(total));
  totalVal.forEach(el => el.textContent = fmtMoney(total));
  clearBtns.forEach(b => b.disabled = !state.cart.length);
  checkoutBtns.forEach(b => b.disabled = !state.cart.length);

  const itemsHtml = !state.cart.length
    ? `
      <div class="vt-cart-empty">
        <div class="vt-cart-empty-icon">${ICO.cart}</div>
        <div class="vt-cart-empty-title">Carrito vacío</div>
        <div class="vt-cart-empty-sub">Buscá o tocá productos para agregarlos.</div>
      </div>`
    : state.cart.map(it => `
      <li class="vt-cart-item" data-sku="${escapeHtml(it.sku)}">
        <div class="vt-cart-item-info">
          <div class="vt-cart-item-name">${escapeHtml(it.name)}</div>
          <div class="vt-cart-item-meta">
            <span>${escapeHtml(it.sku)}</span>
            <span class="dot-sep">·</span>
            <span class="vt-cart-item-unit">${fmtMoney(it.price)} c/u</span>
          </div>
        </div>
        <button class="vt-cart-item-remove" type="button" data-action="remove" data-sku="${escapeHtml(it.sku)}" aria-label="Quitar">
          ${ICO.close}
        </button>
        <div class="vt-cart-item-bottom">
          <div class="vt-cart-item-qty">
            <button class="vt-cart-qty-btn" type="button" data-action="qty-down" data-sku="${escapeHtml(it.sku)}" aria-label="Restar">${ICO.minus}</button>
            <span class="vt-cart-qty-val">${it.qty}</span>
            <button class="vt-cart-qty-btn" type="button" data-action="qty-up" data-sku="${escapeHtml(it.sku)}" aria-label="Sumar">${ICO.plus}</button>
          </div>
          <div class="vt-cart-item-subtotal">${fmtMoney(it.price * it.qty)}</div>
        </div>
      </li>`).join('');
  lists.forEach(list => list.innerHTML = itemsHtml);
}

function renderBottomBar() {
  const bar = document.querySelector('#view-ventas [data-bottom-bar]');
  if (!bar) return;
  const count = cartItemCount();
  bar.style.display = count > 0 ? 'flex' : 'none';
  const c = bar.querySelector('[data-bb-count]');
  const t = bar.querySelector('[data-bb-total]');
  if (c) c.textContent = count + (count === 1 ? ' item' : ' items');
  if (t) t.textContent = fmtMoney(cartSubtotal());
}

function renderHistory() {
  const list = document.querySelector('#view-ventas [data-history-list]');
  const sub = document.querySelector('#view-ventas [data-history-sub]');
  const tabBtn = document.querySelector('#view-ventas [data-tab="historial"] .vt-tab-btn-count');
  if (tabBtn) tabBtn.textContent = state.recent.length;
  if (sub) {
    sub.textContent = state.recent.length
      ? `${state.recent.length} venta${state.recent.length === 1 ? '' : 's'} registrada${state.recent.length === 1 ? '' : 's'}`
      : 'Sin ventas registradas todavía';
  }
  if (!list) return;
  if (!state.recent.length) {
    list.innerHTML = `
      <div class="vt-history-empty">
        <div class="vt-history-empty-title">Sin ventas todavía</div>
        <div>Cuando confirmés una venta, aparecerá acá.</div>
      </div>`;
    return;
  }
  list.innerHTML = state.recent.map(s => {
    const items = s.items.reduce((n, it) => n + (it.qty || 0), 0);
    return `
      <button class="vt-history-row" type="button" data-action="open-detail" data-ticket="${escapeHtml(s.ticket)}">
        <span class="vt-history-ticket">${escapeHtml(s.ticket)}</span>
        <div class="vt-history-info">
          <div class="vt-history-time">${fmtDateShort(s.ts)} · ${fmtTime(s.ts)}</div>
          <div class="vt-history-items">${items} producto${items === 1 ? '' : 's'}</div>
        </div>
        <span class="vt-history-total">${fmtMoney(s.total)}</span>
        <span class="vt-history-chev">${ICO.chev}</span>
      </button>`;
  }).join('');
}

function openDetail(ticket) {
  const sale = state.recent.find(s => s.ticket === ticket);
  if (!sale) return;
  const modal = document.querySelector('#view-ventas [data-modal="sale-detail"]');
  if (!modal) return;
  modal.querySelector('[data-detail-title]').textContent = `Venta ${sale.ticket}`;
  modal.querySelector('[data-detail-sub]').textContent = `${fmtDateShort(sale.ts)} · ${fmtTime(sale.ts)}`;
  modal.querySelector('[data-detail-items]').innerHTML = sale.items.map(it => `
    <li class="vt-detail-item">
      <span class="vt-detail-item-qty mono">${it.qty}×</span>
      <div>
        <div class="vt-detail-item-name">${escapeHtml(it.name)}</div>
        <div class="vt-detail-item-sku mono">${escapeHtml(it.sku)} · ${fmtMoney(it.price)} c/u</div>
      </div>
      <span class="vt-detail-item-subtotal mono">${fmtMoney(it.subtotal)}</span>
    </li>`).join('');
  modal.querySelector('[data-detail-total]').textContent = fmtMoney(sale.total);
  modal.dataset.open = 'true';
}
function closeDetail() {
  const modal = document.querySelector('#view-ventas [data-modal="sale-detail"]');
  if (modal) modal.dataset.open = 'false';
}

// ──────────────────────────────────────────────────────────────
// Tabs / Sheet mobile
// ──────────────────────────────────────────────────────────────
function setTab(tab) {
  state.activeTab = tab;
  const view = document.getElementById('view-ventas');
  if (!view) return;
  view.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  view.querySelectorAll('[data-tab-panel]').forEach(p => p.classList.toggle('active', p.dataset.tabPanel === tab));
}
function openSheet()  { document.querySelector('#view-ventas .vt-pos')?.setAttribute('data-cart-open', 'true'); }
function closeSheet() { document.querySelector('#view-ventas .vt-pos')?.setAttribute('data-cart-open', 'false'); }

function triggerScan() {
  // Integración mínima: abrir la pantalla de escáner existente.
  window.Router?.navigate('escaner');
}

// ──────────────────────────────────────────────────────────────
// Bind events (una sola vez)
// ──────────────────────────────────────────────────────────────
function _inVentas(el) {
  const view = document.getElementById('view-ventas');
  return view && view.contains(el) && view.style.display !== 'none';
}

function bindEvents() {
  // Buscador (input directo, scoping por #view-ventas)
  document.addEventListener('input', (e) => {
    const input = e.target.closest('[data-action="search"]');
    if (!input || !_inVentas(input)) return;
    state.query = input.value;
    renderProducts();
    const clear = document.querySelector('#view-ventas [data-action="clear-search"]');
    if (clear) clear.hidden = !state.query;
  });

  // Acciones (delegado, scoping por #view-ventas)
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-action]');
    if (!t || !_inVentas(t)) return;
    const action = t.dataset.action;
    const sku = t.dataset.sku;
    switch (action) {
      case 'add':         if (sku) addToCart(sku); break;
      case 'qty-up':      if (sku) changeQty(sku, +1); break;
      case 'qty-down':    if (sku) changeQty(sku, -1); break;
      case 'remove':      if (sku) removeFromCart(sku); break;
      case 'clear':       clearCart(); break;
      case 'checkout':    checkout(); break;
      case 'open-cart':   openSheet(); break;
      case 'close-cart':  closeSheet(); break;
      case 'scan':        triggerScan(); break;
      case 'open-detail': openDetail(t.dataset.ticket); break;
      case 'close-detail':closeDetail(); break;
      case 'clear-search':
        state.query = '';
        { const i = document.querySelector('#view-ventas [data-action="search"]'); if (i) { i.value = ''; i.focus(); } }
        renderProducts();
        { const c = document.querySelector('#view-ventas [data-action="clear-search"]'); if (c) c.hidden = true; }
        break;
      case 'tab':         if (t.dataset.tab) setTab(t.dataset.tab); break;
    }
  });

  // Click fuera del modal de detalle / Esc
  const detail = document.querySelector('#view-ventas [data-modal="sale-detail"]');
  if (detail) detail.addEventListener('click', (e) => { if (e.target === detail) closeDetail(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && _inVentas(document.activeElement || document.body)) { closeDetail(); closeSheet(); }
  });
}

// ──────────────────────────────────────────────────────────────
// Init por ruta
// ──────────────────────────────────────────────────────────────
async function init() {
  const view = document.getElementById('view-ventas');
  if (!view) return;
  if (!_bound) { bindEvents(); _bound = true; }
  setTab('caja');
  await Promise.all([loadProducts(), loadHistory()]);
  renderProducts();
  renderCart();
  renderBottomBar();
  renderHistory();
}

window.Router?.onRoute('ventas', init);

export { init as initVentas };
