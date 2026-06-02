// ============================================================
// GRIFASI PERFORMANCE — Escáner de código de barras
// ============================================================
// Flujo completo al detectar un código:
//
//   1. Pausa + beep + vibración
//   2. DB.buscarPorSku(ean)
//      → encontrado  → dispatch 'scanner:found'     (movements.js lo maneja)
//      → no encontrado → paso 3
//   3. Spinner "Buscando producto en línea..." sobre el escáner
//   4. Lookup.lookupBarcode(ean) con timeout visual de 4 s
//      → encontrado  → dispatch 'scanner:preview'   (products.js lo maneja)
//      → no encontrado → dispatch 'scanner:not-found'
//   5. Al recibir 'preview:confirmed' { datos } →
//        DB.crearProducto(datos) → toast → reanudar
//
// Eventos que dispara:
//   'scanner:found'        detail: { producto }
//   'scanner:preview'      detail: { sku, lookupData }
//   'scanner:not-found'    detail: { sku }
//   'scanner:camera-error' detail: { mensaje }
//
// Eventos que escucha:
//   'modal:closed'         → reanuda scanner
//   'preview:confirmed'    → crea producto, toast, reanuda
// ============================================================

(() => {
  const SCANNER_DIV_ID  = 'scanner-container';
  const LOOKUP_TIMEOUT  = 4000;   // ms antes de declarar "no encontrado" en lookup

  // ── Config de cámara ───────────────────────────────────────

  const CAMERA_CONFIG = {
    fps: 10,
    qrbox: { width: 280, height: 180 },
    aspectRatio: 1.7778,
    supportedScanTypes: [],
    experimentalFeatures: { useBarCodeDetectorIfSupported: true },
  };

  // ── Estado interno ─────────────────────────────────────────

  let _scanner  = null;
  let _running  = false;
  let _paused   = false;
  let _audioCtx = null;
  let _lastSku  = null;

  // ── Beep ───────────────────────────────────────────────────

  function _beep() {
    try {
      if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc  = _audioCtx.createOscillator();
      const gain = _audioCtx.createGain();
      osc.connect(gain);
      gain.connect(_audioCtx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1046, _audioCtx.currentTime);
      gain.gain.setValueAtTime(0.4, _audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, _audioCtx.currentTime + 0.15);
      osc.start(_audioCtx.currentTime);
      osc.stop(_audioCtx.currentTime + 0.15);
    } catch { /* autoplay policy — no es crítico */ }
  }

  function _feedback() {
    _beep();
    if (navigator.vibrate) navigator.vibrate(100);
  }

  // ── Spinner overlay ────────────────────────────────────────

  let _spinner = null;

  function _showSpinner(sku) {
    const container = document.getElementById(SCANNER_DIV_ID);
    if (!container) return;

    _spinner = document.createElement('div');
    _spinner.id = 'scanner-lookup-overlay';
    _spinner.innerHTML = `
      <div class="scanner-lookup-box">
        <div class="scanner-lookup-spinner"></div>
        <p class="scanner-lookup-text">Buscando producto en línea...</p>
        <p class="scanner-lookup-sku">${_escapeHtml(sku)}</p>
        <div class="scanner-lookup-bar">
          <div class="scanner-lookup-bar-fill"></div>
        </div>
      </div>
    `;

    Object.assign(_spinner.style, {
      position:       'absolute',
      inset:          '0',
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'center',
      background:     'rgba(15,15,26,0.82)',
      zIndex:         '10',
      borderRadius:   'inherit',
    });

    // El contenedor del scanner necesita position:relative para que el overlay
    // quede correctamente posicionado sobre el video
    container.style.position = 'relative';
    container.appendChild(_spinner);

    // Animar la barra de progreso hasta LOOKUP_TIMEOUT
    const fill = _spinner.querySelector('.scanner-lookup-bar-fill');
    if (fill) {
      fill.style.transition = `width ${LOOKUP_TIMEOUT}ms linear`;
      // Forzar reflow antes de iniciar la transición
      fill.getBoundingClientRect();
      fill.style.width = '100%';
    }
  }

  function _hideSpinner() {
    _spinner?.remove();
    _spinner = null;
  }

  // ── Toast ──────────────────────────────────────────────────

  function _toast(mensaje, tipo = 'success') {
    window.Toast?.show(mensaje, tipo);
  }

  // ── Lookup con timeout visual ──────────────────────────────

  function _withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise(resolve => setTimeout(() => resolve(null), ms)),
    ]);
  }

  // ── Flujo principal de detección ───────────────────────────

  async function _onBarcodeDetected(ean) {
    if (_paused || ean === _lastSku) return;

    _lastSku = ean;
    pauseScanner();
    _feedback();

    // ── Paso 2: buscar en Supabase ─────────────────────────

    let producto = null;
    try {
      producto = await window.DB.buscarPorSku(ean);
    } catch (err) {
      console.error('[Scanner] Error en buscarPorSku:', err);
      _toast('Error al consultar inventario', 'error');
      setTimeout(resumeScanner, 2000);
      return;
    }

    if (producto) {
      document.dispatchEvent(new CustomEvent('scanner:found', {
        detail: { producto }, bubbles: true,
      }));
      return;   // movements.js se encarga; scanner espera 'modal:closed'
    }

    // ── Paso 3: spinner ────────────────────────────────────

    _showSpinner(ean);

    // Watchdog defensivo: si el lookup nunca resuelve, igual cerramos el flujo.
    let dispatched = false;
    const dispatch = (type) => {
      if (dispatched) return;
      dispatched = true;
      _hideSpinner();
      document.dispatchEvent(new CustomEvent(type, {
        detail: type === 'scanner:preview' ? { sku: ean, lookupData } : { sku: ean },
        bubbles: true,
      }));
    };
    const watchdog = setTimeout(() => {
      if (!dispatched) {
        console.warn('[Scanner] Watchdog forzando not-found');
        dispatch('scanner:not-found');
      }
    }, LOOKUP_TIMEOUT + 1500);

    // ── Paso 4: lookup externo con timeout ─────────────────

    let lookupData = null;
    try {
      const lookupPromise = window.Lookup?.lookupBarcode
        ? window.Lookup.lookupBarcode(ean)
        : Promise.resolve(null);
      lookupData = await _withTimeout(lookupPromise, LOOKUP_TIMEOUT);
    } catch (err) {
      console.warn('[Scanner] Lookup falló:', err);
      lookupData = null;
    }

    clearTimeout(watchdog);
    dispatch(lookupData ? 'scanner:preview' : 'scanner:not-found');
  }

  function _onScanError() { /* frames sin código — ignorar */ }

  // ── Paso 5: confirmar preview → crear producto ─────────────

  document.addEventListener('preview:confirmed', async (e) => {
    const { datos } = e.detail ?? {};
    if (!datos) return;

    try {
      const producto = await window.DB.crearProducto(datos);
      _toast(`✓ Producto creado: ${producto.nombre}`);
      document.dispatchEvent(new CustomEvent('inventario:updated', { bubbles: true }));
    } catch (err) {
      console.error('[Scanner] Error al crear producto:', err);
      _toast('Error al guardar el producto', 'error');
    }

    resumeScanner();
  });

  // ── Reanudar al cerrar cualquier modal ─────────────────────

  document.addEventListener('modal:closed', () => {
    _hideSpinner();
    if (_running) resumeScanner();
  });

  // ── Entrada manual de SKU ──────────────────────────────────
  // Botón [data-action="manual"] dentro de #view-escaner: pide el SKU
  // por prompt y ejecuta el mismo flujo que una lectura de cámara.
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="manual"]');
    if (!btn) return;
    const view = document.getElementById('view-escaner');
    if (!view || !view.contains(btn)) return;

    const sku = window.prompt('Ingresá el SKU manualmente:');
    if (!sku || !sku.trim()) return;
    _lastSku = null;
    _onBarcodeDetected(sku.trim());
  });

  // ── Lector USB / Bluetooth (HID keyboard) ──────────────────
  // Los lectores físicos emiten caracteres muy rápido y terminan con Enter.
  // Solo escuchamos cuando la pantalla de escáner está activa y el foco no
  // está en un input, para no interferir con escritura normal.
  let _hidBuffer = '';
  let _hidLastTs = 0;
  const HID_MAX_GAP_MS = 60;
  const HID_MIN_LEN = 4;

  document.addEventListener('keydown', (e) => {
    const view = document.getElementById('view-escaner');
    if (!view || view.style.display === 'none') return;
    const tgt = e.target;
    if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return;

    const now = Date.now();
    if (now - _hidLastTs > HID_MAX_GAP_MS) _hidBuffer = ''; // gap → empezar nuevo
    _hidLastTs = now;

    if (e.key === 'Enter') {
      if (_hidBuffer.length >= HID_MIN_LEN) {
        const sku = _hidBuffer.trim();
        _hidBuffer = '';
        _lastSku = null;
        _onBarcodeDetected(sku);
        e.preventDefault();
      } else {
        _hidBuffer = '';
      }
      return;
    }
    if (e.key.length === 1) _hidBuffer += e.key;
  });

  // ── API pública ────────────────────────────────────────────

  async function initScanner() {
    if (_running) return;

    const container = document.getElementById(SCANNER_DIV_ID);
    if (!container) {
      console.error(`[Scanner] No se encontró #${SCANNER_DIV_ID}`);
      return;
    }

    container.innerHTML = '';
    _lastSku = null;

    try {
      _scanner = new Html5Qrcode(SCANNER_DIV_ID);
      await _scanner.start(
        { facingMode: 'environment' },
        CAMERA_CONFIG,
        _onBarcodeDetected,
        _onScanError,
      );
      _running = true;
      _paused  = false;
    } catch (err) {
      console.error('[Scanner] No se pudo iniciar la cámara:', err);
      document.dispatchEvent(new CustomEvent('scanner:camera-error', {
        detail: { mensaje: _friendlyError(err) }, bubbles: true,
      }));
    }
  }

  async function stopScanner() {
    _hideSpinner();
    if (!_scanner || !_running) return;
    try {
      await _scanner.stop();
    } catch { /* ignorar */ } finally {
      _running = false;
      _paused  = false;
      _lastSku = null;
    }
  }

  function pauseScanner() {
    if (!_scanner || !_running || _paused) return;
    try { _scanner.pause(true); _paused = true; } catch { /* ignorar */ }
  }

  function resumeScanner() {
    if (!_scanner || !_running || !_paused) return;
    try {
      _scanner.resume();
      _paused  = false;
      _lastSku = null;
    } catch {
      stopScanner().then(initScanner);
    }
  }

  // ── Helpers ────────────────────────────────────────────────

  function _friendlyError(err) {
    const msg = err?.message ?? String(err);
    if (msg.includes('Permission'))       return 'Sin permiso para usar la cámara. Habilitalo en Configuración.';
    if (msg.includes('NotFound'))         return 'No se encontró ninguna cámara en este dispositivo.';
    if (msg.includes('NotReadableError')) return 'La cámara está siendo usada por otra app.';
    return 'No se pudo acceder a la cámara. Intentá recargar la página.';
  }

  function _escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Exponer ────────────────────────────────────────────────

  window.Scanner = Object.freeze({ initScanner, stopScanner, pauseScanner, resumeScanner });

  // ── Conexión con el Router ─────────────────────────────────
  // Arranca la cámara al entrar a #escaner y la libera al salir
  // (ahorra batería y evita el guard de _running al volver).
  if (window.Router) {
    Router.onRoute('escaner', () => { initScanner(); });
    ['login', 'dashboard', 'inventario', 'bajo-stock', 'config',
     'ventas', 'metricas', 'producto/:id', 'nuevo-producto'].forEach((r) =>
      Router.onRoute(r, () => { stopScanner(); })
    );
  }
})();
