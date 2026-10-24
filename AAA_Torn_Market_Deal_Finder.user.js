// ==UserScript==
// @name         AAA - Torn Market Deal Finder
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  User-triggered NPC-profit and $1 deal highlighting for the currently viewed Torn market page.
// @author       You
// @match        *://*.torn.com/*
// @match        *://torn.com/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const KEY = 'aaa_market_deal_api_key_v1';
    const CACHE = 'aaa_market_deal_npc_cache_v1';
    const STYLE_ID = 'aaa-market-deal-finder-style';
    const PANEL_ID = 'aaa-market-deal-finder';
    const ROW_SELECTOR = '.item-market-wrap .shop-market-list > li, #bazaarRoot li';

    function money(value) {
        return '$' + Number(value || 0).toLocaleString();
    }

    function currentItemId() {
        const text = window.location.href + ' ' + window.location.hash + ' ' + window.location.search;
        const match = text.match(/[?&#]itemID(?:=|%3D)(\d+)/i) || text.match(/itemID=(\d+)/i);
        if (match) return match[1];
        const hash = new URLSearchParams(window.location.hash.replace(/^#\/?/, '?'));
        return hash.get('type') || hash.get('typeID') || null;
    }

    function readCache() {
        try { return JSON.parse(localStorage.getItem(CACHE) || '{}'); } catch (_) { return {}; }
    }

    function writeCache(cache) {
        try { localStorage.setItem(CACHE, JSON.stringify(cache)); } catch (_) {}
    }

    function getSellPrice(data, id) {
        const item = data && data.items && (data.items[id] || data.items[String(id)]);
        if (!item) return null;
        const value = item.value || item;
        const price = Number(value.sell_price ?? value.sellPrice ?? value.sell);
        return Number.isFinite(price) && price > 0 ? price : null;
    }

    async function getNpcPrice(id) {
        const cache = readCache();
        const cached = cache[id];
        if (cached && cached.price && Date.now() - cached.time < 7 * 86400000) return cached.price;

        let apiKey = localStorage.getItem(KEY) || '';
        if (!apiKey) {
            apiKey = window.prompt('AAA Deal Finder needs a Torn API key to get the NPC sell price.\n\nUse a Public Only key with the torn/items permission. The key is stored only in this browser and sent only to api.torn.com.\n\nPaste your key here:');
            if (!apiKey) return null;
            apiKey = apiKey.trim();
            if (!apiKey) return null;
            localStorage.setItem(KEY, apiKey);
        }

        const url = 'https://api.torn.com/torn/' + encodeURIComponent(id) + '?selections=items&key=' + encodeURIComponent(apiKey);
        const response = await fetch(url);
        const data = await response.json();
        if (!response.ok || data.error) {
            if (data && data.error && /key|access|permission|invalid/i.test(String(data.error.error || data.error))) {
                localStorage.removeItem(KEY);
            }
            throw new Error(data && data.error ? String(data.error.error || data.error) : 'Torn API request failed');
        }
        const price = getSellPrice(data, id);
        if (price) {
            cache[id] = { price, time: Date.now() };
            writeCache(cache);
        }
        return price;
    }

    function injectStyle() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #${PANEL_ID}{position:fixed!important;right:10px!important;bottom:18px!important;z-index:2147483647!important;background:#1e1e24;color:#f1f1f1;border:2px solid #2ecc71;border-radius:10px;box-shadow:0 4px 18px rgba(0,0,0,.8);font:13px -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;padding:8px;width:210px;box-sizing:border-box}
            #${PANEL_ID} button{width:100%;background:#2ecc71;color:#111;border:0;border-radius:6px;padding:8px;font-weight:700;cursor:pointer}
            #${PANEL_ID} .aaa-deal-status{font-size:11px;color:#aaa;margin-top:6px;line-height:1.35}
            .aaa-npc-profit-row{background:rgba(46,204,113,.30)!important;outline:2px solid #2ecc71!important;outline-offset:-2px!important}
            .aaa-dollar-row{background:rgba(241,196,15,.40)!important;outline:2px solid #f1c40f!important;outline-offset:-2px!important}
            .aaa-deal-tag{font-weight:700;font-size:11px;margin-top:3px;line-height:1.25}
            .aaa-deal-profit{color:#2ecc71}.aaa-deal-dollar{color:#f1c40f}
        `;
        document.documentElement.appendChild(style);
    }

    function addTag(priceElement, className, text) {
        const tag = document.createElement('div');
        tag.className = 'aaa-deal-tag ' + className;
        tag.textContent = text;
        priceElement.appendChild(tag);
    }

    function clearHighlights() {
        document.querySelectorAll('.aaa-npc-profit-row,.aaa-dollar-row').forEach(row => row.classList.remove('aaa-npc-profit-row','aaa-dollar-row'));
        document.querySelectorAll('.aaa-deal-tag').forEach(tag => tag.remove());
    }

    function scanVisibleListings(npcPrice, itemId) {
        clearHighlights();
        const rows = Array.from(document.querySelectorAll(ROW_SELECTOR));
        let dollarDeals = 0;
        let npcDeals = 0;
        rows.forEach(row => {
            const priceElement = row.querySelector('.price,[class*="price"]');
            if (!priceElement) return;
            const match = priceElement.textContent.replace(/\s+/g, ' ').match(/\$\s*([\d,]+)/);
            if (!match) return;
            const price = Number(match[1].replace(/,/g, ''));
            if (!Number.isFinite(price)) return;

            if (price === 1) {
                row.classList.add('aaa-dollar-row');
                addTag(priceElement, 'aaa-deal-dollar', '🚨 $1 DOLLAR DEAL');
                dollarDeals++;
            }
            if (npcPrice && price < npcPrice) {
                const profit = npcPrice - price;
                row.classList.add('aaa-npc-profit-row');
                addTag(priceElement, 'aaa-deal-profit', '🟢 NPC ' + money(npcPrice) + ' → +' + money(profit) + ' profit');
                npcDeals++;
            }
        });
        return { rows: rows.length, dollarDeals, npcDeals, itemId };
    }

    function isActivePage() {
        return document.visibilityState === 'visible' && document.hasFocus();
    }

    function createPanel() {
        if (document.getElementById(PANEL_ID)) return;
        injectStyle();
        const panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.innerHTML = '<button type="button" id="aaa-deal-scan">💰 Scan visible deals</button><div class="aaa-deal-status">Only scans the page you are actively viewing.</div>';
        (document.body || document.documentElement).appendChild(panel);
        panel.querySelector('#aaa-deal-scan').addEventListener('click', async () => {
            if (!isActivePage()) {
                panel.querySelector('.aaa-deal-status').textContent = 'Please focus this Torn tab/window first.';
                return;
            }
            const status = panel.querySelector('.aaa-deal-status');
            const id = currentItemId();
            if (!id) {
                status.textContent = 'Open a specific item market/bazaar page first so I know which NPC price to use.';
                return;
            }
            const button = panel.querySelector('#aaa-deal-scan');
            button.disabled = true;
            button.style.opacity = '.6';
            status.textContent = 'Checking NPC sell price…';
            try {
                const npcPrice = await getNpcPrice(id);
                if (!npcPrice) throw new Error('No NPC sell price is available for this item.');
                const result = scanVisibleListings(npcPrice, id);
                status.textContent = 'Found ' + result.npcDeals + ' NPC-profit deal' + (result.npcDeals === 1 ? '' : 's') + (result.dollarDeals ? ' and ' + result.dollarDeals + ' $1 deal' + (result.dollarDeals === 1 ? '' : 's') : '') + '. NPC pays ' + money(npcPrice) + ' each.';
            } catch (error) {
                status.textContent = 'Could not scan: ' + String(error.message || error);
            } finally {
                button.disabled = false;
                button.style.opacity = '1';
            }
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', createPanel, { once: true });
    else createPanel();
})();
