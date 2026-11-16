'use strict';

(() => {
  if (location.hostname !== 'warthunder.tr') return;

  if (window.__wttrSiteInstalled) {
    try {
      window.__wttrDockMount?.();
    } catch {
      // The dock will retry on its own.
    }
    return;
  }

  window.__wttrSiteInstalled = true;

  const state = {
    sitePttKey: 'AltLeft',
    lastSession: '',
    notificationsStarted: false,
    notificationsPending: false,
  };

  const getApp = () => window.app || null;

  const safeCall = (callback, fallback = null) => {
    try {
      return callback();
    } catch {
      return fallback;
    }
  };

  const keyForCode = (code) => {
    if (code === 'AltLeft' || code === 'AltRight') return 'Alt';
    if (code === 'ControlLeft' || code === 'ControlRight') return 'Control';
    if (code === 'ShiftLeft' || code === 'ShiftRight') return 'Shift';
    if (code === 'MetaLeft' || code === 'MetaRight') return 'Meta';
    if (code === 'Space') return ' ';
    if (code.startsWith('Key')) return code.slice(3).toLowerCase();
    if (code.startsWith('Digit')) return code.slice(5);
    if (code.startsWith('Numpad')) return code.slice(6);
    return code;
  };

  const userId = () =>
    safeCall(() => {
      const user = getApp()?.session?.user;
      return user?.id ? user.id() : null;
    });

  const userPayload = () => {
    const user = safeCall(() => getApp()?.session?.user, null);
    if (!user) return null;

    return {
      id: safeCall(() => user.id?.(), null),
      username: safeCall(() => user.username?.(), null),
      displayName: safeCall(() => user.displayName?.(), null),
      avatarUrl: safeCall(() => user.avatarUrl?.(), null),
      isAdmin: safeCall(() => user.isAdmin?.(), false),
    };
  };

  const unreadCount = () =>
    safeCall(() => getApp()?.session?.user?.unreadNotificationCount?.() ?? 0, 0);

  const reportSession = () => {
    const api = window.wttrDesktop;
    if (!api || typeof api.reportSession !== 'function') return;

    const app = getApp();
    const user = userPayload();

    const payload = {
      authenticated: Boolean(app?.session?.user),
      user,
      unreadNotifications: unreadCount(),
      path: location.pathname,
      url: location.href,
      title: document.title,
    };

    const encoded = JSON.stringify(payload);
    if (encoded === state.lastSession) return;
    state.lastSession = encoded;

    try {
      api.reportSession(payload);
    } catch {
      // The bridge is optional.
    }
  };

  const openAuth = (mode = 'login') => {
    const app = getApp();
    if (!app) return false;

    if (safeCall(() => Boolean(app.session?.user), false)) return true;

    const register = mode === 'register';
    const moduleName = register
      ? 'flarum/forum/components/SignUpModal'
      : 'flarum/forum/components/LogInModal';

    try {
      if (window.flarum?.reg?.asyncModuleImport) {
        app.modal.show(() => window.flarum.reg.asyncModuleImport(moduleName));
        return true;
      }
    } catch {
      // Try the registry and the DOM fallback below.
    }

    try {
      const component = window.flarum?.reg?.get?.('core', moduleName.replace('flarum/', ''));
      if (component) {
        app.modal.show(component);
        return true;
      }
    } catch {
      // Fall through.
    }

    const labels = register ? ['KAYIT OL', 'KAYIT'] : ['GİRİŞ YAP', 'GİRİŞ'];
    const target = [...document.querySelectorAll('a, button')].find((element) =>
      labels.includes((element.textContent || '').trim().toUpperCase())
    );

    if (target) {
      target.click();
      return true;
    }

    return false;
  };

  window.__wttrDesktopOpenAuth = openAuth;

  const AUTH_BACKGROUND = window.__wttrAuthBackground || '';

  const authStyle = () => `
    html.wttr-auth-mode,
    body.wttr-auth-mode {
      overflow: hidden !important;
    }

    html.wttr-auth-mode *::-webkit-scrollbar {
      width: 0 !important;
      height: 0 !important;
    }

    #wttr-auth-shell {
      position: fixed;
      inset: 0;
      z-index: 9990;
      overflow: hidden;
      pointer-events: none;
      background: #070c0f;
    }

    #wttr-auth-bg {
      position: absolute;
      inset: -8%;
      background-image: ${
        AUTH_BACKGROUND
          ? `url("${AUTH_BACKGROUND}")`
          : 'linear-gradient(160deg, #070c0f, #0d171c 58%, #070c0f)'
      };
      background-position: center;
      background-size: cover;
      filter: saturate(.92) brightness(.72);
      animation: wttr-auth-drift 28s ease-in-out infinite alternate;
    }

    #wttr-auth-shell::after {
      content: "";
      position: absolute;
      inset: 0;
      background:
        linear-gradient(180deg, rgba(7,11,14,.12) 0%, rgba(7,11,14,.36) 45%, rgba(7,11,14,.95) 100%),
        linear-gradient(90deg, rgba(7,11,14,.82) 0%, rgba(7,11,14,.32) 56%, rgba(7,11,14,.58) 100%),
        radial-gradient(760px 520px at 18% 82%, rgba(192,57,43,.28), transparent 70%);
    }

    #wttr-auth-glow {
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
      animation: wttr-auth-pulse 9s ease-in-out infinite;
    }

    #wttr-auth-hero {
      position: fixed;
      left: clamp(28px, 7vw, 108px);
      bottom: clamp(38px, 9vh, 104px);
      z-index: 9992;
      width: min(560px, 46vw);
      pointer-events: none;
      color: #eef4f6;
    }

    .wttr-auth-logo {
      width: 96px;
      height: 96px;
      display: block;
      margin-bottom: 20px;
      opacity: .98;
      filter: drop-shadow(0 18px 36px rgba(0,0,0,.55));
    }

    .wttr-auth-eyebrow {
      margin: 0 0 12px;
      color: #d8b56a;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: .2em;
    }

    .wttr-auth-title {
      margin: 0;
      max-width: 540px;
      font-size: clamp(38px, 5vw, 70px);
      line-height: .98;
      letter-spacing: -.045em;
      text-wrap: balance;
      text-shadow: 0 18px 50px rgba(0,0,0,.4);
    }

    .wttr-auth-lead {
      margin: 18px 0 0;
      max-width: 510px;
      color: #b6c5cb;
      font-size: 14px;
      line-height: 1.6;
    }

    .wttr-auth-meta {
      margin: 20px 0 0;
      color: #8fa2aa;
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: .12em;
    }

    .wttr-auth-meta span {
      color: #d8b56a;
      margin: 0 7px;
    }

    #wttr-auth-loading {
      position: fixed;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      z-index: 9993;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      color: #93a6ae;
      font-size: 11px;
      pointer-events: none;
    }

    #wttr-auth-loading span {
      width: 26px;
      height: 26px;
      border: 2px solid rgba(255,255,255,.12);
      border-top-color: #c0392b;
      border-radius: 50%;
      animation: wttr-auth-spin 1s linear infinite;
    }

    body.wttr-auth-mode .ModalManager {
      z-index: 9999 !important;
      background: transparent !important;
      backdrop-filter: none !important;
      display: flex !important;
      align-items: center !important;
      justify-content: flex-end !important;
      padding: 24px clamp(24px, 8vw, 120px) !important;
    }

    body.wttr-auth-mode .ModalManager > .Modal {
      width: auto !important;
      max-width: 432px !important;
      margin: 0 !important;
      flex: 0 0 auto !important;
    }

    body.wttr-auth-mode .Modal-content {
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
      animation: wttr-auth-modal-in .55s cubic-bezier(.2,.8,.2,1) both;
    }

    body.wttr-auth-mode .Modal-content .Modal-header {
      border: 0 !important;
      padding: 0 0 6px !important;
    }

    body.wttr-auth-mode .Modal-content .Modal-header h3 {
      font-size: 24px !important;
      letter-spacing: -.025em;
    }

    body.wttr-auth-mode .Modal-content .Modal-body {
      padding: 0 !important;
    }

    body.wttr-auth-mode .Modal-content .Modal-footer {
      border: 0 !important;
      padding: 14px 0 0 !important;
    }

    body.wttr-auth-mode .Modal-content .FormControl {
      background: #0b151a !important;
      border: 1px solid rgba(255,255,255,.11) !important;
      color: #eef4f6 !important;
      border-radius: 11px !important;
    }

    body.wttr-auth-mode .Modal-content .FormControl:focus {
      border-color: rgba(224,90,79,.65) !important;
      box-shadow: 0 0 0 3px rgba(192,57,43,.16) !important;
    }

    body.wttr-auth-mode .Modal-content .Button--primary {
      background: linear-gradient(135deg, #c0392b, #8f241b) !important;
      border: 0 !important;
      border-radius: 11px !important;
      box-shadow: 0 12px 28px rgba(192,57,43,.28) !important;
    }

    body.wttr-auth-mode .Modal-content .Modal-close {
      display: none !important;
    }

    body.wttr-auth-mode #cc-main,
    body.wttr-auth-mode .cc-window,
    body.wttr-auth-mode .cc-revoke {
      display: none !important;
    }

    body.wttr-auth-mode .Modal-content .wttr-auth-hint {
      margin: 0 0 14px;
      color: #93a6ae;
      font-size: 11px;
      line-height: 1.45;
      text-align: center;
    }

    body.wttr-auth-mode .Modal-content .wttr-auth-retry {
      border: 0;
      padding: 0;
      background: transparent;
      color: #d8b56a;
      font: inherit;
      font-weight: 800;
      text-decoration: underline;
      text-underline-offset: 2px;
      cursor: pointer;
    }

    @media (max-width: 980px) {
      #wttr-auth-hero,
      #wttr-auth-glow {
        display: none;
      }

      body.wttr-auth-mode .ModalManager {
        justify-content: center !important;
        padding: 20px !important;
      }
    }

    @keyframes wttr-auth-drift {
      0% { transform: scale(1.03) translate3d(-1%, 0, 0); }
      100% { transform: scale(1.13) translate3d(1.6%, -1.2%, 0); }
    }

    @keyframes wttr-auth-pulse {
      0%, 100% { opacity: .32; transform: scale(1); }
      50% { opacity: .55; transform: scale(1.08); }
    }

    @keyframes wttr-auth-modal-in {
      from { opacity: 0; transform: translateY(18px) scale(.985); }
      to { opacity: 1; transform: none; }
    }

    @keyframes wttr-auth-spin {
      to { transform: rotate(360deg); }
    }
  `;

  let authShell = null;

  const mountAuthShell = () => {
    if (location.pathname.startsWith('/admin')) return;
    if (authShell && document.documentElement.contains(authShell)) return;
    if (!document.body) return;

    const styleId = 'wttr-auth-style';

    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = authStyle();
      document.head.appendChild(style);
    }

    document.documentElement.classList.add('wttr-auth-mode');
    document.body.classList.add('wttr-auth-mode');

    const shell = document.createElement('div');
    shell.id = 'wttr-auth-shell';
    shell.innerHTML = `
      <div id="wttr-auth-bg"></div>
      <div id="wttr-auth-glow"></div>
      <div id="wttr-auth-hero">
        <img class="wttr-auth-logo" src="https://warthunder.tr/assets/pwa-icon-512x512-s8vyxeai.png" alt="War Thunder Türkiye" />
        <p class="wttr-auth-eyebrow">WAR THUNDER TÜRKİYE</p>
        <h1 class="wttr-auth-title">Topluluğa katıl.</h1>
        <p class="wttr-auth-lead">
          Forum, sosyal akış ve sesli odalar tek uygulamada. Flarum hesabınla
          giriş yap, topluluğa kaldığın yerden devam et.
        </p>
        <p class="wttr-auth-meta">FORUM <span>·</span> SOSYAL <span>·</span> SESLİ ODALAR</p>
      </div>
      <div id="wttr-auth-loading"><span></span><small>Oturum kontrol ediliyor…</small></div>
    `;

    document.body.appendChild(shell);
    authShell = shell;
  };

  const unmountAuthShell = () => {
    document.documentElement.classList.remove('wttr-auth-mode');
    document.body?.classList.remove('wttr-auth-mode');
    document.getElementById('wttr-auth-shell')?.remove();
    document.getElementById('wttr-auth-style')?.remove();
    authShell = null;

    const modal = document.querySelector('.Modal-content');
    if (modal && modal.querySelector('input[name="identification"]')) {
      try {
        getApp()?.modal?.close?.();
      } catch {
        // Ignore.
      }
    }
  };

  const decorateAuthModal = () => {
    const modal = document.querySelector('.Modal-content');
    if (!modal) return false;

    const body = modal.querySelector('.Modal-body');
    if (body && !body.querySelector('.wttr-auth-hint')) {
      const hint = document.createElement('p');
      hint.className = 'wttr-auth-hint';
      hint.append('Beni hatırla işaretliyse uygulama yeniden açıldığında giriş istemez. ');

      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'wttr-auth-retry';
      retry.textContent = 'Doğrulamayı yenile';
      retry.addEventListener('click', () => {
        try {
          location.reload();
        } catch {
          // Ignore.
        }
      });

      hint.appendChild(retry);
      body.insertBefore(hint, body.firstChild);
    }

    const remember =
      modal.querySelector('input[name="remember"]') ||
      modal.querySelector('input[type="checkbox"]');

    if (remember && !remember.checked) {
      remember.click();

      if (!remember.checked) {
        remember.checked = true;
        remember.dispatchEvent(new Event('input', { bubbles: true }));
        remember.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    return true;
  };

  const openLoginModal = () => {
    if (location.pathname.startsWith('/admin')) return false;

    const modal = document.querySelector('.Modal-content');

    if (!modal) {
      return openAuth('login');
    }

    if (modal.querySelector('input[type="password"]')) {
      decorateAuthModal();
      return true;
    }

    // Keep intentional forms (forgot password, sign up, OAuth prompts) open.
    if (modal.querySelector('input, textarea, select')) {
      return true;
    }

    // A guest/empty prompt is not useful on the desktop login screen.
    try {
      getApp()?.modal?.close?.();
    } catch {
      // Ignore.
    }

    setTimeout(() => openAuth('login'), 120);
    return true;
  };

  const syncAuthState = () => {
    if (location.pathname.startsWith('/admin')) {
      unmountAuthShell();
      window.__wttrSetDockVisible?.(true);
      return;
    }

    const app = getApp();
    const authenticated = Boolean(app?.session?.user);

    if (authenticated) {
      unmountAuthShell();
      window.__wttrSetDockVisible?.(true);
      return;
    }

    mountAuthShell();
    window.__wttrSetDockVisible?.(false);

    if (!app) return;

    document.getElementById('wttr-auth-loading')?.remove();
    openLoginModal();
    decorateAuthModal();
  };

  window.__wttrAuthSync = syncAuthState;

  const refreshSitePttKey = async () => {
    try {
      if (window.WTTRDesktop?.getVoiceSettings) {
        const settings = await window.WTTRDesktop.getVoiceSettings();
        if (settings?.pttKey) {
          state.sitePttKey = settings.pttKey;
          window.__wttrSitePttKey = state.sitePttKey;
        }
        return;
      }

      if (!getApp()?.session?.user) return;

      const apiUrl = getApp()?.forum?.attribute?.('apiUrl') || '/api';
      const response = await fetch(`${String(apiUrl).replace(/\/$/, '')}/social/bootstrap`, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) return;

      const payload = await response.json();
      const settings = payload?.user?.voiceSettings || {};
      const config = payload?.config?.voice || {};
      state.sitePttKey = settings.pttKey || config.pttKey || 'AltLeft';
      window.__wttrSitePttKey = state.sitePttKey;
    } catch {
      // Keep the previous key.
    }
  };

  const syncVoiceSettings = async (settings) => {
    const app = getApp();

    if (!app?.session?.user) return { ok: false, reason: 'guest' };

    const pttKey = settings?.pttKey || 'AltLeft';
    const pushToTalk =
      typeof settings?.pushToTalk === 'boolean' ? settings.pushToTalk : settings?.pttEnabled;

    const body = {
      voice_settings: {
        pttKey,
      },
    };

    if (typeof pushToTalk === 'boolean') {
      body.voice_settings.pushToTalk = pushToTalk;
    }

    const apiUrl = String(app.forum?.attribute?.('apiUrl') || '/api').replace(/\/$/, '');
    const csrfToken = app.session?.csrfToken || '';

    try {
      const response = await fetch(`${apiUrl}/social/me/profile`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        return { ok: false, status: response.status };
      }

      const payload = await response.json().catch(() => null);
      const voice = payload?.data?.voiceSettings;
      const nextKey = voice?.pttKey || pttKey;

      state.sitePttKey = nextKey;
      window.__wttrSitePttKey = nextKey;

      try {
        window.WTTRDesktop?.applyVoiceSettings?.({
          pttKey: nextKey,
          ...(typeof pushToTalk === 'boolean' ? { pushToTalk } : {}),
        });
      } catch {
        // The bridge is optional.
      }

      try {
        const socialStateModule = window.flarum?.reg?.get?.(
          'cengizkemec-social',
          'forum/SocialState'
        );
        const socialState =
          socialStateModule?.A || socialStateModule?.default || socialStateModule;

        if (socialState?.data?.user) {
          socialState.data.user.voiceSettings = {
            ...(socialState.data.user.voiceSettings || {}),
            pttKey: nextKey,
            ...(typeof pushToTalk === 'boolean' ? { pushToTalk } : {}),
          };
        }

        const voiceModule = window.flarum?.reg?.get?.(
          'cengizkemec-social',
          'forum/voiceSession'
        );
        const voice = voiceModule?.A || voiceModule?.default || voiceModule;

        if (typeof voice?.applyUserPreferences === 'function') {
          voice.applyUserPreferences();
        }
      } catch {
        // The live Social state is best-effort.
      }

      return { ok: true, settings: { pttKey: nextKey, pushToTalk } };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  };

  window.__wttrDesktopSyncVoiceSettings = syncVoiceSettings;

  const getVoiceSession = () => {
    try {
      const module = window.flarum?.reg?.get?.(
        'cengizkemec-social',
        'forum/voiceSession'
      );

      return module?.A || module?.default || module || null;
    } catch {
      return null;
    }
  };

  let lastVoiceSnapshot = '';

  const reportVoiceState = () => {
    if (window.__wttrVoicePaused) return;

    const api = window.wttrDesktop;
    if (!api || typeof api.reportVoiceState !== 'function') return;

    const session = getVoiceSession();
    let payload;

    if (!session) {
      payload = {
        connected: false,
        connecting: false,
        connectionState: 'disconnected',
        microphone: false,
        deafened: false,
        pttActive: false,
        screenSharing: false,
        latencyMs: null,
        room: null,
        participants: [],
      };
    } else {
      const roomInfo = session.roomInfo || {};
      const room =
        session.connected || session.connecting
          ? {
              id: roomInfo.id ?? null,
              name: roomInfo.name || roomInfo.title || roomInfo.slug || 'Sesli Oda',
              slug: roomInfo.slug || null,
              url: roomInfo.slug
                ? `/social/rooms/${roomInfo.slug}?voice=1`
                : roomInfo.id
                  ? `/social/rooms/${roomInfo.id}?voice=1`
                  : null,
            }
          : null;

      const participants = Array.isArray(session.participants)
        ? session.participants.slice(0, 12).map((participant) => ({
            identity: String(participant?.identity || ''),
            name: String(
              participant?.name || participant?.username || 'Kullanıcı'
            ),
            username: participant?.username || null,
            avatarUrl: participant?.avatarUrl || null,
            local: Boolean(participant?.local),
            speaking: Boolean(participant?.speaking),
            muted: Boolean(participant?.muted),
            connectionQuality: participant?.connectionQuality || null,
          }))
        : [];

      payload = {
        connected: Boolean(session.connected),
        connecting: Boolean(session.connecting),
        connectionState: session.connectionState || 'disconnected',
        microphone: Boolean(session.microphone),
        deafened: Boolean(session.deafened),
        pttActive: Boolean(session.pttActive),
        screenSharing: Boolean(session.screenSharing),
        latencyMs: Number.isFinite(Number(session.latencyMs))
          ? Number(session.latencyMs)
          : null,
        room,
        participants,
      };
    }

    const encoded = JSON.stringify(payload);
    if (encoded === lastVoiceSnapshot) return;
    lastVoiceSnapshot = encoded;

    try {
      api.reportVoiceState(payload);
    } catch {
      // The overlay is optional.
    }
  };

  window.__wttrDesktopVoiceAction = async (action) => {
    const session = getVoiceSession();
    if (!session) return false;

    if (action === 'toggle-mic') {
      await session.toggleMic?.();
      return true;
    }

    if (action === 'toggle-deafen') {
      session.toggleDeafen?.();
      return true;
    }

    if (action === 'leave') {
      await session.disconnect?.();
      return true;
    }

    return false;
  };

  const dispatchPtt = (payload) => {
    const active = Boolean(payload?.active);
    const appKey = payload?.code || 'AltLeft';
    const appKeyValue = payload?.key || keyForCode(appKey);

    const activeElement = document.activeElement;
    const typing =
      activeElement &&
      (['INPUT', 'TEXTAREA', 'SELECT'].includes(activeElement.tagName) ||
        activeElement.isContentEditable);

    if (typing) return false;

    const codes = new Set([appKey, state.sitePttKey].filter(Boolean));
    const type = active ? 'keydown' : 'keyup';

    for (const code of codes) {
      const key = code === appKey ? appKeyValue : keyForCode(code);

      try {
        window.dispatchEvent(
          new KeyboardEvent(type, {
            code,
            key,
            bubbles: true,
            cancelable: true,
          })
        );
      } catch {
        // Synthetic events are best-effort.
      }
    }

    try {
      window.dispatchEvent(
        new CustomEvent('wttr-desktop-ptt', {
          detail: { active, code: appKey },
        })
      );
    } catch {
      // Ignore.
    }

    return true;
  };

  window.__wttrDesktopPtt = dispatchPtt;

  const normalizeFlarumNotification = (item) => {
    const attributes = item?.attributes || {};
    const relationships = item?.relationships || {};
    const subject = relationships.subject?.data;

    return {
      id: String(item?.id || ''),
      type: attributes.contentType || 'notification',
      label: attributes.contentType === 'postLiked'
        ? 'Gönderin beğenildi'
        : attributes.contentType === 'postMentioned'
          ? 'Bir gönderide senden bahsedildi'
          : attributes.contentType === 'userMentioned'
            ? 'Senden bahsedildi'
            : attributes.contentType === 'newPost'
              ? 'Takip ettiğin konuya yeni yanıt'
              : 'Yeni bildirim',
      isRead: Boolean(attributes.isRead),
      createdAt: attributes.createdAt || null,
      fromUser: null,
      subjectType: subject?.type || null,
      subjectId: subject?.id || null,
      url: '/notifications',
    };
  };

  const pollNotifications = async () => {
    if (!getApp()?.session?.user || state.notificationsPending) return;

    state.notificationsPending = true;

    try {
      let items = null;
      let unread = unreadCount();

      try {
        const response = await fetch('/api/desktop/notifications?limit=8', {
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        });

        if (response.ok) {
          const payload = await response.json();
          const data = payload?.data || {};
          items = Array.isArray(data.notifications) ? data.notifications : [];
          unread = Number.isFinite(Number(data.unreadCount))
            ? Number(data.unreadCount)
            : unread;
        }
      } catch {
        // Fall back to the standard Flarum API.
      }

      if (!items) {
        const response = await fetch('/api/notifications?page[limit]=8&sort=-createdAt', {
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        });

        if (response.ok) {
          const payload = await response.json();
          items = (payload?.data || []).map(normalizeFlarumNotification);
        }
      }

      if (Array.isArray(items) && items.length > 0) {
        window.wttrDesktop?.reportNotifications?.({
          items,
          unread,
          initial: !state.notificationsStarted,
        });
        state.notificationsStarted = true;
      }
    } catch {
      // Notifications are best-effort.
    } finally {
      state.notificationsPending = false;
    }
  };

  const start = () => {
    reportSession();
    refreshSitePttKey();
    syncAuthState();
    reportVoiceState();

    setInterval(reportSession, 2500);
    setInterval(refreshSitePttKey, 30000);
    setInterval(syncAuthState, 800);
    setInterval(reportVoiceState, 600);

    setTimeout(() => {
      pollNotifications();
      setInterval(pollNotifications, 20000);
    }, 6000);

    setTimeout(() => {
      try {
        window.__wttrDockMount?.();
      } catch {
        // The dock will retry.
      }
    }, 300);
  };

  const waitForApi = (attempt = 0) => {
    if (window.wttrDesktop) {
      start();
      return;
    }

    if (attempt > 200) return;
    setTimeout(() => waitForApi(attempt + 1), 100);
  };

  waitForApi();
})();
