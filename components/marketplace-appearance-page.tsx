'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAdminUi } from '@/components/admin-ui-provider';
import styles from './marketplace-appearance-page.module.css';

type Preset = 'catalogo_moderno' | 'moda_editorial' | 'catalogo_compacto' | 'boutique';
type ThemeConfig = {
  preset: Preset;
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  textColor: string;
  headingFont: string;
  bodyFont: string;
  heroTitle: string;
  heroSubtitle: string;
  heroCtaLabel: string;
  bannerUrl: string;
  announcementText: string;
  productImageRatio: '1:1' | '4:5' | '3:4';
  cardStyle: 'flat' | 'soft' | 'bordered';
  buttonStyle: 'square' | 'rounded' | 'pill';
};

const DEFAULT_THEME: ThemeConfig = {
  preset: 'catalogo_moderno', primaryColor: '#0B63CE', secondaryColor: '#E8F1FF',
  backgroundColor: '#FFFFFF', textColor: '#10243F', headingFont: 'Montserrat', bodyFont: 'Inter',
  heroTitle: 'Descubre nuestro catalogo', heroSubtitle: 'Elige productos, revisa variantes y arma tu pedido en pocos pasos.',
  heroCtaLabel: 'Ver catalogo', bannerUrl: '', announcementText: '', productImageRatio: '1:1', cardStyle: 'soft', buttonStyle: 'rounded',
};

const PRESETS: Array<{ id: Preset; name: string; description: string; patch: Partial<ThemeConfig> }> = [
  { id: 'catalogo_moderno', name: 'Catalogo moderno', description: 'Limpio y versatil para distribuidores.', patch: { primaryColor: '#0B63CE', secondaryColor: '#E8F1FF', headingFont: 'Montserrat', bodyFont: 'Inter', cardStyle: 'soft', buttonStyle: 'rounded', productImageRatio: '1:1' } },
  { id: 'moda_editorial', name: 'Moda editorial', description: 'Imagenes grandes y tipografia expresiva.', patch: { primaryColor: '#B42318', secondaryColor: '#FDECEA', headingFont: 'Playfair Display', bodyFont: 'Inter', cardStyle: 'flat', buttonStyle: 'square', productImageRatio: '4:5' } },
  { id: 'catalogo_compacto', name: 'Catalogo compacto', description: 'Mayor densidad para catalogos extensos.', patch: { primaryColor: '#176B4D', secondaryColor: '#E7F4ED', headingFont: 'Roboto', bodyFont: 'Roboto', cardStyle: 'bordered', buttonStyle: 'rounded', productImageRatio: '1:1' } },
  { id: 'boutique', name: 'Boutique', description: 'Espacios amplios y presencia premium.', patch: { primaryColor: '#6D4C41', secondaryColor: '#F4EFEA', headingFont: 'Lora', bodyFont: 'Inter', cardStyle: 'soft', buttonStyle: 'pill', productImageRatio: '3:4' } },
];

const FONTS = ['Inter', 'Montserrat', 'Poppins', 'Lora', 'Playfair Display', 'Roboto'];

function readError(payload: unknown, fallback: string) {
  return String((payload as { message?: unknown } | null)?.message || fallback);
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return <label className={styles.field}><span>{label}</span>{children}{hint ? <small>{hint}</small> : null}</label>;
}

export function MarketplaceAppearancePage() {
  const { confirm, showAlert } = useAdminUi();
  const [config, setConfig] = useState<ThemeConfig>(DEFAULT_THEME);
  const [status, setStatus] = useState<'DRAFT' | 'PUBLISHED'>('DRAFT');
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop');
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState('');

  useEffect(() => () => {
    if (bannerPreview) URL.revokeObjectURL(bannerPreview);
  }, [bannerPreview]);

  useEffect(() => {
    void fetch('/api/admin/system-config/marketplace-theme', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(readError(payload, 'No se pudo cargar la apariencia.'));
        const data = payload?.data || {};
        setConfig({ ...DEFAULT_THEME, ...(data.draftConfig || {}) });
        setStatus(data.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT');
        setPublishedAt(data.publishedAt || null);
      })
      .catch((error) => showAlert(error instanceof Error ? error.message : 'No se pudo cargar la apariencia.', 'error'))
      .finally(() => setLoading(false));
  }, [showAlert]);

  const update = <K extends keyof ThemeConfig,>(key: K, value: ThemeConfig[K]) => {
    setConfig((current) => ({ ...current, [key]: value }));
    setDirty(true);
  };

  const applyPreset = (preset: typeof PRESETS[number]) => {
    setConfig((current) => ({ ...current, ...preset.patch, preset: preset.id }));
    setDirty(true);
  };

  const chooseBanner = (file: File | null) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      showAlert('Selecciona una imagen JPG, PNG o WebP.', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showAlert('La imagen de fondo no debe superar 5 MB.', 'error');
      return;
    }
    setBannerFile(file);
    setBannerPreview(URL.createObjectURL(file));
    setConfig((current) => ({ ...current, bannerUrl: '' }));
    setDirty(true);
  };

  async function saveDraft(quiet = false): Promise<boolean> {
    setSaving(true);
    try {
      const response = await fetch('/api/admin/system-config/marketplace-theme', {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          config,
          ...(bannerFile ? { bannerFile: { filename: bannerFile.name, data: await fileToBase64(bannerFile) } } : {}),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(readError(payload, 'No se pudo guardar el borrador.'));
      if (payload?.data?.draftConfig) setConfig({ ...DEFAULT_THEME, ...payload.data.draftConfig });
      setBannerFile(null);
      setBannerPreview('');
      setStatus('DRAFT');
      setDirty(false);
      if (!quiet) showAlert('Borrador guardado. La tienda publica aun no cambio.', 'success');
      return true;
    } catch (error) {
      showAlert(error instanceof Error ? error.message : 'No se pudo guardar el borrador.', 'error');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    const accepted = await confirm({ title: 'Publicar apariencia', message: 'Los clientes veran inmediatamente estos colores, textos, imagen de fondo y estilos.', acceptText: 'Publicar' });
    if (!accepted) return;
    if (!(await saveDraft(true))) return;
    setSaving(true);
    try {
      const response = await fetch('/api/admin/system-config/marketplace-theme/publish', { method: 'POST' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(readError(payload, 'No se pudo publicar la apariencia.'));
      setStatus('PUBLISHED');
      setPublishedAt(payload?.data?.publishedAt || new Date().toISOString());
      showAlert('Apariencia publicada en la tienda online.', 'success');
    } catch (error) {
      showAlert(error instanceof Error ? error.message : 'No se pudo publicar la apariencia.', 'error');
    } finally {
      setSaving(false);
    }
  }

  const previewStyle = useMemo(() => ({
    '--preview-primary': config.primaryColor,
    '--preview-secondary': config.secondaryColor,
    '--preview-bg': config.backgroundColor,
    '--preview-text': config.textColor,
    '--preview-heading': `'${config.headingFont}', sans-serif`,
    '--preview-body': `'${config.bodyFont}', sans-serif`,
    '--preview-ratio': config.productImageRatio.replace(':', ' / '),
    '--preview-button-radius': config.buttonStyle === 'pill' ? '999px' : config.buttonStyle === 'square' ? '0px' : '9px',
    '--preview-card-radius': config.cardStyle === 'flat' ? '0px' : '14px',
  }) as React.CSSProperties, [config]);

  if (loading) return <section className={styles.loading}>Cargando editor de apariencia…</section>;

  return <section className={styles.page}>
    <header className={styles.header}>
      <div><p>Tienda online</p><h1>Apariencia</h1><span>Personaliza una plantilla segura y publicala cuando este lista.</span></div>
      <div className={styles.actions}>
        <span className={`${styles.status} ${status === 'PUBLISHED' && !dirty ? styles.published : ''}`}>{dirty || status === 'DRAFT' ? 'Borrador' : 'Publicado'}</span>
        <button type="button" className={styles.secondaryButton} disabled={saving} onClick={() => void saveDraft()}>{saving ? 'Guardando…' : 'Guardar borrador'}</button>
        <button type="button" className={styles.primaryButton} disabled={saving} onClick={() => void publish()}>Publicar</button>
      </div>
    </header>
    {publishedAt ? <p className={styles.publishedAt}>Ultima publicacion: {new Date(publishedAt).toLocaleString('es-PE')}</p> : null}

    <div className={styles.workspace}>
      <div className={styles.editor}>
        <section className={styles.panel}><h2>1. Plantilla base</h2><div className={styles.presets}>{PRESETS.map((preset) => <button type="button" key={preset.id} className={config.preset === preset.id ? styles.selectedPreset : ''} onClick={() => applyPreset(preset)}><strong>{preset.name}</strong><span>{preset.description}</span></button>)}</div></section>

        <section className={styles.panel}><h2>2. Identidad visual</h2><div className={styles.fieldGrid}>
          {([['primaryColor', 'Color principal'], ['secondaryColor', 'Color secundario'], ['backgroundColor', 'Fondo'], ['textColor', 'Texto']] as const).map(([key, label]) => <Field label={label} key={key}><div className={styles.colorField}><input type="color" value={config[key]} onChange={(event) => update(key, event.target.value.toUpperCase())} /><input value={config[key]} maxLength={7} onChange={(event) => update(key, event.target.value.toUpperCase())} /></div></Field>)}
          <Field label="Tipografia de titulos"><select value={config.headingFont} onChange={(event) => update('headingFont', event.target.value)}>{FONTS.map((font) => <option key={font}>{font}</option>)}</select></Field>
          <Field label="Tipografia de contenido"><select value={config.bodyFont} onChange={(event) => update('bodyFont', event.target.value)}>{FONTS.map((font) => <option key={font}>{font}</option>)}</select></Field>
        </div></section>

        <section className={styles.panel}><h2>3. Portada</h2><div className={styles.fieldGrid}>
          <Field label="Titulo"><input value={config.heroTitle} maxLength={80} onChange={(event) => update('heroTitle', event.target.value)} /></Field>
          <Field label="Llamada a la accion"><input value={config.heroCtaLabel} maxLength={40} onChange={(event) => update('heroCtaLabel', event.target.value)} /></Field>
          <Field label="Subtitulo"><textarea value={config.heroSubtitle} maxLength={180} rows={3} onChange={(event) => update('heroSubtitle', event.target.value)} /></Field>
          <Field label="Franja promocional"><input value={config.announcementText} maxLength={100} placeholder="Ej. Envios a todo el Peru" onChange={(event) => update('announcementText', event.target.value)} /></Field>
          <div className={`${styles.field} ${styles.bannerField}`}>
            <label htmlFor="marketplace-banner-file">Imagen de fondo de la portada</label>
            <input id="marketplace-banner-file" type="file" accept="image/jpeg,image/png,image/webp" disabled={saving} onChange={(event) => { chooseBanner(event.target.files?.[0] || null); event.target.value = ''; }} />
            <small>JPG, PNG o WebP, hasta 5 MB. Recomendado: imagen horizontal de 1600 × 600 px.</small>
            {bannerFile ? <small>Seleccionada: {bannerFile.name}. Guarda el borrador o publica para subirla.</small> : null}
            {(bannerFile || config.bannerUrl) ? <button type="button" className={styles.removeBanner} disabled={saving} onClick={() => { setBannerFile(null); setBannerPreview(''); update('bannerUrl', ''); }}>Quitar imagen de fondo</button> : null}
          </div>
          <Field label="O pega la URL de una imagen" hint="Opcional. Usa una imagen horizontal en HTTPS."><input type="url" value={config.bannerUrl} placeholder="https://…" disabled={saving} onChange={(event) => { setBannerFile(null); setBannerPreview(''); update('bannerUrl', event.target.value); }} /></Field>
        </div></section>

        <section className={styles.panel}><h2>4. Catalogo</h2><div className={styles.fieldGrid}>
          <Field label="Proporcion de imagen"><select value={config.productImageRatio} onChange={(event) => update('productImageRatio', event.target.value as ThemeConfig['productImageRatio'])}><option value="1:1">Cuadrada (1:1)</option><option value="4:5">Vertical (4:5)</option><option value="3:4">Editorial (3:4)</option></select></Field>
          <Field label="Tarjetas"><select value={config.cardStyle} onChange={(event) => update('cardStyle', event.target.value as ThemeConfig['cardStyle'])}><option value="soft">Suaves</option><option value="flat">Planas</option><option value="bordered">Con borde</option></select></Field>
          <Field label="Botones"><select value={config.buttonStyle} onChange={(event) => update('buttonStyle', event.target.value as ThemeConfig['buttonStyle'])}><option value="rounded">Redondeados</option><option value="square">Rectos</option><option value="pill">Capsula</option></select></Field>
        </div></section>
      </div>

      <aside className={styles.previewPanel}>
        <div className={styles.previewToolbar}><strong>Vista previa</strong><div><button type="button" className={viewport === 'desktop' ? styles.activeViewport : ''} onClick={() => setViewport('desktop')}>Escritorio</button><button type="button" className={viewport === 'mobile' ? styles.activeViewport : ''} onClick={() => setViewport('mobile')}>Movil</button></div></div>
        <div className={`${styles.previewStage} ${viewport === 'mobile' ? styles.mobileStage : ''}`} style={previewStyle}>
          {config.announcementText ? <div className={styles.previewAnnouncement}>{config.announcementText}</div> : null}
          <nav className={styles.previewNav}><strong>Tu marca</strong><span>Catalogo&nbsp;&nbsp; Pedido&nbsp;&nbsp; Cuenta</span></nav>
          <div className={styles.previewHero} style={(bannerPreview || config.bannerUrl) ? { backgroundImage: `linear-gradient(90deg, color-mix(in srgb, ${config.backgroundColor} 88%, transparent), color-mix(in srgb, ${config.backgroundColor} 12%, transparent)), url("${(bannerPreview || config.bannerUrl).replace(/["\\]/g, '')}")` } : undefined}>
            <small>Catalogo online</small><h2>{config.heroTitle || 'Tu titulo aqui'}</h2>{config.heroSubtitle ? <p>{config.heroSubtitle}</p> : null}{config.heroCtaLabel ? <button type="button">{config.heroCtaLabel}</button> : null}
          </div>
          <div className={styles.previewProducts}>{['Producto destacado', 'Nueva coleccion', 'Favorito del mes'].map((name, index) => <article key={name} data-card={config.cardStyle}><div className={styles.previewImage}>{index + 1}</div><small>Categoria</small><h3>{name}</h3><strong>S/ {(49 + index * 20).toFixed(2)}</strong><button type="button">Ver producto</button></article>)}</div>
        </div>
      </aside>
    </div>
  </section>;
}
