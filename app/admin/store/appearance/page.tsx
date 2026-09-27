import type { Metadata } from 'next';
import { MarketplaceAppearancePage } from '@/components/marketplace-appearance-page';

export const metadata: Metadata = {
  title: 'Tienda online | Apariencia',
  description: 'Personaliza y publica la apariencia del catalogo online.',
  robots: { index: false, follow: false },
};

export default function MarketplaceAppearanceRoute() {
  return <MarketplaceAppearancePage />;
}
