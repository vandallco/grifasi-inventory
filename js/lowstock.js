// Bajo stock
(() => {
  function _escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Misma regla que dashboard.js: crit = 0 o ≤ 20% del mínimo
  function _isCritico(p) {
    if (!p) return false;
    if (p.stock_actual <= 0) return true;
    return p.stock_minimo > 0 && p.stock_actual <= Math.ceil(p.stock_minimo * 0.2);
  }

  const _REFRESH =
    '<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.95" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10a7 7 0 0 1 12-4.95L17 7"/><path d="M17 3v4h-4"/><path d="M17 10a7 7 0 0 1-12 4.95L3 13"/><path d="M3 17v-4h4"/></svg>';

  function _renderSection(container, productos, sev) {
    if (!container) return;
    const isTable = container.tagName === 'TBODY';
    if (!productos.length) {
      container.innerHTML = isTable
        ? '<tr><td colspan="6" class="empty-msg">Sin productos en esta categoría</td></tr>'
        : '<li class="empty-msg">Sin productos en esta categoría</li>';
      return;
    }
    container.innerHTML = productos.map(p => {
      const sku = _escapeHtml(p.sku);
      const pct = p.stock_minimo > 0
        ? Math.max(2, Math.min(100, Math.round((p.stock_actual / p.stock_minimo) * 100)))
        : 2;
      const curText = (sev === 'crit' && p.stock_actual <= 0)
        ? 'Sin stock'
        : `${p.stock_actual} en stock`;
      if (isTable) {
        return `<tr data-sku="${sku}" class="ls-${sev}">
          <td>
            <span class="dk-ls-pulse ls-${sev}" aria-hidden="true"></span>
            <span class="dk-tbl-name">${_escapeHtml(p.nombre)}</span>
          </td>
          <td><span class="mono dk-tbl-mono">${sku}</span></td>
          <td><span class="ls-item-brand">${_escapeHtml(p.marca ?? '')}</span></td>
          <td class="num"><span class="ls-status-cur mono ls-${sev}-text">${curText}</span></td>
          <td class="num"><span class="dk-tbl-min mono">${p.stock_minimo}</span></td>
          <td class="right"><button class="dk-btn-mini" type="button" data-action="reponer" data-sku="${sku}">Reponer</button></td>
        </tr>`;
      }
      return `<li class="ls-item ls-${sev}" data-sku="${sku}">
        <div class="ls-item-header">
          <div class="ls-item-info">
            <div class="ls-item-name">${_escapeHtml(p.nombre)}</div>
            <div class="ls-item-meta">
              <span class="ls-item-brand">${_escapeHtml(p.marca ?? '')}</span>
              <span class="dot-sep">·</span>
              <span class="ls-item-cat">${_escapeHtml(p.categoria ?? '')}</span>
            </div>
          </div>
          <button class="ls-reponer ls-reponer-${sev}" type="button" data-action="reponer" data-sku="${sku}">
            <span>${_REFRESH}</span>
            <span>Reponer</span>
          </button>
        </div>
        <div class="ls-bar-row">
          <div class="ls-bar" aria-hidden="true">
            <div class="ls-bar-fill ls-fill-${sev}" style="width: ${sev === 'crit' ? 2 : pct}%;"></div>
          </div>
        </div>
        <div class="ls-status-line">
          <span class="ls-status-cur mono ls-${sev}-text">${curText}</span>
          <span class="ls-status-min">Mínimo: <span class="mono">${p.stock_minimo}</span></span>
        </div>
      </li>`;
    }).join('');
  }

  // Cache para lookup rápido en click "Reponer"
  let _lastProducts = [];

  async function init() {
    const view = document.getElementById('view-bajo-stock');
    if (!view) return;

    _lastProducts = await window.DB.obtenerProductosBajoMinimo();

    const criticos = _lastProducts.filter(_isCritico);
    const advertencia = _lastProducts.filter(p => !_isCritico(p));

    view.querySelectorAll('[data-low-count]').forEach(el => { el.textContent = _lastProducts.length; });
    view.querySelectorAll('[data-summary-crit]').forEach(el => { el.textContent = criticos.length; });
    view.querySelectorAll('[data-summary-warn]').forEach(el => { el.textContent = advertencia.length; });
    window.DesktopShell?.setLowCount(_lastProducts.length);

    view.querySelectorAll('[data-section-crit]').forEach(el => _renderSection(el, criticos, 'crit'));
    view.querySelectorAll('[data-section-warn]').forEach(el => _renderSection(el, advertencia, 'warn'));
  }

  // Delegación de clicks en "Reponer"
  document.addEventListener('click', e => {
    const view = document.getElementById('view-bajo-stock');
    if (!view || view.style.display === 'none') return;

    const btn = e.target.closest('[data-action="reponer"]');
    if (btn && view.contains(btn)) {
      const sku = btn.dataset.sku;
      const producto = _lastProducts.find(p => p.sku === sku);
      if (producto) window.Movements?.openModal(producto, 'entrada');
    }
  });

  Router.onRoute('bajo-stock', init);

  window.LowStock = Object.freeze({ init });
})();
