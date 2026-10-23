// ==UserScript==
// @name         AAA Snipe - PDA Diagnostic
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Temporary diagnostic to confirm Torn PDA is executing AAA userscripts.
// @author       You
// @match        *://*.torn.com/*
// @match        *://torn.com/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    function showDiagnostic() {
        if (document.getElementById('aaa-pda-diagnostic')) return;

        const box = document.createElement('div');
        box.id = 'aaa-pda-diagnostic';
        box.textContent = '🟢 AAA SCRIPT IS RUNNING';
        box.style.cssText = [
            'position:fixed',
            'top:20px',
            'left:20px',
            'z-index:2147483647',
            'background:#111',
            'color:#2ecc71',
            'border:3px solid #2ecc71',
            'border-radius:12px',
            'padding:15px 20px',
            'font:700 16px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',
            'box-shadow:0 4px 20px rgba(0,0,0,.8)',
            'pointer-events:none'
        ].join(';');

        (document.documentElement || document.body).appendChild(box);
        console.log('[AAA DIAGNOSTIC] Userscript executed successfully.');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', showDiagnostic, { once: true });
    } else {
        showDiagnostic();
    }

    setTimeout(showDiagnostic, 500);
    setTimeout(showDiagnostic, 1500);
    setTimeout(showDiagnostic, 3000);
})();
