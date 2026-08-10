import { expect, test } from '@playwright/test';
import { NextRequest } from 'next/server';
import { proxy } from '../proxy';

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('la raíz envía al login cuando no hay sesión', async () => {
  const response = await proxy(new NextRequest('http://localhost:3001/'));

  expect(response.status).toBe(307);
  expect(response.headers.get('location')).toBe('http://localhost:3001/login');
});

test('la raíz envía al dashboard cuando la sesión es válida', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ user: { id: 1 } }), {
    status: 200,
    headers: { 'x-access-token': 'token-renovado' },
  });
  const request = new NextRequest('http://localhost:3001/', {
    headers: { cookie: 'admin_session=token-valido' },
  });

  const response = await proxy(request);

  expect(response.status).toBe(307);
  expect(response.headers.get('location')).toBe('http://localhost:3001/admin/dashboard');
  expect(response.headers.get('set-cookie')).toContain('admin_session=token-renovado');
});

test('una cookie inválida termina en login y se elimina', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ message: 'Token inválido' }), {
    status: 401,
  });
  const request = new NextRequest('http://localhost:3001/', {
    headers: { cookie: 'admin_session=token-invalido' },
  });

  const response = await proxy(request);

  expect(response.status).toBe(307);
  expect(response.headers.get('location')).toBe('http://localhost:3001/login');
  expect(response.headers.get('set-cookie')).toContain('admin_session=;');
});
