// ==UserScript==
// @name         AAA - Torn Item Market Favourites
// @namespace    http://tampermonkey.net/
// @version      4.1
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
    const BUILT_IN_ITEMS = [
        { id: 6, name: 'Beer' },
        { id: 19, name: 'Cigar' },
        { id: 206, name: 'Xanax' },
        { id: 5, name: 'Bottle of Water' }
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
            if (Array.isArray(saved) && saved.length) return saved;
        } catch (e) {
            console.warn('[AAA Market Favourites] Could not read saved items.', e);
        }

        // Start with known item IDs rather than carrying over old target IDs,
        // which were originally used by the price-scanning version.

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
        // User-triggered navigation only. No requests, price reading, scanning, or automation.
        window.location.href = marketUrl(item);
    }

    function createToolbar() {
        if (document.getElementById('aaa-market-favourites')) return;
        const root = document.documentElement || document.body;
        if (!root) return;

        const box = document.createElement('section');
        box.id = 'aaa-market-favourites';
        box.style.cssText = styles.toolbar;
        // Start as a compact floating launcher on every page load.
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
                <div style="border-top:1px solid #444;padding-top:10px;">
                    <div style="font-weight:700;margin-bottom:7px;">Add an item</div>
                    <input id="aaa-mf-name" type="text" placeholder="Item name (e.g. Xanax)" style="${styles.input}margin-bottom:6px;">
                    <input id="aaa-mf-id" type="number" inputmode="numeric" placeholder="Torn item ID" style="${styles.input}margin-bottom:6px;">
                    <button id="aaa-mf-add" type="button" style="width:100%;background:#2ecc71;color:#111;border:0;border-radius:6px;padding:9px;font-weight:700;font-size:13px;">+ Add item</button>
                    <div style="font-size:11px;color:#aaa;line-height:1.4;margin-top:7px;">Tip: enter the item's exact Torn ID so the shortcut opens the right market search.</div>
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
            box.style.borderRadius = collapsed ? '12px' : '12px';
            box.querySelector('#aaa-mf-header').style.borderRadius = collapsed ? '9px' : '9px 9px 0 0';
            box.querySelector('#aaa-mf-header').style.borderBottom = collapsed ? '0' : '1px solid #444';
        }

        setCollapsed(true);
        collapse.addEventListener('click', () => setCollapsed(!collapsed));

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
        });

        renderItems();
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
        // Re-add if Torn replaces its page content during navigation.
        const observer = new MutationObserver(() => {
            if (!document.getElementById('aaa-market-favourites') && document.documentElement) {
                createToolbar();
            }
        });
        if (document.documentElement) observer.observe(document.documentElement, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }
})();
