// ============================================================
// Lookup de productos por código de barras
// ============================================================
// Consulta UPCitemdb (free tier: 100 lookups/día sin API key).
// Retorna un objeto compatible con data-field del form de creación,
// o null si no encuentra nada.
//
// Para más de 100 consultas/día: crear cuenta en upcitemdb.com
// y agregar la key en APP_CONFIG.UPCITEMDB_KEY.
// ============================================================

(() => {
  const API_BASE = 'https://api.upcitemdb.com/prod/trial/lookup';

  // Mapeo de categorías UPCitemdb → categorías del inventario
  const CATEGORY_MAP = [
    { keywords: ['cable', 'wire'],                    cat: 'cables'      },
    { keywords: ['tube', 'camara', 'inner'],          cat: 'camaras'     },
    { keywords: ['tire', 'tyre', 'cubierta'],         cat: 'cubiertas'   },
    { keywords: ['brake', 'freno'],                   cat: 'frenos'      },
    { keywords: ['chain', 'cadena'],                  cat: 'cadenas'     },
    { keywords: ['tool', 'herramienta', 'wrench'],    cat: 'herramientas'},
    { keywords: ['helmet', 'glove', 'light', 'lock'], cat: 'accesorios'  },
  ];

  function _mapCategory(apiCategory = '', title = '') {
    const haystack = `${apiCategory} ${title}`.toLowerCase();
    for (const { keywords, cat } of CATEGORY_MAP) {
      if (keywords.some(k => haystack.includes(k))) return cat;
    }
    return 'otros';
  }

  function _mapItem(item, ean) {
    if (!item) return null;
    return {
      sku:         ean,
      nombre:      item.title       ?? '',
      marca:       item.brand       ?? '',
      descripcion: item.description ?? (item.model ?? ''),
      categoria:   _mapCategory(item.category, item.title),
      imagen:      item.images?.[0] ?? null,
    };
  }

  /**
   * Busca un producto por EAN/UPC en UPCitemdb.
   * @param {string} ean  Código de barras escaneado
   * @returns {Object|null} Datos del producto o null si no se encontró
   */
  async function lookupBarcode(ean) {
    if (!ean?.trim()) return null;

    const key = window.APP_CONFIG?.UPCITEMDB_KEY;
    const url = key
      ? `https://api.upcitemdb.com/prod/v1/lookup?upc=${encodeURIComponent(ean)}`
      : `${API_BASE}?upc=${encodeURIComponent(ean)}`;

    const headers = { 'Accept': 'application/json' };
    if (key) {
      headers['user_key'] = key;
      headers['key_type'] = '3scale';
    }

    const res = await fetch(url, { headers });

    // 404 o sin resultados → producto no en base de datos
    if (res.status === 404) return null;
    if (!res.ok) {
      // 429 = rate limit del trial
      if (res.status === 429) {
        console.warn('[Lookup] Límite diario de UPCitemdb alcanzado (100/día en trial).');
      }
      return null;
    }

    const json = await res.json();
    if (!json.items?.length) return null;

    return _mapItem(json.items[0], ean);
  }

  window.Lookup = Object.freeze({ lookupBarcode });
})();
