const cron = require('node-cron');
const db = require('./db');
const { scrapeCategory, scrapeProductPage } = require('./scraper');
const { sendDiscordAlert } = require('./notify');

function nowIso() {
  return new Date().toISOString();
}

function getSetting(key, fallback) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

// Scans one watched category: upserts every product it finds, fires a
// "new arrival" alert for anything not seen before (skipped on the very
// first scan, so you don't get 40 alerts the moment you mark a category),
// and updates last_price for everything so future comparisons stay correct.
async function checkCategory(category) {
  const catRow = db.prepare('SELECT * FROM categories WHERE slug = ?').get(category.slug);
  const isFirstScan = !catRow || !catRow.last_scanned_at;

  let items;
  try {
    items = await scrapeCategory(category);
  } catch (err) {
    console.error(`[${category.name}] scrape failed:`, err.message);
    return;
  }

  const now = nowIso();

  for (const item of items) {
    const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(item.id);

    if (!existing) {
      db.prepare(`
        INSERT INTO products (id, name, url, category_slug, last_price, watched_price, first_seen, last_checked)
        VALUES (?, ?, ?, ?, ?, 0, ?, ?)
      `).run(item.id, item.name, item.url, category.slug, item.price, now, now);

      if (!isFirstScan) {
        const msg = `New in ${category.name}: ${item.name}${item.price !== null ? ` — ${item.price} ₾` : ''}`;
        db.prepare('INSERT INTO alerts (type, product_id, message, created_at) VALUES (?,?,?,?)')
          .run('new_arrival', item.id, msg, now);
        await sendDiscordAlert(msg);
      }
    } else {
      if (
        existing.watched_price &&
        item.price !== null &&
        existing.last_price !== null &&
        item.price < existing.last_price
      ) {
        const msg = `Price drop: ${item.name} — ${existing.last_price} ₾ → ${item.price} ₾`;
        db.prepare('INSERT INTO alerts (type, product_id, message, created_at) VALUES (?,?,?,?)')
          .run('price_drop', item.id, msg, now);
        await sendDiscordAlert(msg);
      }
      db.prepare('UPDATE products SET last_price = ?, last_checked = ?, name = ? WHERE id = ?')
        .run(item.price, now, item.name, item.id);
    }
  }

  db.prepare(`
    INSERT INTO categories (slug, name, url, watched, last_scanned_at)
    VALUES (?, ?, ?, COALESCE((SELECT watched FROM categories WHERE slug = ?), 0), ?)
    ON CONFLICT(slug) DO UPDATE SET last_scanned_at = excluded.last_scanned_at
  `).run(category.slug, category.name, category.url, category.slug, now);
}

// Re-checks products added by pasted URL (they have no category_slug, so
// they aren't covered by checkCategory).
async function checkAdHocProducts() {
  const rows = db.prepare('SELECT * FROM products WHERE watched_price = 1 AND category_slug IS NULL').all();
  for (const p of rows) {
    try {
      const fresh = await scrapeProductPage(p.url);
      const now = nowIso();
      if (fresh.price !== null && p.last_price !== null && fresh.price < p.last_price) {
        const msg = `Price drop: ${p.name} — ${p.last_price} ₾ → ${fresh.price} ₾`;
        db.prepare('INSERT INTO alerts (type, product_id, message, created_at) VALUES (?,?,?,?)')
          .run('price_drop', p.id, msg, now);
        await sendDiscordAlert(msg);
      }
      db.prepare('UPDATE products SET last_price = ?, last_checked = ?, name = ? WHERE id = ?')
        .run(fresh.price, now, fresh.name, p.id);
    } catch (err) {
      console.error(`Failed to recheck product ${p.id}:`, err.message);
    }
  }
}

async function runCheck() {
  console.log(`[${nowIso()}] Running check...`);
  const watched = db.prepare('SELECT slug FROM categories WHERE watched = 1').all();
  const { CATEGORIES } = require('./scraper');
  for (const row of watched) {
    const category = CATEGORIES.find(c => c.slug === row.slug);
    if (category) await checkCategory(category);
  }
  await checkAdHocProducts();
  console.log(`[${nowIso()}] Check complete.`);
}

let task = null;
function startScheduler() {
  const minutes = Math.max(1, parseInt(getSetting('poll_interval_minutes', '15'), 10) || 15);
  if (task) task.stop();
  task = cron.schedule(`*/${minutes} * * * *`, () => {
    runCheck().catch(err => console.error('Scheduled check failed:', err));
  });
  console.log(`Scheduler running every ${minutes} minute(s).`);
}

module.exports = { runCheck, checkCategory, startScheduler };
