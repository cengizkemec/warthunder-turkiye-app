#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    webview::PageLoadEvent,
    AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_notification::NotificationExt;

fn log(message: &str) {
    use std::io::Write;

    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(std::env::temp_dir().join("wttr-desktop.log"))
    {
        let _ = writeln!(file, "{message}");
    }
}

const SITE_HOST: &str = "warthunder.tr";
const AUTH_URL: &str = "https://warthunder.tr/";
const BLOG_URL: &str = "https://warthunder.tr/";
const FORUM_URL: &str = "https://warthunder.tr/all";
const SOCIAL_URL: &str = "https://warthunder.tr/social";
const BRIDGE_PREFIX: &str = "/__wttr_desktop/";
const GITHUB_REPO: &str = "cengizkemec/warthunder-turkiye-app";
const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Clone, serde::Serialize)]
struct PendingAuth {
    mode: String,
    identification: Option<String>,
    password: Option<String>,
    username: Option<String>,
    email: Option<String>,
    remember: bool,
}

#[derive(Clone, Default)]
struct SessionState {
    known: bool,
    authenticated: bool,
    username: Option<String>,
    display_name: Option<String>,
    avatar_url: Option<String>,
    unread: i64,
    last_notification_id: Option<String>,
}

struct AppState {
    pending_auth: Arc<Mutex<Option<PendingAuth>>>,
    session: Arc<Mutex<SessionState>>,
    auth_pending: Arc<Mutex<bool>>,
    auth_shell_pending: Arc<Mutex<bool>>,
}

#[derive(Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct BridgeUser {
    username: Option<String>,
    display_name: Option<String>,
    avatar_url: Option<String>,
}

#[derive(Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct BridgeNotification {
    id: Option<String>,
    title: Option<String>,
    body: Option<String>,
}

#[derive(Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct BridgeSession {
    #[serde(default)]
    authenticated: bool,
    #[serde(default)]
    user: Option<BridgeUser>,
    #[serde(default)]
    unread_notifications: i64,
    #[serde(default)]
    latest_notification: Option<BridgeNotification>,
    #[serde(default)]
    selftest: bool,
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopSettings {
    ptt_key: String,
    ptt_enabled: bool,
    close_to_tray: bool,
    #[serde(default = "notifications_default")]
    notifications_enabled: bool,
}

fn notifications_default() -> bool {
    true
}

impl Default for DesktopSettings {
    fn default() -> Self {
        Self {
            ptt_key: "AltLeft".to_string(),
            ptt_enabled: true,
            close_to_tray: true,
            notifications_enabled: true,
        }
    }
}

struct SettingsState(Arc<Mutex<DesktopSettings>>);

fn settings_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path()
        .app_local_data_dir()
        .ok()
        .map(|directory| directory.join("settings.json"))
}

fn load_settings(app: &AppHandle) -> DesktopSettings {
    let Some(path) = settings_path(app) else {
        return DesktopSettings::default();
    };

    std::fs::read_to_string(path)
        .ok()
        .and_then(|contents| serde_json::from_str::<DesktopSettings>(&contents).ok())
        .map(|mut settings| {
            settings.ptt_key = normalize_ptt_key(&settings.ptt_key).to_string();
            settings
        })
        .filter(|settings| ptt_binding(&settings.ptt_key).is_some())
        .unwrap_or_default()
}

fn persist_settings(app: &AppHandle, settings: &DesktopSettings) {
    let Some(path) = settings_path(app) else {
        return;
    };

    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    if let Ok(json) = serde_json::to_vec_pretty(settings) {
        let _ = std::fs::write(path, json);
    }
}

fn auth_script(auth: &PendingAuth) -> String {
    let payload = serde_json::json!({
        "mode": auth.mode,
        "identification": auth.identification,
        "password": auth.password,
        "username": auth.username,
        "email": auth.email,
        "remember": auth.remember,
    });

    format!(
        r#"
(function () {{
  const payload = {payload};
  const isRegister = payload.mode === 'register';
  let attempts = 0;
  let filled = false;
  let seenModal = false;

  const addStyle = () => {{
    if (document.getElementById('wttr-desktop-auth-style')) return;

    const style = document.createElement('style');
    style.id = 'wttr-desktop-auth-style';
    style.textContent = `
      #wttr-desktop-auth-bg {{
        position: fixed;
        inset: 0;
        z-index: 9998;
        pointer-events: none;
        background:
          radial-gradient(1000px 700px at 80% 0%, rgba(192,57,43,.38), transparent 62%),
          radial-gradient(900px 600px at 8% 100%, rgba(216,181,106,.13), transparent 60%),
          linear-gradient(160deg, #070c0f, #0d171c 58%, #070c0f);
      }}
      #cc-main,
      .cc-window,
      .cc-revoke {{
        display: none !important;
      }}
      .ModalManager {{
        z-index: 9999 !important;
        background: rgba(2,6,8,.62) !important;
        backdrop-filter: blur(5px);
      }}
      .Modal-content {{
        width: 420px !important;
        max-width: calc(100vw - 32px) !important;
        background: #101b21 !important;
        border: 1px solid rgba(255,255,255,.11) !important;
        border-radius: 20px !important;
        box-shadow: 0 30px 80px rgba(0,0,0,.6) !important;
        padding: 24px !important;
      }}
      .Modal-content .Modal-header {{
        border: 0 !important;
        padding: 0 0 10px !important;
      }}
      .Modal-content .Modal-header h3 {{
        font-size: 22px !important;
        letter-spacing: -.02em;
      }}
      .Modal-content .Modal-body {{
        padding: 0 !important;
      }}
      .Modal-content .FormControl {{
        background: #0b151a !important;
        border: 1px solid rgba(255,255,255,.1) !important;
        color: #eef4f6 !important;
        border-radius: 10px !important;
      }}
      .Modal-content .Button--primary {{
        background: linear-gradient(135deg, #c0392b, #8f241b) !important;
        border: 0 !important;
        border-radius: 11px !important;
      }}
      .WTTRDesktopAuthLogo {{
        width: 96px;
        height: 96px;
        max-width: 100%;
        display: block;
        margin: 0 auto 8px;
      }}
      .WTTRDesktopAuthHint {{
        text-align: center;
        color: #93a6ae;
        font-size: 12px;
        margin: 0 0 16px;
      }}
    `;
    document.head.appendChild(style);

    if (!document.getElementById('wttr-desktop-auth-bg')) {{
      const background = document.createElement('div');
      background.id = 'wttr-desktop-auth-bg';
      document.body.appendChild(background);
    }}
  }};

  const setValue = (selector, value) => {{
    if (value === null || value === undefined || value === '') return false;

    const input = document.querySelector(selector);
    if (!input) return false;

    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (setter) setter.call(input, String(value));
    else input.value = String(value);

    input.dispatchEvent(new Event('input', {{ bubbles: true }}));
    input.dispatchEvent(new Event('change', {{ bubbles: true }}));
    return true;
  }};

  const decorate = () => {{
    const body = document.querySelector('.Modal-content .Modal-body');
    if (!body || body.querySelector('.WTTRDesktopAuthLogo')) return;

    const logo = document.createElement('img');
    logo.className = 'WTTRDesktopAuthLogo';
    logo.src = 'https://warthunder.tr/assets/pwa-icon-512x512-s8vyxeai.png';
    logo.alt = 'War Thunder Türkiye';

    const hint = document.createElement('p');
    hint.className = 'WTTRDesktopAuthHint';
    hint.textContent = 'Turnstile doğrulamasını tamamla, ardından Giriş Yap’a bas.';

    body.insertBefore(hint, body.firstChild);
    body.insertBefore(logo, hint);
  }};

  const fill = () => {{
    if (filled) return;

    let ok = false;

    if (isRegister) {{
      ok = setValue('input[name="username"]', payload.username) || ok;
      ok = setValue('input[name="email"]', payload.email) || ok;
      ok = setValue('input[name="password"]', payload.password) || ok;
    }} else {{
      ok = setValue('input[name="identification"]', payload.identification) || ok;
      ok = setValue('input[name="password"]', payload.password) || ok;
    }}

    if (ok) {{
      filled = true;
      decorate();
    }}
  }};

  const checkRemember = () => {{
    if (payload.remember === false || isRegister) return true;

    const remember = document.querySelector('.Modal-content input[name="remember"]')
      || document.querySelector('.Modal-content input[type="checkbox"]');

    if (!remember) return false;

    if (!remember.checked) {{
      remember.click();

      if (!remember.checked) {{
        remember.checked = true;
        remember.dispatchEvent(new Event('input', {{ bubbles: true }}));
        remember.dispatchEvent(new Event('change', {{ bubbles: true }}));
      }}
    }}

    return remember.checked;
  }};

  const openModal = () => {{
    try {{
      if (window.app && window.app.session && window.app.session.user) return true;
    }} catch (error) {{}}

    try {{
      if (window.WTTRDesktop && typeof window.WTTRDesktop.openAuth === 'function') {{
        if (window.WTTRDesktop.openAuth(payload.mode)) return true;
      }}
    }} catch (error) {{}}

    try {{
      if (window.app && window.app.modal) {{
        const name = isRegister ? 'forum/components/SignUpModal' : 'forum/components/LogInModal';
        const component = window.flarum && window.flarum.reg
          ? window.flarum.reg.get('core', name)
          : null;

        if (component) {{
          window.app.modal.show(component);
          return true;
        }}
      }}
    }} catch (error) {{}}

    const labels = isRegister ? ['KAYIT OL', 'KAYIT'] : ['GİRİŞ YAP', 'GİRİŞ'];
    const target = [...document.querySelectorAll('button, a')]
      .find((element) => labels.includes((element.innerText || '').trim().toUpperCase()));

    if (target) {{
      target.click();
      return true;
    }}

    return false;
  }};

  addStyle();

  const cleanup = () => {{
    const content = document.querySelector('.Modal-content');

    if (content) {{
      seenModal = true;
      return;
    }}

    let loggedIn = false;
    try {{
      loggedIn = Boolean(window.app && window.app.session && window.app.session.user);
    }} catch (error) {{}}

    if (!seenModal && !loggedIn) return;

    document.getElementById('wttr-desktop-auth-bg')?.remove();
    document.getElementById('wttr-desktop-auth-style')?.remove();
    clearInterval(cleanupTimer);
  }};

  const cleanupTimer = setInterval(cleanup, 500);

  const timer = setInterval(() => {{
    try {{
      if (window.app && window.app.session && window.app.session.user) {{
        clearInterval(timer);
        cleanup();
        return;
      }}
    }} catch (error) {{}}

    if (!document.querySelector('.Modal-content')) {{
      openModal();
    }} else {{
      seenModal = true;
      fill();

      if (filled) {{
        checkRemember();
      }}
    }}

    if (++attempts > 90) {{
      clearInterval(timer);
    }}
  }}, 400);
}})();
"#
    )
}

fn auth_shell_script() -> &'static str {
    r##"
(function () {
  const styleId = 'wttr-desktop-auth-shell-style';
  const existing = document.getElementById(styleId);

  const cleanup = () => {
    window.__wttrAuthShell = false;

    if (window.__wttrAuthShellTimer) {
      clearInterval(window.__wttrAuthShellTimer);
      window.__wttrAuthShellTimer = null;
    }

    try {
      localStorage.removeItem('wttrAuthMode');
    } catch (error) {}

    document.documentElement.classList.remove('wttr-auth-mode');
    if (document.body) document.body.classList.remove('wttr-auth-mode');
    document.getElementById('wttr-auth-shell-bg')?.remove();
    document.getElementById('wttr-auth-shell-glow')?.remove();
    document.getElementById('wttr-auth-shell-hero')?.remove();
    document.getElementById('wttr-auth-veil')?.remove();
    document.getElementById(styleId)?.remove();
  };

  window.__wttrAuthShellCleanup = cleanup;

  if (!existing) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      html.wttr-auth-mode,
      body.wttr-auth-mode {
        overflow: hidden !important;
      }

      html.wttr-auth-mode *::-webkit-scrollbar {
        width: 0 !important;
        height: 0 !important;
      }

      #wttr-auth-shell-bg {
        position: fixed;
        inset: 0;
        z-index: 9990;
        overflow: hidden;
        pointer-events: none;
        background: #070c0f;
      }

      #wttr-auth-shell-bg::before {
        content: "";
        position: absolute;
        inset: -8%;
        background: url("https://warthunder.tr/assets/files/2026-11-13/1794578974-624967-turkey-bundle-940h530-ba5ce7e7c62ff478bcd5b1e7fcdcbdd9-thumb.webp") center / cover no-repeat;
        filter: saturate(.92) brightness(.72);
        animation: wttr-bg-drift 28s ease-in-out infinite alternate;
      }

      #wttr-auth-shell-bg::after {
        content: "";
        position: absolute;
        inset: 0;
        background:
          linear-gradient(180deg, rgba(7,11,14,.12) 0%, rgba(7,11,14,.36) 45%, rgba(7,11,14,.95) 100%),
          linear-gradient(90deg, rgba(7,11,14,.82) 0%, rgba(7,11,14,.32) 56%, rgba(7,11,14,.58) 100%),
          radial-gradient(760px 520px at 18% 82%, rgba(192,57,43,.28), transparent 70%);
      }

      #wttr-auth-shell-glow {
        position: fixed;
        right: 7vw;
        top: 10vh;
        z-index: 9991;
        width: 38vw;
        height: 38vw;
        max-width: 540px;
        max-height: 540px;
        border-radius: 50%;
        pointer-events: none;
        background: radial-gradient(circle, rgba(192,57,43,.3), transparent 68%);
        filter: blur(28px);
        animation: wttr-glow-pulse 9s ease-in-out infinite;
      }

      #wttr-auth-shell-hero {
        position: fixed;
        left: clamp(28px, 7vw, 108px);
        bottom: clamp(38px, 9vh, 104px);
        z-index: 9992;
        width: min(560px, 46vw);
        pointer-events: none;
        color: #eef4f6;
      }

      .WTTRDesktopHeroLogo {
        width: 96px;
        height: 96px;
        display: block;
        margin-bottom: 20px;
        opacity: .98;
        filter: drop-shadow(0 18px 36px rgba(0,0,0,.55));
      }

      .WTTRDesktopHeroEyebrow {
        margin: 0 0 12px;
        color: #d8b56a;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: .2em;
      }

      .WTTRDesktopHeroTitle {
        margin: 0;
        max-width: 540px;
        font-size: clamp(38px, 5vw, 70px);
        line-height: .98;
        letter-spacing: -.045em;
        text-wrap: balance;
        text-shadow: 0 18px 50px rgba(0,0,0,.4);
      }

      .WTTRDesktopHeroLead {
        margin: 18px 0 0;
        max-width: 510px;
        color: #b6c5cb;
        font-size: 14px;
        line-height: 1.6;
      }

      .WTTRDesktopHeroMeta {
        margin: 20px 0 0;
        color: #8fa2aa;
        font-size: 10.5px;
        font-weight: 700;
        letter-spacing: .12em;
      }

      .WTTRDesktopHeroMeta span {
        color: #d8b56a;
        margin: 0 7px;
      }

      #cc-main,
      .cc-window,
      .cc-revoke {
        display: none !important;
      }

      .ModalManager {
        z-index: 9999 !important;
        background: transparent !important;
        backdrop-filter: none !important;
        display: flex !important;
        align-items: center !important;
        justify-content: flex-end !important;
        padding: 24px clamp(24px, 8vw, 120px) !important;
      }

      .Modal-content {
        width: 432px !important;
        max-width: calc(100vw - 32px) !important;
        margin: 0 !important;
        padding: 26px !important;
        background: linear-gradient(180deg, rgba(16,27,33,.97), rgba(10,19,24,.99)) !important;
        border: 1px solid rgba(255,255,255,.12) !important;
        border-radius: 24px !important;
        box-shadow:
          0 40px 100px rgba(0,0,0,.65),
          inset 0 1px 0 rgba(255,255,255,.04) !important;
        max-height: calc(100vh - 48px) !important;
        overflow-y: auto !important;
        animation: wttr-modal-in .55s cubic-bezier(.2,.8,.2,1) both;
      }

      .Modal-content .Modal-header {
        border: 0 !important;
        padding: 0 0 6px !important;
      }

      .Modal-content .Modal-header h3 {
        font-size: 24px !important;
        letter-spacing: -.025em;
      }

      .Modal-content .Modal-body {
        padding: 0 !important;
      }

      .Modal-content .Modal-footer {
        border: 0 !important;
        padding: 14px 0 0 !important;
      }

      .Modal-content .FormControl {
        background: #0b151a !important;
        border: 1px solid rgba(255,255,255,.11) !important;
        color: #eef4f6 !important;
        border-radius: 11px !important;
      }

      .Modal-content .FormControl:focus {
        border-color: rgba(224,90,79,.65) !important;
        box-shadow: 0 0 0 3px rgba(192,57,43,.16) !important;
      }

      .Modal-content .Button--primary {
        background: linear-gradient(135deg, #c0392b, #8f241b) !important;
        border: 0 !important;
        border-radius: 11px !important;
        box-shadow: 0 12px 28px rgba(192,57,43,.28) !important;
      }

      .Modal-content .Modal-close {
        display: none !important;
      }

      .WTTRDesktopAuthHint {
        margin: 0 0 14px;
        color: #93a6ae;
        font-size: 11px;
        line-height: 1.45;
        text-align: center;
      }

      .WTTRDesktopAuthTabs {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 4px;
        margin: 0 0 16px;
        padding: 4px;
        background: rgba(0,0,0,.24);
        border: 1px solid rgba(255,255,255,.08);
        border-radius: 12px;
      }

      .WTTRDesktopAuthTabs button {
        appearance: none;
        border: 0;
        border-radius: 9px;
        background: transparent;
        color: #93a6ae;
        font: inherit;
        font-size: 11.5px;
        font-weight: 800;
        padding: 9px 8px;
        cursor: pointer;
        transition: background .2s ease, color .2s ease, box-shadow .2s ease;
      }

      .WTTRDesktopAuthTabs button.is-active {
        background: #c0392b;
        color: #fff;
        box-shadow: 0 6px 18px rgba(192,57,43,.3);
      }

      .WTTRDesktopAuthTabs button:not(.is-active):hover {
        color: #fff;
        background: rgba(255,255,255,.06);
      }

      @keyframes wttr-bg-drift {
        0% { transform: scale(1.03) translate3d(-1%, 0, 0); }
        100% { transform: scale(1.13) translate3d(1.6%, -1.2%, 0); }
      }

      @keyframes wttr-glow-pulse {
        0%, 100% { opacity: .32; transform: scale(1); }
        50% { opacity: .55; transform: scale(1.08); }
      }

      @keyframes wttr-modal-in {
        from { opacity: 0; transform: translateY(18px) scale(.985); }
        to { opacity: 1; transform: none; }
      }

      @media (max-width: 980px) {
        #wttr-auth-shell-hero,
        #wttr-auth-shell-glow {
          display: none;
        }

        .ModalManager {
          justify-content: center !important;
          padding: 20px !important;
        }
      }
    `;

    document.head.appendChild(style);

    try {
      localStorage.setItem('wttrAuthMode', '1');
    } catch (error) {}

    document.documentElement.classList.add('wttr-auth-mode');
    if (document.body) document.body.classList.add('wttr-auth-mode');

    const background = document.createElement('div');
    background.id = 'wttr-auth-shell-bg';
    document.body.appendChild(background);

    const glow = document.createElement('div');
    glow.id = 'wttr-auth-shell-glow';
    document.body.appendChild(glow);

    const hero = document.createElement('div');
    hero.id = 'wttr-auth-shell-hero';
    hero.innerHTML = `
      <img class="WTTRDesktopHeroLogo" src="https://warthunder.tr/assets/pwa-icon-512x512-s8vyxeai.png" alt="War Thunder Türkiye" />
      <p class="WTTRDesktopHeroEyebrow">WAR THUNDER TÜRKİYE</p>
      <h1 class="WTTRDesktopHeroTitle">Topluluğa katıl.</h1>
      <p class="WTTRDesktopHeroLead">
        Forum, sosyal akış ve sesli odalar tek uygulamada. Gerçek Flarum hesabınla
        giriş yap, topluluğa kaldığın yerden devam et.
      </p>
      <p class="WTTRDesktopHeroMeta">FORUM <span>·</span> SOSYAL <span>·</span> SESLİ ODALAR</p>
    `;
    document.body.appendChild(hero);
    document.getElementById('wttr-auth-veil')?.remove();
  }

  let switching = false;

  const openAuth = (mode) => {
    try {
      if (window.app && window.app.session && window.app.session.user) return;
      if (switching) return;

      switching = true;

      try {
        if (window.app && window.app.modal && window.app.modal.close) {
          window.app.modal.close();
        }
      } catch (error) {}

      setTimeout(() => {
        try {
          if (window.WTTRDesktop && typeof window.WTTRDesktop.openAuth === 'function') {
            window.WTTRDesktop.openAuth(mode);
          } else if (window.app && window.app.modal) {
            const name = mode === 'register'
              ? 'forum/components/SignUpModal'
              : 'forum/components/LogInModal';
            const component = window.flarum && window.flarum.reg
              ? window.flarum.reg.get('core', name)
              : null;

            if (component) window.app.modal.show(component);
          }
        } catch (error) {}
        switching = false;
      }, 120);
    } catch (error) {
      switching = false;
    }
  };

  const decorate = () => {
    const body = document.querySelector('.Modal-content .Modal-body');
    if (!body) return;

    if (!body.querySelector('.WTTRDesktopAuthHint')) {
      const hint = document.createElement('p');
      hint.className = 'WTTRDesktopAuthHint';
      hint.textContent = 'War Thunder Türkiye hesabınla devam et.';
      body.insertBefore(hint, body.firstChild);
    }

    const isRegister = Boolean(document.querySelector('.Modal-content input[name="email"]'));
    let tabs = body.querySelector('.WTTRDesktopAuthTabs');

    if (!tabs) {
      tabs = document.createElement('div');
      tabs.className = 'WTTRDesktopAuthTabs';

      const login = document.createElement('button');
      login.type = 'button';
      login.textContent = 'Giriş Yap';
      login.addEventListener('click', () => openAuth('login'));

      const register = document.createElement('button');
      register.type = 'button';
      register.textContent = 'Kayıt Ol';
      register.addEventListener('click', () => openAuth('register'));

      tabs.appendChild(login);
      tabs.appendChild(register);
      body.insertBefore(tabs, body.firstChild);
    }

    const buttons = tabs.querySelectorAll('button');

    if (buttons.length === 2) {
      buttons[0].classList.toggle('is-active', !isRegister);
      buttons[1].classList.toggle('is-active', isRegister);
    }

    const remember = document.querySelector('.Modal-content input[name="remember"]')
      || document.querySelector('.Modal-content input[type="checkbox"]');

    if (remember && !remember.checked) {
      remember.click();

      if (!remember.checked) {
        remember.checked = true;
        remember.dispatchEvent(new Event('input', { bubbles: true }));
        remember.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  };

  const tick = () => {
    if (switching) return;

    try {
      if (window.app && window.app.session && window.app.session.user) {
        cleanup();
        return;
      }
    } catch (error) {}

    if (!document.querySelector('.Modal-content')) {
      openAuth('login');
    } else {
      decorate();
    }
  };

  setTimeout(tick, 400);

  if (!window.__wttrAuthShellTimer) {
    window.__wttrAuthShellTimer = setInterval(tick, 700);
  }
})();
"##
}

fn auth_veil_script() -> &'static str {
    r#"
(function () {
  if (location.hostname !== 'warthunder.tr') return;

  const addVeil = () => {
    let authMode = false;

    try {
      authMode = localStorage.getItem('wttrAuthMode') === '1';
    } catch (error) {}

    if (!authMode || document.getElementById('wttr-auth-veil')) return;

    const veil = document.createElement('div');
    veil.id = 'wttr-auth-veil';
    veil.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#070c0f;display:flex;align-items:center;justify-content:center;pointer-events:none;';

    const logo = document.createElement('img');
    logo.src = 'https://warthunder.tr/assets/pwa-icon-512x512-s8vyxeai.png';
    logo.alt = 'War Thunder Türkiye';
    logo.style.cssText = 'width:92px;height:92px;opacity:.92;filter:drop-shadow(0 16px 36px rgba(0,0,0,.65));';

    veil.appendChild(logo);
    (document.body || document.documentElement).appendChild(veil);

    setTimeout(() => veil.remove(), 6000);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addVeil);
  } else {
    addVeil();
  }
})();
"#
}

fn cleanup_auth_shell_script() -> &'static str {
    r#"
try {
  if (window.__wttrAuthShellCleanup) {
    window.__wttrAuthShellCleanup();
  }
} catch (error) {}
"#
}

fn session_script() -> &'static str {
    r#"
(function () {
  if (window.__wttrSessionReporter) return;
  window.__wttrSessionReporter = true;

  let last = '';

  const normalizeUser = (user) => {
    if (!user) return null;

    return {
      id: user.id || null,
      username: user.username || null,
      displayName: user.displayName || user.display_name || user.username || null,
      avatarUrl: user.avatarUrl || user.avatar_url || null
    };
  };

  const fromFlarum = () => {
    try {
      if (!window.WTTRDesktop || typeof window.WTTRDesktop.getState !== 'function') return null;

      const data = window.WTTRDesktop.getState();
      if (!data) return null;

      return {
        authenticated: Boolean(data.user),
        user: normalizeUser(data.user),
        unreadNotifications: Number(data.unreadNotifications) || 0
      };
    } catch (error) {
      return null;
    }
  };

  const fromApi = async () => {
    try {
      const response = await fetch('/api/desktop/session', {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' }
      });

      if (!response.ok) return null;

      const payload = await response.json();
      const data = payload.data || {};

      return {
        authenticated: Boolean(data.authenticated),
        user: normalizeUser(data.user),
        unreadNotifications: Number(data.unreadNotifications) || 0
      };
    } catch (error) {
      return null;
    }
  };

  let cachedNotification = null;
  let notificationFetchedAt = 0;

  const stripHtml = (value) => {
    if (!value) return '';

    const element = document.createElement('div');
    element.innerHTML = String(value);
    return (element.textContent || '').replace(/\s+/g, ' ').trim();
  };

  const latestNotification = async () => {
    const now = Date.now();
    if (now - notificationFetchedAt < 5000) return cachedNotification;
    notificationFetchedAt = now;

    try {
      const response = await fetch('/api/notifications?page[limit]=1&sort=-createdAt', {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' }
      });

      if (!response.ok) {
        cachedNotification = null;
        return null;
      }

      const payload = await response.json();
      const item = payload.data && payload.data[0];

      if (!item) {
        cachedNotification = null;
        return null;
      }

      const attributes = item.attributes || {};
      const body = stripHtml(attributes.content || attributes.title || '');

      cachedNotification = {
        id: String(item.id),
        title: 'War Thunder Türkiye',
        body: body || 'Yeni bir bildirimin var.'
      };

      return cachedNotification;
    } catch (error) {
      return cachedNotification;
    }
  };

  const report = async () => {
    const session = fromFlarum() || await fromApi();
    if (!session) return;

    if (session.authenticated && Number(session.unreadNotifications) > 0) {
      const notification = await latestNotification();
      if (notification) session.latestNotification = notification;
    }

    const encoded = JSON.stringify(session);
    if (encoded === last) return;
    last = encoded;

    try {
      window.location.href = '/__wttr_desktop/session?payload=' + encodeURIComponent(encoded);
    } catch (error) {
      // The app keeps its current session state if the bridge is unavailable.
    }
  };

  report();
  setInterval(report, 2500);
})();
"#
}

fn normalize_ptt_key(key: &str) -> &str {
    match key {
        "alt" => "AltLeft",
        "shift" => "ShiftLeft",
        "ctrl" => "ControlLeft",
        "capslock" => "CapsLock",
        "space" => "Space",
        "tab" => "Tab",
        "enter" => "Enter",
        "escape" => "Escape",
        "backspace" => "Backspace",
        "v" => "KeyV",
        "f" => "KeyF",
        "c" => "KeyC",
        "x" => "KeyX",
        "z" => "KeyZ",
        "t" => "KeyT",
        "g" => "KeyG",
        "b" => "KeyB",
        "q" => "KeyQ",
        "e" => "KeyE",
        "r" => "KeyR",
        "1" => "Digit1",
        "2" => "Digit2",
        "3" => "Digit3",
        "4" => "Digit4",
        "5" => "Digit5",
        "6" => "Digit6",
        "7" => "Digit7",
        "8" => "Digit8",
        "9" => "Digit9",
        "0" => "Digit0",
        _ => key,
    }
}

const PTT_BINDINGS: &[(&str, &str, i32)] = &[
    ("AltLeft", "Alt", 0x12),
    ("AltRight", "Alt", 0x12),
    ("ShiftLeft", "Shift", 0x10),
    ("ShiftRight", "Shift", 0x10),
    ("ControlLeft", "Control", 0x11),
    ("ControlRight", "Control", 0x11),
    ("MetaLeft", "Meta", 0x5B),
    ("MetaRight", "Meta", 0x5C),
    ("CapsLock", "CapsLock", 0x14),
    ("Space", " ", 0x20),
    ("Tab", "Tab", 0x09),
    ("Enter", "Enter", 0x0D),
    ("NumpadEnter", "Enter", 0x0D),
    ("Backspace", "Backspace", 0x08),
    ("Escape", "Escape", 0x1B),
    ("PrintScreen", "PrintScreen", 0x2C),
    ("ScrollLock", "ScrollLock", 0x91),
    ("Pause", "Pause", 0x13),
    ("NumLock", "NumLock", 0x90),
    ("ContextMenu", "ContextMenu", 0x5D),
    ("ArrowUp", "ArrowUp", 0x26),
    ("ArrowDown", "ArrowDown", 0x28),
    ("ArrowLeft", "ArrowLeft", 0x25),
    ("ArrowRight", "ArrowRight", 0x27),
    ("Home", "Home", 0x24),
    ("End", "End", 0x23),
    ("PageUp", "PageUp", 0x21),
    ("PageDown", "PageDown", 0x22),
    ("Insert", "Insert", 0x2D),
    ("Delete", "Delete", 0x2E),
    ("KeyA", "a", 0x41),
    ("KeyB", "b", 0x42),
    ("KeyC", "c", 0x43),
    ("KeyD", "d", 0x44),
    ("KeyE", "e", 0x45),
    ("KeyF", "f", 0x46),
    ("KeyG", "g", 0x47),
    ("KeyH", "h", 0x48),
    ("KeyI", "i", 0x49),
    ("KeyJ", "j", 0x4A),
    ("KeyK", "k", 0x4B),
    ("KeyL", "l", 0x4C),
    ("KeyM", "m", 0x4D),
    ("KeyN", "n", 0x4E),
    ("KeyO", "o", 0x4F),
    ("KeyP", "p", 0x50),
    ("KeyQ", "q", 0x51),
    ("KeyR", "r", 0x52),
    ("KeyS", "s", 0x53),
    ("KeyT", "t", 0x54),
    ("KeyU", "u", 0x55),
    ("KeyV", "v", 0x56),
    ("KeyW", "w", 0x57),
    ("KeyX", "x", 0x58),
    ("KeyY", "y", 0x59),
    ("KeyZ", "z", 0x5A),
    ("Digit0", "0", 0x30),
    ("Digit1", "1", 0x31),
    ("Digit2", "2", 0x32),
    ("Digit3", "3", 0x33),
    ("Digit4", "4", 0x34),
    ("Digit5", "5", 0x35),
    ("Digit6", "6", 0x36),
    ("Digit7", "7", 0x37),
    ("Digit8", "8", 0x38),
    ("Digit9", "9", 0x39),
    ("Numpad0", "0", 0x60),
    ("Numpad1", "1", 0x61),
    ("Numpad2", "2", 0x62),
    ("Numpad3", "3", 0x63),
    ("Numpad4", "4", 0x64),
    ("Numpad5", "5", 0x65),
    ("Numpad6", "6", 0x66),
    ("Numpad7", "7", 0x67),
    ("Numpad8", "8", 0x68),
    ("Numpad9", "9", 0x69),
    ("NumpadAdd", "+", 0x6B),
    ("NumpadSubtract", "-", 0x6D),
    ("NumpadMultiply", "*", 0x6A),
    ("NumpadDivide", "/", 0x6F),
    ("NumpadDecimal", ".", 0x6E),
    ("F1", "F1", 0x70),
    ("F2", "F2", 0x71),
    ("F3", "F3", 0x72),
    ("F4", "F4", 0x73),
    ("F5", "F5", 0x74),
    ("F6", "F6", 0x75),
    ("F7", "F7", 0x76),
    ("F8", "F8", 0x77),
    ("F9", "F9", 0x78),
    ("F10", "F10", 0x79),
    ("F11", "F11", 0x7A),
    ("F12", "F12", 0x7B),
    ("F13", "F13", 0x7C),
    ("F14", "F14", 0x7D),
    ("F15", "F15", 0x7E),
    ("F16", "F16", 0x7F),
    ("F17", "F17", 0x80),
    ("F18", "F18", 0x81),
    ("F19", "F19", 0x82),
    ("F20", "F20", 0x83),
    ("F21", "F21", 0x84),
    ("F22", "F22", 0x85),
    ("F23", "F23", 0x86),
    ("F24", "F24", 0x87),
    ("Semicolon", ";", 0xBA),
    ("Equal", "=", 0xBB),
    ("Comma", ",", 0xBC),
    ("Minus", "-", 0xBD),
    ("Period", ".", 0xBE),
    ("Slash", "/", 0xBF),
    ("Backquote", "`", 0xC0),
    ("BracketLeft", "[", 0xDB),
    ("Backslash", "\\", 0xDC),
    ("BracketRight", "]", 0xDD),
    ("Quote", "'", 0xDE),
    ("MediaPlayPause", "MediaPlayPause", 0xB3),
    ("MediaTrackNext", "MediaTrackNext", 0xB0),
    ("MediaTrackPrevious", "MediaTrackPrevious", 0xB1),
    ("MediaStop", "MediaStop", 0xB2),
    ("AudioVolumeUp", "AudioVolumeUp", 0xAF),
    ("AudioVolumeDown", "AudioVolumeDown", 0xAE),
    ("AudioVolumeMute", "AudioVolumeMute", 0xAD),
];

fn ptt_binding(key: &str) -> Option<(&'static str, &'static str, i32)> {
    let key = normalize_ptt_key(key);

    PTT_BINDINGS
        .iter()
        .find(|(code, _, _)| *code == key)
        .map(|(code, keyboard_key, vk)| (*code, *keyboard_key, *vk))
}

#[cfg(windows)]
fn key_is_down(vk: i32) -> bool {
    #[link(name = "user32")]
    extern "system" {
        fn GetAsyncKeyState(v_key: i32) -> i16;
    }

    unsafe { (GetAsyncKeyState(vk) as u16 & 0x8000) != 0 }
}

#[cfg(not(windows))]
fn key_is_down(_vk: i32) -> bool {
    false
}

fn inject_ptt(app: &AppHandle, down: bool, target: &str) {
    let Some((code, key, _)) = ptt_binding(target) else {
        return;
    };

    let kind = if down { "keydown" } else { "keyup" };
    let code = serde_json::to_string(code).unwrap_or_else(|_| "\"\"".to_string());
    let key = serde_json::to_string(key).unwrap_or_else(|_| "\"\"".to_string());
    let event_script = format!(
        "window.dispatchEvent(new KeyboardEvent({kind:?}, {{ code: {code}, key: {key}, bubbles: true, cancelable: true }}));"
    );
    let script = format!(
        "try {{ if (window.WTTRDesktop && typeof window.WTTRDesktop.setPTT === 'function') {{ window.WTTRDesktop.setPTT({down}); }} else {{ {event_script} }} }} catch (error) {{ {event_script} }}"
    );

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.eval(&script);
    }
}

fn start_ptt_listener(app: AppHandle, settings_state: Arc<Mutex<DesktopSettings>>) {
    std::thread::spawn(move || {
        let mut down = false;

        loop {
            let settings = settings_state
                .lock()
                .map(|value| value.clone())
                .unwrap_or_default();

            let pressed = if settings.ptt_enabled {
                key_is_down(
                    ptt_binding(&settings.ptt_key)
                        .map(|(_, _, vk)| vk)
                        .unwrap_or(0x12),
                )
            } else {
                false
            };

            if pressed != down {
                down = pressed;
                log(&format!(
                    "ptt:{}:{}",
                    if down { "down" } else { "up" },
                    settings.ptt_key
                ));
                inject_ptt(&app, down, &settings.ptt_key);
            }

            std::thread::sleep(Duration::from_millis(20));
        }
    });
}

fn session_json(session: &SessionState) -> serde_json::Value {
    let user = if session.authenticated {
        serde_json::json!({
            "username": session.username.as_deref(),
            "displayName": session.display_name.as_deref(),
            "avatarUrl": session.avatar_url.as_deref(),
        })
    } else {
        serde_json::Value::Null
    };

    serde_json::json!({
        "known": session.known,
        "authenticated": session.authenticated,
        "user": user,
        "unreadNotifications": session.unread,
    })
}

fn is_authenticated(app: &AppHandle) -> bool {
    app.state::<AppState>()
        .session
        .lock()
        .map(|session| session.authenticated)
        .unwrap_or(false)
}

fn apply_session(app: &AppHandle, payload: BridgeSession) {
    if payload.selftest {
        log(&format!("bridge:selftest:{}", payload.authenticated));
        return;
    }

    if let Some(notification) = payload.latest_notification.as_ref() {
        log(&format!("notification:payload:{:?}", notification.id));
    }

    let notifications_enabled = app
        .state::<SettingsState>()
        .0
        .lock()
        .map(|settings| settings.notifications_enabled)
        .unwrap_or(true);

    let mut notification_to_show: Option<BridgeNotification> = None;
    let snapshot;
    let changed;
    let was_authenticated;
    let was_known;

    {
        let state = app.state::<AppState>();
        let Ok(mut session) = state.session.lock() else {
            return;
        };

        was_authenticated = session.authenticated;
        was_known = session.known;
        let previous_notification = session.last_notification_id.clone();

        let next_username = payload.user.as_ref().and_then(|user| user.username.clone());
        let next_display_name = payload
            .user
            .as_ref()
            .and_then(|user| user.display_name.clone());
        let next_avatar_url = payload.user.as_ref().and_then(|user| user.avatar_url.clone());

        changed = !session.known
            || session.authenticated != payload.authenticated
            || session.username != next_username
            || session.display_name != next_display_name
            || session.avatar_url != next_avatar_url
            || session.unread != payload.unread_notifications;

        session.known = true;
        session.authenticated = payload.authenticated;
        session.username = next_username;
        session.display_name = next_display_name;
        session.avatar_url = next_avatar_url;
        session.unread = payload.unread_notifications;

        if payload.authenticated {
            if let Some(notification) = payload.latest_notification.as_ref() {
                session.last_notification_id = notification.id.clone();
            }
        } else {
            session.last_notification_id = None;
        }

        if notifications_enabled && payload.authenticated && payload.unread_notifications > 0 {
            if let Some(notification) = payload.latest_notification.as_ref() {
                let is_new = notification.id.is_some()
                    && notification.id != previous_notification;

                if is_new {
                    notification_to_show = Some(notification.clone());
                }
            }
        }

        snapshot = session.clone();
    }

    if changed {
        let _ = app.emit_to("dashboard", "session-changed", session_json(&snapshot));
    }

    if let Some(notification) = notification_to_show {
        show_native_notification(app, &notification);
    }

    if snapshot.authenticated {
        if let Ok(mut pending) = app.state::<AppState>().auth_pending.lock() {
            *pending = false;
        }

        if !was_known || !was_authenticated {
            show_dashboard(app);
        }
    } else if snapshot.known && (!was_known || was_authenticated) {
        show_auth_main(app);
    }
}

fn is_bridge_url(url: &tauri::Url) -> bool {
    url.host_str() == Some(SITE_HOST) && url.path().starts_with(BRIDGE_PREFIX)
}

fn handle_bridge_navigation(app: &AppHandle, url: &tauri::Url) {
    let payload = url
        .query_pairs()
        .find(|(key, _)| key == "payload")
        .map(|(_, value)| value.into_owned());

    let Some(payload) = payload else {
        log("bridge:missing-payload");
        return;
    };

    if std::env::var("WTTR_BRIDGE_SELFTEST").is_ok() {
        log(&format!(
            "bridge:payload:{}",
            payload.chars().take(700).collect::<String>()
        ));
    }

    match serde_json::from_str::<BridgeSession>(&payload) {
        Ok(session) => {
            log(&format!(
                "bridge:session:{}:{:?}",
                session.authenticated,
                session.user.as_ref().and_then(|user| user.username.clone())
            ));
            apply_session(app, session);
        }
        Err(error) => log(&format!("bridge:invalid:{error}")),
    }
}

fn cleanup_auth_shell(app: &AppHandle) {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.eval(cleanup_auth_shell_script());
    }

    if let Ok(mut pending) = app.state::<AppState>().auth_shell_pending.lock() {
        *pending = false;
    }
}

fn show_native_notification(app: &AppHandle, notification: &BridgeNotification) {
    let title = notification
        .title
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("War Thunder Türkiye");
    let body = notification
        .body
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("Yeni bir bildirimin var.");

    match app.notification().builder().title(title).body(body).show() {
        Ok(_) => log("notification:shown"),
        Err(error) => log(&format!("notification:error:{error}")),
    }
}

fn show_auth_main(app: &AppHandle) {
    let Some(main) = app.get_webview_window("main") else {
        return;
    };

    let on_site = main
        .url()
        .ok()
        .and_then(|url| url.host_str().map(|host| host == SITE_HOST))
        .unwrap_or(false);

    if let Ok(mut pending) = app.state::<AppState>().auth_shell_pending.lock() {
        *pending = true;
    }

    let _ = main.eval("try { localStorage.setItem('wttrAuthMode', '1'); } catch (error) {}");

    if on_site {
        let _ = main.eval(auth_shell_script());

        if let Ok(mut pending) = app.state::<AppState>().auth_shell_pending.lock() {
            *pending = false;
        }
    } else {
        let parsed = match tauri::Url::parse(AUTH_URL) {
            Ok(url) => url,
            Err(error) => {
                log(&format!("auth_shell:navigate:error:{error}"));
                return;
            }
        };

        if let Err(error) = main.navigate(parsed) {
            log(&format!("auth_shell:navigate:error:{error}"));
            return;
        }
    }

    let _ = main.show();
    let _ = main.set_focus();

    if let Some(dashboard) = app.get_webview_window("dashboard") {
        let _ = dashboard.hide();
    }
}

fn show_home(app: &AppHandle) {
    if is_authenticated(app) {
        show_dashboard(app);
    } else {
        show_auth_main(app);
    }
}

fn show_dashboard(app: &AppHandle) {
    cleanup_auth_shell(app);

    if let Some(main) = app.get_webview_window("main") {
        let _ = main.hide();
    }

    if let Some(dashboard) = app.get_webview_window("dashboard") {
        let _ = dashboard.show();
        let _ = dashboard.set_focus();
    }
}

fn show_main(app: &AppHandle, url: &str) -> Result<(), String> {
    let main = app
        .get_webview_window("main")
        .ok_or_else(|| "main window is not available".to_string())?;

    if is_authenticated(app) {
        cleanup_auth_shell(app);
    }

    let parsed = tauri::Url::parse(url).map_err(|error| error.to_string())?;
    main.navigate(parsed).map_err(|error| error.to_string())?;
    main.show().map_err(|error| error.to_string())?;
    let _ = main.set_focus();

    if let Some(dashboard) = app.get_webview_window("dashboard") {
        let _ = dashboard.hide();
    }

    Ok(())
}

fn open_authenticated(app: &AppHandle, url: &str) {
    if is_authenticated(app) {
        let _ = show_main(app, url);
    } else {
        show_auth_main(app);
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct DiscussionItem {
    title: String,
    url: String,
    replies: i64,
    last_posted_at: Option<String>,
}

#[tauri::command]
async fn get_latest_discussions(app: AppHandle) -> Result<Vec<DiscussionItem>, String> {
    if !is_authenticated(&app) {
        return Err("login required".to_string());
    }

    let client = reqwest::Client::builder()
        .user_agent("WarThunderDesktop/0.2 (+https://warthunder.tr)")
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|error| error.to_string())?;

    let response = client
        .get("https://warthunder.tr/api/discussions")
        .query(&[("sort", "-lastPostedAt"), ("page[limit]", "10")])
        .send()
        .await
        .map_err(|error| error.to_string())?;

    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status()));
    }

    let payload: serde_json::Value = response.json().await.map_err(|error| error.to_string())?;
    let items = payload
        .get("data")
        .and_then(|value| value.as_array())
        .cloned()
        .unwrap_or_default();

    let discussions = items
        .into_iter()
        .filter_map(|item| {
            let attributes = item.get("attributes")?;
            let title = attributes.get("title")?.as_str()?.to_string();
            let url = attributes
                .get("shareUrl")
                .and_then(|value| value.as_str())
                .map(str::to_string)
                .or_else(|| {
                    let id = item.get("id")?.as_str()?;
                    let slug = attributes.get("slug")?.as_str()?;
                    Some(format!("https://warthunder.tr/d/{id}-{slug}"))
                })?;
            let replies = attributes
                .get("commentCount")
                .and_then(|value| value.as_i64())
                .unwrap_or(1)
                .saturating_sub(1);
            let last_posted_at = attributes
                .get("lastPostedAt")
                .and_then(|value| value.as_str())
                .map(str::to_string);

            Some(DiscussionItem {
                title,
                url,
                replies,
                last_posted_at,
            })
        })
        .take(10)
        .collect();

    Ok(discussions)
}

#[tauri::command]
fn get_session(state: State<'_, AppState>) -> serde_json::Value {
    let session = state
        .session
        .lock()
        .map(|value| value.clone())
        .unwrap_or_default();

    session_json(&session)
}

#[tauri::command]
fn refresh_session(app: AppHandle) -> Result<(), String> {
    if let Some(main) = app.get_webview_window("main") {
        let parsed = tauri::Url::parse(AUTH_URL).map_err(|error| error.to_string())?;
        main.navigate(parsed).map_err(|error| error.to_string())?;
    }

    Ok(())
}

#[tauri::command]
fn logout(app: AppHandle) -> Result<(), String> {
    log("logout:requested");

    if let Ok(mut pending) = app.state::<AppState>().auth_pending.lock() {
        *pending = false;
    }

    if let Some(main) = app.get_webview_window("main") {
        main.eval(
            r#"
try {
  if (window.WTTRDesktop && typeof window.WTTRDesktop.logout === 'function') {
    window.WTTRDesktop.logout();
  } else if (window.app && window.app.session && typeof window.app.session.logout === 'function') {
    window.app.session.logout();
  } else {
    const link = document.querySelector('.item-logout, .LogOutButton');
    if (link) link.click();
  }
} catch (error) {}
"#,
        )
        .map_err(|error| error.to_string())?;
    }

    Ok(())
}

#[tauri::command]
fn open_url(app: AppHandle, url: String) -> Result<(), String> {
    log(&format!("open_url:{url}"));

    if !is_authenticated(&app) {
        return Err("login required".to_string());
    }

    let parsed = tauri::Url::parse(&url).map_err(|error| error.to_string())?;

    if parsed.host_str() != Some(SITE_HOST) {
        return Err("unsupported url".to_string());
    }

    show_main(&app, parsed.as_str())
}

#[tauri::command]
fn open_section(app: AppHandle, section: String) -> Result<(), String> {
    log(&format!("open_section:{section}"));

    if !is_authenticated(&app) {
        return Err("login required".to_string());
    }

    let url = match section.as_str() {
        "forum" => FORUM_URL,
        "blog" => BLOG_URL,
        "social" => SOCIAL_URL,
        _ => return Err("unknown section".to_string()),
    };

    show_main(&app, url)
}

#[tauri::command]
fn open_auth(
    app: AppHandle,
    state: State<'_, AppState>,
    mode: String,
    identification: Option<String>,
    password: Option<String>,
    username: Option<String>,
    email: Option<String>,
    remember: Option<bool>,
) -> Result<(), String> {
    log(&format!("open_auth:{mode}"));
    let mode = if mode == "register" { "register" } else { "login" };

    let auth = PendingAuth {
        mode: mode.to_string(),
        identification,
        password,
        username,
        email,
        remember: remember.unwrap_or(true),
    };

    if let Ok(mut pending) = state.auth_pending.lock() {
        *pending = true;
    }

    let mut used_current_page = false;

    if let Some(main) = app.get_webview_window("main") {
        let on_site = main
            .url()
            .ok()
            .and_then(|url| url.host_str().map(|host| host == SITE_HOST))
            .unwrap_or(false);

        if on_site {
            let _ = main.eval(&auth_script(&auth));
            let _ = main.show();
            let _ = main.set_focus();

            if let Some(dashboard) = app.get_webview_window("dashboard") {
                let _ = dashboard.hide();
            }

            used_current_page = true;
        }
    }

    if !used_current_page {
        if let Ok(mut pending) = state.pending_auth.lock() {
            *pending = Some(auth);
        }

        show_main(&app, AUTH_URL)?;
    }

    Ok(())
}

#[tauri::command]
fn get_settings(state: State<'_, SettingsState>) -> DesktopSettings {
    state
        .0
        .lock()
        .map(|value| value.clone())
        .unwrap_or_default()
}

#[tauri::command]
fn save_settings(
    app: AppHandle,
    state: State<'_, SettingsState>,
    mut settings: DesktopSettings,
) -> Result<(), String> {
    settings.ptt_key = normalize_ptt_key(&settings.ptt_key).to_string();

    if ptt_binding(&settings.ptt_key).is_none() {
        return Err("unsupported push-to-talk key".to_string());
    }

    if let Ok(mut value) = state.0.lock() {
        *value = settings.clone();
    }

    log("save_settings:persist");
    persist_settings(&app, &settings);
    log("save_settings:done");
    Ok(())
}

#[tauri::command]
fn test_notification(app: AppHandle) -> Result<(), String> {
    app.notification()
        .builder()
        .title("War Thunder Türkiye")
        .body("Bildirimler aktif. Yeni bildirimler burada görünecek.")
        .show()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn request_microphone(app: AppHandle) -> Result<(), String> {
    let script = r#"
(async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    window.__wttrMicTest = 'ok';
  } catch (error) {
    window.__wttrMicTest = String(error);
  }
})();
"#;

    let mut started = false;

    for label in ["dashboard", "main"] {
        if let Some(window) = app.get_webview_window(label) {
            if window.eval(script).is_ok() {
                started = true;
            }
        }
    }

    if started {
        Ok(())
    } else {
        Err("no window available".to_string())
    }
}

#[tauri::command]
fn open_microphone_settings() -> Result<(), String> {
    std::process::Command::new("cmd")
        .args(["/C", "start", "", "ms-settings:privacy-microphone"])
        .spawn()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    let parsed = tauri::Url::parse(&url).map_err(|error| error.to_string())?;

    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("unsupported url".to_string());
    }

    shell_open(parsed.as_str())
}

#[cfg(windows)]
fn shell_open(target: &str) -> Result<(), String> {
    std::process::Command::new("rundll32.exe")
        .args(["url.dll,FileProtocolHandler", target])
        .spawn()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[cfg(not(windows))]
fn shell_open(target: &str) -> Result<(), String> {
    std::process::Command::new("xdg-open")
        .arg(target)
        .spawn()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateInfo {
    available: bool,
    current_version: String,
    latest_version: Option<String>,
    url: Option<String>,
    asset_url: Option<String>,
    notes: Option<String>,
    published_at: Option<String>,
}

fn parse_version(value: &str) -> Vec<u64> {
    value
        .trim()
        .trim_start_matches('v')
        .split(|character: char| !character.is_ascii_digit())
        .filter(|part| !part.is_empty())
        .take(3)
        .map(|part| part.parse().unwrap_or(0))
        .collect()
}

fn version_is_newer(latest: &str, current: &str) -> bool {
    let latest = parse_version(latest);
    let current = parse_version(current);

    for index in 0..3 {
        let left = *latest.get(index).unwrap_or(&0);
        let right = *current.get(index).unwrap_or(&0);

        if left != right {
            return left > right;
        }
    }

    false
}

async fn fetch_github_update(
    client: &reqwest::Client,
) -> Result<Option<UpdateInfo>, String> {
    let response = client
        .get(format!(
            "https://api.github.com/repos/{GITHUB_REPO}/releases/latest"
        ))
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|error| error.to_string())?;

    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }

    if !response.status().is_success() {
        return Err(format!("GitHub HTTP {}", response.status()));
    }

    let payload: serde_json::Value = response.json().await.map_err(|error| error.to_string())?;
    let latest_version = payload
        .get("tag_name")
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .trim_start_matches('v')
        .to_string();

    if latest_version.is_empty() {
        return Ok(None);
    }

    let url = payload
        .get("html_url")
        .and_then(|value| value.as_str())
        .map(str::to_string);
    let notes = payload
        .get("body")
        .and_then(|value| value.as_str())
        .map(|value| value.chars().take(600).collect::<String>());
    let published_at = payload
        .get("published_at")
        .and_then(|value| value.as_str())
        .map(str::to_string);
    let asset_url = payload
        .get("assets")
        .and_then(|value| value.as_array())
        .and_then(|assets| {
            assets.iter().find_map(|asset| {
                let name = asset
                    .get("name")
                    .and_then(|value| value.as_str())
                    .unwrap_or("")
                    .to_ascii_lowercase();

                if name.ends_with(".exe") {
                    asset
                        .get("browser_download_url")
                        .and_then(|value| value.as_str())
                        .map(str::to_string)
                } else {
                    None
                }
            })
        });

    Ok(Some(UpdateInfo {
        available: version_is_newer(&latest_version, APP_VERSION),
        current_version: APP_VERSION.to_string(),
        latest_version: Some(latest_version),
        url,
        asset_url,
        notes,
        published_at,
    }))
}

async fn fetch_site_update(client: &reqwest::Client) -> Result<Option<UpdateInfo>, String> {
    let response = client
        .get("https://warthunder.tr/api/desktop/config")
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|error| error.to_string())?;

    if !response.status().is_success() {
        return Err(format!("site HTTP {}", response.status()));
    }

    let payload: serde_json::Value = response.json().await.map_err(|error| error.to_string())?;
    let Some(app) = payload
        .get("data")
        .and_then(|data| data.get("desktopApp"))
    else {
        return Ok(None);
    };

    let latest_version = app
        .get("latestVersion")
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .trim_start_matches('v')
        .to_string();

    if latest_version.is_empty() {
        return Ok(None);
    }

    let installer_url = app
        .get("installerUrl")
        .and_then(|value| value.as_str())
        .map(str::to_string);
    let download_url = app
        .get("downloadUrl")
        .and_then(|value| value.as_str())
        .map(str::to_string);
    let notes = app
        .get("notes")
        .and_then(|value| value.as_str())
        .map(|value| value.chars().take(600).collect::<String>());

    Ok(Some(UpdateInfo {
        available: version_is_newer(&latest_version, APP_VERSION),
        current_version: APP_VERSION.to_string(),
        latest_version: Some(latest_version),
        url: download_url,
        asset_url: installer_url,
        notes,
        published_at: None,
    }))
}

#[tauri::command]
async fn check_for_updates() -> Result<UpdateInfo, String> {
    let client = reqwest::Client::builder()
        .user_agent(format!("WarThunderDesktop/{APP_VERSION} (+https://warthunder.tr)"))
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|error| error.to_string())?;

    let github = fetch_github_update(&client).await;
    let site = fetch_site_update(&client).await;

    let github_info = github.as_ref().ok().and_then(|value| value.clone());
    let site_info = site.as_ref().ok().and_then(|value| value.clone());

    let chosen = match (github_info, site_info) {
        (Some(github), Some(site)) => {
            let github_version = github.latest_version.as_deref().unwrap_or("0");
            let site_version = site.latest_version.as_deref().unwrap_or("0");

            if version_is_newer(site_version, github_version) {
                Some(site)
            } else {
                Some(github)
            }
        }
        (Some(github), None) => Some(github),
        (None, Some(site)) => Some(site),
        (None, None) => None,
    };

    if let Some(info) = chosen {
        return Ok(info);
    }

    let mut errors = Vec::new();

    if let Err(error) = github {
        errors.push(format!("GitHub: {error}"));
    }

    if let Err(error) = site {
        errors.push(format!("site: {error}"));
    }

    if errors.is_empty() {
        Ok(UpdateInfo {
            available: false,
            current_version: APP_VERSION.to_string(),
            latest_version: None,
            url: None,
            asset_url: None,
            notes: None,
            published_at: None,
        })
    } else {
        Err(errors.join("; "))
    }
}

#[tauri::command]
async fn install_update(app: AppHandle, url: String) -> Result<(), String> {
    let parsed = tauri::Url::parse(&url).map_err(|error| error.to_string())?;

    if parsed.scheme() != "https" {
        return Err("unsupported update url".to_string());
    }

    let host = parsed.host_str().unwrap_or("");

    if host != "github.com" && !host.ends_with(".githubusercontent.com") {
        return Err("unsupported update host".to_string());
    }

    let client = reqwest::Client::builder()
        .user_agent(format!("WarThunderDesktop/{APP_VERSION} (+https://warthunder.tr)"))
        .timeout(std::time::Duration::from_secs(180))
        .build()
        .map_err(|error| error.to_string())?;

    let response = client
        .get(parsed.as_str())
        .send()
        .await
        .map_err(|error| error.to_string())?;

    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status()));
    }

    let bytes = response.bytes().await.map_err(|error| error.to_string())?;

    if bytes.len() < 2 || &bytes[..2] != b"MZ" {
        return Err("downloaded file is not a Windows installer".to_string());
    }

    let raw_name = parsed
        .path_segments()
        .and_then(|segments| segments.last())
        .unwrap_or("WarThunderTurkiyeSetup.exe");
    let safe_name: String = raw_name
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '.' | '-' | '_') {
                character
            } else {
                '_'
            }
        })
        .collect();
    let file_name = if safe_name.to_ascii_lowercase().ends_with(".exe") {
        safe_name
    } else {
        "WarThunderTurkiyeSetup.exe".to_string()
    };
    let path = std::env::temp_dir().join(file_name);

    std::fs::write(&path, &bytes).map_err(|error| error.to_string())?;

    log(&format!("install_update:launch:{}", path.display()));

    std::process::Command::new(&path)
        .args(["/SILENT", "/SUPPRESSMSGBOXES", "/NORESTART", "/SP-"])
        .spawn()
        .map_err(|error| error.to_string())?;

    app.exit(0);
    Ok(())
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let home = MenuItem::with_id(app, "home", "Ana Sayfa", true, None::<&str>)?;
    let forum = MenuItem::with_id(app, "forum", "Forum", true, None::<&str>)?;
    let blog = MenuItem::with_id(app, "blog", "Blog", true, None::<&str>)?;
    let social = MenuItem::with_id(app, "social", "Sosyal", true, None::<&str>)?;
    let reload = MenuItem::with_id(app, "reload", "Yenile", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Çıkış", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;

    let menu = Menu::with_items(
        app,
        &[&home, &forum, &blog, &social, &separator, &reload, &quit],
    )?;

    let icon = match app.default_window_icon() {
        Some(icon) => icon.clone(),
        None => return Ok(()),
    };

    TrayIconBuilder::new()
        .icon(icon)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "home" => show_home(app),
            "forum" => open_authenticated(app, FORUM_URL),
            "blog" => open_authenticated(app, BLOG_URL),
            "social" => open_authenticated(app, SOCIAL_URL),
            "reload" => {
                if let Some(dashboard) = app.get_webview_window("dashboard") {
                    if dashboard.is_visible().unwrap_or(false) {
                        let _ = dashboard.eval("location.reload()");
                        return;
                    }
                }

                if let Some(main) = app.get_webview_window("main") {
                    let _ = main.eval("location.reload()");
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_home(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

pub fn run() {
    std::panic::set_hook(Box::new(|info| {
        let path = std::env::temp_dir().join("wttr-desktop-crash.log");
        let _ = std::fs::write(path, format!("{info:?}\n"));
    }));

    log("run:start");

    let pending_auth = Arc::new(Mutex::new(None::<PendingAuth>));
    let session = Arc::new(Mutex::new(SessionState::default()));
    let auth_pending = Arc::new(Mutex::new(false));
    let auth_shell_pending = Arc::new(Mutex::new(false));
    let settings = Arc::new(Mutex::new(DesktopSettings::default()));

    let pending_for_setup = pending_auth.clone();
    let settings_for_setup = settings.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(main) = app.get_webview_window("main") {
                if main.is_visible().unwrap_or(false) {
                    let _ = main.show();
                    let _ = main.set_focus();
                    return;
                }
            }

            show_home(app);
        }))
        .manage(AppState {
            pending_auth: pending_auth.clone(),
            session: session.clone(),
            auth_pending: auth_pending.clone(),
            auth_shell_pending: auth_shell_pending.clone(),
        })
        .manage(SettingsState(settings.clone()))
        .invoke_handler(tauri::generate_handler![
            open_section,
            open_auth,
            logout,
            refresh_session,
            open_url,
            open_external,
            get_latest_discussions,
            get_settings,
            save_settings,
            request_microphone,
            open_microphone_settings,
            get_session,
            test_notification,
            check_for_updates,
            install_update
        ])
        .setup(move |app| {
            log("setup:start");

            let loaded_settings = load_settings(app.handle());
            if let Ok(mut value) = settings_for_setup.lock() {
                *value = loaded_settings;
            }

            let dashboard = WebviewWindowBuilder::new(
                app,
                "dashboard",
                WebviewUrl::App("index.html".into()),
            )
            .title("War Thunder Türkiye")
            .inner_size(1120.0, 780.0)
            .min_inner_size(900.0, 620.0)
            .center()
            .build()?;

            log("setup:dashboard-built");

            let app_for_load = app.handle().clone();

            let main = WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::External(
                    tauri::Url::parse(AUTH_URL).expect("valid authentication URL"),
                ),
            )
            .title("War Thunder Türkiye")
            .inner_size(1280.0, 860.0)
            .min_inner_size(980.0, 640.0)
            .center()
            .visible(false)
            .initialization_script(auth_veil_script())
            .on_navigation({
                let app_handle = app.handle().clone();

                move |url| {
                    if is_bridge_url(url) {
                        handle_bridge_navigation(&app_handle, url);
                        return false;
                    }

                    true
                }
            })
            .on_page_load(move |webview, payload| {
                log(&format!("page_load:{:?}:{}", payload.event(), payload.url()));

                if payload.event() != PageLoadEvent::Finished {
                    return;
                }

                if payload.url().host_str() != Some(SITE_HOST) {
                    return;
                }

                let auth = pending_for_setup
                    .lock()
                    .ok()
                    .and_then(|mut pending| pending.take());
                let has_auth_request = auth.is_some();

                let _ = webview.eval(session_script());

                let should_show_auth_shell = {
                    let state = app_for_load.state::<AppState>();
                    let pending = state
                        .auth_shell_pending
                        .lock()
                        .map(|mut pending| std::mem::replace(&mut *pending, false))
                        .unwrap_or(false);
                    let guest = state
                        .session
                        .lock()
                        .map(|session| session.known && !session.authenticated)
                        .unwrap_or(false);

                    pending || guest
                };

                if should_show_auth_shell && !has_auth_request {
                    let _ = webview.eval(auth_shell_script());
                }

                if let Some(auth) = auth {
                    let _ = webview.eval(auth_script(&auth));
                }
            })
            .build()?;

            log(&format!("setup:main-built:{:?}", main.url()));

            match main.navigate(tauri::Url::parse(AUTH_URL).expect("valid authentication URL")) {
                Ok(()) => log("setup:main-navigate:ok"),
                Err(error) => log(&format!("setup:main-navigate:error:{error}")),
            }

            let _ = dashboard.set_focus();

            build_tray(app.handle())?;
            log("setup:tray-built");

            if std::env::var("WTTR_NO_PTT").is_err() {
                start_ptt_listener(app.handle().clone(), settings_for_setup.clone());
                log("setup:ptt-started");
            } else {
                log("setup:ptt-disabled");
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            log(&format!("window:{}:{event:?}", window.label()));

            if let WindowEvent::CloseRequested { api, .. } = event {
                let close_to_tray = window
                    .app_handle()
                    .state::<SettingsState>()
                    .0
                    .lock()
                    .map(|settings| settings.close_to_tray)
                    .unwrap_or(true);

                if !close_to_tray {
                    window.app_handle().exit(0);
                    return;
                }

                api.prevent_close();
                let _ = window.hide();

                if window.label() == "main" && is_authenticated(window.app_handle()) {
                    show_dashboard(window.app_handle());
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running War Thunder Türkiye desktop app");
}

fn main() {
    run();
}
