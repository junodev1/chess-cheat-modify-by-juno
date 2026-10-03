// ─── Lichess Platform Adapter ───
// Handles board detection and FEN reading for lichess.org

(function () {
  'use strict';

  // ─── Board detection ───
  function detectGame() {
    // Check for both analysis and play boards
    return !!document.querySelector('cg-board, .cg-wrap');
  }

  // ─── FEN reading ───
  function readFen() {
    // 1. Dedicated .fen element (analysis board)
    const fenEl = document.querySelector('.fen');
    if (fenEl) return fenEl.textContent.trim();

    // 2. og:description meta (contains FEN on game pages)
    const meta = document.querySelector('meta[property="og:description"]');
    if (meta) {
      const match = meta.content?.match(
        /^([rnbqkpRNBQKP1-8/]+ [wb] [KQkq-]+ [a-h1-8-]+ \d+ \d+)/
      );
      if (match) return match[1];
    }

    // 3. Try to get FEN from Lichess's internal store (more reliable for SPA)
    if (typeof lichess !== 'undefined' && lichess.store) {
      try {
        const state = lichess.store.getState();
        if (state.game) {
          return state.game.fen;
        }
      } catch (e) {
        // Ignore errors if store structure changes
      }
    }

    return null;
  }

  function requestFen() {
    return Promise.resolve(readFen());
  }

  // ─── Auto-push on move change ───
  let lastKnownFen = '';
  let fenPollInterval = null;

  function stopPolling() {
    if (fenPollInterval) {
      clearInterval(fenPollInterval);
      fenPollInterval = null;
    }
  }

  function startPolling() {
    stopPolling(); // Clear existing interval
    
    fenPollInterval = setInterval(() => {
      const fen = readFen();
      if (fen && fen !== lastKnownFen) {
        lastKnownFen = fen;
        ChessCore.handleFenChange(fen);
      }
    }, 500);
  }

  function onGameDetected() {
    startPolling();
  }

  // ─── Handle SPA Navigation Events ───
  function initLichessIntegration() {
    // Wait for Lichess global object to be available
    if (typeof lichess === 'undefined') {
      setTimeout(initLichessIntegration, 100);
      return;
    }

    // Listen for game end/new game events
    if (lichess.pubsub) {
      lichess.pubsub.subscribe('game:new', () => {
        console.log('[ChessCheat] New game detected, resetting state.');
        lastKnownFen = ''; // Reset FEN tracker
        // Optionally call ChessCore.reset() here if you have one
      });

      lichess.pubsub.subscribe('game:end', () => {
        console.log('[ChessCheat] Game ended.');
        // Stop polling until next game starts
        stopPolling();
      });
      
      // Also handle analysis moves
      lichess.pubsub.subscribe('analysis:new', () => {
        console.log('[ChessCheat] New analysis detected.');
        lastKnownFen = '';
        startPolling();
      });
    }

    // Initial setup
    if (detectGame()) {
      onGameDetected();
    }
  }

  // ─── Register with core ───
  // Ensure we wait for Lichess to load before registering fully
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLichessIntegration);
  } else {
    initLichessIntegration();
  }

  ChessCore.register('lichess.org', {
    detectGame,
    requestFen,
    onGameDetected,
  });
})();
