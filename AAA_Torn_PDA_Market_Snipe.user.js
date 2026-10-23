// ==UserScript==
// @name         AAA - Torn Item Market Favourites
// @namespace    http://tampermonkey.net/
// @version      5.7
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
    const BUILT_IN_ITEMS = [
        { id: '180', name: 'Bottle of Beer' },
        { id: '206', name: 'Xanax' },
        { id: '897', name: 'Bottle Cap' }
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

    function normaliseItem(item) {
        const id = String(item.id || '').trim();
        const savedName = String(item.name || '').trim();
        const builtIn = BUILT_IN_ITEMS.find(entry => String(entry.id) === id);
        // Repair generic fallback labels for known items without changing IDs, favourites, or storage.
        const isFallbackName = !savedName || savedName.toLowerCase() === ('item ' + id).toLowerCase();
        const name = builtIn && isFallbackName ? builtIn.name : (savedName || ('Item ' + id));
        return { id, name, favorite: Boolean(item.favorite) };
    }
    function readItems() {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
            if (Array.isArray(saved) && saved.length) {
                const repaired = saved.map(normaliseItem);
                // Older versions accidentally used ID 6 for Beer. Repair that saved shortcut.
                repaired.forEach(item => {
                    if (item.id === '6' && /beer/i.test(item.name)) {
                        item.id = '180';
                        item.name = 'Bottle of Beer';
                    }
                });
                localStorage.setItem(STORAGE_KEY, JSON.stringify(repaired));
                return repaired;
            }
        } catch (e) {
            console.warn('[AAA Market Favourites] Could not read saved items.', e);
        }
        return BUILT_IN_ITEMS.map(normaliseItem);
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

    function decode(value) {
        try { return decodeURIComponent(String(value).replace(/\+/g, ' ')); } catch (_) { return String(value); }
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

    function findItemIdInUrl(text) {
        const match = String(text || '').match(/[?&#]itemID(?:=|%3D)(\d+)/i) || String(text || '').match(/itemID=(\d+)/i);
        return match ? match[1] : null;
    }

    function findItemNameInUrl(text) {
        const match = String(text || '').match(/itemName=([^&#]+)/i);
        return match ? decode(match[1]) : '';
    }

    function cleanPossibleName(value) {
        const name = String(value || '').replace(/\s+/g, ' ').trim();
        if (!name || name.length > 120) return '';
        if (/^(item\s*\d+|undefined|null)$/i.test(name)) return '';
        return name;
    }

    function elementLabel(element) {
        if (!element) return '';
        const attributes = ['alt', 'title', 'aria-label', 'data-item-name', 'data-itemname'];
        for (const attribute of attributes) {
            const value = cleanPossibleName(element.getAttribute && element.getAttribute(attribute));
            if (value) return value;
        }
        if ('value' in element) {
            const value = cleanPossibleName(element.value);
            if (value) return value;
        }
        return '';
    }

    function nameNear(element) {
        let node = element;
        for (let i = 0; i < 8 && node; i++, node = node.parentElement) {
            const directLabel = elementLabel(node);
            if (directLabel) return directLabel;

            const selected = node.querySelector('option:checked');
            const selectedName = cleanPossibleName(selected && selected.textContent);
            if (selectedName) return selectedName;

            const heading = node.querySelector('h1,h2,h3,h4,.title,.item-name,[class*="item-name"],[class*="itemName"]');
            if (heading) {
                const headingName = cleanPossibleName(heading.textContent);
                if (headingName) return headingName;
            }
        }
        return '';
    }

    function getCurrentMarketItem() {
        const urlText = window.location.href + ' ' + window.location.hash + ' ' + window.location.search;
        let id = findItemIdInUrl(urlText);
        let name = findItemNameInUrl(urlText);

        const urlBuiltIn = id ? BUILT_IN_ITEMS.find(item => String(item.id) === String(id)) : null;
        // If the URL has an ID but no name, keep searching the rendered page.
        // The previous version returned "Item 897" here before inspecting the DOM.
        if (id && (name || urlBuiltIn)) {
            return { id: String(id), name: name || urlBuiltIn.name };
        }

        const candidates = [];
        if (id) {
            // Keep the URL ID as a fallback, but allow a named DOM candidate to win.
            candidates.push({ id: String(id), name: cleanPossibleName(name), priority: 0, fromUrl: true });
        }
        const selectors = [
            'a[href*="itemID="]',
            '[data-item-id]', '[data-itemid]', '[itemid]', '[data-item]',
            'img[src*="/images/items/"]', 'img[src*="/items/"]'
        ];

        selectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(element => {
                const text = element.getAttribute('href') || element.getAttribute('data-item-id') || element.getAttribute('data-itemid') || element.getAttribute('itemid') || element.getAttribute('data-item') || element.getAttribute('src') || '';
                const foundId = findItemIdInUrl(text) || (String(text).match(/(?:^|\/)items?\/(\d+)(?:\D|$)/i) || [])[1];
                if (!foundId) return;

                const foundName = findItemNameInUrl(text) || elementLabel(element) || nameNear(element) || '';
                const marketArea = element.closest('.item-market-wrap,.item-market,.market-wrap,[class*="item-market"],[class*="itemMarket"]');
                candidates.push({ id: String(foundId), name: cleanPossibleName(foundName), priority: marketArea ? 0 : 1 });
            });
        });

        // Torn can expose the selected item through a combobox/input rather than the URL.
        // Use the visible item name to improve the label when the item image only gives us an ID.
        const visibleNames = [];
        document.querySelectorAll('input,select,[role="combobox"]').forEach(element => {
            const value = element.tagName === 'SELECT'
                ? cleanPossibleName(element.options[element.selectedIndex] && element.options[element.selectedIndex].textContent)
                : elementLabel(element);
            if (value) visibleNames.push(value);
        });

        candidates.forEach(candidate => {
            if (candidate.name) return;
            const match = visibleNames.find(value => value && !/^search|item market|price|owner|quantity|buy$/i.test(value));
            if (match) candidate.name = match;
        });

        candidates.sort((a, b) => {
            const priorityDifference = a.priority - b.priority;
            if (priorityDifference) return priorityDifference;
            return Number(Boolean(b.name)) - Number(Boolean(a.name));
        });

        if (!candidates.length) return null;

        const best = candidates[0];
        const builtIn = BUILT_IN_ITEMS.find(item => String(item.id) === best.id);
        return { id: best.id, name: best.name || (builtIn ? builtIn.name : ('Item ' + best.id)) };
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
            <header id="aaa-mf-header" style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 10px;background:#2b2b36;border-radius:9px 9px 0 0;border-bottom:1px solid #444;font-weight:700;">
                <span id="aaa-mf-title" style="display:none;">⭐ AAA Market Favourites</span>
                <button id="aaa-mf-collapse" type="button" aria-label="Open favourites toolbar" title="Open favourites" style="${styles.button}color:#2ecc71;font-weight:bold;min-width:42px;">⭐</button>
            </header>
            <div id="aaa-mf-body" style="padding:10px;">
                <input id="aaa-mf-search" type="search" placeholder="Search saved items…" aria-label="Search saved items" style="${styles.input}margin-bottom:8px;">
                <div id="aaa-mf-list" style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;"></div>
                <div style="border-top:1px solid #444;padding-top:10px;">
                    <div style="font-weight:700;margin-bottom:7px;">Quick add</div>
                    <div id="aaa-mf-current" style="font-size:11px;color:#aaa;line-height:1.4;margin-bottom:7px;">Checking the current Item Market page…</div>
                    <button id="aaa-mf-add-current" type="button" style="width:100%;background:#2ecc71;color:#111;border:0;border-radius:6px;padding:9px;font-weight:700;font-size:13px;margin-bottom:8px;">+ Add current item</button>
                    <div style="font-size:11px;color:#777;text-align:center;margin:2px 0 8px;">— or add manually —</div>
                    <input id="aaa-mf-name" type="text" placeholder="Item name (e.g. Xanax)" style="${styles.input}margin-bottom:6px;">
                    <input id="aaa-mf-id" type="number" inputmode="numeric" placeholder="Torn item ID" style="${styles.input}margin-bottom:6px;">
                    <button id="aaa-mf-add" type="button" style="width:100%;background:#444;color:#fff;border:1px solid #666;border-radius:6px;padding:8px;font-weight:700;font-size:12px;">+ Add manually</button>
                </div>
            </div>`;

        root.appendChild(box);

        const body = box.querySelector('#aaa-mf-body');
        const collapse = box.querySelector('#aaa-mf-collapse');
        const title = box.querySelector('#aaa-mf-title');
        const currentLabel = box.querySelector('#aaa-mf-current');
        const currentButton = box.querySelector('#aaa-mf-add-current');

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

        try {
            const savedPosition = JSON.parse(localStorage.getItem(POSITION_KEY) || 'null');
            if (savedPosition && Number.isFinite(savedPosition.left) && Number.isFinite(savedPosition.top)) {
                box.style.left = Math.max(0, savedPosition.left) + 'px';
                box.style.top = Math.max(0, savedPosition.top) + 'px';
            }
        } catch (_) {}

        let dragState = null;
        let suppressNextClick = false;
        collapse.style.touchAction = 'none';
        collapse.style.cursor = 'grab';
        collapse.addEventListener('pointerdown', event => {
            if (event.button !== undefined && event.button !== 0) return;
            const rect = box.getBoundingClientRect();
            dragState = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, left: rect.left, top: rect.top, moved: false };
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
            box.style.right = 'auto';
            box.style.bottom = 'auto';
        });
        function finishDrag(event) {
            if (!dragState || (event && dragState.pointerId !== event.pointerId)) return;
            const wasDragged = dragState.moved;
            dragState = null;
            if (wasDragged) {
                try {
                    const rect = box.getBoundingClientRect();
                    localStorage.setItem(POSITION_KEY, JSON.stringify({ left: rect.left, top: rect.top }));
                } catch (_) {}
                setTimeout(() => { suppressNextClick = false; }, 0);
            }
        }
        collapse.addEventListener('pointerup', finishDrag);
        collapse.addEventListener('pointercancel', finishDrag);
        collapse.addEventListener('click', event => {
            if (suppressNextClick) {
                event.preventDefault();
                event.stopImmediatePropagation();
                suppressNextClick = false;
                return;
            }
            setCollapsed(!collapsed);
        });

        function refreshCurrentItem() {
            const current = getCurrentMarketItem();
            if (!current) {
                currentLabel.textContent = 'Open an item-specific Item Market page, then try again.';
                currentButton.disabled = true;
                currentButton.style.opacity = '0.5';
                return null;
            }
            const already = items.some(item => String(item.id) === String(current.id));
            currentLabel.textContent = current.name + ' · ID ' + current.id + (already ? ' · Already saved' : '');
            currentButton.disabled = already;
            currentButton.style.opacity = already ? '0.5' : '1';
            return current;
        }

        currentButton.addEventListener('click', () => {
            const current = refreshCurrentItem();
            if (!current) return;
            if (items.some(item => String(item.id) === String(current.id))) return;
            items.push({ id: current.id, name: current.name, favorite: false });
            saveItems();
            renderItems();
            refreshCurrentItem();
        });

        box.querySelector('#aaa-mf-search').addEventListener('input', renderItems);
        box.querySelector('#aaa-mf-add').addEventListener('click', () => {
            const nameInput = box.querySelector('#aaa-mf-name');
            const idInput = box.querySelector('#aaa-mf-id');
            const name = nameInput.value.trim();
            const id = idInput.value.trim();
            if (!name || !id || !/^\d+$/.test(id)) {
                alert('Please enter both an item name and its numeric Torn item ID.');
                return;
            }
            if (items.some(item => String(item.id) === id)) {
                alert('That item ID is already in your list.');
                return;
            }
            items.push({ id, name, favorite: false });
            saveItems();
            nameInput.value = '';
            idInput.value = '';
            renderItems();
            refreshCurrentItem();
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

        const visible = items
            .filter(item => String(item.name).toLowerCase().includes(query) || String(item.id).includes(query))
            .slice()
            .sort((a, b) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)) || a.name.localeCompare(b.name));

        if (!visible.length) {
            const empty = document.createElement('div');
            empty.textContent = 'No matching items. Add one below.';
            empty.style.cssText = 'color:#aaa;padding:8px 2px;';
            list.appendChild(empty);
            return;
        }

        visible.forEach(item => {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:5px;';

            const open = document.createElement('button');
            open.type = 'button';
            open.textContent = item.name;
            open.title = 'Open ' + item.name + ' in the Item Market';
            open.style.cssText = styles.button + 'flex:1;min-width:0;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border-color:#2ecc71;';
            open.addEventListener('click', () => goToItem(item));

            const fav = document.createElement('button');
            fav.type = 'button';
            fav.textContent = item.favorite ? '★' : '☆';
            fav.title = item.favorite ? 'Remove from favourites' : 'Add to favourites';
            fav.setAttribute('aria-label', fav.title);
            fav.style.cssText = styles.button + 'min-width:34px;color:' + (item.favorite ? '#f1c40f' : '#ddd') + ';font-size:16px;padding:4px;';
            fav.addEventListener('click', () => {
                item.favorite = !item.favorite;
                saveItems();
                renderItems();
            });

            const remove = document.createElement('button');
            remove.type = 'button';
            remove.textContent = '×';
            remove.title = 'Remove item';
            remove.setAttribute('aria-label', 'Remove ' + item.name);
            remove.style.cssText = styles.button + 'min-width:30px;color:#ff7777;font-size:16px;padding:4px;';
            remove.addEventListener('click', () => {
                items = items.filter(saved => String(saved.id) !== String(item.id));
                saveItems();
                renderItems();
            });

            row.append(open, fav, remove);
            list.appendChild(row);
        });
    }

    function start() {
        createToolbar();
        const observer = new MutationObserver(() => {
            if (!document.getElementById('aaa-market-favourites') && document.documentElement) createToolbar();
        });
        if (document.documentElement) observer.observe(document.documentElement, { childList: true, subtree: true });
        window.addEventListener('hashchange', () => {
            const box = document.getElementById('aaa-market-favourites');
            if (!box) return;
            const current = getCurrentMarketItem();
            const label = box.querySelector('#aaa-mf-current');
            const button = box.querySelector('#aaa-mf-add-current');
            if (!label || !button) return;
            if (!current) {
                label.textContent = 'Open an item-specific Item Market page, then try again.';
                button.disabled = true;
                button.style.opacity = '0.5';
            } else {
                const already = items.some(item => String(item.id) === String(current.id));
                label.textContent = current.name + ' · ID ' + current.id + (already ? ' · Already saved' : '');
                button.disabled = already;
                button.style.opacity = already ? '0.5' : '1';
            }
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
})();
, 'i').test(savedName))
            ? builtIn.name
            : (savedName || ('Item ' + id));
        return { id, name, favorite: Boolean(item.favorite) };
    }

    function readItems() {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
            if (Array.isArray(saved) && saved.length) {
                const repaired = saved.map(normaliseItem);
                // Older versions accidentally used ID 6 for Beer. Repair that saved shortcut.
                repaired.forEach(item => {
                    if (item.id === '6' && /beer/i.test(item.name)) {
                        item.id = '180';
                        item.name = 'Bottle of Beer';
                    }
                });
                localStorage.setItem(STORAGE_KEY, JSON.stringify(repaired));
                return repaired;
            }
        } catch (e) {
            console.warn('[AAA Market Favourites] Could not read saved items.', e);
        }
        return BUILT_IN_ITEMS.map(normaliseItem);
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

    function decode(value) {
        try { return decodeURIComponent(String(value).replace(/\+/g, ' ')); } catch (_) { return String(value); }
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

    function findItemIdInUrl(text) {
        const match = String(text || '').match(/[?&#]itemID(?:=|%3D)(\d+)/i) || String(text || '').match(/itemID=(\d+)/i);
        return match ? match[1] : null;
    }

    function findItemNameInUrl(text) {
        const match = String(text || '').match(/itemName=([^&#]+)/i);
        return match ? decode(match[1]) : '';
    }

    function cleanPossibleName(value) {
        const name = String(value || '').replace(/\s+/g, ' ').trim();
        if (!name || name.length > 120) return '';
        if (/^(item\s*\d+|undefined|null)$/i.test(name)) return '';
        return name;
    }

    function elementLabel(element) {
        if (!element) return '';
        const attributes = ['alt', 'title', 'aria-label', 'data-item-name', 'data-itemname'];
        for (const attribute of attributes) {
            const value = cleanPossibleName(element.getAttribute && element.getAttribute(attribute));
            if (value) return value;
        }
        if ('value' in element) {
            const value = cleanPossibleName(element.value);
            if (value) return value;
        }
        return '';
    }

    function nameNear(element) {
        let node = element;
        for (let i = 0; i < 8 && node; i++, node = node.parentElement) {
            const directLabel = elementLabel(node);
            if (directLabel) return directLabel;

            const selected = node.querySelector('option:checked');
            const selectedName = cleanPossibleName(selected && selected.textContent);
            if (selectedName) return selectedName;

            const heading = node.querySelector('h1,h2,h3,h4,.title,.item-name,[class*="item-name"],[class*="itemName"]');
            if (heading) {
                const headingName = cleanPossibleName(heading.textContent);
                if (headingName) return headingName;
            }
        }
        return '';
    }

    function getCurrentMarketItem() {
        const urlText = window.location.href + ' ' + window.location.hash + ' ' + window.location.search;
        let id = findItemIdInUrl(urlText);
        let name = findItemNameInUrl(urlText);

        const urlBuiltIn = id ? BUILT_IN_ITEMS.find(item => String(item.id) === String(id)) : null;
        // If the URL has an ID but no name, keep searching the rendered page.
        // The previous version returned "Item 897" here before inspecting the DOM.
        if (id && (name || urlBuiltIn)) {
            return { id: String(id), name: name || urlBuiltIn.name };
        }

        const candidates = [];
        if (id) {
            // Keep the URL ID as a fallback, but allow a named DOM candidate to win.
            candidates.push({ id: String(id), name: cleanPossibleName(name), priority: 0, fromUrl: true });
        }
        const selectors = [
            'a[href*="itemID="]',
            '[data-item-id]', '[data-itemid]', '[itemid]', '[data-item]',
            'img[src*="/images/items/"]', 'img[src*="/items/"]'
        ];

        selectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(element => {
                const text = element.getAttribute('href') || element.getAttribute('data-item-id') || element.getAttribute('data-itemid') || element.getAttribute('itemid') || element.getAttribute('data-item') || element.getAttribute('src') || '';
                const foundId = findItemIdInUrl(text) || (String(text).match(/(?:^|\/)items?\/(\d+)(?:\D|$)/i) || [])[1];
                if (!foundId) return;

                const foundName = findItemNameInUrl(text) || elementLabel(element) || nameNear(element) || '';
                const marketArea = element.closest('.item-market-wrap,.item-market,.market-wrap,[class*="item-market"],[class*="itemMarket"]');
                candidates.push({ id: String(foundId), name: cleanPossibleName(foundName), priority: marketArea ? 0 : 1 });
            });
        });

        // Torn can expose the selected item through a combobox/input rather than the URL.
        // Use the visible item name to improve the label when the item image only gives us an ID.
        const visibleNames = [];
        document.querySelectorAll('input,select,[role="combobox"]').forEach(element => {
            const value = element.tagName === 'SELECT'
                ? cleanPossibleName(element.options[element.selectedIndex] && element.options[element.selectedIndex].textContent)
                : elementLabel(element);
            if (value) visibleNames.push(value);
        });

        candidates.forEach(candidate => {
            if (candidate.name) return;
            const match = visibleNames.find(value => value && !/^search|item market|price|owner|quantity|buy$/i.test(value));
            if (match) candidate.name = match;
        });

        candidates.sort((a, b) => {
            const priorityDifference = a.priority - b.priority;
            if (priorityDifference) return priorityDifference;
            return Number(Boolean(b.name)) - Number(Boolean(a.name));
        });

        if (!candidates.length) return null;

        const best = candidates[0];
        const builtIn = BUILT_IN_ITEMS.find(item => String(item.id) === best.id);
        return { id: best.id, name: best.name || (builtIn ? builtIn.name : ('Item ' + best.id)) };
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
            <header id="aaa-mf-header" style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 10px;background:#2b2b36;border-radius:9px 9px 0 0;border-bottom:1px solid #444;font-weight:700;">
                <span id="aaa-mf-title" style="display:none;">⭐ AAA Market Favourites</span>
                <button id="aaa-mf-collapse" type="button" aria-label="Open favourites toolbar" title="Open favourites" style="${styles.button}color:#2ecc71;font-weight:bold;min-width:42px;">⭐</button>
            </header>
            <div id="aaa-mf-body" style="padding:10px;">
                <input id="aaa-mf-search" type="search" placeholder="Search saved items…" aria-label="Search saved items" style="${styles.input}margin-bottom:8px;">
                <div id="aaa-mf-list" style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;"></div>
                <div style="border-top:1px solid #444;padding-top:10px;">
                    <div style="font-weight:700;margin-bottom:7px;">Quick add</div>
                    <div id="aaa-mf-current" style="font-size:11px;color:#aaa;line-height:1.4;margin-bottom:7px;">Checking the current Item Market page…</div>
                    <button id="aaa-mf-add-current" type="button" style="width:100%;background:#2ecc71;color:#111;border:0;border-radius:6px;padding:9px;font-weight:700;font-size:13px;margin-bottom:8px;">+ Add current item</button>
                    <div style="font-size:11px;color:#777;text-align:center;margin:2px 0 8px;">— or add manually —</div>
                    <input id="aaa-mf-name" type="text" placeholder="Item name (e.g. Xanax)" style="${styles.input}margin-bottom:6px;">
                    <input id="aaa-mf-id" type="number" inputmode="numeric" placeholder="Torn item ID" style="${styles.input}margin-bottom:6px;">
                    <button id="aaa-mf-add" type="button" style="width:100%;background:#444;color:#fff;border:1px solid #666;border-radius:6px;padding:8px;font-weight:700;font-size:12px;">+ Add manually</button>
                </div>
            </div>`;

        root.appendChild(box);

        const body = box.querySelector('#aaa-mf-body');
        const collapse = box.querySelector('#aaa-mf-collapse');
        const title = box.querySelector('#aaa-mf-title');
        const currentLabel = box.querySelector('#aaa-mf-current');
        const currentButton = box.querySelector('#aaa-mf-add-current');

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

        try {
            const savedPosition = JSON.parse(localStorage.getItem(POSITION_KEY) || 'null');
            if (savedPosition && Number.isFinite(savedPosition.left) && Number.isFinite(savedPosition.top)) {
                box.style.left = Math.max(0, savedPosition.left) + 'px';
                box.style.top = Math.max(0, savedPosition.top) + 'px';
            }
        } catch (_) {}

        let dragState = null;
        let suppressNextClick = false;
        collapse.style.touchAction = 'none';
        collapse.style.cursor = 'grab';
        collapse.addEventListener('pointerdown', event => {
            if (event.button !== undefined && event.button !== 0) return;
            const rect = box.getBoundingClientRect();
            dragState = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, left: rect.left, top: rect.top, moved: false };
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
            box.style.right = 'auto';
            box.style.bottom = 'auto';
        });
        function finishDrag(event) {
            if (!dragState || (event && dragState.pointerId !== event.pointerId)) return;
            const wasDragged = dragState.moved;
            dragState = null;
            if (wasDragged) {
                try {
                    const rect = box.getBoundingClientRect();
                    localStorage.setItem(POSITION_KEY, JSON.stringify({ left: rect.left, top: rect.top }));
                } catch (_) {}
                setTimeout(() => { suppressNextClick = false; }, 0);
            }
        }
        collapse.addEventListener('pointerup', finishDrag);
        collapse.addEventListener('pointercancel', finishDrag);
        collapse.addEventListener('click', event => {
            if (suppressNextClick) {
                event.preventDefault();
                event.stopImmediatePropagation();
                suppressNextClick = false;
                return;
            }
            setCollapsed(!collapsed);
        });

        function refreshCurrentItem() {
            const current = getCurrentMarketItem();
            if (!current) {
                currentLabel.textContent = 'Open an item-specific Item Market page, then try again.';
                currentButton.disabled = true;
                currentButton.style.opacity = '0.5';
                return null;
            }
            const already = items.some(item => String(item.id) === String(current.id));
            currentLabel.textContent = current.name + ' · ID ' + current.id + (already ? ' · Already saved' : '');
            currentButton.disabled = already;
            currentButton.style.opacity = already ? '0.5' : '1';
            return current;
        }

        currentButton.addEventListener('click', () => {
            const current = refreshCurrentItem();
            if (!current) return;
            if (items.some(item => String(item.id) === String(current.id))) return;
            items.push({ id: current.id, name: current.name, favorite: false });
            saveItems();
            renderItems();
            refreshCurrentItem();
        });

        box.querySelector('#aaa-mf-search').addEventListener('input', renderItems);
        box.querySelector('#aaa-mf-add').addEventListener('click', () => {
            const nameInput = box.querySelector('#aaa-mf-name');
            const idInput = box.querySelector('#aaa-mf-id');
            const name = nameInput.value.trim();
            const id = idInput.value.trim();
            if (!name || !id || !/^\d+$/.test(id)) {
                alert('Please enter both an item name and its numeric Torn item ID.');
                return;
            }
            if (items.some(item => String(item.id) === id)) {
                alert('That item ID is already in your list.');
                return;
            }
            items.push({ id, name, favorite: false });
            saveItems();
            nameInput.value = '';
            idInput.value = '';
            renderItems();
            refreshCurrentItem();
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

        const visible = items
            .filter(item => String(item.name).toLowerCase().includes(query) || String(item.id).includes(query))
            .slice()
            .sort((a, b) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)) || a.name.localeCompare(b.name));

        if (!visible.length) {
            const empty = document.createElement('div');
            empty.textContent = 'No matching items. Add one below.';
            empty.style.cssText = 'color:#aaa;padding:8px 2px;';
            list.appendChild(empty);
            return;
        }

        visible.forEach(item => {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:5px;';

            const open = document.createElement('button');
            open.type = 'button';
            open.textContent = item.name;
            open.title = 'Open ' + item.name + ' in the Item Market';
            open.style.cssText = styles.button + 'flex:1;min-width:0;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border-color:#2ecc71;';
            open.addEventListener('click', () => goToItem(item));

            const fav = document.createElement('button');
            fav.type = 'button';
            fav.textContent = item.favorite ? '★' : '☆';
            fav.title = item.favorite ? 'Remove from favourites' : 'Add to favourites';
            fav.setAttribute('aria-label', fav.title);
            fav.style.cssText = styles.button + 'min-width:34px;color:' + (item.favorite ? '#f1c40f' : '#ddd') + ';font-size:16px;padding:4px;';
            fav.addEventListener('click', () => {
                item.favorite = !item.favorite;
                saveItems();
                renderItems();
            });

            const remove = document.createElement('button');
            remove.type = 'button';
            remove.textContent = '×';
            remove.title = 'Remove item';
            remove.setAttribute('aria-label', 'Remove ' + item.name);
            remove.style.cssText = styles.button + 'min-width:30px;color:#ff7777;font-size:16px;padding:4px;';
            remove.addEventListener('click', () => {
                items = items.filter(saved => String(saved.id) !== String(item.id));
                saveItems();
                renderItems();
            });

            row.append(open, fav, remove);
            list.appendChild(row);
        });
    }

    function start() {
        createToolbar();
        const observer = new MutationObserver(() => {
            if (!document.getElementById('aaa-market-favourites') && document.documentElement) createToolbar();
        });
        if (document.documentElement) observer.observe(document.documentElement, { childList: true, subtree: true });
        window.addEventListener('hashchange', () => {
            const box = document.getElementById('aaa-market-favourites');
            if (!box) return;
            const current = getCurrentMarketItem();
            const label = box.querySelector('#aaa-mf-current');
            const button = box.querySelector('#aaa-mf-add-current');
            if (!label || !button) return;
            if (!current) {
                label.textContent = 'Open an item-specific Item Market page, then try again.';
                button.disabled = true;
                button.style.opacity = '0.5';
            } else {
                const already = items.some(item => String(item.id) === String(current.id));
                label.textContent = current.name + ' · ID ' + current.id + (already ? ' · Already saved' : '');
                button.disabled = already;
                button.style.opacity = already ? '0.5' : '1';
            }
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
})();
