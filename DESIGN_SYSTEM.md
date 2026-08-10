# Sistema visual del panel administrativo

Este documento es obligatorio para el dashboard y para todo modulo nuevo de `frontend-next`.
La referencia visual es el flujo de login/registro: superficies limpias, violeta-indigo como marca,
controles amplios, jerarquia clara y estados que no dependen solo del color.

## Fuente unica

- Tokens y normalizacion global: `app/styles/08-design-system.css`.
- Componentes oficiales: `components/admin-design-system.tsx`.
- Select accesible: `components/admin-select.tsx`.
- Alertas globales y confirmaciones: `components/admin-ui-provider.tsx`.

`08-design-system.css` debe permanecer como el ultimo import de estilos en `app/layout.tsx`.

## Reglas obligatorias

1. No escribir colores hexadecimales, sombras, radios ni alturas de controles en un modulo.
   Usar variables `--ds-*`.
2. Una pagina comienza con `AdminPageHeader`; el contenido se agrupa con `AdminCard`.
3. Acciones usan `AdminButton` o `AdminButtonLink`. Variantes permitidas: `primary`,
   `secondary`, `danger` y `quiet`.
4. Campos nuevos usan `AdminField`. Los select enriquecidos usan `AdminSelect`.
5. Estados en pagina usan `AdminNotice`; notificaciones temporales usan `useAdminUi().showAlert`.
6. Estados cortos usan `AdminBadge`. No crear badges locales.
7. Tablas usan `admin-table-wrap`, `admin-table` y `mobile-card-table` cuando corresponda.
8. En movil, todo control interactivo debe medir al menos 44 px y no producir scroll horizontal.
9. Todo control necesita etiqueta accesible y foco visible. Un error debe incluir texto, no solo color.
10. Se mantiene tema claro y oscuro; no asumir un fondo blanco o negro directamente.

## Ejemplo de modulo

```tsx
import {
  AdminButton,
  AdminCard,
  AdminField,
  AdminNotice,
  AdminPageHeader,
} from '@/components/admin-design-system';

export function NuevoModulo() {
  return (
    <section className="admin-page-stack">
      <AdminPageHeader
        eyebrow="Catalogo"
        title="Nuevo modulo"
        description="Descripcion breve de la tarea principal."
        actions={<AdminButton>Crear registro</AdminButton>}
      />
      <AdminNotice tone="info" title="Informacion">Mensaje accionable.</AdminNotice>
      <AdminCard title="Datos" description="Completa los campos obligatorios.">
        <AdminField label="Nombre" required>
          <input name="name" required />
        </AdminField>
      </AdminCard>
    </section>
  );
}
```

## Criterio de terminado visual

- Escritorio revisado a 1280 px.
- Movil revisado a 390 px y 320 px.
- Tema claro y oscuro revisados.
- Sin desbordamiento horizontal.
- Navegacion por teclado y foco visibles.
- `npm run lint`, pruebas unitarias y pruebas responsive sin errores nuevos.
