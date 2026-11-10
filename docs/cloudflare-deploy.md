# Deploying to Cloudflare (Workers + D1) with auto-deploy from `main`

Goal: every merge to `main` builds and deploys the game automatically, so the live site is always the latest `main`.
The build (`node scripts/build.cjs`) already produces `dist/client` (static game) and `dist/server` (Worker + `wrangler.json`).
This change only lets the real D1 database id come from the environment variable `D1_DATABASE_ID`; without it the build is unchanged.

## One-time setup (done by the repository owner in the Cloudflare dashboard)
1. Create a free Cloudflare account.
2. Create a D1 database named `frontier-kingdom`. Copy its Database ID.
3. Run the two SQL files in `drizzle/` (`0000_multiplayer.sql`, then `0001_room_limits.sql`) in the D1 console.
4. Workers & Pages -> Create -> connect the GitHub repository `binghaow/Kingdom`, production branch `main`.
5. Build command: `node scripts/build.cjs`. Deploy command: `npx wrangler deploy -c dist/server/wrangler.json`.
6. Build variable: `D1_DATABASE_ID` = the Database ID from step 2.
7. Open the generated `*.workers.dev` URL (a custom domain can be added later).

## Notes and limits
- This creates a new site URL; the existing `chatgpt.site` site is not touched.
- The multiplayer service keeps its current HTTP polling design. Low-latency multiplayer needs a Durable Object WebSocket relay, planned as a later phase.
- Not verified here: the Cloudflare dashboard steps and a real deployment were not run from the development environment.
