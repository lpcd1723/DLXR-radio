// ─── DLXR ADMIN COCKPIT JS ───────────────────────────────────────

(function() {
  'use strict';

  let adminPasskey = sessionStorage.getItem('dlxr_admin_passkey') || '';
  let refreshTimer = null;
  let allReports = [];

  // DOM Elements
  const loginOverlay = document.getElementById('admin-login-overlay');
  const loginForm = document.getElementById('admin-login-form');
  const passkeyInput = document.getElementById('admin-passkey');
  const loginError = document.getElementById('login-error');
  const adminApp = document.getElementById('admin-app');
  const adminClock = document.getElementById('admin-clock');
  const btnLogout = document.getElementById('btn-logout');

  // Stats Elements
  const statListeners = document.getElementById('stat-listeners');
  const statChatOnline = document.getElementById('stat-chat-online');
  const statChatRosterCount = document.getElementById('stat-chat-roster-count');
  const statUptime = document.getElementById('stat-uptime');
  const statMemory = document.getElementById('stat-memory');
  const statHeap = document.getElementById('stat-heap');
  const detailStation = document.getElementById('detail-station');
  const detailNowPlaying = document.getElementById('detail-nowplaying');
  const detailArtist = document.getElementById('detail-artist');
  const detailShow = document.getElementById('detail-show');

  // Reports Elements
  const reportsTbody = document.getElementById('reports-tbody');
  const reportsCountBadge = document.getElementById('reports-count-badge');
  const reportSearchInput = document.getElementById('report-search-input');
  const reportCategoryFilter = document.getElementById('report-category-filter');
  const btnRefreshReports = document.getElementById('btn-refresh-reports');

  // Chat Elements
  const adminChatPreview = document.getElementById('admin-chat-preview');
  const adminRosterGrid = document.getElementById('admin-roster-grid');
  const adminMutesList = document.getElementById('admin-mutes-list');
  const muteForm = document.getElementById('mute-form');
  const muteTargetHandle = document.getElementById('mute-target-handle');
  const muteDuration = document.getElementById('mute-duration');
  const btnAdminClearChat = document.getElementById('btn-admin-clearchat');
  const btnRefreshStats = document.getElementById('btn-refresh-stats');

  // Clock
  function updateClock() {
    const now = new Date();
    if (adminClock) {
      adminClock.textContent = now.toUTCString().slice(17, 25) + ' UTC';
    }
  }
  setInterval(updateClock, 1000);
  updateClock();

  // Tab switching
  const tabs = document.querySelectorAll('.nav-tab');
  const tabPanes = document.querySelectorAll('.admin-tab-pane');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetId = tab.getAttribute('data-tab');
      tabs.forEach(t => t.classList.remove('is-active'));
      tabPanes.forEach(p => p.classList.remove('is-active'));

      tab.classList.add('is-active');
      const pane = document.getElementById(targetId);
      if (pane) pane.classList.add('is-active');

      if (targetId === 'tab-reports') fetchReports();
      if (targetId === 'tab-chat') fetchStats();
    });
  });

  // Check initial login state
  if (adminPasskey) {
    authenticate(adminPasskey, false);
  }

  // Handle Login Form
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const pass = passkeyInput.value.trim();
      if (!pass) return;
      await authenticate(pass, true);
    });
  }

  async function authenticate(pass, showError = true) {
    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: pass })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        adminPasskey = pass;
        sessionStorage.setItem('dlxr_admin_passkey', pass);
        loginOverlay.classList.add('hidden');
        adminApp.classList.remove('hidden');
        startTelemetryPolling();
        fetchReports();
      } else {
        if (showError && loginError) {
          loginError.textContent = data.error || 'Invalid passkey';
          loginError.classList.remove('hidden');
        }
      }
    } catch (err) {
      if (showError && loginError) {
        loginError.textContent = 'Failed to connect to backend';
        loginError.classList.remove('hidden');
      }
    }
  }

  // Handle Logout
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      sessionStorage.removeItem('dlxr_admin_passkey');
      adminPasskey = '';
      if (refreshTimer) clearInterval(refreshTimer);
      loginOverlay.classList.remove('hidden');
      adminApp.classList.add('hidden');
    });
  }

  function startTelemetryPolling() {
    fetchStats();
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(fetchStats, 5000);
  }

  // Fetch telemetry & chat stats
  async function fetchStats() {
    if (!adminPasskey) return;
    try {
      const res = await fetch('/api/admin/stats', {
        headers: { 'x-admin-key': adminPasskey }
      });
      if (res.status === 401) {
        btnLogout.click();
        return;
      }
      const data = await res.json();

      // Update Overview stats
      if (statListeners) statListeners.textContent = data.telemetry?.listeners ?? '--';
      if (statChatOnline) statChatOnline.textContent = data.chat?.onlineCount ?? '--';
      if (statChatRosterCount) statChatRosterCount.textContent = `${data.chat?.roster?.length || 0} active handles`;
      if (statUptime) statUptime.textContent = formatUptime(data.server?.uptimeSeconds || 0);
      if (statMemory) statMemory.textContent = `${data.server?.memory?.rssMb || '--'} MB`;
      if (statHeap) statHeap.textContent = `Heap: ${data.server?.memory?.heapUsedMb || '--'} MB`;

      // Update Station Details
      if (detailStation) detailStation.textContent = data.station?.shortcode || 'iadt_radio';
      if (detailNowPlaying) detailNowPlaying.textContent = data.nowPlaying?.title || 'Unknown';
      if (detailArtist) detailArtist.textContent = data.nowPlaying?.artist || 'Unknown';
      if (detailShow) detailShow.textContent = data.nowPlaying?.show || 'AUTODJ 24/7';

      // Update Chat moderation pane
      renderChatPreview(data.chat?.history || []);
      renderRoster(data.chat?.roster || []);
      renderMutes(data.chat?.activeMutes || []);

    } catch (err) {
      console.warn('Telemetry fetch failed:', err);
    }
  }

  function formatUptime(seconds) {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    return `${m}m ${s}s`;
  }

  // Fetch Bug Reports
  async function fetchReports() {
    if (!adminPasskey) return;
    try {
      const res = await fetch('/api/admin/reports', {
        headers: { 'x-admin-key': adminPasskey }
      });
      if (res.status === 401) return;
      const data = await res.json();
      allReports = Array.isArray(data.reports) ? data.reports : [];
      if (reportsCountBadge) reportsCountBadge.textContent = String(allReports.length);
      renderReports();
    } catch (err) {
      console.warn('Reports fetch failed:', err);
    }
  }

  function renderReports() {
    if (!reportsTbody) return;
    const query = (reportSearchInput?.value || '').toLowerCase();
    const cat = reportCategoryFilter?.value || 'ALL';

    const filtered = allReports.filter(r => {
      const matchCat = cat === 'ALL' || r.category === cat;
      const matchQuery = !query || 
        (r.description || '').toLowerCase().includes(query) ||
        (r.category || '').toLowerCase().includes(query) ||
        (r.ip || '').toLowerCase().includes(query);
      return matchCat && matchQuery;
    });

    if (filtered.length === 0) {
      reportsTbody.innerHTML = `<tr><td colspan="5" class="table-empty">No bug reports match your filter.</td></tr>`;
      return;
    }

    reportsTbody.innerHTML = '';
    filtered.forEach(r => {
      const tr = document.createElement('tr');
      
      const catClass = (r.category || '').toLowerCase().replace(/[^a-z]/g, '');
      const timeStr = r.timestamp ? new Date(r.timestamp).toISOString().replace('T', ' ').slice(0, 19) : '--';
      
      // Parse basic device info from user-agent
      let device = 'Desktop';
      const ua = r.userAgent || '';
      if (/Mobile|Android|iPhone/i.test(ua)) device = 'Mobile';
      if (/Macintosh/i.test(ua)) device += ' / macOS';
      else if (/Windows/i.test(ua)) device += ' / Windows';
      else if (/Linux/i.test(ua)) device += ' / Linux';
      else if (/iPhone|iPad/i.test(ua)) device += ' / iOS';

      tr.innerHTML = `
        <td style="font-variant-numeric: tabular-nums; white-space: nowrap; color: var(--text-dim);">${timeStr}</td>
        <td><span class="category-tag ${catClass}">${escapeHtml(r.category || 'Other')}</span></td>
        <td style="word-break: break-word; font-weight: 500;">${escapeHtml(r.description || '')}</td>
        <td style="color: var(--text-dim); font-size: 10px;">${escapeHtml(device)}</td>
        <td><span class="category-tag" style="background: rgba(255,255,255,0.06); color: var(--text-dim); border-color: var(--border);">RECEIVED</span></td>
      `;
      reportsTbody.appendChild(tr);
    });
  }

  if (reportSearchInput) reportSearchInput.addEventListener('input', renderReports);
  if (reportCategoryFilter) reportCategoryFilter.addEventListener('change', renderReports);
  if (btnRefreshReports) btnRefreshReports.addEventListener('click', fetchReports);
  if (btnRefreshStats) btnRefreshStats.addEventListener('click', fetchStats);

  // Render Chat Messages Preview
  function renderChatPreview(history) {
    if (!adminChatPreview) return;
    adminChatPreview.innerHTML = '';
    if (!history || history.length === 0) {
      adminChatPreview.innerHTML = '<div class="table-empty">No recent chat messages</div>';
      return;
    }

    history.forEach(msg => {
      const row = document.createElement('div');
      row.className = 'admin-chat-row';

      const time = document.createElement('span');
      time.className = 'admin-chat-time';
      time.textContent = msg.timestamp ? `[${new Date(msg.timestamp).toISOString().slice(11, 16)}]` : '[--:--]';

      const user = document.createElement('span');
      user.className = 'admin-chat-user';
      user.textContent = (msg.isDJ ? `[${msg.badge || 'ADMIN'}] ` : '') + (msg.user || 'anon') + ':';
      if (msg.userColor) user.style.color = msg.userColor;

      const text = document.createElement('span');
      text.className = 'admin-chat-text';
      text.textContent = msg.text || '';

      row.appendChild(time);
      row.appendChild(user);
      row.appendChild(text);
      adminChatPreview.appendChild(row);
    });

    adminChatPreview.scrollTop = adminChatPreview.scrollHeight;
  }

  // Render Online Roster
  function renderRoster(roster) {
    if (!adminRosterGrid) return;
    adminRosterGrid.innerHTML = '';
    if (!roster || roster.length === 0) {
      adminRosterGrid.innerHTML = '<div class="table-empty">No active chat sessions</div>';
      return;
    }

    roster.forEach(u => {
      const badge = document.createElement('div');
      badge.className = 'roster-badge';

      const dot = document.createElement('span');
      dot.className = 'status-pip';
      dot.style.background = u.color || '#00cc55';

      const handle = document.createElement('span');
      handle.textContent = (u.isDJ ? `[${u.badge || 'ADMIN'}] ` : '') + u.handle;
      if (u.color) handle.style.color = u.color;

      badge.appendChild(dot);
      badge.appendChild(handle);
      adminRosterGrid.appendChild(badge);
    });
  }

  // Render Mutes
  function renderMutes(mutes) {
    if (!adminMutesList) return;
    adminMutesList.innerHTML = '';
    if (!mutes || mutes.length === 0) {
      adminMutesList.innerHTML = '<div class="table-empty">No users currently muted</div>';
      return;
    }

    mutes.forEach(m => {
      const item = document.createElement('div');
      item.className = 'mute-item';
      item.innerHTML = `
        <span><strong>@${escapeHtml(m.handle)}</strong> (Muted for ${m.remainingMinutes} more mins)</span>
        <button class="admin-btn small-btn" data-unmute="${escapeHtml(m.handle)}">UNMUTE</button>
      `;
      adminMutesList.appendChild(item);
    });

    adminMutesList.querySelectorAll('[data-unmute]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const handle = btn.getAttribute('data-unmute');
        await unmuteUser(handle);
      });
    });
  }

  // Mute action
  if (muteForm) {
    muteForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const handle = muteTargetHandle.value.trim().replace(/^@/, '');
      const mins = parseInt(muteDuration.value, 10) || 5;
      if (!handle) return;

      try {
        const res = await fetch('/api/admin/chat/mute', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-key': adminPasskey
          },
          body: JSON.stringify({ handle, minutes: mins })
        });
        if (res.ok) {
          muteTargetHandle.value = '';
          fetchStats();
        }
      } catch (err) {
        alert('Failed to mute user');
      }
    });
  }

  async function unmuteUser(handle) {
    try {
      const res = await fetch('/api/admin/chat/unmute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminPasskey
        },
        body: JSON.stringify({ handle })
      });
      if (res.ok) {
        fetchStats();
      }
    } catch (err) {
      alert('Failed to unmute user');
    }
  }

  // Clear chat action
  if (btnAdminClearChat) {
    btnAdminClearChat.addEventListener('click', async () => {
      if (!confirm('Are you sure you want to wipe chat history for all listening clients?')) return;
      try {
        const res = await fetch('/api/admin/chat/clear', {
          method: 'POST',
          headers: { 'x-admin-key': adminPasskey }
        });
        if (res.ok) {
          fetchStats();
        }
      } catch (err) {
        alert('Failed to clear chat');
      }
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

})();
