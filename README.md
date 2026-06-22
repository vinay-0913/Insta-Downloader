# InstaDownloader

A fast, clean Instagram video & image downloader built with [Astro](https://astro.build/) and deployed on [Render.com](https://render.com).

## Features

- Download Instagram Reels, Posts, Stories & Carousels
- Smart proxy fallback — direct connection first, auto-switches to proxy if blocked
- Mobile-friendly responsive UI
- No login required

## Tech Stack

- **Framework:** Astro (SSR, Node.js adapter)
- **Styling:** Tailwind CSS v4
- **Hosting:** Render.com (Web Service)
- **CDN / Security:** Cloudflare (DNS + WAF)

## Local Development

```bash
npm install
npm run dev
```

## Environment Variables

Create a `.env` file in the root of the project (this is **gitignored** and must never be committed):

```env
# Optional: HTTP/HTTPS proxy for Instagram fetching
# Format: http://username:password@IP:Port
PROXY_URL=http://username:password@your-proxy-ip:port
```

> **Important:** If `PROXY_URL` is set, the app will first try a direct connection to Instagram. If Instagram blocks it (429/403), it will automatically retry using the proxy. If `PROXY_URL` is not set, only direct connections are used.

## Build & Deploy

```bash
# Build for production
npm run build

# Start the Node.js server
npm run start
```

### Render.com Setup

| Setting | Value |
|---|---|
| Runtime | Node |
| Build Command | `npm install && npm run build` |
| Start Command | `npm run start` |
| Node Version | `22` |

Add your `PROXY_URL` in the Render dashboard under **Environment Variables**.

## Project Structure

```
src/
├── components/     # UI components (DownloadInput, etc.)
├── layouts/        # Page layouts
├── lib/
│   └── instagram.ts  # Instagram scraping logic & proxy fallback
├── pages/
│   ├── api/
│   │   └── download.ts  # API endpoint
│   └── index.astro      # Home page
└── styles/         # Global CSS
```
