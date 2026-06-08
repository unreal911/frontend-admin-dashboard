import type {
  AdminProductDetail,
  AdminProductVariant,
  ProductVariantMode,
} from '@/components/admin-product-modal';

interface ProductDetailRaw {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  categoryId?: unknown;
  isActive?: unknown;
  variantMode?: unknown;
  marketplaceVariantColorIds?: unknown;
  marketplaceVariantSizeIds?: unknown;
  marketplaceColorImages?: unknown;
  variants?: unknown;
  images?: unknown;
}

function toPositiveNumber(value: unknown): number {
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : 0;
}

function toNumber(value: unknown): number {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : 0;
}

function parseVariantMode(value: unknown): ProductVariantMode {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'SIMPLE' || normalized === 'SIZE_ONLY') {
    return normalized;
  }
  return 'MATRIX';
}

function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values.filter((value) => Number.isInteger(value) && value > 0))];
}

export function normalizeProductDetail(payload: unknown): AdminProductDetail | null {
  const wrapped = payload as ({ data?: unknown; product?: unknown } & ProductDetailRaw) | null;
  const nestedData = wrapped?.data as ({ product?: unknown; data?: unknown } & ProductDetailRaw) | undefined;
  const raw = (
    wrapped?.product
    || nestedData?.product
    || nestedData?.data
    || wrapped?.data
    || wrapped
  ) as ProductDetailRaw | null;
  if (!raw) {
    return null;
  }

  const id = toPositiveNumber(raw.id);
  const name = String(raw.name || '').trim();
  const categoryId = toPositiveNumber(raw.categoryId);
  if (!id || !name || !categoryId) {
    return null;
  }

  const variantsRaw = Array.isArray(raw.variants) ? raw.variants : [];
  const variants: AdminProductVariant[] = [];
  for (const item of variantsRaw) {
    const colorId = toNumber((item as AdminProductVariant).colorId);
    const sizeId = toNumber((item as AdminProductVariant).sizeId);
    const price = toNumber((item as AdminProductVariant).price);
    if (price <= 0) {
      continue;
    }
    variants.push({
      id: toPositiveNumber((item as AdminProductVariant).id) || undefined,
      sku: String((item as AdminProductVariant).sku || '') || undefined,
      colorId,
      sizeId,
      price,
      imageUrl: String((item as AdminProductVariant).imageUrl || '') || undefined,
      isActive: (item as AdminProductVariant).isActive !== false,
      isSimpleVariant: Boolean((item as AdminProductVariant).isSimpleVariant),
      isSizeOnlyVariant: Boolean((item as AdminProductVariant).isSizeOnlyVariant),
    });
  }

  const images: Array<{ id?: number; url: string }> = [];
  for (const item of (Array.isArray(raw.images) ? raw.images : [])) {
    const url = String((item as { url?: unknown }).url || '').trim();
    if (!url) {
      continue;
    }
    images.push({
      id: toPositiveNumber((item as { id?: unknown }).id) || undefined,
      url,
    });
  }

  const marketplaceColorImages: Array<{ colorId: number; imageUrl: string }> = [];
  for (const item of (Array.isArray(raw.marketplaceColorImages) ? raw.marketplaceColorImages : [])) {
    const colorId = toPositiveNumber((item as { colorId?: unknown }).colorId);
    const imageUrl = String((item as { imageUrl?: unknown }).imageUrl || '').trim();
    if (colorId && imageUrl) {
      marketplaceColorImages.push({ colorId, imageUrl });
    }
  }

  return {
    id,
    name,
    description: String(raw.description || ''),
    categoryId,
    isActive: raw.isActive !== false,
    variantMode: parseVariantMode(raw.variantMode),
    marketplaceVariantColorIds: uniqueNumbers(
      Array.isArray(raw.marketplaceVariantColorIds) ? raw.marketplaceVariantColorIds.map((value) => toPositiveNumber(value)) : [],
    ),
    marketplaceVariantSizeIds: uniqueNumbers(
      Array.isArray(raw.marketplaceVariantSizeIds) ? raw.marketplaceVariantSizeIds.map((value) => toPositiveNumber(value)) : [],
    ),
    marketplaceColorImages,
    variants,
    images,
  };
}
