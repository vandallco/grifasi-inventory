// ============================================================
// GRIFASI PERFORMANCE — Configuración global de la app
// ============================================================
// Este archivo se carga ANTES que cualquier otro script.
// Los valores se exponen en window.APP_CONFIG para que todos
// los módulos puedan leerlos sin imports (PWA sin build step).
//
// ANTES DE USAR EN PRODUCCIÓN:
//   1. Reemplazá SUPABASE_URL con la URL de tu proyecto Supabase
//      → Supabase Dashboard → Settings → API → Project URL
//   2. Reemplazá SUPABASE_ANON_KEY con la anon/public key
//      → Supabase Dashboard → Settings → API → anon (public)
//   ⚠️  Nunca uses la service_role key aquí — este archivo
//      es público y cualquiera puede leerlo en el navegador.
// ============================================================

window.APP_CONFIG = Object.freeze({

  // ── Supabase ──────────────────────────────────────────────
  // Reemplazar con los valores reales del proyecto Supabase.
  SUPABASE_URL:      'https://sgihjrxdoxuoaxpnhrcs.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNnaWhqcnhkb3h1b2F4cG5ocmNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMTkxNzksImV4cCI6MjA5NDY5NTE3OX0.f7-69p5tJnn9aUDiWGUWiUCwzBO60mxbmAl3fg47joU',

  // ── Identidad de la app ───────────────────────────────────
  APP_NAME: 'GRIFASI PERFORMANCE',
  VERSION:  '1.0.0',

  // ── Sesión ────────────────────────────────────────────────
  // Tiempo en ms de inactividad antes de volver a pedir el PIN.
  // La sesión se guarda en localStorage (sobrevive cerrar la app).
  // 43200000 = 12 horas (uso de mostrador: un login por jornada).
  PIN_TIMEOUT_MS: 43_200_000,

});
