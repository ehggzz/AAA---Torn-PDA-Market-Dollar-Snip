// ==UserScript==
// @name         AAA - Torn PDA Market & Dollar Snipe
// @namespace    http://tampermonkey.net/
// @version      3.1
// @description  PDA Mobile: Minimised compact pill, item autocomplete, $1 sale detector, and auto-reset offscreen menu.
// @author       You
// @match        https://www.torn.com/imarket.php*
// @grant        none
// ====/UserScript==

(function() {
    'use strict';

    // NPC Resale Item Database
    const NPC_DATABASE = [
        { id: 180, name: "Beer", npcPrice: 10 },
        { id: 181, name: "Cigar", npcPrice: 20 },
        { id: 226, name: "Bottle of Beer", npcPrice: 100 },
        { id: 227, name: "Bottle of Red Wine", npcPrice: 500 },
        { id: 228, name: "Bottle of Kahlua", npcPrice: 1000 },
        { id: 229, name: "Bottle of Sake", npcPrice: 1000 },
        { id: 230, name: "Bottle of Tequila", npcPrice: 1000 },
        { id: 366, name: "X-Mass Cupcake", npcPrice: 500 },
        { id: 367, name: "Fruitcake", npcPrice: 500 },
        { id: 368, name: "Gingerbread Man", npcPrice: 500 },
        { id: 182, name: "Cannabis", npcPrice: 500 },
        { id: 183, name: "Ecstasy", npcPrice: 1000 },
        { id: 184, name: "Ketamine", npcPrice: 1000 },
        { id: 185, name: "LSD", npcPrice: 1000 },
        { id: 186, name: "Opium", npcPrice: 1000 },
        { id: 187, name: "PCP", npcPrice: 1000 },
        { id: 188, name: "Shrooms", npcPrice: 1000 },
        { id: 189, name: "Speed", npcPrice: 1000 },
        { id: 190, name: "Vicodin", npcPrice: 1000 },
        { id: 191, name: "Xanax", npcPrice: 1000 },
        { id: 17, name: "Blank CD", npcPrice: 10 },
        { id: 18, name: "DVD", npcPrice: 10 },
        { id: 19, name: "Brick", npcPrice: 1 }
    ];

    const DEFAULT_TARGETS = {
        180: { name: "Beer", npcPrice: 10 },
        181: { name: "Cigar", npcPrice: 20 },
        366: { name: "X-Mass Cupcake", npcPrice: 500 },
        367: { name: "Fruitcake", npcPrice: 500 },
        226: { name: "Bottle of Beer", npcPrice: 100 }
    };

    let targetItems = JSON.parse(localStorage.getItem('aaa_npc_targets')) || DEFAULT_TARGETS;

    function saveTargets() {
        localStorage.setItem('aaa_npc_targets', JSON.stringify(targetItems));
    }

    function cycleTarget(direction) {
        const targetIDs = Object.keys(targetItems);
        if (targetIDs.length === 0) return;

        const urlParams = new URLSearchParams(window.location.hash.replace('#/', '?'));
        const currentID = urlParams.get('type') || urlParams.get('typeID');
        let currentIndex = targetIDs.indexOf(currentID);

        if (direction === 'next') {
            let nextIndex = (currentIndex + 1) % targetIDs.length;
            window.location.hash = `#/p=shop&type=${targetIDs[nextIndex]}`;
        } else {
            let prevIndex = (currentIndex - 1 + targetIDs.length) % targetIDs.length;
            window.location.hash = `#/p=shop&type=${targetIDs[prevIndex]}`;
        }
    }
        function createToolbar() {
        let toolbar = document.getElementById('aaa-npc-toolbar');
        if (toolbar) return;

        toolbar = document.createElement('div');
        toolbar.id = 'aaa-npc-toolbar';

        let savedPos = JSON.parse(localStorage.getItem('aaa_toolbar_pos_mobile')) || { top: '60px', left: '10px' };
        let topVal = parseInt(savedPos.top, 10);
        let leftVal = parseInt(savedPos.left, 10);

        if (isNaN(topVal) || topVal < 0 || topVal > window.innerHeight - 50) savedPos.top = '60px';
        if (isNaN(leftVal) || leftVal < 0 || leftVal > window.innerWidth - 50) savedPos.left = '10px';

        toolbar.style.cssText = `
            position: fixed;
            top: ${savedPos.top};
            left: ${savedPos.left};
            z-index: 999999;
            background: #1e1e24;
            color: #f1f1f1;
            border: 2px solid #2ecc71;
            border-radius: 10px;
            box-shadow: 0 4px 18px rgba(0,0,0,0.6);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 13px;
            width: 280px;
            max-width: 90vw;
            overflow: visible;
            touch-action: none;
        `;

        toolbar.innerHTML = `
            <div id="aaa-tb-header" style="background: #2b2b36; padding: 8px 10px; cursor: move; font-weight: bold; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #444; border-radius: 8px 8px 0 0; user-select: none;">
                <span>🎯 AAA Snipe</span>
                <button id="aaa-tb-toggle" style="background:#333; border:1px solid #555; color:#2ecc71; border-radius:4px; padding:2px 8px; font-weight:bold; cursor:pointer;">−</button>
            </div>
            <div id="aaa-tb-body" style="padding: 10px;">
                <div style="display:flex; gap:8px; margin-bottom:10px;">
                    <button id="aaa-nav-prev" style="flex:1; padding:8px; background:#2b2b36; color:#2ecc71; border:1px solid #2ecc71; border-radius:6px; font-weight:bold; font-size:12px; cursor:pointer;">◀ Prev Item</button>
                    <button id="aaa-nav-next" style="flex:1; padding:8px; background:#2ecc71; color:#111; border:1px solid #2ecc71; border-radius:6px; font-weight:bold; font-size:12px; cursor:pointer;">Next Item ▶</button>
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
                <button id="aaa-btn-add" style="width:100%; padding:8px; background:#2ecc71; color:#111; font-weight:bold; border:none; border-radius:6px; cursor:pointer; font-size:12px;">+ Save Item Target</button>
            </div>
        `;

        document.body.appendChild(toolbar);

        renderTargetButtons();
        setupAutocomplete();
        makeDraggable(toolbar);

        toolbar.querySelector('#aaa-nav-prev').addEventListener('click', () => cycleTarget('prev'));
        toolbar.querySelector('#aaa-nav-next').addEventListener('click', () => cycleTarget('next'));

        const toggleBtn = toolbar.querySelector('#aaa-tb-toggle');
        const body = toolbar.querySelector('#aaa-tb-body');
        const header = toolbar.querySelector('#aaa-tb-header');
        let collapsed = false;

        toggleBtn.addEventListener('click', () => {
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
                header.style.borderRadius = '8px 8px 0 0';
                toggleBtn.textContent = '−';
            }
        });

        toolbar.querySelector('#aaa-btn-add').addEventListener('click', () => {
            const id = toolbar.querySelector('#aaa-add-id').value.trim();
            const name = toolbar.querySelector('#aaa-add-name').value.trim() || `Item ${id}`;
            const price = parseInt(toolbar.querySelector('#aaa-add-price').value.trim(), 10);

            if (id && price) {
                targetItems[id] = { name: name, npcPrice: price };
                saveTargets();
                renderTargetButtons();
                toolbar.querySelector('#aaa-search-input').value = '';
                toolbar.querySelector('#aaa-add-id').value = '';
                toolbar.querySelector('#aaa-add-name').value = '';
                toolbar.querySelector('#aaa-add-price').value = '';
            }
        });
    }

    function setupAutocomplete() {
        const searchInput = document.getElementById('aaa-search-input');
        const list = document.getElementById('aaa-autocomplete-list');
        if (!searchInput || !list) return;

        searchInput.addEventListener('input', () => {
            const query = searchInput.value.toLowerCase().trim();
            if (!query) {
                list.style.display = 'none';
                return;
            }

            const matches = NPC_DATABASE.filter(item => item.name.toLowerCase().includes(query));
            if (matches.length === 0) {
                list.style.display = 'none';
                return;
            }

            list.innerHTML = '';
            matches.forEach(item => {
                const itemRow = document.createElement('div');
                itemRow.style.cssText = 'padding:7px 10px; cursor:pointer; border-bottom:1px solid #333; font-size:12px; color:#eee; display:flex; justify-content:space-between;';
                itemRow.innerHTML = `<span>${item.name}</span> <span style="color:#2ecc71;">$${item.npcPrice.toLocaleString()}</span>`;

                itemRow.addEventListener('click', () => {
                    document.getElementById('aaa-add-id').value = item.id;
                    document.getElementById('aaa-add-name').value = item.name;
                    document.getElementById('aaa-add-price').value = item.npcPrice;
                    searchInput.value = item.name;
                    list.style.display = 'none';
                });

                list.appendChild(itemRow);
            });

            list.style.display = 'block';
        });

        document.addEventListener('click', (e) => {
            if (!searchInput.contains(e.target) && !list.contains(e.target)) {
                list.style.display = 'none';
            }
        });
    }
        function renderTargetButtons() {
        const container = document.getElementById('aaa-target-buttons');
        if (!container) return;

        container.innerHTML = '';
        Object.keys(targetItems).forEach(id => {
            const item = targetItems[id];
            const btn = document.createElement('button');
            btn.style.cssText = `
                background: #2b2b36; color: #fff; border: 1px solid #444;
                padding: 5px 8px; font-size: 11px; border-radius: 5px;
                cursor: pointer; display: flex; align-items: center; gap: 6px;
                touch-action: manipulation;
            `;
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
        let isDragging = false;
        let offsetX = 0, offsetY = 0;

        function startDrag(e) {
            if (e.target.tagName === 'BUTTON') return;
            isDragging = true;
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            offsetX = clientX - element.offsetLeft;
            offsetY = clientY - element.offsetTop;
        }

        function moveDrag(e) {
            if (!isDragging) return;
            if (e.touches) e.preventDefault();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;

            let left = Math.max(0, Math.min(window.innerWidth - element.offsetWidth, clientX - offsetX));
            let top = Math.max(0, Math.min(window.innerHeight - element.offsetHeight, clientY - offsetY));

            element.style.left = `${left}px`;
            element.style.top = `${top}px`;
        }

        function stopDrag() {
            if (isDragging) {
                isDragging = false;
                localStorage.setItem('aaa_toolbar_pos_mobile', JSON.stringify({
                    top: element.style.top,
                    left: element.style.left
                }));
            }
        }

        header.addEventListener('mousedown', startDrag);
        document.addEventListener('mousemove', moveDrag);
        document.addEventListener('mouseup', stopDrag);

        header.addEventListener('touchstart', startDrag, { passive: false });
        document.addEventListener('touchmove', moveDrag, { passive: false });
        document.addEventListener('touchend', stopDrag);
    }

    function scanListings() {
        const urlParams = new URLSearchParams(window.location.hash.replace('#/', '?'));
        const currentID = urlParams.get('type');
        const listings = document.querySelectorAll('.item-market-wrap .shop-market-list > li');

        let foundDollarSale = false;

        listings.forEach(row => {
            const priceElem = row.querySelector('.price');
            if (!priceElem) return;

            const priceText = priceElem.textContent.replace(/[^0-9]/g, '');
            const price = parseInt(priceText, 10);

            if (!price) return;

            if (price === 1) {
                foundDollarSale = true;
                row.style.backgroundColor = 'rgba(241, 196, 15, 0.45)';
                row.style.border = '2px solid #f1c40f';

                if (!row.querySelector('.aaa-dollar-tag')) {
                    const tag = document.createElement('div');
                    tag.className = 'aaa-dollar-tag';
                    tag.style.cssText = 'color: #f1c40f; font-weight: bold; font-size: 11px; margin-top: 2px;';
                    tag.textContent = '🚨 $1 DOLLAR SALE!';
                    priceElem.appendChild(tag);
                }
            } else if (targetItems[currentID]) {
                const npcValue = targetItems[currentID].npcPrice;
                if (price < npcValue) {
                    const profit = npcValue - price;
                    row.style.backgroundColor = 'rgba(46, 204, 113, 0.35)';
                    row.style.border = '1px solid #2ecc71';

                    if (!row.querySelector('.aaa-profit-tag')) {
                        const tag = document.createElement('div');
                        tag.className = 'aaa-profit-tag';
                        tag.style.cssText = 'color: #2ecc71; font-weight: bold; font-size: 11px; margin-top: 2px;';
                        tag.textContent = `+${profit.toLocaleString()} NPC Profit`;
                        priceElem.appendChild(tag);
                    }
                }
            }
        });

        if (foundDollarSale && navigator.vibrate) {
            navigator.vibrate([100, 50, 100]);
        }
    }

    window.addEventListener('dblclick', () => {
        const toolbar = document.getElementById('aaa-npc-toolbar');
        if (toolbar) {
            toolbar.style.top = '60px';
            toolbar.style.left = '10px';
            localStorage.setItem('aaa_toolbar_pos_mobile', JSON.stringify({ top: '60px', left: '10px' }));
        }
    });

    setInterval(() => {
        if (window.location.href.includes('imarket.php')) {
            createToolbar();
            scanListings();
        }
    }, 1000);
})();
