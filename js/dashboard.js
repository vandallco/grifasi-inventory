// Dashboard
(() => {
  let _lowCache = [];
  function _escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _relativeTime(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 60) return `hace ${min || 1} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `hace ${h} h`;
    return `hace ${Math.floor(h / 24)} días`;
  }

  function _stockSeverity(stock, minimo) {
    // crit: sin stock o muy cerca de quebrar (≤ 20% del mínimo)
    // warn: entre el 20% del mínimo y el mínimo
    // ok:   por encima del mínimo
    if (stock <= 0) return 'crit';
    if (minimo > 0 && stock <= Math.ceil(minimo * 0.2)) return 'crit';
    if (stock <= minimo) return 'warn';
    return 'ok';
  }

  const _REPONER_SVG =
    '<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10a7 7 0 0 1 12-4.95L17 7"/><path d="M17 3v4h-4"/><path d="M17 10a7 7 0 0 1-12 4.95L3 13"/><path d="M3 17v-4h4"/></svg>';
  const _ARROW_UP_SVG =
    '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 13V3"/><path d="M3 7l5-4 5 4"/></svg>';
  const _ARROW_DOWN_SVG =
    '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v10"/><path d="M3 9l5 4 5-4"/></svg>';

  const _DOW = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'];
  const _MON = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

  let _clockInterval = null;

  function _getGreeting() {
    const h = new Date().getHours();
    if (h >= 6 && h < 12) return 'Buen día';
    if (h >= 12 && h < 20) return 'Buenas tardes';
    return 'Buenas noches';
  }

  function _updateDateTime() {
    const now = new Date();
    const dow = _DOW[now.getDay()];
    const day = now.getDate();
    const mon = _MON[now.getMonth()];
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const text = `${dow} \u00B7 ${day} ${mon} \u00B7 ${hh}:${mm}`;
    document.querySelectorAll('[data-current-date]').forEach(function(el) {
      el.textContent = text;
    });
    // Actualizar también el saludo
    document.querySelectorAll('[data-greet]').forEach(function(el) {
      el.textContent = _getGreeting();
    });
    // Y la topbar del desktop
    window.DesktopShell?.setTitle(_getGreeting());
  }

  function _hhmm(iso) {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function _renderLowStock(container, items) {
    const isTable = container.tagName === 'TBODY';
    if (!items.length) {
      container.innerHTML = isTable
        ? '<tr><td colspan="5" class="empty-msg">Sin productos bajo mínimo</td></tr>'
        : '<li class="empty-msg">Sin productos bajo mínimo</li>';
      return;
    }
    container.innerHTML = items.map(p => {
      const sev = _stockSeverity(p.stock_actual, p.stock_minimo);
      const sku = _escapeHtml(p.sku);
      if (isTable) {
        return `<tr data-sku="${sku}">
          <td><span class="dk-tbl-name">${_escapeHtml(p.nombre)}</span></td>
          <td><span class="dk-tbl-mono mono">${sku}</span></td>
          <td class="num"><span class="stock-pill stock-${sev}"><span class="mono">${p.stock_actual}</span></span></td>
          <td class="num"><span class="dk-tbl-min mono">${p.stock_minimo}</span></td>
          <td class="right"><button class="dk-btn-mini" type="button" data-action="reponer" data-sku="${sku}">Reponer</button></td>
        </tr>`;
      }
      return `<li class="lowstock-row sev-${sev}" data-sku="${sku}">
        <div class="lowstock-bar" aria-hidden="true"></div>
        <div class="lowstock-info">
          <div class="lowstock-name">${_escapeHtml(p.nombre)}</div>
          <div class="lowstock-meta">
            <span class="mono">${sku}</span>
            <span class="dot-sep">·</span>
            <span class="stock-pill stock-${sev}"><span class="mono"><strong>${p.stock_actual}</strong> / ${p.stock_minimo}</span></span>
          </div>
        </div>
        <button class="btn-reponer" type="button" data-action="reponer" data-sku="${sku}">
          <span class="btn-reponer-icon">${_REPONER_SVG}</span>
          <span>Reponer</span>
        </button>
      </li>`;
    }).join('');
  }

  function _renderMoves(container, moves) {
    const isDk = container.classList.contains('dk-moves-list');
    if (!moves.length) {
      container.innerHTML = '<li class="empty-msg">Sin movimientos recientes</li>';
      return;
    }
    container.innerHTML = moves.map(m => {
      const isIn = m.tipo === 'entrada';
      const nombre = m.productos?.nombre ?? m.producto_nombre ?? '';
      if (isDk) {
        return `<li class="dk-move ${isIn ? 'dk-move-in' : 'dk-move-out'}">
          <div class="dk-move-icon" aria-hidden="true">${isIn ? _ARROW_UP_SVG : _ARROW_DOWN_SVG}</div>
          <div class="dk-move-info">
            <div class="dk-move-name">${_escapeHtml(nombre)}</div>
            <div class="dk-move-meta">
              <span>${isIn ? 'Entrada' : 'Salida'}</span>
              <span class="dot-sep">·</span>
              <span class="mono">${_hhmm(m.created_at)}</span>
            </div>
          </div>
          <div class="dk-move-qty mono ${isIn ? 'qty-in' : 'qty-out'}">${isIn ? '+' : '−'}${m.cantidad}</div>
        </li>`;
      }
      return `<li class="move-row ${isIn ? 'move-in' : 'move-out'}">
        <div class="move-icon" aria-hidden="true">${isIn ? _ARROW_UP_SVG : _ARROW_DOWN_SVG}</div>
        <div class="move-info">
          <div class="move-name">${_escapeHtml(nombre)}</div>
          <div class="move-meta">
            <span class="move-type">${isIn ? 'Entrada' : 'Salida'}</span>
            <span class="dot-sep">·</span>
            <span class="mono move-time">${_hhmm(m.created_at)}</span>
          </div>
        </div>
        <div class="move-qty mono ${isIn ? 'qty-in' : 'qty-out'}">${isIn ? '+' : '−'}${m.cantidad}</div>
      </li>`;
    }).join('');
  }

  async function init() {
    const view = document.getElementById('view-dashboard');
    if (!view) return;

    const stats = await window.DB.getDashboardStats();

    const totalProd = stats.totalProductos ?? 0;
    const totalLow  = stats.totalBajoMinimo ?? 0;
    const moves     = stats.ultimosMovimientos ?? [];

    // Métricas numéricas (hooks reales del markup)
    view.querySelectorAll('[data-metric]').forEach(el => {
      const key = el.dataset.metric;
      if (key === 'total')     el.textContent = totalProd;
      if (key === 'low')       el.textContent = totalLow;
      if (key === 'low-badge') el.textContent = totalLow;
      if (key === 'moves')     el.textContent = moves.length;
    });

    // Contador "bajo stock" (aparece en la sección y en el badge de la nav)
    view.querySelectorAll('[data-low-stock-count]').forEach(el => {
      el.textContent = totalLow;
    });

    _lowCache = stats.productosBajoMinimo ?? [];
    window.DesktopShell?.setLowCount(totalLow);
    view.querySelectorAll('[data-low-stock-list]').forEach(el => _renderLowStock(el, _lowCache));

    view.querySelectorAll('[data-moves-list]').forEach(el => {
      _renderMoves(el, moves);
      const movesSection = el.closest('.section');
      const movesCount = movesSection && movesSection.querySelector('.section-count');
      if (movesCount) movesCount.textContent = moves.length;
    });

    // Reloj en vivo: actualizar fecha/hora y mantener cada 60s
    _updateDateTime();
    if (!_clockInterval) {
      _clockInterval = setInterval(_updateDateTime, 60_000);
    }
  }

  // Limpiar intervalo al salir del dashboard
  document.addEventListener('route:changed', function(e) {
    if (e.detail.pattern !== 'dashboard' && _clockInterval) {
      clearInterval(_clockInterval);
      _clockInterval = null;
    }
  });

  // Delegación de clicks: Reponer abre modal; la fila navega al detalle
  document.addEventListener('click', e => {
    const view = document.getElementById('view-dashboard');
    if (!view || view.style.display === 'none') return;

    const rep = e.target.closest('[data-action="reponer"]');
    if (rep && view.contains(rep)) {
      const prod = _lowCache.find(p => p.sku === rep.dataset.sku);
      if (prod) window.Movements?.openModal(prod, 'entrada');
      return;
    }

    const el = e.target.closest('[data-sku]');
    if (el && view.contains(el)) {
      window.Router.navigate('producto/' + el.dataset.sku);
    }
  });

  Router.onRoute('dashboard', init);

  window.Dashboard = Object.freeze({ init });
})();
