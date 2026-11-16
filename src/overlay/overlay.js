'use strict';

(() => {
  const api = window.wttrOverlay || {
    ready: () => {},
    resize: () => {},
    action: () => {},
    setCollapsed: () => {},
    onState: () => {},
    onSettings: () => {},
    onPtt: () => {},
  };

  const card = document.getElementById('overlay-card');
  const roomDot = document.getElementById('room-dot');
  const roomName = document.getElementById('room-name');
  const roomMeta = document.getElementById('room-meta');
  const collapsedLive = document.getElementById('collapsed-live');
  const participantsRoot = document.getElementById('participants');
  const empty = document.getElementById('empty');
  const pttPill = document.getElementById('ptt-pill');
  const pttLabel = document.getElementById('ptt-label');
  const collapseButton = document.getElementById('overlay-collapse');
  const hideButton = document.getElementById('overlay-hide');
  const micButton = document.getElementById('mic');
  const deafenButton = document.getElementById('deafen');
  const openButton = document.getElementById('open');
  const leaveButton = document.getElementById('leave');

  let state = {
    connected: false,
    connecting: false,
    connectionState: 'disconnected',
    microphone: false,
    deafened: false,
    pttActive: false,
    latencyMs: null,
    room: null,
    participants: [],
  };
  let settings = {
    pttKeyLabel: 'Alt',
    pttEnabled: true,
    overlayCollapsed: false,
  };
  let ptt = { active: false, label: 'Alt' };
  let collapsed = false;
  let resizeFrame = null;

  const isConnected = () => Boolean(state.connected);
  const isConnecting = () => Boolean(state.connecting) || state.connectionState === 'reconnecting';
  const hasLivePtt = () => Boolean(ptt.active || state.pttActive);
  const pttEnabled = () => settings.pttEnabled !== false;

  const setText = (node, value) => {
    if (node) node.textContent = value;
  };

  const initialFor = (name) => (String(name || 'W').trim().charAt(0).toUpperCase() || 'W');

  const renderParticipants = () => {
    if (!participantsRoot) return;

    participantsRoot.textContent = '';
    const participants = Array.isArray(state.participants) ? state.participants : [];
    const showMore = participants.length > 6;
    const visible = participants.slice(0, showMore ? 5 : 6);

    if (visible.length === 0) {
      empty.hidden = false;
      empty.textContent = isConnecting()
        ? 'Sesli odaya bağlanılıyor…'
        : 'Sesli odada henüz katılımcı yok.';
      return;
    }

    empty.hidden = true;

    for (const participant of visible) {
      const item = document.createElement('div');
      item.className = 'participant';
      item.classList.toggle('is-speaking', Boolean(participant.speaking));

      const avatar = document.createElement('span');
      avatar.className = 'participant-avatar';

      const initial = document.createElement('span');
      initial.textContent = initialFor(participant.name);

      if (participant.avatarUrl) {
        const image = document.createElement('img');
        image.alt = '';
        image.src = participant.avatarUrl;
        image.onerror = () => {
          image.remove();
          initial.hidden = false;
        };
        avatar.appendChild(initial);
        avatar.appendChild(image);
        initial.hidden = true;
      } else {
        avatar.appendChild(initial);
      }

      const copy = document.createElement('span');
      copy.className = 'participant-copy';

      const name = document.createElement('strong');
      name.className = 'participant-name';
      name.textContent = participant.name || participant.username || 'Kullanıcı';

      const status = document.createElement('span');
      status.className = 'participant-state';
      status.classList.toggle('is-local', Boolean(participant.local));

      if (participant.local) {
        status.textContent = 'Sen';
      } else if (participant.muted) {
        status.textContent = 'Sessiz';
      } else if (participant.speaking) {
        status.textContent = 'Konuşuyor';
      } else {
        status.textContent = 'Bağlı';
      }

      copy.appendChild(name);
      copy.appendChild(status);
      item.appendChild(avatar);
      item.appendChild(copy);
      participantsRoot.appendChild(item);
    }

    if (showMore) {
      const more = document.createElement('div');
      more.className = 'participant-more';
      more.textContent = `+${participants.length - 5} kişi`;
      participantsRoot.appendChild(more);
    }
  };

  const renderPtt = () => {
    const enabled = pttEnabled();
    const active = enabled && hasLivePtt();
    const label = settings.pttKeyLabel || ptt.label || 'Alt';

    pttPill?.classList.toggle('is-active', active);
    pttPill?.classList.toggle('is-disabled', !enabled);
    collapsedLive?.classList.toggle('is-live', active);

    if (!enabled) {
      setText(pttLabel, 'PTT kapalı');
    } else if (active) {
      setText(pttLabel, 'CANLI');
    } else {
      setText(pttLabel, `PTT: ${label}`);
    }
  };

  const render = () => {
    const room = state.room || {};
    const name = room.name || (isConnecting() ? 'Sesli Odaya Bağlanılıyor…' : 'Sesli Oda');

    setText(roomName, name);

    if (isConnecting() && !isConnected()) {
      setText(roomMeta, 'Bağlanıyor…');
    } else if (isConnected()) {
      const count = Array.isArray(state.participants) ? state.participants.length : 0;
      const latency =
        Number.isFinite(Number(state.latencyMs)) && Number(state.latencyMs) > 0
          ? ` · ${Math.round(Number(state.latencyMs))} ms`
          : '';
      setText(roomMeta, `${count} kişi${latency}`);
    } else {
      setText(roomMeta, 'Bağlantı yok');
    }

    roomDot?.classList.toggle('is-connected', isConnected());
    roomDot?.classList.toggle('is-connecting', isConnecting() && !isConnected());

    card?.classList.toggle('is-collapsed', collapsed);
    if (collapseButton) {
      collapseButton.title = collapsed ? 'Genişlet' : 'Daralt';
    }

    micButton?.classList.toggle('is-active', Boolean(state.microphone));
    micButton?.classList.toggle(
      'is-muted',
      isConnected() && !state.microphone
    );
    micButton?.setAttribute(
      'title',
      state.microphone ? 'Mikrofonu kapat' : 'Mikrofonu aç'
    );
    deafenButton?.classList.toggle('is-active', Boolean(state.deafened));
    deafenButton?.setAttribute(
      'title',
      state.deafened ? 'Sağırlaştırmayı kapat' : 'Sağırlaştır'
    );

    micButton.disabled = !isConnected();
    deafenButton.disabled = !isConnected();
    leaveButton.disabled = !isConnected();

    renderParticipants();
    renderPtt();
    scheduleResize();
  };

  const scheduleResize = () => {
    if (resizeFrame) cancelAnimationFrame(resizeFrame);

    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = null;

      if (!card) return;

      const rect = card.getBoundingClientRect();
      const width = Math.ceil(rect.width);
      const height = Math.ceil(rect.height);

      if (width > 0 && height > 0) {
        api.resize({ width, height });
      }
    });
  };

  micButton?.addEventListener('click', () => api.action('toggle-mic'));
  deafenButton?.addEventListener('click', () => api.action('toggle-deafen'));
  leaveButton?.addEventListener('click', () => api.action('leave'));
  openButton?.addEventListener('click', () => {
    api.action(isConnected() && state.room?.url ? 'open-room' : 'show-main');
  });

  hideButton?.addEventListener('click', () => api.action('hide-overlay'));

  collapseButton?.addEventListener('click', () => {
    collapsed = !collapsed;
    card?.classList.toggle('is-collapsed', collapsed);
    api.setCollapsed(collapsed);
    render();
  });

  document.addEventListener('contextmenu', (event) => event.preventDefault());

  api.onState((next) => {
    if (next && typeof next === 'object') {
      state = next;
      render();
    }
  });

  api.onSettings((next) => {
    if (!next || typeof next !== 'object') return;

    settings = { ...settings, ...next };

    if (typeof next.overlayCollapsed === 'boolean') {
      collapsed = next.overlayCollapsed;
    }

    render();
  });

  api.onPtt((next) => {
    if (!next || typeof next !== 'object') return;
    ptt = { ...ptt, ...next };
    render();
  });

  render();
  api.ready();
})();
