// metrics.js — Sección Métricas (Grifasi Performance)
// ==================================================
// Lee de Supabase únicamente. No genera mock.
//
// Reutiliza módulos del proyecto. Si tu db.js exporta nombres distintos,
// ajustá el bloque `loadDeps()` — esos son los únicos puntos de contacto.
//
// API esperada de db.js (cualquiera de estas formas funciona):
//   - getProductos()           → Producto[]
//   - getMovimientos({ from, to })  → Movimiento[]
// Alternativas aceptadas: listProducts / allProducts ; listMovimientos / getMovements.
//
// Producto: { sku, name|nombre, price|precio_venta, cost|precio_costo,
//             stock|stock_actual, min|stock_minimo, cat|categoria }
// Movimiento: { ts|fecha|created_at, sku, tipo:'entrada'|'salida'|'ajuste',
//               cantidad, motivo? }
//
// Si los exports no están disponibles, la UI muestra estados vacíos
// (no inventa datos).

let _getProductos = null;
let _getMovimientos = null;

async function loadDeps() {
  // Integrado a la SPA: la capa de datos vive en window.DB (IIFE, sin exports).
  _getProductos = (typeof window.DB?.obtenerProductos === 'function')
    ? () => window.DB.obtenerProductos()
    : null;
  _getMovimientos = (typeof window.DB?.obtenerMovimientosRango === 'function')
    ? ({ from, to }) => window.DB.obtenerMovimientosRango({ from, to })
    : null;
}

// ──────────────────────────────────────────────────────────────
// Adaptadores (campo en español → propiedad uniforme)
// ──────────────────────────────────────────────────────────────
function normProduct(p) {
  return {
    sku:   p.sku,
    name:  p.name  ?? p.nombre  ?? p.descripcion ?? p.sku,
    price: Number(p.price ?? p.precio_venta ?? p.precio ?? 0),
    cost:  Number(p.cost  ?? p.precio_costo ?? p.costo ?? 0),
    stock: Number(p.stock ?? p.stock_actual ?? 0),
    min:   Number(p.min   ?? p.stock_minimo ?? 0),
    cat:   p.cat ?? p.categoria ?? '',
  };
}
function normMovement(m) {
  const rawTs = m.ts ?? m.fecha ?? m.created_at ?? m.fecha_creacion ?? Date.now();
  const ts = typeof rawTs === 'number' ? rawTs : new Date(rawTs).getTime();
  return {
    ts,
    sku:      m.sku ?? m.producto_sku ?? m.producto?.sku ?? '',
    tipo:     (m.tipo ?? m.movimiento ?? 'salida').toLowerCase(),
    cantidad: Number(m.cantidad ?? m.qty ?? 0),
    motivo:   m.motivo ?? m.reason ?? '',
  };
}

// ──────────────────────────────────────────────────────────────
// Estado
// ──────────────────────────────────────────────────────────────
const state = {
  period: 'hoy',         // 'hoy' | 'semana' | 'mes'
  products: [],
  movements: [],
  loading: true,
};

// ──────────────────────────────────────────────────────────────
// Períodos
// ──────────────────────────────────────────────────────────────
function periodRange(period = state.period) {
  const now = new Date();
  const to = now.getTime();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (period === 'hoy') {
    return { from: start.getTime(), to, label: 'Hoy' };
  }
  if (period === 'semana') {
    start.setDate(start.getDate() - 6);
    return { from: start.getTime(), to, label: 'Últimos 7 días' };
  }
  // mes
  start.setDate(start.getDate() - 29);
  return { from: start.getTime(), to, label: 'Últimos 30 días' };
}

// ──────────────────────────────────────────────────────────────
// Format helpers
// ──────────────────────────────────────────────────────────────
function fmtMoney(n) {
  const v = Math.round(n || 0);
  if (Math.abs(v) >= 1_000_000) return '$ ' + (v / 1_000_000).toFixed(1).replace('.0', '') + 'M';
  if (Math.abs(v) >= 10_000)    return '$ ' + Math.round(v / 1000) + 'k';
  return '$ ' + v.toLocaleString('es-AR');
}
function fmtInt(n) { return (n || 0).toLocaleString('es-AR'); }
function fmtTime(ts) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}
function fmtDayShort(ts) {
  const d = new Date(ts);
  const today = new Date(); today.setHours(0,0,0,0);
  const yest  = new Date(today); yest.setDate(today.getDate() - 1);
  const dayStart = new Date(d); dayStart.setHours(0,0,0,0);
  if (dayStart.getTime() === today.getTime()) return 'Hoy';
  if (dayStart.getTime() === yest.getTime())  return 'Ayer';
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
}
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
}

// ──────────────────────────────────────────────────────────────
// Computar métricas
// ──────────────────────────────────────────────────────────────
function computeMetrics() {
  const { from, to } = periodRange();
  const prev = previousRange();

  const inRange  = state.movements.filter(m => m.ts >= from && m.ts <= to);
  const inPrev   = state.movements.filter(m => m.ts >= prev.from && m.ts <= prev.to);

  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const todayMovs = state.movements.filter(m => m.ts >= todayStart.getTime());
  const ventasHoy = todayMovs
    .filter(m => m.tipo === 'salida')
    .reduce((s, m) => s + m.cantidad, 0);

  const productByMap = new Map(state.products.map(p => [p.sku, p]));

  // Ingresos y ganancia del período
  let ingresos = 0, ganancia = 0;
  let countIn = 0, countOut = 0, qtyIn = 0, qtyOut = 0;
  const salesBySku = new Map(); // sku -> { qty, ingreso, ganancia }

  for (const m of inRange) {
    if (m.tipo === 'salida') {
      countOut++;
      qtyOut += m.cantidad;
      const p = productByMap.get(m.sku);
      const precio = p ? p.price : 0;
      const costo  = p ? p.cost  : 0;
      const ing = precio * m.cantidad;
      const gan = (precio - costo) * m.cantidad;
      ingresos += ing;
      ganancia += gan;
      const acc = salesBySku.get(m.sku) || { qty: 0, ingreso: 0, ganancia: 0 };
      acc.qty += m.cantidad;
      acc.ingreso += ing;
      acc.ganancia += gan;
      salesBySku.set(m.sku, acc);
    } else if (m.tipo === 'entrada') {
      countIn++;
      qtyIn += m.cantidad;
    }
  }

  // Período previo (para deltas)
  let ingresosPrev = 0;
  for (const m of inPrev) {
    if (m.tipo === 'salida') {
      const p = productByMap.get(m.sku);
      ingresosPrev += (p ? p.price : 0) * m.cantidad;
    }
  }
  const deltaIngresos = ingresosPrev > 0
    ? Math.round(((ingresos - ingresosPrev) / ingresosPrev) * 100)
    : null;

  // Top productos con más salidas (por cantidad)
  const topSalidas = [...salesBySku.entries()]
    .sort((a, b) => b[1].qty - a[1].qty)
    .slice(0, 5)
    .map(([sku, agg]) => ({
      sku,
      name: productByMap.get(sku)?.name || sku,
      ...agg,
    }));

  // Top más vendidos (por ingreso)
  const topIngreso = [...salesBySku.entries()]
    .sort((a, b) => b[1].ingreso - a[1].ingreso)
    .slice(0, 5)
    .map(([sku, agg]) => ({
      sku,
      name: productByMap.get(sku)?.name || sku,
      ...agg,
    }));

  // Bajo stock
  const bajoStock = state.products
    .filter(p => p.min > 0 && p.stock <= p.min)
    .sort((a, b) => (a.stock / (a.min || 1)) - (b.stock / (b.min || 1)))
    .slice(0, 6);

  // Movimientos recientes (últimos 10 del período)
  const recientes = [...inRange]
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 10);

  // Variación de stock por día (resumen semanal/mensual)
  const series = buildDailySeries(inRange, from, to);

  return {
    ventasHoy,
    ingresos, ganancia, deltaIngresos,
    countIn, countOut, qtyIn, qtyOut,
    topSalidas, topIngreso, bajoStock, recientes,
    series,
  };
}

function previousRange() {
  const { from, to } = periodRange();
  const len = to - from;
  return { from: from - len, to: from - 1 };
}

function buildDailySeries(movs, from, to) {
  // Agrupa por día calendario
  const days = [];
  const start = new Date(from); start.setHours(0,0,0,0);
  const end = new Date(to);     end.setHours(0,0,0,0);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    days.push({
      date: new Date(d).getTime(),
      label: d.toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit' }),
      entradas: 0,
      salidas: 0,
      delta: 0,
    });
  }
  for (const m of movs) {
    const d = new Date(m.ts); d.setHours(0,0,0,0);
    const bucket = days.find(x => x.date === d.getTime());
    if (!bucket) continue;
    if (m.tipo === 'entrada')  bucket.entradas += m.cantidad;
    else if (m.tipo === 'salida') bucket.salidas  += m.cantidad;
  }
  let cum = 0;
  for (const day of days) {
    day.delta = day.entradas - day.salidas;
    cum += day.delta;
    day.cum = cum;
  }
  return days;
}

// ──────────────────────────────────────────────────────────────
// Render: KPI cards
// ──────────────────────────────────────────────────────────────
function renderKpis(m) {
  // Ventas del día (siempre día actual)
  setText('[data-kpi-ventas-dia]', fmtInt(m.ventasHoy));
  setText('[data-kpi-ventas-dia-sub]', m.ventasHoy === 1 ? '1 unidad vendida hoy' : `${fmtInt(m.ventasHoy)} unidades vendidas`);

  // Ingresos del período
  setText('[data-kpi-ingresos]', fmtMoney(m.ingresos));
  renderDelta('[data-kpi-ingresos-delta]', m.deltaIngresos);
  setText('[data-kpi-ingresos-sub]', `${fmtInt(m.countOut)} venta${m.countOut === 1 ? '' : 's'} · ${state.period}`);

  // Ganancia
  setText('[data-kpi-ganancia]', fmtMoney(m.ganancia));
  const margenPct = m.ingresos > 0 ? Math.round((m.ganancia / m.ingresos) * 100) : 0;
  setText('[data-kpi-ganancia-sub]', `${margenPct}% margen estimado`);

  // Entradas vs Salidas
  setText('[data-kpi-in]', '+' + fmtInt(m.qtyIn));
  setText('[data-kpi-out]', '−' + fmtInt(m.qtyOut));
  const total = m.qtyIn + m.qtyOut || 1;
  const pctIn  = (m.qtyIn  / total) * 100;
  const pctOut = (m.qtyOut / total) * 100;
  const inBar  = document.querySelector('[data-kpi-bar-in]');
  const outBar = document.querySelector('[data-kpi-bar-out]');
  if (inBar)  inBar.style.width  = pctIn  + '%';
  if (outBar) outBar.style.width = pctOut + '%';
  setText('[data-kpi-inout-sub]', `${m.countIn + m.countOut} movimiento${m.countIn + m.countOut === 1 ? '' : 's'}`);
}

function renderDelta(sel, pct) {
  const el = document.querySelector(sel);
  if (!el) return;
  el.classList.remove('mt-kpi-delta-up', 'mt-kpi-delta-down', 'mt-kpi-delta-flat');
  if (pct === null || isNaN(pct)) {
    el.textContent = '—';
    el.classList.add('mt-kpi-delta-flat');
    return;
  }
  if (pct > 0) {
    el.textContent = `+${pct}%`;
    el.classList.add('mt-kpi-delta-up');
  } else if (pct < 0) {
    el.textContent = `${pct}%`;
    el.classList.add('mt-kpi-delta-down');
  } else {
    el.textContent = '0%';
    el.classList.add('mt-kpi-delta-flat');
  }
}

// ──────────────────────────────────────────────────────────────
// Render: listas
// ──────────────────────────────────────────────────────────────
function renderTopSalidas(rows) {
  const list = document.querySelector('[data-top-salidas]');
  if (!list) return;
  if (!rows.length) { list.innerHTML = emptyState('Sin salidas registradas', 'No hay datos en el período seleccionado.'); return; }
  list.innerHTML = rows.map((r, i) => `
    <li class="mt-list-row">
      <span class="mt-rank mono">${i + 1}</span>
      <div class="mt-list-info">
        <div class="mt-list-name">${escapeHtml(r.name)}</div>
        <div class="mt-list-meta">${escapeHtml(r.sku)}</div>
      </div>
      <div class="mt-list-side">
        <div class="mt-list-side-main">${fmtInt(r.qty)}</div>
        <div class="mt-list-side-sub">unidades</div>
      </div>
    </li>
  `).join('');
}
function renderTopIngreso(rows) {
  const list = document.querySelector('[data-top-ingreso]');
  if (!list) return;
  if (!rows.length) { list.innerHTML = emptyState('Sin ventas registradas', 'No hay ingresos en el período seleccionado.'); return; }
  list.innerHTML = rows.map((r, i) => `
    <li class="mt-list-row">
      <span class="mt-rank mono">${i + 1}</span>
      <div class="mt-list-info">
        <div class="mt-list-name">${escapeHtml(r.name)}</div>
        <div class="mt-list-meta">${escapeHtml(r.sku)} · ${fmtInt(r.qty)} u.</div>
      </div>
      <div class="mt-list-side">
        <div class="mt-list-side-main">${fmtMoney(r.ingreso)}</div>
        <div class="mt-list-side-sub">ingreso</div>
      </div>
    </li>
  `).join('');
}
function renderBajoStock(rows) {
  const list = document.querySelector('[data-bajo-stock]');
  if (!list) return;
  if (!rows.length) { list.innerHTML = emptyState('Todo en orden', 'Sin productos por debajo del mínimo.'); return; }
  list.innerHTML = rows.map(p => {
    const sev = p.stock <= 0 ? 'crit' : 'crit';
    const pct = Math.max(2, Math.min(100, (p.stock / (p.min || 1)) * 100));
    return `
      <li class="mt-list-row">
        <span class="mt-rank mono" style="background: var(--crit); color: oklch(0.99 0 0);">!</span>
        <div class="mt-list-info">
          <div class="mt-list-name">${escapeHtml(p.name)}</div>
          <div class="mt-list-meta">${escapeHtml(p.sku)} · mín ${p.min}</div>
          <div class="mt-list-bar" aria-hidden="true">
            <div class="mt-list-bar-fill ${sev}" style="width: ${pct}%;"></div>
          </div>
        </div>
        <div class="mt-list-side">
          <div class="mt-list-side-main" style="color: var(--crit);">${fmtInt(p.stock)}</div>
          <div class="mt-list-side-sub">en stock</div>
        </div>
      </li>
    `;
  }).join('');
}

function renderRecientes(rows) {
  const tbody = document.querySelector('[data-mov-list]');
  if (!tbody) return;
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="5">${emptyState('Sin movimientos', 'No hay movimientos en el período seleccionado.')}</td></tr>`;
    return;
  }
  const byMapName = new Map(state.products.map(p => [p.sku, p.name]));
  tbody.innerHTML = rows.map(m => {
    const name = byMapName.get(m.sku) || m.sku;
    const tipoLabel = m.tipo === 'entrada' ? 'Entrada' : m.tipo === 'salida' ? 'Salida' : 'Ajuste';
    const tipoCls = m.tipo === 'entrada' ? 'in' : m.tipo === 'salida' ? 'out' : 'adj';
    const qtySign = m.tipo === 'salida' ? '−' : '+';
    return `
      <tr>
        <td>
          <div style="font-weight:500; color: var(--fg);">${escapeHtml(name)}</div>
          <div class="mono" style="font-size:11px;color:var(--fg-3);margin-top:2px;">${escapeHtml(m.sku)}</div>
        </td>
        <td><span class="mt-mov-pill ${tipoCls}"><span class="mt-mov-dot"></span>${tipoLabel}</span></td>
        <td class="num"><span class="mt-mov-qty ${tipoCls}">${qtySign}${fmtInt(m.cantidad)}</span></td>
        <td><span class="mono" style="color:var(--fg-3);font-size:12px;">${fmtDayShort(m.ts)} · ${fmtTime(m.ts)}</span></td>
        <td style="color:var(--fg-3);font-size:12px;">${escapeHtml(m.motivo || '—')}</td>
      </tr>
    `;
  }).join('');
}

function emptyState(title, sub) {
  return `<div class="mt-empty"><div class="mt-empty-title">${escapeHtml(title)}</div><div class="mt-empty-sub">${escapeHtml(sub)}</div></div>`;
}

function setText(sel, value) {
  document.querySelectorAll(sel).forEach(el => el.textContent = value);
}

// ──────────────────────────────────────────────────────────────
// Charts (Canvas vanilla)
// ──────────────────────────────────────────────────────────────
function fitCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

function drawWeeklyChart(series) {
  const canvas = document.querySelector('[data-chart-weekly]');
  if (!canvas) return;
  const { ctx, w, h } = fitCanvas(canvas);
  ctx.clearRect(0, 0, w, h);

  if (!series.length) return;

  const pad = { top: 20, right: 8, bottom: 28, left: 8 };
  const cw = w - pad.left - pad.right;
  const ch = h - pad.top - pad.bottom;

  const maxVal = Math.max(1, ...series.map(d => Math.max(d.entradas, d.salidas)));
  const colW = cw / series.length;
  const barW = Math.min(22, (colW * 0.7) / 2);
  const gap = 3;

  const okColor   = cssVar('--ok')   || '#4ade80';
  const critColor = cssVar('--crit') || '#f87171';
  const lineColor = cssVar('--line-soft') || '#333';
  const fgColor   = cssVar('--fg-3') || '#888';

  // Baseline
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top + ch);
  ctx.lineTo(pad.left + cw, pad.top + ch);
  ctx.stroke();

  ctx.font = '10px Geist, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  series.forEach((d, i) => {
    const cx = pad.left + colW * i + colW / 2;
    const hIn  = (d.entradas / maxVal) * ch;
    const hOut = (d.salidas  / maxVal) * ch;
    const yBase = pad.top + ch;

    // Bar entradas (izq)
    roundedRect(ctx, cx - barW - gap, yBase - hIn, barW, hIn, [3, 3, 0, 0]);
    ctx.fillStyle = okColor;
    ctx.fill();

    // Bar salidas (der)
    roundedRect(ctx, cx + gap, yBase - hOut, barW, hOut, [3, 3, 0, 0]);
    ctx.fillStyle = critColor;
    ctx.fill();

    // Label día
    ctx.fillStyle = fgColor;
    const label = d.label.length > 6 ? d.label.slice(0, 6) : d.label;
    ctx.fillText(label, cx, yBase + 8);
  });
}

function drawStockVarChart(series) {
  const canvas = document.querySelector('[data-chart-stock]');
  if (!canvas) return;
  const { ctx, w, h } = fitCanvas(canvas);
  ctx.clearRect(0, 0, w, h);

  if (!series.length) return;

  const pad = { top: 16, right: 8, bottom: 28, left: 8 };
  const cw = w - pad.left - pad.right;
  const ch = h - pad.top - pad.bottom;

  const values = series.map(d => d.cum);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const range = (max - min) || 1;

  const zeroY = pad.top + ch - ((0 - min) / range) * ch;
  const accent = cssVar('--accent') || '#E07A3C';
  const lineColor = cssVar('--line-soft') || '#333';
  const fgColor = cssVar('--fg-3') || '#888';

  // Zero line
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(pad.left, zeroY);
  ctx.lineTo(pad.left + cw, zeroY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Area + line
  const points = series.map((d, i) => {
    const x = pad.left + (cw / Math.max(1, series.length - 1)) * i;
    const y = pad.top + ch - ((d.cum - min) / range) * ch;
    return { x, y, d };
  });

  // Area fill
  ctx.beginPath();
  ctx.moveTo(points[0].x, zeroY);
  for (const p of points) ctx.lineTo(p.x, p.y);
  ctx.lineTo(points[points.length - 1].x, zeroY);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + ch);
  grad.addColorStop(0, hexAlpha(accent, 0.35));
  grad.addColorStop(1, hexAlpha(accent, 0));
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.stroke();

  // Dot último
  const last = points[points.length - 1];
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(last.x, last.y, 4, 0, Math.PI * 2);
  ctx.fill();

  // Labels (primer + último)
  ctx.font = '10px Geist, system-ui, sans-serif';
  ctx.fillStyle = fgColor;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(points[0].d.label.slice(0, 6), points[0].x, pad.top + ch + 8);
  ctx.textAlign = 'right';
  ctx.fillText(last.d.label.slice(0, 6), last.x, pad.top + ch + 8);
}

function roundedRect(ctx, x, y, w, h, r) {
  if (h <= 0) return;
  const [tl, tr, br, bl] = Array.isArray(r) ? r : [r, r, r, r];
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + tr);
  ctx.lineTo(x + w, y + h - br);
  ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
  ctx.lineTo(x + bl, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - bl);
  ctx.lineTo(x, y + tl);
  ctx.quadraticCurveTo(x, y, x + tl, y);
  ctx.closePath();
}

function hexAlpha(color, alpha) {
  // Color puede ser hex o oklch — solo soportamos hex/rgb aquí.
  // Para oklch fallback: usar canvas con globalAlpha si hace falta.
  if (color.startsWith('#')) {
    const c = color.replace('#', '');
    const full = c.length === 3 ? c.split('').map(ch => ch + ch).join('') : c;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  // Para oklch — devolver color con opacidad CSS
  return color.endsWith(')')
    ? color.slice(0, -1) + ` / ${alpha})`
    : color;
}

// ──────────────────────────────────────────────────────────────
// Period buttons
// ──────────────────────────────────────────────────────────────
function setPeriod(p) {
  state.period = p;
  document.querySelectorAll('[data-period]').forEach(b => {
    b.classList.toggle('active', b.dataset.period === p);
  });
  const range = periodRange(p);
  setText('[data-period-range]', range.label);
  renderAll();
}

// ──────────────────────────────────────────────────────────────
// Render all
// ──────────────────────────────────────────────────────────────
function renderAll() {
  const m = computeMetrics();
  renderKpis(m);
  renderTopSalidas(m.topSalidas);
  renderTopIngreso(m.topIngreso);
  renderBajoStock(m.bajoStock);
  renderRecientes(m.recientes);
  drawWeeklyChart(m.series);
  drawStockVarChart(m.series);
}

// ──────────────────────────────────────────────────────────────
// Carga de datos
// ──────────────────────────────────────────────────────────────
async function reload() {
  state.loading = true;
  showLoading();
  const range = periodRange();
  try {
    const [productos, movimientos] = await Promise.all([
      typeof _getProductos === 'function'   ? _getProductos()                 : Promise.resolve([]),
      typeof _getMovimientos === 'function' ? _getMovimientos({ from: range.from, to: range.to }) : Promise.resolve([]),
    ]);
    state.products  = (productos  || []).map(normProduct);
    state.movements = (movimientos || []).map(normMovement);
  } catch (e) {
    console.error('[metrics] error al cargar datos:', e);
    state.products = [];
    state.movements = [];
  } finally {
    state.loading = false;
    renderAll();
  }
}

function showLoading() {
  ['[data-kpi-ventas-dia]','[data-kpi-ingresos]','[data-kpi-ganancia]'].forEach(sel => {
    const el = document.querySelector(sel);
    if (el) el.innerHTML = '<span class="mt-skeleton mt-skel-num" style="display:inline-block; width:90px;"></span>';
  });
}

// ──────────────────────────────────────────────────────────────
// Bind events
// ──────────────────────────────────────────────────────────────
function bindEvents() {
  document.addEventListener('click', (e) => {
    const periodBtn = e.target.closest('[data-period]');
    if (periodBtn) {
      setPeriod(periodBtn.dataset.period);
    }
  });
  // Redraw on resize (debounced)
  let resizeT;
  window.addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => {
      if (!state.loading) {
        const m = computeMetrics();
        drawWeeklyChart(m.series);
        drawStockVarChart(m.series);
      }
    }, 120);
  });
}

// ──────────────────────────────────────────────────────────────
// Init
// ──────────────────────────────────────────────────────────────
let _bound = false;
async function init() {
  await loadDeps();
  if (!_bound) { bindEvents(); _bound = true; }
  setPeriod(state.period);
  await reload();
}

// Integrado a la SPA: se inicializa al entrar a la ruta (no auto-init).
window.Router?.onRoute('metricas', init);

export { init as initMetrics, reload as reloadMetrics };
