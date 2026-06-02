import Link from 'next/link';

export default function HomePage() {
  return (
    <section className="auth-shell">
      <article className="auth-card-next">
        <h1>Frontend Admin Next</h1>
        <p>Proyecto dedicado solo al panel administrativo.</p>
        <div className="auth-links-next">
          <Link href="/login">Ir a Login</Link>
          <Link href="/admin/dashboard">Ir a Admin</Link>
        </div>
      </article>
    </section>
  );
}
