// Inventario / Detalle / Crear producto
(() => {
  // ── Helpers ────────────────────────────────────────────────
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
    // crit: sin stock o ≤ 20% del mínimo · warn: entre 20% y el mín · ok: arriba del mín
    if (stock <= 0) return 'crit';
    if (minimo > 0 && stock <= Math.ceil(minimo * 0.2)) return 'crit';
    if (stock <= minimo) return 'warn';
    return 'ok';
  }

  function _toast(msg, tipo = 'success') {
    window.Toast?.show(msg, tipo);
  }

  const _H_UP   = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 13V3"/><path d="M3 7l5-4 5 4"/></svg>';
  const _H_DOWN = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v10"/><path d="M3 9l5 4 5-4"/></svg>';
  const _H_ADJ  = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h9l-2-2"/><path d="M13 11H4l2 2"/></svg>';
  const _DOW = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'];
  const _MON = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

  function _hhmm(iso) {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function _dayLabel(d) {
    const now = new Date();
    const sameDay = d.getFullYear() === now.getFullYear() &&
                    d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    const base = `${_DOW[d.getDay()]} ${d.getDate()} ${_MON[d.getMonth()]}`;
    return sameDay ? `HOY · ${base}` : base;
  }

  function _renderHistGroups(movs) {
    const groups = [];
    const byKey = {};
    movs.forEach(m => {
      const d = new Date(m.created_at);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!byKey[key]) { byKey[key] = { label: _dayLabel(d), items: [] }; groups.push(byKey[key]); }
      byKey[key].items.push(m);
    });
    return groups.map(g => `
      <div class="hist-group">
        <div class="hist-day mono">${g.label}</div>
        <ul class="hist-list">
          ${g.items.map(m => {
            let cls, icon, sign, label;
            if (m.tipo === 'salida') { cls = 'out'; icon = _H_DOWN; sign = '−'; label = 'Salida'; }
            else if (m.tipo === 'ajuste') {
              cls = 'adj'; icon = _H_ADJ;
              const delta = (m.stock_despues != null && m.stock_antes != null)
                ? m.stock_despues - m.stock_antes : m.cantidad;
              sign = delta < 0 ? '−' : '+'; label = 'Ajuste';
            } else { cls = 'in'; icon = _H_UP; sign = '+'; label = m.tipo === 'devolucion' ? 'Devolución' : 'Entrada'; }
            const reason = [m.motivo, m.referencia].filter(Boolean).map(_escapeHtml).join(' · ');
            return `<li class="hist-row hist-${cls}">
              <span class="hist-icon" aria-hidden="true">${icon}</span>
              <div class="hist-body">
                <div class="hist-line-1">
                  <span class="hist-type">${label}</span>
                  <span class="dot-sep">·</span>
                  <span class="hist-qty mono qty-${cls}">${sign}${m.cantidad}</span>
                </div>
                <div class="hist-line-2"><span class="hist-reason">${reason || '—'}</span></div>
              </div>
              <div class="hist-time mono">${_hhmm(m.created_at)}</div>
            </li>`;
          }).join('')}
        </ul>
      </div>`).join('');
  }

  // ── Estado inventario ──────────────────────────────────────
  let _allProducts = [];
  let _activeCategory = null;

  // ── Inventario ─────────────────────────────────────────────
  const _CHEV =
    '<svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4l5 5-5 5"/></svg>';

  function _renderProductsTo(list, productos) {
    const isTable = list.tagName === 'TBODY';
    if (!productos.length) {
      list.innerHTML = isTable
        ? '<tr><td colspan="7" class="empty-msg">Sin productos</td></tr>'
        : '<li class="empty-msg">Sin productos</li>';
      return;
    }
    list.innerHTML = productos.map(p => {
      const sev  = _stockSeverity(p.stock_actual, p.stock_minimo);
      const sku  = _escapeHtml(p.sku);
      const code = _escapeHtml(String(p.sku ?? '').slice(0, 3).toUpperCase());
      if (isTable) {
        return `<tr data-product-sku="${sku}">
          <td>
            <span class="dk-inv-thumb" data-cat="${_escapeHtml(p.categoria ?? '')}">${code}</span>
            <span class="dk-tbl-name">${_escapeHtml(p.nombre)}</span>
          </td>
          <td><span class="mono dk-tbl-mono">${sku}</span></td>
          <td><span class="dk-inv-brand">${_escapeHtml(p.marca ?? '')}</span></td>
          <td><span class="dk-inv-cat">${_escapeHtml(p.categoria ?? '')}</span></td>
          <td class="num"><span class="stock-num mono stock-${sev}">${p.stock_actual}</span></td>
          <td class="num"><span class="dk-tbl-min mono">${p.stock_minimo}</span></td>
          <td class="right"><button class="dk-btn-mini" type="button" data-view="producto/${sku}">Ver</button></td>
        </tr>`;
      }
      return `<li>
        <button class="inv-row" type="button" data-product-sku="${sku}">
          <div class="inv-thumb" data-cat="${_escapeHtml(p.categoria ?? '')}" aria-hidden="true">
            <span class="inv-thumb-code mono">${code}</span>
          </div>
          <div class="inv-row-info">
            <div class="inv-row-name">${_escapeHtml(p.nombre)}</div>
            <div class="inv-row-meta">
              <span class="inv-brand">${_escapeHtml(p.marca ?? '')}</span>
              <span class="dot-sep">·</span>
              <span class="mono inv-sku">${sku}</span>
            </div>
          </div>
          <div class="inv-row-stock">
            <span class="stock-num mono stock-${sev}">${p.stock_actual}</span>
            <span class="stock-min mono">mín ${p.stock_minimo}</span>
          </div>
          <span class="inv-chev" aria-hidden="true">${_CHEV}</span>
        </button>
      </li>`;
    }).join('');
  }

  function _renderProducts(view, productos) {
    view.querySelectorAll('[data-product-count]').forEach(el => { el.textContent = productos.length; });
    view.querySelectorAll('[data-product-list]').forEach(list => _renderProductsTo(list, productos));
  }

  function _catEq(a, b) {
    return (a ?? '').toString().trim().toLowerCase() === (b ?? '').toString().trim().toLowerCase();
  }

  function _filterProducts(busqueda) {
    let result = _allProducts;
    if (_activeCategory) {
      result = result.filter(p => _catEq(p.categoria, _activeCategory));
    }
    if (busqueda) {
      const q = busqueda.toLowerCase();
      result = result.filter(p =>
        (p.nombre ?? '').toLowerCase().includes(q) ||
        (p.sku ?? '').toLowerCase().includes(q) ||
        (p.marca ?? '').toLowerCase().includes(q)
      );
    }
    return result;
  }

  function _renderChipCounts(view) {
    view.querySelectorAll('[data-chip-count]').forEach(el => {
      const cat = el.dataset.chipCount;
      el.textContent = cat === 'Todos'
        ? _allProducts.length
        : _allProducts.filter(p => _catEq(p.categoria, cat)).length;
    });
  }

  async function initInventario() {
    const view = document.getElementById('view-inventario');
    if (!view) return;
    _activeCategory = null;
    view.querySelectorAll('[data-cat]').forEach(el => el.classList.remove('active'));
    const todos = view.querySelector('[data-cat="Todos"]');
    if (todos) todos.classList.add('active');

    const searchEl = view.querySelector('[data-action="search"]');
    if (searchEl) searchEl.value = '';

    _allProducts = await window.DB.obtenerProductos();
    _renderChipCounts(view);
    _renderProducts(view, _allProducts);
  }

  // ── Detalle ────────────────────────────────────────────────
  async function initDetalle(id) {
    const view = document.getElementById('view-detalle');
    if (!view) return;

    let producto = await window.DB.buscarPorSku(id);
    if (!producto) {
      // Fallback: buscar por id UUID en listado completo
      const todos = await window.DB.obtenerProductos();
      producto = todos.find(p => p.id === id) ?? null;
    }
    if (!producto) {
      _toast('Producto no encontrado', 'error');
      window.Router.navigate('inventario');
      return;
    }

    const txt = (sel, val) => {
      view.querySelectorAll(sel).forEach(el => { el.textContent = (val ?? '') === '' ? '—' : val; });
    };

    // ── Hero / header ──
    txt('[data-product-sku]', producto.sku);
    txt('[data-product-category]', (producto.categoria ?? '').toUpperCase());
    txt('[data-product-name]', producto.nombre);
    txt('[data-product-brand]', producto.marca);

    // ── Stock card ──
    const sev = _stockSeverity(producto.stock_actual, producto.stock_minimo);
    const stockMax = Math.max(producto.stock_actual, producto.stock_minimo * 3, 1);
    const tagText = sev === 'crit' ? 'Sin stock' : sev === 'warn' ? 'Bajo mínimo' : 'Stock saludable';

    view.querySelectorAll('[data-stock-card]').forEach(card => { card.className = `stock-card sev-${sev}`; });
    txt('[data-stock-current]', producto.stock_actual);
    txt('[data-stock-min]', producto.stock_minimo);
    txt('[data-stock-max]', stockMax);

    view.querySelectorAll('[data-stock-tag]').forEach(tag => {
      tag.className = `stock-card-tag tag-${sev}`;
      tag.textContent = tagText;
    });

    const fillPct = Math.max(0, Math.min(100, Math.round((producto.stock_actual / stockMax) * 100)));
    view.querySelectorAll('[data-stock-fill]').forEach(fill => {
      fill.className = `stock-meter-fill fill-${sev}`;
      fill.style.width = fillPct + '%';
    });
    const markPct = Math.max(0, Math.min(100, Math.round((producto.stock_minimo / stockMax) * 100)));
    view.querySelectorAll('[data-stock-mark]').forEach(mark => {
      mark.style.left = markPct + '%';
      mark.title = `Mínimo: ${producto.stock_minimo}`;
    });

    // ── Grilla de datos ──
    const money = (v) => (v == null || v === '') ? null : '$ ' + Number(v).toLocaleString('es-AR');
    const cell = (key, val) => {
      view.querySelectorAll(`[data-data-cell="${key}"]`).forEach(el => {
        el.textContent = (val ?? '') === '' ? '—' : val;
      });
    };
    cell('sku', producto.sku);
    cell('unit', producto.unidad ?? 'unidad');
    cell('cost', money(producto.precio_costo) ?? '—');
    cell('price', money(producto.precio_venta) ?? '—');
    cell('location', '—');

    view.querySelectorAll('[data-data-cell="margin"]').forEach(marginEl => {
      const c = Number(producto.precio_costo), v = Number(producto.precio_venta);
      if (c > 0 && v > 0) {
        const pct = Math.round(((v - c) / c) * 100);
        marginEl.innerHTML = `${pct}% <span class="data-sub">· $ ${Number(v - c).toLocaleString('es-AR')}</span>`;
      } else {
        marginEl.textContent = '—';
      }
    });

    // ── Title en topbar desktop ──
    window.DesktopShell?.setTitle(producto.nombre);

    // ── Historial agrupado por día ──
    const histLists = view.querySelectorAll('[data-history-list]');
    const movs = await window.DB.obtenerMovimientos(producto.id);
    view.querySelectorAll('[data-history-count]').forEach(el => { el.textContent = movs.length; });

    histLists.forEach(histList => {
      if (!movs.length) {
        histList.innerHTML = '<p class="empty-msg">Sin movimientos</p>';
      } else {
        histList.innerHTML = _renderHistGroups(movs);
      }
    });

    // Guardar referencia para botones de modal
    view._producto = producto;
  }

  // ── Crear producto ─────────────────────────────────────────
  // Parseo de números en formato AR ("45.200,50" → 45200.5)
  function _num(s) {
    s = String(s ?? '').trim();
    if (!s) return null;
    s = s.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
  }
  function _int(s) {
    const n = _num(s);
    return n == null ? null : Math.round(n);
  }

  function _getFormData(view) {
    const fld = (f) => {
      const el = view.querySelector(`[data-field="${f}"]`);
      return el ? (el.value ?? el.textContent ?? '').trim() : '';
    };
    const skuRaw = fld('sku-manual');
    const catEl  = view.querySelector('[data-field-group="category"] .cat-chip.active')
                || view.querySelector('[data-cat].active');
    const unitEl = view.querySelector('[data-field-group="unit"] .unit-chip.active')
                || view.querySelector('[data-unit].active');
    return {
      sku:          skuRaw === '—' ? '' : skuRaw,
      nombre:       fld('name'),
      marca:        fld('brand') || null,
      descripcion:  fld('description') || null,
      categoria:    catEl ? catEl.dataset.cat : null,
      unidad:       unitEl ? unitEl.dataset.unit : 'unidad',
      precio_costo: _num(fld('cost')),
      precio_venta: _num(fld('price')),
      stock_actual: _int(fld('stock-ini')) ?? 0,
      stock_minimo: _int(fld('stock-min')) ?? 0,
    };
  }

  function _precargarForm(view, datos) {
    if (!datos) return;
    Object.entries(datos).forEach(([k, v]) => {
      const el = view.querySelector(`[data-field="${k}"]`);
      if (el) el.value = v ?? '';
    });
  }

  function initCrearProducto() {
    const view = document.getElementById('view-crear-producto');
    if (!view) return;

    const root    = view.querySelector('.cr-root');
    const titleEl = view.querySelector('.cr-header-title');
    const saveBtn = view.querySelector('[data-action="save"]');
    const editing = window._editProducto || null;

    // Reset común: estado visual + campos + chips
    if (root) root.dataset.state = 'idle';
    view.querySelectorAll('[data-field]').forEach(el => { el.value = ''; });
    view.querySelectorAll('[data-cat], [data-unit]').forEach(el => el.classList.remove('active'));

    // ── Modo edición ──
    if (editing) {
      view._editId = editing.id;
      if (titleEl) titleEl.textContent = 'Editar producto';
      if (saveBtn) saveBtn.textContent = 'Guardar cambios';
      _precargarFormDesdeProducto(view, editing);
      window._editProducto = null;
      window._pendingSku = null;
      window._pendingLookup = null;
      return;
    }

    // ── Modo creación ──
    view._editId = null;
    if (titleEl) titleEl.textContent = 'Nuevo producto';
    if (saveBtn) saveBtn.textContent = 'Guardar producto';

    // Restaurar defaults de chips
    const defaultCat  = view.querySelector('[data-field-group="category"] [data-cat="Cubiertas"]');
    if (defaultCat)  defaultCat.classList.add('active');
    const defaultUnit = view.querySelector('[data-field-group="unit"] [data-unit="unidad"]');
    if (defaultUnit) defaultUnit.classList.add('active');

    // SKU pendiente del escáner (input editable; vacío si es entrada manual)
    const skuEl = view.querySelector('[data-field="sku-manual"]');
    if (skuEl) skuEl.value = window._pendingSku || '';

    // Datos prellenados desde lookup externo
    if (window._pendingLookup) {
      _precargarFormDesdeLookup(view, window._pendingLookup);
      if (root) root.dataset.state = 'found';
      window._pendingLookup = null;
    } else if (window._pendingSku) {
      if (root) root.dataset.state = 'unknown';
    }
    window._pendingSku = null;
  }

  // Prellena el form desde un producto existente (modo edición)
  function _precargarFormDesdeProducto(view, p) {
    const set = (f, v) => {
      const el = view.querySelector(`[data-field="${f}"]`);
      if (el) el.value = (v ?? '') === '' ? '' : v;
    };
    set('sku-manual', p.sku);
    set('name', p.nombre);
    set('brand', p.marca);
    set('description', p.descripcion);
    set('cost', p.precio_costo);
    set('price', p.precio_venta);
    set('stock-ini', p.stock_actual);
    set('stock-min', p.stock_minimo);

    if (p.categoria) {
      const cn = String(p.categoria).toLowerCase();
      view.querySelectorAll('[data-field-group="category"] [data-cat]').forEach(c => {
        c.classList.toggle('active', c.dataset.cat.toLowerCase() === cn);
      });
    }
    const un = String(p.unidad || 'unidad').toLowerCase();
    view.querySelectorAll('[data-field-group="unit"] [data-unit]').forEach(c => {
      c.classList.toggle('active', c.dataset.unit.toLowerCase() === un);
    });
  }

  // Mapea claves de Lookup (nombre/marca/descripcion) a campos del form (name/brand/description)
  const _LOOKUP_FIELD = {
    nombre: 'name', marca: 'brand', descripcion: 'description',
    precio_costo: 'cost', precio_venta: 'price',
  };

  function _precargarFormDesdeLookup(view, datos) {
    if (!datos) return;
    Object.entries(datos).forEach(([k, v]) => {
      const f = _LOOKUP_FIELD[k] || k;
      const el = view.querySelector(`[data-field="${f}"]`);
      if (el && (v ?? '') !== '') el.value = v;
    });
    // Activar el chip de categoría si el lookup devolvió una
    if (datos.categoria) {
      const catNorm = datos.categoria.toLowerCase();
      view.querySelectorAll('[data-field-group="category"] [data-cat]').forEach(chip => {
        chip.classList.toggle('active', chip.dataset.cat.toLowerCase() === catNorm);
      });
    }
  }

  // ── Escuchar eventos del scanner ───────────────────────────
  // Producto NO existe en la DB ni se encontró por lookup externo:
  // abrir el form de creación con el SKU prellenado.
  document.addEventListener('scanner:not-found', e => {
    window._pendingSku = e.detail?.sku ?? null;
    window._pendingLookup = null;
    window.Router?.navigate('nuevo-producto');
  });

  // El lookup externo encontró datos: abrir el form prellenado.
  document.addEventListener('scanner:preview', e => {
    window._pendingSku = e.detail?.sku ?? null;
    window._pendingLookup = e.detail?.lookupData ?? null;
    window.Router?.navigate('nuevo-producto');
  });

  // ── Delegación global de clicks ────────────────────────────
  document.addEventListener('click', e => {
    // ── Inventario ──
    const invView = document.getElementById('view-inventario');
    if (invView && invView.style.display !== 'none') {
      const skuEl = e.target.closest('[data-product-sku]');
      if (skuEl && invView.contains(skuEl)) {
        window.Router.navigate('producto/' + skuEl.dataset.productSku);
        return;
      }
      const catEl = e.target.closest('[data-cat]');
      if (catEl && invView.contains(catEl)) {
        invView.querySelectorAll('[data-cat]').forEach(el => el.classList.remove('active'));
        catEl.classList.add('active');
        _activeCategory = catEl.dataset.cat === 'Todos' ? null : catEl.dataset.cat;
        const busq = invView.querySelector('[data-action="search"]');
        _renderProducts(invView, _filterProducts(busq?.value ?? ''));
        return;
      }
      const actionEl = e.target.closest('[data-action="nuevo-producto"]');
      if (actionEl && invView.contains(actionEl)) {
        window.Router.navigate('nuevo-producto');
        return;
      }
    }

    // ── Detalle ──
    const detView = document.getElementById('view-detalle');
    if (detView && detView.style.display !== 'none') {
      const actionEl = e.target.closest('[data-action]');
      if (actionEl && detView.contains(actionEl)) {
        const act = actionEl.dataset.action;
        const producto = detView._producto;
        if (act === 'add' && producto) {
          window.Movements?.openModal(producto, 'entrada');
          return;
        }
        if (act === 'rem' && producto) {
          window.Movements?.openModal(producto, 'salida');
          return;
        }
        if (act === 'edit' && producto) {
          window._editProducto = producto;
          window.Router.navigate('nuevo-producto');
          return;
        }
        // Cualquier otra acción (back, more, view-history, etc.) cae al router
        // vía la delegación de [data-view] en js/router.js.
      }
    }

    // ── Crear producto ──
    const crView = document.getElementById('view-crear-producto');
    if (crView && crView.style.display !== 'none') {
      const actionEl = e.target.closest('[data-action]');
      if (actionEl && crView.contains(actionEl)) {
        const act = actionEl.dataset.action;
        if (act === 'save') {
          const data = _getFormData(crView);
          if (!data.sku)      { _toast('Ingresá un SKU / código', 'error'); return; }
          if (!data.nombre)   { _toast('Ingresá el nombre del producto', 'error'); return; }
          if (!data.categoria){ _toast('Elegí una categoría', 'error'); return; }

          const editId = crView._editId;
          const op = editId
            ? window.DB.actualizarProducto(editId, data).then(() => 'Cambios guardados')
            : window.DB.crearProducto(data).then(() => 'Producto creado');

          op
            .then(msg => {
              _toast(msg);
              crView._editId = null;
              window.Router.navigate(editId ? ('producto/' + data.sku) : 'inventario');
            })
            .catch(err => _toast(err.message ?? 'Error al guardar', 'error'));
          return;
        }
        if (act === 'cancel' || act === 'close') {
          window.Router.navigate('inventario');
          return;
        }
        if (act === 'cancel-lookup') {
          // Cancela la búsqueda (si hubiera una en curso) y deja el form usable
          const root = crView.querySelector('.cr-root');
          if (root) root.dataset.state = 'cancelled';
          return;
        }
      }

      const catEl = e.target.closest('[data-cat]');
      if (catEl && crView.contains(catEl)) {
        crView.querySelectorAll('[data-cat]').forEach(el => el.classList.remove('active'));
        catEl.classList.add('active');
        return;
      }

      const unitEl = e.target.closest('[data-unit]');
      if (unitEl && crView.contains(unitEl)) {
        crView.querySelectorAll('[data-unit]').forEach(el => el.classList.remove('active'));
        unitEl.classList.add('active');
        return;
      }
    }
  });

  // Filtro de búsqueda en inventario
  document.addEventListener('input', e => {
    const invView = document.getElementById('view-inventario');
    if (!invView || invView.style.display === 'none') return;
    const fieldEl = e.target.closest('[data-action="search"]');
    if (fieldEl && invView.contains(fieldEl)) {
      _renderProducts(invView, _filterProducts(fieldEl.value));
    }
  });

  Router.onRoute('inventario', initInventario);
  Router.onRoute('producto/:id', ({ id }) => initDetalle(id));
  Router.onRoute('nuevo-producto', initCrearProducto);
  Router.onRoute('crear-producto', initCrearProducto);

  window.Products = Object.freeze({ initInventario, initDetalle, initCrearProducto });
})();
