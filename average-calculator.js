// ==UserScript==
// @name         Omnes Average Calculator
// @namespace    https://github.com/octavesaveaux/omnes-average-calculator
// @version      1.0
// @description  Calculate the average of the student's grades
// @author       Octave SAVEAUX
// @license      MIT
// @homepageURL     https://github.com/octavesaveaux/omnes-average-calculator
// @match        https://boostcamp.omneseducation.com/*
// @grant        none

// ==/UserScript==

(function() {
    'use strict';


    function showMessage() {
        if (!document.body) {
            setTimeout(showMessage, 100);
            return;
        }

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
        
        // Remove the message after 5 seconds
        setTimeout(() => {
            message.style.opacity = '0';
            message.style.transition = 'opacity 0.5s';
            setTimeout(() => message.remove(), 500);
        }, 5000);
    }

    // Wait for page to load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', showMessage);
    } else {
        showMessage();
    }

})();