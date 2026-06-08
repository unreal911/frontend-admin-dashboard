import { expect, test } from '@playwright/test';
import { normalizeProductDetail } from '../lib/admin-product-normalizers';

const productPayload = {
  id: 7,
  name: 'Polo Caballero',
  description: 'Producto de prueba',
  categoryId: 3,
  isActive: true,
  variantMode: 'SIMPLE',
  marketplaceVariantColorIds: [1, 2, 2, 0, '3'],
  marketplaceVariantSizeIds: [4, 5, 5, null],
  marketplaceColorImages: [
    { colorId: 1, imageUrl: 'https://res.cloudinary.com/demo/image/upload/negro.jpg' },
    { colorId: '2', imageUrl: 'https://res.cloudinary.com/demo/image/upload/blanco.jpg' },
    { colorId: 3, imageUrl: '' },
    { colorId: 0, imageUrl: 'https://res.cloudinary.com/demo/image/upload/invalid.jpg' },
  ],
  variants: [
    {
      id: 10,
      colorId: 0,
      sizeId: 0,
      price: 18,
      imageUrl: 'https://res.cloudinary.com/demo/image/upload/base.jpg',
      isSimpleVariant: true,
    },
  ],
  images: [],
};

test.describe('normalizeProductDetail', () => {
  test('preserva imagenes marketplace por color cuando el producto viene directo', () => {
    const normalized = normalizeProductDetail(productPayload);

    expect(normalized?.marketplaceVariantColorIds).toEqual([1, 2, 3]);
    expect(normalized?.marketplaceVariantSizeIds).toEqual([4, 5]);
    expect(normalized?.marketplaceColorImages).toEqual([
      { colorId: 1, imageUrl: 'https://res.cloudinary.com/demo/image/upload/negro.jpg' },
      { colorId: 2, imageUrl: 'https://res.cloudinary.com/demo/image/upload/blanco.jpg' },
    ]);
  });

  test('preserva imagenes marketplace por color cuando el backend responde { product }', () => {
    const normalized = normalizeProductDetail({ message: 'ok', product: productPayload });

    expect(normalized?.id).toBe(7);
    expect(normalized?.marketplaceColorImages).toHaveLength(2);
    expect(normalized?.marketplaceColorImages?.[0]?.imageUrl).toContain('negro.jpg');
  });

  test('preserva imagenes marketplace por color cuando el proxy responde { data }', () => {
    const normalized = normalizeProductDetail({ data: productPayload });

    expect(normalized?.id).toBe(7);
    expect(normalized?.marketplaceColorImages).toHaveLength(2);
    expect(normalized?.marketplaceColorImages?.[1]).toEqual({
      colorId: 2,
      imageUrl: 'https://res.cloudinary.com/demo/image/upload/blanco.jpg',
    });
  });

  test('preserva imagenes marketplace por color cuando la respuesta viene anidada en { data: { product } }', () => {
    const normalized = normalizeProductDetail({ data: { product: productPayload } });

    expect(normalized?.id).toBe(7);
    expect(normalized?.marketplaceVariantColorIds).toEqual([1, 2, 3]);
    expect(normalized?.marketplaceColorImages).toHaveLength(2);
  });
});
