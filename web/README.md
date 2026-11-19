# Estaro web app

Use **Node.js 24.x**.

```sh
npm ci
# Copy .env.example to .env.local and fill in local secrets as needed.
npm run dev
```

The pages work without Python. Chat requires `OPENROUTER_API_KEY`. Local bookings
persist in `.data/viewings.json`; Vercel bookings require Neon `DATABASE_URL`.

Chat defaults to `ESTARO_MODEL=openrouter/free`, which routes to available free
models with tool support. You can select a specific OpenRouter model ending in
`:free`; paid model IDs are rejected and provider pricing is capped at zero.
Free models have shared availability and rate limits; requests may need a retry.
See the [OpenRouter free router guide](https://openrouter.ai/docs/guides/routing/routers/free-router).

```sh
npm run lint
npm test
npm run build
npm start
```

The site opens publicly without a username or password.
Use Root Directory **`web`** when importing this repository into Vercel.
Follow the [deployment guide](../docs/deployment-vercel.md) before deploying.
