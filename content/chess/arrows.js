// ─── Arrow Overlay for Chess Board ───
// Draws move-suggestion arrows on the chess board.
// Loaded BEFORE core.js; used via the global `ChessArrows` object.

// eslint-disable-next-line no-var
var ChessArrows = (function () {
  'use strict';

  let svg = null;
  let visible = true;
  let cached = [];

  let observer = null;
  let currentBoard = null;
  let resizeObserver = null;

  let positionTimer = null;

  // ─────────────────────────────────────────────
  // Arrow styles
  // Best → worst
  // Green arrows
  // ─────────────────────────────────────────────

  const STYLES = [
    { color: 'rgba(0, 220, 80, 0.90)', w: 22 },  // #1
    { color: 'rgba(0, 220, 80, 0.60)', w: 17 },  // #2
    { color: 'rgba(0, 220, 80, 0.38)', w: 14 },  // #3
  ];

  // ─────────────────────────────────────────────
  // Board helpers
  // ─────────────────────────────────────────────

  function getBoard() {
    // Chess.com
    const chessComBoard = document.querySelector('wc-chess-board');

    if (chessComBoard) {
      return chessComBoard;
    }

    // Lichess / Chessground
    const lichessBoard = document.querySelector('cg-board');

    if (lichessBoard) {
      return lichessBoard;
    }

    return null;
  }

  function isLichessBoard(board) {
    return board && board.tagName === 'CG-BOARD';
  }

  function isChessComBoard(board) {
    return board && board.tagName === 'WC-CHESS-BOARD';
  }

  function isFlipped() {
    const b = getBoard();

    if (!b) return false;

    // Page script can explicitly tell us.
    if (b.dataset && b.dataset.bmFlipped === '1') {
      return true;
    }

    if (b.dataset && b.dataset.bmFlipped === '0') {
      return false;
    }

    // Chess.com
    if (isChessComBoard(b)) {
      if (b.classList.contains('flipped')) {
        return true;
      }

      const parentFlipped = b.closest('.flipped');

      if (parentFlipped) {
        return true;
      }

      return false;
    }

    // Lichess Chessground
    if (isLichessBoard(b)) {
      const wrap = b.closest('.cg-wrap');

      if (wrap) {
        if (wrap.classList.contains('orientation-black')) {
          return true;
        }

        if (wrap.classList.contains('orientation-white')) {
          return false;
        }

        // Some versions use orientation classes on another parent.
        const blackParent = wrap.closest('.orientation-black');

        if (blackParent) {
          return true;
        }
      }

      // Fallback: inspect chessground container.
      const cg = b.closest('.cg-wrap, .cg-board-wrap');

      if (cg && cg.classList.contains('orientation-black')) {
        return true;
      }

      return false;
    }

    return false;
  }

  // ─────────────────────────────────────────────
  // Square → SVG coordinates
  // ─────────────────────────────────────────────

  function sqXY(sq, flip) {
    if (!sq || sq.length < 2) {
      return { x: 0, y: 0 };
    }

    const file = sq.charCodeAt(0) - 97;
    const rank = parseInt(sq[1], 10) - 1;

    if (
      file < 0 ||
      file > 7 ||
      rank < 0 ||
      rank > 7
    ) {
      return { x: 0, y: 0 };
    }

    return flip
      ? {
          x: (7 - file) * 100 + 50,
          y: rank * 100 + 50,
        }
      : {
          x: file * 100 + 50,
          y: (7 - rank) * 100 + 50,
        };
  }

  // ─────────────────────────────────────────────
  // SVG container
  // ─────────────────────────────────────────────

  function ensureSVG() {
    const board = getBoard();

    if (!board) {
      return null;
    }

    /*
     * Lichess can replace <cg-board> while navigating
     * games / changing positions.
     *
     * If the board changed, disconnect the old observer
     * and attach to the new board.
     */
    if (currentBoard !== board) {
      currentBoard = board;

      if (resizeObserver) {
        try {
          resizeObserver.disconnect();
        } catch (_) {}
      }

      resizeObserver = new ResizeObserver(() => {
        syncPosition();
      });

      try {
        resizeObserver.observe(board);
      } catch (_) {}

      // Re-render existing arrows after a board replacement.
      if (svg && cached.length > 0) {
        setTimeout(() => {
          if (cached.length > 0) {
            draw(cached);
          }
        }, 0);
      }
    }

    // Existing SVG is still valid.
    if (svg && document.body.contains(svg)) {
      syncPosition();
      return svg;
    }

    // Remove any stale overlay.
    const old = document.getElementById('bm-arrows');

    if (old) {
      old.remove();
    }

    // Create SVG.
    svg = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'svg'
    );

    svg.id = 'bm-arrows';

    svg.setAttribute(
      'viewBox',
      '0 0 800 800'
    );

    svg.setAttribute(
      'preserveAspectRatio',
      'none'
    );

    svg.style.position = 'fixed';
    svg.style.pointerEvents = 'none';
    svg.style.zIndex = '999999';
    svg.style.display = visible ? '' : 'none';
    svg.style.margin = '0';
    svg.style.padding = '0';
    svg.style.overflow = 'visible';

    document.body.appendChild(svg);

    syncPosition();

    // Watch board size changes.
    if (resizeObserver) {
      try {
        resizeObserver.disconnect();
      } catch (_) {}
    }

    resizeObserver = new ResizeObserver(() => {
      syncPosition();
    });

    try {
      resizeObserver.observe(board);
    } catch (_) {}

    return svg;
  }

  // ─────────────────────────────────────────────
  // Keep SVG exactly over the board
  // ─────────────────────────────────────────────

  function syncPosition() {
    if (!svg) {
      return;
    }

    const board = getBoard();

    if (!board) {
      return;
    }

    /*
     * If Lichess replaced the board element, update
     * our reference and observers.
     */
    if (currentBoard !== board) {
      currentBoard = board;

      if (resizeObserver) {
        try {
          resizeObserver.disconnect();
        } catch (_) {}
      }

      resizeObserver = new ResizeObserver(() => {
        syncPosition();
      });

      try {
        resizeObserver.observe(board);
      } catch (_) {}
    }

    const rect = board.getBoundingClientRect();

    if (
      !rect ||
      rect.width <= 0 ||
      rect.height <= 0
    ) {
      return;
    }

    // Fixed positioning means scrollX/scrollY are unnecessary.
    svg.style.left = `${rect.left}px`;
    svg.style.top = `${rect.top}px`;
    svg.style.width = `${rect.width}px`;
    svg.style.height = `${rect.height}px`;
  }

  // ─────────────────────────────────────────────
  // Periodically verify Lichess board
  // ─────────────────────────────────────────────

  function startPositionWatcher() {
    if (positionTimer) {
      return;
    }

    positionTimer = setInterval(() => {
      const board = getBoard();

      if (!board) {
        return;
      }

      // Board was replaced.
      if (board !== currentBoard) {
        currentBoard = board;

        if (resizeObserver) {
          try {
            resizeObserver.disconnect();
          } catch (_) {}
        }

        resizeObserver = new ResizeObserver(() => {
          syncPosition();
        });

        try {
          resizeObserver.observe(board);
        } catch (_) {}

        syncPosition();

        // Re-draw arrows on the new board.
        if (cached.length > 0) {
          draw(cached);
        }

        return;
      }

      syncPosition();
    }, 250);
  }

  // ─────────────────────────────────────────────
  // Arrow geometry
  // ─────────────────────────────────────────────

  function arrowPathD(from, to, w) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;

    const len = Math.hypot(dx, dy);

    if (len < 1) {
      return '';
    }

    const ux = dx / len;
    const uy = dy / len;

    const px = -uy;
    const py = ux;

    const headLen = w * 2;
    const headHW = w * 1.3;
    const hw = w / 2;

    const startOff = 15;

    const sx = from.x + ux * startOff;
    const sy = from.y + uy * startOff;

    const bodyLen = len - startOff - headLen;

    const tipX = to.x - ux * 10;
    const tipY = to.y - uy * 10;

    // Very short move.
    if (bodyLen < 5) {
      return [
        'M',
        sx + px * headHW,
        sy + py * headHW,

        'L',
        tipX,
        tipY,

        'L',
        sx - px * headHW,
        sy - py * headHW,

        'Z',
      ].join(' ');
    }

    const bx = sx + ux * bodyLen;
    const by = sy + uy * bodyLen;

    return [
      'M',
      sx + px * hw,
      sy + py * hw,

      'L',
      bx + px * hw,
      by + py * hw,

      'L',
      bx + px * headHW,
      by + py * headHW,

      'L',
      tipX,
      tipY,

      'L',
      bx - px * headHW,
      by - py * headHW,

      'L',
      bx - px * hw,
      by - py * hw,

      'L',
      sx - px * hw,
      sy - py * hw,

      'Z',
    ].join(' ');
  }

  // ─────────────────────────────────────────────
  // Remove arrows from SVG
  // ─────────────────────────────────────────────

  function removeArrows() {
    if (!svg) {
      return;
    }

    svg
      .querySelectorAll('.bm-arrow')
      .forEach(node => node.remove());
  }

  // ─────────────────────────────────────────────
  // Draw
  // ─────────────────────────────────────────────

  function draw(hints) {
    cached = Array.isArray(hints)
      ? hints
      : [];

    console.log(
      '[BM][arrows] draw()',
      cached.length,
      'hint(s)'
    );

    const board = getBoard();

    if (!board) {
      console.log(
        '[BM][arrows] Board not found'
      );

      return;
    }

    const s = ensureSVG();

    if (!s) {
      console.log(
        '[BM][arrows] Could not create SVG'
      );

      return;
    }

    syncPosition();

    // Always remove old arrows first.
    removeArrows();

    if (!visible || cached.length === 0) {
      return;
    }

    const flip = isFlipped();

    /*
     * Draw back-to-front.
     * Best move gets drawn last so it remains visible.
     */
    let drawn = 0;

    for (
      let i = cached.length - 1;
      i >= 0;
      i--
    ) {
      const hint = cached[i];

      if (!hint || typeof hint.move !== 'string') {
        continue;
      }

      const parts = hint.move.split('→');

      if (parts.length !== 2) {
        console.log(
          '[BM][arrows] Invalid move:',
          hint.move
        );

        continue;
      }

      const fromSq = parts[0].trim();
      const toSq = parts[1].trim();

      const from = sqXY(
        fromSq,
        flip
      );

      const to = sqXY(
        toSq,
        flip
      );

      const st =
        STYLES[
          Math.min(
            i,
            STYLES.length - 1
          )
        ];

      const d = arrowPathD(
        from,
        to,
        st.w
      );

      if (!d) {
        continue;
      }

      const path =
        document.createElementNS(
          'http://www.w3.org/2000/svg',
          'path'
        );

      path.classList.add(
        'bm-arrow'
      );

      path.setAttribute(
        'd',
        d
      );

      path.setAttribute(
        'fill',
        st.color
      );

      path.setAttribute(
        'stroke',
        'none'
      );

      path.setAttribute(
        'pointer-events',
        'none'
      );

      s.appendChild(path);

      drawn++;
    }

    console.log(
      '[BM][arrows] Drew',
      drawn,
      'green arrow(s)'
    );
  }

  // ─────────────────────────────────────────────
  // Clear
  // ─────────────────────────────────────────────

  function clear() {
    cached = [];

    removeArrows();
  }

  // ─────────────────────────────────────────────
  // Toggle
  // ─────────────────────────────────────────────

  function toggle() {
    visible = !visible;

    if (svg) {
      svg.style.display =
        visible ? '' : 'none';
    }

    return visible;
  }

  // ─────────────────────────────────────────────
  // Visibility
  // ─────────────────────────────────────────────

  function setVisible(v) {
    visible = !!v;

    if (svg) {
      svg.style.display =
        visible ? '' : 'none';
    }
  }

  // ─────────────────────────────────────────────
  // Global page observers
  // ─────────────────────────────────────────────

  function initObservers() {
    startPositionWatcher();

    // Keep position correct during scrolling.
    window.addEventListener(
      'scroll',
      () => {
        syncPosition();
      },
      {
        passive: true,
        capture: true,
      }
    );

    // Browser resizing.
    window.addEventListener(
      'resize',
      () => {
        syncPosition();

        if (cached.length > 0) {
          // Delay slightly so Chessground can finish resizing.
          setTimeout(() => {
            if (cached.length > 0) {
              draw(cached);
            }
          }, 50);
        }
      },
      {
        passive: true,
      }
    );

    /*
     * Lichess frequently changes DOM elements without
     * a full page reload. Watch for board replacement.
     */
    if (!observer) {
      observer = new MutationObserver(() => {
        const board = getBoard();

        if (!board) {
          return;
        }

        if (board !== currentBoard) {
          currentBoard = board;

          if (resizeObserver) {
            try {
              resizeObserver.disconnect();
            } catch (_) {}
          }

          resizeObserver =
            new ResizeObserver(() => {
              syncPosition();
            });

          try {
            resizeObserver.observe(board);
          } catch (_) {}

          syncPosition();

          if (cached.length > 0) {
            setTimeout(() => {
              if (cached.length > 0) {
                draw(cached);
              }
            }, 30);
          }
        }
      });

      observer.observe(
        document.body,
        {
          childList: true,
          subtree: true,
        }
      );
    }
  }

  // Start once DOM is ready.
  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      initObservers,
      {
        once: true,
      }
    );
  } else {
    initObservers();
  }

  // ─────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────

  return {
    draw,
    clear,
    toggle,
    setVisible,
  };
})();
