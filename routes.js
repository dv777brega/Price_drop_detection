const express = require('express');
const db = require('./db');
const { CATEGORIES, scrapeProductPage, PRODUCT_ID_RE } = require('./scraper');

const router = express.Router();

function nowIso() {
  return new Date().toISOString();
}

// --- Categories ---
router.get('/categories', (req, res) => {
  const rows = db.prepare('SELECT * FROM categories').all();
  const bySlug = Object.fromEntries(rows.map(r => [r.slug, r]));
  const merged = CATEGORIES.map(c => ({
    ...c,
    watched: !!(bySlug[c.slug] && bySlug[c.slug].watched),
    last_scanned_at: bySlug[c.slug] ? bySlug[c.slug].last_scanned_at : null,
  }));
  res.json(merged);
});

router.post('/categories/:slug/watch', (req, res) => {
  const { slug } = req.params;
  const { watched } = req.body;
  const category = CATEGORIES.find(c => c.slug === slug);
  if (!category) return res.status(404).json({ error: 'Unknown category' });

  db.prepare(`
    INSERT INTO categories (slug, name, url, watched) VALUES (?, ?, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET watched = excluded.watched
  `).run(slug, category.name, category.url, watched ? 1 : 0);

  res.json({ ok: true });

  // Establish a baseline right away instead of waiting for the next
  // scheduled tick, so the Browse tab has something to show immediately.
  if (watched) {
    const { checkCategory } = require('./scheduler');
    checkCategory(category).catch(err => console.error(`Baseline scan for ${slug} failed:`, err));
  }
});

router.get('/categories/:slug/products', (req, res) => {
  const rows = db.prepare('SELECT * FROM products WHERE category_slug = ? ORDER BY last_checked DESC')
    .all(req.params.slug);
  res.json(rows);
});

// --- Products ---
router.post('/products/:id/watch-price', (req, res) => {
  const { watched } = req.body;
  db.prepare('UPDATE products SET watched_price = ? WHERE id = ?').run(watched ? 1 : 0, req.params.id);
  res.json({ ok: true });
});

router.post('/products', async (req, res) => {
  const { url } = req.body || {};
  if (!url || !PRODUCT_ID_RE.test(url) || !url.includes('zoommer.ge')) {
    return res.status(400).json({ error: 'That does not look like a zoommer.ge product URL.' });
  }
  try {
    const item = await scrapeProductPage(url);
    const now = nowIso();
    db.prepare(`
      INSERT INTO products (id, name, url, category_slug, last_price, watched_price, first_seen, last_checked)
      VALUES (?, ?, ?, NULL, ?, 1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET watched_price = 1, last_price = excluded.last_price,
        last_checked = excluded.last_checked, name = excluded.name
    `).run(item.id, item.name, item.url, item.price, now, now);
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: 'Could not read that page: ' + err.message });
  }
});

router.delete('/products/:id', (req, res) => {
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// --- Alerts ---
router.get('/alerts', (req, res) => {
  const rows = db.prepare('SELECT * FROM alerts ORDER BY created_at DESC LIMIT 100').all();
  res.json(rows);
});

router.post('/alerts/:id/read', (req, res) => {
  db.prepare('UPDATE alerts SET read = 1 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// --- Settings ---
router.get('/settings', (req, res) => {
  const rows = db.prepare('SELECT * FROM settings').all();
  res.json(Object.fromEntries(rows.map(r => [r.key, r.value])));
});

router.post('/settings', (req, res) => {
  const { discord_webhook, poll_interval_minutes } = req.body || {};
  const upsert = db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);
  if (discord_webhook !== undefined) upsert.run('discord_webhook', discord_webhook);
  if (poll_interval_minutes !== undefined) upsert.run('poll_interval_minutes', String(poll_interval_minutes));
  res.json({ ok: true });

  if (poll_interval_minutes !== undefined) {
    const { startScheduler } = require('./scheduler');
    startScheduler();
  }
});

router.post('/run-now', (req, res) => {
  res.json({ ok: true, message: 'Check started.' });
  const { runCheck } = require('./scheduler');
  runCheck().catch(err => console.error('Manual check failed:', err));
});

module.exports = router;
