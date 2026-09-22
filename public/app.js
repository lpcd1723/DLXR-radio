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

  let presets = {};
  let presetKeys = [];
  let presetIndex = 0;
  let presetCycleTimer = null;
  let nowPlayingTimer = null;
  let currentSongId = '';
  let streamStartTime = null;
  let streamElapsedTimer = null;

  let visEnabled = true;
  let currentSkin = localStorage.getItem('dlxr_skin') || 'DARK';
  let openOverlays = { about: false, shows: false, skin: false };
  let floatingWindows = { video: false, chat: false };
  let highestZ = 70;

  // ─── DOM ELEMENTS ──────────────────────────────────────────────────────
  const canvas = document.getElementById('visualizer-canvas');
  const audio = document.getElementById('radio-audio');
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
  const closeWinVideo = document.getElementById('close-win-video');
  const closeWinChat = document.getElementById('close-win-chat');

  const volTrack = document.getElementById('vol-track');
  const volFill = document.getElementById('vol-fill');

  const progressBarTrack = document.getElementById('progress-bar-track');
  const progressBarFill = document.getElementById('progress-bar-fill');
  const progressBarThumb = document.getElementById('progress-bar-thumb');
  const timeElapsedEl = document.getElementById('time-elapsed');
  const timeTotalEl = document.getElementById('time-total');

  const chatInput = document.getElementById('chat-input');
  const chatSendBtn = document.getElementById('chat-send-btn');
  const chatMsgsList = document.getElementById('chat-msgs-list');

  // ─── 1. THEMES & SKINS ──────────────────────────────────────────────────
  function applySkin(skin) {
    currentSkin = skin === 'LIGHT' ? 'LIGHT' : 'DARK';
    document.documentElement.setAttribute('data-skin', currentSkin);
    localStorage.setItem('dlxr_skin', currentSkin);

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

  btnToggleSkin.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = skinPanel.classList.contains('hidden');
    closeAllOverlays();
    if (willOpen) {
      skinPanel.classList.remove('hidden');
      btnToggleSkin.classList.add('is-active');
    }
  });

  // ─── 2. VISUALIZER TOGGLE (SMOOTH TRANSITION) ───────────────────────────
  function setVisualizerState(enabled) {
    visEnabled = enabled;
    if (visEnabled) {
      document.body.classList.remove('vis-off');
      btnToggleVis.textContent = 'VIS';
      btnToggleVis.classList.remove('is-active');
    } else {
      document.body.classList.add('vis-off');
      btnToggleVis.textContent = 'VIS·OFF';
      btnToggleVis.classList.add('is-active');
    }
  }

  btnToggleVis.addEventListener('click', (e) => {
    e.stopPropagation();
    setVisualizerState(!visEnabled);
  });

  // ─── 3. BUTTERCHURN VISUALIZER SETUP ────────────────────────────────────
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
      if (presetKeys.length > 0) {
        presetIndex = Math.floor(Math.random() * presetKeys.length);
      }
    } catch (err) {
      console.warn('Error indexing Butterchurn presets:', err);
    }
  }

  function loadPresetByIndex(idx, blendSec = 2.5) {
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

    if (!sourceNode) {
      sourceNode = audioContext.createMediaElementSource(audio);
      sourceNode.connect(audioContext.destination);
    }

    if (!visualizer) {
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

          if (presetKeys.length > 0) {
            const initialPreset = presets[presetKeys[presetIndex]];
            if (initialPreset) {
              visualizer.loadPreset(initialPreset, 0.0);
            }
          }

          visualizer.connectAudio(sourceNode);
        } catch (vizErr) {
          console.error('Butterchurn initialization error:', vizErr);
        }
      }
    }
  }

  async function togglePlay() {
    if (isPlaying) {
      audio.pause();
      isPlaying = false;
      updatePlayUI(false);
      if (streamElapsedTimer) clearInterval(streamElapsedTimer);
    } else {
      try {
        await initAudioEngine();
        await audio.play();
        isPlaying = true;
        updatePlayUI(true);
        startPresetCycle();
        startStreamElapsedTimer();
      } catch (err) {
        console.error('Playback trigger error:', err);
        // Fallback retry
        audio.play().then(() => {
          isPlaying = true;
          updatePlayUI(true);
        }).catch(e => console.warn('Retry failed:', e));
      }
    }
  }

  function updatePlayUI(playing) {
    if (playSymbol) playSymbol.textContent = playing ? '▌▌' : '▶';
    if (playText) playText.textContent = playing ? 'PAUSE' : 'PLAY STREAM';
    artPlayButton.textContent = playing ? '■' : '▶';
    artPlayButton.setAttribute('aria-label', playing ? 'Pause radio' : 'Play radio');
  }

  btnPlayPause.addEventListener('click', togglePlay);
  artPlayButton.addEventListener('click', togglePlay);

  // ─── 5. REAL-TIME BUTTERCHURN RENDER LOOP ───────────────────────────────
  function renderFrame() {
    if (visualizer && isPlaying && visEnabled) {
      try {
        visualizer.render();
      } catch (e) {
        // Suppress dropped frame warnings
      }
    }
    requestAnimationFrame(renderFrame);
  }

  // ─── 6. VOLUME SLIDER ───────────────────────────────────────────────────
  let isDraggingVol = false;

  function updateVolumeFromEvent(e) {
    const rect = volTrack.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.volume = ratio;
    volFill.style.width = `${(ratio * 100).toFixed(1)}%`;
  }

  volTrack.addEventListener('mousedown', (e) => {
    isDraggingVol = true;
    updateVolumeFromEvent(e);
  });

  window.addEventListener('mousemove', (e) => {
    if (isDraggingVol) updateVolumeFromEvent(e);
  });

  window.addEventListener('mouseup', () => {
    isDraggingVol = false;
  });

  // ─── 7. NOW PLAYING & METADATA POLLER ────────────────────────────────────
  function formatSeconds(secs) {
    if (isNaN(secs) || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  function startStreamElapsedTimer() {
    if (streamElapsedTimer) clearInterval(streamElapsedTimer);
    streamStartTime = Date.now();
    streamElapsedTimer = setInterval(() => {
      if (isPlaying && streamStartTime) {
        const elapsedSecs = Math.floor((Date.now() - streamStartTime) / 1000);
        timeElapsedEl.textContent = formatSeconds(elapsedSecs);
      }
    }, 1000);
  }

  async function pollNowPlaying() {
    try {
      const res = await fetch('/api/nowplaying');
      if (!res.ok) return;
      const data = await res.json();

      const song = data?.now_playing?.song;
      const station = data?.station;
      const live = data?.live;

      if (station?.name) {
        playerStationTitle.textContent = `${station.name.toUpperCase()} // ${live?.is_live ? (live.streamer_name || 'LIVE DJ') : 'AUTO DJ'}`;
      }

      if (song) {
        const title = song.title || song.text || 'IADT Radio Stream';
        const artist = song.artist || 'IADT Radio';
        const songId = song.id || `${artist}-${title}`;

        if (songId !== currentSongId) {
          currentSongId = songId;
          trackTitleVal.textContent = title;
          trackArtistVal.textContent = artist;
          trackShowVal.textContent = live?.is_live ? (live.streamer_name || 'LIVE BROADCAST') : (data?.now_playing?.playlist || 'AUTO DJ');
          trackStatusVal.textContent = `${data?.now_playing?.listeners?.current || 1} online // 128kbps`;

          if (song.art) {
            albumArtImg.src = song.art;
          }
        }

        // Duration progress if track duration is given
        if (data.now_playing.duration && data.now_playing.duration > 0) {
          const duration = data.now_playing.duration;
          const elapsed = data.now_playing.elapsed || 0;
          const pct = Math.min(100, Math.max(0, (elapsed / duration) * 100));
          progressBarFill.style.width = `${pct}%`;
          progressBarThumb.style.left = `${pct}%`;
          timeElapsedEl.textContent = formatSeconds(elapsed);
          timeTotalEl.textContent = formatSeconds(duration);
        } else {
          timeTotalEl.textContent = 'LIVE';
          progressBarFill.style.width = '100%';
          progressBarThumb.style.left = '100%';
        }
      }
    } catch (err) {
      console.warn('Now playing poll failed:', err);
    }
  }

  function startNowPlayingPolling() {
    pollNowPlaying();
    if (nowPlayingTimer) clearInterval(nowPlayingTimer);
    nowPlayingTimer = setInterval(pollNowPlaying, 3500);
  }

  // ─── 8. OVERLAYS & NAVIGATION ───────────────────────────────────────────
  function closeAllOverlays() {
    overlayAbout.classList.add('hidden');
    overlayShows.classList.add('hidden');
    skinPanel.classList.add('hidden');
    btnToggleSkin.classList.remove('is-active');
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

      if (target === 'ABOUT') {
        const willOpen = overlayAbout.classList.contains('hidden');
        closeAllOverlays();
        if (willOpen) {
          overlayAbout.classList.remove('hidden');
          btn.classList.add('is-active');
        }
      } else if (target === 'SHOWS') {
        const willOpen = overlayShows.classList.contains('hidden');
        closeAllOverlays();
        if (willOpen) {
          overlayShows.classList.remove('hidden');
          btn.classList.add('is-active');
        }
      } else if (target === 'VIDEO') {
        closeAllOverlays();
        openFloatingWindow('video');
      } else if (target === 'CHAT') {
        closeAllOverlays();
        openFloatingWindow('chat');
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
    highestZ += 1;
    winEl.style.zIndex = highestZ;
  }

  function openFloatingWindow(name) {
    const win = name === 'video' ? winVideo : winChat;
    const navBtn = document.getElementById(`nav-${name}`);
    win.classList.remove('hidden');
    bringToFront(win);
    floatingWindows[name] = true;
    if (navBtn) navBtn.classList.add('is-active');
  }

  function closeFloatingWindow(name) {
    const win = name === 'video' ? winVideo : winChat;
    const navBtn = document.getElementById(`nav-${name}`);
    win.classList.add('hidden');
    floatingWindows[name] = false;
    if (navBtn) navBtn.classList.remove('is-active');
  }

  closeWinVideo.addEventListener('click', (e) => {
    e.stopPropagation();
    closeFloatingWindow('video');
  });

  closeWinChat.addEventListener('click', (e) => {
    e.stopPropagation();
    closeFloatingWindow('chat');
  });

  function setupDraggableWindow(winEl) {
    const bar = winEl.querySelector('.float-bar');
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

  // ─── 10. KEYBOARD SHORTCUTS & CANVAS INTERACTION ────────────────────────
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Space') {
      e.preventDefault();
      nextPreset(2.0);
    } else if (e.key === 'f' || e.key === 'F') {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    }
  });

  canvas.addEventListener('click', () => {
    if (isPlaying && visEnabled) {
      nextPreset(2.0);
    }
  });

  // Audio Stream Error Recovery
  audio.addEventListener('error', () => {
    console.warn('Radio stream disconnect, attempting reconnect...');
    setTimeout(() => {
      audio.load();
      if (isPlaying) audio.play().catch(() => {});
    }, 2500);
  });

  window.addEventListener('resize', resizeVisualizer);

  // ─── INITIALIZATION ON BOOT ──────────────────────────────────────────────
  applySkin(currentSkin);
  loadPresets();
  resizeVisualizer();
  startNowPlayingPolling();
  renderFrame();

})();
