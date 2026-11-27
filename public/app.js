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
  let soundOn = true;   // SOUND ON/OFF only mutes: the stream and visualiser keep going
  let gainNode = null;
  // WebKit (Safari, iOS) plays a live stream straight from the <audio> element: the Web Audio
  // graph only ever gets silence, so a gain of 0 mutes nothing. We listen on a tap and, if the
  // graph stays dead while the stream plays, mute the element itself instead.
  let tapNode = null, tapBuf = null, graphHeard = false, graphDeaf = false, deafSecs = 0;

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
  const playText = document.getElementById('play-text');
  const playerWidget = document.getElementById('player-widget');
  const albumArtImg = document.getElementById('album-art-img');
  
  const trackTitleVal = document.getElementById('track-title-val');
  const trackArtistVal = document.getElementById('track-artist-val');
  const trackBeforeVal = document.getElementById('track-before-val');
  const playerNextK = document.getElementById('player-next-k');
  const playerNextVal = document.getElementById('player-next-val');
  const showsNow = document.getElementById('shows-now');
  const onAirLabel = document.getElementById('live-indicator-text');
  const playerStationTitle = document.getElementById('player-station-title');

  const btnToggleVis = document.getElementById('btn-toggle-vis');
  const btnToggleSkin = document.getElementById('btn-toggle-skin');

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


  const progressBarTrack = document.getElementById('progress-bar-track');
  const progressBarFill = document.getElementById('progress-bar-fill');
  const timeElapsedEl = document.getElementById('time-elapsed');
  const timeTotalEl = document.getElementById('time-total');

  // ─── 1. THEMES & SKINS ──────────────────────────────────────────────────
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let dipTimer = null, washTimer = null, visFade = null;

  // Theme flip, ~480ms in step with the moon → sun morph (hand-icons.js reads data-skin-target):
  // the visualiser dips out, the skin flips underneath it, then everything fades back in.
  // Flipping it while visible snapped its colour-invert straight to bright.
  function applySkin(skin, animate = false) {
    currentSkin = skin === 'LIGHT' ? 'LIGHT' : 'DARK';
    const root = document.documentElement;
    const next = currentSkin;
    root.setAttribute('data-skin-target', next);
    clearTimeout(dipTimer);
    clearTimeout(washTimer);
    if (animate && !reduceMotion) {
      root.classList.add('skin-wash');
      const dipVis = canvas && visEnabled;
      if (visFade) visFade.cancel();
      const fadeOut = dipVis ? canvas.animate([{ opacity: 0 }], { duration: 160, easing: 'ease-in', fill: 'forwards' }) : null;
      visFade = fadeOut;
      dipTimer = setTimeout(() => {
        root.setAttribute('data-skin', next);
        if (dipVis) {
          visFade = canvas.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'ease-out' });
          fadeOut.cancel();
        }
        washTimer = setTimeout(() => root.classList.remove('skin-wash'), 320);
      }, 160);
    } else {
      root.classList.remove('skin-wash');
      root.setAttribute('data-skin', next);
    }
    try {
      localStorage.setItem('dlxr_skin', currentSkin);
    } catch (e) {}
    if (btnToggleSkin) {
      btnToggleSkin.setAttribute('aria-label', currentSkin === 'LIGHT' ? 'Switch to dark theme' : 'Switch to light theme');
    }
  }

  if (btnToggleSkin) {
    btnToggleSkin.addEventListener('click', (e) => {
      e.stopPropagation();
      applySkin(currentSkin === 'LIGHT' ? 'DARK' : 'LIGHT', true);
    });
  }

  // ─── 2. VISUALIZER TOGGLE (SMOOTH TRANSITION) ───────────────────────────
  function setVisualizerState(enabled) {
    visEnabled = enabled;
    if (visEnabled) {
      document.body.classList.remove('vis-off');
      if (btnToggleVis) {
        btnToggleVis.classList.remove('is-active');
        btnToggleVis.setAttribute('aria-pressed', 'true');
      }
    } else {
      document.body.classList.add('vis-off');
      if (btnToggleVis) {
        btnToggleVis.classList.add('is-active');
        btnToggleVis.setAttribute('aria-pressed', 'false');
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
  // All synchronous on purpose: iPhone Safari only lets audio start inside the tap itself,
  // so nothing here may await before audio.play().

  // Phones never get the visualiser: Butterchurn (~1.5MB) is only fetched on desktop
  const desktopMq = window.matchMedia('(min-width: 769px)');
  const mobileMq = window.matchMedia('(max-width: 768px)');
  let butterchurnLoading = null;
  function loadButterchurn() {
    if (butterchurnLoading) return butterchurnLoading;
    const srcs = ['/js/butterchurn.min.js', '/js/butterchurnExtraImages.min.js', '/js/butterchurnPresets.min.js', '/js/butterchurnPresetsExtra.min.js'];
    butterchurnLoading = Promise.all(srcs.map(src => new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.async = false; // download together, run in order
      el.onload = resolve;
      el.onerror = () => reject(new Error('failed to load ' + src));
      document.head.appendChild(el);
    }))).then(() => {
      loadPresets();
      ensureContext();
      ensureVisualizer(); // idles silently behind the startup veil until the tap
      resizeVisualizer();
    }).catch(err => console.warn('Visualiser unavailable:', err));
    return butterchurnLoading;
  }

  function ensureContext() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!audioContext && AudioCtx) audioContext = new AudioCtx(); // suspended until the tap
    return audioContext;
  }

  function ensureSource() {
    if (sourceNode || !audio || !audioContext) return;
    try {
      sourceNode = audioContext.createMediaElementSource(audio);
      // visualiser listens to the source, speakers go through the gain, so muting keeps the visuals
      gainNode = audioContext.createGain();
      gainNode.gain.value = soundOn ? 1 : 0;
      sourceNode.connect(gainNode);
      gainNode.connect(audioContext.destination);
      tapNode = audioContext.createAnalyser();
      tapNode.fftSize = 256;
      tapBuf = new Float32Array(tapNode.fftSize);
      sourceNode.connect(tapNode);
      if (visualizer) visualizer.connectAudio(sourceNode);
    } catch (e) {
      console.warn('Audio source node connection warning:', e);
    }
  }

  function ensureVisualizer() {
    if (visualizer || !canvas || !audioContext || !desktopMq.matches) return;
    const bc = getButterchurn();
    if (!bc || typeof bc.createVisualizer !== 'function') return;
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
      const initialPreset = presets[presetKeys[presetIndex]];
      if (initialPreset) visualizer.loadPreset(initialPreset, 0.0);
      if (sourceNode) visualizer.connectAudio(sourceNode);
    } catch (vizErr) {
      console.error('Butterchurn visualizer creation error:', vizErr);
    }
  }

  // inside a tap: wake the context, route the stream through it
  function initAudioEngine() {
    if (!ensureContext()) return;
    ensureSource();
    ensureVisualizer();
    if (audioContext.state !== 'running') audioContext.resume().catch(() => {});
  }

  // Radio, not a player: once started the stream always runs at the live edge.
  // SOUND ON/OFF only mutes, there is no pause and nothing to pick up where you left off,
  // so everyone hears the same moment and no client sits on a stale buffer.
  function startExperience() {
    if (hasStarted) return;
    hasStarted = true;
    isPlaying = true; // "the stream should be running"; the watchdog keeps it that way
    initAudioEngine();
    audio.play().catch(e => {
      // autoplay refused even after the tap: leave SOUND OFF showing, the next tap on it rejoins live
      if (e.name === 'NotAllowedError') { updateSoundUI(); return; }
      if (e.name !== 'AbortError') scheduleReconnect('play() failed: ' + e.name);
    });
    streamStartTime = Date.now();
    startPresetCycle();
    updateSoundUI();
    playStartupTransition();
  }

  // the stream was stopped from outside (OS interruption, failed start): rejoin live, never resume
  function rejoinLive() {
    isPlaying = true;
    initAudioEngine();
    connectFresh();
    startPresetCycle();
  }

  function updateSoundUI() {
    const on = soundOn && hasStarted && audio && !audio.paused;
    if (playText) playText.textContent = on ? 'SOUND ON' : 'SOUND OFF';
    if (btnPlayPause) btnPlayPause.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (playerWidget) playerWidget.classList.toggle('sound-off', !on);
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = on ? 'playing' : 'paused';
  }

  function applySoundOutput() {
    if (gainNode && audioContext && !graphDeaf) {
      gainNode.gain.setTargetAtTime(soundOn ? 1 : 0, audioContext.currentTime, 0.04);
      if (audio) audio.muted = false; // muting the element would also starve the visualiser
    } else if (audio) {
      audio.muted = !soundOn;
    }
  }

  function setSound(on) {
    soundOn = on;
    applySoundOutput();
    updateSoundUI();
  }

  // once a second while streaming: does real signal reach the graph?
  function checkGraph() {
    if (!tapNode || graphHeard || graphDeaf || audio.paused || audio.currentTime < 1) return;
    tapNode.getFloatTimeDomainData(tapBuf);
    if (tapBuf.some(v => v !== 0)) { graphHeard = true; return; }
    if (++deafSecs >= 3) {
      graphDeaf = true;
      console.info('[sound] Web Audio gets no signal from the stream here (WebKit): muting the <audio> element instead');
      applySoundOutput();
    }
  }

  // the player's one control: mute / unmute the live stream (starting or rejoining it if needed)
  function toggleSound() {
    if (!hasStarted) { setSound(true); startExperience(); return; }
    if (audio.paused) { setSound(true); rejoinLive(); return; }
    setSound(!soundOn);
  }

  function listen(on) {
    if (on && hasStarted && audio.paused) rejoinLive();
    else if (on && !hasStarted) startExperience();
    setSound(on);
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

  if (btnPlayPause) btnPlayPause.addEventListener('click', toggleSound);

  // ─── 5. REAL-TIME BUTTERCHURN RENDER LOOP & PROGRESS ANIMATION ──────────
  let lastFrameTime = performance.now();
  function renderFrame() {
    const now = performance.now();
    const dt = Math.min((now - lastFrameTime) / 1000, 0.1);
    lastFrameTime = now;

    if (visualizer && visEnabled && (isPlaying || !hasStarted)) {
      try {
        visualizer.render();
      } catch (e) {
        // Suppress dropped frame warnings
      }
    }

    updateProgressUI(dt);

    requestAnimationFrame(renderFrame);
  }

  // ─── 6. VOLUME (no slider in v5: one SOUND ON/OFF toggle) ───────────────
  if (audio) {
    audio.volume = 1.0;
  }

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

  function updateMediaSession(title, artist, album, artUrl) {
    if (!('mediaSession' in navigator)) return;
    try {
      const artwork = [];
      if (artUrl) {
        artwork.push(
          { src: artUrl, sizes: '96x96', type: 'image/jpeg' },
          { src: artUrl, sizes: '128x128', type: 'image/jpeg' },
          { src: artUrl, sizes: '192x192', type: 'image/jpeg' },
          { src: artUrl, sizes: '256x256', type: 'image/jpeg' },
          { src: artUrl, sizes: '512x512', type: 'image/jpeg' }
        );
      }
      navigator.mediaSession.metadata = new MediaMetadata({
        title: title || 'DLXR Radio',
        artist: artist || 'IADT College Radio',
        album: album || 'AUTODJ 24/7',
        artwork: artwork
      });

      // Lock screen / headphone buttons say what they mean: never let "play" pause
      // lock screen / headphone buttons mute and unmute, same as the player (no pausing a radio)
      navigator.mediaSession.setActionHandler('play', () => listen(true));
      navigator.mediaSession.setActionHandler('pause', () => listen(false));
      navigator.mediaSession.setActionHandler('stop', () => listen(false));
    } catch (e) {
      console.warn('MediaSession error:', e);
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

      const showName = live?.is_live ? (live.streamer_name || 'LIVE BROADCAST').toUpperCase() : 'AUTODJ';
      if (playerStationTitle) playerStationTitle.textContent = showName;
      if (showsNow) showsNow.textContent = live?.is_live ? showName : 'AUTODJ 24/7';

      const byLine = s => (s && (s.title || s.text)) ? (s.artist ? `${s.title || s.text} by ${s.artist}` : (s.title || s.text)) : '';
      const nextText = byLine(data?.playing_next?.song);
      if (playerNextVal) playerNextVal.textContent = nextText;
      if (playerNextK) playerNextK.classList.toggle('hidden', !nextText);
      const beforeText = byLine(data?.song_history?.[0]?.song);
      if (trackBeforeVal) trackBeforeVal.textContent = beforeText ? `before: ${beforeText}` : '';

      // Listener count lives in the nav: ON AIR · 2 LISTENING
      const listenersCount = data?.listeners?.unique ?? data?.listeners?.current ?? data?.station?.mounts?.[0]?.listeners?.unique ?? data?.station?.mounts?.[0]?.listeners?.current ?? data?.listeners?.total ?? 0;
      if (onAirLabel && !reconnecting) {
        onAirLabel.textContent = `ON AIR · ${listenersCount} LISTENING`;
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

          setArt(song.art);
          updateMediaSession(title, artist, showName, song.art);
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
    if (mobileMq.matches) return; // phones: pages stay until you pick another tab
    if (!e.target.closest('.overlay-panel') && !e.target.closest('.nav-bar')) {
      closeAllOverlays();
    }
  });

  document.querySelectorAll('.overlay-panel .win-close').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllOverlays();
    });
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
      // phones: don't throw the keyboard up just for opening the page
      if (chatMsgInput && !mobileMq.matches) setTimeout(() => chatMsgInput.focus(), 50);
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
      if (mobileMq.matches) showPage(mPrevPage);
      else closeFloatingWindow('bug');
    });
  }

  if (btnToggleBug) {
    btnToggleBug.addEventListener('click', (e) => {
      e.stopPropagation();
      // phones: BUG is a page from the header icon, it marks no tab
      if (mobileMq.matches) { showPage(mPage === 'bug' ? mPrevPage : 'bug'); return; }
      closeAllOverlays();
      toggleFloatingWindow('bug');
    });
  }

  // ─── Bug report form submit ──────────────────────────────────────────────
  if (bugReportForm) {
    bugReportForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const category = bugReportForm.querySelector('input[name="bug-category"]:checked')?.value || 'General';
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

  function setupFloatingWindow(winEl, storageKey, minW = 320, minH = 340) {
    if (!winEl) return;
    const bar = winEl.querySelector('.float-bar');
    if (!bar) return;

    // Create corner resizer handle if not present
    let resizer = winEl.querySelector('.float-resizer');
    if (!resizer) {
      resizer = document.createElement('div');
      resizer.className = 'float-resizer';
      resizer.title = 'Drag to resize window';
      resizer.setAttribute('aria-label', 'Resize window');
      winEl.appendChild(resizer);
    }

    // Restore saved size if available
    if (storageKey && window.innerWidth > 640) {
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey));
        if (saved && saved.w && saved.h) {
          winEl.style.width = `${Math.max(minW, Math.min(saved.w, window.innerWidth - 30))}px`;
          winEl.style.height = `${Math.max(minH, Math.min(saved.h, window.innerHeight - 60))}px`;
        }
      } catch (e) {}
    }

    let isDragging = false;
    let isResizing = false;
    let startX = 0, startY = 0;
    let initialLeft = 0, initialTop = 0;
    let initialWidth = 0, initialHeight = 0;

    winEl.addEventListener('mousedown', () => bringToFront(winEl));

    // Drag move via Title Bar
    bar.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return;
      if (window.innerWidth <= 640) return; // Fixed bottom-sheet on mobile
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      initialLeft = winEl.offsetLeft;
      initialTop = winEl.offsetTop;
      bringToFront(winEl);
      e.preventDefault();
    });

    // Resize via Corner Grip
    resizer.addEventListener('mousedown', (e) => {
      if (window.innerWidth <= 640) return;
      isResizing = true;
      startX = e.clientX;
      startY = e.clientY;
      initialWidth = winEl.offsetWidth;
      initialHeight = winEl.offsetHeight;
      winEl.classList.add('is-resizing');
      bringToFront(winEl);
      e.preventDefault();
      e.stopPropagation();
    });

    // Touch support for resizing
    resizer.addEventListener('touchstart', (e) => {
      if (window.innerWidth <= 640) return;
      if (e.touches.length === 1) {
        isResizing = true;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        initialWidth = winEl.offsetWidth;
        initialHeight = winEl.offsetHeight;
        winEl.classList.add('is-resizing');
        bringToFront(winEl);
        e.stopPropagation();
      }
    }, { passive: true });

    window.addEventListener('mousemove', (e) => {
      if (isDragging) {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const maxLeft = window.innerWidth - 60;
        const maxTop = window.innerHeight - 40;
        winEl.style.left = `${Math.max(10, Math.min(maxLeft, initialLeft + dx))}px`;
        winEl.style.top = `${Math.max(10, Math.min(maxTop, initialTop + dy))}px`;
      } else if (isResizing) {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const maxW = Math.min(800, window.innerWidth - winEl.offsetLeft - 10);
        const maxH = Math.min(800, window.innerHeight - winEl.offsetTop - 10);

        const newW = Math.max(minW, Math.min(maxW, initialWidth + dx));
        const newH = Math.max(minH, Math.min(maxH, initialHeight + dy));

        winEl.style.width = `${newW}px`;
        winEl.style.height = `${newH}px`;
      }
    });

    window.addEventListener('touchmove', (e) => {
      if (isResizing && e.touches.length === 1) {
        const dx = e.touches[0].clientX - startX;
        const dy = e.touches[0].clientY - startY;
        const maxW = Math.min(800, window.innerWidth - winEl.offsetLeft - 10);
        const maxH = Math.min(800, window.innerHeight - winEl.offsetTop - 10);

        const newW = Math.max(minW, Math.min(maxW, initialWidth + dx));
        const newH = Math.max(minH, Math.min(maxH, initialHeight + dy));

        winEl.style.width = `${newW}px`;
        winEl.style.height = `${newH}px`;
      }
    }, { passive: true });

    window.addEventListener('mouseup', () => {
      if (isResizing && storageKey) {
        try {
          localStorage.setItem(storageKey, JSON.stringify({
            w: winEl.offsetWidth,
            h: winEl.offsetHeight
          }));
        } catch (e) {}
      }
      isDragging = false;
      isResizing = false;
      winEl.classList.remove('is-resizing');
    });

    window.addEventListener('touchend', () => {
      if (isResizing && storageKey) {
        try {
          localStorage.setItem(storageKey, JSON.stringify({
            w: winEl.offsetWidth,
            h: winEl.offsetHeight
          }));
        } catch (e) {}
      }
      isDragging = false;
      isResizing = false;
      winEl.classList.remove('is-resizing');
    });
  }

  setupFloatingWindow(winVideo, 'dlxr_video_win_size', 360, 260);
  setupFloatingWindow(winChat, 'dlxr_chat_win_size', 360, 230);
  setupFloatingWindow(winBug, 'dlxr_bug_win_size', 360, 300);

  // ─── 10. REAL-TIME CHAT ENGINE ───────────────────────────────────────────
  let chatSocket = null;
  let chatReconnectTimeout = null;
  let chatHeartbeatTimer = null;
  const renderedMessageIds = new Set();
  let chatMyHandle = '';
  let chatMyColor = '';
  let chatSessionId = '';
  try {
    chatMyHandle = localStorage.getItem('dlxr_chat_nick') || '';
    // Drop old auto-assigned anon_123 handles: listeners now pick their own
    if (/^anon(_\d+)?$/i.test(chatMyHandle)) {
      chatMyHandle = '';
      localStorage.removeItem('dlxr_chat_nick');
    }
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
    { name: 'Sage Green',     hex: '#6DA871' },
    { name: 'Slate Teal',     hex: '#66999E' },
    { name: 'Cobalt Blue',    hex: '#3B82F6' },
    { name: 'Lavender Mist',  hex: '#8F72D5' },
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
    if (msg.id && renderedMessageIds.has(msg.id)) {
      return;
    }
    if (msg.id) {
      renderedMessageIds.add(msg.id);
    }
    
    // Check if user was near the bottom before appending
    const isNearBottom = chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight < 60;

    const row = document.createElement('div');
    row.className = 'chat-msg-row';
    if (msg.id) row.setAttribute('data-id', msg.id);

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

  function setChatStatus(status, connected = true) {
    if (chatStatusTxt) chatStatusTxt.textContent = status;
    if (chatStatusPill) {
      chatStatusPill.classList.toggle('disconnected', !connected);
    }
  }

  function startChatHeartbeat() {
    stopChatHeartbeat();
    chatHeartbeatTimer = setInterval(() => {
      if (chatSocket && chatSocket.readyState === WebSocket.OPEN) {
        chatSocket.send(JSON.stringify({ type: 'ping' }));
      }
    }, 25000);
  }

  function stopChatHeartbeat() {
    if (chatHeartbeatTimer) {
      clearInterval(chatHeartbeatTimer);
      chatHeartbeatTimer = null;
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
      startChatHeartbeat();

      if (chatMyHandle) {
        chatSocket.send(JSON.stringify({
          type: 'set_handle',
          handle: chatMyHandle,
          color: chatMyColor || undefined,
          sessionId: chatSessionId
        }));
      }

      // Re-auth a DJ session (the key never travels in a URL: it ends up in logs)
      try {
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

        if (data.type === 'pong') {
          return;
        }

        if (data.type === 'init') {
          if (chatMyHandle) {
            // Re-announce custom nickname to ensure server sync
            chatSocket.send(JSON.stringify({
              type: 'set_handle',
              handle: chatMyHandle,
              color: chatMyColor || undefined,
              sessionId: chatSessionId
            }));
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
          // Populate/merge history if present without wiping existing elements
          if (Array.isArray(data.history) && data.history.length > 0) {
            data.history.forEach(appendChatMessage);
            scrollChatToBottom();
          }
        } else if (data.type === 'presence') {
          if (chatOnlineCount && data.online !== undefined) {
            chatOnlineCount.textContent = `${data.online} online`;
          }
        } else if (data.type === 'handle_updated') {
          chatMyHandle = data.handle;
          if (chatNickInput) {
            chatNickInput.value = chatMyHandle;
            chatNickInput.classList.remove('needs-handle');
          }
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
          renderedMessageIds.clear();
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
        } else if (data.type === 'error' && data.code === 'handle_required') {
          showHandleRequired();
        } else if (data.type === 'error') {
          appendChatSystemMessage(`[!] ${data.message || 'Error sending message'}`);
        }
      } catch (err) {
        console.error('Chat payload parse error:', err);
      }
    };

    chatSocket.onclose = () => {
      stopChatHeartbeat();
      setChatStatus('OFFLINE', false);
      scheduleChatReconnect();
    };

    chatSocket.onerror = (err) => {
      console.warn('Chat socket error:', err);
      stopChatHeartbeat();
      setChatStatus('ERROR', false);
    };
  }

  function scheduleChatReconnect() {
    if (chatReconnectTimeout) clearTimeout(chatReconnectTimeout);
    chatReconnectTimeout = setTimeout(() => {
      initChatSocket();
    }, 2000 + Math.random() * 3000); // jitter: after a restart, don't have every listener reconnect in the same instant
  }

  // No handle yet: turn the handle box red and flash a notice over the chat window
  const chatHandleNotice = document.getElementById('chat-handle-notice');
  let chatHandleNoticeTimer = null;
  function showHandleRequired() {
    if (chatNickInput) chatNickInput.classList.add('needs-handle');
    if (!chatHandleNotice) return;
    chatHandleNotice.classList.add('show');
    clearTimeout(chatHandleNoticeTimer);
    chatHandleNoticeTimer = setTimeout(() => chatHandleNotice.classList.remove('show'), 1800);
  }

  // Handle Nickname updates
  if (chatNickInput) {
    const updateNick = () => {
      const val = chatNickInput.value.trim().replace(/[^a-zA-Z0-9_\-\.]/g, '');
      if (val && val !== chatMyHandle && val.length <= 18) {
        chatMyHandle = val;
        chatNickInput.classList.remove('needs-handle');
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

  // Chat message input auto-resize & submit
  if (chatMsgInput) {
    const adjustInputHeight = () => {
      chatMsgInput.style.height = 'auto';
      const lineH = parseFloat(getComputedStyle(chatMsgInput).lineHeight) || 17;
      const newH = Math.min(85, Math.max(lineH, chatMsgInput.scrollHeight));
      chatMsgInput.style.height = `${newH}px`;
    };
    chatMsgInput.addEventListener('input', () => {
      adjustInputHeight();
      if (!chatMyHandle) showHandleRequired();
    });

    // Enter always submits message immediately
    chatMsgInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (chatForm.requestSubmit) {
          chatForm.requestSubmit();
        } else {
          chatForm.dispatchEvent(new Event('submit', { cancelable: true }));
        }
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
        renderedMessageIds.clear();
        chatMessages.innerHTML = '<div class="chat-system-msg">// CHAT VIEW CLEARED.</div>';
        chatMsgInput.value = '';
        chatMsgInput.style.height = 'auto';
        return;
      }

      if (!chatMyHandle) {
        showHandleRequired();
        return;
      }

      // Check if user is authenticating as DJ via command
      if (text.startsWith('/')) {
        const parts = text.slice(1).trim().split(/\s+/);
        const cmd = parts[0].toLowerCase();
        const args = parts.slice(1).join(' ');
        if ((cmd === 'auth' || cmd === 'dj' || cmd === 'login' || cmd === 'pass') && args) {
          try { sessionStorage.setItem('dlxr_dj_key', args); } catch (e) {}
        }
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
      chatMsgInput.style.height = 'auto';
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

  // ─── STREAM WATCHDOG ────────────────────────────────────────────────────
  // A dying live stream often just stalls without firing 'error', which left
  // listeners on silence until they refreshed. Reconnect on error/ended or when
  // the playhead stops moving; a unique URL forces a fresh connection.
  const STALL_MS = 6000;
  const CONNECT_MS = 20000; // a new connection on slow mobile data can take >6s to start
  let lastPlayhead = 0;
  let lastProgressAt = Date.now();
  let reconnectTimer = null;
  let reconnectAttempt = 0;
  let reconnecting = false;

  function scheduleReconnect(reason) {
    if (!isPlaying || reconnectTimer) return;
    reconnecting = true;
    if (onAirLabel) onAirLabel.textContent = 'ON AIR · RECONNECTING…';
    // 1s, 2s, 4s, 8s, 10s… plus up to 2s jitter, so a restart doesn't bring everyone back in the same instant
    const delay = Math.min(10000, 1000 * 2 ** reconnectAttempt++) + Math.random() * 2000;
    console.warn(`[stream] ${reason} → reconnecting in ${delay}ms`);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (!isPlaying) { reconnecting = false; return; }
      connectFresh();
    }, delay);
  }

  // The only place a new connection is opened. Silence the old one first and
  // drop any pending timer, so a stale stream can never play beside the new one.
  function connectFresh() {
    clearTimeout(reconnectTimer); reconnectTimer = null;
    audio.pause();
    audio.src = `/stream?r=${Date.now()}`;
    lastProgressAt = Date.now();
    audio.play().catch(e => { if (e.name !== 'AbortError') scheduleReconnect('play() failed: ' + e.name); });
  }

  if (audio) {
    audio.addEventListener('error', () => scheduleReconnect('error'));
    audio.addEventListener('ended', () => scheduleReconnect('stream ended'));
    audio.addEventListener('playing', () => { reconnectAttempt = 0; reconnecting = false; lastProgressAt = Date.now(); });
    audio.addEventListener('play', updateSoundUI);
    audio.addEventListener('pause', updateSoundUI);
    setInterval(() => {
      checkGraph();
      if (!isPlaying || audio.paused || reconnectTimer || audio.currentTime !== lastPlayhead) {
        lastPlayhead = audio.currentTime; lastProgressAt = Date.now(); return;
      }
      if (Date.now() - lastProgressAt > (reconnecting ? CONNECT_MS : STALL_MS)) scheduleReconnect('stalled');
    }, 1000);
  }

  window.addEventListener('resize', resizeVisualizer);
  window.addEventListener('load', () => {
    loadPresets();
    resizeVisualizer();
  });

  // ─── 12. STARTUP: the START RADIO ticks fly to the player's corners ─────
  const flyTicks = document.getElementById('fly-ticks');
  function playStartupTransition() {
    document.body.classList.add('started');
    if (reduceMotion || !flyTicks || !startupBtn) return; // reduced motion: the veil just fades (CSS)
    // where the ticks start (pulled in 3px) and where they land (the player's corner ticks)
    const b = startupBtn.getBoundingClientRect();
    const from = { l: b.left - 2, t: b.top - 2, r: b.right + 2, b: b.bottom + 2, size: 12 };
    let to;
    if (mobileMq.matches) {
      const art = document.getElementById('album-art-box');
      const a = art.getBoundingClientRect(); // the player doesn't slide on phones (no transform yet)
      to = { l: a.left - 8, t: a.top - 8, r: a.right + 8, b: a.bottom + 8, size: 12 };
    } else {
      // offsets ignore the player's fade-in slide, so this is where it comes to rest
      const w = playerWidget;
      to = { l: w.offsetLeft - 4, t: w.offsetTop - 4, r: w.offsetLeft + w.offsetWidth + 4, b: w.offsetTop + w.offsetHeight + 4, size: 10 };
    }
    const corners = { tl: ['l', 't'], tr: ['r', 't'], bl: ['l', 'b'], br: ['r', 'b'] };
    const at = (box, [x, y]) => [x === 'l' ? box.l : box.r - box.size, y === 't' ? box.t : box.b - box.size];
    document.body.classList.add('ticks-landing');
    flyTicks.classList.add('is-flying');
    const anims = [...flyTicks.children].map(el => {
      const c = corners[el.className];
      const [x0, y0] = at(from, c), [x1, y1] = at(to, c);
      const s1 = to.size / 12;
      return el.animate([
        { transform: `translate(${x0}px, ${y0}px)` },
        { transform: `translate(${x0}px, ${y0}px)`, offset: 0.12 },
        { transform: `translate(${x1}px, ${y1}px) scale(${s1})` }
      ], { duration: 820, easing: 'cubic-bezier(.55,0,.2,1)', fill: 'forwards' });
    });
    Promise.all(anims.map(a => a.finished)).then(() => {
      document.body.classList.remove('ticks-landing');
      flyTicks.classList.remove('is-flying');
      anims.forEach(a => a.cancel());
    }).catch(() => {});
  }

  // ─── 13. MISSING ART: the boombox ────────────────────────────────────────
  const artBox = document.getElementById('album-art-box');

  // no cover, a URL that fails, or before the first track → the boombox
  function setArt(url) {
    if (!albumArtImg || !artBox) return;
    if (!url) { artBox.classList.add('no-art'); albumArtImg.removeAttribute('src'); return; }
    albumArtImg.onload = () => artBox.classList.remove('no-art');
    albumArtImg.onerror = () => artBox.classList.add('no-art');
    albumArtImg.src = url;
  }

  if (startupBtn) {
    startupBtn.addEventListener('pointerdown', () => startupBtn.classList.add('is-pressed'));
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev =>
      startupBtn.addEventListener(ev, () => startupBtn.classList.remove('is-pressed')));
  }

  // ─── 14. PHONES: pages + bottom tabs ──────────────────────────────────────
  const tabButtons = document.querySelectorAll('#m-tabs [data-tab]');
  let mPage = 'listen', mPrevPage = 'listen';

  function showPage(p) {
    if (p !== 'bug') mPrevPage = p;
    mPage = p;
    document.body.dataset.page = p;
    tabButtons.forEach(b => {
      const on = b.dataset.tab === p;
      b.classList.toggle('is-active', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    if (overlayAbout) overlayAbout.classList.toggle('hidden', p !== 'about');
    if (overlayShows) overlayShows.classList.toggle('hidden', p !== 'shows');
    ['video', 'chat', 'bug'].forEach(n => (p === n ? openFloatingWindow(n) : closeFloatingWindow(n)));
  }

  tabButtons.forEach(b => b.addEventListener('click', (e) => {
    e.stopPropagation();
    showPage(b.dataset.tab);
  }));

  function applyLayoutMode() {
    if (mobileMq.matches) {
      showPage('listen');
    } else {
      delete document.body.dataset.page;
      closeAllOverlays();
      ['video', 'chat', 'bug'].forEach(closeFloatingWindow);
    }
  }
  mobileMq.addEventListener('change', applyLayoutMode);

  // ─── INITIALIZATION ON BOOT ──────────────────────────────────────────────
  if (mobileMq.matches) showPage('listen');
  if (desktopMq.matches) loadButterchurn();
  desktopMq.addEventListener('change', e => { if (e.matches) loadButterchurn(); });
  applySkin(currentSkin);
  loadPresets();
  resizeVisualizer();
  startNowPlayingPolling();
  initChatSocket();
  renderFrame();

})();
