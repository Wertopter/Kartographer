# Kartographer signal worker

This Worker introduces a GM app and player apps, then gives each one short-lived Cloudflare TURN credentials. Map images and player commands do not stay on Cloudflare. They travel on the WebRTC data channel, directly or through TURN when a direct path is blocked.

## Deploy

From this directory, with a Cloudflare account:

```bash
npx wrangler login
npx wrangler secret put TURN_KEY_ID
npx wrangler secret put TURN_KEY_API_TOKEN
npx wrangler deploy
```

Create the TURN key in the Cloudflare dashboard under Realtime TURN. `TURN_KEY_ID` is that key's id. `TURN_KEY_API_TOKEN` is an API token that can call `rtc.live.cloudflare.com`. Neither value belongs in the Kartographer app or in git.

After deploy, set `SIGNAL_URL` in `src/shared/remote.ts` to the Worker origin Wrangler prints, without a trailing slash.

TURN traffic is billed only when the relay is used, at about $0.05 per GB from Cloudflare to the client. A direct connection does not use it.

A second copy of the desktop app can be started with `KARTOGRAPHER_ALLOW_SECOND_INSTANCE=1` when you need both the GM and a player on one computer.
