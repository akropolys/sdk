import React from 'react';
import type { ChatSource } from '../hooks/useChat';
import { useAkropolysContext } from './AkropolysProvider';
import { resolveDisplayFields } from '../client';

interface ComparisonMatrixProps {
  sources: ChatSource[];
  defaultCurrency?: string;
}

// ── Key normalization ─────────────────────────────────────────────────────────

function normalizeKey(key: string): string {
  // e.g. "salary_range" -> "Salary Range", "productName" -> "Product Name", "priceNumeric" -> "Price Numeric"
  // 1. replace snake_case or kebab-case with spaces
  let s = key.replace(/[_-]+/g, ' ');
  // 2. insert space before uppercase letters (camelCase)
  s = s.replace(/([a-z])([A-Z])/g, '$1 $2');
  // 3. title case the words
  return s.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function getBaseGroup(normalized: string): string {
  const norm = normalized.toLowerCase().trim();
  if (norm.startsWith('salary') || norm.startsWith('pay') || norm.startsWith('wage')) {
    return 'Salary';
  }
  if (norm.startsWith('price') || norm.startsWith('cost') || norm.startsWith('rate')) {
    return 'Price';
  }
  if (norm.startsWith('location') || norm.startsWith('address') || norm.startsWith('city')) {
    return 'Location';
  }
  if (norm.startsWith('image') || norm.startsWith('photo') || norm.startsWith('pic') || norm.startsWith('thumb')) {
    return 'Image';
  }
  if (norm.startsWith('title') || norm.startsWith('name') || norm.startsWith('label') || norm.startsWith('heading')) {
    return 'Title';
  }
  return normalized;
}

// ── Row types ─────────────────────────────────────────────────────────────────

interface Row {
  label: string;
  values: (string | null)[];
  type?: 'image' | 'price' | 'availability' | 'text';
  bestIdx?: number;
}

function buildRows(products: ChatSource[], displayConfig?: Record<string, string>, defaultCurrency = 'KES'): Row[] {
  const rows: Row[] = [];

  // 1. Resolved display fields for each product
  const resolved = products.map(p => resolveDisplayFields(p.fields || p, displayConfig));

  // 2. Image preview row (standard prefix row)
  rows.push({
    label: 'Product Preview',
    values: resolved.map(r => r.image || null),
    type: 'image',
  });

  // 3. Price row (standard prefix row)
  const prices = resolved.map(r => {
    const n = parseFloat(String(r.price ?? '').replace(/[^0-9.]/g, ''));
    return isNaN(n) ? null : n;
  });
  const priceLabels = products.map((p, i) => {
    const r = resolved[i];
    const c = p.fields?.currency || p.currency || defaultCurrency;
    const n = prices[i];
    return n !== null
      ? `${c} ${n.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : null;
  });
  const validPrices = prices.filter((p): p is number => p !== null);
  const minPrice = validPrices.length ? Math.min(...validPrices) : null;
  rows.push({
    label: 'Price',
    values: priceLabels,
    type: 'price',
    bestIdx: minPrice !== null ? prices.indexOf(minPrice) : undefined,
  });

  // 4. Collect other keys to display.
  // We exclude core keys and anything that resolves to display primitives.
  const keysToExclude = new Set<string>([
    'url', 'fields', 'id', 'score', 'currency', 'status', 'indexed_at', 'indexedAt'
  ]);
  
  if (displayConfig) {
    Object.values(displayConfig).forEach(v => {
      if (v) keysToExclude.add(v);
    });
  }

  const commonKeys = [
    'title', 'name', 'label', 'headline', 'subject', 'job_title', 'listing_title', 'common_name', 'product_name',
    'image', 'images', 'thumbnail', 'photo', 'cover', 'featured_image', 'hero_image', 'listing_image', 'logo',
    'price', 'cost', 'listingPrice', 'rate', 'fee', 'startingFrom',
    'brand', 'category', 'location', 'type', 'variety', 'make'
  ];
  commonKeys.forEach(k => keysToExclude.add(k));

  const allFieldKeys = new Set<string>();
  products.forEach(p => {
    const f = p.fields || p;
    if (f) {
      Object.keys(f).forEach(k => {
        if (!keysToExclude.has(k)) {
          allFieldKeys.add(k);
        }
      });
    }
  });

  const groupedKeys = new Map<string, string[]>();
  allFieldKeys.forEach(k => {
    const norm = normalizeKey(k);
    const base = getBaseGroup(norm);
    if (!groupedKeys.has(base)) {
      groupedKeys.set(base, []);
    }
    groupedKeys.get(base)!.push(k);
  });

  const sortedGroups = Array.from(groupedKeys.keys()).sort();

  sortedGroups.forEach(group => {
    const originalKeys = groupedKeys.get(group)!;
    const values = products.map(p => {
      const f = p.fields || p;
      if (!f) return null;
      for (const k of originalKeys) {
        if (f[k] !== undefined && f[k] !== null) {
          if (typeof f[k] === 'object') {
            return JSON.stringify(f[k]);
          }
          return String(f[k]);
        }
      }
      return null;
    });

    if (values.some(v => v !== null)) {
      rows.push({
        label: group,
        values,
        type: 'text',
      });
    }
  });

  return rows;
}

// ── Sub-renderers ─────────────────────────────────────────────────────────────

function ImageCell({ value, name }: { value: string | null; name: string }) {
  if (!value) {
    return <div style={{ fontSize: 28, textAlign: 'center' }}>📦</div>;
  }
  return (
    <img
      src={value}
      alt={name}
      style={{
        width: 72,
        height: 72,
        objectFit: 'contain',
        borderRadius: 8,
        background: '#f5f5f5',
        display: 'block',
      }}
    />
  );
}

function AvailabilityCell({ value }: { value: string | null }) {
  if (!value) return <span style={{ color: '#9ca3af' }}>—</span>;
  const inStock = /in.?stock/i.test(value);
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--hsk-text, #111827)' }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
        background: inStock ? '#22c55e' : '#ef4444',
        boxShadow: inStock ? '0 0 0 3px rgba(34,197,94,0.2)' : '0 0 0 3px rgba(239,68,68,0.2)',
        display: 'inline-block',
      }} />
      {value}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ComparisonMatrix({ sources, defaultCurrency = 'KES' }: ComparisonMatrixProps) {
  const client = useAkropolysContext();
  if (sources.length < 2) return null;

  const products = sources.slice(0, 3);
  const rows = buildRows(products, client?.display, defaultCurrency);

  const colTemplate = `140px repeat(${products.length}, 1fr)`;

  const labelStyle: React.CSSProperties = {
    padding: '10px 12px',
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--hsk-text-muted, #4b5563)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    borderBottom: '1px solid var(--hsk-border, rgba(0,0,0,0.07))',
    verticalAlign: 'middle',
    whiteSpace: 'nowrap',
    display: 'flex',
    alignItems: 'center',
  };

  const cellBase: React.CSSProperties = {
    padding: '10px 14px',
    fontSize: 13,
    color: 'var(--hsk-text, #111827)',
    borderBottom: '1px solid var(--hsk-border, rgba(0,0,0,0.07))',
    verticalAlign: 'middle',
    display: 'flex',
    alignItems: 'center',
  };

  return (
    <div
      className="hsk-compare-matrix"
      style={{
        marginTop: 10,
        borderRadius: 12,
        overflow: 'hidden',
        border: '1px solid var(--hsk-border, rgba(0,0,0,0.09))',
        background: 'var(--hsk-surface, #fff)',
        fontSize: 13,
      }}
    >
      {/* ── Header ── */}
      <div style={{ display: 'grid', gridTemplateColumns: colTemplate, background: 'var(--hsk-surface2, #f9fafb)', borderBottom: '2px solid var(--hsk-border, rgba(0,0,0,0.09))' }}>
        <div style={{ ...labelStyle, borderBottom: 'none', color: 'var(--hsk-text, #111)', fontSize: 12 }}>Feature</div>
        {products.map((p, i) => {
          const { title } = resolveDisplayFields(p.fields || p, client?.display);
          return (
            <a
              key={i}
              href={p.url || '#'}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '10px 14px',
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--hsk-primary, #16a34a)',
                textDecoration: 'none',
                lineHeight: 1.3,
                borderLeft: i > 0 ? '1px solid var(--hsk-border, rgba(0,0,0,0.07))' : 'none',
              }}
            >
              {title}
            </a>
          );
        })}
      </div>

      {/* ── Data rows ── */}
      {rows.map((row, rowIdx) => (
        <div
          key={rowIdx}
          style={{
            display: 'grid',
            gridTemplateColumns: colTemplate,
            background: rowIdx % 2 === 1 ? 'var(--hsk-surface2, rgba(0,0,0,0.015))' : 'transparent',
          }}
        >
          {/* Label */}
          <div style={labelStyle}>{row.label}</div>

          {/* Values */}
          {products.map((p, i) => {
            const val = row.values[i];
            const isBest = row.bestIdx === i && row.values.filter(Boolean).length > 1;
            const { title } = resolveDisplayFields(p.fields || p, client?.display);

            if (row.type === 'image') {
              return (
                <div key={i} style={{ ...cellBase, justifyContent: 'center', padding: '12px', borderLeft: i > 0 ? '1px solid var(--hsk-border, rgba(0,0,0,0.07))' : 'none' }}>
                  <ImageCell value={val} name={title} />
                </div>
              );
            }
            if (row.type === 'availability') {
              return (
                <div key={i} style={{ ...cellBase, borderLeft: i > 0 ? '1px solid var(--hsk-border, rgba(0,0,0,0.07))' : 'none' }}>
                  <AvailabilityCell value={val} />
                </div>
              );
            }
            return (
              <div
                key={i}
                style={{
                  ...cellBase,
                  fontWeight: isBest ? 700 : 400,
                  color: isBest
                    ? 'var(--hsk-primary, #ea580c)'
                    : row.type === 'price'
                      ? 'var(--hsk-text, #374151)'
                      : 'var(--hsk-text, #111827)',
                  borderLeft: i > 0 ? '1px solid var(--hsk-border, rgba(0,0,0,0.07))' : 'none',
                }}
              >
                {val ?? <span style={{ color: '#9ca3af' }}>—</span>}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
