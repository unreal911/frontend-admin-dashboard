import Image from 'next/image';
import type { ReactNode } from 'react';

type AuthFashionLayoutProps = {
  eyebrow?: string;
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  wideForm?: boolean;
};

export function AuthFashionLayout({
  eyebrow,
  title,
  description,
  children,
  footer,
  wideForm = false,
}: AuthFashionLayoutProps) {
  return (
    <section className="auth-fashion-shell-next">
      <div className={`auth-fashion-layout-next${wideForm ? ' auth-fashion-layout-wide-next' : ''}`}>
        <aside className="auth-fashion-visual-next" aria-label="Gestión para tiendas de moda">
          <div className="auth-fashion-brand-next auth-fashion-brand-visual-next">
            <span aria-hidden="true">T</span>
            <strong>Tienda SaaS</strong>
          </div>
          <div className="auth-fashion-visual-copy-next">
            <p>Comercio de moda</p>
            <h2>Tu negocio, siempre en movimiento.</h2>
            <span>Prendas, calzado, inventario y ventas en un solo lugar.</span>
          </div>
          <Image
            className="auth-fashion-image-next"
            src="/auth-fashion-illustration.png"
            alt="Ropa, calzado y herramientas para gestionar una tienda de moda"
            width={1024}
            height={1024}
            sizes="(max-width: 760px) 100vw, 55vw"
            priority
          />
          <div className="auth-fashion-benefits-next" aria-hidden="true">
            <span>Inventario</span>
            <span>Ventas</span>
            <span>Moda</span>
          </div>
        </aside>

        <article className="auth-card-next auth-fashion-form-panel-next">
          <div className="auth-fashion-brand-next auth-fashion-brand-form-next">
            <span aria-hidden="true">T</span>
            <strong>Tienda SaaS</strong>
          </div>
          {eyebrow || title || description ? (
            <header className="auth-fashion-heading-next">
              {eyebrow ? <p className="auth-fashion-eyebrow-next">{eyebrow}</p> : null}
              {title ? <h1>{title}</h1> : null}
              {description ? <p>{description}</p> : null}
            </header>
          ) : null}
          <div className="auth-fashion-content-next">{children}</div>
          {footer ? <footer className="auth-links-next auth-fashion-footer-next">{footer}</footer> : null}
        </article>
      </div>
    </section>
  );
}
