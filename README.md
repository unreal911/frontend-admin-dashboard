# frontend-next

Nuevo proyecto Next.js creado para migrar el panel administrativo Angular por fases.

## Objetivo de esta fase

- Crear proyecto independiente en Next.js.
- Agregar estructura de rutas para `login` y `admin` equivalente al Angular.
- Dejar rutas admin mapeadas para migrar modulo por modulo sin perder el orden.

## Rutas iniciales migradas

- `/` Home de migracion
- `/login` acceso inicial
- `/admin` redireccion a dashboard
- `/admin/dashboard` dashboard inicial en Next.js
- `/admin/[...slug]` rutas de admin (placeholder funcional para migracion incremental)

## Avance actual de admin

- Sidebar agrupado por modulos (General, Catalogo, Inventario, Pedidos, Accesos, Sistema).
- Topbar admin con breadcrumb contextual del modulo activo.
- Dashboard inicial con enlaces por modulo para acelerar la migracion incremental.
- Login admin con sesion en cookie via `/api/admin/session` (proxy a backend auth).
- Modulo `Categorias` migrado (`/admin/category`) con listado y acciones basicas.
- Modulo `Colores` migrado (`/admin/color`) con listado, muestra de color y acciones CRUD basicas.
- Modulo `Tallas` migrado (`/admin/size`) con listado y acciones CRUD basicas.
- Modulo `Metodos de pago` migrado (`/admin/payment-methods`) con listado y acciones CRUD basicas.
- Modulo `Productos` migrado (`/admin/product`) con modal de creacion/edicion, variantes e imagenes.
- Modulo `Tiendas` migrado (`/admin/stores`) con filtros, tabla responsive y modal de alta/edicion.
- Modulo `Usuarios` migrado (`/admin/users`) con listado, filtros, modal crear/editar y eliminacion.
- Modulo `Roles` migrado (`/admin/roles`) con filtros, modal de rol y asignacion de permisos por modulo.
- Modulo `Configuracion` migrado (`/admin/settings`) con toggles y guardado de reglas operativas.
- Modulo `Auditoria` migrado (`/admin/audit-logs`) con filtros, detalle de payload y paginacion.
- Modulo `Actividades` migrado (`/admin/user-activities`) con filtros, contexto y paginacion.
- Modulo `Inventario` migrado (`/admin/inventory`) con filtros avanzados, resumen y registro de movimientos.
- Modulo `Movimientos` migrado (`/admin/inventory/movements`) con historial filtrable por tipo e inventario.
- Modulo `Trazabilidad` migrado (`/admin/inventory/traceability`) con seguimiento de reservas por pedido.
- Modulo `Transferencias` migrado (`/admin/transfers`) con creacion, recepcion y detalle completo.
- Modulo `Pedidos` migrado (`/admin/orders/list`) con filtros, chips, estados rapidos y cambio de estado.
- Modulo `Detalle de pedido` migrado (`/admin/orders/[id]`) con resumen, items, reservas y cambio de estado.
- Detalle de pedido mejorado con flujo operativo: iniciar/finalizar picking, ajuste de items por fila, entrega (`READY`) y bloque `RETURN_PENDING` (aceptar/delegar/confirmar devolucion).
- Modulo `Picking` migrado (`/admin/orders/picking`) con tablero, progreso y actualizacion por item.
- Modulo `POS` migrado (`/admin/orders/pos`) con catalogo, selector de variante, carrito y cobro.
- Sistema UI base del admin migrado: `Alert`, `ConfirmModal` y modal formulario reutilizable.
- Capa de sesion/permisos migrada en layout admin: provider de `auth/me`, filtrado de sidebar por permisos y bloqueo visual de rutas sin permiso.

## Equivalencia base con Angular (`frontend/src/app/app.routes.ts`)

- `login` -> `/login`
- `admin` -> `/admin/*`

## Variables de entorno

Copiar `.env.example` a `.env.local`:

```bash
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_ADMIN_API_URL=http://localhost:3001/api
ADMIN_API_URL=http://localhost:3001/api
```

`frontend-next` corre en `http://localhost:3000` y usa `backend-refactorizado` como API en
`http://localhost:3001/api`. Esto evita que el proxy de Next se llame a si mismo.

## Comandos

Desde `backend-refactorizado`:

```bash
npm install
npm run dev
```

Desde `frontend-next`:

```bash
npm install
npm run dev
npm run build
npm run start
```

## Proxima fase recomendada

1. Probar flujo real con `backend-refactorizado`: login, POS, pedidos, picking y devolucion.
2. Completar paridad fina visual/UX del POS y detalle de pedidos contra Angular.
3. Reforzar pruebas E2E de modulos de pedidos (listado, picking, POS) e inventario.
