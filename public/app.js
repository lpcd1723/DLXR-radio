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
    startTimeSec: 0,
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
    if (!trackProgress.isLive && trackProgress.duration > 0 && trackProgress.startTimeSec > 0) {
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

        if (songId !== currentSongId) {
          currentSongId = songId;
          if (trackTitleVal) trackTitleVal.textContent = title;
          if (trackArtistVal) trackArtistVal.textContent = artist;

          if (song.art && albumArtImg) {
            albumArtImg.src = song.art;
          }

          // A new song has arrived: initialize duration and calibrated start time
          const duration = Number(np?.duration) || 0;
          const elapsed = Number(np?.elapsed) || 0;
          const nowSec = performance.now() / 1000;

          if (duration > 0) {
            trackProgress.duration = duration;
            trackProgress.startTimeSec = nowSec - elapsed;
            trackProgress.isLive = false;
          } else {
            trackProgress.duration = 0;
            trackProgress.startTimeSec = 0;
            trackProgress.isLive = true;
          }
          trackProgress.lastFormattedElapsed = '';
        } else {
          // Same song continues: only initialize if duration was previously unknown
          const duration = Number(np?.duration) || 0;
          if (duration > 0 && (trackProgress.duration === 0 || trackProgress.startTimeSec === 0)) {
            const elapsed = Number(np?.elapsed) || 0;
            const nowSec = performance.now() / 1000;
            trackProgress.duration = duration;
            trackProgress.startTimeSec = nowSec - elapsed;
            trackProgress.isLive = false;
          }
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

  // ─── 10. KEYBOARD SHORTCUTS & CANVAS INTERACTION ────────────────────────
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
  renderFrame();

})();
