# GRIFASI Inventory

Sistema de gestión de inventario para GRIFASI PERFORMANCE, bicicletería ubicada en Salta, Argentina. PWA instalable en móvil y escritorio, funciona sin conexión gracias a Service Workers.

## Funcionalidades

- **Dashboard** — resumen de stock crítico, movimientos recientes y alertas de reposición
- **Inventario** — listado completo de productos con búsqueda y filtros
- **Escáner** — lectura de códigos QR y de barras desde la cámara del dispositivo
- **Movimientos / Ventas** — registro de entradas y salidas de stock
- **Stock bajo** — panel dedicado a productos por debajo del mínimo configurado
- **Métricas** — estadísticas de rotación, ventas y tendencias
- **Configuración** — parámetros del negocio, umbrales de stock, usuarios
- **Autenticación por PIN** — acceso protegido sin necesidad de servidor de auth

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | HTML + CSS + JavaScript vanilla |
| Almacenamiento | IndexedDB (local, sin backend) |
| PWA | Service Worker + Web App Manifest |
| Escáner | html5-qrcode |
| Tipografía | Geist + JetBrains Mono |

## Estructura

```
grifasi-inventory/
├── index.html          # Entry point + SPA shell
├── manifest.json       # PWA manifest (íconos, nombre, colores)
├── sw.js               # Service Worker (cache offline)
├── css/
│   ├── dashboard.css
│   ├── inventory.css
│   ├── scanner.css
│   ├── ventas.css
│   ├── metrics.css
│   └── ...             # un archivo CSS por vista
├── js/
│   ├── db.js           # Capa de datos — IndexedDB
│   ├── router.js       # SPA router client-side
│   ├── auth.js         # Login por PIN
│   ├── dashboard.js    # Vista principal con alertas
│   ├── products.js     # CRUD de productos
│   ├── scanner.js      # Lector de códigos
│   ├── ventas.js       # Registro de movimientos
│   ├── lowstock.js     # Alertas de stock bajo
│   ├── metrics.js      # Estadísticas y gráficos
│   └── settings.js     # Configuración
└── lib/
    └── html5-qrcode.min.js
```

## Instalación

Por ser una PWA puramente client-side, no requiere build ni servidor:

```bash
# Opción 1 — servidor local para desarrollo
npx serve .

# Opción 2 — extensión Live Server en VS Code
# Abrir index.html con Live Server
```

Para instalar como app nativa: abrir en Chrome/Edge y usar el ícono de instalación en la barra de direcciones.

## Uso offline

Los datos se almacenan 100% en IndexedDB del navegador. La app funciona sin conexión a internet una vez cargada por primera vez. El Service Worker cachea todos los assets estáticos.
