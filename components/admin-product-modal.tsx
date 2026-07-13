'use client';

import {
  ChangeEvent,
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  extractPublicIdFromUrl,
  fileToBase64,
  parseVariantMode,
  toNumber,
  toPositiveNumber,
  uniqueNumbers,
} from '@/lib/product-form-utils';
import { ProductDescriptionEditor } from '@/components/product-description-editor';

export type ProductVariantMode = 'MATRIX' | 'SIMPLE' | 'SIZE_ONLY';

const PRODUCT_WIZARD_STEPS = ['Datos', 'Variantes', 'Imagenes', 'Precios'] as const;

export interface AdminCategoryOption {
  id: number;
  name: string;
}

export interface AdminColorOption {
  id: number;
  name: string;
  hex?: string | null;
}

export interface AdminSizeOption {
  id: number;
  name: string;
}

export interface AdminProductVariant {
  id?: number;
  sku?: string;
  colorId: number;
  sizeId: number;
  price: number;
  imageUrl?: string | null;
  isActive?: boolean;
  isSimpleVariant?: boolean;
  isSizeOnlyVariant?: boolean;
}

export interface AdminProductDetail {
  id: number;
  name: string;
  description?: string;
  categoryId: number;
  afectacionIgv?: string;
  isActive: boolean;
  variantMode?: ProductVariantMode;
  marketplaceVariantColorIds?: number[];
  marketplaceVariantSizeIds?: number[];
  marketplaceColorImages?: Array<{ colorId: number; imageUrl?: string | null }>;
  variants?: AdminProductVariant[];
  images?: Array<{ id?: number; url: string }>;
}

interface ProductVariantForm {
  id?: number;
  sku?: string;
  colorId: number;
  sizeId: number;
  price: number;
  isActive: boolean;
  imageUrl?: string;
  imageFile?: File;
  imagePreview?: string;
}

interface ProductImageForm {
  file?: File;
  preview: string;
  url?: string;
  publicId?: string;
}

interface MarketplaceColorImageForm {
  colorId: number;
  imageUrl?: string;
  imageFile?: File;
  imagePreview?: string;
}

interface VariantGroupImageForm {
  groupType: 'color' | 'size';
  groupId: number;
  imageUrl?: string;
  imageFile?: File;
  imagePreview?: string;
}

export interface AdminProductModalSubmitPayload {
  mode: 'create' | 'edit';
  id?: number;
  payload: Record<string, unknown>;
}

type ProductModalFieldErrors = Partial<Record<
  'name' | 'category' | 'variants' | 'variantPrices' | 'marketplaceVariants',
  string
>>;

interface AdminProductModalProps {
  open: boolean;
  variant?: 'modal' | 'page';
  product: AdminProductDetail | null;
  categories: AdminCategoryOption[];
  colors: AdminColorOption[];
  sizes: AdminSizeOption[];
  isSubmitting?: boolean;
  title?: string;
  description?: string;
  cancelLabel?: string;
  onClose: () => void;
  onSubmit: (payload: AdminProductModalSubmitPayload) => Promise<void> | void;
}

interface GeneratedVariantsResponse {
  variants?: Array<{ colorId?: number; sizeId?: number }>;
  message?: string;
}

function LoadingSpinnerIcon() {
  return (
    <svg className="admin-loading-spinner" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" />
      <path d="M21 12a9 9 0 0 0-9-9" />
    </svg>
  );
}

export function AdminProductModal({
  open,
  variant = 'modal',
  product,
  categories,
  colors,
  sizes,
  isSubmitting = false,
  title,
  description: helperText,
  cancelLabel = 'Cancelar',
  onClose,
  onSubmit,
}: AdminProductModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [afectacionIgv, setAfectacionIgv] = useState('10');
  const [isActive, setIsActive] = useState(true);
  const [variantMode, setVariantMode] = useState<ProductVariantMode>('MATRIX');
  const [selectedColorIds, setSelectedColorIds] = useState<number[]>([]);
  const [selectedSizeIds, setSelectedSizeIds] = useState<number[]>([]);
  const [variants, setVariants] = useState<ProductVariantForm[]>([]);
  const [marketplaceVariantsEnabled, setMarketplaceVariantsEnabled] = useState(false);
  const [marketplaceVariants, setMarketplaceVariants] = useState<ProductVariantForm[]>([]);
  const [marketplaceColorImages, setMarketplaceColorImages] = useState<MarketplaceColorImageForm[]>([]);
  const [variantGroupImages, setVariantGroupImages] = useState<VariantGroupImageForm[]>([]);
  const [productImages, setProductImages] = useState<ProductImageForm[]>([]);
  const [formError, setFormError] = useState('');
  const [formMessage, setFormMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState<ProductModalFieldErrors>({});
  const [isGeneratingVariants, setIsGeneratingVariants] = useState(false);
  const [deletingImageIndex, setDeletingImageIndex] = useState<number | null>(null);
  const [step, setStep] = useState(0);
  const [showCombosDetail, setShowCombosDetail] = useState(false);
  const [collapsedColorGroups, setCollapsedColorGroups] = useState<number[]>([]);
  const formRef = useRef<HTMLFormElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const categorySelectRef = useRef<HTMLSelectElement | null>(null);
  const generateVariantsButtonRef = useRef<HTMLButtonElement | null>(null);
  const marketplaceGenerateButtonRef = useRef<HTMLButtonElement | null>(null);

  const isEditing = Boolean(product?.id);
  const isPage = variant === 'page';
  const isFormVisible = open || isPage;
  const isSimpleMode = variantMode === 'SIMPLE';
  const isSizeOnlyMode = variantMode === 'SIZE_ONLY';

  useEffect(() => {
    if (!isFormVisible) {
      return;
    }

    setFormError('');
    setFormMessage('');
    setFieldErrors({});
    setDeletingImageIndex(null);
    setIsGeneratingVariants(false);
    setStep(0);

    if (!product) {
      setName('');
      setDescription('');
      setCategoryId(null);
      setAfectacionIgv('10');
      setIsActive(true);
      setVariantMode('MATRIX');
      setSelectedColorIds([]);
      setSelectedSizeIds([]);
      setVariants([]);
      setMarketplaceVariantsEnabled(false);
      setMarketplaceVariants([]);
      setMarketplaceColorImages([]);
      setVariantGroupImages([]);
      setProductImages([]);
      return;
    }

    const productVariants = Array.isArray(product.variants) ? product.variants : [];
    const resolvedMode = parseVariantMode(product.variantMode);
    const looksSimple =
      resolvedMode === 'SIMPLE'
      || (productVariants.length === 1 && Boolean(productVariants[0]?.isSimpleVariant));
    const looksSizeOnly =
      resolvedMode === 'SIZE_ONLY'
      || (productVariants.length > 0 && productVariants.every((variant) => Boolean(variant.isSizeOnlyVariant)));
    const mode: ProductVariantMode = looksSimple ? 'SIMPLE' : looksSizeOnly ? 'SIZE_ONLY' : 'MATRIX';

    setName(String(product.name || ''));
    const nextDescription = String(product.description || '');
    setDescription(nextDescription);
    setCategoryId(toPositiveNumber(product.categoryId) || null);
    setAfectacionIgv(product.afectacionIgv || '10');
    setIsActive(Boolean(product.isActive));
    setVariantMode(mode);

    if (mode === 'SIMPLE') {
      const firstVariant = productVariants[0];
      const marketplaceColorIds = uniqueNumbers(product.marketplaceVariantColorIds || []);
      const marketplaceSizeIds = uniqueNumbers(product.marketplaceVariantSizeIds || []);
      const hasMarketplaceVariants = marketplaceColorIds.length > 0 && marketplaceSizeIds.length > 0;
      setSelectedColorIds(hasMarketplaceVariants ? marketplaceColorIds : []);
      setSelectedSizeIds(hasMarketplaceVariants ? marketplaceSizeIds : []);
      const existingMarketplaceColorImages: MarketplaceColorImageForm[] = [];
      for (const image of product.marketplaceColorImages || []) {
        const colorId = toPositiveNumber(image.colorId);
        const imageUrl = String(image.imageUrl || '').trim();
        if (colorId && imageUrl) {
          existingMarketplaceColorImages.push({ colorId, imageUrl, imagePreview: imageUrl });
        }
      }
      setMarketplaceColorImages(existingMarketplaceColorImages);
      setVariants(firstVariant ? [{
        id: toPositiveNumber(firstVariant.id) || undefined,
        sku: String(firstVariant.sku || '') || undefined,
        colorId: toNumber(firstVariant.colorId),
        sizeId: toNumber(firstVariant.sizeId),
        price: toNumber(firstVariant.price),
        isActive: firstVariant.isActive !== false,
        imageUrl: String(firstVariant.imageUrl || '') || undefined,
        imagePreview: String(firstVariant.imageUrl || '') || undefined,
      }] : [{
        colorId: 0,
        sizeId: 0,
        price: 0,
        isActive: true,
      }]);
      setMarketplaceVariantsEnabled(hasMarketplaceVariants);
    } else if (mode === 'SIZE_ONLY') {
      const availableSizes = uniqueNumbers(productVariants.map((variant) => toPositiveNumber(variant.sizeId)));
      setSelectedColorIds([]);
      setSelectedSizeIds(availableSizes);
      setVariants(
        productVariants.map((variant) => ({
          id: toPositiveNumber(variant.id) || undefined,
          sku: String(variant.sku || '') || undefined,
          colorId: 0,
          sizeId: toPositiveNumber(variant.sizeId),
          price: toNumber(variant.price),
          isActive: variant.isActive !== false,
          imageUrl: String(variant.imageUrl || '') || undefined,
          imagePreview: String(variant.imageUrl || '') || undefined,
        })),
      );
      setMarketplaceVariantsEnabled(false);
      setMarketplaceVariants([]);
      setMarketplaceColorImages([]);
    } else {
      const availableColors = uniqueNumbers(productVariants.map((variant) => toPositiveNumber(variant.colorId)));
      const availableSizes = uniqueNumbers(productVariants.map((variant) => toPositiveNumber(variant.sizeId)));
      setSelectedColorIds(availableColors);
      setSelectedSizeIds(availableSizes);
      setVariants(
        productVariants.map((variant) => ({
          id: toPositiveNumber(variant.id) || undefined,
          sku: String(variant.sku || '') || undefined,
          colorId: toPositiveNumber(variant.colorId),
          sizeId: toPositiveNumber(variant.sizeId),
          price: toNumber(variant.price),
          isActive: variant.isActive !== false,
          imageUrl: String(variant.imageUrl || '') || undefined,
          imagePreview: String(variant.imageUrl || '') || undefined,
        })),
      );
      setMarketplaceVariantsEnabled(false);
      setMarketplaceVariants([]);
      setMarketplaceColorImages([]);
    }

    setProductImages(
      (Array.isArray(product.images) ? product.images : [])
        .map((image) => {
          const url = String(image.url || '').trim();
          if (!url) {
            return null;
          }
          return {
            preview: url,
            url,
            publicId: extractPublicIdFromUrl(url),
          } as ProductImageForm;
        })
        .filter((image): image is ProductImageForm => Boolean(image)),
    );
  }, [isFormVisible, product]);

  useEffect(() => {
    if (!isFormVisible || !isSimpleMode || !marketplaceVariantsEnabled) {
      if (!isFormVisible || !isSimpleMode) {
        setMarketplaceVariants([]);
        setMarketplaceColorImages([]);
      }
      return;
    }

    const baseVariant = variants[0];
    if (!baseVariant) {
      setMarketplaceVariants([]);
      return;
    }

    if (!selectedColorIds.length || !selectedSizeIds.length) {
      setMarketplaceVariants([]);
      return;
    }

    const nextVariants: ProductVariantForm[] = [];
    for (const colorId of selectedColorIds) {
      for (const sizeId of selectedSizeIds) {
        nextVariants.push({
          colorId,
          sizeId,
          price: toNumber(baseVariant.price),
          isActive: true,
        });
      }
    }
    setMarketplaceVariants(nextVariants);
  }, [isFormVisible, isSimpleMode, marketplaceVariantsEnabled, selectedColorIds, selectedSizeIds, variants]);

  useEffect(() => {
    if (!isFormVisible || !isSimpleMode || !marketplaceVariantsEnabled) {
      return;
    }

    setMarketplaceColorImages((current) => {
      const byColorId = new Map(current.map((image) => [image.colorId, image]));
      for (const image of product?.marketplaceColorImages || []) {
        const colorId = toPositiveNumber(image.colorId);
        const imageUrl = String(image.imageUrl || '').trim();
        if (colorId && imageUrl && !byColorId.has(colorId)) {
          byColorId.set(colorId, { colorId, imageUrl, imagePreview: imageUrl });
        }
      }
      return selectedColorIds.map((colorId) => byColorId.get(colorId) || { colorId });
    });
  }, [isFormVisible, isSimpleMode, marketplaceVariantsEnabled, selectedColorIds, product]);

  useEffect(() => {
    if (!isFormVisible || isSimpleMode) {
      setVariantGroupImages([]);
      return;
    }

    const groupType: 'color' | 'size' = isSizeOnlyMode ? 'size' : 'color';
    const groupIds = isSizeOnlyMode ? selectedSizeIds : selectedColorIds;

    setVariantGroupImages((current) => {
      const currentByKey = new Map(current.map((image) => [`${image.groupType}-${image.groupId}`, image]));
      return groupIds.map((groupId) => {
        const key = `${groupType}-${groupId}`;
        const existing = currentByKey.get(key);
        if (existing) {
          return existing;
        }

        const variantWithImage = variants.find((variant) => {
          const matchesGroup = groupType === 'color'
            ? variant.colorId === groupId
            : variant.sizeId === groupId;
          return matchesGroup && getVariantPreview(variant);
        });

        return {
          groupType,
          groupId,
          imageUrl: variantWithImage?.imageUrl,
          imagePreview: variantWithImage ? getVariantPreview(variantWithImage) : undefined,
        };
      });
    });
  }, [isFormVisible, isSimpleMode, isSizeOnlyMode, selectedColorIds, selectedSizeIds, variants]);

  useEffect(() => {
    if (!open || isPage) {
      return;
    }

    function onEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    }

    window.addEventListener('keydown', onEscape);
    return () => {
      window.removeEventListener('keydown', onEscape);
    };
  }, [open, isPage, isSubmitting, onClose]);

  const availableColorRows = useMemo(() => {
    return colors.map((color) => ({
      id: color.id,
      name: color.name,
      checked: selectedColorIds.includes(color.id),
      hex: color.hex || null,
    }));
  }, [colors, selectedColorIds]);

  const availableSizeRows = useMemo(() => {
    return sizes.map((size) => ({
      id: size.id,
      name: size.name,
      checked: selectedSizeIds.includes(size.id),
    }));
  }, [sizes, selectedSizeIds]);

  // Agrupa variantes por color (para el editor de precios estilo acordeon en modo MATRIX)
  const variantColorGroups = useMemo(() => {
    const map = new Map<number, Array<{ variant: ProductVariantForm; index: number }>>();
    variants.forEach((variant, index) => {
      const list = map.get(variant.colorId);
      if (list) {
        list.push({ variant, index });
      } else {
        map.set(variant.colorId, [{ variant, index }]);
      }
    });
    return [...map.entries()].map(([colorId, items]) => ({ colorId, items }));
  }, [variants]);

  if (!isFormVisible) {
    return null;
  }

  function toggleColor(colorId: number, checked: boolean) {
    setFormError('');
    clearFieldError('variants');
    clearFieldError('marketplaceVariants');
    setSelectedColorIds((current) => {
      const next = checked ? [...current, colorId] : current.filter((id) => id !== colorId);
      return uniqueNumbers(next);
    });
  }

  function toggleSize(sizeId: number, checked: boolean) {
    setFormError('');
    clearFieldError('variants');
    clearFieldError('marketplaceVariants');
    setSelectedSizeIds((current) => {
      const next = checked ? [...current, sizeId] : current.filter((id) => id !== sizeId);
      return uniqueNumbers(next);
    });
  }

  function onVariantPriceChange(index: number, value: string) {
    const nextPrice = Number(value);
    setVariants((current) => {
      const next = [...current];
      const target = next[index];
      next[index] = {
        ...target,
        price: Number.isFinite(nextPrice) ? nextPrice : 0,
      };
      return next;
    });
  }

  function onVariantActiveChange(index: number, checked: boolean) {
    setVariants((current) => {
      const next = [...current];
      next[index] = {
        ...next[index],
        isActive: checked,
      };
      return next;
    });
  }

  function applyVariantGroupImage(variant: ProductVariantForm): ProductVariantForm {
    const groupImage = variantGroupImages.find((image) => (
      (image.groupType === 'color' && image.groupId === variant.colorId)
      || (image.groupType === 'size' && image.groupId === variant.sizeId)
    ));

    if (!groupImage?.imageFile && !groupImage?.imageUrl && !groupImage?.imagePreview) {
      return variant;
    }

    return {
      ...variant,
      imageUrl: groupImage.imageUrl,
      imageFile: groupImage.imageFile,
      imagePreview: groupImage.imagePreview || groupImage.imageUrl,
    };
  }

  function onVariantGroupImageFileChange(
    groupType: 'color' | 'size',
    groupId: number,
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const preview = URL.createObjectURL(file);
    setVariantGroupImages((current) => {
      const key = `${groupType}-${groupId}`;
      const nextImage: VariantGroupImageForm = {
        groupType,
        groupId,
        imageFile: file,
        imagePreview: preview,
      };
      const withoutCurrent = current.filter((image) => `${image.groupType}-${image.groupId}` !== key);
      return [...withoutCurrent, nextImage];
    });
    setVariants((current) => current.map((variant) => {
      const matchesGroup = groupType === 'color'
        ? variant.colorId === groupId
        : variant.sizeId === groupId;
      return matchesGroup
        ? { ...variant, imageFile: file, imagePreview: preview }
        : variant;
    }));
    event.target.value = '';
  }

  function removeVariantGroupImage(groupType: 'color' | 'size', groupId: number) {
    setVariantGroupImages((current) => current.map((image) => (
      image.groupType === groupType && image.groupId === groupId
        ? { groupType, groupId }
        : image
    )));
    setVariants((current) => current.map((variant) => {
      const matchesGroup = groupType === 'color'
        ? variant.colorId === groupId
        : variant.sizeId === groupId;
      return matchesGroup
        ? {
          ...variant,
          imageFile: undefined,
          imageUrl: undefined,
          imagePreview: undefined,
        }
        : variant;
    }));
  }

  function onMarketplaceColorImageFileChange(colorId: number, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const preview = URL.createObjectURL(file);
    setMarketplaceColorImages((current) => {
      const existing = current.find((image) => image.colorId === colorId);
      const nextImage: MarketplaceColorImageForm = {
        ...(existing || { colorId }),
        imageFile: file,
        imagePreview: preview,
      };
      const withoutCurrent = current.filter((image) => image.colorId !== colorId);
      return [...withoutCurrent, nextImage].sort((a, b) => selectedColorIds.indexOf(a.colorId) - selectedColorIds.indexOf(b.colorId));
    });
    setFormError('');
    setFormMessage(`Preview actualizada para ${getColorName(colorId)}. Guarda cambios para publicarla.`);
    event.target.value = '';
  }

  function removeMarketplaceColorImage(colorId: number) {
    setMarketplaceColorImages((current) => current.map((image) => (
      image.colorId === colorId
        ? { colorId }
        : image
    )));
    setFormMessage(`Imagen de ${getColorName(colorId)} quitada. Guarda cambios para aplicar.`);
  }

  async function generateVariants() {
    setFormError('');
    setFormMessage('');
    clearFieldError('variants');

    if (isSimpleMode) {
      setFormError('En modo producto unico no necesitas generar variantes.');
      return;
    }

    if (!selectedSizeIds.length) {
      setFormError('Selecciona al menos una talla para generar variantes.');
      return;
    }

    const currentByKey = new Map(variants.map((variant) => [`${variant.colorId}-${variant.sizeId}`, variant]));

    if (isSizeOnlyMode) {
      const merged = selectedSizeIds.map((sizeId) => {
        const key = `0-${sizeId}`;
        return applyVariantGroupImage(currentByKey.get(key) || {
          colorId: 0,
          sizeId,
          price: 0,
          isActive: true,
        });
      });
      setVariants(merged);
      clearFieldError('variantPrices');
      return;
    }

    if (!selectedColorIds.length) {
      setFormError('Selecciona al menos un color para generar variantes.');
      return;
    }

    setIsGeneratingVariants(true);
    try {
      const response = await fetch('/api/admin/products/generate-variants', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          colorIds: selectedColorIds,
          sizeIds: selectedSizeIds,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setFormError(String((payload as { message?: unknown } | null)?.message || 'No se pudieron generar variantes.'));
        return;
      }

      const generated = ((payload as GeneratedVariantsResponse | null)?.variants || [])
        .map((item) => ({
          colorId: toPositiveNumber(item.colorId),
          sizeId: toPositiveNumber(item.sizeId),
        }))
        .filter((item) => item.colorId > 0 && item.sizeId > 0);

      const merged = generated.map((item) => {
        const key = `${item.colorId}-${item.sizeId}`;
        return applyVariantGroupImage(currentByKey.get(key) || {
          colorId: item.colorId,
          sizeId: item.sizeId,
          price: 0,
          isActive: true,
        });
      });
      setVariants(merged);
      clearFieldError('variantPrices');
    } catch {
      setFormError('No se pudieron generar variantes.');
    } finally {
      setIsGeneratingVariants(false);
    }
  }

  async function generateMarketplaceVariants() {
    setFormError('');
    setFormMessage('');
    clearFieldError('marketplaceVariants');

    if (!isSimpleMode || !marketplaceVariantsEnabled) {
      return;
    }
    if (!selectedColorIds.length || !selectedSizeIds.length) {
      setFormError('Selecciona al menos un color y una talla para marketplace.');
      return;
    }

    const baseVariant = variants[0];
    if (!baseVariant) {
      setFormError('Configura primero la variante unica.');
      return;
    }

    setIsGeneratingVariants(true);
    try {
      const response = await fetch('/api/admin/products/generate-variants', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          colorIds: selectedColorIds,
          sizeIds: selectedSizeIds,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setFormError(String((payload as { message?: unknown } | null)?.message || 'No se pudieron generar variantes.'));
        return;
      }

      const generated = ((payload as GeneratedVariantsResponse | null)?.variants || [])
        .map((item) => ({
          colorId: toPositiveNumber(item.colorId),
          sizeId: toPositiveNumber(item.sizeId),
        }))
        .filter((item) => item.colorId > 0 && item.sizeId > 0)
        .map((item) => ({
          colorId: item.colorId,
          sizeId: item.sizeId,
          price: toNumber(baseVariant.price),
          isActive: true,
        }));

      setMarketplaceVariants(generated);
      clearFieldError('marketplaceVariants');
    } catch {
      setFormError('No se pudieron generar variantes de marketplace.');
    } finally {
      setIsGeneratingVariants(false);
    }
  }

  function onProductImagesChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    if (!files.length) {
      return;
    }
    const nextItems = files.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    setProductImages((current) => [...current, ...nextItems]);
    event.target.value = '';
  }

  async function removeProductImage(index: number) {
    const image = productImages[index];
    if (!image) {
      return;
    }
    setFormError('');
    setFormMessage('');
    setDeletingImageIndex(index);

    if (image.publicId) {
      try {
        const response = await fetch(`/api/admin/products/image/${encodeURIComponent(image.publicId)}`, {
          method: 'DELETE',
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          setFormError(String((payload as { message?: unknown } | null)?.message || 'No se pudo eliminar la imagen.'));
          setDeletingImageIndex(null);
          return;
        }
        setFormMessage('Imagen eliminada.');
      } catch {
        setFormError('No se pudo eliminar la imagen.');
        setDeletingImageIndex(null);
        return;
      }
    }

    setProductImages((current) => current.filter((_, idx) => idx !== index));
    setDeletingImageIndex(null);
  }

  function handleVariantModeChange(mode: ProductVariantMode) {
    if (variantMode === mode) {
      return;
    }
    setFormError('');
    setFormMessage('');
    setVariantMode(mode);

    if (mode === 'SIMPLE') {
      const firstVariant = variants[0];
      setSelectedColorIds([]);
      setSelectedSizeIds([]);
      setMarketplaceVariantsEnabled(false);
      setMarketplaceVariants([]);
      setMarketplaceColorImages([]);
      setVariantGroupImages([]);
      setVariants([{
        colorId: firstVariant?.colorId ?? 0,
        sizeId: firstVariant?.sizeId ?? 0,
        price: toNumber(firstVariant?.price || 0),
        isActive: firstVariant?.isActive !== false,
        imageUrl: firstVariant?.imageUrl,
        imagePreview: firstVariant?.imagePreview || firstVariant?.imageUrl,
        imageFile: firstVariant?.imageFile,
      }]);
      return;
    }

    if (mode === 'SIZE_ONLY') {
      setSelectedColorIds([]);
      setMarketplaceVariantsEnabled(false);
      setMarketplaceVariants([]);
      setMarketplaceColorImages([]);
      setVariantGroupImages([]);
      setVariants([]);
      return;
    }

    setMarketplaceVariantsEnabled(false);
    setMarketplaceVariants([]);
    setMarketplaceColorImages([]);
    setVariantGroupImages([]);
    setVariants([]);
  }

  async function buildImageFilesPayload() {
    const result: Array<{ filename: string; data: string }> = [];
    for (const image of productImages) {
      if (!image.file) {
        continue;
      }
      result.push({
        filename: image.file.name,
        data: await fileToBase64(image.file),
      });
    }
    return result;
  }

  async function buildVariantPayload(currentVariants: ProductVariantForm[], mode: ProductVariantMode) {
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

  async function buildMarketplaceColorImagesPayload() {
    const result: Array<Record<string, unknown>> = [];

    for (const image of marketplaceColorImages) {
      if (!selectedColorIds.includes(image.colorId)) {
        continue;
      }

      const payload: Record<string, unknown> = {
        colorId: image.colorId,
      };

      if (image.imageUrl) {
        payload.imageUrl = image.imageUrl;
      }

      if (image.imageFile) {
        payload.imageFile = {
          filename: image.imageFile.name,
          data: await fileToBase64(image.imageFile),
        };
      }

      if (payload.imageUrl || payload.imageFile) {
        result.push(payload);
      }
    }

    return result;
  }

  function clearFieldError(field: keyof ProductModalFieldErrors) {
    setFieldErrors((current) => {
      if (!current[field]) {
        return current;
      }
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function focusInvalidControl(errors: ProductModalFieldErrors, firstInvalidPriceIndex: number) {
    window.setTimeout(() => {
      if (errors.name) {
        nameInputRef.current?.focus();
        nameInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      if (errors.category) {
        categorySelectRef.current?.focus();
        categorySelectRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      if (errors.variants) {
        generateVariantsButtonRef.current?.focus();
        generateVariantsButtonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      if (errors.variantPrices && firstInvalidPriceIndex >= 0) {
        const priceInput = formRef.current?.querySelector<HTMLInputElement>(
          `[data-variant-price-index="${firstInvalidPriceIndex}"]`,
        );
        priceInput?.focus();
        priceInput?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      if (errors.marketplaceVariants) {
        marketplaceGenerateButtonRef.current?.focus();
        marketplaceGenerateButtonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 0);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');
    setFormMessage('');
    setFieldErrors({});

    const normalizedName = String(name || '').trim();
    const normalizedDescription = String(description || '').trim();
    const normalizedCategoryId = Number(categoryId);
    const nextFieldErrors: ProductModalFieldErrors = {};
    const firstInvalidPriceIndex = variants.findIndex((variant) => toNumber(variant.price) <= 0);
    const baseVariant = variants[0];
    const normalizedMarketplaceColorIds = uniqueNumbers(selectedColorIds);
    const normalizedMarketplaceSizeIds = uniqueNumbers(selectedSizeIds);
    const effectiveMarketplaceVariants = isSimpleMode && marketplaceVariantsEnabled && baseVariant
      ? normalizedMarketplaceColorIds.flatMap((colorId) => (
        normalizedMarketplaceSizeIds.map((sizeId) => ({
          colorId,
          sizeId,
          price: toNumber(baseVariant.price),
          isActive: true,
        }))
      ))
      : [];

    if (!normalizedName || normalizedName.length < 3) {
      nextFieldErrors.name = 'El nombre es obligatorio y debe tener al menos 3 caracteres.';
    }
    if (!Number.isInteger(normalizedCategoryId) || normalizedCategoryId < 1) {
      nextFieldErrors.category = 'Selecciona una categoria valida.';
    }

    if (!variants.length) {
      nextFieldErrors.variants = isSimpleMode
          ? 'Configura el precio de la variante unica antes de guardar.'
          : 'Genera las variantes antes de guardar.';
    }

    if (firstInvalidPriceIndex >= 0) {
      nextFieldErrors.variantPrices = 'Cada variante debe tener un precio mayor que 0.';
    }

    if (isSimpleMode && marketplaceVariantsEnabled) {
      if (!normalizedMarketplaceColorIds.length || !normalizedMarketplaceSizeIds.length) {
        nextFieldErrors.marketplaceVariants = 'Selecciona al menos un color y una talla para publicar imagenes por color en marketplace.';
      } else if (!baseVariant) {
        nextFieldErrors.marketplaceVariants = 'Configura primero la variante unica antes de publicar variantes marketplace.';
      } else if (effectiveMarketplaceVariants.length === 0) {
        nextFieldErrors.marketplaceVariants = 'No se pudieron preparar las combinaciones marketplace. Revisa colores y tallas.';
      }
    }

    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      setFormError('Revisa los campos marcados antes de guardar.');
      // Saltar al primer paso del wizard que tenga error
      let errorStep = 3;
      if (nextFieldErrors.name || nextFieldErrors.category) {
        errorStep = 0;
      } else if (nextFieldErrors.variants || nextFieldErrors.marketplaceVariants) {
        errorStep = 1;
      } else if (nextFieldErrors.variantPrices) {
        errorStep = 3;
        setCollapsedColorGroups([]); // expandir grupos para ver el precio invalido
      }
      setStep(errorStep);
      focusInvalidControl(nextFieldErrors, firstInvalidPriceIndex);
      return;
    }

    const shouldPersistMarketplaceDimensions = isSimpleMode && marketplaceVariantsEnabled && effectiveMarketplaceVariants.length > 0;
    const imageUrls = productImages.filter((image) => image.url).map((image) => image.url as string);
    const imageFiles = await buildImageFilesPayload();
    const payloadVariants = await buildVariantPayload(variants, variantMode);
    const marketplaceColorImagesPayload = shouldPersistMarketplaceDimensions
      ? await buildMarketplaceColorImagesPayload()
      : [];

    const commonPayload: Record<string, unknown> = {
      name: normalizedName,
      description: normalizedDescription,
      categoryId: normalizedCategoryId,
      afectacionIgv,
      variantMode,
      colorIds: variantMode === 'MATRIX' || shouldPersistMarketplaceDimensions ? normalizedMarketplaceColorIds : [],
      sizeIds: isSimpleMode && !shouldPersistMarketplaceDimensions ? [] : normalizedMarketplaceSizeIds,
      imageUrls,
      variants: payloadVariants,
    };

    if (imageFiles.length) {
      commonPayload.imageFiles = imageFiles;
    }

    if (shouldPersistMarketplaceDimensions) {
      commonPayload.marketplaceColorImages = marketplaceColorImagesPayload;
    }

    if (isEditing && product?.id) {
      commonPayload.isActive = isActive;
      try {
        await onSubmit({
          mode: 'edit',
          id: product.id,
          payload: commonPayload,
        });
      } catch (error) {
        setFormError(error instanceof Error ? error.message : 'No se pudo actualizar el producto.');
      }
      return;
    }

    try {
      await onSubmit({
        mode: 'create',
        payload: commonPayload,
      });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'No se pudo crear el producto.');
    }
  }

  function getColorName(colorId: number) {
    if (!colorId || colorId < 1) {
      return '-';
    }
    return colors.find((color) => color.id === colorId)?.name || 'N/A';
  }

  function getSizeName(sizeId: number) {
    if (!sizeId || sizeId < 1) {
      return '-';
    }
    return sizes.find((size) => size.id === sizeId)?.name || 'N/A';
  }

  function getVariantPreview(variant: ProductVariantForm): string {
    return String(variant.imagePreview || variant.imageUrl || '').trim();
  }

  function getMarketplaceColorImagePreview(colorId: number): string {
    const image = marketplaceColorImages.find((item) => item.colorId === colorId);
    return String(image?.imagePreview || image?.imageUrl || '').trim();
  }

  function getMarketplaceColorImageLabel(colorId: number): string {
    const image = marketplaceColorImages.find((item) => item.colorId === colorId);
    if (image?.imageFile?.name) {
      return image.imageFile.name;
    }
    if (image?.imageUrl) {
      return 'Imagen guardada';
    }
    return 'Sin imagen seleccionada';
  }

  function getVariantGroupPreview(groupType: 'color' | 'size', groupId: number): string {
    const groupImage = variantGroupImages.find((image) => image.groupType === groupType && image.groupId === groupId);
    const groupPreview = String(groupImage?.imagePreview || groupImage?.imageUrl || '').trim();
    if (groupPreview) {
      return groupPreview;
    }

    const target = variants.find((variant) => (
      groupType === 'color'
        ? variant.colorId === groupId
        : variant.sizeId === groupId
    ) && getVariantPreview(variant));
    return target ? getVariantPreview(target) : '';
  }

  function goStep(next: number) {
    const clamped = Math.max(0, Math.min(PRODUCT_WIZARD_STEPS.length - 1, next));
    setStep(clamped);
    setFormError('');
    window.setTimeout(() => {
      const scroller = formRef.current?.closest('.admin-product-modal-dialog, .admin-product-form-card, .admin-product-page-shell');
      scroller?.scrollTo?.({ top: 0, behavior: 'smooth' });
    }, 0);
  }

  function renderOptionChips(kind: 'color' | 'size') {
    const rows = kind === 'color' ? availableColorRows : availableSizeRows;
    const toggle = kind === 'color' ? toggleColor : toggleSize;
    const selectedCount = rows.filter((row) => row.checked).length;
    const setAll = (checked: boolean) => {
      rows.forEach((row) => {
        if (row.checked !== checked) {
          toggle(row.id, checked);
        }
      });
    };
    return (
      <div className="admin-chip-select">
        <div className="admin-chip-select-toolbar">
          <button type="button" className="admin-chip-mini" onClick={() => setAll(true)}>Todos</button>
          <button type="button" className="admin-chip-mini" onClick={() => setAll(false)}>Ninguno</button>
          <span className="admin-chip-count">{selectedCount}/{rows.length}</span>
        </div>
        <div className="admin-chip-grid">
          {rows.map((row) => {
            const hex = kind === 'color' ? (row as { hex?: string | null }).hex : null;
            return (
              <label key={row.id} className={`admin-chip${row.checked ? ' is-on' : ''}`}>
                <input
                  type="checkbox"
                  checked={row.checked}
                  onChange={(event) => toggle(row.id, event.target.checked)}
                />
                {hex ? <span className="admin-chip-swatch" style={{ background: hex }} /> : null}
                <span>{row.name}</span>
              </label>
            );
          })}
        </div>
      </div>
    );
  }

  function renderImagePickerCards(
    items: Array<{
      key: string | number;
      label: string;
      hex?: string | null;
      preview: string;
      onFile: (event: ChangeEvent<HTMLInputElement>) => void;
      onRemove: () => void;
    }>,
  ) {
    return (
      <div className="admin-color-image-cards">
        {items.map((item) => (
          <div key={item.key} className="admin-color-image-card">
            <div className="admin-color-image-thumb">
              {item.preview ? (
                <img src={item.preview} alt={`Preview ${item.label}`} />
              ) : (
                <span className="admin-color-image-thumb-empty">Sin<br />imagen</span>
              )}
            </div>
            <div className="admin-color-image-name">
              {item.hex ? <span className="admin-chip-swatch" style={{ background: item.hex }} /> : null}
              <span>{item.label}</span>
            </div>
            <div className="admin-color-image-actions">
              <label className="admin-file-picker-next">
                <span>{item.preview ? 'Cambiar' : 'Seleccionar'}</span>
                <input type="file" accept="image/*" onChange={item.onFile} />
              </label>
              {item.preview ? (
                <button type="button" className="admin-ghost-btn" onClick={item.onRemove}>
                  Quitar
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    );
  }

  function toggleColorGroup(colorId: number) {
    setCollapsedColorGroups((current) => (
      current.includes(colorId)
        ? current.filter((id) => id !== colorId)
        : [...current, colorId]
    ));
  }

  function setColorGroupPrice(colorId: number, value: string) {
    const parsed = Number(value);
    const price = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    setVariants((current) => current.map((variant) => (
      variant.colorId === colorId ? { ...variant, price } : variant
    )));
    clearFieldError('variantPrices');
  }

  function renderPriceCells(variant: ProductVariantForm, index: number) {
    return (
      <>
        <td>
          <input
            type="number"
            min="0"
            step="0.01"
            value={toNumber(variant.price)}
            data-variant-price-index={index}
            className={fieldErrors.variantPrices && toNumber(variant.price) <= 0 ? 'admin-field-invalid' : undefined}
            aria-invalid={Boolean(fieldErrors.variantPrices && toNumber(variant.price) <= 0)}
            onChange={(event) => {
              onVariantPriceChange(index, event.target.value);
              clearFieldError('variantPrices');
            }}
          />
        </td>
        <td>
          <input
            type="checkbox"
            checked={variant.isActive !== false}
            onChange={(event) => onVariantActiveChange(index, event.target.checked)}
          />
        </td>
      </>
    );
  }

  function renderPriceEditor() {
    if (!variants.length) {
      return null;
    }

    // MATRIX: acordeon agrupado por color (estilo Shopify) + precio masivo por color
    if (variantMode === 'MATRIX') {
      return (
        <div className="admin-variant-groups">
          <div className="admin-chip-select-toolbar admin-variant-groups-toolbar">
            <button type="button" className="admin-chip-mini" onClick={() => setCollapsedColorGroups([])}>Expandir todo</button>
            <button
              type="button"
              className="admin-chip-mini"
              onClick={() => setCollapsedColorGroups(variantColorGroups.map((group) => group.colorId))}
            >
              Colapsar todo
            </button>
            <span className="admin-chip-count">{variants.length} variantes</span>
          </div>

          {variantColorGroups.map((group) => {
            const collapsed = collapsedColorGroups.includes(group.colorId);
            const hex = colors.find((color) => color.id === group.colorId)?.hex || null;
            return (
              <section key={group.colorId} className="admin-variant-group">
                <header className="admin-variant-group-head">
                  <button
                    type="button"
                    className="admin-variant-group-toggle"
                    aria-expanded={!collapsed}
                    onClick={() => toggleColorGroup(group.colorId)}
                  >
                    <span className={`admin-variant-group-caret${collapsed ? '' : ' is-open'}`} aria-hidden="true">▸</span>
                    {hex ? <span className="admin-chip-swatch" style={{ background: hex }} /> : null}
                    <span className="admin-variant-group-name">{getColorName(group.colorId)}</span>
                    <span className="admin-variant-group-count">{group.items.length} tallas</span>
                  </button>
                  <div className="admin-variant-group-bulk">
                    <span>Precio a todas</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="S/"
                      onChange={(event) => setColorGroupPrice(group.colorId, event.target.value)}
                    />
                  </div>
                </header>
                {!collapsed ? (
                  <div className="admin-table-wrap">
                    <table className="admin-table admin-table-sm admin-variant-group-table">
                      <thead>
                        <tr>
                          <th>Talla</th>
                          <th>Precio</th>
                          <th>Activo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.items.map(({ variant, index }) => (
                          <tr key={index}>
                            <td>{getSizeName(variant.sizeId)}</td>
                            {renderPriceCells(variant, index)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      );
    }

    // SIMPLE: producto unico => un solo precio, sin tabla
    if (isSimpleMode) {
      const variant = variants[0];
      return (
        <div className="admin-simple-price">
          <label className="admin-field-block admin-simple-price-field">
            <span>Precio</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={toNumber(variant.price)}
              data-variant-price-index={0}
              className={fieldErrors.variantPrices && toNumber(variant.price) <= 0 ? 'admin-field-invalid' : undefined}
              aria-invalid={Boolean(fieldErrors.variantPrices && toNumber(variant.price) <= 0)}
              onChange={(event) => {
                onVariantPriceChange(0, event.target.value);
                clearFieldError('variantPrices');
              }}
            />
          </label>
          <label className="admin-checkbox">
            <input
              type="checkbox"
              checked={variant.isActive !== false}
              onChange={(event) => onVariantActiveChange(0, event.target.checked)}
            />
            Variante activa
          </label>
        </div>
      );
    }

    // SIZE_ONLY: tabla compacta Talla/Precio/Activo (sin scroll horizontal)
    return (
      <div className="admin-table-wrap">
        <table className="admin-table admin-table-sm admin-variant-group-table">
          <thead>
            <tr>
              <th>Talla</th>
              <th>Precio</th>
              <th>Activo</th>
            </tr>
          </thead>
          <tbody>
            {variants.map((variant, index) => (
              <tr key={`${variant.sizeId}-${index}`}>
                <td>{getSizeName(variant.sizeId)}</td>
                {renderPriceCells(variant, index)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function onFormKeyDown(event: ReactKeyboardEvent<HTMLFormElement>) {
    if (event.key !== 'Enter') {
      return;
    }
    const tag = (event.target as HTMLElement).tagName;
    // Enter no debe enviar el form salvo en el ultimo paso (permitir salto de linea en textarea/editor)
    if (tag !== 'TEXTAREA' && step < PRODUCT_WIZARD_STEPS.length - 1) {
      event.preventDefault();
    }
  }

  return (
    <div
      className={isPage ? 'admin-product-page-shell' : 'admin-modal-overlay'}
      role={isPage ? undefined : 'presentation'}
      onClick={isPage || isSubmitting ? undefined : onClose}
    >
      <div
        className={isPage ? 'admin-card admin-product-form-card' : 'admin-modal-dialog admin-product-modal-dialog'}
        role={isPage ? undefined : 'dialog'}
        aria-modal={isPage ? undefined : true}
        aria-labelledby="admin-product-modal-title"
        onClick={isPage ? undefined : (event) => event.stopPropagation()}
      >
        <div className="admin-product-modal-head">
          <div>
            <h3 id="admin-product-modal-title">{title || (isEditing ? 'Editar producto' : 'Crear producto')}</h3>
            <p>
              {helperText || (isEditing
                ? 'Actualiza los datos del producto existente.'
                : 'Completa los campos para crear un producto nuevo.')}
            </p>
          </div>
          {!isPage ? (
            <button
              type="button"
              className="admin-modal-close-next"
              onClick={onClose}
              disabled={isSubmitting}
              aria-label="Cerrar modal de producto"
            >
              x
            </button>
          ) : null}
        </div>

        {formError ? <p className="admin-modal-error">{formError}</p> : null}
        {formMessage ? <p className="admin-modal-success">{formMessage}</p> : null}

        <form ref={formRef} className="admin-modal-form admin-product-modal-form" onSubmit={handleSubmit} onKeyDown={onFormKeyDown}>
          <div className="admin-product-wizard-steps" role="tablist" aria-label="Pasos del formulario">
            {PRODUCT_WIZARD_STEPS.map((label, index) => (
              <button
                key={label}
                type="button"
                role="tab"
                aria-selected={step === index}
                className={`admin-product-wizard-step${step === index ? ' is-current' : ''}${step > index ? ' is-done' : ''}`}
                onClick={() => goStep(index)}
              >
                <span className="admin-product-wizard-step-num">{index + 1}</span>
                <span className="admin-product-wizard-step-label">{label}</span>
              </button>
            ))}
          </div>

          <div className="admin-wizard-panel" hidden={step !== 0}>
          <div className="admin-product-basic-grid">
            <label>
              <span>Nombre</span>
              <input
                ref={nameInputRef}
                type="text"
                placeholder="Nombre del producto"
                value={name}
                className={fieldErrors.name ? 'admin-field-invalid' : undefined}
                aria-invalid={Boolean(fieldErrors.name)}
                aria-describedby={fieldErrors.name ? 'product-name-error' : undefined}
                disabled={isSubmitting}
                onChange={(event) => {
                  setName(event.target.value);
                  clearFieldError('name');
                  setFormError('');
                }}
              />
              {fieldErrors.name ? (
                <small id="product-name-error" className="admin-field-error-text">
                  {fieldErrors.name}
                </small>
              ) : null}
            </label>

            <label>
              <span>Categoria</span>
              <select
                ref={categorySelectRef}
                value={categoryId ?? ''}
                className={fieldErrors.category ? 'admin-field-invalid' : undefined}
                aria-invalid={Boolean(fieldErrors.category)}
                aria-describedby={fieldErrors.category ? 'product-category-error' : undefined}
                disabled={isSubmitting}
                onChange={(event) => {
                  setCategoryId(toPositiveNumber(event.target.value) || null);
                  clearFieldError('category');
                  setFormError('');
                }}
              >
                <option value="">Selecciona una categoria</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              {fieldErrors.category ? (
                <small id="product-category-error" className="admin-field-error-text">
                  {fieldErrors.category}
                </small>
              ) : null}
            </label>

            <label>
              <span>Afectacion IGV</span>
              <select
                value={afectacionIgv}
                disabled={isSubmitting}
                onChange={(event) => {
                  setAfectacionIgv(event.target.value);
                  setFormError('');
                }}
              >
                <option value="10">Gravado (18%)</option>
                <option value="20">Exonerado</option>
                <option value="30">Inafecto</option>
              </select>
              <small className="admin-field-hint">Determina el IGV en la facturacion electronica.</small>
            </label>
          </div>

          <div className="admin-field-block">
            <span>Descripcion</span>
            <ProductDescriptionEditor value={description} onChange={setDescription} />
          </div>

          </div>

          <div className="admin-wizard-panel" hidden={step !== 1}>
          <section className="admin-product-mode-box">
            <h4>Tipo de producto</h4>
            <label className="admin-checkbox">
              <input
                type="radio"
                name="variant-mode"
                checked={variantMode === 'MATRIX'}
                onChange={() => handleVariantModeChange('MATRIX')}
              />
              Con variantes (color y talla)
            </label>
            <label className="admin-checkbox">
              <input
                type="radio"
                name="variant-mode"
                checked={variantMode === 'SIMPLE'}
                onChange={() => handleVariantModeChange('SIMPLE')}
              />
              Producto unico (sin color/talla)
            </label>
            <label className="admin-checkbox">
              <input
                type="radio"
                name="variant-mode"
                checked={variantMode === 'SIZE_ONLY'}
                onChange={() => handleVariantModeChange('SIZE_ONLY')}
              />
              Producto unico con talla (sin color)
            </label>
          </section>

          {isSimpleMode ? (
            <section className="admin-product-mode-box">
              <label className="admin-checkbox">
                <input
                  type="checkbox"
                  checked={marketplaceVariantsEnabled}
                  onChange={(event) => {
                    setMarketplaceVariantsEnabled(event.target.checked);
                    clearFieldError('marketplaceVariants');
                    setFormError('');
                  }}
                />
                Variantes para marketplace (color/talla)
              </label>

              {marketplaceVariantsEnabled ? (
                <>
                  <div className="admin-product-selection-grid">
                    <div className="admin-product-select-box">
                      <h5>Colores marketplace</h5>
                      {renderOptionChips('color')}
                    </div>

                    <div className="admin-product-select-box">
                      <h5>Tallas marketplace</h5>
                      {renderOptionChips('size')}
                    </div>
                  </div>

                  <div className="admin-product-inline-actions">
                    <button
                      ref={marketplaceGenerateButtonRef}
                      type="button"
                      className="admin-primary-btn"
                      onClick={generateMarketplaceVariants}
                      disabled={isGeneratingVariants || isSubmitting}
                    >
                      {isGeneratingVariants ? 'Generando...' : 'Generar variantes marketplace'}
                    </button>
                  </div>
                  {fieldErrors.marketplaceVariants ? (
                    <p className="admin-field-error-text admin-product-block-error">
                      {fieldErrors.marketplaceVariants}
                    </p>
                  ) : null}

                  {marketplaceVariants.length ? (
                    <div className="admin-combos-summary">
                      <div className="admin-combos-summary-text">
                        <strong>{marketplaceVariants.length} combinaciones</strong>
                        <span>{selectedColorIds.length} colores × {selectedSizeIds.length} tallas</span>
                      </div>
                      <button
                        type="button"
                        className="admin-chip-mini"
                        aria-expanded={showCombosDetail}
                        onClick={() => setShowCombosDetail((value) => !value)}
                      >
                        {showCombosDetail ? 'Ocultar detalle' : 'Ver detalle'}
                      </button>
                    </div>
                  ) : null}

                  {showCombosDetail && marketplaceVariants.length ? (
                    <div className="admin-table-wrap">
                      <table className="admin-table admin-table-sm">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Color</th>
                            <th>Talla</th>
                            <th>Precio base</th>
                          </tr>
                        </thead>
                        <tbody>
                          {marketplaceVariants.map((variant, index) => (
                            <tr key={`${variant.colorId}-${variant.sizeId}-${index}`}>
                              <td>{index + 1}</td>
                              <td>{getColorName(variant.colorId)}</td>
                              <td>{getSizeName(variant.sizeId)}</td>
                              <td>S/ {toNumber(variant.price).toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </>
              ) : null}
            </section>
          ) : (
            <div className={`admin-product-selection-grid ${isSizeOnlyMode ? 'size-only' : ''}`}>
              {!isSizeOnlyMode ? (
                <section className="admin-product-select-box">
                  <h5>Colores</h5>
                  {renderOptionChips('color')}
                </section>
              ) : null}

              <section className="admin-product-select-box">
                <h5>Tallas</h5>
                {renderOptionChips('size')}
              </section>
            </div>
          )}

          {!isSimpleMode ? (
            <div className="admin-product-inline-actions">
              <button
                ref={generateVariantsButtonRef}
                type="button"
                className="admin-primary-btn"
                onClick={generateVariants}
                disabled={isGeneratingVariants || isSubmitting}
              >
                {isGeneratingVariants ? 'Generando...' : isSizeOnlyMode ? 'Generar por talla' : 'Generar variantes'}
              </button>
            </div>
          ) : null}
          {fieldErrors.variants ? (
            <p className="admin-field-error-text admin-product-block-error">
              {fieldErrors.variants}
            </p>
          ) : null}
          </div>

          <div className="admin-wizard-panel" hidden={step !== 2}>
          <section className="admin-product-select-box">
            <h5>Imagenes del producto</h5>
            <input type="file" accept="image/*" multiple onChange={onProductImagesChange} />
            {productImages.length ? (
              <div className="admin-product-image-grid">
                {productImages.map((image, index) => (
                  <article key={`${image.preview}-${index}`} className="admin-product-image-card">
                    <img src={image.preview} alt="Imagen de producto" />
                    <div>
                      <span>{image.file?.name || image.url || 'Imagen existente'}</span>
                      <button
                        type="button"
                        className="admin-ghost-btn"
                        disabled={deletingImageIndex === index || isSubmitting}
                        onClick={() => removeProductImage(index)}
                      >
                        {deletingImageIndex === index ? 'Eliminando...' : 'Eliminar'}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
          </section>

          {isSimpleMode && marketplaceVariantsEnabled && selectedColorIds.length ? (
            <section className="admin-marketplace-color-images-next">
              <div className="admin-marketplace-color-images-head-next">
                <div>
                  <h5>Imagenes por color marketplace</h5>
                  <p>Estas imagenes se usaran en la vista del marketplace al elegir cada color.</p>
                </div>
                <span>{selectedColorIds.length} color(es)</span>
              </div>

              {renderImagePickerCards(selectedColorIds.map((colorId) => ({
                key: colorId,
                label: getColorName(colorId),
                hex: colors.find((color) => color.id === colorId)?.hex || null,
                preview: getMarketplaceColorImagePreview(colorId),
                onFile: (event) => onMarketplaceColorImageFileChange(colorId, event),
                onRemove: () => removeMarketplaceColorImage(colorId),
              })))}
            </section>
          ) : null}

          {!isSimpleMode && (isSizeOnlyMode ? selectedSizeIds.length : selectedColorIds.length) ? (
            <section className="admin-marketplace-color-images-next">
              <div className="admin-marketplace-color-images-head-next">
                <div>
                  <h5>{isSizeOnlyMode ? 'Imagenes por talla' : 'Imagenes por color'}</h5>
                  <p>
                    {isSizeOnlyMode
                      ? 'La imagen se aplicara a la variante de cada talla.'
                      : 'La imagen se aplicara a todas las tallas del color seleccionado.'}
                  </p>
                </div>
                <span>
                  {isSizeOnlyMode
                    ? `${selectedSizeIds.length} talla(s)`
                    : `${selectedColorIds.length} color(es)`}
                </span>
              </div>

              {renderImagePickerCards((isSizeOnlyMode ? selectedSizeIds : selectedColorIds).map((groupId) => {
                const groupType: 'color' | 'size' = isSizeOnlyMode ? 'size' : 'color';
                return {
                  key: `${groupType}-${groupId}`,
                  label: isSizeOnlyMode ? getSizeName(groupId) : getColorName(groupId),
                  hex: isSizeOnlyMode ? null : (colors.find((color) => color.id === groupId)?.hex || null),
                  preview: getVariantGroupPreview(groupType, groupId),
                  onFile: (event) => onVariantGroupImageFileChange(groupType, groupId, event),
                  onRemove: () => removeVariantGroupImage(groupType, groupId),
                };
              }))}
            </section>
          ) : null}

          </div>

          <div className="admin-wizard-panel" hidden={step !== 3}>
          {renderPriceEditor()}
          {fieldErrors.variantPrices ? (
            <p className="admin-field-error-text admin-product-block-error">
              {fieldErrors.variantPrices}
            </p>
          ) : null}

          {isEditing ? (
            <label className="admin-checkbox">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(event) => setIsActive(event.target.checked)}
              />
              Producto activo
            </label>
          ) : null}

          </div>

          <div className="admin-modal-actions admin-product-wizard-nav">
            <button type="button" className="admin-ghost-btn" onClick={onClose} disabled={isSubmitting}>
              {cancelLabel}
            </button>
            <span className="admin-product-wizard-nav-spacer" aria-hidden="true" />
            <span className="admin-product-wizard-nav-count">Paso {step + 1} de {PRODUCT_WIZARD_STEPS.length}</span>
            {step > 0 ? (
              <button
                type="button"
                className="admin-ghost-btn"
                onClick={() => goStep(step - 1)}
                disabled={isSubmitting}
              >
                ← Atras
              </button>
            ) : null}
            {step < PRODUCT_WIZARD_STEPS.length - 1 ? (
              <button
                key="wizard-next"
                type="button"
                className="admin-primary-btn admin-submit-btn-next"
                onClick={() => goStep(step + 1)}
                disabled={isSubmitting}
              >
                Siguiente →
              </button>
            ) : (
              <button key="wizard-submit" type="submit" className="admin-primary-btn admin-submit-btn-next" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <LoadingSpinnerIcon />
                    {isEditing ? 'Actualizando...' : 'Creando...'}
                  </>
                ) : (
                  isEditing ? 'Actualizar' : 'Crear producto'
                )}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
