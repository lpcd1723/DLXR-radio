(function () {
  let visualizer = null;
  let audioContext = null;
  let sourceNode = null;
  let isPlaying = false;
  let presets = {};
  let presetKeys = [];
  let presetIndex = 0;
  let presetCycleTimer = null;
  let nowPlayingTimer = null;
  let currentSongText = '';

  const canvas = document.getElementById('visualizer-canvas');
  const audio = document.getElementById('radio-audio');
  const playOverlay = document.getElementById('play-overlay');
  const playButton = document.getElementById('play-button');
  const nowPlayingContainer = document.getElementById('now-playing-container');
  const trackArtImg = document.getElementById('track-art-img');
  const trackTitleEl = document.getElementById('track-title');
  const trackArtistEl = document.getElementById('track-artist');

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

  function initPresets() {
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
      console.error('Error loading presets:', err);
    }
  }

  function resizeCanvas() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
    if (visualizer) {
      try {
        visualizer.setRendererSize(width, height);
      } catch (e) {
        console.warn('Resize error:', e);
      }
    }
  }

  function nextPreset(blendSec = 2.5) {
    if (!visualizer || presetKeys.length === 0) return;
    presetIndex = (presetIndex + Math.floor(Math.random() * (presetKeys.length - 1)) + 1) % presetKeys.length;
    const presetName = presetKeys[presetIndex];
    const preset = presets[presetName];
    if (preset) {
      try {
        visualizer.loadPreset(preset, blendSec);
      } catch (err) {
        console.warn('Failed to load preset:', presetName, err);
      }
    }
  }

  function startPresetCycle() {
    if (presetCycleTimer) clearInterval(presetCycleTimer);
    presetCycleTimer = setInterval(() => {
      nextPreset(2.5);
    }, 18000);
  }

  function renderLoop() {
    if (visualizer && isPlaying) {
      try {
        visualizer.render();
      } catch (err) {
        console.error('Render error:', err);
      }
    }
    requestAnimationFrame(renderLoop);
  }

  async function updateNowPlaying() {
    try {
      const res = await fetch('/api/nowplaying');
      if (!res.ok) return;
      const data = await res.json();
      
      const song = data?.now_playing?.song;
      if (song) {
        const title = song.title || song.text || 'IADT Radio';
        const artist = song.artist || (song.title ? 'IADT Radio' : '');
        const fullIdentifier = `${artist} - ${title}`;

        if (fullIdentifier !== currentSongText) {
          currentSongText = fullIdentifier;
          trackTitleEl.textContent = title;
          trackArtistEl.textContent = artist || 'IADT Radio';

          if (song.art) {
            trackArtImg.src = song.art;
          }
        }
      }
    } catch (err) {
      console.warn('Now playing fetch error:', err);
    }
  }

  function startNowPlayingPolling() {
    updateNowPlaying();
    if (nowPlayingTimer) clearInterval(nowPlayingTimer);
    nowPlayingTimer = setInterval(updateNowPlaying, 3500);
  }

  async function startExperience() {
    if (isPlaying) return;

    playOverlay.classList.add('hidden');
    nowPlayingContainer.classList.remove('now-playing-hidden');

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!audioContext) {
        audioContext = new AudioCtx();
      }
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

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
        } catch (vizErr) {
          console.error('Butterchurn init error:', vizErr);
        }
      }

      if (!sourceNode) {
        sourceNode = audioContext.createMediaElementSource(audio);
        sourceNode.connect(audioContext.destination);

        if (visualizer) {
          visualizer.connectAudio(sourceNode);
        }
      }

      await audio.play();
      isPlaying = true;

      startPresetCycle();
      startNowPlayingPolling();
      renderLoop();

    } catch (err) {
      console.error('Playback error:', err);
      isPlaying = true;
      startNowPlayingPolling();
    }
  }

  playButton.addEventListener('click', (e) => {
    e.stopPropagation();
    startExperience();
  });
  playOverlay.addEventListener('click', startExperience);

  window.addEventListener('resize', resizeCanvas);

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      nextPreset(1.5);
    } else if (e.key === 'f' || e.key === 'F') {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    }
  });

  canvas.addEventListener('click', () => {
    if (isPlaying) {
      nextPreset(1.5);
    }
  });

  audio.addEventListener('error', () => {
    console.warn('Audio stream error, retrying...');
    setTimeout(() => {
      audio.load();
      if (isPlaying) audio.play().catch(() => {});
    }, 2000);
  });

  initPresets();
  resizeCanvas();
  updateNowPlaying();
})();
