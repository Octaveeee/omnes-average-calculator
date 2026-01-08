// ==UserScript==
// @name         Omnes Average Calculator
// @namespace    https://github.com/octavesaveaux/omnes-average-calculator
// @version      1.0
// @description  Calculate the average of the student's grades
// @author       Octave SAVEAUX
// @license      MIT
// @homepageURL     https://github.com/octavesaveaux/omnes-average-calculator
// @match        https://campus-boostcamp.omneseducation.com/myAcademicLife/myGrades
// @match        https://campusonline.inseec.net/note/*
// @require      https://cdnjs.cloudflare.com/ajax/libs/arrive/2.4.1/arrive.min.js
// @grant        none

// ==/UserScript==

(function() {
    'use strict';


    if (window.location.hostname !== 'campusonline.inseec.net') {
        console.log('Omnes Average Calculator: waiting happens inside the gradebook iframe');
        return;
    }

    const resultatsContainerId = "resultat-note";
    const resultatsTableId = "table_note";

    let messageShown = false;

    function showMessage() {
        if (!document.body) {
            setTimeout(showMessage, 100);
            return;
        }

        if (messageShown) return;
        messageShown = true;

        // Remove existing message if any
        const existing = document.getElementById('omnes-script-message');
        if (existing) {
            existing.remove();
        }

        // Add a visible message to confirm the script is working
        const message = document.createElement('div');
        message.id = 'omnes-script-message';
        message.textContent = '✅ Omnes Average Calculator script loaded!';
        message.style.cssText = 'position: fixed; top: 10px; right: 10px; background: #4CAF50; color: white; padding: 15px 20px; z-index: 99999; border-radius: 5px; font-family: Arial, sans-serif; font-size: 14px; box-shadow: 0 4px 6px rgba(0,0,0,0.3);';
        document.body.appendChild(message);
        
        console.log('✅ Message displayed!');
        
        // Remove the message after 5 seconds
        setTimeout(() => {
            message.style.opacity = '0';
            message.style.transition = 'opacity 0.5s';
            setTimeout(() => message.remove(), 500);
        }, 5000);
    }

    function tryShowWhenTableHasRows(table) {
        if (!table || messageShown) return;

        const tbody = table.querySelector('tbody');
        const rowsCount = tbody ? tbody.querySelectorAll('tr').length : 0;
        if (rowsCount > 0) {
            console.log('✅ Table content detected (rows:', rowsCount, ')');
            setTimeout(showMessage, 1000);
        }
    }

    function attachToContainer(container) {
        if (!container) return;
        console.log('✅ Container #resultat-note found, waiting for #table_note...');

        const existingTable = container.querySelector('#' + resultatsTableId);
        if (existingTable) {
            console.log('✅ Table #table_note already present');
            tryShowWhenTableHasRows(existingTable);
        }

        if (typeof container.arrive === 'function') {
            container.arrive('#' + resultatsTableId, function(table) {
                console.log('✅ Table #table_note found (arrive)');
                let tries = 0;
                const maxTries = 40;
                const id = setInterval(() => {
                    tries++;
                    tryShowWhenTableHasRows(table);
                    if (messageShown || tries >= maxTries) clearInterval(id);
                }, 500);
            });
        }
    }

    function init() {
        const containerNow = document.getElementById(resultatsContainerId);
        if (containerNow) {
            attachToContainer(containerNow);
        }

        if (typeof document.arrive === 'function') {
            document.arrive('#' + resultatsContainerId, function(container) {
                attachToContainer(container);
            });
        }

        let attempts = 0;
        const maxAttempts = 180;
        const intervalId = setInterval(() => {
            attempts++;
            if (messageShown || attempts >= maxAttempts) {
                clearInterval(intervalId);
                return;
            }

            const container = document.getElementById(resultatsContainerId);
            if (container) {
                attachToContainer(container);
                const table = container.querySelector('#' + resultatsTableId);
                if (table) tryShowWhenTableHasRows(table);
            }
        }, 500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();