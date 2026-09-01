# Kiku AI Assistant for Shopify

Kiku is an intelligent shopping assistant that runs directly on Shopify storefronts with:
- **Zero theme CSS conflict** via Web Component Shadow DOM isolation
- **Automated Catalog Ingestion** on product views (`{{ product | json }}`)
- **Native Shopify Cart Integration** via AJAX `/cart/add.js` and `/cart.js`
- **Voice & Visual Search** built-in with multilingual support

---

## Quick Setup Options

### Option 1: Direct Liquid Theme Embed (Fastest)

Add the snippet to your theme's `layout/theme.liquid` just before `</body>`:

```liquid
{% render 'kiku-embed', site_id: 'YOUR_SITE_ID', api_token: 'YOUR_API_TOKEN' %}
```

Or paste directly:
```html
<script>
  window.AkropolysConfig = {
    siteId: "YOUR_SITE_ID",
    apiToken: "YOUR_API_TOKEN",
    {% if product %}
    product: {{ product | json }},
    {% endif %}
  };
</script>
<script src="https://cdn.akropolys.cloud/kiku.iife.js" defer></script>
```

---

### Option 2: Shopify Theme App Extension (Online Store 2.0)

If you are packaging Kiku as a Shopify App:
1. Copy `blocks/kiku-button.liquid` into your extension's `blocks/` directory.
2. Copy `dist/kiku.iife.global.js` (or `dist/shopify.global.js`) as `assets/kiku.iife.js`.
3. Merchants can add the "Kiku AI Assistant" App Block directly from the Shopify Theme Customizer!

---

## JavaScript API (`window.Kiku`)

Once loaded, Kiku exposes `window.Kiku`:

```javascript
// Open the chat modal
window.Kiku.open();

// Close the chat modal
window.Kiku.close();

// Toggle chat modal
window.Kiku.toggle();

// Ingest a custom product dynamically
window.Kiku.ingest({
  id: "12345",
  title: "Custom Hoodie",
  price: "49.99",
  image: "https://example.com/image.jpg",
  url: "/products/custom-hoodie"
});

// Access underlying AkropolysClient instance
const client = window.Kiku.getClient();
```
