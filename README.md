# Gely glasses storefront (React + Vite + Shopify Storefront API)

1. `npm install`
2. Copy `.env.example` to `.env` and fill in your store domain and PUBLIC Storefront API token
3. `npm run dev` (or `npm run build` to deploy `dist/` to Vercel, Netlify or Cloudflare Pages)

Without credentials the site runs in demo mode with sample products.
Shopify setup: create a custom app, enable the Storefront API, and grant
`unauthenticated_read_product_listings`, `unauthenticated_write_checkouts` and `unauthenticated_read_checkouts`.
Checkout redirects to Shopify's hosted checkout.
