// ============================================================
// GRIFASI PERFORMANCE — Autenticación por PIN
// ============================================================
// Flujo:
//   1. validatePin(pin) → consulta Supabase config → guarda
//      sesión en localStorage si el PIN es correcto.
//   2. Auto-lock: ticker cada 60s revisa inactividad y hace
//      logout si se superó PIN_TIMEOUT_MS.
//   3. Cualquier interacción del usuario resetea el timer.
// ============================================================

(() => {
  const SESSION_KEY = 'grifasi_session';

  // ── Helpers internos ───────────────────────────────────────

  function _getConfig() {
    const cfg = window.APP_CONFIG;
    if (!cfg?.SUPABASE_URL || !cfg?.SUPABASE_ANON_KEY) {
      throw new Error('APP_CONFIG no está definido. Cargá config.js antes de auth.js');
    }
    return cfg;
  }

  function _supabaseHeaders(key) {
    return {
      'Content-Type':  'application/json',
      'apikey':         key,
      'Authorization': `Bearer ${key}`,
    };
  }

  async function _fetchConfigRow(clave) {
    const { SUPABASE_URL, SUPABASE_ANON_KEY } = _getConfig();
    const url = `${SUPABASE_URL}/rest/v1/config?clave=eq.${encodeURIComponent(clave)}&select=valor&limit=1`;

    const res = await fetch(url, { headers: _supabaseHeaders(SUPABASE_ANON_KEY) });
    if (!res.ok) throw new Error(`Error al consultar config (${res.status})`);

    const rows = await res.json();
    if (!rows.length) throw new Error(`Clave '${clave}' no encontrada en config`);
    return rows[0].valor;
  }

  // ── Auto-lock ──────────────────────────────────────────────

  let _lockInterval = null;

  function _startLockTicker() {
    if (_lockInterval) return;
    const { PIN_TIMEOUT_MS } = _getConfig();

    _lockInterval = setInterval(() => {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return;

      try {
        const { timestamp } = JSON.parse(raw);
        if (Date.now() - timestamp > PIN_TIMEOUT_MS) {
          logout();
        }
      } catch {
        logout();
      }
    }, 60_000);
  }

  function _stopLockTicker() {
    clearInterval(_lockInterval);
    _lockInterval = null;
  }

  function _bindActivityEvents() {
    ['click', 'keydown', 'touchstart'].forEach(evt =>
      document.addEventListener(evt, resetTimer, { passive: true })
    );
  }

  function _unbindActivityEvents() {
    ['click', 'keydown', 'touchstart'].forEach(evt =>
      document.removeEventListener(evt, resetTimer)
    );
  }

  // ── API pública ────────────────────────────────────────────

  /**
   * Verifica el PIN contra Supabase y, si es correcto, persiste
   * la sesión. Las escrituras usan la clave anon + políticas RLS;
   * el navegador nunca maneja el service_role key.
   * Resuelve con true/false. Lanza Error solo si hay falla de red/config.
   */
  async function validatePin(pin) {
    const pinCorrecto = await _fetchConfigRow('pin_acceso');

    if (String(pin) !== String(pinCorrecto)) return false;

    localStorage.setItem(SESSION_KEY, JSON.stringify({
      autenticado: true,
      timestamp: Date.now(),
    }));

    _startLockTicker();
    _bindActivityEvents();
    return true;
  }

  /** Devuelve true si existe una sesión activa en localStorage. */
  function isAutenticado() {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return false;
    try {
      return JSON.parse(raw)?.autenticado === true;
    } catch {
      return false;
    }
  }


  /** Actualiza el timestamp de actividad para reiniciar el timer. */
  function resetTimer() {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return;
    try {
      const session = JSON.parse(raw);
      session.timestamp = Date.now();
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {
      // sesión corrupta — dejar que el ticker la limpie
    }
  }

  /** Cierra la sesión: limpia localStorage, detiene el ticker y redirige al login. */
  function logout() {
    localStorage.removeItem(SESSION_KEY);
    _stopLockTicker();
    _unbindActivityEvents();
    // Limpiar la UI del login y navegar a la ruta login (el guard del router
    // la mantiene porque ya no hay sesión).
    document.dispatchEvent(new CustomEvent('auth:logout'));
    if (window.Router?.navigate) {
      window.Router.navigate('login');
    } else {
      window.location.hash = 'login';
    }
  }

  // Retomar ticker si la página se recarga y ya hay sesión válida
  if (isAutenticado()) {
    _startLockTicker();
    _bindActivityEvents();
  }

  // Exponer en window para que los demás módulos accedan sin imports
  window.Auth = Object.freeze({ validatePin, isAutenticado, resetTimer, logout });
})();
