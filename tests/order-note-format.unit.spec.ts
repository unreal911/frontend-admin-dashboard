import { test, expect } from '@playwright/test';
import {
  formatDateTimeFromDate,
  formatMoney,
  getChannelLabel,
  getDisplayNote,
  parseClientAddress,
  parsePaymentAmount,
  parsePaymentAmountLabel,
  parsePaymentMethod,
  parsePaymentReference,
} from '../lib/order-note-format';

test('getChannelLabel mapea canales conocidos y cae a "No definido"', () => {
  expect(getChannelLabel('POS')).toBe('POS');
  expect(getChannelLabel('ecommerce')).toBe('Ecommerce');
  expect(getChannelLabel('INTERNAL')).toBe('Interno');
  expect(getChannelLabel('')).toBe('No definido');
  expect(getChannelLabel('otro')).toBe('No definido');
});

test('formatMoney formatea a soles con 2 decimales y tolera basura', () => {
  expect(formatMoney(12)).toBe('S/ 12.00');
  expect(formatMoney(12.5)).toBe('S/ 12.50');
  expect(formatMoney(0)).toBe('S/ 0.00');
  expect(formatMoney(NaN as unknown as number)).toBe('S/ 0.00');
});

test('formatDateTimeFromDate maneja null y fecha invalida', () => {
  expect(formatDateTimeFromDate(null)).toBe('Sin fecha');
  expect(formatDateTimeFromDate(new Date('no-es-fecha'))).toBe('Sin fecha');
  expect(formatDateTimeFromDate(new Date('2026-07-17T10:00:00'))).not.toBe('Sin fecha');
});

test('parsePaymentMethod lee ambos formatos y cae a "No especificado"', () => {
  expect(parsePaymentMethod('Metodo de pago: Efectivo | Ref: X')).toBe('Efectivo');
  expect(parsePaymentMethod('METODO_PAGO: Yape')).toBe('Yape');
  expect(parsePaymentMethod('sin metodo')).toBe('No especificado');
});

test('parsePaymentReference lee Ref y cae a "-"', () => {
  expect(parsePaymentReference('Metodo de pago: Efectivo | Ref: POS-123')).toBe('POS-123');
  expect(parsePaymentReference('sin ref')).toBe('-');
});

test('parseClientAddress lee DIRECCION al inicio o tras "|"', () => {
  expect(parseClientAddress('CHANNEL: ECOMMERCE | DIRECCION: Av Siempre Viva 123 | RUC: 1')).toBe('Av Siempre Viva 123');
  expect(parseClientAddress('DIRECCION: Calle 1')).toBe('Calle 1');
  expect(parseClientAddress('sin direccion')).toBe('');
});

test('parsePaymentAmount normaliza coma decimal y simbolo S/', () => {
  expect(parsePaymentAmount('Pagado: S/ 25.50', ['Pagado'])).toBe(25.5);
  expect(parsePaymentAmount('Monto recibido: 30,00', ['Monto recibido', 'Pagado'])).toBe(30);
  expect(parsePaymentAmount('sin monto', ['Pagado'])).toBeNull();
});

test('parsePaymentAmountLabel formatea o informa no disponible', () => {
  expect(parsePaymentAmountLabel('Vuelto: S/ 5.00', ['Vuelto'])).toBe('S/ 5.00');
  expect(parsePaymentAmountLabel('sin dato', ['Vuelto'])).toBe('No disponible');
});

test('getDisplayNote prioriza NOTA_CLIENTE y oculta segmentos internos', () => {
  expect(getDisplayNote('CHANNEL: ECOMMERCE | NOTA_CLIENTE: Dejar en porteria')).toBe('Dejar en porteria');
  // Sin nota de cliente: filtra segmentos internos y de pago, deja lo visible.
  expect(getDisplayNote('CHANNEL: POS | Metodo de pago: Efectivo | Entregar rapido')).toBe('Entregar rapido');
  // Todo interno -> "-"
  expect(getDisplayNote('CHANNEL: POS | RUC: 123 | Ref: X')).toBe('-');
});
