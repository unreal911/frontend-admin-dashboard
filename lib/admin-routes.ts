export type AdminRouteGroup =
  | 'General'
  | 'Ventas'
  | 'Catalogo'
  | 'Inventario'
  | 'Facturacion'
  | 'Accesos'
  | 'Sistema';

export interface AdminRouteItem {
  slug: string;
  label: string;
  group: AdminRouteGroup;
  permission?: string;
  description: string;
}

export const ADMIN_ROUTE_GROUP_ORDER: AdminRouteGroup[] = [
  'General',
  'Ventas',
  'Catalogo',
  'Inventario',
  'Facturacion',
  'Accesos',
  'Sistema',
];

export const ADMIN_ROUTE_GROUP_LABELS: Record<AdminRouteGroup, string> = {
  General: 'Inicio',
  Ventas: 'Ventas y atencion',
  Catalogo: 'Catalogo',
  Inventario: 'Inventario y tiendas',
  Facturacion: 'Facturacion electronica',
  Accesos: 'Equipo y accesos',
  Sistema: 'Administracion',
};

export const ADMIN_ROUTE_ITEMS: AdminRouteItem[] = [
  { slug: 'dashboard', label: 'Dashboard', group: 'General', permission: 'dashboard.view', description: 'Resumen general del sistema.' },
  { slug: 'reports', label: 'Reportes', group: 'General', permission: 'reports.view', description: 'Constructor de reportes personalizados y exportacion a Excel.' },

  { slug: 'product', label: 'Productos', group: 'Catalogo', permission: 'products.view', description: 'Administracion de productos y variantes.' },
  { slug: 'category', label: 'Categorias', group: 'Catalogo', permission: 'categories.manage', description: 'Gestion de categorias.' },
  { slug: 'color', label: 'Colores', group: 'Catalogo', permission: 'colors.manage', description: 'Gestion de colores.' },
  { slug: 'size', label: 'Tallas', group: 'Catalogo', permission: 'sizes.manage', description: 'Gestion de tallas.' },

  { slug: 'inventory', label: 'Inventario', group: 'Inventario', permission: 'inventory.view', description: 'Vista de inventario general.' },
  { slug: 'inventory/movements', label: 'Movimientos', group: 'Inventario', permission: 'inventory.view', description: 'Movimientos de inventario.' },
  { slug: 'inventory/traceability', label: 'Trazabilidad', group: 'Inventario', permission: 'inventory.view', description: 'Trazabilidad de lotes y stock.' },
  { slug: 'transfers', label: 'Transferencias', group: 'Inventario', permission: 'transfers.view', description: 'Transferencias entre tiendas/almacenes.' },
  { slug: 'stores', label: 'Tiendas', group: 'Inventario', permission: 'stores.view', description: 'Gestion de tiendas y almacenes.' },

  { slug: 'orders/pos', label: 'Punto de venta', group: 'Ventas', permission: 'pos.view', description: 'Punto de venta para creacion de pedidos.' },
  { slug: 'orders/list', label: 'Pedidos', group: 'Ventas', permission: 'orders.view', description: 'Listado de pedidos.' },
  { slug: 'customers', label: 'Clientes', group: 'Ventas', permission: 'customers.view', description: 'Registro y busqueda de clientes.' },
  { slug: 'orders/picking', label: 'Picking y despacho', group: 'Ventas', permission: 'picking.view', description: 'Tablero de picking.' },

  { slug: 'sunat/comprobantes', label: 'Comprobantes', group: 'Facturacion', permission: 'sunat.documents.view', description: 'Comprobantes emitidos: notas de credito/debito y anulaciones.' },
  { slug: 'sunat', label: 'Gestion SUNAT', group: 'Facturacion', permission: 'sunat.documents.view', description: 'Facturacion electronica: declaracion de boletas y comprobantes.' },

  { slug: 'users', label: 'Usuarios', group: 'Accesos', permission: 'users.view', description: 'Gestion de usuarios.' },
  { slug: 'invitations', label: 'Invitaciones', group: 'Accesos', permission: 'users.create', description: 'Invita colaboradores de forma segura.' },
  { slug: 'roles', label: 'Roles', group: 'Accesos', permission: 'roles.view', description: 'Gestion de roles y permisos.' },

  { slug: 'empresa', label: 'Empresa y plan', group: 'Sistema', permission: 'settings.manage', description: 'Perfil legal, trial, cuotas y activacion.' },
  { slug: 'settings', label: 'Configuracion general', group: 'Sistema', permission: 'settings.manage', description: 'Parametros globales del sistema.' },
  { slug: 'payment-methods', label: 'Metodos de pago', group: 'Sistema', permission: 'payment_methods.manage', description: 'Configuracion de medios de pago.' },
  { slug: 'sunat/configuracion', label: 'Emisor SUNAT', group: 'Sistema', permission: 'sunat.config', description: 'Datos del emisor, credenciales y certificado para facturacion electronica.' },
  { slug: 'audit-logs', label: 'Auditoria', group: 'Sistema', permission: 'settings.manage', description: 'Bitacora de auditoria.' },
  { slug: 'user-activities', label: 'Actividades', group: 'Sistema', permission: 'settings.manage', description: 'Actividad de usuarios.' },
];

export function normalizeAdminSlug(slugParts: string[] | undefined): string {
  return (slugParts || []).join('/').trim();
}

export function buildAdminPath(slug: string): string {
  return `/admin/${slug}`.replace(/\/+/g, '/');
}

export function resolveAdminRoute(slugParts: string[] | undefined): AdminRouteItem | null {
  const slug = normalizeAdminSlug(slugParts);
  if (!slug) {
    return ADMIN_ROUTE_ITEMS.find((item) => item.slug === 'dashboard') || null;
  }
  return ADMIN_ROUTE_ITEMS.find((item) => item.slug === slug) || null;
}

export function listAdminRoutesByGroup(group: AdminRouteGroup): AdminRouteItem[] {
  return ADMIN_ROUTE_ITEMS.filter((item) => item.group === group);
}
