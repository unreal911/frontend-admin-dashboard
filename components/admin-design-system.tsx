import Link from 'next/link';
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

type Tone = 'info' | 'success' | 'warning' | 'error';

function joinClasses(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="ds-page-header">
      <div className="ds-page-header-copy">
        {eyebrow ? <p className="ds-eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="ds-page-header-actions">{actions}</div> : null}
    </header>
  );
}

export function AdminCard({
  title,
  description,
  actions,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={joinClasses('admin-card', 'ds-card', className)} {...props}>
      {title || description || actions ? (
        <header className="ds-card-header">
          <div>
            {title ? <h2>{title}</h2> : null}
            {description ? <p>{description}</p> : null}
          </div>
          {actions ? <div className="ds-card-actions">{actions}</div> : null}
        </header>
      ) : null}
      <div className="ds-card-content">{children}</div>
    </section>
  );
}

export function AdminButton({
  variant = 'primary',
  size = 'medium',
  loading = false,
  className,
  disabled,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'quiet';
  size?: 'small' | 'medium';
  loading?: boolean;
}) {
  return (
    <button
      className={joinClasses('ds-button', `ds-button-${variant}`, `ds-button-${size}`, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <span className="ds-spinner" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export function AdminButtonLink({
  href,
  variant = 'primary',
  children,
  className,
}: {
  href: string;
  variant?: 'primary' | 'secondary' | 'quiet';
  children: ReactNode;
  className?: string;
}) {
  return <Link href={href} className={joinClasses('ds-button', `ds-button-${variant}`, className)}>{children}</Link>;
}

export function AdminNotice({
  tone = 'info',
  title,
  children,
  actions,
  className,
}: {
  tone?: Tone;
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={joinClasses('ds-notice', `ds-notice-${tone}`, className)} role={tone === 'error' ? 'alert' : 'status'}>
      <span className="ds-notice-icon" aria-hidden="true" />
      <div className="ds-notice-copy">
        {title ? <strong>{title}</strong> : null}
        <div>{children}</div>
      </div>
      {actions ? <div className="ds-notice-actions">{actions}</div> : null}
    </div>
  );
}

export function AdminField({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={joinClasses('ds-field', error && 'ds-field-error', className)}>
      <span className="ds-field-label">{label}{required ? <em aria-hidden="true"> *</em> : null}</span>
      {children}
      {error ? <small className="ds-field-message">{error}</small> : hint ? <small className="ds-field-hint">{hint}</small> : null}
    </label>
  );
}

export function AdminBadge({ tone = 'info', children }: { tone?: Tone | 'neutral'; children: ReactNode }) {
  return <span className={`ds-badge ds-badge-${tone}`}>{children}</span>;
}
