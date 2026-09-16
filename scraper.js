const axios = require('axios');
const cheerio = require('cheerio');

const BASE = 'https://zoommer.ge';

// Pulled from the site's English-language nav. Add/remove/rename freely —
// the slug just needs to stay stable since it's used as the DB key.
const CATEGORIES = [
  { slug: 'mobiluri-telefonebi-c855', name: 'Mobile Phones', url: '/en/mobiluri-telefonebi-c855' },
  { slug: 'planshetebi-c877', name: 'Tablets', url: '/en/planshetebi-c877' },
  { slug: 'smart-saatebi-c873', name: 'Smart Watches', url: '/en/smart-saatebi-c873' },
  { slug: 'leptopis-brendebi-c717', name: 'Laptops', url: '/en/leptopis-brendebi-c717' },
  { slug: 'audio-sistema-c528', name: 'Audio Systems', url: '/en/audio-sistema-c528' },
  { slug: 'gaming-c463', name: 'Gaming', url: '/en/gaming-c463' },
  { slug: 'televizorebi-c505', name: 'TV & Monitors', url: '/en/televizorebi-c505' },
  { slug: 'foto-da-video-kamerebi-c858', name: 'Photo & Video', url: '/en/foto-da-video-kamerebi-c858' },
  { slug: 'smart-gadaadgileba-skuterebi-c1165', name: 'Scooters', url: '/en/smart-gadaadgileba-skuterebi-c1165' },
  { slug: 'chkviani-sakhli-c474', name: 'Smart Home', url: '/en/chkviani-sakhli-c474' },
  { slug: 'tavis-movla-c490', name: 'Beauty', url: '/en/tavis-movla-c490' },
  { slug: 'manqanis-aqsesuarebi-c481', name: 'Car Accessories', url: '/en/manqanis-aqsesuarebi-c481' },
  { slug: 'mobiluris-aqsesuarebi-c538', name: 'Accessories', url: '/en/mobiluris-aqsesuarebi-c538' },
];

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept-Language': 'en',
};

// Every product URL on the site ends in "-p<digits>" — that ID is the
// stable key we track products by, independent of name/price changes.
const PRODUCT_ID_RE = /-p(\d+)(?:[/?]|$)/;
const PRICE_RE = /(\d+(?:\.\d+)?)\s*₾/;

async function fetchHtml(url) {
  const res = await axios.get(url, { headers: HEADERS, timeout: 20000 });
  return res.data;
}

function parsePrice(str) {
  if (!str) return null;
  const m = str.match(PRICE_RE);
  return m ? parseFloat(m[1]) : null;
}

function priceFromProductCard($, el, id) {
  let node = $(el);
  for (let i = 0; i < 8 && node.length; i++) {
    node = node.parent();
    const cardIds = node.find('a[href*="-p"]').map((_, link) => {
      const match = ($(link).attr('href') || '').match(PRODUCT_ID_RE);
      return match ? match[1] : null;
    }).get().filter(Boolean);

    if (cardIds.length === 0) continue;
    if (cardIds.some(cardId => cardId !== id)) break;

    const price = parsePrice(node.text());
    if (price !== null) return price;
  }
  return null;
}

async function scrapeCategoryPage(url) {
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  const products = new Map();

  $('a[href*="-p"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const match = href.match(PRODUCT_ID_RE);
    if (!match) return;
    const id = match[1];
    const name = $(el).text().trim();
    if (!name || name.length < 3) return; // skip icon-only/empty links to the same product

    const url = href.startsWith('http') ? href : BASE + href;
    const existing = products.get(id);
    if (!existing) {
      products.set(id, { id, name, url, price: null });
    } else if (name.length > existing.name.length && name.toUpperCase() !== 'NEW') {
      existing.name = name;
    }

    const entry = products.get(id);
    if (entry.price === null) {
      entry.price = priceFromProductCard($, el, id);
    }
  });

  return Array.from(products.values());
}

// Scrapes up to maxPages of a category's listing. If your category has
// more products than that, bump maxPages — but check first whether the
// site's pagination really uses "?page=N" (open page 2 in a browser and
// look at the URL); adjust the template below if it's different.
async function scrapeCategory(category, maxPages = 100) {
  const all = new Map();
  for (let page = 1; page <= maxPages; page++) {
    const url = `${BASE}${category.url}${page > 1 ? `?page=${page}` : ''}`;
    let items;
    try {
      items = await scrapeCategoryPage(url);
    } catch (err) {
      console.error(`Failed to scrape ${url}:`, err.message);
      break;
    }
    if (items.length === 0) break;
    const before = all.size;
    for (const item of items) all.set(item.id, item);
    if (all.size === before) break;
  }
  return Array.from(all.values());
}

// For a one-off product URL pasted into the UI. Tries common "price"
// class-name patterns first, then falls back to the first ₾ amount
// anywhere on the page.
async function scrapeProductPage(url) {
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  const match = url.match(PRODUCT_ID_RE);
  const id = match ? match[1] : url;

  let name = $('meta[property="og:title"]').attr('content') || $('h1').first().text().trim();
  name = (name || 'Unknown product').trim();

  let price = null;
  $('[class*="price" i], [data-testid*="price" i]').each((_, el) => {
    if (price !== null) return;
    price = parsePrice($(el).text());
  });
  if (price === null) {
    price = parsePrice($('body').text());
  }

  return { id, name, url, price };
}

module.exports = {
  CATEGORIES,
  PRODUCT_ID_RE,
  scrapeCategory,
  scrapeProductPage,
};
