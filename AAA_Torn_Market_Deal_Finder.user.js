// ==UserScript==
// @name         AAA - Torn Market Deal Finder
// @namespace    http://tampermonkey.net/
// @version      2.3
// @description  Torn market/bazaar deal scanner with draggable expandable toolbar, NPC-profit targets, and visible listing highlights.
// @match        https://www.torn.com/*
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const KEY = 'aaa_market_deal_api_key_v1';
  const CACHE = 'aaa_market_deal_npc_cache_v1';
  const POS = 'aaa_market_deal_toolbar_position_v1';
  const STYLE_ID = 'aaa-market-deal-finder-style';
  const PANEL_ID = 'aaa-market-deal-finder';

  const state = { open: false, scanning: false, results: [], dragged: false };

  const builtInTargets = [
    { id: '180', name: 'Bottle of Beer' },
    { id: '206', name: 'Xanax' },
    { id: '897', name: 'Bottle Cap' }
  ];

  const money = n => '$' + Number(n || 0).toLocaleString('en-US');

  function addStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
      #${PANEL_ID}{position:fixed;right:18px;bottom:18px;width:330px;z-index:2147483647;font:13px Arial,sans-serif;color:#fff;background:#1f1f1f;border:1px solid #ffc247;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.5);overflow:hidden}
      #${PANEL_ID} .aaa-head{display:flex;align-items:center;gap:8px;padding:9px 10px;background:#111;border-bottom:1px solid #444;cursor:move;user-select:none;touch-action:none}
      #${PANEL_ID} .aaa-head:active{cursor:grabbing}
      #${PANEL_ID} .aaa-tab{flex:1;color:#ffc247;font-weight:bold;cursor:pointer}
      #${PANEL_ID} .aaa-toggle{border:0;background:transparent;color:#ffc247;font-size:18px;line-height:1;cursor:pointer;padding:0 3px}
      #${PANEL_ID} .aaa-body{padding:10px;max-height:55vh;overflow:auto}
      #${PANEL_ID}.aaa-closed .aaa-body{display:none}
      #${PANEL_ID} button{background:#ffc247;color:#111;border:0;border-radius:6px;padding:7px 9px;font-weight:bold;cursor:pointer;margin:2px}
      #${PANEL_ID} button.secondary{background:#333;color:#fff;border:1px solid #666}
      #${PANEL_ID} .aaa-status{margin:7px 0;color:#ddd}
      #${PANEL_ID} .aaa-target{padding:7px 8px;margin:4px 0;background:#292929;border-radius:6px;border-left:4px solid #ffc247}
      #${PANEL_ID} .aaa-target small{display:block;color:#aaa;margin-top:2px}
      #${PANEL_ID} .aaa-good{color:#9cff9c;font-weight:bold}
      #${PANEL_ID} .aaa-dollar{color:#ffc247;font-weight:bold}
      .aaa-deal-highlight{outline:2px solid #8cff8c!important;outline-offset:-2px!important;background:rgba(70,180,70,.12)!important}
      .aaa-dollar-highlight{outline:2px solid #ffc247!important;outline-offset:-2px!important;background:rgba(255,194,71,.16)!important}
      .aaa-deal-badge{display:block;margin-top:4px;padding:3px 5px;border-radius:4px;background:#162416;color:#9cff9c;font:bold 12px Arial,sans-serif;z-index:9999}
      .aaa-dollar-badge{display:block;margin-top:4px;padding:3px 5px;border-radius:4px;background:#332b16;color:#ffc247;font:bold 12px Arial,sans-serif;z-index:9999}
    `;
    document.head.appendChild(s);
  }

  function loadPos() {
    try { return JSON.parse(localStorage.getItem(POS) || 'null'); } catch (_) { return null; }
  }
  function savePos(x, y) {
    localStorage.setItem(POS, JSON.stringify({ x, y }));
  }

  function makeDraggable(panel, handle) {
    let drag = false, moved = false, sx = 0, sy = 0, ox = 0, oy = 0;
    const begin = (x, y, target, pointerId) => {
      if (target && target.closest && target.closest('button')) return;
      drag = true; moved = false; state.dragged = false;
      sx = x; sy = y;
      const r = panel.getBoundingClientRect(); ox = r.left; oy = r.top;
      panel.style.right = 'auto'; panel.style.bottom = 'auto';
      if (pointerId !== undefined) { try { handle.setPointerCapture(pointerId); } catch (_) {} }
    };
    const move = (x, y, event) => {
      if (!drag) return;
      if (!moved && Math.hypot(x - sx, y - sy) < 5) return;
      moved = true; state.dragged = true;
      if (event && event.cancelable) event.preventDefault();
      const px = Math.max(0, Math.min(window.innerWidth - panel.offsetWidth, ox + x - sx));
      const py = Math.max(0, Math.min(window.innerHeight - 40, oy + y - sy));
      panel.style.left = px + 'px'; panel.style.top = py + 'px';
    };
    const finish = () => {
      if (!drag) return;
      drag = false;
      if (moved) {
        const r = panel.getBoundingClientRect();
        savePos(r.left, r.top);
        setTimeout(() => { state.dragged = false; }, 300);
      }
    };
    // Mouse/stylus and modern pointer support.
    handle.addEventListener('pointerdown', e => {
      if (e.pointerType === 'touch') return; // handled by touch events below for PDA WebViews
      begin(e.clientX, e.clientY, e.target, e.pointerId);
    });
    handle.addEventListener('pointermove', e => {
      if (e.pointerType === 'touch') return;
      move(e.clientX, e.clientY, e);
    });
    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', finish);
    // Explicit touch fallback for Android/Torn PDA WebViews.
    handle.addEventListener('touchstart', e => {
      if (!e.touches || !e.touches.length) return;
      begin(e.touches[0].clientX, e.touches[0].clientY, e.target);
    }, { passive: true });
    document.addEventListener('touchmove', e => {
      if (!drag || !e.touches || !e.touches.length) return;
      move(e.touches[0].clientX, e.touches[0].clientY, e);
    }, { passive: false });
    document.addEventListener('touchend', finish, { passive: true });
    document.addEventListener('touchcancel', finish, { passive: true });
    // Prevent the title's open/close click after a drag.
    handle.addEventListener('click', e => {
      if (state.dragged) { e.preventDefault(); e.stopPropagation(); }
    }, true);
  }

  function getCurrentItemId() {
    const candidates = [location.href, location.search, location.hash, location.pathname];
    for (const value of candidates) {
      const m = value.match(/(?:item_id|itemid|item|ID|id)[=/:_-](\d{1,6})/i);
      if (m) return m[1];
    }
    const el = document.querySelector('[data-itemid],[data-item-id],[data-item]');
    if (el) {
      const id = el.getAttribute('data-itemid') || el.getAttribute('data-item-id') || el.getAttribute('data-item');
      if (/^\d+$/.test(id || '')) return id;
    }
    return null;
  }

  function getApiKey() {
    let key = localStorage.getItem(KEY);
    if (!key) {
      key = prompt('Torn API key needed for NPC sell prices. Use a Public Only key with torn/items permission.\n\nPaste your API key:');
      if (key) localStorage.setItem(KEY, key.trim());
    }
    return key && key.trim();
  }

  async function getNpcPrice(id) {
    let cache = {};
    try { cache = JSON.parse(localStorage.getItem(CACHE) || '{}'); } catch (_) {}
    const hit = cache[id];
    if (hit && Date.now() - hit.time < 7 * 86400000) return hit.sell;
    const key = getApiKey();
    if (!key) return null;
    try {
      const res = await fetch(`https://api.torn.com/torn/?selections=items&key=${encodeURIComponent(key)}`);
      if (!res.ok) throw new Error('API HTTP ' + res.status);
      const data = await res.json();
      if (data.error) throw new Error(data.error.error || data.error.code || 'Torn API error');
      const collection = data.items || data;
      let item = null;
      if (Array.isArray(collection)) item = collection.find(x => String(x.id ?? x.ID) === String(id));
      else if (collection && typeof collection === 'object') item = collection[id] || Object.values(collection).find(x => x && String(x.id ?? x.ID) === String(id));
      const rawSell = item && (item.sell_price ?? item.sellPrice ?? item.sell ?? item.npc_sell_price);
      const sell = Number(typeof rawSell === 'string' ? rawSell.replace(/[, $]/g, '') : rawSell);
      if (!Number.isFinite(sell) || sell <= 0) return null;
      cache[id] = { sell, time: Date.now() };
      localStorage.setItem(CACHE, JSON.stringify(cache));
      return sell;
    } catch (e) {
      console.warn('[AAA Deal Finder] NPC lookup failed', e);
      return null;
    }
  }

  function rowElements() {
    return [...document.querySelectorAll('.item-market-wrap li, #bazaarRoot li, [class*="market"] li, [class*="bazaar"] li')]
      .filter(el => el.offsetParent !== null && el.getBoundingClientRect().width > 0);
  }

  function parsePrice(row) {
    const text = row.innerText || row.textContent || '';
    const matches = [...text.matchAll(/\$\s*([\d,]+)/g)].map(m => Number(m[1].replace(/,/g, ''))).filter(Number.isFinite);
    return matches.length ? Math.min(...matches) : null;
  }

  function addBadge(row, text, dollar) {
    row.querySelectorAll('.aaa-deal-badge,.aaa-dollar-badge').forEach(x => x.remove());
    const b = document.createElement('div');
    b.className = dollar ? 'aaa-dollar-badge' : 'aaa-deal-badge';
    b.textContent = text;
    row.appendChild(b);
  }

  async function scan() {
    if (state.scanning) return;
    state.scanning = true; state.results = [];
    clearHighlights();
    status('Scanning visible listings…');
    const rows = rowElements();
    if (!rows.length) { status('0 visible listings found. Try opening the actual Item Market/Bazaar listing page first.'); state.scanning = false; return; }

    const itemId = getCurrentItemId();
    if (!itemId) { status(`Found ${rows.length} visible listings, but I can't identify the current item ID.`); state.scanning = false; return; }
    const npc = await getNpcPrice(itemId);
    if (!npc) { status(`Found ${rows.length} listings, but no NPC sell price was returned for item ${itemId}.`); state.scanning = false; return; }

    let dollar = 0, profit = 0, priced = 0;
    for (const row of rows) {
      const price = parsePrice(row);
      if (price == null) continue;
      priced++;
      if (price === 1) { row.classList.add('aaa-dollar-highlight'); addBadge(row, '🚨 $1 DOLLAR DEAL', true); dollar++; }
      if (price < npc) {
        const p = npc - price;
        row.classList.add('aaa-deal-highlight');
        addBadge(row, `🟢 NPC ${money(npc)} → ${money(p)} profit`, false);
        state.results.push({ price, profit: p }); profit += p;
      }
    }
    status(`${state.results.length} NPC-profit match${state.results.length === 1 ? '' : 'es'} • ${dollar} $1 deal${dollar === 1 ? '' : 's'} • readable prices ${priced}/${rows.length} • NPC sell ${money(npc)}`);
    state.scanning = false;
    renderTargets(itemId, npc);
  }

  function clearHighlights() {
    document.querySelectorAll('.aaa-deal-highlight,.aaa-dollar-highlight').forEach(x => x.classList.remove('aaa-deal-highlight','aaa-dollar-highlight'));
    document.querySelectorAll('.aaa-deal-badge,.aaa-dollar-badge').forEach(x => x.remove());
  }

  function status(text) { const el = document.querySelector(`#${PANEL_ID} .aaa-status`); if (el) el.textContent = text; }

  function renderTargets(currentId, npc) {
    const box = document.querySelector(`#${PANEL_ID} .aaa-targets`); if (!box) return;
    const current = builtInTargets.find(x => x.id === String(currentId));
    box.innerHTML = builtInTargets.map(x => `<div class="aaa-target"><b>${x.name}</b> <small>ID ${x.id}${x.id === String(currentId) ? ` • current • NPC ${money(npc)}` : ''}</small></div>`).join('');
    if (current) box.insertAdjacentHTML('afterbegin', `<div class="aaa-status aaa-good">🎯 Currently watching: ${current.name}</div>`);
  }

  function createPanel() {
    if (document.getElementById(PANEL_ID)) return;
    addStyle();
    const p = document.createElement('div'); p.id = PANEL_ID;
    p.innerHTML = `<div class="aaa-head"><div class="aaa-tab" title="Tap to open or close">💰 AAA DEAL FINDER</div><button class="aaa-toggle" title="Close toolbar">−</button></div><div class="aaa-body"><div class="aaa-status">Ready — open one item's Item Market/Bazaar listings, then scan. Drag the header to move.</div><div><button class="aaa-scan">🔎 Scan visible deals</button><button class="secondary aaa-clear">Clear highlights</button></div><h4 style="margin:12px 0 5px;color:#ffc247">🎯 Items to watch</h4><div class="aaa-targets"></div></div>`;
    document.body.appendChild(p);
    const tab = p.querySelector('.aaa-tab'), toggle = p.querySelector('.aaa-toggle');
    const setOpen = open => { state.open = open; p.classList.toggle('aaa-closed', !open); toggle.textContent = open ? '−' : '+'; };
    tab.addEventListener('click', () => { if (state.dragged) return; setOpen(!state.open); });
    toggle.addEventListener('click', () => setOpen(false));
    p.querySelector('.aaa-scan').addEventListener('click', scan);
    p.querySelector('.aaa-clear').addEventListener('click', clearHighlights);
    makeDraggable(p, p.querySelector('.aaa-head'));
    const pos = loadPos();
    if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) { p.style.left = pos.x + 'px'; p.style.top = pos.y + 'px'; p.style.right = 'auto'; p.style.bottom = 'auto'; }
    setOpen(false);
  }

  function start() { if (document.body) createPanel(); else setTimeout(start, 100); }
  start();
})();
