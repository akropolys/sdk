import { Product, SiteConfig } from './types';

function getText(el: Element, selector?: string): string {
  if (!selector) return '';
  const found = el.querySelector(selector);
  return found?.textContent?.trim() ?? '';
}

function getAttr(el: Element, selector: string | undefined, attr: string): string {
  if (!selector) return '';
  const found = el.querySelector(selector);
  return found?.getAttribute(attr)?.trim() ?? '';
}

function getAll(el: Element, selector: string | undefined): string[] {
  if (!selector) return [];
  return Array.from(el.querySelectorAll(selector))
    .map(n => n.getAttribute('src') || n.getAttribute('href') || n.textContent?.trim() || '')
    .filter(Boolean);
}

function parsePrice(raw: string): number | undefined {
  const num = parseFloat(raw.replace(/[^0-9.]/g, ''));
  return isNaN(num) ? undefined : num;
}

export function extractProducts(config: SiteConfig): Product[] {
  const containers = document.querySelectorAll(config.selectorContainer);
  if (!containers.length) return [];

  const products: Product[] = [];

  containers.forEach(el => {
    const name = getText(el, config.selectorName);
    const price = getText(el, config.selectorPrice);
    const rawUrl = getAttr(el, config.selectorUrl, 'href')
      || (el as HTMLAnchorElement).href
      || window.location.href;
    const url = rawUrl.startsWith('http') ? rawUrl : `${window.location.origin}${rawUrl}`;

    if (!name || !price || !url) return;

    const product: Product = {
      name,
      price,
      url,
      brand: getText(el, config.selectorBrand) || undefined,
      description: getText(el, config.selectorDescription) || undefined,
      originalPrice: getText(el, config.selectorOriginalPrice) || undefined,
      discount: getText(el, config.selectorDiscount) || undefined,
      currency: config.currency ?? 'KES',
      availability: getText(el, config.selectorAvailability) || undefined,
      rating: getText(el, config.selectorRating) || undefined,
      category: getText(el, config.selectorCategory) || undefined,
      images: config.selectorImage ? getAll(el, config.selectorImage) : undefined,
      priceNumeric: parsePrice(price),
      slug: url.split('/').filter(Boolean).pop(),
    };

    products.push(product);
  });

  return products;
}
