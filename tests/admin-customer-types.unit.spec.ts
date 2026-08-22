import { expect, test } from '@playwright/test';
import {
  customerDocumentLabel,
  normalizeCustomer,
  normalizeCustomersResponse,
} from '../lib/admin-customer-types';

test('normaliza resultados de clientes y descarta filas invalidas', () => {
  const result = normalizeCustomersResponse({
    data: [
      { id: '7', name: 'Maria Perez', documentType: '1', documentNumber: '74859621', isActive: true },
      { id: null, name: '' },
    ],
    total: '1', page: '1', limit: '8',
  });
  expect(result.data).toHaveLength(1);
  expect(result.total).toBe(1);
  expect(customerDocumentLabel(result.data[0]!)).toBe('DNI 74859621');
});

test('presenta una ficha sin documento de forma segura', () => {
  const customer = normalizeCustomer({ id: 4, name: 'Cliente frecuente', isActive: false });
  expect(customer).not.toBeNull();
  expect(customer?.isActive).toBe(false);
  expect(customerDocumentLabel(customer!)).toBe('Sin documento');
});
