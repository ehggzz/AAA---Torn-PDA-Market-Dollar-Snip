// ==UserScript==
// @name         AAA - Torn PDA Market & Dollar Snipe
// @namespace    http://tampermonkey.net/
// @version      3.7
// @description  PDA Mobile: toolbox and manual item navigation; price scanning and highlighting disabled.
// @author       You
// @match        *://*.torn.com/*
// @match        *://torn.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    console.log('[AAA Snipe] v3.4 loaded');

    const NPC_DATABASE = [
        { id: 180, name: 'Beer', npcPrice: 10 },
        { id: 181, name: 'Cigar', npcPrice: 20 },
        { id: 226, name: 'Bottle of Beer', npcPrice: 100 },
        { id: 227, name: 'Bottle of Red Wine', npcPrice: 500 },
        { id: 228, name: 'Bottle of Kahlua', npcPrice: 1000 },
        { id: 229, name: 'Bottle of Sake', npcPrice: 1000 },
        { id: 230, name: 'Bottle of Tequila', npcPrice: 1000 },
        { id: 366, name: 'X-Mass Cupcake', npcPrice: 500 },
        { id: 367, name: 'Fruitcake', npcPrice: 500 },
        { id: 368, name: 'Gingerbread Man', npcPrice: 500 },
        { id: 182, name: 'Cannabis', npcPrice: 500 },
        { id: 183, name: 'Ecstasy', npcPrice: 1000 },
        { id: 184, name: 'Ketamine', npcPrice: 1000 },
        { id: 185, name: 'LSD', npcPrice: 1000 },
        { id: 186, name: 'Opium', npcPrice: 1000 },
        { id: 187, name: 'PCP', npcPrice: 1000 },
        { id: 188, name: 'Shrooms', npcPrice: 1000 },
        { id: 189, name: 'Speed', npcPrice: 1000 },
        { id: 190, name: 'Vicodin', npcPrice: 1000 },
        { id: 191, name: 'Xanax', npcPrice: 1000 },
        { id: 17, name: 'Blank CD', npcPrice: 10 },
        { id: 18, name: 'DVD', npcPrice: 10 },
        { id: 19, name: 'Brick', npcPrice: 1 }
    ];

    const DEFAULT_TARGETS = {
        180: { name: 'Beer', npcPrice: 10 },
        181: { name: 'Cigar', npcPrice: 20 },
        366: { name: 'X-Mass Cupcake', npcPrice: 500 },
        367: { name: 'Fruitcake', npcPrice: 500 },
        226: { name: 'Bottle of Beer', npcPrice: 100 }
    };

    let targetItems = loadTargets();
    let observerStarted = false;
    let toolbarObserver = null;

    function loadTargets() {
        try {
            const saved = JSON.parse(localStorage.getItem('aaa_npc_targets'));
            return saved && typeof saved === 'object' ? saved : { ...DEFAULT_TARGETS };
        } catch (e) {
            console.warn('[AAA Snipe] Could not load saved targets:', e);
            return { ...DEFAULT_TARGETS };
        }
    }

    function saveTargets() {
        try {
            localStorage.setItem('aaa_npc_targets', JSON.stringify(targetItems));
        } catch (e) {
            console.warn('[AAA Snipe] Could not save targets:', e);
        }
    }

    function isMarketPage() {
        const href = window.location.href || '';
        const path = window.location.pathname || '';
        const hash = window.location.hash || '';
        const search = window.location.search || '';
        return path.includes('imarket.php') ||
            href.toLowerCase().includes('imarket.php') ||
            href.toLowerCase().includes('itemmarket') ||
            search.toLowerCase().includes('sid=itemmarket') ||
            hash.toLowerCase().includes('p=shop');
    }

    function getCurrentItemID() {
        const hash = window.location.hash || '';
        const urlParams = new URLSearchParams(hash.replace(/^#\/?/, '?'));
        return urlParams.get('type') || urlParams.get('typeID');
    }

    function cycleTarget(direction) {
        const targetIDs = Object.keys(targetItems);
        if (!targetIDs.length) return;

        const currentID = getCurrentItemID();
        const currentIndex = targetIDs.indexOf(currentID);
        const baseIndex = currentIndex >= 0 ? currentIndex : 0;

        if (direction === 'next') {
            const nextIndex = (baseIndex + 1) % targetIDs.length;
            window.location.hash = `#/p=shop&type=${targetIDs[nextIndex]}`;
        } else {
            const prevIndex = (baseIndex - 1 + targetIDs.length) % targetIDs.length;
            window.location.hash = `#/p=shop&type=${targetIDs[prevIndex]}`;
        }
    }

    function getSavedPosition() {
        const fallback = { top: '70px', left: '10px' };
        try {
            const saved = JSON.parse(localStorage.getItem('aaa_toolbar_pos_mobile'));
            if (!saved) return fallback;

            const top = parseInt(saved.top, 10);
            const left = parseInt(saved.left, 10);

            return {
                top: Number.isFinite(top) && top >= 0 && top < window.innerHeight - 40 ? `${top}px` : fallback.top,
                left: Number.isFinite(left) && left >= 0 && left < window.innerWidth - 40 ? `${left}px` : fallback.left
            };
        } catch (e) {
            return fallback;
        }
    }

    function createToolbar() {
        // v3.5 test: show the toolbox on any Torn page so we can isolate
        // whether Market-page detection was preventing it from appearing.
        if (document.getElementById('aaa-npc-toolbar')) return document.getElementById('aaa-npc-toolbar');

        const toolbar = document.createElement('div');
        toolbar.id = 'aaa-npc-toolbar';
        const savedPos = getSavedPosition();

        toolbar.style.cssText = `
            position: fixed !important;
            top: ${savedPos.top} !important;
            left: ${savedPos.left} !important;
            z-index: 2147483647 !important;
            display: block !important;
            visibility: visible !important;
            opacity: 1 !important;
            pointer-events: auto !important;
            background: #1e1e24;
            color: #f1f1f1;
            border: 2px solid #2ecc71;
            border-radius: 10px;
            box-shadow: 0 4px 18px rgba(0,0,0,0.8);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 13px;
            width: 280px;
            max-width: 90vw;
            overflow: visible;
            touch-action: none;
            box-sizing: border-box;
        `;

        toolbar.innerHTML = `
            <div id="aaa-tb-header" style="background:#2b2b36; padding:8px 10px; cursor:move; font-weight:bold; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #444; border-radius:8px 8px 0 0; user-select:none;">
                <span>🎯 AAA Snipe</span>
                <button id="aaa-tb-toggle" type="button" style="background:#333; border:1px solid #555; color:#2ecc71; border-radius:4px; padding:2px 8px; font-weight:bold; cursor:pointer;">−</button>
            </div>
            <div id="aaa-tb-body" style="padding:10px;">
                <div style="display:flex; gap:8px; margin-bottom:10px;">
                    <button id="aaa-nav-prev" type="button" style="flex:1; padding:8px; background:#2b2b36; color:#2ecc71; border:1px solid #2ecc71; border-radius:6px; font-weight:bold; font-size:12px; cursor:pointer;">◀ Prev Item</button>
                    <button id="aaa-nav-next" type="button" style="flex:1; padding:8px; background:#2ecc71; color:#111; border:1px solid #2ecc71; border-radius:6px; font-weight:bold; font-size:12px; cursor:pointer;">Next Item ▶</button>
                </div>

                <div style="font-size:11px; color:#aaa; margin-bottom:6px;">Quick Presets:</div>
                <div id="aaa-target-buttons" style="display:flex; flex-wrap:wrap; gap:5px; margin-bottom:10px; max-height:100px; overflow-y:auto;"></div>

                <hr style="border:none; border-top:1px solid #333; margin:8px 0;">

                <div style="font-weight:bold; margin-bottom:4px; font-size:12px;">Search & Add Item:</div>
                <div style="position:relative; margin-bottom:6px;">
                    <input type="text" id="aaa-search-input" placeholder="Type item name..." style="width:100%; box-sizing:border-box; padding:7px; background:#111; color:#fff; border:1px solid #444; border-radius:4px; font-size:12px;">
                    <div id="aaa-autocomplete-list" style="position:absolute; top:100%; left:0; right:0; background:#222; border:1px solid #555; border-radius:0 0 4px 4px; max-height:130px; overflow-y:auto; z-index:1000000; display:none;"></div>
                </div>

                <div style="display:flex; gap:4px; margin-bottom:6px;">
                    <input type="number" id="aaa-add-id" placeholder="ID" style="width:55px; padding:6px; background:#111; color:#fff; border:1px solid #444; border-radius:4px; font-size:12px;">
                    <input type="text" id="aaa-add-name" placeholder="Name" style="flex:1; padding:6px; background:#111; color:#fff; border:1px solid #444; border-radius:4px; font-size:12px;">
                    <input type="number" id="aaa-add-price" placeholder="NPC $" style="width:65px; padding:6px; background:#111; color:#fff; border:1px solid #444; border-radius:4px; font-size:12px;">
                </div>
                <button id="aaa-btn-add" type="button" style="width:100%; padding:8px; background:#2ecc71; color:#111; font-weight:bold; border:none; border-radius:6px; cursor:pointer; font-size:12px;">+ Save Item Target</button>
            </div>
        `;

        (document.documentElement || document.body).appendChild(toolbar);

        renderTargetButtons();
        setupAutocomplete(toolbar);
        makeDraggable(toolbar);

        toolbar.querySelector('#aaa-nav-prev').addEventListener('click', () => cycleTarget('prev'));
        toolbar.querySelector('#aaa-nav-next').addEventListener('click', () => cycleTarget('next'));

        const toggleBtn = toolbar.querySelector('#aaa-tb-toggle');
        const body = toolbar.querySelector('#aaa-tb-body');
        const header = toolbar.querySelector('#aaa-tb-header');
        let collapsed = false;

        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            collapsed = !collapsed;
            if (collapsed) {
                body.style.display = 'none';
                toolbar.style.width = 'auto';
                toolbar.style.minWidth = '110px';
                header.style.borderRadius = '8px';
                toggleBtn.textContent = '+';
            } else {
                body.style.display = 'block';
                toolbar.style.width = '280px';
                toolbar.style.minWidth = '';
                header.style.borderRadius = '8px 8px 0 0';
                toggleBtn.textContent = '−';
            }
        });

        toolbar.querySelector('#aaa-btn-add').addEventListener('click', () => {
            const id = toolbar.querySelector('#aaa-add-id').value.trim();
            const name = toolbar.querySelector('#aaa-add-name').value.trim() || `Item ${id}`;
            const price = parseInt(toolbar.querySelector('#aaa-add-price').value.trim(), 10);

            if (id && Number.isFinite(price) && price > 0) {
                targetItems[id] = { name, npcPrice: price };
                saveTargets();
                renderTargetButtons();
                toolbar.querySelector('#aaa-search-input').value = '';
                toolbar.querySelector('#aaa-add-id').value = '';
                toolbar.querySelector('#aaa-add-name').value = '';
                toolbar.querySelector('#aaa-add-price').value = '';
            }
        });

        return toolbar;
    }

    function setupAutocomplete(toolbar) {
        const searchInput = toolbar.querySelector('#aaa-search-input');
        const list = toolbar.querySelector('#aaa-autocomplete-list');
        if (!searchInput || !list) return;

        searchInput.addEventListener('input', () => {
            const query = searchInput.value.toLowerCase().trim();
            if (!query) {
                list.style.display = 'none';
                return;
            }

            const matches = NPC_DATABASE.filter(item => item.name.toLowerCase().includes(query));
            if (!matches.length) {
                list.style.display = 'none';
                return;
            }

            list.innerHTML = '';
            matches.forEach(item => {
                const itemRow = document.createElement('div');
                itemRow.style.cssText = 'padding:7px 10px; cursor:pointer; border-bottom:1px solid #333; font-size:12px; color:#eee; display:flex; justify-content:space-between;';
                itemRow.innerHTML = `<span>${item.name}</span><span style="color:#2ecc71;">$${item.npcPrice.toLocaleString()}</span>`;

                itemRow.addEventListener('click', () => {
                    toolbar.querySelector('#aaa-add-id').value = item.id;
                    toolbar.querySelector('#aaa-add-name').value = item.name;
                    toolbar.querySelector('#aaa-add-price').value = item.npcPrice;
                    searchInput.value = item.name;
                    list.style.display = 'none';
                });

                list.appendChild(itemRow);
            });

            list.style.display = 'block';
        });

        document.addEventListener('click', (e) => {
            if (!toolbar.isConnected) return;
            if (!searchInput.contains(e.target) && !list.contains(e.target)) list.style.display = 'none';
        });
    }

    function renderTargetButtons() {
        const container = document.getElementById('aaa-target-buttons');
        if (!container) return;

        container.innerHTML = '';
        Object.keys(targetItems).forEach(id => {
            const item = targetItems[id];
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.style.cssText = 'background:#2b2b36; color:#fff; border:1px solid #444; padding:5px 8px; font-size:11px; border-radius:5px; cursor:pointer; display:flex; align-items:center; gap:6px; touch-action:manipulation;';
            btn.innerHTML = `${item.name} <span style="color:#e74c3c; font-weight:bold; padding:0 2px;" title="Remove">✕</span>`;

            btn.addEventListener('click', (e) => {
                if (e.target.tagName === 'SPAN') {
                    delete targetItems[id];
                    saveTargets();
                    renderTargetButtons();
                } else {
                    window.location.hash = `#/p=shop&type=${id}`;
                }
            });

            container.appendChild(btn);
        });
    }

    function makeDraggable(element) {
        const header = element.querySelector('#aaa-tb-header');
        if (!header) return;

        let isDragging = false;
        let offsetX = 0;
        let offsetY = 0;

        function startDrag(e) {
            if (e.target.closest('button')) return;
            isDragging = true;
            const point = e.touches ? e.touches[0] : e;
            offsetX = point.clientX - element.offsetLeft;
            offsetY = point.clientY - element.offsetTop;
        }

        function moveDrag(e) {
            if (!isDragging) return;
            if (e.touches) e.preventDefault();
            const point = e.touches ? e.touches[0] : e;
            const left = Math.max(0, Math.min(window.innerWidth - element.offsetWidth, point.clientX - offsetX));
            const top = Math.max(0, Math.min(window.innerHeight - element.offsetHeight, point.clientY - offsetY));
            element.style.left = `${left}px`;
            element.style.top = `${top}px`;
        }

        function stopDrag() {
            if (!isDragging) return;
            isDragging = false;
            try {
                localStorage.setItem('aaa_toolbar_pos_mobile', JSON.stringify({
                    top: element.style.top,
                    left: element.style.left
                }));
            } catch (e) {}
        }

        header.addEventListener('mousedown', startDrag);
        document.addEventListener('mousemove', moveDrag);
        document.addEventListener('mouseup', stopDrag);
        header.addEventListener('touchstart', startDrag, { passive: false });
        document.addEventListener('touchmove', moveDrag, { passive: false });
        document.addEventListener('touchend', stopDrag);
    }

    // Market price scanning and all price-based highlighting are disabled
    // pending confirmation from Torn staff about permitted use of market data.
    function scanListings() {
        return;
    }

    function ensureToolbar() {
        // Temporary visibility test: do not hide the toolbox away from Market.
        // Listing scans still run only when isMarketPage() returns true.
        if (!document.getElementById('aaa-npc-toolbar')) createToolbar();
    }

    function startLifecycle() {
        if (observerStarted) return;
        observerStarted = true;

        const run = () => {
            ensureToolbar();
            scanListings();
        };

        run();

        window.addEventListener('hashchange', () => {
            setTimeout(run, 50);
            setTimeout(run, 300);
        });

        window.addEventListener('popstate', () => {
            setTimeout(run, 100);
        });

        if (document.documentElement) {
            toolbarObserver = new MutationObserver(() => {
                if (isMarketPage() && !document.getElementById('aaa-npc-toolbar')) {
                    setTimeout(ensureToolbar, 0);
                }
            });
            toolbarObserver.observe(document.documentElement, { childList: true, subtree: true });
        }

        setInterval(run, 1000);
    }

    window.addEventListener('dblclick', () => {
        const toolbar = document.getElementById('aaa-npc-toolbar');
        if (!toolbar) return;
        toolbar.style.top = '70px';
        toolbar.style.left = '10px';
        try {
            localStorage.setItem('aaa_toolbar_pos_mobile', JSON.stringify({ top: '70px', left: '10px' }));
        } catch (e) {}
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startLifecycle, { once: true });
    } else {
        startLifecycle();
    }
})();
