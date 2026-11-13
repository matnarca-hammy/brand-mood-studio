# Brand Mood Studio

Tune a brand's personality with sliders and get a live moodboard, colour palette and type pairing. Share the link and it opens with the same settings.

- `public/index.html`: the page.
- `netlify/functions/unsplash.mjs`: a small proxy that keeps the Unsplash key on the server (served at `/api/unsplash`).
- `netlify/functions/pinterest.mjs`: reads a public Pinterest board's RSS feed (served at `/api/pinterest`).
- `netlify.toml`: Netlify build settings.

## Deploying on Netlify

1. In Netlify: **Add new site → Import an existing project → GitHub**, then pick this repository. The build settings come from `netlify.toml`.
2. In **Site configuration → Environment variables**, add `UNSPLASH_ACCESS_KEY` with your Unsplash Access Key (from unsplash.com/oauth/applications). Never commit the key to this repository.
3. Redeploy after adding or changing the key.

Every push to `main` deploys automatically.

## Images

- **Unsplash** (default): through the proxy. Demo keys allow 50 searches an hour; Netlify caches each search for 6 hours and shares it between visitors.
- **Pinterest board**: paste a public board link (full link or `pin.it` short link) and its 25 most recent pins fill the moodboard, optionally blended with Unsplash photos that match the sliders. The board goes into shared links. Uses Pinterest's public board feed rather than the developer API, so secret boards don't work, only the latest 25 pins show, and Pinterest could change the feed without notice. Netlify caches each board for 3 hours.
- **Free library**: curated free stock photos (WP Photo Directory, StockSnap, Rawpixel, Nappy) from Openverse, called directly from the page. Used automatically if Unsplash isn't available.

## Local preview

`python3 -m http.server 8123 -d public` serves the page only; Unsplash searches fall back to the free library and Pinterest boards can't load. Use `netlify dev` to run the page and both functions together.
