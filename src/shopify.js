// Shopify Storefront API client. Only the PUBLIC storefront token is used.
const DOMAIN = import.meta.env.VITE_SHOPIFY_DOMAIN;
const TOKEN = import.meta.env.VITE_SHOPIFY_STOREFRONT_TOKEN;
const API_VERSION = "2025-07";
export const isLive = Boolean(DOMAIN && TOKEN);

// Fixed sale pricing — the site never uses Shopify's price, only these.
export const SALE_PRICE = 69.99;
export const REGULAR_PRICE = 140;

async function gql(query, variables = {}) {
  const res = await fetch(`https://${DOMAIN}/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Storefront-Access-Token": TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0].message);
  return json.data;
}

export const money = (amount, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount);

// ---------- Products ----------
const PRODUCTS = `{
  products(first: 12) { edges { node {
    id handle title description
    featuredImage { url altText }
    variants(first: 10) { edges { node { id title availableForSale price { amount currencyCode } compareAtPrice { amount } } } }
  } } }
}`;

export async function fetchProducts() {
  const data = await gql(PRODUCTS);
  return data.products.edges.map(({ node: p }) => ({
    id: p.id, handle: p.handle, title: p.title, description: p.description,
    image: p.featuredImage?.url || null,
    variants: p.variants.edges.map(({ node: v }) => ({
      id: v.id, title: v.title, available: v.availableForSale,
      price: parseFloat(v.price.amount), currency: v.price.currencyCode,
      compareAt: v.compareAtPrice ? parseFloat(v.compareAtPrice.amount) : null,
    })),
  }));
}

// ---------- Cart ----------
const CART = `
  id checkoutUrl totalQuantity
  cost { subtotalAmount { amount currencyCode } }
  lines(first: 50) { edges { node {
    id quantity
    merchandise { ... on ProductVariant {
      id title price { amount currencyCode } compareAtPrice { amount }
      image { url } product { title featuredImage { url } }
    } }
  } } }`;

export function normalizeCart(c) {
  const lines = c.lines.edges.map(({ node: l }) => ({
    id: l.id, qty: l.quantity, variantId: l.merchandise.id,
    title: l.merchandise.product.title, variantTitle: l.merchandise.title,
    price: SALE_PRICE, compareAt: REGULAR_PRICE,
    image: l.merchandise.image?.url || l.merchandise.product.featuredImage?.url || null,
  }));
  return {
    id: c.id, checkoutUrl: c.checkoutUrl, count: c.totalQuantity,
    subtotal: lines.reduce((n, l) => n + l.qty * l.price, 0), currency: c.cost.subtotalAmount.currencyCode,
    lines,
  };
}

export const getCart = async (id) => (await gql(`query($id: ID!){ cart(id:$id){ ${CART} } }`, { id })).cart;
export const createCart = async (variantId) =>
  (await gql(`mutation($lines:[CartLineInput!]){ cartCreate(input:{lines:$lines}){ cart{ ${CART} } } }`,
    { lines: [{ merchandiseId: variantId, quantity: 1 }] })).cartCreate.cart;
export const addLine = async (cartId, variantId) =>
  (await gql(`mutation($id:ID!,$lines:[CartLineInput!]!){ cartLinesAdd(cartId:$id,lines:$lines){ cart{ ${CART} } } }`,
    { id: cartId, lines: [{ merchandiseId: variantId, quantity: 1 }] })).cartLinesAdd.cart;
export const updateLine = async (cartId, lineId, quantity) =>
  (await gql(`mutation($id:ID!,$lines:[CartLineUpdateInput!]!){ cartLinesUpdate(cartId:$id,lines:$lines){ cart{ ${CART} } } }`,
    { id: cartId, lines: [{ id: lineId, quantity }] })).cartLinesUpdate.cart;
export const removeLine = async (cartId, lineId) =>
  (await gql(`mutation($id:ID!,$ids:[ID!]!){ cartLinesRemove(cartId:$id,lineIds:$ids){ cart{ ${CART} } } }`,
    { id: cartId, ids: [lineId] })).cartLinesRemove.cart;
