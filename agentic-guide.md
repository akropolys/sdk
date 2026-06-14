# Agentic Configuration & Integration Guide: @akropolys/sdk

This guide instructs agentic AI assistants, code generators, and developers on how to configure and integrate the `@akropolys/sdk` package based on the project's target domain (vertical).

---

## 1. Domain Entrypoints

The SDK provides specialized entrypoints to ensure correct schemas and UI configurations:
1. **Commerce / E-Commerce**: `@akropolys/sdk/commerce`
2. **Real Estate / Property**: `@akropolys/sdk/property`

Both entrypoints export matching React components and hooks, but import routing changes how user intents, currency units, and data schemas are parsed.

---

## 2. Configuring Commerce Projects

For shopping grids, standard catalog checkouts, and e-commerce carts.

### Import Path
```tsx
import { AkropolysProvider, usePageIngest, SearchBar, ChatWidget } from '@akropolys/sdk/commerce';
```

### Ingestion Data Schema
Call `usePageIngest` on product detail layouts:
```tsx
usePageIngest({
  name: "Vintage Leather Jacket",
  price: "KSh 4,500",
  currency: "KES",
  images: ["https://example.com/images/jacket-1.jpg"],
  category: "Clothing",
  brand: "Levis",
  description: "Genuine brown vintage leather jacket in excellent condition.",
  availability: "InStock", // 'InStock' | 'OutOfStock' | 'PreOrder'
  stock: "15",
  rating: "4.8",
  reviewCount: 32
});
```

### Conversational Widget Features
* **Active components**: Shopping cart drawer, M-Pesa payment prompting, stripe credit forms, order confirmation steps.

---

## 3. Configuring Real Estate & Property Projects

For property sales, rental directories, land listings, and zoning lookups.

### Import Path
```tsx
import { AkropolysProvider, usePageIngest, SearchBar, ChatWidget } from '@akropolys/sdk/property';
```

### Ingestion Data Schema
Property ingestion maps domain-specific coordinates, dimensions, locations, and agents:
```tsx
usePageIngest({
  name: "Spectacular 5 Bedroom Nyari Home",
  property_type: "House",           // House, Apartment, Townhouse, Land, Condo
  listing_status: "For Sale",       // For Sale, For Rent, Sold, Active
  listing_price: 160000000.00,      // Float
  currency: "KES",                  // Local currency code (USD, KES, AED, etc.)
  price_upon_request: false,
  
  // Dimensions & Layout
  bedrooms: 5,
  bathrooms: 5.5,                   // Fractional values supported
  living_area_sqft: 5400,
  living_area_sqm: 501.6,
  total_area_sqft: 6000,
  total_area_sqm: 557.4,
  land_size: 0.50,
  land_size_unit: "Acres",          // Acres, Hectares, sqft, sqm
  
  // Geolocation & Sub-localities
  address: "Nyari Estate Drive",
  neighborhood: "Nyari",
  district: "Westlands",
  city: "Nairobi",
  county: "Nairobi County",
  country: "Kenya",
  latitude: -1.2345,
  longitude: 36.7890,
  
  // Agent Details
  listing_agent_name: "Mamta Shah",
  listing_agent_phone: "+254700000000",
  listing_agent_email: "mamta@example.com",
  listing_agent_photo: "https://example.com/agents/mamta.jpg",
  listing_agent_whatsapp: "https://wa.me/254700000000",
  listing_agent_license: "REA-99432",
  brokerage: "Pam Golding Properties",
  
  // Specifications
  year_built: 2020,
  tenure: "Freehold",               // Freehold, Leasehold
  description: "A gorgeous 5 bedroom villa with land size 0.50 Acres..."
});
```

### Conversational Widget Features
* **Active components**: Tabular property spec summaries, side-by-side comparison tables. Cart options, payment buttons, and checkout flows are completely suppressed.

---

## 4. Key Implementation Rules
1. **Dynamic Currency**: Price values are parsed using the listing's native `currency` setting. Avoid hardcoding currency indicators in template strings.
2. **Context Integrity**: Maintain strict separation of e-commerce features (avoid rendering cart buttons or order logs) on real estate dashboards.
