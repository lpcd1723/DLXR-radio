/**
 * DLXR // IADT College Radio Player & Butterchurn WebGL Visualizer
 */
(function () {
  'use strict';

  // ─── STATE ─────────────────────────────────────────────────────────────
  let visualizer = null;
  let audioContext = null;
  let sourceNode = null;
  let isPlaying = false;
  let hasStarted = false;

  let presets = {};
  let presetKeys = [];
  let presetIndex = 0;
  let presetCycleTimer = null;
  let nowPlayingTimer = null;
  let currentSongId = '';
  let currentPlaybackId = '';
  let streamStartTime = null;

  let visEnabled = true;
  let currentSkin = localStorage.getItem('dlxr_skin') || 'DARK';
  let highestZ = 70;

  // ─── DOM ELEMENTS ──────────────────────────────────────────────────────
  const canvas = document.getElementById('visualizer-canvas');
  const audio = document.getElementById('radio-audio');
  
  const startupOverlay = document.getElementById('startup-overlay');
  const startupBtn = document.getElementById('startup-btn');

  const btnPlayPause = document.getElementById('btn-play-pause');
  const playSymbol = document.getElementById('play-symbol');
  const playText = document.getElementById('play-text');
  const artPlayButton = document.getElementById('art-play-button');
  const albumArtImg = document.getElementById('album-art-img');
  
  const trackTitleVal = document.getElementById('track-title-val');
  const trackArtistVal = document.getElementById('track-artist-val');
  const trackShowVal = document.getElementById('track-show-val');
  const trackStatusVal = document.getElementById('track-status-val');
  const playerStationTitle = document.getElementById('player-station-title');

  const btnToggleVis = document.getElementById('btn-toggle-vis');
  const btnToggleSkin = document.getElementById('btn-toggle-skin');
  const skinPanel = document.getElementById('skin-panel');
  const skinButtons = document.querySelectorAll('[data-set-skin]');

  const navButtons = document.querySelectorAll('.nav-btn');
  const overlayAbout = document.getElementById('overlay-about');
  const overlayShows = document.getElementById('overlay-shows');

  const winVideo = document.getElementById('win-video');
  const winChat = document.getElementById('win-chat');
  const winBug = document.getElementById('win-bug');
  const closeWinVideo = document.getElementById('close-win-video');
  const closeWinChat = document.getElementById('close-win-chat');
  const closeWinBug = document.getElementById('close-win-bug');
  const btnToggleBug = document.getElementById('btn-toggle-bug');
  const bugReportForm = document.getElementById('bug-report-form');
  const bugStatusMsg = document.getElementById('bug-status-msg');

  const volTrack = document.getElementById('vol-track');
  const volFill = document.getElementById('vol-fill');

  const progressBarTrack = document.getElementById('progress-bar-track');
  const progressBarFill = document.getElementById('progress-bar-fill');
  const progressBarThumb = document.getElementById('progress-bar-thumb');
  const timeElapsedEl = document.getElementById('time-elapsed');
  const timeTotalEl = document.getElementById('time-total');

  // ─── 1. THEMES & SKINS ──────────────────────────────────────────────────
  function applySkin(skin) {
    currentSkin = skin === 'LIGHT' ? 'LIGHT' : 'DARK';
    document.documentElement.setAttribute('data-skin', currentSkin);
    try {
      localStorage.setItem('dlxr_skin', currentSkin);
    } catch (e) {}

    skinButtons.forEach(btn => {
      btn.classList.toggle('is-active', btn.getAttribute('data-set-skin') === currentSkin);
    });
  }

  skinButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const s = btn.getAttribute('data-set-skin');
      applySkin(s);
      closeAllOverlays();
    });
  });

  if (btnToggleSkin && skinPanel) {
    btnToggleSkin.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = skinPanel.classList.contains('hidden');
      closeAllOverlays();
      if (willOpen) {
        skinPanel.classList.remove('hidden');
        btnToggleSkin.classList.add('is-active');
      }
    });
  }

  // ─── 2. VISUALIZER TOGGLE (SMOOTH TRANSITION) ───────────────────────────
  function setVisualizerState(enabled) {
    visEnabled = enabled;
    if (visEnabled) {
      document.body.classList.remove('vis-off');
      if (btnToggleVis) {
        btnToggleVis.textContent = 'VIS';
        btnToggleVis.classList.remove('is-active');
      }
    } else {
      document.body.classList.add('vis-off');
      if (btnToggleVis) {
        btnToggleVis.textContent = 'VIS·OFF';
        btnToggleVis.classList.add('is-active');
      }
    }
  }

  if (btnToggleVis) {
    btnToggleVis.addEventListener('click', (e) => {
      e.stopPropagation();
      setVisualizerState(!visEnabled);
    });
  }

  // ─── 3. BUTTERCHURN VISUALIZER PRESETS ──────────────────────────────────
  function getButterchurn() {
    return window.butterchurn?.default || window.butterchurn || null;
  }

  function getButterchurnPresets() {
    return window.butterchurnPresets?.default || window.butterchurnPresets || null;
  }

  function getButterchurnPresetsExtra() {
    return window.butterchurnPresetsExtra?.default || window.butterchurnPresetsExtra || null;
  }

  function getButterchurnExtraImages() {
    return window.butterchurnExtraImages?.default || window.butterchurnExtraImages || null;
  }

  function loadPresets() {
    try {
      const bcp = getButterchurnPresets();
      if (bcp && typeof bcp.getPresets === 'function') {
        Object.assign(presets, bcp.getPresets());
      }
      const bce = getButterchurnPresetsExtra();
      if (bce && typeof bce.getPresets === 'function') {
        Object.assign(presets, bce.getPresets());
      }
      presetKeys = Object.keys(presets);
      if (presetKeys.length > 0 && presetIndex === 0) {
        presetIndex = Math.floor(Math.random() * presetKeys.length);
      }
    } catch (err) {
      console.warn('Error loading Butterchurn presets:', err);
    }
  }

  function ensurePresets() {
    if (presetKeys.length === 0) {
      loadPresets();
    }
    return presetKeys.length > 0;
  }

  function loadPresetByIndex(idx, blendSec = 2.5) {
    ensurePresets();
    if (!visualizer || presetKeys.length === 0) return;
    presetIndex = (idx + presetKeys.length) % presetKeys.length;
    const presetKey = presetKeys[presetIndex];
    const preset = presets[presetKey];
    if (preset) {
      try {
        visualizer.loadPreset(preset, blendSec);
      } catch (err) {
        console.warn('Preset load failed:', presetKey, err);
      }
    }
  }

  function nextPreset(blendSec = 2.5) {
    ensurePresets();
    if (presetKeys.length === 0) return;
    const jump = Math.floor(Math.random() * (presetKeys.length - 1)) + 1;
    loadPresetByIndex(presetIndex + jump, blendSec);
  }

  function startPresetCycle() {
    if (presetCycleTimer) clearInterval(presetCycleTimer);
    presetCycleTimer = setInterval(() => {
      if (isPlaying && visEnabled) {
        nextPreset(3.0);
      }
    }, 18000);
  }

  function resizeVisualizer() {
    if (!canvas) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
    if (visualizer) {
      try {
        visualizer.setRendererSize(width, height);
      } catch (e) {
        console.warn('Canvas resize error:', e);
      }
    }
  }

  // ─── 4. AUDIO & WEB AUDIO ENGINE ────────────────────────────────────────
  async function initAudioEngine() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!audioContext) {
      audioContext = new AudioCtx();
    }
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    if (!sourceNode && audio) {
      try {
        sourceNode = audioContext.createMediaElementSource(audio);
        sourceNode.connect(audioContext.destination);
      } catch (e) {
        console.warn('Audio source node connection warning:', e);
      }
    }

    if (!visualizer && canvas) {
      const bc = getButterchurn();
      if (bc && typeof bc.createVisualizer === 'function') {
        try {
          visualizer = bc.createVisualizer(audioContext, canvas, {
            width: window.innerWidth,
            height: window.innerHeight,
            pixelRatio: Math.min(window.devicePixelRatio || 1, 2)
          });

          const extraImgs = getButterchurnExtraImages();
          if (extraImgs && typeof extraImgs.getImages === 'function') {
            visualizer.loadExtraImages(extraImgs.getImages());
          }

          ensurePresets();
          if (presetKeys.length > 0) {
            const initialPreset = presets[presetKeys[presetIndex]];
            if (initialPreset) {
              visualizer.loadPreset(initialPreset, 0.0);
            }
          }

          if (sourceNode) {
            visualizer.connectAudio(sourceNode);
          }
        } catch (vizErr) {
          console.error('Butterchurn visualizer creation error:', vizErr);
        }
      }
    }
  }

  async function startExperience() {
    if (hasStarted && isPlaying) return;
    hasStarted = true;
    document.body.classList.add('started');

    try {
      await initAudioEngine();
      await audio.play();
      isPlaying = true;
      streamStartTime = Date.now();
      updatePlayUI(true);
      startPresetCycle();
    } catch (err) {
      console.warn('Startup play retry:', err);
      audio.play().then(() => {
        isPlaying = true;
        streamStartTime = Date.now();
        updatePlayUI(true);
      }).catch(e => console.error('Audio play failed:', e));
    }
  }

  async function togglePlay() {
    if (!audio) return;

    if (!hasStarted) {
      startExperience();
      return;
    }

    if (isPlaying) {
      audio.pause();
      isPlaying = false;
      updatePlayUI(false);
    } else {
      try {
        await initAudioEngine();
        await audio.play();
        isPlaying = true;
        if (!streamStartTime) streamStartTime = Date.now();
        updatePlayUI(true);
        startPresetCycle();
      } catch (err) {
        console.warn('Playback retry:', err);
        audio.play().then(() => {
          isPlaying = true;
          if (!streamStartTime) streamStartTime = Date.now();
          updatePlayUI(true);
        }).catch(e => console.error('Audio play failed:', e));
      }
    }
  }

  function updatePlayUI(playing) {
    if (playSymbol) playSymbol.textContent = playing ? '▌▌' : '▶';
    if (playText) playText.textContent = playing ? 'PAUSE' : 'PLAY STREAM';
    if (artPlayButton) {
      artPlayButton.textContent = playing ? '■' : '▶';
      artPlayButton.setAttribute('aria-label', playing ? 'Pause radio' : 'Play radio');
    }
  }

  if (startupBtn) {
    startupBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      startExperience();
    });
  }

  if (startupOverlay) {
    startupOverlay.addEventListener('click', (e) => {
      if (e.target === startupOverlay) {
        startExperience();
      }
    });
  }

  if (btnPlayPause) btnPlayPause.addEventListener('click', togglePlay);
  if (artPlayButton) artPlayButton.addEventListener('click', togglePlay);

  // ─── 5. REAL-TIME BUTTERCHURN RENDER LOOP & PROGRESS ANIMATION ──────────
  let lastFrameTime = performance.now();
  function renderFrame() {
    const now = performance.now();
    const dt = Math.min((now - lastFrameTime) / 1000, 0.1);
    lastFrameTime = now;

    if (visualizer && isPlaying && visEnabled) {
      try {
        visualizer.render();
      } catch (e) {
        // Suppress dropped frame warnings
      }
    }

    updateProgressUI(dt);

    requestAnimationFrame(renderFrame);
  }

  // ─── 6. VOLUME SLIDER ───────────────────────────────────────────────────
  let isDraggingVol = false;

  function updateVolumeFromEvent(e) {
    if (!volTrack || !audio || !volFill) return;
    const rect = volTrack.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.volume = ratio;
    volFill.style.width = `${(ratio * 100).toFixed(1)}%`;
  }

  if (volTrack) {
    volTrack.addEventListener('mousedown', (e) => {
      isDraggingVol = true;
      updateVolumeFromEvent(e);
    });
  }

  window.addEventListener('mousemove', (e) => {
    if (isDraggingVol) updateVolumeFromEvent(e);
  });

  window.addEventListener('mouseup', () => {
    isDraggingVol = false;
  });

  // ─── 7. NOW PLAYING & METADATA POLLER ────────────────────────────────────
  let trackProgress = {
    duration: 0,
    startTimeSec: null,
    isLive: true,
    lastFormattedElapsed: ''
  };

  function formatSeconds(secs) {
    if (isNaN(secs) || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  function updateProgressUI(dt) {
    if (!trackProgress.isLive && trackProgress.duration > 0 && trackProgress.startTimeSec !== null) {
      const nowSec = performance.now() / 1000;
      const rawElapsed = nowSec - trackProgress.startTimeSec;
      // Continuous progression clamped to duration (holds at end until next song loads)
      const currentElapsed = Math.min(trackProgress.duration, Math.max(0, rawElapsed));

      const pct = (currentElapsed / trackProgress.duration) * 100;
      const pctString = `${pct.toFixed(2)}%`;

      if (progressBarFill) progressBarFill.style.width = pctString;
      if (progressBarThumb) progressBarThumb.style.left = pctString;

      const formatted = formatSeconds(Math.floor(currentElapsed));
      if (timeElapsedEl && trackProgress.lastFormattedElapsed !== formatted) {
        trackProgress.lastFormattedElapsed = formatted;
        timeElapsedEl.textContent = formatted;
      }
      if (timeTotalEl) {
        const totalFormatted = formatSeconds(trackProgress.duration);
        if (timeTotalEl.textContent !== totalFormatted) {
          timeTotalEl.textContent = totalFormatted;
        }
      }
    } else {
      // Live stream or unknown duration
      if (progressBarFill && progressBarFill.style.width !== '100%') progressBarFill.style.width = '100%';
      if (progressBarThumb && progressBarThumb.style.left !== '100%') progressBarThumb.style.left = '100%';
      if (timeTotalEl && timeTotalEl.textContent !== 'LIVE') timeTotalEl.textContent = 'LIVE';

      if (isPlaying && streamStartTime) {
        const liveSecs = Math.floor((Date.now() - streamStartTime) / 1000);
        const formattedLive = formatSeconds(liveSecs);
        if (timeElapsedEl && trackProgress.lastFormattedElapsed !== formattedLive) {
          trackProgress.lastFormattedElapsed = formattedLive;
          timeElapsedEl.textContent = formattedLive;
        }
      } else {
        if (timeElapsedEl && timeElapsedEl.textContent !== '0:00') {
          timeElapsedEl.textContent = '0:00';
          trackProgress.lastFormattedElapsed = '0:00';
        }
      }
    }
  }

  async function pollNowPlaying() {
    try {
      const res = await fetch('/api/nowplaying');
      if (!res.ok) return;
      const data = await res.json();

      const song = data?.now_playing?.song;
      const station = data?.station;
      const live = data?.live;
      const np = data?.now_playing;

      const stationName = station?.name ? station.name.toUpperCase() : 'IADT';
      const showName = live?.is_live ? (live.streamer_name || 'LIVE BROADCAST') : 'AUTODJ 24/7';

      if (playerStationTitle) {
        playerStationTitle.textContent = `${stationName} // ${showName}`;
      }

      if (trackShowVal) {
        trackShowVal.textContent = showName;
      }

      // Update listener & stream status continuously on every poll
      const listenersCount = data?.listeners?.unique ?? data?.listeners?.current ?? data?.station?.mounts?.[0]?.listeners?.unique ?? data?.station?.mounts?.[0]?.listeners?.current ?? data?.listeners?.total ?? 0;
      const bitrate = data?.station?.mounts?.[0]?.bitrate ? `${data.station.mounts[0].bitrate}kbps` : '192kbps';
      if (trackStatusVal) {
        trackStatusVal.textContent = `${listenersCount} ${listenersCount === 1 ? 'online' : 'online'} // ${bitrate}`;
      }

      if (song) {
        const title = song.title || song.text || 'IADT Radio Stream';
        const artist = song.artist || 'IADT Radio';
        const songId = song.id || `${artist}-${title}`;
        // Unique playback identifier from AzuraCast song history (sh_id increments every track)
        const playbackId = String(np?.sh_id || np?.played_at || songId);

        const duration = Number(np?.duration) || 0;
        const elapsed = Number(np?.elapsed) || 0;
        const nowSec = performance.now() / 1000;

        // Check if track title/artist/art changed
        if (songId !== currentSongId) {
          currentSongId = songId;
          if (trackTitleVal) trackTitleVal.textContent = title;
          if (trackArtistVal) trackArtistVal.textContent = artist;

          if (song.art && albumArtImg) {
            albumArtImg.src = song.art;
          }
        }

        // Detect new playback: sh_id changed, elapsed reset to near zero after a full track, or first load
        const isNewPlayback = (playbackId !== currentPlaybackId);
        const hasElapsedReset = (trackProgress.duration > 0 && trackProgress.startTimeSec !== null && elapsed < 15 && (nowSec - trackProgress.startTimeSec) > 30);

        if (isNewPlayback || hasElapsedReset || trackProgress.startTimeSec === null) {
          currentPlaybackId = playbackId;

          if (duration > 0) {
            trackProgress.duration = duration;
            trackProgress.startTimeSec = nowSec - elapsed;
            trackProgress.isLive = false;
          } else {
            trackProgress.duration = 0;
            trackProgress.startTimeSec = null;
            trackProgress.isLive = true;
          }
          trackProgress.lastFormattedElapsed = '';
        } else if (duration > 0 && (trackProgress.duration === 0 || trackProgress.startTimeSec === null)) {
          trackProgress.duration = duration;
          trackProgress.startTimeSec = nowSec - elapsed;
          trackProgress.isLive = false;
        }
      }
    } catch (err) {
      console.warn('Now playing fetch error:', err);
    }
  }

  function startNowPlayingPolling() {
    pollNowPlaying();
    if (nowPlayingTimer) clearInterval(nowPlayingTimer);
    nowPlayingTimer = setInterval(pollNowPlaying, 3000);
  }

  // ─── 8. OVERLAYS & NAVIGATION ───────────────────────────────────────────
  function closeAllOverlays() {
    if (overlayAbout) overlayAbout.classList.add('hidden');
    if (overlayShows) overlayShows.classList.add('hidden');
    if (skinPanel) skinPanel.classList.add('hidden');
    if (btnToggleSkin) btnToggleSkin.classList.remove('is-active');
    navButtons.forEach(btn => {
      const target = btn.getAttribute('data-nav');
      if (target === 'ABOUT' || target === 'SHOWS') {
        btn.classList.remove('is-active');
      }
    });
  }

  navButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const target = btn.getAttribute('data-nav');

      if (target === 'ABOUT' && overlayAbout) {
        const willOpen = overlayAbout.classList.contains('hidden');
        closeAllOverlays();
        if (willOpen) {
          overlayAbout.classList.remove('hidden');
          btn.classList.add('is-active');
        }
      } else if (target === 'SHOWS' && overlayShows) {
        const willOpen = overlayShows.classList.contains('hidden');
        closeAllOverlays();
        if (willOpen) {
          overlayShows.classList.remove('hidden');
          btn.classList.add('is-active');
        }
      } else if (target === 'VIDEO') {
        closeAllOverlays();
        toggleFloatingWindow('video');
      } else if (target === 'CHAT') {
        closeAllOverlays();
        toggleFloatingWindow('chat');
      }
    });
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.overlay-panel') && !e.target.closest('.skin-panel') && !e.target.closest('.nav-bar')) {
      closeAllOverlays();
    }
  });

  // ─── 9. FLOATING WINDOWS (DRAGGABLE & RESIZABLE) ─────────────────────────
  let unreadChatCount = 0;
  const chatBadge = document.getElementById('chat-badge');
  const chatMessages = document.getElementById('chat-messages');
  const chatForm = document.getElementById('chat-form');
  const chatMsgInput = document.getElementById('chat-msg-input');
  const chatNickInput = document.getElementById('chat-nick-input');
  const chatOnlineCount = document.getElementById('chat-online-count');
  const chatStatusPill = document.getElementById('chat-status-pill');
  const chatStatusTxt = document.getElementById('chat-status-txt');

  function bringToFront(winEl) {
    if (!winEl) return;
    highestZ += 1;
    winEl.style.zIndex = highestZ;
  }

  function openFloatingWindow(name) {
    const win = name === 'video' ? winVideo : name === 'bug' ? winBug : winChat;
    if (!win) return;
    const navBtn = document.getElementById(`nav-${name}`);
    win.classList.remove('hidden');
    bringToFront(win);
    if (navBtn) navBtn.classList.add('is-active');
    if (name === 'bug' && btnToggleBug) btnToggleBug.classList.add('is-active');
    if (name === 'chat') {
      unreadChatCount = 0;
      if (chatBadge) {
        chatBadge.textContent = '0';
        chatBadge.classList.add('hidden');
      }
      scrollChatToBottom();
      if (chatMsgInput) setTimeout(() => chatMsgInput.focus(), 50);
    }
  }

  function closeFloatingWindow(name) {
    const win = name === 'video' ? winVideo : name === 'bug' ? winBug : winChat;
    if (!win) return;
    const navBtn = document.getElementById(`nav-${name}`);
    win.classList.add('hidden');
    if (navBtn) navBtn.classList.remove('is-active');
    if (name === 'bug' && btnToggleBug) btnToggleBug.classList.remove('is-active');
  }

  function toggleFloatingWindow(name) {
    const win = name === 'video' ? winVideo : name === 'bug' ? winBug : winChat;
    if (!win) return;
    if (win.classList.contains('hidden')) {
      openFloatingWindow(name);
    } else {
      closeFloatingWindow(name);
    }
  }

  if (closeWinVideo) {
    closeWinVideo.addEventListener('click', (e) => {
      e.stopPropagation();
      closeFloatingWindow('video');
    });
  }

  if (closeWinChat) {
    closeWinChat.addEventListener('click', (e) => {
      e.stopPropagation();
      closeFloatingWindow('chat');
    });
  }

  if (closeWinBug) {
    closeWinBug.addEventListener('click', (e) => {
      e.stopPropagation();
      closeFloatingWindow('bug');
    });
  }

  if (btnToggleBug) {
    btnToggleBug.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllOverlays();
      toggleFloatingWindow('bug');
    });
  }

  // ─── Bug report form submit ──────────────────────────────────────────────
  if (bugReportForm) {
    bugReportForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const category = (document.getElementById('bug-category') || {}).value || 'General';
      const description = (document.getElementById('bug-description') || {}).value || '';
      if (!description.trim()) return;

      const submitBtn = document.getElementById('bug-submit-btn');
      if (submitBtn) submitBtn.disabled = true;
      if (bugStatusMsg) { bugStatusMsg.textContent = 'Sending…'; bugStatusMsg.classList.remove('hidden'); }

      try {
        const res = await fetch('/api/report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            category,
            description,
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString()
          })
        });
        const data = await res.json();
        if (bugStatusMsg) {
          bugStatusMsg.textContent = data.message || '✓ Report submitted — thanks!';
          bugStatusMsg.style.color = 'var(--accent)';
        }
        bugReportForm.reset();
      } catch (err) {
        if (bugStatusMsg) {
          bugStatusMsg.textContent = '✗ Failed to send — try again later.';
          bugStatusMsg.style.color = '#ff4444';
        }
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  function setupDraggableWindow(winEl) {
    if (!winEl) return;
    const bar = winEl.querySelector('.float-bar');
    if (!bar) return;
    let isDragging = false;
    let startX = 0, startY = 0;
    let initialLeft = 0, initialTop = 0;

    winEl.addEventListener('mousedown', () => bringToFront(winEl));

    bar.addEventListener('mousedown', (e) => {
      if (e.target.closest('.float-close')) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      initialLeft = winEl.offsetLeft;
      initialTop = winEl.offsetTop;
      bringToFront(winEl);
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const maxLeft = window.innerWidth - 60;
      const maxTop = window.innerHeight - 40;
      winEl.style.left = `${Math.max(10, Math.min(maxLeft, initialLeft + dx))}px`;
      winEl.style.top = `${Math.max(10, Math.min(maxTop, initialTop + dy))}px`;
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
    });
  }

  setupDraggableWindow(winVideo);
  setupDraggableWindow(winChat);
  setupDraggableWindow(winBug);

  // ─── 10. REAL-TIME CHAT ENGINE ───────────────────────────────────────────
  let chatSocket = null;
  let chatReconnectTimeout = null;
  let chatMyHandle = '';
  let chatMyColor = '';
  let chatSessionId = '';
  try {
    chatMyHandle = localStorage.getItem('dlxr_chat_nick') || '';
    chatMyColor = localStorage.getItem('dlxr_chat_color') || '';
    chatSessionId = localStorage.getItem('dlxr_session_id') || '';
    if (!chatSessionId) {
      chatSessionId = `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      localStorage.setItem('dlxr_session_id', chatSessionId);
    }
  } catch (e) {}

  const chatColorBtn = document.getElementById('chat-color-btn');
  const chatColorPopover = document.getElementById('chat-color-popover');
  const colorSwatchesContainer = document.getElementById('color-swatches');

  const COLOR_PALETTE = [
    { name: 'Terminal Green', hex: '#00ff66' },
    { name: 'Electric Cyan',  hex: '#00e5ff' },
    { name: 'Solar Amber',    hex: '#ff9100' },
    { name: 'Acid Yellow',    hex: '#ffff00' },
    { name: 'Cyber Pink',     hex: '#ff007f' },
    { name: 'Pure Mono',      hex: '#f0f0f0' }
  ];

  function updateColorButton(color) {
    if (chatColorBtn) {
      chatColorBtn.style.backgroundColor = color || 'var(--accent)';
    }
    if (chatNickInput && color) {
      chatNickInput.style.color = color;
    }
  }

  function initColorPicker() {
    if (!colorSwatchesContainer) return;
    colorSwatchesContainer.innerHTML = '';

    COLOR_PALETTE.forEach(c => {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'color-swatch';
      swatch.style.backgroundColor = c.hex;
      swatch.title = c.name;
      swatch.setAttribute('aria-label', c.name);

      if (chatMyColor && chatMyColor.toLowerCase() === c.hex.toLowerCase()) {
        swatch.classList.add('is-selected');
      }

      swatch.addEventListener('click', (e) => {
        e.stopPropagation();
        selectColor(c.hex);
        if (chatColorPopover) chatColorPopover.classList.add('hidden');
      });

      colorSwatchesContainer.appendChild(swatch);
    });

    if (chatColorBtn && chatColorPopover) {
      chatColorBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        chatColorPopover.classList.toggle('hidden');
      });

      document.addEventListener('click', (e) => {
        if (!chatColorPopover.contains(e.target) && e.target !== chatColorBtn) {
          chatColorPopover.classList.add('hidden');
        }
      });
    }

    if (chatMyColor) {
      updateColorButton(chatMyColor);
    }
  }

  function selectColor(hex) {
    chatMyColor = hex;
    try { localStorage.setItem('dlxr_chat_color', hex); } catch (e) {}
    updateColorButton(hex);

    if (colorSwatchesContainer) {
      colorSwatchesContainer.querySelectorAll('.color-swatch').forEach(s => {
        const bg = s.style.backgroundColor;
        s.classList.toggle('is-selected', bg === hex || bg === hex.toLowerCase());
      });
    }

    if (chatSocket && chatSocket.readyState === WebSocket.OPEN) {
      chatSocket.send(JSON.stringify({
        type: 'set_color',
        color: hex
      }));
    }
  }

  initColorPicker();

  function scrollChatToBottom(smooth = false) {
    if (!chatMessages) return;
    if (smooth) {
      chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' });
    } else {
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  }

  function formatTime(isoString) {
    try {
      const d = isoString ? new Date(isoString) : new Date();
      const h = String(d.getHours()).padStart(2, '0');
      const m = String(d.getMinutes()).padStart(2, '0');
      return `[${h}:${m}]`;
    } catch (e) {
      return '[--:--]';
    }
  }

  function linkifySafe(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    const escaped = div.innerHTML;
    const urlRegex = /(https?:\/\/[^\s<>"']+)/gi;
    return escaped.replace(urlRegex, (url) => {
      return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
    });
  }

  function appendChatMessage(msg) {
    if (!chatMessages || !msg) return;
    
    // Check if user was near the bottom before appending
    const isNearBottom = chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight < 60;

    const row = document.createElement('div');
    row.className = 'chat-msg-row';

    const timeSpan = document.createElement('span');
    timeSpan.className = 'chat-msg-time';
    timeSpan.textContent = formatTime(msg.timestamp);

    const userSpan = document.createElement('span');
    userSpan.className = 'chat-msg-user';
    userSpan.textContent = msg.user || 'anon';
    if (msg.userColor) {
      userSpan.style.color = msg.userColor;
    }

    const textSpan = document.createElement('span');
    textSpan.className = 'chat-msg-text';
    textSpan.innerHTML = linkifySafe(msg.text || '');

    // Check for @handle mentions with subtle yellow highlight
    if (chatMyHandle && msg.text && msg.user !== chatMyHandle) {
      const escapedHandle = chatMyHandle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const mentionRegex = new RegExp(`@${escapedHandle}\\b`, 'i');
      if (mentionRegex.test(msg.text)) {
        row.classList.add('is-mention');
      }
    }

    row.appendChild(timeSpan);
    if (msg.isDJ) {
      const djBadge = document.createElement('span');
      djBadge.className = 'chat-dj-badge';
      djBadge.textContent = `[${msg.badge || 'ADMIN'}]`;
      row.appendChild(djBadge);
    }
    row.appendChild(userSpan);
    row.appendChild(textSpan);
    chatMessages.appendChild(row);

    if (isNearBottom || (chatMyHandle && msg.user === chatMyHandle)) {
      scrollChatToBottom(true);
    }
  }

  function appendChatSystemMessage(text) {
    if (!chatMessages) return;
    const sys = document.createElement('div');
    sys.className = 'chat-system-msg';
    sys.textContent = text;
    chatMessages.appendChild(sys);
    scrollChatToBottom(true);
  }

  function updateRoster(roster) {
    const rosterList = document.getElementById('roster-list');
    if (!rosterList || !Array.isArray(roster)) return;
    rosterList.innerHTML = '';
    roster.forEach(u => {
      const item = document.createElement('div');
      item.className = 'roster-item';

      const dot = document.createElement('span');
      dot.className = 'roster-dot';
      dot.style.background = u.color || '#00cc55';

      const name = document.createElement('span');
      name.textContent = u.handle;
      if (u.color) name.style.color = u.color;

      item.appendChild(dot);
      if (u.isDJ) {
        const djBadge = document.createElement('span');
        djBadge.className = 'chat-dj-badge';
        djBadge.textContent = `[${u.badge || 'ADMIN'}]`;
        item.appendChild(djBadge);
      }
      item.appendChild(name);
      rosterList.appendChild(item);
    });
  }

  function setChatStatus(status, connected = true) {
    if (chatStatusTxt) chatStatusTxt.textContent = status;
    if (chatStatusPill) {
      chatStatusPill.classList.toggle('disconnected', !connected);
    }
  }

  function initChatSocket() {
    if (chatSocket && (chatSocket.readyState === WebSocket.OPEN || chatSocket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProto}//${location.host}/ws/chat`;

    setChatStatus('CONNECTING', false);

    try {
      chatSocket = new WebSocket(wsUrl);
    } catch (err) {
      console.error('Failed to create WebSocket:', err);
      setChatStatus('OFFLINE', false);
      scheduleChatReconnect();
      return;
    }

    chatSocket.onopen = () => {
      setChatStatus('LIVE', true);
      if (chatMyHandle) {
        chatSocket.send(JSON.stringify({
          type: 'set_handle',
          handle: chatMyHandle,
          color: chatMyColor || undefined,
          sessionId: chatSessionId
        }));
      }

      // Check for DJ auth key in URL param or sessionStorage
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const djKey = urlParams.get('dj');
        if (djKey) {
          sessionStorage.setItem('dlxr_dj_key', djKey);
          window.history.replaceState({}, document.title, window.location.pathname);
        }
        const savedDjKey = sessionStorage.getItem('dlxr_dj_key');
        if (savedDjKey) {
          chatSocket.send(JSON.stringify({
            type: 'auth_dj',
            key: savedDjKey
          }));
        }
      } catch (e) {}
    };

    chatSocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'init') {
          if (!chatMyHandle) {
            chatMyHandle = data.defaultHandle || 'anon';
            try { localStorage.setItem('dlxr_chat_nick', chatMyHandle); } catch (e) {}
          }
          if (data.userColor && !chatMyColor) {
            chatMyColor = data.userColor;
            try { localStorage.setItem('dlxr_chat_color', chatMyColor); } catch (e) {}
          }
          updateColorButton(chatMyColor || data.userColor);
          if (chatNickInput) {
            chatNickInput.value = chatMyHandle;
          }
          if (chatOnlineCount && data.online !== undefined) {
            chatOnlineCount.textContent = `${data.online} online`;
          }
          if (Array.isArray(data.roster)) {
            updateRoster(data.roster);
          }
          // Populate history if present
          if (Array.isArray(data.history) && data.history.length > 0) {
            chatMessages.innerHTML = '';
            data.history.forEach(appendChatMessage);
            scrollChatToBottom();
          }
        } else if (data.type === 'presence') {
          if (chatOnlineCount && data.online !== undefined) {
            chatOnlineCount.textContent = `${data.online} online`;
          }
          if (Array.isArray(data.roster)) {
            updateRoster(data.roster);
          }
        } else if (data.type === 'handle_updated') {
          chatMyHandle = data.handle;
          if (chatNickInput) chatNickInput.value = chatMyHandle;
          try { localStorage.setItem('dlxr_chat_nick', chatMyHandle); } catch (e) {}
          if (data.userColor) {
            chatMyColor = data.userColor;
            updateColorButton(chatMyColor);
            try { localStorage.setItem('dlxr_chat_color', chatMyColor); } catch (e) {}
          }
        } else if (data.type === 'color_updated') {
          chatMyColor = data.userColor;
          updateColorButton(chatMyColor);
          try { localStorage.setItem('dlxr_chat_color', chatMyColor); } catch (e) {}
        } else if (data.type === 'chat_cleared') {
          if (chatMessages) {
            chatMessages.innerHTML = '';
          }
        } else if (data.type === 'auth_success') {
          try { sessionStorage.setItem('dlxr_dj_verified', '1'); } catch (e) {}
        } else if (data.type === 'message') {
          appendChatMessage(data.message);

          // If chat window is hidden, increment unread badge
          if (winChat && winChat.classList.contains('hidden')) {
            unreadChatCount++;
            if (chatBadge) {
              chatBadge.textContent = unreadChatCount > 99 ? '99+' : String(unreadChatCount);
              chatBadge.classList.remove('hidden');
            }
          }
        } else if (data.type === 'error') {
          appendChatSystemMessage(`[!] ${data.message || 'Error sending message'}`);
        }
      } catch (err) {
        console.error('Chat payload parse error:', err);
      }
    };

    chatSocket.onclose = () => {
      setChatStatus('OFFLINE', false);
      scheduleChatReconnect();
    };

    chatSocket.onerror = (err) => {
      console.warn('Chat socket error:', err);
      setChatStatus('ERROR', false);
    };
  }

  function scheduleChatReconnect() {
    if (chatReconnectTimeout) clearTimeout(chatReconnectTimeout);
    chatReconnectTimeout = setTimeout(() => {
      initChatSocket();
    }, 3000);
  }

  // Handle Nickname updates
  if (chatNickInput) {
    const updateNick = () => {
      const val = chatNickInput.value.trim().replace(/[^a-zA-Z0-9_\-\.]/g, '');
      if (val && val !== chatMyHandle && val.length <= 18) {
        chatMyHandle = val;
        try { localStorage.setItem('dlxr_chat_nick', chatMyHandle); } catch (e) {}
        if (chatSocket && chatSocket.readyState === WebSocket.OPEN) {
          chatSocket.send(JSON.stringify({
            type: 'set_handle',
            handle: chatMyHandle,
            color: chatMyColor || undefined,
            sessionId: chatSessionId
          }));
        }
      } else {
        chatNickInput.value = chatMyHandle;
      }
    };

    chatNickInput.addEventListener('blur', updateNick);
    chatNickInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        chatNickInput.blur();
      }
    });
  }

  // Chat message submit
  if (chatForm) {
    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!chatMsgInput) return;
      const text = chatMsgInput.value.trim();
      if (text.toLowerCase() === '/clear') {
        chatMessages.innerHTML = '<div class="chat-system-msg">// CHAT VIEW CLEARED.</div>';
        chatMsgInput.value = '';
        return;
      }

      if (!chatSocket || chatSocket.readyState !== WebSocket.OPEN) {
        appendChatSystemMessage('[!] Chat is connecting... please wait.');
        initChatSocket();
        return;
      }

      chatSocket.send(JSON.stringify({
        type: 'message',
        handle: chatMyHandle,
        color: chatMyColor || undefined,
        sessionId: chatSessionId,
        text: text
      }));

      chatMsgInput.value = '';
    });
  }

  // ─── 11. KEYBOARD SHORTCUTS & CANVAS INTERACTION ────────────────────────
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (!hasStarted) {
        startExperience();
      } else {
        nextPreset(2.0);
      }
    } else if (e.key === 'f' || e.key === 'F') {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    }
  });

  if (canvas) {
    canvas.addEventListener('click', () => {
      if (!hasStarted) {
        startExperience();
      } else if (isPlaying && visEnabled) {
        nextPreset(2.0);
      }
    });
  }

  if (audio) {
    audio.addEventListener('error', () => {
      console.warn('Radio stream disconnect, attempting reconnect...');
      setTimeout(() => {
        audio.load();
        if (isPlaying) audio.play().catch(() => {});
      }, 2500);
    });
  }

  window.addEventListener('resize', resizeVisualizer);
  window.addEventListener('load', () => {
    loadPresets();
    resizeVisualizer();
  });

  // ─── INITIALIZATION ON BOOT ──────────────────────────────────────────────
  applySkin(currentSkin);
  loadPresets();
  resizeVisualizer();
  startNowPlayingPolling();
  initChatSocket();
  renderFrame();

})();
