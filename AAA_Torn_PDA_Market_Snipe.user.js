// ==UserScript==
// @name         AAA - Torn Item Market Favourites
// @namespace    http://tampermonkey.net/
// @version      5.3
// @description  A simple, user-controlled Item Market shortcut toolbar with saved items and favourites.
// @author       You
// @match        *://*.torn.com/*
// @match        *://torn.com/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_KEY = 'aaa_market_shortcuts_v4';
    const POSITION_KEY = 'aaa_market_shortcuts_position_v1';

    // Only use IDs we have verified. Beer is #180 and Xanax is #206.
    const BUILT_IN_ITEMS = [
        { id: 180, name: 'Bottle of Beer' },
        { id: 206, name: 'Xanax' }
    ];

    const styles = {
        toolbar: [
            'position:fixed!important', 'top:70px!important', 'left:10px!important',
            'z-index:2147483647!important', 'width:290px', 'max-width:calc(100vw - 20px)',
            'max-height:75vh', 'overflow:auto', 'box-sizing:border-box',
            'background:#1e1e24', 'color:#f1f1f1', 'border:2px solid #2ecc71',
            'border-radius:12px', 'box-shadow:0 4px 18px rgba(0,0,0,.8)',
            'font:13px -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif'
        ].join(';'),
        button: 'background:#2b2b36;color:#f1f1f1;border:1px solid #555;border-radius:6px;padding:7px;cursor:pointer;font-size:12px;',
        input: 'width:100%;box-sizing:border-box;padding:8px;background:#111;color:#fff;border:1px solid #555;border-radius:5px;font-size:13px;'
    };

    function readItems() {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
            if (Array.isArray(saved) && saved.length) {
                // Repair the known old Beer shortcut. v5.2 incorrectly used ID 6,
                // which is Kitchen Knife. Do not guess at any other saved IDs.
                let changed = false;
                saved.forEach(item => {
                    if (String(item.id) === '6' && /^(beer|bottle of beer)$/i.test(String(item.name || '').trim())) {
                        item.id = '180';
                        item.name = 'Bottle of Beer';
                        changed = true;
                    }
                    if (item.favorite === undefined) {
                        item.favorite = false;
                        changed = true;
                    }
                });
                if (changed) {
                    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(saved)); } catch (_) {}
                }
                return saved;
            }
        } catch (e) {
            console.warn('[AAA Market Favourites] Could not read saved items.', e);
        }
        return BUILT_IN_ITEMS.map(item => ({ ...item, id: String(item.id), favorite: false }));
    }

    let items = readItems();
    let collapsed = true;

    function saveItems() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
        } catch (e) {
            alert('AAA Market Favourites could not save your list. Please check PDA storage settings.');
        }
    }

    function marketUrl(item) {
        const params = new URLSearchParams();
        params.set('itemID', String(item.id).trim());
        if (item.name) params.set('itemName', item.name);
        return 'https://www.torn.com/page.php?sid=ItemMarket#/market/view=search&' + params.toString();
    }

    function goToItem(item) {
        window.location.href = marketUrl(item);
    }

    function decode(value) {
        try { return decodeURIComponent(String(value).replace(/\+/g, ' ')).trim(); }
        catch (_) { return String(value).trim(); }
    }

    function getIdFromImage(img) {
        if (!img) return null;
        const sources = [img.currentSrc, img.src, img.getAttribute('src'), img.style.backgroundImage].filter(Boolean);
        for (const source of sources) {
            const match = String(source).match(/\/items\/(\d+)/i);
            if (match) return match[1];
        }
        return null;
    }

    function findNameNear(element) {
        if (!element) return '';
        let node = element;
        for (let depth = 0; node && depth < 6; depth++, node = node.parentElement) {
            const heading = node.querySelector('h1,h2,h3,h4,.title,.item-name,[class*="item-name"]');
            if (heading) {
                const text = heading.textContent.trim();
                if (text && text.length < 120) return text.replace(/\s+/g, ' ');
            }
        }
        return '';
    }

    function getCurrentMarketItem() {
        // 1. Best case: Torn has put the selected item in the URL/hash.
        const href = window.location.href;
        const idMatch = href.match(/[?&#]itemID=(\d+)/i);
        const nameMatch = href.match(/[?&#]itemName=([^&#]*)/i);
        if (idMatch) {
            const id = idMatch[1];
            const name = nameMatch ? decode(nameMatch[1]) : '';
            if (name) return { id, name };
            const builtIn = BUILT_IN_ITEMS.find(item => String(item.id) === id);
            return { id, name: builtIn ? builtIn.name : 'Item #' + id };
        }

        // 2. Torn's market UI also exposes item IDs through itemid/data-item
        // attributes and through the item's image path. This is what lets the
        // user add the item they are actually looking at without typing an ID.
        const candidates = [];
        document.querySelectorAll('[itemid],[data-item]').forEach(el => {
            const id = el.getAttribute('itemid') || el.getAttribute('data-item');
            if (/^\d+$/.test(String(id || ''))) candidates.push({ id: String(id), element: el });
        });
        document.querySelectorAll('img[src*="/images/items/"],img[src*="/items/"]').forEach(img => {
            const id = getIdFromImage(img);
            if (id) candidates.push({ id, element: img });
        });

        // Prefer an item image inside the market area over unrelated page images.
        candidates.sort((a, b) => {
            const aMarket = a.element.closest('.item-market-wrap') ? 1 : 0;
            const bMarket = b.element.closest('.item-market-wrap') ? 1 : 0;
            return bMarket - aMarket;
        });

        for (const candidate of candidates) {
            const id = candidate.id;
            const builtIn = BUILT_IN_ITEMS.find(item => String(item.id) === id);
            let name = findNameNear(candidate.element);
            if (!name && builtIn) name = builtIn.name;
            if (name) return { id, name };
        }

        return null;
    }

    function createToolbar() {
        if (document.getElementById('aaa-market-favourites')) return;
        const root = document.documentElement || document.body;
        if (!root) return;

        const box = document.createElement('section');
        box.id = 'aaa-market-favourites';
        box.style.cssText = styles.toolbar;
        box.style.width = 'auto';
        box.style.maxHeight = 'none';
        box.innerHTML = `
            <header id="aaa-mf-header" style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 10px;background:#2b2b36;border-radius:9px 9px 0 0;border-bottom:1px solid #444;font-weight:700;touch-action:pan-y;">
                <span id="aaa-mf-title" style="display:none;">⭐ AAA Market Favourites</span>
                <button id="aaa-mf-collapse" type="button" aria-label="Open favourites toolbar" title="Open favourites" style="${styles.button}color:#2ecc71;font-weight:bold;min-width:42px;">⭐</button>
            </header>
            <div id="aaa-mf-body" style="padding:10px;">
                <input id="aaa-mf-search" type="search" placeholder="Search saved items…" aria-label="Search saved items" style="${styles.input}margin-bottom:8px;">
                <div id="aaa-mf-list" style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;"></div>
                <div id="aaa-mf-current-item" style="border-top:1px solid #444;padding-top:10px;margin-bottom:10px;">
                    <div style="font-weight:700;margin-bottom:5px;">Quick-add current item</div>
                    <div id="aaa-mf-current-label" style="font-size:12px;color:#ddd;margin-bottom:7px;overflow-wrap:anywhere;">Open an item-specific market page and I’ll try to read the item automatically.</div>
                    <button id="aaa-mf-current-add" type="button" style="width:100%;background:#2ecc71;color:#111;border:0;border-radius:6px;padding:9px;font-weight:700;font-size:13px;">+ Add this item</button>
                </div>
                <div style="border-top:1px solid #444;padding-top:10px;">
                    <div style="font-weight:700;margin-bottom:7px;">Add an item manually</div>
                    <input id="aaa-mf-name" type="text" placeholder="Item name" style="${styles.input}margin-bottom:6px;">
                    <input id="aaa-mf-id" type="number" inputmode="numeric" placeholder="Torn item ID" style="${styles.input}margin-bottom:6px;">
                    <button id="aaa-mf-add" type="button" style="width:100%;background:#2ecc71;color:#111;border:0;border-radius:6px;padding:9px;font-weight:700;font-size:13px;">+ Add item</button>
                </div>
            </div>`;

        root.appendChild(box);

        const body = box.querySelector('#aaa-mf-body');
        const collapse = box.querySelector('#aaa-mf-collapse');
        const title = box.querySelector('#aaa-mf-title');

        function setCollapsed(value) {
            collapsed = value;
            body.style.display = collapsed ? 'none' : 'block';
            title.style.display = collapsed ? 'none' : 'inline';
            collapse.textContent = collapsed ? '⭐' : '−';
            collapse.title = collapsed ? 'Open favourites' : 'Minimise favourites';
            collapse.setAttribute('aria-label', collapse.title);
            box.style.width = collapsed ? 'auto' : '290px';
            box.style.maxHeight = collapsed ? 'none' : '75vh';
            box.querySelector('#aaa-mf-header').style.borderRadius = collapsed ? '9px' : '9px 9px 0 0';
            box.querySelector('#aaa-mf-header').style.borderBottom = collapsed ? '0' : '1px solid #444';
        }
        setCollapsed(true);

        // Keep the working draggable launcher exactly as before.
        let dragState = null;
        let suppressNextClick = false;
        try {
            const savedPosition = JSON.parse(localStorage.getItem(POSITION_KEY) || 'null');
            if (savedPosition && Number.isFinite(savedPosition.left) && Number.isFinite(savedPosition.top)) {
                box.style.left = Math.max(0, savedPosition.left) + 'px';
                box.style.top = Math.max(0, savedPosition.top) + 'px';
            }
        } catch (_) {}

        collapse.style.touchAction = 'none';
        collapse.style.cursor = 'grab';
        collapse.addEventListener('pointerdown', event => {
            if (event.button !== undefined && event.button !== 0) return;
            const rect = box.getBoundingClientRect();
            dragState = { pointerId:event.pointerId, startX:event.clientX, startY:event.clientY, left:rect.left, top:rect.top, moved:false };
            try { collapse.setPointerCapture(event.pointerId); } catch (_) {}
        });
        collapse.addEventListener('pointermove', event => {
            if (!dragState || dragState.pointerId !== event.pointerId) return;
            const dx = event.clientX - dragState.startX;
            const dy = event.clientY - dragState.startY;
            if (!dragState.moved && Math.abs(dx) + Math.abs(dy) < 7) return;
            dragState.moved = true;
            suppressNextClick = true;
            const maxLeft = Math.max(0, window.innerWidth - box.offsetWidth);
            const maxTop = Math.max(0, window.innerHeight - collapse.offsetHeight);
            box.style.left = Math.min(maxLeft, Math.max(0, dragState.left + dx)) + 'px';
            box.style.top = Math.min(maxTop, Math.max(0, dragState.top + dy)) + 'px';
            box.style.right = 'auto'; box.style.bottom = 'auto';
        });
        function finishDrag(event) {
            if (!dragState || (event && dragState.pointerId !== event.pointerId)) return;
            const wasDragged = dragState.moved;
            dragState = null;
            if (wasDragged) {
                try {
                    const rect = box.getBoundingClientRect();
                    localStorage.setItem(POSITION_KEY, JSON.stringify({left:rect.left, top:rect.top}));
                } catch (_) {}
                setTimeout(() => { suppressNextClick = false; }, 0);
            }
        }
        collapse.addEventListener('pointerup', finishDrag);
        collapse.addEventListener('pointercancel', finishDrag);
        collapse.addEventListener('click', event => {
            if (suppressNextClick) { event.preventDefault(); event.stopImmediatePropagation(); suppressNextClick = false; return; }
            setCollapsed(!collapsed);
        });

        const currentPanel = box.querySelector('#aaa-mf-current-item');
        const currentLabel = box.querySelector('#aaa-mf-current-label');
        const currentAdd = box.querySelector('#aaa-mf-current-add');
        let detectedItem = null;

        function refreshCurrentItem() {
            detectedItem = getCurrentMarketItem();
            if (!detectedItem) {
                currentLabel.textContent = 'No item detected yet. Open the item you want in Torn’s Item Market and try again.';
                currentAdd.textContent = 'No item detected';
                currentAdd.disabled = true;
                currentAdd.style.opacity = '0.65';
                return;
            }
            const alreadySaved = items.some(item => String(item.id) === detectedItem.id);
            currentLabel.textContent = detectedItem.name + ' · ID ' + detectedItem.id + (alreadySaved ? ' · Already saved' : '');
            currentAdd.textContent = alreadySaved ? 'Already added ✓' : '+ Add this item';
            currentAdd.disabled = alreadySaved;
            currentAdd.style.opacity = alreadySaved ? '0.65' : '1';
        }

        currentAdd.addEventListener('click', () => {
            if (!detectedItem) return;
            if (items.some(item => String(item.id) === detectedItem.id)) return;
            items.push({id:detectedItem.id, name:detectedItem.name, favorite:false});
            saveItems();
            renderItems();
            refreshCurrentItem();
        });

        window.addEventListener('hashchange', () => setTimeout(refreshCurrentItem, 150));
        window.addEventListener('popstate', () => setTimeout(refreshCurrentItem, 150));
        box.querySelector('#aaa-mf-search').addEventListener('input', renderItems);
        box.querySelector('#aaa-mf-add').addEventListener('click', () => {
            const name = box.querySelector('#aaa-mf-name').value.trim();
            const id = box.querySelector('#aaa-mf-id').value.trim();
            if (!name || !id || !/^\d+$/.test(id)) { alert('Please enter an item name and numeric Torn item ID.'); return; }
            if (items.some(item => String(item.id) === id)) { alert('That item ID is already in your list.'); return; }
            items.push({id,name,favorite:false});
            saveItems();
            box.querySelector('#aaa-mf-name').value = '';
            box.querySelector('#aaa-mf-id').value = '';
            renderItems();
        });

        renderItems();
        refreshCurrentItem();
    }

    function renderItems() {
        const box = document.getElementById('aaa-market-favourites');
        if (!box) return;
        const list = box.querySelector('#aaa-mf-list');
        const query = box.querySelector('#aaa-mf-search').value.trim().toLowerCase();
        list.innerHTML = '';
        const visible = items.filter(item => String(item.name).toLowerCase().includes(query) || String(item.id).includes(query))
            .slice().sort((a,b) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)) || String(a.name).localeCompare(String(b.name)));
        if (!visible.length) {
            const empty = document.createElement('div'); empty.textContent = 'No matching items. Add one below.'; empty.style.cssText = 'color:#aaa;padding:8px 2px;'; list.appendChild(empty); return;
        }
        visible.forEach(item => {
            const row = document.createElement('div'); row.style.cssText = 'display:flex;align-items:center;gap:5px;';
            const open = document.createElement('button'); open.type='button'; open.textContent=item.name; open.title='Open '+item.name+' in the Item Market';
            open.style.cssText=styles.button+'flex:1;min-width:0;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border-color:#2ecc71;';
            open.addEventListener('click',()=>goToItem(item));
            const fav = document.createElement('button'); fav.type='button'; fav.textContent=item.favorite?'★':'☆'; fav.title=item.favorite?'Remove from favourites':'Add to favourites';
            fav.style.cssText=styles.button+'min-width:34px;color:'+(item.favorite?'#f1c40f':'#ddd')+';font-size:16px;padding:4px;';
            fav.addEventListener('click',()=>{item.favorite=!item.favorite;saveItems();renderItems();});
            const remove = document.createElement('button'); remove.type='button'; remove.textContent='×'; remove.title='Remove item';
            remove.style.cssText=styles.button+'min-width:30px;color:#ff7777;font-size:16px;padding:4px;';
            remove.addEventListener('click',()=>{items=items.filter(saved=>String(saved.id)!==String(item.id));saveItems();renderItems();});
            row.append(open,fav,remove); list.appendChild(row);
        });
    }

    function start() {
        createToolbar();
        const observer = new MutationObserver(() => {
            if (!document.getElementById('aaa-market-favourites') && document.documentElement) createToolbar();
        });
        if (document.documentElement) observer.observe(document.documentElement,{childList:true,subtree:true});
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start,{once:true});
    else start();
})();
