#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::{Arc, Mutex};

use rdev::{EventType, Key};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    webview::PageLoadEvent,
    AppHandle, Manager, PhysicalPosition, PhysicalSize, State, WebviewUrl,
    WebviewWindow, WebviewWindowBuilder, WindowEvent,
};

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

const FORUM_URL: &str = "https://warthunder.tr/";
const BLOG_URL: &str = "https://warthunder.tr/blog";
const SOCIAL_URL: &str = "https://warthunder.tr/social";

#[derive(Clone, serde::Serialize)]
struct PendingAuth {
    mode: String,
    identification: Option<String>,
    password: Option<String>,
    username: Option<String>,
    email: Option<String>,
}

struct AppState {
    pending_auth: Arc<Mutex<Option<PendingAuth>>>,
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopSettings {
    ptt_key: String,
    ptt_enabled: bool,
    start_on_second_monitor: bool,
    close_to_tray: bool,
}

impl Default for DesktopSettings {
    fn default() -> Self {
        Self {
            ptt_key: "alt".to_string(),
            ptt_enabled: true,
            start_on_second_monitor: true,
            close_to_tray: true,
        }
    }
}

struct SettingsState(Arc<Mutex<DesktopSettings>>);

fn settings_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path()
        .app_config_dir()
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
        .filter(|settings| matches!(settings.ptt_key.as_str(), "alt" | "v" | "f"))
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
      #wttr-desktop-auth-bg::after {{
        content: '';
        position: absolute;
        inset: 0;
        background: url('https://warthunder.tr/assets/site-image-dclte953.png') center 24% / min(940px, 82vw) no-repeat;
        opacity: .17;
        filter: saturate(.8);
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
        width: 220px;
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
    logo.src = 'https://warthunder.tr/assets/site-image-dclte953.png';
    logo.alt = 'War Thunder Türkiye';

    const hint = document.createElement('p');
    hint.className = 'WTTRDesktopAuthHint';
    hint.textContent = 'War Thunder Türkiye hesabınla devam et.';

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
    }}

    if (filled || ++attempts > 90) {{
      clearInterval(timer);
    }}
  }}, 400);
}})();
"#
    )
}

fn ptt_event(key: &str) -> (&'static str, &'static str) {
    match key {
        "v" => ("KeyV", "v"),
        "f" => ("KeyF", "f"),
        _ => ("AltLeft", "Alt"),
    }
}

fn key_matches(key: Key, target: &str) -> bool {
    match target {
        "v" => key == Key::KeyV,
        "f" => key == Key::KeyF,
        _ => matches!(key, Key::Alt | Key::AltGr),
    }
}

fn inject_ptt(app: &AppHandle, down: bool, target: &str) {
    let (code, key) = ptt_event(target);
    let kind = if down { "keydown" } else { "keyup" };
    let event_script = format!(
        "window.dispatchEvent(new KeyboardEvent('{kind}', {{ code: '{code}', key: '{key}', bubbles: true, cancelable: true }}));"
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

        let _ = rdev::listen(move |event| {
            let settings = settings_state
                .lock()
                .map(|value| value.clone())
                .unwrap_or_default();

            if !settings.ptt_enabled {
                return;
            }

            let target = settings.ptt_key;

            match event.event_type {
                EventType::KeyPress(key) if key_matches(key, &target) => {
                    if !down {
                        down = true;
                        inject_ptt(&app, true, &target);
                    }
                }
                EventType::KeyRelease(key) if key_matches(key, &target) => {
                    if down {
                        down = false;
                        inject_ptt(&app, false, &target);
                    }
                }
                _ => {}
            }
        });
    });
}

fn show_dashboard(app: &AppHandle) {
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

    let parsed = tauri::Url::parse(url).map_err(|error| error.to_string())?;
    main.navigate(parsed).map_err(|error| error.to_string())?;
    main.show().map_err(|error| error.to_string())?;
    let _ = main.set_focus();

    if let Some(dashboard) = app.get_webview_window("dashboard") {
        let _ = dashboard.hide();
    }

    Ok(())
}

fn place_on_second_monitor(app: &AppHandle, window: &WebviewWindow, fallback: PhysicalSize<u32>) {
    let Ok(monitors) = app.available_monitors() else {
        return;
    };

    if monitors.len() < 2 {
        return;
    }

    let monitor = &monitors[1];
    let position = monitor.position();
    let size = monitor.size();
    let window_size = window.outer_size().unwrap_or(fallback);

    let x = position.x + ((size.width as i32 - window_size.width as i32) / 2).max(0);
    let y = position.y + ((size.height as i32 - window_size.height as i32) / 2).max(0);

    let _ = window.set_position(PhysicalPosition::new(x, y));
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
async fn get_latest_discussions() -> Result<Vec<DiscussionItem>, String> {
    let client = reqwest::Client::builder()
        .user_agent("WarThunderDesktop/0.1 (+https://warthunder.tr)")
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
fn open_url(app: AppHandle, url: String) -> Result<(), String> {
    log(&format!("open_url:{url}"));

    let parsed = tauri::Url::parse(&url).map_err(|error| error.to_string())?;

    if parsed.host_str() != Some("warthunder.tr") {
        return Err("unsupported url".to_string());
    }

    show_main(&app, parsed.as_str())
}

#[tauri::command]
fn open_section(app: AppHandle, section: String) -> Result<(), String> {
    log(&format!("open_section:{section}"));

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
) -> Result<(), String> {
    log(&format!("open_auth:{mode}"));
    let mode = if mode == "register" { "register" } else { "login" };

    if let Ok(mut pending) = state.pending_auth.lock() {
        *pending = Some(PendingAuth {
            mode: mode.to_string(),
            identification,
            password,
            username,
            email,
        });
    }

    show_main(&app, FORUM_URL)
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
    settings: DesktopSettings,
) -> Result<(), String> {
    if !matches!(settings.ptt_key.as_str(), "alt" | "v" | "f") {
        return Err("unsupported push-to-talk key".to_string());
    }

    if let Ok(mut value) = state.0.lock() {
        *value = settings.clone();
    }

    persist_settings(&app, &settings);
    Ok(())
}

#[tauri::command]
fn open_microphone_settings() -> Result<(), String> {
    std::process::Command::new("cmd")
        .args(["/C", "start", "", "ms-settings:privacy-microphone"])
        .spawn()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let home = MenuItem::with_id(app, "home", "Ana Sayfa", true, None::<&str>)?;
    let forum = MenuItem::with_id(app, "forum", "Forum", true, None::<&str>)?;
    let blog = MenuItem::with_id(app, "blog", "Blog", true, None::<&str>)?;
    let social = MenuItem::with_id(app, "social", "Sosyal", true, None::<&str>)?;
    let monitor2 = MenuItem::with_id(app, "monitor2", "2. Monitöre Taşı", true, None::<&str>)?;
    let reload = MenuItem::with_id(app, "reload", "Yenile", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Çıkış", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;

    let menu = Menu::with_items(
        app,
        &[&home, &forum, &blog, &social, &separator, &monitor2, &reload, &quit],
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
            "home" => show_dashboard(app),
            "forum" => {
                let _ = show_main(app, FORUM_URL);
            }
            "blog" => {
                let _ = show_main(app, BLOG_URL);
            }
            "social" => {
                let _ = show_main(app, SOCIAL_URL);
            }
            "monitor2" => {
                if let Some(dashboard) = app.get_webview_window("dashboard") {
                    place_on_second_monitor(app, &dashboard, PhysicalSize::new(1120, 780));
                }
                if let Some(main) = app.get_webview_window("main") {
                    place_on_second_monitor(app, &main, PhysicalSize::new(1280, 860));
                }
            }
            "reload" => {
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
                show_dashboard(tray.app_handle());
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
    let settings = Arc::new(Mutex::new(DesktopSettings::default()));

    let pending_for_setup = pending_auth.clone();
    let settings_for_setup = settings.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(main) = app.get_webview_window("main") {
                if main.is_visible().unwrap_or(false) {
                    let _ = main.show();
                    let _ = main.set_focus();
                    return;
                }
            }

            show_dashboard(app);
        }))
        .manage(AppState {
            pending_auth: pending_auth.clone(),
        })
        .manage(SettingsState(settings.clone()))
        .invoke_handler(tauri::generate_handler![
            open_section,
            open_auth,
            open_url,
            get_latest_discussions,
            get_settings,
            save_settings,
            open_microphone_settings
        ])
        .setup(move |app| {
            log("setup:start");

            let loaded_settings = load_settings(app.handle());
            if let Ok(mut value) = settings_for_setup.lock() {
                *value = loaded_settings.clone();
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

            if loaded_settings.start_on_second_monitor {
                place_on_second_monitor(app.handle(), &dashboard, PhysicalSize::new(1120, 780));
            }
            log("setup:dashboard-built");

            let main = WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::External(
                    tauri::Url::parse(FORUM_URL).expect("valid forum URL"),
                ),
            )
            .title("War Thunder Türkiye")
            .inner_size(1280.0, 860.0)
            .min_inner_size(980.0, 640.0)
            .center()
            .visible(false)
            .on_page_load(move |webview, payload| {
                if payload.event() != PageLoadEvent::Finished {
                    return;
                }

                if payload.url().host_str() != Some("warthunder.tr") {
                    return;
                }

                let auth = pending_for_setup
                    .lock()
                    .ok()
                    .and_then(|mut pending| pending.take());

                if let Some(auth) = auth {
                    let _ = webview.eval(auth_script(&auth));
                }
            })
            .build()?;

            if loaded_settings.start_on_second_monitor {
                place_on_second_monitor(app.handle(), &main, PhysicalSize::new(1280, 860));
            }
            log("setup:main-built");

            build_tray(app.handle())?;
            log("setup:tray-built");

            start_ptt_listener(app.handle().clone(), settings_for_setup.clone());
            log("setup:ptt-started");

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

                if window.label() == "main" {
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
