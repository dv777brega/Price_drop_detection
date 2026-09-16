const axios = require('axios');
const db = require('./db');

async function sendDiscordAlert(message) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('discord_webhook');
  const url = row && row.value;
  if (!url) return;
  try {
    await axios.post(url, { content: message.slice(0, 1900) });
  } catch (err) {
    console.error('Discord alert failed:', err.message);
  }
}

module.exports = { sendDiscordAlert };
