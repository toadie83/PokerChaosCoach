# Local OBS Livestream

Playback Poker includes a development-only WebRTC viewer backed by MediaMTX. The stream remains on this computer: the MediaMTX ports are bound to `127.0.0.1`, and the **Live stream** link is only rendered by the Vite development server.

## Start it

Open two terminals in `pokerchaos-frontend`.

Terminal 1:

```powershell
npm run dev
```

Terminal 2:

```powershell
npm run stream
```

The first `npm run stream` downloads the latest compatible MediaMTX v1 Windows executable from the project's official GitHub releases into `.mediamtx/`. Later starts reuse it.

## Configure OBS

In **Settings → Stream**:

- Service: `WHIP`
- Server: `http://127.0.0.1:8889/mystream/whip`
- Bearer token: leave blank

Save, then click **Start Streaming**. In Playback Poker, click **Live stream**; the viewer opens in a new tab. It starts muted because browsers normally block autoplay with sound. Use the embedded controls to unmute.

Direct viewer URL: `http://localhost:5183/livestream/index.html`

## What is running

- `5183`: Vite and the custom viewer page
- `8889`: MediaMTX WebRTC HTTP/WHIP/WHEP handshake
- `8189`: WebRTC media over UDP, with TCP fallback
- `9997`: loopback-only status API used by the viewer's live/offline badge

The setup uses WHIP ingest and WebRTC/WHEP playback. No HLS delay, cloud service, CDN player, or backend endpoint is involved.

## Troubleshooting

- **Media server offline:** run `npm run stream` and keep that terminal open.
- **Waiting for OBS:** confirm OBS is actively streaming to the exact URL above, including `/whip`.
- **Player stays blank after OBS goes live:** click **Reconnect player** on the viewer.
- **OBS does not offer WHIP:** update OBS to a current release. MediaMTX's alternative OBS instructions are available at <https://mediamtx.org/docs/publish/obs-studio>.
- **Reinstall MediaMTX:** run `npm run stream:setup -- -Force`.

MediaMTX browser embedding reference: <https://mediamtx.org/docs/read/web-browsers>.
