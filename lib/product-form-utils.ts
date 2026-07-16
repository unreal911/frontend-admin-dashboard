// Helpers puros del formulario de producto (extraidos de admin-product-modal.tsx).
// Sin React ni estado: parsing/normalizacion, archivos e HTML de descripcion.

import type { ProductVariantMode } from '@/components/admin-product-modal';

export function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values.filter((value) => Number.isInteger(value) && value > 0))];
}

export function parseVariantMode(value: unknown): ProductVariantMode {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'SIMPLE' || normalized === 'SIZE_ONLY') {
    return normalized;
  }
  return 'MATRIX';
}

export function toNumber(value: unknown): number {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : 0;
}

export function toPositiveNumber(value: unknown): number {
  const normalized = Number(value);
  return Number.isFinite(normalized) && normalized > 0 ? normalized : 0;
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Forma minima de variante para construir el payload de guardado.
// Compatible con ProductVariantForm del modal y con el manager de variantes.
export interface VariantPayloadInput {
  colorId?: number;
  sizeId?: number;
  price: number;
  isActive?: boolean;
  imageUrl?: string;
  imageFile?: File;
}

// Construye el arreglo `variants` que espera el backend segun el modo.
// Extraido de admin-product-modal.tsx para compartirlo con el manager de variantes.
export async function buildVariantPayload(
  currentVariants: VariantPayloadInput[],
  mode: ProductVariantMode,
): Promise<Array<Record<string, unknown>>> {
  const result: Array<Record<string, unknown>> = [];

  for (const variant of currentVariants) {
    const payload: Record<string, unknown> = {
      price: toNumber(variant.price),
      isActive: variant.isActive !== false,
    };

    if (mode === 'MATRIX') {
      payload.colorId = toPositiveNumber(variant.colorId);
      payload.sizeId = toPositiveNumber(variant.sizeId);
    } else if (mode === 'SIZE_ONLY') {
      payload.sizeId = toPositiveNumber(variant.sizeId);
    }

    if (variant.imageUrl) {
      payload.imageUrl = variant.imageUrl;
    }

    if (variant.imageFile) {
      payload.imageFile = {
        filename: variant.imageFile.name,
        data: await fileToBase64(variant.imageFile),
      };
    }

    result.push(payload);
  }

  return result;
}

export function extractPublicIdFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    const filenameWithExt = pathParts[pathParts.length - 1] || '';
    const folder = pathParts[pathParts.length - 2] || '';
    const filename = filenameWithExt.includes('.')
      ? filenameWithExt.slice(0, filenameWithExt.lastIndexOf('.'))
      : filenameWithExt;
    if (!folder || !filename) {
      return '';
    }
    return `${folder}/${filename}`;
  } catch {
    return '';
  }
}

export function looksLikeHtml(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

export function sanitizeDescriptionHtml(html: string): string {
  const container = document.createElement('div');
  container.innerHTML = html;
  container.querySelectorAll('script,style').forEach((node) => node.remove());
  container.querySelectorAll('*').forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      if (attribute.name.toLowerCase().startsWith('on')) {
        element.removeAttribute(attribute.name);
      }
    });
  });
  return container.innerHTML;
}
