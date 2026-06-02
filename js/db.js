// ============================================================
// GRIFASI PERFORMANCE — Capa de acceso a datos (Supabase)
// ============================================================
// Usa @supabase/supabase-js vía ESM CDN — sin build step.
//
// Regla de claves:
//   • Lectura y escritura → cliente anon + políticas RLS.
//     El navegador NUNCA maneja el service_role key.
//
// Todos los errores de Supabase se lanzan como Error para que
// la UI los capture con try/catch.
// ============================================================

(async () => {
  const CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
  const { createClient } = await import(CDN);

  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.APP_CONFIG;

  // ── Cliente ────────────────────────────────────────────────

  const _anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // ── Helper interno ─────────────────────────────────────────

  function _assert(data, error, ctx) {
    if (error) throw new Error(`[DB:${ctx}] ${error.message}`);
    return data;
  }

  // ── Lectura ────────────────────────────────────────────────

  /**
   * Busca productos activos por texto libre contra
   * nombre, sku, marca y categoria (ILIKE).
   * Retorna array (vacío si no hay resultados).
   */
  async function buscarProducto(query) {
    const q = query?.trim();
    if (!q) return [];

    const pattern = `%${q}%`;
    const { data, error } = await _anon
      .from('productos')
      .select('id, sku, nombre, categoria, marca, stock_actual, stock_minimo, unidad, precio_venta')
      .eq('activo', true)
      .or(`nombre.ilike.${pattern},sku.ilike.${pattern},marca.ilike.${pattern},categoria.ilike.${pattern}`)
      .order('nombre')
      .limit(20);

    return _assert(data, error, 'buscarProducto');
  }

  /**
   * Busca un producto por SKU exacto.
   * Retorna el objeto producto o null si no existe.
   */
  async function buscarPorSku(sku) {
    const { data, error } = await _anon
      .from('productos')
      .select('*')
      .eq('sku', sku.trim())
      .maybeSingle();

    return _assert(data, error, 'buscarPorSku');
  }

  /**
   * Lista completa de productos con filtros opcionales.
   * @param {Object} filtros
   * @param {string} [filtros.categoria]  — filtrar por categoría exacta
   * @param {string} [filtros.busqueda]   — texto libre (mismo que buscarProducto)
   * @param {boolean} [filtros.soloActivos=true]
   */
  async function obtenerProductos(filtros = {}) {
    const { categoria, busqueda, soloActivos = true } = filtros;

    let q = _anon
      .from('productos')
      .select('id, sku, nombre, categoria, marca, descripcion, precio_costo, precio_venta, stock_actual, stock_minimo, unidad, activo');

    if (soloActivos) q = q.eq('activo', true);
    if (categoria)   q = q.eq('categoria', categoria);

    if (busqueda?.trim()) {
      const p = `%${busqueda.trim()}%`;
      q = q.or(`nombre.ilike.${p},sku.ilike.${p},marca.ilike.${p}`);
    }

    q = q.order('categoria').order('nombre');

    const { data, error } = await q;
    return _assert(data, error, 'obtenerProductos');
  }

  /**
   * Productos con stock_actual <= stock_minimo y activos.
   * Ordenados por urgencia: mayor diferencia (stock_minimo - stock_actual) primero.
   */
  async function obtenerProductosBajoMinimo() {
    // Supabase JS v2 no soporta comparación columna-a-columna en el cliente,
    // así que traemos todos los activos y filtramos en el browser.
    // Para inventarios de bicicletería (cientos de SKUs) el payload es manejable.
    const { data, error } = await _anon
      .from('productos')
      .select('id, sku, nombre, categoria, marca, stock_actual, stock_minimo, unidad')
      .eq('activo', true)
      .order('nombre');

    _assert(data, error, 'obtenerProductosBajoMinimo');

    return data
      .filter(p => p.stock_actual <= p.stock_minimo)
      .sort((a, b) => (b.stock_minimo - b.stock_actual) - (a.stock_minimo - a.stock_actual));
  }

  /**
   * Historial de movimientos de un producto, más recientes primero.
   * @param {string} producto_id  UUID
   * @param {number} [limit=20]
   */
  async function obtenerMovimientos(producto_id, limit = 20) {
    const { data, error } = await _anon
      .from('movimientos')
      .select('id, tipo, cantidad, stock_antes, stock_despues, motivo, referencia, usuario, created_at')
      .eq('producto_id', producto_id)
      .order('created_at', { ascending: false })
      .limit(limit);

    return _assert(data, error, 'obtenerMovimientos');
  }

  /**
   * Lee un valor de la tabla config por clave.
   * Retorna el string del valor o null.
   */
  async function obtenerConfig(clave) {
    const { data, error } = await _anon
      .from('config')
      .select('valor')
      .eq('clave', clave)
      .maybeSingle();

    _assert(data, error, 'obtenerConfig');
    return data?.valor ?? null;
  }

  /**
   * Estadísticas para el Dashboard:
   *   - totalProductos: total de productos activos
   *   - totalBajoMinimo: cuántos tienen stock ≤ mínimo
   *   - ultimosMovimientos: últimos 10 con nombre de producto
   */
  async function getDashboardStats() {
    const [productosRes, movimientosRes] = await Promise.all([
      _anon
        .from('productos')
        .select('id, sku, nombre, marca, unidad, stock_actual, stock_minimo', { count: 'exact' })
        .eq('activo', true),
      _anon
        .from('movimientos')
        .select('id, tipo, cantidad, stock_despues, motivo, created_at, producto_id, productos(nombre, sku)')
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    _assert(productosRes.data, productosRes.error, 'getDashboardStats:productos');
    _assert(movimientosRes.data, movimientosRes.error, 'getDashboardStats:movimientos');

    const productos = productosRes.data;
    const bajoMinimo = productos.filter(p => p.stock_actual <= p.stock_minimo);

    return {
      totalProductos:      productosRes.count ?? productos.length,
      totalBajoMinimo:     bajoMinimo.length,
      productosBajoMinimo: bajoMinimo
        .sort((a, b) => (b.stock_minimo - b.stock_actual) - (a.stock_minimo - a.stock_actual))
        .slice(0, 5),
      ultimosMovimientos: movimientosRes.data,
    };
  }

  // ── Escritura (cliente anon + RLS) ─────────────────────────

  /**
   * Llama a la RPC `registrar_movimiento` que actualiza el stock
   * y registra el movimiento de forma atómica en Postgres.
   *
   * @param {Object} params
   * @param {string} params.producto_id   UUID del producto
   * @param {string} params.tipo          'entrada' | 'salida' | 'ajuste' | 'devolucion'
   * @param {number} params.cantidad      Siempre positivo
   * @param {string} [params.motivo]      Texto libre opcional
   * @param {string} [params.referencia]  Nro. factura u otro ref.
   * @param {string} [params.usuario]     Default 'app'
   * @returns {Object} { stock_nuevo, movimiento_id }
   */
  async function registrarMovimiento({ producto_id, tipo, cantidad, motivo = null, referencia = null, usuario = 'app' }) {
    if (!producto_id) throw new Error('producto_id es requerido');
    if (!['entrada', 'salida', 'ajuste', 'devolucion'].includes(tipo)) {
      throw new Error(`Tipo inválido: ${tipo}. Usar: entrada, salida, ajuste, devolucion`);
    }
    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      throw new Error('cantidad debe ser un entero positivo');
    }

    const { data, error } = await _anon.rpc('registrar_movimiento', {
      p_producto_id: producto_id,
      p_tipo:        tipo,
      p_cantidad:    cantidad,
      p_motivo:      motivo,
      p_referencia:  referencia,
      p_usuario:     usuario,
    });

    return _assert(data, error, 'registrarMovimiento');
  }

  /**
   * Crea un producto nuevo.
   * @param {Object} datos  Campos de la tabla productos (sin id, created_at, updated_at)
   * @returns {Object} El producto creado con su id generado
   */
  async function crearProducto(datos) {
    const { sku, nombre } = datos;
    if (!sku?.trim())    throw new Error('sku es requerido');
    if (!nombre?.trim()) throw new Error('nombre es requerido');

    const { data, error } = await _anon
      .from('productos')
      .insert({ ...datos, activo: true })
      .select()
      .single();

    return _assert(data, error, 'crearProducto');
  }

  /**
   * Actualiza campos de un producto existente.
   * @param {string} id     UUID del producto
   * @param {Object} datos  Solo los campos a modificar
   * @returns {Object} El producto actualizado
   */
  async function actualizarProducto(id, datos) {
    if (!id) throw new Error('id es requerido');

    const { data, error } = await _anon
      .from('productos')
      .update(datos)
      .eq('id', id)
      .select()
      .single();

    return _assert(data, error, 'actualizarProducto');
  }

  /**
   * Actualiza el valor de una clave en la tabla config.
   * @param {string} clave  La clave a actualizar (ej: 'pin_acceso')
   * @param {string} valor  El nuevo valor
   */
  async function actualizarConfig(clave, valor) {
    if (!clave) throw new Error('clave es requerida');

    const { error } = await _anon
      .from('config')
      .update({ valor: String(valor) })
      .eq('clave', clave);

    if (error) throw new Error(`[DB:actualizarConfig] ${error.message}`);
  }

  // ── Ventas / Métricas ──────────────────────────────────────

  /**
   * Movimientos en un rango de fechas, con datos del producto (para Métricas).
   * @param {Object} p
   * @param {number|string} [p.from]  epoch ms o ISO
   * @param {number|string} [p.to]    epoch ms o ISO
   * Retorna [{ created_at, tipo, cantidad, motivo, sku, nombre }]
   */
  async function obtenerMovimientosRango({ from, to } = {}) {
    const iso = (v) => (v == null ? null : (typeof v === 'number' ? new Date(v).toISOString() : v));
    let q = _anon
      .from('movimientos')
      .select('tipo, cantidad, motivo, created_at, productos(sku, nombre, precio_venta, precio_costo)')
      .order('created_at', { ascending: false });
    const f = iso(from), t = iso(to);
    if (f) q = q.gte('created_at', f);
    if (t) q = q.lte('created_at', t);

    const { data, error } = await q;
    _assert(data, error, 'obtenerMovimientosRango');
    return (data || []).map(m => ({
      created_at: m.created_at,
      tipo:       m.tipo,
      cantidad:   m.cantidad,
      motivo:     m.motivo,
      sku:        m.productos?.sku ?? null,
      nombre:     m.productos?.nombre ?? null,
    }));
  }

  /**
   * Registra una venta (ticket) en la tabla `ventas`.
   * El descuento de stock se hace aparte vía registrarMovimiento (salida) por ítem.
   * @param {Object} p
   * @param {string} [p.ticket]
   * @param {number} p.total
   * @param {Array}  p.items   [{ sku, name, price, qty, subtotal }]
   */
  async function registrarVenta({ ticket = null, total = 0, items = [], usuario = 'app' }) {
    const { data, error } = await _anon
      .from('ventas')
      .insert({ ticket, total, items, usuario })
      .select()
      .single();
    return _assert(data, error, 'registrarVenta');
  }

  /**
   * Últimas ventas registradas (para el Historial).
   * @param {number} [limit=30]
   */
  async function obtenerVentas(limit = 30) {
    const { data, error } = await _anon
      .from('ventas')
      .select('id, ticket, total, items, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    return _assert(data, error, 'obtenerVentas');
  }

  // ── Exponer en window ──────────────────────────────────────

  window.DB = Object.freeze({
    buscarProducto,
    buscarPorSku,
    obtenerProductos,
    obtenerProductosBajoMinimo,
    obtenerMovimientos,
    registrarMovimiento,
    crearProducto,
    actualizarProducto,
    obtenerConfig,
    actualizarConfig,
    getDashboardStats,
    obtenerMovimientosRango,
    registrarVenta,
    obtenerVentas,
  });

  document.dispatchEvent(new CustomEvent('db:ready'));
})();
