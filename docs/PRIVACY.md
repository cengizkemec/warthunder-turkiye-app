# Privacy policy — wttr-app

Last updated: 16 November 2026

`wttr-app` is the Windows desktop client for the War Thunder Türkiye community
at <https://warthunder.tr>. This policy explains what the application stores,
what it sends over the network, and which third-party services it uses.

## Data controller and contact

The project is maintained by Cengiz Kemec. For privacy questions, open an issue
at <https://github.com/cengizkemec/warthunder-turkiye-app/issues> or contact the
site administration through <https://warthunder.tr>.

## Data stored on your device

The application stores the following settings locally in
`%APPDATA%\wttr-app\settings.json`:

- push-to-talk key and whether push-to-talk is enabled;
- whether the app closes to the system tray;
- notification preference and the IDs of notifications already shown;
- voice overlay visibility, collapsed state, and position;
- automatic update preference.

The application also keeps a persistent Electron session for
`https://warthunder.tr` so that the Flarum login, including the optional
“remember me” cookie, survives restarts. Login credentials are entered on the
site's own login page and are not stored by the desktop client itself, except
for the session cookies that Flarum sets.

Uninstalling the application removes the program files. Local application data
may remain until you delete `%APPDATA%\wttr-app` manually.

## Network connections

The application connects to the following systems:

- **warthunder.tr** — loads the community site, the Flarum forum, the social
  feed, notifications, the desktop bridge API (`/api/desktop/*`), and Flarum
  Social voice rooms. Your Flarum session cookie is sent to this site as part
  of normal site usage.
- **GitHub** (`api.github.com` and `github.com`) — checks for new releases and
  downloads the installer when an update is available.
- **Cloudflare Turnstile** (`challenges.cloudflare.com`) — used by the site's
  login form to distinguish humans from automated requests. Turnstile may
  receive browser and network metadata as described in Cloudflare's privacy
  policy.
- **Identity providers** — if you choose Discord, Google, Steam, or passkey
  login on the Flarum login page, the corresponding provider is contacted by
  the site. Their own privacy policies apply.
- **Flarum Social voice infrastructure** — when you join a voice room, audio,
  screen-share video, and related session metadata are sent to the voice
  service configured by warthunder.tr. The desktop client does not record or
  store voice or screen content.

The application does not include analytics, telemetry, advertising SDKs,
cryptocurrency miners, or background data collection. The maintainers do not
sell user data.

## Microphone, screen sharing, and notifications

- Microphone access is requested only when you use push-to-talk, join a voice
  room, or run the microphone test.
- Screen sharing starts only after you choose a screen or window in the
  application's picker. The selected stream is sent to the voice room you
  joined.
- Windows notifications are used for new Flarum notifications and update
  status. Notification content is generated locally from data the site already
  sends to your session.

## Third-party services

The services above have their own privacy policies:

- War Thunder Türkiye: <https://warthunder.tr>
- GitHub: <https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement>
- Cloudflare: <https://www.cloudflare.com/privacypolicy/>
- Discord: <https://discord.com/privacy>
- Google: <https://policies.google.com/privacy>
- Steam: <https://store.steampowered.com/privacy_agreement/>

## Security

The application uses Electron's context isolation and a restricted preload
bridge. External links open in your default browser. Update installers are
downloaded over HTTPS and verified against a SHA-256 hash published with the
release.

## Children

The application is not directed at children under 13. The community site's own
terms and age requirements apply.

## Changes

Material changes to this policy will be published in this file and mentioned in
the release notes.

## Code signing

Release binaries are intended to be signed through the SignPath Foundation
program. See [SIGNING.md](SIGNING.md) for the code signing policy and release
process.
