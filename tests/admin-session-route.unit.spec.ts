import { expect, test } from '@playwright/test';

import { POST } from '../app/api/admin/session/route';

test('reenvía el identificador del formulario al backend de autenticación', async () => {
  const originalFetch = globalThis.fetch;
  let forwardedBody: unknown;

  globalThis.fetch = async (_input, init) => {
    forwardedBody = JSON.parse(String(init?.body || '{}'));
    return Response.json({ message: 'Credenciales invalidas.' }, { status: 401 });
  };

  try {
    const response = await POST(new Request('http://localhost/api/admin/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        identifier: 'usuario@example.com',
        password: ' Clave-segura-123 ',
      }),
    }));

    expect(response.status).toBe(401);
    expect(forwardedBody).toEqual({
      identifier: 'usuario@example.com',
      password: ' Clave-segura-123 ',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('conserva compatibilidad con clientes que todavía envían email', async () => {
  const originalFetch = globalThis.fetch;
  let forwardedBody: unknown;

  globalThis.fetch = async (_input, init) => {
    forwardedBody = JSON.parse(String(init?.body || '{}'));
    return Response.json({ message: 'Credenciales invalidas.' }, { status: 401 });
  };

  try {
    const response = await POST(new Request('http://localhost/api/admin/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'legacy@example.com',
        password: 'Clave-segura-123',
      }),
    }));

    expect(response.status).toBe(401);
    expect(forwardedBody).toEqual({
      identifier: 'legacy@example.com',
      password: 'Clave-segura-123',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
