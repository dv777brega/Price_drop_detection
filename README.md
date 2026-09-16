# Zoommer Watch

Track product arrivals and price drops from [Zoommer](https://zoommer.ge) in
a small self-hosted Node.js dashboard. Choose the categories you care about,
browse the current catalogue, and get alerts when a watched product becomes
cheaper.

## Features

- Category monitoring for phones, laptops, tablets, gaming, and more
- Product catalogue with current prices and direct links to Zoommer
- Price-drop and new-arrival alerts
- Optional Discord notifications through a webhook
- Configurable polling interval
- Local SQLite storage that survives restarts
- Responsive interface that works on desktop and mobile

## Requirements

- Node.js 22.5 or newer
- A network connection to `zoommer.ge`

The project uses Node's built-in synchronous SQLite driver, so no native
database package needs to be compiled during installation.

## Quick start

```bash
cd zoommer-watch
npm install
```

Create a local environment file:

```bash
cp .env.example .env
```

On Windows PowerShell, use `Copy-Item .env.example .env` instead. The default
port is `3000`; set `PORT` in `.env` if that port is already in use.

Start the server:

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000).

## How to use it

1. Select a category in **Watch categories**. The first scan creates a
   baseline and does not generate a flood of arrival alerts.
2. Open **Browse products** to see the products and prices found in that
   category.
3. Select the star beside a product to track its price.
4. Use **Settings** to configure the polling interval or add a Discord
   webhook.

You can also paste a Zoommer product URL into the catalogue to watch one
product without monitoring its entire category.

## Configuration

`.env` supports:

```env
PORT=3000
```

The Discord webhook and polling interval are stored through the Settings
panel. Do not commit `.env` or `data.sqlite`; both are ignored by Git.

## Project structure

| File | Purpose |
| --- | --- |
| `server.js` | Express server and static frontend hosting |
| `routes.js` | Category, product, alert, and settings API routes |
| `scraper.js` | Zoommer category and product-page extraction |
| `scheduler.js` | Scheduled scans and price comparison logic |
| `notify.js` | Optional Discord notifications |
| `db.js` | SQLite schema and database connection |
| `public/index.html` | The browser dashboard |

## Scraping notes

The scraper identifies products by Zoommer's stable `-p<id>` URL suffix and
extracts prices from the product card instead of relying on generated CSS
class names. The current category response contains the visible listing in
the first response; repeated `?page=N` responses are ignored to avoid
duplicates.

Website markup can change, and Zoommer may rate-limit automated requests.
Keep the polling interval reasonable and update `scraper.js` if the site
changes its product URL or price structure. This project is an independent
tool and is not affiliated with Zoommer.

## Deployment

This is a normal Node server and can run on a VPS or a Node-compatible host.
Use `npm start` as the start command and attach persistent storage for
`data.sqlite`; otherwise your watch list and price history may be reset when
the service restarts.

## License

No license has been selected yet. Add a license before accepting external
contributions or distributing the project publicly.
