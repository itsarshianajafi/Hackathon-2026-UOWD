# Estaro web app

Use **Node.js 24.x**.

```sh
npm ci
# Copy .env.example to .env.local and fill in local secrets as needed.
npm run dev
```

The pages work without Python. Chat requires `OPENAI_API_KEY`. Local bookings
persist in `.data/viewings.json`; Vercel bookings require Neon `DATABASE_URL`.

```sh
npm run lint
npm test
npm run build
npm start
```

The site opens publicly without a username or password.
Use Root Directory **`web`** when importing this repository into Vercel.
Follow the [deployment guide](../docs/deployment-vercel.md) before deploying.
