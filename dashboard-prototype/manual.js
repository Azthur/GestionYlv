/**
 * Manual Interactivo - Lógica de Navegación e Interactividad
 */
(function() {
    'use strict';

    document.addEventListener('DOMContentLoaded', () => {
        initNavigation();
        initMermaid();
        // Handle initial load with hash
        handleHashChange();
    });

    // Handle hash change while on the page
    window.addEventListener('hashchange', handleHashChange);

    function initNavigation() {
        const navLinks = document.querySelectorAll('.manual-nav-list a');
        
        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                const targetHash = link.getAttribute('href');
                if (targetHash.startsWith('#')) {
                    e.preventDefault();
                    const targetId = targetHash.substring(1);
                    switchSection(targetId);
                }
            });
        });
    }

    function switchSection(targetId) {
        const sections = document.querySelectorAll('.content-section');
        const navLinks = document.querySelectorAll('.manual-nav-list a');
        const targetSection = document.getElementById('content-' + targetId);
        const targetLink = document.querySelector(`.manual-nav-list a[href="#${targetId}"]`);

        if (targetSection && targetLink) {
            // Update UI
            sections.forEach(s => s.classList.remove('active'));
            navLinks.forEach(l => l.classList.remove('active'));

            targetSection.classList.add('active');
            targetLink.classList.add('active');

            // Update URL without jump if it was a manual click
            if (window.location.hash !== '#' + targetId) {
                history.pushState(null, null, '#' + targetId);
            }

            // Scroll to top of content
            window.scrollTo({ top: 0, behavior: 'smooth' });

            // Re-run Mermaid in case it was hidden during initial render
            if (window.mermaid) {
                mermaid.init(undefined, targetSection.querySelectorAll('.mermaid'));
            }
        }
    }

    function initMermaid() {
        if (window.mermaid) {
            mermaid.initialize({
                startOnLoad: true,
                theme: 'neutral', // Better for mixed modes
                fontFamily: 'Inter',
                flowchart: { htmlLabels: true, curve: 'basis' },
                securityLevel: 'loose'
            });
        }
    }

    function handleHashChange() {
        const hash = window.location.hash.substring(1);
        if (hash) {
            switchSection(hash);
        } else {
            // Default to intro if no hash
            switchSection('intro');
        }
    }

})();

