'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useState } from 'react';

type ManualTopic = {
  id: string;
  number: string;
  category: string;
  title: string;
  summary: string;
  keywords: string[];
  steps: string[];
  tip?: string;
  image?: string;
  imageAlt?: string;
  action?: { href: string; label: string };
};

const TOPICS: ManualTopic[] = [
  {
    id: 'primer-ingreso',
    number: '01',
    category: 'Empieza aquí',
    title: 'Primer ingreso y recorrido de la pantalla',
    summary: 'Aprende a entrar, reconocer el menú y saber dónde comenzar cuando tu cuenta acaba de ser creada.',
    keywords: ['inicio', 'login', 'ingresar', 'cuenta', 'correo', 'contrasena', 'contraseña', 'menu', 'dashboard', 'primeros pasos'],
    steps: [
      'Abre el enlace del sistema e ingresa el correo y la contraseña que registraste.',
      'Al entrar verás el Dashboard. Es la pantalla de inicio con ventas, pedidos, stock y tareas pendientes.',
      'Usa el menú izquierdo para cambiar de sección. En celular, toca el botón de menú de la parte superior.',
      'En la barra superior puedes ver la empresa activa, abrir las alertas, cambiar el tema o cerrar sesión.',
      'Si administras más de una empresa, confirma siempre cuál está activa antes de registrar información.',
    ],
    tip: 'Nunca compartas tu contraseña. Cada colaborador debe tener su propio usuario e invitación.',
    image: '/manual/inicio-dashboard.png',
    imageAlt: 'Dashboard y menú principal del sistema administrativo',
    action: { href: '/admin/dashboard', label: 'Ir al Dashboard' },
  },
  {
    id: 'ruta-inicial',
    number: '02',
    category: 'Empieza aquí',
    title: 'Configura tu empresa en el orden correcto',
    summary: 'Esta ruta evita errores: primero prepara la empresa y después registra productos, stock y ventas.',
    keywords: ['configurar', 'empresa', 'tienda', 'almacen', 'método de pago', 'metodo de pago', 'categoria', 'inicio rapido'],
    steps: [
      'En Empresa y plan completa el RUC, razón social, dirección, correo y teléfono.',
      'En Tiendas crea al menos una tienda o almacén donde guardarás el stock.',
      'En Métodos de pago registra efectivo, transferencia, Yape, Plin u otros medios que aceptarás.',
      'En Categorías, Colores y Tallas crea las opciones que utilizarán tus productos.',
      'Crea tu primer producto, genera sus variantes y luego registra el stock inicial.',
      'Haz una venta de prueba en Punto de venta para confirmar que todo quedó listo.',
    ],
    tip: 'No empieces por el Punto de venta: primero necesitas una tienda, productos con precio y stock disponible.',
    action: { href: '/admin/empresa', label: 'Empezar la configuración' },
  },
  {
    id: 'empresa-plan',
    number: '03',
    category: 'Cuenta y suscripción',
    title: 'Trial, elección de plan y pago manual',
    summary: 'Durante la prueba puedes elegir un plan y subir tu comprobante. La activación la realiza el equipo después de validar el pago.',
    keywords: ['trial', 'prueba', 'plan', 'suscripcion', 'suscripción', 'pago', 'comprobante', 'voucher', 'transferencia', 'yape', 'plin', 'revision', 'revisión', 'activacion'],
    steps: [
      'Abre Empresa y plan y revisa cuántos días quedan de tu prueba gratuita.',
      'Compara los límites de productos, usuarios, tiendas y ventas de cada plan.',
      'Selecciona el plan y decide si pagarás mensual o anualmente.',
      'Transfiere exactamente el monto mostrado a la cuenta o medio indicado.',
      'Escribe el número de operación, la fecha y sube una imagen o PDF legible del comprobante.',
      'Pulsa Enviar pago para validación. La alerta cambiará a “Tu pago está en revisión”.',
      'Cuando el equipo lo apruebe verás “Pago realizado” y tu plan quedará activo.',
    ],
    tip: 'No vuelvas a enviar el mismo pago mientras esté en revisión. Puedes seguir su estado en Solicitudes recientes y en la campana de alertas.',
    image: '/manual/empresa-plan.png',
    imageAlt: 'Pantalla Empresa y plan con planes, instrucciones y carga de comprobante',
    action: { href: '/admin/empresa', label: 'Ver Empresa y plan' },
  },
  {
    id: 'productos',
    number: '04',
    category: 'Catálogo',
    title: 'Crea tu primer producto y sus variantes',
    summary: 'Registra el producto que vendes, sus combinaciones, imágenes y precios sin saltarte ningún paso.',
    keywords: ['producto', 'catalogo', 'catálogo', 'crear', 'sku', 'codigo', 'código', 'variante', 'color', 'talla', 'precio', 'imagen', 'igv'],
    steps: [
      'Crea primero las categorías, colores y tallas que vas a utilizar.',
      'En Productos pulsa Crear producto y escribe un nombre claro, categoría, afectación de IGV y descripción.',
      'En Variantes elige los colores y tallas. El sistema creará sus combinaciones.',
      'Revisa o asigna un SKU único a cada variante para poder buscarla y controlar su stock.',
      'Sube imágenes nítidas. Usa una foto principal y, si hace falta, una imagen por variante.',
      'Define el precio de venta y guarda. Después registra existencias desde Inventario.',
    ],
    tip: 'Un producto es el modelo general; una variante es una combinación concreta, por ejemplo “Polo clásico / Azul / M”.',
    image: '/manual/producto-crear.png',
    imageAlt: 'Formulario actual para crear un producto por pasos',
    action: { href: '/admin/product/create', label: 'Crear un producto' },
  },
  {
    id: 'inventario',
    number: '05',
    category: 'Inventario',
    title: 'Registra stock y controla existencias',
    summary: 'Aprende qué significa stock disponible, reservado y crítico, y cómo hacer un ingreso o ajuste.',
    keywords: ['inventario', 'stock', 'existencia', 'ingreso', 'salida', 'ajuste', 'movimiento', 'almacen', 'almacén', 'critico', 'crítico', 'reservado'],
    steps: [
      'Entra a Inventario y elige la tienda o almacén que quieres revisar.',
      'Busca el producto por nombre o SKU y confirma la variante correcta.',
      'Pulsa Nuevo ingreso manual para registrar unidades que acabas de recibir.',
      'Elige el tipo de movimiento, escribe la cantidad y agrega un motivo que luego puedas reconocer.',
      'Guarda y confirma que la cantidad disponible haya cambiado.',
      'Consulta Movimientos para revisar quién modificó el stock y en qué fecha.',
    ],
    tip: 'No uses un ajuste para corregir una venta. Las ventas descuentan stock automáticamente al completar el pedido.',
    image: '/manual/inventario.png',
    imageAlt: 'Vista de inventario adaptable con productos y niveles de stock',
    action: { href: '/admin/inventory', label: 'Abrir Inventario' },
  },
  {
    id: 'punto-venta',
    number: '06',
    category: 'Ventas',
    title: 'Realiza una venta en el Punto de venta',
    summary: 'Busca productos, arma el carrito, identifica al cliente, registra el pago y finaliza la operación.',
    keywords: ['pos', 'venta', 'vender', 'cobrar', 'carrito', 'cliente', 'pago', 'efectivo', 'yape', 'boleta', 'factura', 'ticket'],
    steps: [
      'Abre Punto de venta y selecciona la tienda desde la que estás vendiendo.',
      'Busca el producto por nombre o SKU y elige la variante correcta.',
      'Agrega las unidades al carrito y revisa cantidades, descuentos y total.',
      'Busca o registra al cliente. Para una factura necesitarás sus datos fiscales correctos.',
      'Pulsa Cobrar, elige el método de pago y verifica el monto recibido.',
      'Confirma la venta. El pedido quedará registrado y el stock se descontará automáticamente.',
    ],
    tip: 'Antes de confirmar, revisa tienda, cliente, productos, cantidades y total. Corregir esos datos después puede requerir anular o devolver.',
    image: '/manual/punto-venta.png',
    imageAlt: 'Punto de venta con buscador de productos y carrito',
    action: { href: '/admin/orders/pos', label: 'Abrir Punto de venta' },
  },
  {
    id: 'clientes-pedidos',
    number: '07',
    category: 'Ventas',
    title: 'Administra clientes, pedidos y devoluciones',
    summary: 'Encuentra a una persona, revisa una venta y sigue el estado del pedido después de cobrar.',
    keywords: ['cliente', 'dni', 'ruc', 'telefono', 'teléfono', 'pedido', 'orden', 'historial', 'detalle', 'devolucion', 'devolución', 'cambio'],
    steps: [
      'En Clientes puedes buscar por nombre, documento, teléfono o correo.',
      'Antes de crear un cliente, búscalo para evitar registros duplicados.',
      'En Pedidos usa los filtros de fecha, estado, tienda o canal para encontrar una venta.',
      'Abre el detalle para revisar productos, pagos, comprobantes y movimientos del pedido.',
      'Si corresponde una devolución, registra los artículos y cantidades exactas desde el detalle.',
    ],
    tip: 'DNI identifica a una persona; RUC identifica a un negocio. Verifica el tipo y número antes de emitir un comprobante.',
    image: '/manual/clientes.png',
    imageAlt: 'Listado y buscador de clientes del sistema',
    action: { href: '/admin/customers', label: 'Ver Clientes' },
  },
  {
    id: 'picking-transferencias',
    number: '08',
    category: 'Operación',
    title: 'Prepara pedidos y mueve stock entre tiendas',
    summary: 'Usa Picking para separar y entregar pedidos, y Transferencias para enviar productos a otra tienda.',
    keywords: ['picking', 'preparar', 'separar', 'despacho', 'entregar', 'transferencia', 'traslado', 'tienda', 'recepcion', 'recepción'],
    steps: [
      'En Picking abre un pedido pendiente y confirma cada producto que estás separando.',
      'Marca la preparación como completa cuando todo coincida con el pedido.',
      'Continúa con el despacho o entrega según el flujo de tu empresa.',
      'Para mover stock, crea una Transferencia indicando tienda de origen, destino y cantidades.',
      'La tienda de destino debe recibir la transferencia para que el stock pase a estar disponible allí.',
    ],
    tip: 'Una transferencia no es una venta: solo cambia la ubicación del stock entre tiendas o almacenes.',
    image: '/manual/picking.png',
    imageAlt: 'Tablero de picking para preparar pedidos',
    action: { href: '/admin/orders/picking', label: 'Abrir Picking' },
  },
  {
    id: 'sunat',
    number: '09',
    category: 'Facturación',
    title: 'Configura y consulta comprobantes SUNAT',
    summary: 'Entiende cuándo se habilita SUNAT y dónde revisar boletas, facturas, notas o anulaciones.',
    keywords: ['sunat', 'boleta', 'factura', 'comprobante', 'nota de credito', 'nota de crédito', 'anulacion', 'anulación', 'ruc', 'certificado', 'emisor'],
    steps: [
      'SUNAT se habilita cuando tu empresa tiene un plan pagado y activo.',
      'El propietario completa los datos del emisor, credenciales y certificado en Emisor SUNAT.',
      'Verifica que el perfil legal de Empresa y plan coincida con la información registrada en SUNAT.',
      'Después de una venta, revisa el documento en Comprobantes y confirma su estado.',
      'Usa notas de crédito, débito o anulaciones solo cuando corresponda y conservando la trazabilidad.',
    ],
    tip: 'Si un documento figura rechazado, abre su detalle y lee el mensaje antes de volver a enviarlo.',
    image: '/manual/comprobantes.png',
    imageAlt: 'Listado de comprobantes electrónicos y estados SUNAT',
    action: { href: '/admin/sunat/comprobantes', label: 'Ver Comprobantes' },
  },
  {
    id: 'usuarios-roles',
    number: '10',
    category: 'Equipo',
    title: 'Invita colaboradores y controla sus permisos',
    summary: 'Cada persona usa su propia cuenta. Los roles determinan qué secciones puede ver y qué acciones puede realizar.',
    keywords: ['usuario', 'usuarios', 'equipo', 'colaborador', 'invitacion', 'invitación', 'rol', 'permiso', 'acceso', 'correo', 'contraseña'],
    steps: [
      'En Roles revisa o crea un rol con solamente los permisos necesarios para ese trabajo.',
      'En Invitaciones escribe el correo del colaborador y selecciona su rol.',
      'La persona recibirá un enlace para crear su contraseña y aceptar la invitación.',
      'En Usuarios podrás ver si está activo, cambiar su rol o quitar su acceso.',
      'Revisa Auditoría y Actividades cuando necesites saber quién realizó un cambio.',
    ],
    tip: 'Aplica el principio de mínimo acceso: un cajero no necesita permisos de configuración, SUNAT ni administración de usuarios.',
    image: '/manual/equipo.png',
    imageAlt: 'Formulario para invitar a un colaborador y asignarle un rol',
    action: { href: '/admin/invitations', label: 'Invitar a un colaborador' },
  },
  {
    id: 'alertas-ayuda',
    number: '11',
    category: 'Ayuda',
    title: 'Entiende las alertas y resuelve problemas comunes',
    summary: 'La campana te avisa sobre el trial, pagos, stock y tareas. Revisa el mensaje antes de repetir una operación.',
    keywords: ['alerta', 'campana', 'notificacion', 'notificación', 'error', 'ayuda', 'pago en revision', 'pago realizado', 'trial', 'stock', 'sesion'],
    steps: [
      'Abre la campana de la barra superior para leer tus avisos recientes.',
      '“Tu pago está en revisión” significa que el comprobante llegó y debes esperar la validación.',
      '“Pago realizado” significa que fue aprobado y el plan quedó activado.',
      'Una alerta de trial indica cuántos días quedan; envía el pago antes del vencimiento para evitar interrupciones.',
      'Si una pantalla no carga, revisa tu conexión, actualiza una sola vez y vuelve a iniciar sesión si fuera necesario.',
      'Si el problema continúa, anota qué estabas haciendo, copia el mensaje y toma una captura para soporte.',
    ],
    tip: 'No pulses varias veces Guardar o Cobrar si la pantalla está procesando. Espera la respuesta para evitar registros duplicados.',
  },
];

const QUICK_START = [
  { label: 'Completa tu empresa', href: '#empresa-plan', detail: 'RUC y datos de contacto' },
  { label: 'Crea una tienda', href: '/admin/stores', detail: 'Tu primer punto de stock' },
  { label: 'Configura cobros', href: '/admin/payment-methods', detail: 'Efectivo, Yape y otros' },
  { label: 'Crea un producto', href: '#productos', detail: 'Variantes, fotos y precio' },
  { label: 'Registra stock', href: '#inventario', detail: 'Unidades disponibles' },
  { label: 'Haz una venta de prueba', href: '#punto-venta', detail: 'Comprueba el flujo completo' },
];

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export function AdminUserManualPage() {
  const [query, setQuery] = useState('');
  const normalizedQuery = normalize(query);

  const topics = useMemo(() => {
    if (!normalizedQuery) return TOPICS;
    const terms = normalizedQuery.split(/\s+/).filter(Boolean);
    return TOPICS.filter((topic) => {
      const searchable = normalize([
        topic.category,
        topic.title,
        topic.summary,
        ...topic.keywords,
        ...topic.steps,
        topic.tip || '',
      ].join(' '));
      return terms.every((term) => searchable.includes(term));
    });
  }, [normalizedQuery]);

  return (
    <div className="admin-user-manual-next">
      <header className="manual-hero-next">
        <div className="manual-hero-copy-next">
          <p className="manual-eyebrow-next">CENTRO DE AYUDA PARA CLIENTES</p>
          <h1>Manual de usuario</h1>
          <p>Aprende desde cero, con instrucciones claras y capturas de cada tarea importante.</p>
        </div>
        <div className="manual-hero-mark-next" aria-hidden="true">
          <span>?</span>
          <small>Paso a paso</small>
        </div>
        <label className="manual-search-next">
          <span aria-hidden="true">⌕</span>
          <span className="sr-only">Buscar en el manual</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Busca por palabra clave: producto, venta, stock, plan…"
            autoComplete="off"
          />
          {query ? <button type="button" onClick={() => setQuery('')} aria-label="Limpiar búsqueda">Limpiar</button> : null}
        </label>
        <p className="manual-search-help-next">También puedes buscar acciones: “cobrar”, “invitar usuario”, “subir comprobante” o “emitir boleta”.</p>
      </header>

      {!normalizedQuery ? (
        <section className="manual-start-next" aria-labelledby="manual-start-title">
          <div className="manual-section-heading-next">
            <div>
              <p className="manual-eyebrow-next">PRIMEROS 30 MINUTOS</p>
              <h2 id="manual-start-title">De cuenta nueva a primera venta</h2>
              <p>Sigue este orden la primera vez. Cada paso prepara el siguiente.</p>
            </div>
            <span>6 pasos</span>
          </div>
          <ol className="manual-quick-grid-next">
            {QUICK_START.map((step, index) => (
              <li key={step.label}>
                <Link href={step.href}>
                  <b>{index + 1}</b>
                  <span><strong>{step.label}</strong><small>{step.detail}</small></span>
                  <i aria-hidden="true">→</i>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <div className="manual-content-layout-next">
        <aside className="manual-index-next" aria-label="Índice del manual">
          <p>EN ESTA GUÍA</p>
          <nav>
            {TOPICS.map((topic) => (
              <a href={`#${topic.id}`} key={topic.id} className={topics.includes(topic) ? '' : 'manual-index-hidden-next'}>
                <span>{topic.number}</span>{topic.title}
              </a>
            ))}
          </nav>
          <div className="manual-index-note-next">
            <strong>¿Eres nuevo?</strong>
            <p>Empieza por el tema 01 y avanza en orden hasta realizar una venta de prueba.</p>
          </div>
        </aside>

        <main className="manual-results-next">
          <div className="manual-results-head-next" aria-live="polite">
            <div>
              <p className="manual-eyebrow-next">GUÍA PASO A PASO</p>
              <h2>{normalizedQuery ? `Resultados para “${query.trim()}”` : 'Todas las tareas'}</h2>
            </div>
            <span>{topics.length} {topics.length === 1 ? 'tema' : 'temas'}</span>
          </div>

          {topics.length ? topics.map((topic) => (
            <article className="manual-topic-next" id={topic.id} key={topic.id}>
              <header className="manual-topic-head-next">
                <div className="manual-topic-number-next">{topic.number}</div>
                <div>
                  <p>{topic.category}</p>
                  <h2>{topic.title}</h2>
                  <span>{topic.summary}</span>
                </div>
              </header>

              {topic.image ? (
                <figure className="manual-figure-next">
                  <a href={topic.image} target="_blank" rel="noreferrer" aria-label={`Abrir captura completa: ${topic.imageAlt}`}>
                    <Image
                      src={topic.image}
                      alt={topic.imageAlt || ''}
                      width={1440}
                      height={960}
                      sizes="(max-width: 800px) 100vw, 900px"
                      loading={topic.id === 'primer-ingreso' ? 'eager' : 'lazy'}
                      unoptimized
                    />
                    <span>Ampliar captura ↗</span>
                  </a>
                  <figcaption>Captura de referencia. Los datos que verás serán los de tu empresa.</figcaption>
                </figure>
              ) : null}

              <section className="manual-steps-next" aria-label={`Pasos para ${topic.title}`}>
                <h3>Cómo hacerlo</h3>
                <ol>
                  {topic.steps.map((step, index) => (
                    <li key={step}><b>{index + 1}</b><span>{step}</span></li>
                  ))}
                </ol>
              </section>

              {topic.tip ? (
                <div className="manual-tip-next">
                  <span aria-hidden="true">i</span>
                  <div><strong>Ten en cuenta</strong><p>{topic.tip}</p></div>
                </div>
              ) : null}

              <footer className="manual-topic-footer-next">
                <div><span>Palabras relacionadas:</span>{topic.keywords.slice(0, 5).map((keyword) => <small key={keyword}>{keyword}</small>)}</div>
                {topic.action ? <Link href={topic.action.href}>{topic.action.label} <span aria-hidden="true">→</span></Link> : null}
              </footer>
            </article>
          )) : (
            <div className="manual-empty-next">
              <span aria-hidden="true">⌕</span>
              <h2>No encontramos ese término</h2>
              <p>Prueba con una palabra más corta como “venta”, “producto”, “stock”, “plan”, “usuario” o “SUNAT”.</p>
              <button type="button" onClick={() => setQuery('')}>Ver todo el manual</button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
