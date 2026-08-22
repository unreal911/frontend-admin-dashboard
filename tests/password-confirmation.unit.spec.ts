import { expect, test } from '@playwright/test';
import { validatePasswordConfirmation } from '../lib/password-confirmation';
import { resolveForwardedClientIp, signupRateLimitMessage } from '../lib/public-request-metadata';

test.describe('validatePasswordConfirmation', () => {
  test('acepta contrasenas iguales', () => {
    expect(validatePasswordConfirmation('Clave-segura-123', 'Clave-segura-123')).toBeNull();
  });

  test('requiere repetir la contrasena', () => {
    expect(validatePasswordConfirmation('Clave-segura-123', '')).toBe('Repite la contrasena.');
  });

  test('rechaza contrasenas diferentes', () => {
    expect(validatePasswordConfirmation('Clave-segura-123', 'Otra-clave-456')).toBe('Las contrasenas no coinciden.');
  });
});

test.describe('metadatos del registro publico', () => {
  test('conserva la primera IP reenviada', () => {
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.10, 10.0.0.4' });
    expect(resolveForwardedClientIp(headers)).toBe('203.0.113.10');
  });

  test('explica cuanto falta cuando el backend limita intentos', () => {
    expect(signupRateLimitMessage('121')).toBe('Demasiados intentos. Intenta nuevamente en 3 minutos.');
  });
});
