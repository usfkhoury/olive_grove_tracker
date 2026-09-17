# Olive Grove Tracker

A small web app for tracking the family olive grove: trees, activities (pruning, spraying, watering), harvests, olive-oil movements, and seasonal tasks.

Live at: https://olives.usfkhoury.com

## Where the data lives

All data lives in **Notion**, under a parent page called **Olives**, in five databases:

- Trees
- Activities
- Harvests
- Oil movements
- Seasonal tasks

The app reads and writes those databases through the Notion API. There is no separate database to manage.

## How the code is organized

- `frontend/` — the web app itself (React, built with Vite). This is what people see in the browser.
- `netlify/functions/` — a small backend that runs on Netlify and talks to Notion on the app's behalf (so the Notion secret key never ships to the browser).
- `netlify.toml` — tells Netlify how to build and deploy.
- `.env.example` — the environment variables the app needs (Notion token, database IDs). Copy to `.env` and fill in real values for local development.

## Run it on your computer

You need Node.js and the Netlify CLI (`npm install -g netlify-cli`).

```
npm install
cd frontend && npm install && cd ..
netlify dev
```

Then open the URL Netlify prints (usually http://localhost:8888).

## Deploy

Push to the `main` branch on GitHub. Netlify picks up the change, builds the frontend, and publishes the site automatically. No manual step.

## License

MIT — see `LICENSE`.
