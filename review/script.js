document.addEventListener('DOMContentLoaded', () => {
    // === App Skeleton Removal ===
    const removeSkeleton = () => {
        const skeleton = document.getElementById('app-skeleton');
        if (skeleton && !skeleton.classList.contains('hidden-skeleton')) {
            skeleton.classList.add('hidden-skeleton');
            setTimeout(() => skeleton.remove(), 400); // Remove from DOM after fade out
        }
    };

    // Wait until all resources (images, icons, fonts, etc.) are fully loaded
    if (document.readyState === 'complete') {
        removeSkeleton();
    } else {
        window.addEventListener('load', removeSkeleton);
        // Fallback timeout in case of network stall (max 8 seconds)
        setTimeout(removeSkeleton, 8000);
    }

    // === Audio Setup ===
    const sounds = {
        move: new Audio('sounds/move-self.mp3'),
        capture: new Audio('sounds/capture.mp3'),
        check: new Audio('sounds/move-check.mp3'),
        castle: new Audio('sounds/castle.mp3'),
        promote: new Audio('sounds/promote.mp3'),
        gameEnd: new Audio('sounds/game-end.mp3')
    };

    // === Audio Unlock for Mobile ===
    let audioUnlocked = false;
    function unlockAudio() {
        if (audioUnlocked) return;
        Object.values(sounds).forEach(audio => {
            audio.play().then(() => {
                audio.pause();
                audio.currentTime = 0;
            }).catch(() => {});
        });
        audioUnlocked = true;
        document.removeEventListener('touchstart', unlockAudio);
        document.removeEventListener('click', unlockAudio);
    }
    document.addEventListener('touchstart', unlockAudio);
    document.addEventListener('click', unlockAudio);

    function playMoveSound(move) {
        if (!move || !move.san) return;
        let soundType = 'move';
        if (move.san.includes('#')) {
            soundType = 'gameEnd';
        } else if (move.san.includes('+')) {
            soundType = 'check';
        } else if (move.san.includes('O-O')) {
            soundType = 'castle';
        } else if (move.flags && move.flags.includes('p')) {
            soundType = 'promote';
        } else if (move.captured || move.san.includes('x')) {
            soundType = 'capture';
        }
        const audio = sounds[soundType];
        if (audio) {
            audio.currentTime = 0;
            audio.play().catch(() => {});
        }
    }

    // === IndexedDB Cache Setup ===
    const dbName = 'ChessBirdCache_v3';
    const storeName = 'evaluations';
    let dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(dbName, 1);
        req.onupgradeneeded = e => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(storeName)) {
                db.createObjectStore(storeName, { keyPath: 'id' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });

    async function getCachedEval(fen, depth) {
        const db = await dbPromise;
        return new Promise(resolve => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const id = `${fen}_d${depth}`;
            const req = store.get(id);
            req.onsuccess = () => {
                if (req.result) {
                    const fiveYearsMs = 5 * 365 * 24 * 60 * 60 * 1000;
                    if (Date.now() - req.result.timestamp > fiveYearsMs) {
                        store.delete(id); // Auto-cleanup expired data
                        resolve(null);
                    } else {
                        resolve(req.result.data);
                    }
                } else {
                    resolve(null);
                }
            };
            req.onerror = () => resolve(null);
        });
    }

    async function saveCachedEval(fen, depth, data) {
        const db = await dbPromise;
        return new Promise(resolve => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const req = store.put({ id: `${fen}_d${depth}`, data, timestamp: Date.now() });
            req.onsuccess = () => resolve();
            req.onerror = () => resolve();
        });
    }

    // === Core Variables ===
    let board = null;
    let game = new Chess();
    let moves = []; // { san, fen, to, from, piece, captured, flags, evalCp, classification }
    let currentMoveIndex = -1;
    let isFlipped = false;
    let startFen = null; // FEN before the first move
    let gameOpening = ""; // Track the opening name
    let arrowsEnabled = localStorage.getItem('arrowsEnabled') === 'true';
    const autoFlip = true; // Always auto-flip to user's perspective on game load

    // Engine variables
    let engine = new Worker('stockfish-18-lite-single.js');
    engine.postMessage('uci');
    engine.postMessage('setoption name Hash value 128');
    let engineReady = false;
    let isReviewing = false;
    let currentReviewId = 0;
    let activeWorkers = [];
    let reviewIndex = 0;       // 0..moves.length  (N+1 positions)
    let lastNavTime = 0;       // timestamp of last goToMove call — used to suppress animation on rapid navigation
    let reviewEvals = [];      // cp values (white's perspective) for each position
    let currentLineEval = null;
    let currentReviewTurn = 'w';

    // Stats — wpLosses used for accuracy, exclude book moves
    let stats = {
        w: { brilliant:0, great:0, best:0, excellent:0, good:0, book:0, inaccuracy:0, mistake:0, miss:0, blunder:0, accuracy:0, wpLosses:[] },
        b: { brilliant:0, great:0, best:0, excellent:0, good:0, book:0, inaccuracy:0, mistake:0, miss:0, blunder:0, accuracy:0, wpLosses:[] }
    };

    // UI Elements
    const el = {
        pgnInput:          document.getElementById('pgn-input'),
        loadBtn:           document.getElementById('load-btn'),
        startReviewBtn:    document.getElementById('start-review-btn'),
        gameInfo:          document.getElementById('game-info'),
        whitePlayer:       document.getElementById('white-player'),
        blackPlayer:       document.getElementById('black-player'),
        gameResult:        document.getElementById('game-result'),
        movesList:         document.getElementById('moves-list'),
        evalFill:          document.getElementById('eval-fill'),
        evalScore:         document.getElementById('eval-score'),
        engineDepth:       document.getElementById('engine-depth'),
        bestMoveDisplay:   document.getElementById('best-move-display'),
        tabMoves:          document.getElementById('tab-moves'),
        tabReview:         document.getElementById('tab-review'),
        contentMoves:      document.getElementById('content-moves'),
        contentReview:     document.getElementById('content-review'),
        reviewOverlay:     document.getElementById('review-overlay'),
        reviewProgress:    document.getElementById('review-progress'),
        reviewProgressText:document.getElementById('review-progress-text'),
        coachBubble:       document.getElementById('coach-bubble'),
        coachText:         document.getElementById('coach-text'),
        coachScore:        document.getElementById('coach-score'),
        accWhite:          document.getElementById('acc-white'),
        accBlack:          document.getElementById('acc-black'),
    };
    // Theme Setup
    const savedTheme = localStorage.getItem('boardTheme') || 'chesscom';
    let currentTheme = savedTheme;
    if (currentTheme === 'chesscom') {
        document.body.classList.add('theme-chesscom');
    }
    
    const themeToggleBtn = document.getElementById('theme-toggle');
    const themeModal = document.getElementById('theme-modal');
    const btnThemeBoard1 = document.getElementById('btn-theme-board1');
    const btnThemeBoard2 = document.getElementById('btn-theme-board2');
    const btnCloseTheme = document.getElementById('btn-close-theme');

    const btnSettingsGear = document.getElementById('btn-settings-gear');

    if (themeModal) {
        if (themeToggleBtn) {
            themeToggleBtn.addEventListener('click', () => {
                themeModal.classList.remove('hidden');
            });
        }
        if (btnSettingsGear) {
            btnSettingsGear.addEventListener('click', () => {
                const themeSection = document.getElementById('settings-theme-section');
                const actionsSection = document.getElementById('settings-actions-section');
                
                const isHome = document.body.getAttribute('data-mobile-state') === 'home';
                
                if (themeSection) {
                    themeSection.style.display = isHome ? 'block' : 'none';
                }
                if (actionsSection) {
                    actionsSection.style.display = isHome ? 'none' : 'block';
                }
                
                themeModal.classList.remove('hidden');
            });
        }
        
        btnCloseTheme.addEventListener('click', () => {
            themeModal.classList.add('hidden');
        });

        // Close on background click
        themeModal.addEventListener('click', (e) => {
            if (e.target === themeModal) {
                themeModal.classList.add('hidden');
            }
        });

        function updateTheme(theme) {
            localStorage.setItem('boardTheme', theme);
            currentTheme = theme;
            if (theme === 'chesscom') {
                document.body.classList.add('theme-chesscom');
                if (btnThemeBoard1) btnThemeBoard1.classList.add('active');
                if (btnThemeBoard2) btnThemeBoard2.classList.remove('active');
            } else {
                document.body.classList.remove('theme-chesscom');
                if (btnThemeBoard1) btnThemeBoard1.classList.remove('active');
                if (btnThemeBoard2) btnThemeBoard2.classList.add('active');
            }
            if (typeof board !== 'undefined' && board) {
                const fen = board.position('fen');
                board.destroy();
                board = Chessboard('board', {
                    pieceTheme: function(piece) {
                        if (currentTheme === 'chesscom') {
                            return `https://images.chesscomfiles.com/chess-themes/pieces/neo/150/${piece.toLowerCase()}.png`;
                        }
                        return `https://chessboardjs.com/img/chesspieces/wikipedia/${piece}.png`;
                    },
                    position: fen,
                    showNotation: true,
                    moveSpeed: 150,
                    draggable: true,
                    onDragStart: handleDragStart,
                    onDrop: handleBoardDrop,
                    onSnapEnd: handleSnapEnd
                });
                if (typeof isFlipped !== 'undefined') board.orientation(isFlipped ? 'black' : 'white');
                if (typeof currentMoveIndex !== 'undefined' && typeof goToMove === 'function') goToMove(currentMoveIndex, false);
            }
            themeModal.classList.add('hidden');
        }

        btnThemeBoard1.addEventListener('click', () => updateTheme('chesscom'));
        btnThemeBoard2.addEventListener('click', () => updateTheme('default'));
    }

    // Initialize Board
    board = Chessboard('board', {
        pieceTheme: function(piece) {
            if (currentTheme === 'chesscom') {
                return `https://images.chesscomfiles.com/chess-themes/pieces/neo/150/${piece.toLowerCase()}.png`;
            }
            return `https://chessboardjs.com/img/chesspieces/wikipedia/${piece}.png`;
        },
        position: 'start',
        showNotation: true,
        moveSpeed: 150,
        draggable: true,
        onDragStart: handleDragStart,
        onDrop: handleBoardDrop,
        onSnapEnd: handleSnapEnd
    });
    window.addEventListener('resize', () => board.resize());
    setTimeout(() => board.resize(), 100);

    // === Exploration Mode (Interactive Board) ===
    function handleDragStart(source, piece, position, orientation) {
        if (!game) return false;
        if (game.game_over()) return false;
        // Only allow moving pieces of the current turn
        if ((game.turn() === 'w' && piece.search(/^b/) !== -1) ||
            (game.turn() === 'b' && piece.search(/^w/) !== -1)) {
            return false;
        }
        return true;
    }

    const evaluateSinglePosition = (fen, depth) => {
        return new Promise((resolve) => {
            let pv1 = { cp: 0, move: null };
            let pv2 = { cp: null, move: null };
            let pv3 = { cp: null, move: null };
            let lastDepth = 0;
            const isWhiteToMove = fen.split(' ')[1] === 'w';

            const onMessage = (e) => {
                const line = e.data;
                if (!line) return;

                const depthMatch = line.match(/info depth (\d+)/);
                const pvLine = line.match(/multipv (\d+) score (cp|mate) (-?\d+).* pv (.*)/);
                if (pvLine && depthMatch) {
                    const pvNum      = parseInt(pvLine[1]);
                    const isMateLine = pvLine[2] === 'mate';
                    let   cp         = parseInt(pvLine[3]);
                    if (isMateLine) {
                        const mateN = Math.abs(cp);
                        cp = cp > 0 ? (30000 - mateN) : -(30000 - mateN);
                    }
                    if (!isWhiteToMove) cp = -cp;
                    const sequence = pvLine[4];
                    const move = sequence.split(' ')[0];
                    const d    = parseInt(depthMatch[1]);

                    if (d >= lastDepth) {
                        lastDepth = d;
                        if (pvNum === 1) pv1 = { cp, move, sequence };
                        else if (pvNum === 2) pv2 = { cp, move, sequence };
                        else if (pvNum === 3) pv3 = { cp, move, sequence };
                    }
                }

                if (line.startsWith('bestmove')) {
                    engine.removeEventListener('message', onMessage);
                    resolve({
                        cp:       pv1.cp,
                        bestMove: pv1.move || line.split(' ')[1],
                        pv1Sequence: pv1.sequence,
                        pv2Move:  pv2.move,
                        pv2Cp:    pv2.cp,
                        pv2Sequence: pv2.sequence,
                        pv3Cp:    pv3.cp
                    });
                }
            };

            engine.addEventListener('message', onMessage);
            engine.postMessage('stop');
            engine.postMessage('ucinewgame');
            engine.postMessage('setoption name MultiPV value 3');
            engine.postMessage('position fen ' + fen);
            engine.postMessage(`go depth ${depth}`);
        });
    };

    async function handleBoardDrop(source, target) {
        if (!game) return 'snapback';
        
        // Try the move
        const moveObj = {
            from: source,
            to: target,
            promotion: 'q'
        };
        
        let move = null;
        try {
            move = game.move(moveObj);
        } catch(e) {}

        if (move === null) {
            return 'snapback';
        }

        // Move is valid. Check if it matches the actual next game move.
        const nextMove = moves[currentMoveIndex + 1];
        if (nextMove && nextMove.from === source && nextMove.to === target && (nextMove.promotion || 'q') === (move.promotion || 'q')) {
            game.undo(); // let goToMove handle it
            goNext();
            return;
        }

        // Custom Move / Exploration Mode
        const customFen = game.fen();
        const isWhiteMove = move.color === 'w';
        
        // Remove active class from moves list to signify exploration
        document.querySelectorAll('.move').forEach(e => e.classList.remove('active'));
        playMoveSound(move);
        clearBoardHighlights();
        
        const sqFrom = $('#board .square-' + move.from);
        const sqTo = $('#board .square-' + move.to);
        if (sqFrom.length > 0) sqFrom.addClass('highlight-from');
        if (sqTo.length > 0) sqTo.addClass('square-highlight highlight-to');
        
        // Find previous evaluation to compare against
        const prevEvalData = reviewEvals[currentMoveIndex + 1] || { cp: 0, bestMove: null, pv2Cp: null };
        const prevCp = prevEvalData.cp;
        const engineBestUci = prevEvalData.bestMove;
        const playedUci = move.from + move.to + (move.promotion ? move.promotion : '');
        const isEngineBest = engineBestUci && playedUci === engineBestUci;

        el.coachBubble.classList.remove('invisible', 'brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder');
        el.coachText.innerHTML = `Analyzing <strong style="color:var(--accent)">${move.san}</strong>... <div class="spinner" style="display:inline-block;width:12px;height:12px;border:2px solid var(--accent);border-top:2px solid transparent;border-radius:50%;animation:spin 1s linear infinite;"></div>`;
        el.coachScore.textContent = '...';
        
        let result = await evaluateSinglePosition(customFen, 12);
        if (game.fen() !== customFen) return; // User navigated away
        
        let currCp = result.cp;
        
        // Dummy move object for classification
        let dummyMove = {
            san: move.san,
            piece: move.piece,
            captured: move.captured,
            flags: move.flags,
            fen: customFen,
            pv2Cp: prevEvalData.pv2Cp
        };

        // Dynamic deep depth check for brilliant candidates
        const cpLossForPlayer = isWhiteMove ? (prevCp - currCp) : (currCp - prevCp);
        const isBestOrCloseCandidate = isEngineBest || cpLossForPlayer <= 20;

        if (isBestOrCloseCandidate && cpLossForPlayer <= 30 && Math.abs(prevCp) < 300) {
            let isMaterialSac = false;
            if (move.piece !== 'k') {
                const tempAfter = new Chess(customFen);
                const oppMoves  = tempAfter.moves({ verbose: true });
                const ourCaptureVal = move.captured ? (PIECE_VAL[move.captured] || 0) : 0;
                let worstNetSequence = Infinity;
                for (let om of oppMoves) {
                    if (!om.captured || om.captured === 'k') continue;
                    const attackerVal = PIECE_VAL[om.piece] || 0;
                    const victimVal   = PIECE_VAL[om.captured] || 0;
                    tempAfter.move(om);
                    const ourReplies = tempAfter.moves({ verbose: true });
                    let bestRecapture = 0;
                    for (let rep of ourReplies) {
                        if (rep.to === om.to && rep.captured) {
                            if (attackerVal > bestRecapture) bestRecapture = attackerVal;
                        }
                    }
                    tempAfter.undo();
                    const netSequence = ourCaptureVal - victimVal + bestRecapture;
                    if (netSequence < worstNetSequence) worstNetSequence = netSequence;
                }
                if (worstNetSequence !== Infinity && worstNetSequence <= -200) {
                    isMaterialSac = true;
                }
            }
            if (isMaterialSac) {
                el.coachText.innerHTML = `Deep analyzing <strong style="color:var(--accent)">${move.san}</strong>... <div class="spinner" style="display:inline-block;width:12px;height:12px;border:2px solid var(--accent);border-top:2px solid transparent;border-radius:50%;animation:spin 1s linear infinite;"></div>`;
                result = await evaluateSinglePosition(customFen, 18); // Maximum depth
                if (game.fen() !== customFen) return;
                currCp = result.cp;
                // pv2Cp stays from prevEvalData (pre-move position) — sufficient for difficulty check
                dummyMove.isDeepDepthConfirmed = true;
            }
        }

        const cls = classifyMove(prevCp, currCp, isWhiteMove, dummyMove, isEngineBest);
        
        if (cls.icon) {
            sqTo.addClass(cls.class);
            let animClass = '';
            if (cls.class === 'brilliant') animClass = ' animate-brilliant';
            if (cls.class === 'great') animClass = ' animate-great';
            sqTo.append(`<div class="board-badge ${cls.class}${animClass}">${cls.icon}</div>`);
        }

        // Show opponent's response
        const oppBest = result.bestMove;
        let oppResponseText = '';
        if (oppBest) {
            drawArrows([{ move: oppBest, color: 'rgba(229,83,75,0.85)' }]);
            const oppSan = uciToSan(customFen, oppBest);
            oppResponseText = `<br><br>💡 Opponent's best response is <strong style="color:var(--accent)">${oppSan}</strong>.`;
        }

        let bubbleText = `<strong>${move.san}</strong> ${cls.text}`;
        const threat = analyzeOpponentThreat(customFen, oppBest);
        if (threat) {
             bubbleText += `<br><br>🧨 This allows the opponent to ${threat}.`;
        }

        // Tactical themes after our move
        const tactics = detectTacticalThemes(customFen, move.color === 'w');
        if (tactics.length > 0) {
            bubbleText += `<br><br>` + tactics.join('<br>');
        }

        bubbleText += oppResponseText;


        el.coachBubble.className = `coach-bubble ${cls.class}`;
        const iconEl = document.getElementById('coach-icon');
        if (iconEl) {
            iconEl.className = `coach-icon ${cls.class}`;
            iconEl.innerHTML = cls.icon;
        }
        const labelEl = document.getElementById('coach-label');
        if (labelEl) labelEl.textContent = cls.name;

        el.coachText.innerHTML = bubbleText;
        updateEvalUI(currCp);
        
        if (Math.abs(currCp) >= 29000) {
            const mateIn = 30000 - Math.abs(currCp);
            el.coachScore.textContent = currCp > 0 ? `M${mateIn}` : `-M${mateIn}`;
        } else {
            const pawns = (currCp / 100).toFixed(2);
            el.coachScore.textContent = currCp > 0 ? `+${pawns}` : `${pawns}`;
        }

        el.bestMoveDisplay.innerHTML = `<span style="color:#aaa; font-size:0.9em">Analysis Mode (Press ◀/▶ to return)</span>`;
        const altPanel = document.getElementById('alt-best-panel');
        if (altPanel) altPanel.classList.add('hidden');
    }

    function handleSnapEnd() {
        board.position(game.fen());
    }

    // === Mobile State Management ===
    function setMobileState(state, pushHistory = true) {
        const currentState = document.body.getAttribute('data-mobile-state');
        if (currentState === state) return;

        document.body.setAttribute('data-mobile-state', state);
        if (state === 'board' || state === 'analyzing') {
            setTimeout(() => board.resize(), 50);
        }

        if (pushHistory) {
            history.pushState({ mobileState: state }, '', '');
        }
    }

    // Handle hardware/swipe back button
    window.addEventListener('popstate', (e) => {
        if (e.state && e.state.mobileState) {
            setMobileState(e.state.mobileState, false);
        } else {
            setMobileState('home', false);
        }
    });

    // Initialize base history state
    history.replaceState({ mobileState: document.body.getAttribute('data-mobile-state') || 'home' }, '', '');

    document.getElementById('btn-mobile-home').addEventListener('click', () => {
        if (window.hasCompletedReview && typeof window.showPwaPrompt === 'function') {
            window.showPwaPrompt();
        }
        
        const gamesList = document.getElementById('games-modal-list');
        if (gamesList && gamesList.children.length > 0) {
            // Update accuracies dynamically from local cache before opening
            let localAcc = JSON.parse(localStorage.getItem('localAccuracies') || '{}');
            Array.from(gamesList.children).forEach(row => {
                const hash = row.getAttribute('data-hash');
                const isWhite = row.getAttribute('data-is-white') === 'true';
                if (hash !== null) {
                    const savedAcc = localAcc[hash];
                    if (savedAcc) {
                        const myAcc = isWhite ? savedAcc.w : savedAcc.b;
                        if (myAcc !== undefined && myAcc !== '-') {
                            const actionDiv = row.querySelector('.gm-action');
                            if (actionDiv) {
                                actionDiv.innerHTML = `<div class="gm-accuracy">${myAcc}</div>`;
                            }
                        }
                    }
                }
            });
            openGamesModal();
        } else {
            setMobileState('home');
        }
    });
    document.getElementById('home-view-board-btn').addEventListener('click', () => {
        setMobileState('board');
        switchTab('moves');
    });
    document.getElementById('report-view-board-btn').addEventListener('click', () => {
        setMobileState('board');
        switchTab('moves');
        // Scroll to bottom so board is fully visible after switching state
        setTimeout(() => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }, 100);
    });

    const toggleArrowsWrapper = document.getElementById('toggle-arrows-wrapper');
    const arrowsStatus = document.getElementById('arrows-status');
    if (toggleArrowsWrapper) {
        toggleArrowsWrapper.addEventListener('click', () => {
            arrowsEnabled = !arrowsEnabled;
            if (arrowsStatus) arrowsStatus.textContent = arrowsEnabled ? 'On' : 'Off';
            
            if (arrowsEnabled) {
                toggleArrowsWrapper.style.backgroundColor = 'rgba(129, 182, 76, 0.2)';
                toggleArrowsWrapper.style.borderColor = 'var(--accent)';
                toggleArrowsWrapper.style.color = '#fff';
            } else {
                toggleArrowsWrapper.style.backgroundColor = '';
                toggleArrowsWrapper.style.borderColor = '';
                toggleArrowsWrapper.style.color = '';
            }
            
            // Re-render arrows for the current move if applicable
            if (currentMoveIndex >= -1 && currentMoveIndex < moves.length) {
                goToMove(currentMoveIndex, false);
            }
        });
    }

    // =========================================================
    // MATH & CLASSIFICATION  (Chess.com EP model)
    // =========================================================

    // Piece values (centipawns) for sacrifice detection
    const PIECE_VAL = { p:100, n:320, b:330, r:500, q:900, k:20000 };

    // ── A: Game Phase Detection ───────────────────────────────────────────
    // Returns 'opening' | 'middlegame' | 'endgame' based on piece count.
    // Used to adjust WP loss thresholds in classifyMove.
    function getGamePhase(fen) {
        const piecePart = fen.split(' ')[0];
        let total = 0, queens = 0;
        for (const c of piecePart) {
            if (/[pnbrqkPNBRQK]/.test(c)) total++;
            if (c === 'q' || c === 'Q') queens++;
        }
        if (queens === 0 || total <= 14) return 'endgame';
        if (total >= 28) return 'opening';
        return 'middlegame';
    }

    // ── C: Tactical Pattern Detection ────────────────────────────────────
    // Detects common tactical themes AFTER a move is played.
    // Returns an array of detected theme strings for coach bubble enrichment.
    function detectTacticalThemes(fenAfterMove, isWhiteMoved) {
        const themes = [];
        try {
            const board = new Chess(fenAfterMove);
            const myColor  = isWhiteMoved ? 'w' : 'b';
            const oppColor = isWhiteMoved ? 'b' : 'w';

            // ── Hanging Piece (opponent has undefended valuable piece) ────
            const oppMoves = board.moves({ verbose: true });
            const myAttacks = {};
            // Get all squares our pieces attack after the move
            // (We use opponent's moves to infer our attack coverage simply)
            const tempForUs = new Chess(fenAfterMove);
            // Flip turn to get "our" moves (what we attack)
            const fenFlipped = fenAfterMove.replace(/ (w|b) /, (m, c) => ` ${c === 'w' ? 'b' : 'w'} `);
            try {
                const tempFlipped = new Chess(fenFlipped);
                const ourAttacks = tempFlipped.moves({ verbose: true });
                ourAttacks.forEach(m => { myAttacks[m.to] = (myAttacks[m.to] || 0) + 1; });
            } catch(e) {}

            // Check each opponent piece — is it undefended and attacked by us?
            const boardArr = board.board();
            for (let r = 0; r < 8; r++) {
                for (let c = 0; c < 8; c++) {
                    const sq = boardArr[r][c];
                    if (!sq || sq.color !== oppColor || sq.type === 'k') continue;
                    const sqName = String.fromCharCode(97 + c) + (8 - r);
                    const val = PIECE_VAL[sq.type] || 0;
                    if (val < 300) continue; // Only care about minor pieces+

                    // Is this square attacked by us?
                    if (myAttacks[sqName]) {
                        // Is it defended by opponent?
                        const isDefended = oppMoves.some(m => m.to === sqName);
                        if (!isDefended) {
                            themes.push(`🎯 Opponent's ${sq.type === 'q' ? 'queen' : sq.type === 'r' ? 'rook' : sq.type === 'n' ? 'knight' : 'bishop'} on ${sqName} is hanging!`);
                        }
                    }
                }
            }

            // ── Fork Detection (our piece attacks 2+ valuable opponent pieces) ──
            const myMovesAfter = board.moves({ verbose: true });
            // Group our moves by 'from' square — if same piece attacks 2+ pieces
            const attacksByPiece = {};
            myMovesAfter.forEach(m => {
                if (!m.captured) return;
                const val = PIECE_VAL[m.captured] || 0;
                if (val < 100) return;
                if (!attacksByPiece[m.from]) attacksByPiece[m.from] = [];
                attacksByPiece[m.from].push({ to: m.to, val, piece: m.piece });
            });
            for (const [from, attacks] of Object.entries(attacksByPiece)) {
                const totalVal = attacks.reduce((s, a) => s + a.val, 0);
                if (attacks.length >= 2 && totalVal >= 600) {
                    const pName = attacks[0].piece === 'n' ? 'Knight' : attacks[0].piece === 'b' ? 'Bishop' : attacks[0].piece === 'r' ? 'Rook' : attacks[0].piece === 'q' ? 'Queen' : 'Pawn';
                    themes.push(`⚔️ ${pName} fork opportunity on ${from}!`);
                }
            }

            // ── Back Rank Threat ─────────────────────────────────────────
            // Only flag if: opponent king IS on their back rank AND at least
            // one adjacent back-rank square is occupied by their own pawn
            // (i.e. the king is actually trapped on the back rank)
            const backRank = oppColor === 'w' ? '1' : '8';
            const backRankRow = oppColor === 'w' ? 7 : 0;

            // Find opponent king position
            let oppKingFile = -1;
            for (let f = 0; f < 8; f++) {
                const sq = grid[backRankRow][f];
                if (sq && sq.type === 'k' && sq.color === oppColor) {
                    oppKingFile = f;
                    break;
                }
            }

            if (oppKingFile !== -1) {
                // Check that back rank is blocked: at least 2 of 3 squares around king
                // are occupied by own pieces (king is truly trapped)
                let blockedSquares = 0;
                for (let f = Math.max(0, oppKingFile - 1); f <= Math.min(7, oppKingFile + 1); f++) {
                    if (f === oppKingFile) continue;
                    const sq = grid[backRankRow][f];
                    if (sq && sq.color === oppColor) blockedSquares++;
                }

                if (blockedSquares >= 1) {
                    // Now check if we have a rook/queen that can actually land on back rank
                    const backRankThreats = myMovesAfter.filter(m =>
                        (m.piece === 'r' || m.piece === 'q') &&
                        m.to.endsWith(backRank) &&
                        !m.captured
                    );
                    if (backRankThreats.length > 0) {
                        themes.push(`🏰 Back-rank threat created!`);
                    }
                }
            }

        } catch(e) {}
        return themes;
    }


    /**
     * Convert centipawns (white's perspective, +white/-black) → Win%  0..100
     * Uses the same sigmoid Chess.com publishes.
     */
    function cpToWp(cp) {
        // Forced mates: extremely high/low scores
        if (cp >= 20000) return 100;
        if (cp <= -20000) return 0;
        const clamped = Math.max(-1500, Math.min(1500, cp));
        return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * clamped)) - 1);
    }

    /**
     * Win% from the perspective of the MOVING player (always 0..100, higher = better for them).
     */
    function playerWp(cpWhite, isWhite) {
        const wp = cpToWp(cpWhite);
        return isWhite ? wp : (100 - wp);
    }

    /**
     * Classify a single move.
     * prevCp / currCp  — evaluation in WHITE's perspective (centipawns).
     * isWhite          — true if it was White's move.
     * moveData         — verbose chess.js move object { piece, captured, flags, san }
     */
    /**
     * isEngineBest = true when the played move is the engine's #1 choice.
     * Only engine-top moves qualify as "Best" — everything else uses WP loss tiers
     */
    function classifyMove(prevCp, currCp, isWhite, moveData, isEngineBest = false) {
        const prevWp  = playerWp(prevCp, isWhite);
        const currWp  = playerWp(currCp, isWhite);
        const wpLoss  = prevWp - currWp;  // positive = player's position got worse
        const wpGain  = -wpLoss;          // positive = position improved for player

        // ── Material sacrifice detection ──────────────────────────────────
        // Chess.com defines a Brilliant move as one involving a genuine material sacrifice.
        // This calculates the net material change of the entire tactical sequence
        // (Our Move -> Opponent's Best Capture -> Our Best Recapture).
        // If the opponent has ANY capture that results in a net loss of >= 150cp for us,
        // it is considered a sacrifice (or an ignored threat, which is also brilliant!).
        let isMaterialSac = false;

        if (moveData.piece !== 'k') {
            const tempAfter = new Chess(moveData.fen);
            const oppMoves  = tempAfter.moves({ verbose: true });
            
            const ourCaptureVal = moveData.captured ? (PIECE_VAL[moveData.captured] || 0) : 0;
            let worstNetSequence = Infinity; // Find the most damaging sequence for us

            for (let om of oppMoves) {
                if (!om.captured) continue;
                // Don't consider king captures (game over, handled by checkmate checks)
                if (om.captured === 'k') continue;

                const attackerVal = PIECE_VAL[om.piece] || 0;
                const victimVal   = PIECE_VAL[om.captured] || 0;

                // Temporarily make the opponent's capture
                tempAfter.move(om);
                const ourReplies = tempAfter.moves({ verbose: true });
                let bestRecapture = 0;
                for (let rep of ourReplies) {
                    if (rep.to === om.to && rep.captured) {
                        if (attackerVal > bestRecapture) bestRecapture = attackerVal;
                    }
                }
                tempAfter.undo();

                // Net material change of the entire 3-ply sequence
                const netSequence = ourCaptureVal - victimVal + bestRecapture;
                
                if (netSequence < worstNetSequence) {
                    worstNetSequence = netSequence;
                }
            }

            // A genuine sacrifice means the opponent can win material (e.g. piece or exchange)
            if (worstNetSequence !== Infinity && worstNetSequence <= -200) {
                isMaterialSac = true;
            }
        }

        // ── Checkmate ─────────────────────────────────────────────────────
        if (moveData.san.includes('#')) {
            if (isMaterialSac) {
                return { id:'brilliant', icon:'<img src="icons/brilliant.png" class="move-classification-img" alt="!!" />', class:'brilliant', name:'Brilliant', text:'is a Brilliant Checkmate!', loss: 0 };
            }
            return { id:'best', icon:'★', class:'best', name:'Best', text:'delivers Checkmate', loss: 0 };
        }

        // pv2 gap — used for both Brilliant and Great move checks
        const pv2WpForPlayer = (moveData.pv2Cp !== undefined && moveData.pv2Cp !== null)
            ? playerWp(moveData.pv2Cp, isWhite)
            : null;
        const pv2Gap = (pv2WpForPlayer !== null) ? (currWp - pv2WpForPlayer) : 0;

        // ── Brilliant (!!) ────────────────────────────────────────────────
        // Strict Criteria:
        // 1. Best move or close (cpLoss <= 20)
        // 2. Real sacrifice (isRealSac)
        // 3. Keep or improve evaluation (cpLoss <= 30)
        // 4. Difficult/Non-obvious (bestMove - secondBest > 120 OR depthCheckPassed)
        // 5. Position not completely winning (abs(prevCp) < 300)
        const cpLossForPlayer = isWhite ? (prevCp - currCp) : (currCp - prevCp);
        const isBestOrClose = isEngineBest || cpLossForPlayer <= 20;

        const cpGapToPv2 = (moveData.pv2Cp !== undefined && moveData.pv2Cp !== null)
            ? (isWhite ? (prevCp - moveData.pv2Cp) : (moveData.pv2Cp - prevCp))
            : 0;

        const isDifficult = cpGapToPv2 > 120 || moveData.isDeepDepthConfirmed;

        const ourCapturedVal = moveData.captured ? (PIECE_VAL[moveData.captured] || 0) : 0;
        const isRealSac = isMaterialSac && ourCapturedVal < 300;

        if (
            isRealSac &&
            isBestOrClose &&
            cpLossForPlayer <= 30 &&
            isDifficult &&
            Math.abs(prevCp) < 300
        ) {
            return { id:'brilliant', icon:'<img src="icons/brilliant.png" class="move-classification-img" alt="!!" />', class:'brilliant', name:'Brilliant', text:'is Brilliant!', loss: Math.max(0, wpLoss) };
        }

        // ── Great Move (!) ────────────────────────────────────────────────
        const movedValForGreat    = PIECE_VAL[moveData.piece] || 0;
        const capturedValForGreat = moveData.captured ? (PIECE_VAL[moveData.captured] || 0) : 0;
        const isTrivialCapture    = moveData.captured && (capturedValForGreat - movedValForGreat) >= 200;

        // Dynamic gap threshold — stricter than before but still more generous than original.
        // Target: roughly match chess.com's distribution (~5-8 great per 40-move game).
        let greatGapThreshold;
        if (prevWp < 25 || prevWp > 75) {
            greatGapThreshold = 20; // Decisive position — gap must be large to matter
        } else if (prevWp < 40 || prevWp > 60) {
            greatGapThreshold = 16; // Slightly imbalanced
        } else {
            greatGapThreshold = 12; // Equal position
        }

        // Confirm with pv3 if available: the gap to the 3rd best move should also be significant.
        // This prevents moves from being labelled Great when only slightly better than pv2 but pv3 is similar.
        const pv3WpForPlayer = (moveData.pv3Cp !== undefined && moveData.pv3Cp !== null)
            ? playerWp(moveData.pv3Cp, isWhite)
            : null;
        const pv3Confirmed = pv3WpForPlayer === null || (currWp - pv3WpForPlayer) >= (greatGapThreshold * 0.6);

        if (
            isEngineBest &&
            pv2WpForPlayer !== null &&
            pv2Gap >= greatGapThreshold &&
            pv3Confirmed &&
            prevWp < 78 &&          // Can't get Great if game is already totally won
            !isTrivialCapture
        ) {
            return { id:'great', icon:'<img src="icons/great.png" class="move-classification-img" alt="!" />', class:'great', name:'Great Move', text:'is a Great Move!', loss: 0 };
        }

        // ── Best ──────────────────────────────────────────────────────────
        // Played move IS the engine's #1 choice AND position didn't deteriorate.
        if (isEngineBest && wpLoss <= 2.0) {
            return { id:'best', icon:'<img src="icons/best.png" class="move-classification-img" alt="★" />', class:'best', name:'Best', text:'is Best', loss: wpLoss };
        }

        // ── Standard WP Loss Tiers (Phase-Adjusted) ────────────────────────
        // Game phase adjusts how forgiving we are. Opening = most lenient
        // (many equal alternatives exist), Endgame = strictest (precision required).
        const phase = getGamePhase(moveData.fen);
        let t_excellent, t_good, t_inaccuracy, t_mistake;
        if (phase === 'opening') {
            t_excellent  = 3.0;  t_good = 7.0;  t_inaccuracy = 13.0;  t_mistake = 25.0;
        } else if (phase === 'endgame') {
            t_excellent  = 1.5;  t_good = 4.0;  t_inaccuracy =  8.0;  t_mistake = 15.0;
        } else { // middlegame (default)
            t_excellent  = 2.0;  t_good = 5.0;  t_inaccuracy = 10.0;  t_mistake = 20.0;
        }

        if (wpLoss <= t_excellent) {
            return { id:'excellent', icon:'<img src="icons/excelent.png" class="move-classification-img" alt="👍" />', class:'excellent', name:'Excellent', text:'is Excellent', loss: wpLoss };
        }
        if (wpLoss <= t_good) {
            return { id:'good', icon:'<img src="icons/good.png" class="move-classification-img" alt="✔" />', class:'good', name:'Good', text:'is Good', loss: wpLoss };
        }

        // ── Miss (✖) ─────────────────────────────────────────────────────
        // Chess.com "Miss" = You HAD a clear advantage/forced mate but let it slip.
        //   A) Missed a forced mate sequence (most painful miss)
        //   B) Had a winning advantage (prevWp >= 65) and it evaporated (currWp < 55)
        const hadMate    = Math.abs(prevCp) >= 29000 && (isWhite ? prevCp > 0 : prevCp < 0);
        const missedMate = hadMate && Math.abs(currCp) < 28500;

        if (missedMate) {
            return { id:'miss', icon:'<img src="icons/miss.png" class="move-classification-img" alt="✖" />', class:'miss', name:'Miss', text:'missed a forced checkmate!', loss: wpLoss };
        }
        if (prevWp >= 65 && currWp < 55 && wpLoss >= 10.0) {
            return { id:'miss', icon:'<img src="icons/miss.png" class="move-classification-img" alt="✖" />', class:'miss', name:'Miss', text:'is a Miss — you had a winning advantage!', loss: wpLoss };
        }

        if (wpLoss <= t_inaccuracy) {
            return { id:'inaccuracy', icon:'<img src="icons/inaccuracy.png" class="move-classification-img" alt="?!" />', class:'inaccuracy', name:'Inaccuracy', text:'is an Inaccuracy', loss: wpLoss };
        }
        if (wpLoss <= t_mistake) {
            return { id:'mistake', icon:'<img src="icons/mistake.png" class="move-classification-img" alt="?" />', class:'mistake', name:'Mistake', text:'is a Mistake', loss: wpLoss };
        }
        return { id:'blunder', icon:'<img src="icons/blunder.png" class="move-classification-img" alt="??" />', class:'blunder', name:'Blunder', text:'is a Blunder', loss: wpLoss };
    }


    /**
     * Chess.com CAPS2 Accuracy Formula:
     * accuracy = 103.1668 * exp(-0.04354 * avgWpLoss) - 3.1669
     *
     * IMPORTANT: The formula is applied to the AVERAGE WP loss,
     * NOT to each individual move and then averaged (that gives wrong results).
     *
     * wpLossArr: array of WP losses per move (from moving player's perspective)
     * Excludes: book moves & forced moves
     */
     function calculateAccuracy(wpLossArr) {
        if (!wpLossArr || wpLossArr.length === 0) return 100;
        
        // Scale factor: Chess.com uses full Stockfish NNUE which sees deeper and
        // produces larger WP swings. Stockfish-lite at depth 14-16 underestimates
        // WP losses. Empirically calibrated by comparing outputs on known games.
        const LITE_ENGINE_SCALE = 1.65;
        
        // Step 1: compute the average WP loss (scaled to simulate full NNUE depth)
        let totalLoss = 0;
        for (let loss of wpLossArr) {
            totalLoss += loss;
        }
        const avgWpLoss = (totalLoss / wpLossArr.length) * LITE_ENGINE_SCALE;
        
        // Step 2: apply CAPS2 formula to the average (single application — Chess.com's method)
        const accuracy = 103.1668 * Math.exp(-0.04354 * avgWpLoss) - 3.1669;
        
        return Math.max(0, Math.min(100, accuracy)).toFixed(1);
    }

    /**
     * Compute a stable hash from moves sequence only (ignores PGN headers/formatting).
     * Uses SAN move list so any PGN for the same game produces the same hash.
     */
    function computeGameHash(sanMovesArr) {
        const key = sanMovesArr.join(' ');
        let h = 0;
        for (let i = 0; i < key.length; i++) { h = ((h << 5) - h) + key.charCodeAt(i); h |= 0; }
        return h;
    }

    /**
     * Parse SAN moves from a PGN string.
     * Returns an array of SAN strings (no move numbers, no result).
     */
    function parseMovesFromPgn(pgn) {
        try {
            const tmp = new Chess();
            // Strip headers
            const stripped = pgn.replace(/\[[^\]]*\]/g, '').trim();
            // Remove move numbers, annotations, result
            const tokens = stripped.replace(/\d+\.+/g, '').replace(/\{[^}]*\}/g, '')
                .replace(/\([^)]*\)/g, '').replace(/(1-0|0-1|1\/2-1\/2|\*)/g, '')
                .trim().split(/\s+/).filter(t => t && t.length > 0);
            const sans = [];
            for (const tok of tokens) {
                const m = tmp.move(tok);
                if (!m) break;
                sans.push(m.san);
            }
            return sans;
        } catch(e) { return []; }
    }

    // =========================================================
    // REVIEW SYSTEM  — N+1 position evaluations
    // =========================================================

    async function startFullReview() {
        if (moves.length === 0) return;

        // Kill any existing workers from previous review runs
        if (activeWorkers && activeWorkers.length > 0) {
            activeWorkers.forEach(w => w.terminate());
            activeWorkers = [];
        }

        // Increment review ID
        currentReviewId++;
        const myReviewId = currentReviewId;

        // Hide "New Game" button
        const newGameBtn = document.getElementById('btn-mobile-home');
        if (newGameBtn) newGameBtn.style.display = 'none';

        if (typeof gtag === 'function') gtag('event', 'review_started');

        setMobileState('analyzing');

        el.reviewOverlay.classList.remove('hidden');
        el.reviewProgress.style.width = '0%';
        el.reviewProgressText.textContent = '0%';

        isReviewing  = true;
        reviewIndex  = 0;
        reviewEvals  = [];

        // Reset stats
        for (const c of ['w','b']) {
            stats[c] = { brilliant:0, great:0, best:0, excellent:0, good:0, book:0,
                         inaccuracy:0, mistake:0, miss:0, blunder:0, accuracy:0, wpLosses:[] };
        }

        // Show skeleton view immediately
        el.accWhite.textContent = '-';
        el.accBlack.textContent = '-';
        const uiCats = ['brilliant','great','best','excellent','good','book','inaccuracy','mistake','miss','blunder'];
        uiCats.forEach(cat => {
            const elW = document.getElementById(`stat-w-${cat}`);
            const elB = document.getElementById(`stat-b-${cat}`);
            if (elW) elW.textContent = '0';
            if (elB) elB.textContent = '0';
        });
        switchTab('review');

        // Collect all FENs
        const fens = [startFen];
        for (const move of moves) {
            fens.push(move.fen);
        }

        try {
            el.reviewProgress.style.width = `0%`;
            el.reviewProgressText.textContent = `Initializing Engine... 0%`;

            const baseDepth = 14;
            const deepDepth = 22; // Maximum depth for brilliant candidate confirmation

            // ── Parallel Workers Setup ─────────────────────────────
            // Remove artificial limits and use all available CPU cores for maximum speed
            const numWorkers = Math.max(1, navigator.hardwareConcurrency || 4);
            // Dynamically scale Hash to prevent memory issues with many workers
            const hashSize = Math.max(16, Math.floor(512 / numWorkers));

            const workers = [];
            for (let i = 0; i < numWorkers; i++) {
                const w = new Worker('stockfish-18-lite-single.js');
                w.postMessage('uci');
                w.postMessage(`setoption name Hash value ${hashSize}`);
                workers.push(w);
            }
            activeWorkers = workers;

            const evaluatePositionWorker = (worker, fen, depth) => {
                return new Promise((resolve, reject) => {
                    let pv1 = { cp: 0, move: null };
                    let pv2 = { cp: null, move: null };
                    let pv3 = { cp: null, move: null };
                    let lastDepth = 0;
                    const isWhiteToMove = fen.split(' ')[1] === 'w';
                    let timeoutId;

                    const onMessage = (e) => {
                        const line = e.data;
                        if (!line) return;

                        const depthMatch = line.match(/info depth (\d+)/);
                        const pvLine = line.match(/multipv (\d+) score (cp|mate) (-?\d+).* pv (.*)/);
                        if (pvLine && depthMatch) {
                            const pvNum      = parseInt(pvLine[1]);
                            const isMateLine = pvLine[2] === 'mate';
                            let   cp         = parseInt(pvLine[3]);
                            if (isMateLine) {
                                const mateN = Math.abs(cp);
                                cp = cp > 0 ? (30000 - mateN) : -(30000 - mateN);
                            }
                            if (!isWhiteToMove) cp = -cp;
                            const sequence = pvLine[4];
                            const move = sequence.split(' ')[0];
                            const d    = parseInt(depthMatch[1]);

                            if (d >= lastDepth) {
                                lastDepth = d;
                                if (pvNum === 1) pv1 = { cp, move, sequence };
                                else if (pvNum === 2) pv2 = { cp, move, sequence };
                                else if (pvNum === 3) pv3 = { cp, move, sequence };
                            }
                        }

                        if (line.startsWith('bestmove')) {
                            clearTimeout(timeoutId);
                            worker.removeEventListener('message', onMessage);
                            resolve({
                                cp:       pv1.cp,
                                bestMove: pv1.move || line.split(' ')[1],
                                pv1Sequence: pv1.sequence,
                                pv2Move:  pv2.move,
                                pv2Cp:    pv2.cp,
                                pv2Sequence: pv2.sequence,
                                pv3Cp:    pv3.cp
                            });
                        }
                    };

                    worker.addEventListener('message', onMessage);
                    
                    timeoutId = setTimeout(() => {
                        worker.removeEventListener('message', onMessage);
                        reject(new Error("Engine Timeout"));
                    }, depth >= 17 ? 60000 : 15000); // Longer timeout for deep analysis

                    worker.postMessage('stop');
                    worker.postMessage('ucinewgame');
                    worker.postMessage('setoption name MultiPV value 3');
                    worker.postMessage('position fen ' + fen);
                    worker.postMessage(`go depth ${depth}`);
                });
            };

            // ── Parallel Analysis ───────────────────────────
            let completed = 0;
            const total = fens.length;
            const results = new Array(total);

            let nextIndex = 0;

            const runWorker = async (workerIndex) => {
                while (nextIndex < total) {
                    if (myReviewId !== currentReviewId) return;

                    const i = nextIndex++;
                    const fen = fens[i];
                    
                    let wasCached = true;
                    let score = await getCachedEval(fen, baseDepth);
                    if (!score) {
                        wasCached = false;
                        try {
                            score = await evaluatePositionWorker(workers[workerIndex], fen, baseDepth);
                            await saveCachedEval(fen, baseDepth, score);
                        } catch (err) {
                            console.warn("Worker crashed or timed out. Restarting...", err);
                            workers[workerIndex].terminate();
                            const newWorker = new Worker('stockfish-18-lite-single.js');
                            newWorker.postMessage('uci');
                            newWorker.postMessage(`setoption name Hash value ${hashSize}`);
                            workers[workerIndex] = newWorker;
                            
                            try {
                                score = await evaluatePositionWorker(workers[workerIndex], fen, baseDepth);
                                await saveCachedEval(fen, baseDepth, score);
                            } catch (retryErr) {
                                console.error("Worker failed again. Providing fallback score.");
                                score = { cp: 0, bestMove: null };
                            }
                        }
                    }
                    
                    results[i] = score;
                    
                    if (wasCached) {
                        await new Promise(r => setTimeout(r, 10)); // Yield to UI for smooth animation but much faster
                    }
                    
                    completed++;
                    // Cap normal progress at 98% to prevent jumping to 100 then back to 99
                    const pct = Math.round((completed / total) * 98);
                    el.reviewProgress.style.width = `${pct}%`;
                    el.reviewProgressText.textContent = `Analyzing... ${pct}%`;
                    
                    // Show some movement on board to indicate working
                    board.position(fen, false);
                }
            };

            const workerPromises = workers.map((w, index) => runWorker(index));
            await Promise.all(workerPromises);

            // ── Second Pass: Deep Depth Analysis for Brilliant Candidates ──
            // Runs silently at 99% — no text change, user doesn't notice
            const deepCandidates = [];
            for (let i = 0; i < moves.length; i++) {
                const moveData = moves[i];
                const prevCp = results[i] ? results[i].cp : 0;
                const currCp = results[i + 1] ? results[i + 1].cp : 0;
                const isWhite = (i % 2 === 0);
                
                const cpLossForPlayer = isWhite ? (prevCp - currCp) : (currCp - prevCp);
                const isEngineBest = results[i] && results[i].bestMove === (moveData.from + moveData.to + (moveData.promotion || ''));
                const isBestOrClose = isEngineBest || cpLossForPlayer <= 20;

                if (isBestOrClose && cpLossForPlayer <= 30 && Math.abs(prevCp) < 300) {
                    let isMaterialSac = false;
                    if (moveData.piece !== 'k') {
                        const tempAfter = new Chess(moveData.fen);
                        const oppMoves  = tempAfter.moves({ verbose: true });
                        const ourCaptureVal = moveData.captured ? (PIECE_VAL[moveData.captured] || 0) : 0;
                        let worstNetSequence = Infinity;
                        for (let om of oppMoves) {
                            if (!om.captured || om.captured === 'k') continue;
                            const attackerVal = PIECE_VAL[om.piece] || 0;
                            const victimVal   = PIECE_VAL[om.captured] || 0;
                            tempAfter.move(om);
                            const ourReplies = tempAfter.moves({ verbose: true });
                            let bestRecapture = 0;
                            for (let rep of ourReplies) {
                                if (rep.to === om.to && rep.captured) {
                                    if (attackerVal > bestRecapture) bestRecapture = attackerVal;
                                }
                            }
                            tempAfter.undo();
                            const netSequence = ourCaptureVal - victimVal + bestRecapture;
                            if (netSequence < worstNetSequence) worstNetSequence = netSequence;
                        }
                        if (worstNetSequence !== Infinity && worstNetSequence <= -200) {
                            isMaterialSac = true;
                        }
                    }
                    if (isMaterialSac) {
                        deepCandidates.push(i);
                    }
                }
            }

            if (deepCandidates.length > 0) {
                // Candidates found — silently hold at 99% during deep analysis
                el.reviewProgress.style.width = `99%`;
                el.reviewProgressText.textContent = `Analyzing... 99%`;
                let deepCompleted = 0;
                let deepIndex = 0;
                const runDeepWorker = async (workerIndex) => {
                    while (deepIndex < deepCandidates.length) {
                        if (myReviewId !== currentReviewId) return;
                        const candIndex = deepCandidates[deepIndex++];
                        const fenPrev = fens[candIndex];
                        const fenCurr = fens[candIndex + 1];
                        
                        try {
                            let scorePrev = await getCachedEval(fenPrev, deepDepth);
                            if (!scorePrev) {
                                scorePrev = await evaluatePositionWorker(workers[workerIndex], fenPrev, deepDepth);
                                await saveCachedEval(fenPrev, deepDepth, scorePrev);
                            } else {
                                await new Promise(r => setTimeout(r, 60));
                            }
                            
                            let scoreCurr = await getCachedEval(fenCurr, deepDepth);
                            if (!scoreCurr) {
                                scoreCurr = await evaluatePositionWorker(workers[workerIndex], fenCurr, deepDepth);
                                await saveCachedEval(fenCurr, deepDepth, scoreCurr);
                            } else {
                                await new Promise(r => setTimeout(r, 60));
                            }
                            
                            results[candIndex] = scorePrev;
                            results[candIndex + 1] = scoreCurr;
                            moves[candIndex].isDeepDepthConfirmed = true;
                        } catch(err) {
                            console.warn("Deep analysis worker failed", err);
                        }
                        
                        deepCompleted++;
                        // No UI update — stays at 99% silently
                    }
                };
                const deepPromises = workers.map((w, index) => runDeepWorker(index));
                await Promise.all(deepPromises);
            }

            reviewEvals = results;
            workers.forEach(w => w.terminate());

            el.reviewProgress.style.width = `100%`;
            el.reviewProgressText.textContent = `Done!`;

            setTimeout(() => {
                finishReview();
            }, 500);

        } catch (error) {
            console.error('Engine Error:', error);
            el.reviewProgressText.textContent = 'Analysis Failed!';
            el.reviewProgress.style.backgroundColor = 'red';
            
            const newGameBtn = document.getElementById('btn-mobile-home');
            if (newGameBtn) newGameBtn.style.display = '';
        }
    }

    function finishReview() {
        isReviewing = false;
        el.reviewOverlay.classList.add('hidden');
        
        const newGameBtn = document.getElementById('btn-mobile-home');
        if (newGameBtn) newGameBtn.style.display = '';
        activeWorkers = [];

        if (typeof gtag === 'function') gtag('event', 'review_completed');
        window.hasCompletedReview = true;

        // ── Exact Book detection using OpeningBook Trie ──────────────────
        let inBook = true;
        let currentTrieNode = window.OpeningBook;

        for (let i = 0; i < moves.length; i++) {
            const isWhite  = (i % 2 === 0);
            const color    = isWhite ? 'w' : 'b';
            const prevCp   = reviewEvals[i] ? reviewEvals[i].cp : 0;       // eval BEFORE this move
            let currCp     = reviewEvals[i + 1] ? reviewEvals[i + 1].cp : 0;   // eval AFTER this move

            if (moves[i].san.includes('#')) {
                // Mate in 1 from the previous position: encode as 29999 so getMateIn() = 1
                currCp = isWhite ? 29999 : -29999;
                if (reviewEvals[i + 1]) reviewEvals[i + 1].cp = currCp;
            }

            moves[i].evalCp = currCp;
            
            // Exact Book Match Check
            if (inBook && currentTrieNode && currentTrieNode[moves[i].san]) {
                currentTrieNode = currentTrieNode[moves[i].san];
                
                // If this specific node has a name, update the game opening
                if (currentTrieNode.n) {
                    gameOpening = currentTrieNode.n;
                }

                let theoryText = gameOpening ? `is standard theory in the ${gameOpening}.` : `is a standard opening move.`;
                moves[i].classification = { id:'book', icon:'<img src="icons/book.png" class="move-classification-img" alt="📖" />', class:'book', name:'Book', text: theoryText, loss:0 };
                stats[color].book++;
                // Note: book moves are excluded from wpLosses / accuracy
                continue;
            }
            inBook = false; // once out of book, stay out

            // ── Forced Move detection ─────────────────────────────────────
            // If only 1 legal move was available, skip classification entirely.
            // Chess.com also does not label forced moves — they cannot be evaluated
            // as good or bad since the player had no real choice.
            let legalMovesCount = 99;
            try {
                const tmpFen = i === 0 ? startFen : moves[i - 1].fen;
                const tmpBoard = new Chess(tmpFen);
                legalMovesCount = tmpBoard.moves().length;
            } catch(e) {}

            if (legalMovesCount === 1) {
                moves[i].classification = { id:'forced', icon:'', class:'forced', name:'Forced', text:'was the only move', loss:0 };
                // Forced moves are excluded from accuracy calculation
                continue;
            }

            // Check if the played move is the engine's #1 choice for this position
            const engineBestUci = reviewEvals[i] ? reviewEvals[i].bestMove : null;
            const isEngineBest  = !!(engineBestUci && moves[i].uci === engineBestUci);

            // Attach pv2Cp and pv3Cp from engine data for gap calculations
            moves[i].pv2Cp = (reviewEvals[i] && reviewEvals[i].pv2Cp !== undefined)
                ? reviewEvals[i].pv2Cp
                : null;
            moves[i].pv3Cp = (reviewEvals[i] && reviewEvals[i].pv3Cp !== undefined)
                ? reviewEvals[i].pv3Cp
                : null;

            const cls = classifyMove(prevCp, currCp, isWhite, moves[i], isEngineBest);
            moves[i].classification = cls;

            stats[color][cls.id] = (stats[color][cls.id] || 0) + 1;

            const prevWp    = playerWp(prevCp, isWhite);
            const currWp    = playerWp(currCp, isWhite);
            const rawWpLoss = Math.max(0, prevWp - currWp);
            stats[color].wpLosses.push(rawWpLoss);
        }

        // ── Accuracy ─────────────────────────────────────────────────────
        stats.w.accuracy = calculateAccuracy(stats.w.wpLosses);
        stats.b.accuracy = calculateAccuracy(stats.b.wpLosses);

        // ── Critical Moment — biggest single eval swing ───────────────────
        let maxSwing = 15; // minimum WP loss to be considered "critical"
        let criticalIndex = -1;
        for (let i = 0; i < moves.length; i++) {
            const cls = moves[i].classification;
            if (cls && ['blunder','mistake','miss'].includes(cls.id) && cls.loss > maxSwing) {
                maxSwing    = cls.loss;
                criticalIndex = i;
            }
        }
        if (criticalIndex >= 0) moves[criticalIndex].isCritical = true;

        // ── Populate UI ───────────────────────────────────────────────────
        el.accWhite.textContent = stats.w.accuracy;
        el.accBlack.textContent = stats.b.accuracy;

        try {
            // Use moves-sequence hash (stable across PGN formatting differences)
            if (moves && moves.length > 0) {
                const sanArr = moves.map(m => m.san);
                const hash = computeGameHash(sanArr);
                let localAcc = JSON.parse(localStorage.getItem('localAccuracies') || '{}');
                localAcc[hash] = { w: stats.w.accuracy, b: stats.b.accuracy };
                const keys = Object.keys(localAcc);
                if (keys.length > 200) delete localAcc[keys[0]];
                localStorage.setItem('localAccuracies', JSON.stringify(localAcc));
            }
        } catch (e) {}

        const cats = ['brilliant','great','best','excellent','good','book','inaccuracy','mistake','miss','blunder'];
        cats.forEach(cat => {
            document.getElementById(`stat-w-${cat}`).textContent = stats.w[cat] || 0;
            document.getElementById(`stat-b-${cat}`).textContent = stats.b[cat] || 0;
        });

        renderMoveList();
        switchTab('review');
        goToMove(-1);

        setMobileState('report');
    }

    // =========================================================
    // UI LOGIC
    // =========================================================

    function updateEvalUI(cp) {
        // Clamp to ±1000cp for display
        const clamped    = Math.max(-1000, Math.min(1000, cp));
        let   percentage = 50 + (clamped / 20);
        percentage       = Math.max(2, Math.min(98, percentage));

        el.evalFill.style.width = `${percentage}%`;

        let scoreText;
        if (Math.abs(cp) >= 29000) {
            const mateIn = 30000 - Math.abs(cp);
            scoreText = cp > 0 ? `M${mateIn}` : `-M${mateIn}`;
        } else {
            const pawns = (cp / 100).toFixed(1);
            scoreText   = cp > 0 ? `+${pawns}` : `${pawns}`;
        }
        el.evalScore.textContent = scoreText;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // EXPLAINABLE AI ANNOTATION ENGINE
    // Rule-based NLG using engine output + chess position analysis
    // ═══════════════════════════════════════════════════════════════════════

    // Piece name helpers (module-level so all annotation functions can use them)
    const PIECE_NAMES     = { p:'pawn', n:'knight', b:'bishop', r:'rook', q:'queen', k:'king' };
    const PIECE_NAMES_CAP = { p:'Pawn', n:'Knight', b:'Bishop', r:'Rook', q:'Queen', k:'King' };

    function uciToSan(fen, uci) {
        if (!uci || uci.length < 4) return uci;
        try {
            const temp = new Chess(fen);
            const m = temp.move({ from: uci.slice(0,2), to: uci.slice(2,4), promotion: uci[4] });
            return m ? m.san : uci;
        } catch(e) { return uci; }
    }

    /**
     * Detect what the opponent's best response achieves after a move.
     * Returns a human-readable string describing the threat, or null.
     */
    function analyzeOpponentThreat(fenAfterMyMove, opponentBestUci) {
        if (!opponentBestUci || opponentBestUci.length < 4) return null;
        try {
            const temp = new Chess(fenAfterMyMove);
            const oppColor = temp.turn() === 'w' ? 'White' : 'Black';
            const from  = opponentBestUci.slice(0, 2);
            const to    = opponentBestUci.slice(2, 4);
            const promo = opponentBestUci[4] || undefined;
            const om = temp.move({ from, to, promotion: promo });
            if (!om) return null;

            const fromPieceName = PIECE_NAMES_CAP[om.piece] || 'piece';

            if (temp.in_checkmate()) return `force <strong>checkmate</strong> with their ${fromPieceName} to ${to}`;

            if (om.san.includes('+') && om.captured) {
                const cName = PIECE_NAMES[om.captured] || 'piece';
                return `capture your ${cName} on ${to} with check using their ${fromPieceName}`;
            }

            if (om.captured) {
                const cName = PIECE_NAMES[om.captured] || 'piece';
                return `capture your ${cName} on ${to} with their ${fromPieceName}`;
            }

            if (om.san.includes('+')) return `deliver a dangerous check with their ${fromPieceName} on ${to}`;

            const nextMoves = temp.moves({ verbose: true });
            const threatCaptures = nextMoves.filter(m => m.captured && (PIECE_VAL[m.captured] || 0) >= 300);
            if (threatCaptures.length >= 2) {
                const targets = [...new Set(threatCaptures.map(m => PIECE_NAMES[m.captured] || 'piece'))];
                return `create a nasty fork against your <strong>${targets.join('</strong> and <strong>')}</strong> using their ${fromPieceName} on ${to}`;
            }
            if (threatCaptures.length === 1) {
                const tgt = PIECE_NAMES[threatCaptures[0].captured] || 'piece';
                return `threaten your <strong>${tgt}</strong> by moving their ${fromPieceName} to ${to}`;
            }
            
            const mateThreats = nextMoves.filter(m => m.san.includes('#'));
            if (mateThreats.length > 0) {
                return `threaten <strong>checkmate</strong> in 1 by moving their ${fromPieceName} to ${to}`;
            }
        } catch(e) {}
        return null;
    }

    /**
     * Describe what the engine's recommended best move achieves.
     * Returns a short string like "would have won the rook" or "would have delivered a strong check".
     */
    function describeBestMove(fenBeforeMyMove, bestMoveUci, phase) {
        if (!bestMoveUci || bestMoveUci.length < 4) return null;
        try {
            const temp = new Chess(fenBeforeMyMove);
            const from  = bestMoveUci.slice(0, 2);
            const to    = bestMoveUci.slice(2, 4);
            const promo = bestMoveUci[4] || undefined;
            const bm = temp.move({ from, to, promotion: promo });
            if (!bm) return null;

            const pName = PIECE_NAMES[bm.piece] || 'piece';

            if (temp.in_checkmate()) return 'would have forced <strong>checkmate</strong>';
            if (bm.san.includes('+') && bm.captured) {
                const n = PIECE_NAMES[bm.captured] || 'piece';
                return `would have captured the <strong>${n}</strong> on ${to} with check`;
            }
            if (bm.san.includes('+')) return `would have delivered a crucial <strong>check</strong> on ${to}`;
            if (bm.captured) {
                const cVal = PIECE_VAL[bm.captured] || 0;
                const n    = PIECE_NAMES[bm.captured] || 'piece';
                if (cVal >= 900) return `would have won the <strong>queen</strong> on ${to}`;
                if (cVal >= 500) return `would have won a <strong>rook</strong> on ${to}`;
                if (cVal >= 300) return `would have captured a <strong>${n}</strong> on ${to}`;
                return `would have won a pawn on ${to}`;
            }
            
            const nextMoves = temp.moves({ verbose: true });
            const forkThreats = nextMoves.filter(m => m.captured && (PIECE_VAL[m.captured] || 0) >= 300);
            if (forkThreats.length >= 2) return 'would have created a powerful <strong>fork</strong> threat';
            
            const mateThreats = nextMoves.filter(m => m.san.includes('#'));
            if (mateThreats.length > 0) return 'would have set up an unstoppable <strong>checkmate</strong> threat';
            
            if (bm.promotion) return 'would have promoted a pawn';

            if (bm.san === 'O-O' || bm.san === 'O-O-O') return 'would have safely castled the king to protect it and connect the rooks';
            if (phase === 'opening' && ['n', 'b'].includes(bm.piece)) {
                if (bm.captured) return 'would have developed a piece while capturing material';
                if (bm.san.includes('+')) return 'would have developed with tempo by giving check';
                return `would have developed your ${pName} to ${to} to control the center`;
            }
            if (phase === 'endgame' && bm.piece === 'p') {
                return 'would have pushed a dangerous passed pawn closer to promotion';
            }

        } catch(e) {}
        return null;
    }

    /**
     * Detect game phase from FEN.
     * opening: many pieces still on board
     * endgame: few pieces, pawns decisive
     */
    function getGamePhase(fen) {
        if (!fen) return 'middlegame';
        const piecePart = fen.split(' ')[0];
        let majorMinor = 0;
        for (const c of piecePart) {
            if ('rnbqRNBQ'.includes(c)) majorMinor++;
        }
        if (majorMinor >= 12) return 'opening';
        if (majorMinor >= 5)  return 'middlegame';
        return 'endgame';
    }

    /**
     * Get "before" FEN for a move index (FEN of the position before move was played).
     */
    function getFenBefore(index) {
        return index === 0 ? startFen : moves[index - 1].fen;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // COACH INTELLIGENCE HELPERS
    // ═══════════════════════════════════════════════════════════════════════

    /** Returns the mate-in-N number if cp is a forced-mate score, else null. */
    function getMateIn(cp) {
        if (Math.abs(cp) >= 29000) {
            return Math.max(1, 30000 - Math.abs(cp));
        }
        return null;
    }

    /**
     * Detect if the moved piece now forks two or more valuable opponent pieces.
     * Returns array of attacked piece names, or null.
     */
    function detectFork(fenAfter, movedTo, isWhite) {
        try {
            const parts = fenAfter.split(' ');
            parts[1] = isWhite ? 'w' : 'b'; // pretend it's our turn again
            parts[3] = '-';                  // clear en-passant to avoid FEN errors
            const temp = new Chess(parts.join(' '));
            const attacks = temp.moves({ verbose: true }).filter(m =>
                m.from === movedTo &&
                m.captured &&
                (PIECE_VAL[m.captured] || 0) >= 300
            );
            if (attacks.length >= 2) {
                return [...new Set(attacks.map(m => PIECE_NAMES[m.captured] || 'piece'))];
            }
        } catch(e) {}
        return null;
    }

    /**
     * Check if the player's king is unsafe after a move.
     * Returns a warning string, or null if king is fine.
     */
    function analyzeKingSafety(fen, isWhite, phase) {
        // In the opening it is completely normal for the king to be in the centre.
        // Only warn from the middlegame onwards.
        if (phase === 'opening') return null;
        try {
            const temp  = new Chess(fen);
            const grid  = temp.board();
            const color = isWhite ? 'w' : 'b';

            let kf = -1, kr = -1;
            for (let r = 0; r < 8; r++) {
                for (let f = 0; f < 8; f++) {
                    const sq = grid[r][f];
                    if (sq && sq.type === 'k' && sq.color === color) { kf = f; kr = r; }
                }
            }
            if (kf < 0) return null;

            const isBackRank  = isWhite ? kr === 7 : kr === 0;
            const isCentral   = kf >= 3 && kf <= 4;

            if (isBackRank && isCentral) {
                const castling = fen.split(' ')[2];
                const hasCastleRights = isWhite ? /[KQ]/.test(castling) : /[kq]/.test(castling);
                if (hasCastleRights) {
                    return 'The king is still in the center — consider castling soon for safety.';
                }
            }

            const isKingsideCastled = isBackRank && kf >= 6;
            if (isKingsideCastled) {
                const shieldRow = isWhite ? 6 : 1;
                let shieldPawns = 0;
                for (let f = 5; f <= 7; f++) {
                    const sq = grid[shieldRow][f];
                    if (sq && sq.type === 'p' && sq.color === color) shieldPawns++;
                }
                if (shieldPawns <= 1) {
                    return 'The kingside pawn shield is severely weakened — watch out for an attack!';
                }
            }
        } catch(e) {}
        return null;
    }

    /**
     * Check for common opening principle violations.
     * Returns a coaching tip string, or null.
     */
    function getOpeningPrincipleViolation(movesArr, index, isWhite, phase) {
        if (phase !== 'opening') return null;
        const move = movesArr[index];
        if (!move) return null;

        // Collect this side's previous moves
        const myPrev = [];
        for (let i = isWhite ? 0 : 1; i < index; i += 2) {
            if (movesArr[i]) myPrev.push(movesArr[i]);
        }

        // 1. Moving the same piece twice before developing all minor pieces
        if (move.piece !== 'p' && move.piece !== 'k' && index < 16) {
            const movedBefore = myPrev.some(m => m.to === move.from);
            if (movedBefore) {
                return 'Moving the same piece twice in the opening wastes valuable development time.';
            }
        }

        // 2. Early queen development before minor pieces
        if (move.piece === 'q' && index < 12) {
            const minors = myPrev.filter(m => m.piece === 'n' || m.piece === 'b').length;
            if (minors < 2) {
                return 'Bringing the queen out this early risks it being chased by opponent pieces — develop knights and bishops first.';
            }
        }

        return null;
    }

    /**
     * Detect if the moved piece (a sliding piece) pins an opponent piece against their king.
     * Returns the name of the pinned piece, or null.
     */
    function detectPin(fenAfter, movedTo, isWhite) {
        try {
            const temp     = new Chess(fenAfter);
            const grid     = temp.board();
            const ourColor = isWhite ? 'w' : 'b';
            const oppColor = isWhite ? 'b' : 'w';

            const mf = movedTo.charCodeAt(0) - 97;      // file 0-7
            const mr = 8 - parseInt(movedTo[1]);         // rank row index 0-7

            const movedPiece = grid[mr][mf];
            if (!movedPiece || movedPiece.color !== ourColor) return null;
            if (!['b','r','q'].includes(movedPiece.type)) return null; // only sliders pin

            // Find opponent king
            let kf = -1, kr = -1;
            for (let r = 0; r < 8; r++)
                for (let f = 0; f < 8; f++) {
                    const sq = grid[r][f];
                    if (sq && sq.type === 'k' && sq.color === oppColor) { kf = f; kr = r; }
                }
            if (kf < 0) return null;

            const df = kf - mf, dr = kr - mr;
            const isRookRay   = df === 0 || dr === 0;
            const isBishopRay = Math.abs(df) === Math.abs(dr);

            if (movedPiece.type === 'r' && !isRookRay)   return null;
            if (movedPiece.type === 'b' && !isBishopRay) return null;
            if (movedPiece.type === 'q' && !isRookRay && !isBishopRay) return null;

            const sf = df === 0 ? 0 : df / Math.abs(df);
            const sr = dr === 0 ? 0 : dr / Math.abs(dr);

            let f = mf + sf, r = mr + sr;
            let pinned = null;
            while (f !== kf || r !== kr) {
                if (f < 0 || f > 7 || r < 0 || r > 7) return null;
                const sq = grid[r][f];
                if (sq) {
                    if (sq.color === oppColor) {
                        if (pinned) return null; // two pieces = no absolute pin
                        if (sq.type === 'k') return null;
                        pinned = sq;
                    } else {
                        return null; // our own piece blocks the ray
                    }
                }
                f += sf; r += sr;
            }
            return pinned ? (PIECE_NAMES[pinned.type] || 'piece') : null;
        } catch(e) {}
        return null;
    }

    /**
     * Returns a human-readable material balance string from the player's perspective.
     * e.g. "up a rook", "down a pawn", "equal material"
     */
    function getMaterialBalance(fen, isWhite) {
        try {
            const piecePart = fen.split(' ')[0];
            let w = 0, b = 0;
            const vals = { p:1, n:3, b:3, r:5, q:9 };
            for (const c of piecePart) {
                const t = c.toLowerCase();
                if (vals[t]) { if (c === c.toUpperCase()) w += vals[t]; else b += vals[t]; }
            }
            const diff = isWhite ? w - b : b - w;
            if (Math.abs(diff) < 1) return null;

            // Label the advantage
            const abs = Math.abs(diff);
            let label;
            if (abs >= 9) label = 'a queen';
            else if (abs >= 5) label = 'a rook';
            else if (abs >= 3) label = 'a piece';
            else if (abs >= 2) label = 'two pawns';
            else label = 'a pawn';

            return diff > 0 ? `up ${label}` : `down ${label}`;
        } catch(e) {}
        return null;
    }

    /**
     * Return an endgame-specific coaching tip, or null if not in endgame.
     */
    function getEndgameCoaching(fenAfter, isWhite, phase) {
        if (phase !== 'endgame') return null;
        try {
            const temp = new Chess(fenAfter);
            const grid = temp.board();
            const color = isWhite ? 'w' : 'b';

            // Find our king position
            let kf = -1, kr = -1;
            for (let r = 0; r < 8; r++)
                for (let f = 0; f < 8; f++) {
                    const sq = grid[r][f];
                    if (sq && sq.type === 'k' && sq.color === color) { kf = f; kr = r; }
                }
            if (kf < 0) return null;

            // King still on back rank in endgame → tip to centralise
            const isBackRank = isWhite ? kr === 7 : kr === 0;
            if (isBackRank) {
                return 'In the endgame, activating the king toward the center is crucial — it becomes a powerful attacking piece.';
            }

            // Count passed pawns (simple: pawn with no opposing pawn on same/adjacent file)
            let passedCount = 0;
            for (let f = 0; f < 8; f++) {
                let hasPawn = false, hasOppBlocker = false;
                for (let r = 0; r < 8; r++) {
                    const sq = grid[r][f];
                    if (sq && sq.type === 'p' && sq.color === color) hasPawn = true;
                }
                if (!hasPawn) continue;
                for (let af = Math.max(0, f-1); af <= Math.min(7, f+1); af++) {
                    for (let r = 0; r < 8; r++) {
                        const sq = grid[r][af];
                        if (sq && sq.type === 'p' && sq.color !== color) hasOppBlocker = true;
                    }
                }
                if (!hasOppBlocker) passedCount++;
            }
            if (passedCount >= 1) {
                return `You have a passed pawn — push it aggressively to create a promotion threat!`;
            }
        } catch(e) {}
        return null;
    }


    /**
     * Build a Chess.com-style coach explanation for a move.
     * Returns { label, text } where text is rich HTML.
     */
    function buildCoachExplanation(index) {
        const move = moves[index];
        if (!move || !move.classification) return { label: '', text: '' };
        const cls      = move.classification;
        const id       = cls.id;
        const san      = move.san;
        const isWhite  = (index % 2 === 0);
        const side     = isWhite ? 'White' : 'Black';
        const opp      = isWhite ? 'Black' : 'White';

        const prevEval = reviewEvals[index];
        const currEval = reviewEvals[index + 1];
        const prevCp   = prevEval ? prevEval.cp : 0;
        const currCp   = currEval ? currEval.cp : 0;
        const prevWp   = playerWp(prevCp, isWhite);
        const currWp   = playerWp(currCp, isWhite);
        const wpLoss   = Math.round(prevWp - currWp);
        const wpGain   = -wpLoss;

        const pieceName = PIECE_NAMES[move.piece] || 'piece';
        const captName  = move.captured ? PIECE_NAMES[move.captured] : null;

        // Position context
        const isWinning  = prevWp >= 65;
        const isLosing   = prevWp <= 35;
        const isEqual    = prevWp >= 45 && prevWp <= 55;
        const posContext = isWinning ? 'winning' : isLosing ? 'difficult' : 'balanced';

        // Game phase
        const fenBefore = getFenBefore(index);
        const fenAfter  = move.fen;
        const phase     = getGamePhase(fenBefore);

        // Engine data
        const bestUci    = prevEval ? prevEval.bestMove : null;
        const oppBestUci = currEval ? currEval.bestMove : null;

        // Standard helpers
        const threat   = analyzeOpponentThreat(fenAfter, oppBestUci);
        const bestDesc = describeBestMove(fenBefore, bestUci, phase);
        const bestSan  = uciToSan(fenBefore, bestUci);

        const bestSuggest = bestSan
            ? `<br><br>💡 You missed a chance to play <strong style="color:var(--accent)">${bestSan}</strong>${bestDesc ? `, which ${bestDesc}` : ''}.`
            : '';
        const threatSentence = threat
            ? `<br><br>🧨 This allows ${opp} to ${threat}.`
            : '';

        // ── Mate-in-N detection ───────────────────────────────────────────
        // From player's perspective
        const playerPrevCp    = isWhite ? prevCp : -prevCp;
        const playerCurrCp    = isWhite ? currCp : -currCp;
        const mateAvailable   = getMateIn(playerPrevCp);   // forced mate WAS available before our move
        const mateAchieved    = getMateIn(playerCurrCp);   // forced mate achieved by our move
        const oppMateAfter    = playerCurrCp < -29000 ? getMateIn(-playerCurrCp) : null; // opponent has mate after our move

        // ── Fork detection ────────────────────────────────────────────────
        const forkTargets = (move.to && ['brilliant','great','best','excellent'].includes(id))
            ? detectFork(fenAfter, move.to, isWhite)
            : null;
        const forkNote = forkTargets
            ? ` This move creates a powerful <strong>fork</strong>, attacking the <strong>${forkTargets.join('</strong> and <strong>')}</strong> simultaneously!`
            : '';

        // ── King Safety ───────────────────────────────────────────────────
        const kingSafetyConcern = analyzeKingSafety(fenAfter, isWhite, phase);
        const kingSafetyNote = kingSafetyConcern
            ? ` ⚠️ <em>${kingSafetyConcern}</em>`
            : '';

        // ── Opening Principle Violations ──────────────────────────────────
        const principleViolation = (['inaccuracy','good','excellent','best'].includes(id))
            ? getOpeningPrincipleViolation(moves, index, isWhite, phase)
            : null;
        const principleNote = principleViolation
            ? ` 📌 <em>${principleViolation}</em>`
            : '';

        // ── Critical Moment banner ────────────────────────────────────────
        const criticalBanner = move.isCritical
            ? `<div style="margin-top:6px;padding:4px 8px;background:rgba(255,80,80,0.15);border-left:3px solid #ff5050;border-radius:4px;font-size:0.82rem;color:#ff8080">⚡ <strong>Game's Turning Point</strong> — this was the critical moment of the game.</div>`
            : '';

        // ── Pin detection ─────────────────────────────────────────────────
        const pinnedPiece = (move.to && ['brilliant','great','best','excellent'].includes(id))
            ? detectPin(fenAfter, move.to, isWhite)
            : null;
        const pinNote = pinnedPiece
            ? ` This move <strong>pins</strong> the opponent's <strong>${pinnedPiece}</strong> against their king!`
            : '';

        // ── Material balance ──────────────────────────────────────────────
        const matBal = getMaterialBalance(fenAfter, isWhite);
        const matNote = matBal
            ? ` (Material: <em>${matBal}</em>)`
            : '';

        // ── Positional Insights ───────────────────────────────────────────
        let positionalInsight = '';
        if (move.piece === 'n' && ['best','excellent','good','great','brilliant'].includes(id)) {
            const rank = parseInt(move.to[1]);
            // For white, rank 5 or 6. For black, rank 4 or 3.
            if ((isWhite && (rank === 5 || rank === 6)) || (!isWhite && (rank === 4 || rank === 3))) {
                if (['c','d','e','f'].includes(move.to[0])) {
                    positionalInsight = ` ♘ This advanced knight establishes a powerful central outpost, exerting immense pressure.`;
                }
            }
        } else if (move.piece === 'r' && ['best','excellent','great'].includes(id)) {
            try {
                const temp = new Chess(fenAfter);
                const grid = temp.board();
                const fileIdx = move.to.charCodeAt(0) - 97;
                let ourPawns = 0, oppPawns = 0;
                for (let r = 0; r < 8; r++) {
                    const sq = grid[r][fileIdx];
                    if (sq && sq.type === 'p') {
                        if (sq.color === (isWhite ? 'w' : 'b')) ourPawns++;
                        else oppPawns++;
                    }
                }
                if (ourPawns === 0 && oppPawns === 0) {
                    positionalInsight = ` ♖ The rook takes absolute command of the fully open ${move.to[0]}-file.`;
                } else if (ourPawns === 0 && oppPawns > 0) {
                    positionalInsight = ` ♖ The rook is perfectly placed on the semi-open ${move.to[0]}-file, pressuring the opponent's position.`;
                }
            } catch(e) {}
        }


        // ── Endgame coaching ──────────────────────────────────────────────
        const endgameTip = getEndgameCoaching(fenAfter, isWhite, phase);
        const endgameNote = endgameTip
            ? ` 🏁 <em>${endgameTip}</em>`
            : '';

        const pickTpl = (arr) => arr[index % arr.length];

        const LABELS = {
            book:       '📖 Opening Theory',
            brilliant:  '!! Brilliant Move',
            great:      '! Great Move',
            best:       '★ Best Move',
            excellent:  '✓ Excellent Move',
            good:       '✔ Good Move',
            inaccuracy: '?! Inaccuracy',
            mistake:    '? Mistake',
            miss:       '✖ Missed Win',
            blunder:    '?? Blunder',
        };

        switch (id) {
            case 'forced': {
                return {
                    label: '➤ Only Move',
                    text: `<strong>${san}</strong> was the only legal move available — no choice to evaluate here.`
                };
            }
            case 'book': {
                const openingRef = gameOpening
                    ? `the <em>${gameOpening}</em>`
                    : 'a known opening sequence';
                return {
                    label: LABELS.book,
                    text: pickTpl([
                        `<strong>${san}</strong> is theory in ${openingRef}. Both sides are developing their pieces naturally.`,
                        `<strong>${san}</strong> is a standard book move in ${openingRef}.`
                    ])
                };
            }
            case 'brilliant': {
                const mateStr = mateAchieved
                    ? ` This sacrifice leads to a forced <strong>Mate in ${mateAchieved}</strong>!`
                    : '';
                const baseText = pickTpl([
                    `<strong>${san}!!</strong> A brilliant find! You sacrifice material to unleash powerful tactics that are extremely difficult to defend.`,
                    `<strong>${san}!!</strong> is brilliant! This is a spectacular sacrifice that completely changes the dynamic of the game.`,
                    `<strong>${san}!!</strong> is a masterclass move! You spotted an incredible tactical continuation.`
                ]);
                return { label: LABELS.brilliant, text: baseText + mateStr + positionalInsight + forkNote + pinNote + criticalBanner };
            }
            case 'great': {
                const pv2Cp  = move.pv2Cp;
                const pv2Wp  = (pv2Cp !== null && pv2Cp !== undefined) ? playerWp(pv2Cp, isWhite) : null;
                const pv2Gap = pv2Wp !== null ? Math.round(currWp - pv2Wp) : 0;
                const isOnlyMove = pv2Gap >= 10;
                const extra  = bestDesc ? ` You saw exactly how it ${bestDesc}.` : '';

                let baseText;
                if (isOnlyMove) {
                    baseText = pickTpl([
                        `<strong>${san}!</strong> A great move! This was the only good continuation in a critical position.${extra}`,
                        `<strong>${san}!</strong> is a great move. You found the absolute best way to navigate this sharp position.${extra}`,
                        `<strong>${san}!</strong> is a fantastic find. Any other move would have been significantly worse.`
                    ]);
                } else {
                    baseText = pickTpl([
                        `<strong>${san}!</strong> A great move that completely shifts the momentum in your favor.${extra}`,
                        `<strong>${san}!</strong> is a decisive, game-changing continuation that takes control of the board.${extra}`,
                        `<strong>${san}!</strong> is a fantastic move that creates severe problems for ${opp}.${extra}`
                    ]);
                }
                return { label: LABELS.great, text: baseText + positionalInsight + forkNote + pinNote + matNote + criticalBanner };
            }
            case 'best': {
                const mateStr = mateAchieved
                    ? ` You've set up a forced <strong>Mate in ${mateAchieved}</strong>!`
                    : '';
                let baseText;
                if (captName) {
                    baseText = pickTpl([
                        `<strong>${san}</strong> is the best move. Capturing the ${captName} simplifies the position favorably.`,
                        `<strong>${san}</strong> is exactly right, grabbing the ${captName} and pressing your advantage.`
                    ]);
                } else if (isLosing) {
                    baseText = `<strong>${san}</strong> is the best move. It's the most stubborn defense available in a very difficult position.`;
                } else if (isWinning) {
                    baseText = pickTpl([
                        `<strong>${san}</strong> is the best move. You maintain your winning advantage perfectly.`,
                        `<strong>${san}</strong> is the top choice, keeping the pressure fully on ${opp}.`
                    ]);
                } else {
                    baseText = pickTpl([
                        `<strong>${san}</strong> is the best move. It handles the immediate threats while improving your position.`,
                        `<strong>${san}</strong> is the most accurate continuation in this ${posContext} position.`
                    ]);
                }
                return { label: LABELS.best, text: baseText + mateStr + positionalInsight + forkNote + pinNote + matNote + principleNote + endgameNote + criticalBanner };
            }
            case 'excellent': {
                let baseText;
                if (captName) {
                    baseText = `<strong>${san}</strong> is an excellent move. Trading off the ${captName} is a very strong practical decision.`;
                } else {
                    baseText = pickTpl([
                        `<strong>${san}</strong> is an excellent move. It develops with purpose and keeps you well in the game.`,
                        `<strong>${san}</strong> is a great practical choice that maintains a solid position.`
                    ]);
                }
                return { label: LABELS.excellent, text: baseText + positionalInsight + forkNote + pinNote + matNote + principleNote + endgameNote };
            }
            case 'good': {
                let text = pickTpl([
                    `<strong>${san}</strong> is a good, solid move.`,
                    `<strong>${san}</strong> is perfectly fine here.`,
                    `<strong>${san}</strong> is a reasonable choice.`
                ]);
                if (bestSan && bestSan !== san) {
                    text += ` However, <strong style="color:var(--accent)">${bestSan}</strong> was slightly more accurate.`;
                }
                return { label: LABELS.good, text: text + positionalInsight + principleNote + endgameNote };
            }
            case 'inaccuracy': {
                let text = pickTpl([
                    `<strong>${san}?!</strong> is an inaccuracy.`,
                    `<strong>${san}?!</strong> is a slight misstep.`,
                    `<strong>${san}?!</strong> is not the most precise choice.`
                ]);
                if (threat) {
                    text += threatSentence;
                } else if (isWinning && currWp < 60) {
                    text += ` You let a solid advantage slip away in this ${phase}.`;
                } else if (isEqual) {
                    text += ` It gives ${opp} a slight edge in a previously balanced position.`;
                } else {
                    text += ` It allows ${opp} back into the game.`;
                }
                text += principleNote + kingSafetyNote + endgameNote + bestSuggest;
                return { label: LABELS.inaccuracy, text };
            }
            case 'mistake': {
                let text = pickTpl([
                    `<strong>${san}?</strong> is a mistake.`,
                    `<strong>${san}?</strong> is an error.`,
                    `<strong>${san}?</strong> is a poor choice here.`
                ]);
                if (oppMateAfter) {
                    text += `<br><br>💀 <strong>Fatal:</strong> This allows ${opp} a forced <strong>Mate in ${oppMateAfter}</strong>!`;
                } else if (threat) {
                    text += threatSentence;
                } else if (!bestDesc && !oppMateAfter) {
                    text += ` This is a serious positional mistake, giving up control of the board.`;
                } else if (isWinning && currWp <= 50) {
                    text += ` You gave up your entire advantage here.`;
                } else {
                    text += ` ${opp} now gains a significant edge.`;
                }
                text += criticalBanner + bestSuggest;
                return { label: LABELS.mistake, text };
            }
            case 'miss': {
                let text;
                if (mateAvailable) {
                    text = `<strong>${san}</strong> misses a forced <strong>Mate in ${mateAvailable}</strong>! `;
                    text += bestSan
                        ? `<br><br>💡 <strong style="color:var(--accent)">${bestSan}</strong> would have delivered checkmate.`
                        : '<br><br>💡 The opponent could have been checkmated here.';
                } else {
                    text = pickTpl([
                        `<strong>${san}</strong> misses a critical chance.`,
                        `<strong>${san}</strong> overlooks a winning opportunity.`,
                        `<strong>${san}</strong> lets a golden opportunity slip by.`
                    ]);
                    if (bestDesc && bestSan) {
                        text += `<br><br>💡 You missed a tactic where <strong style="color:var(--accent)">${bestSan}</strong> ${bestDesc}.`;
                    } else {
                        text += ` You had a commanding position but missed the most punishing continuation.`;
                        if (bestSan) text += `<br><br>💡 You missed a chance to play <strong style="color:var(--accent)">${bestSan}</strong>.`;
                    }
                }
                return { label: LABELS.miss, text: text + criticalBanner };
            }
            case 'blunder': {
                let text = pickTpl([
                    `<strong>${san}??</strong> is a major blunder.`,
                    `<strong>${san}??</strong> is a terrible mistake.`,
                    `<strong>${san}??</strong> throws the game away.`
                ]);
                if (oppMateAfter) {
                    text += `<br><br>💀 <strong>Game Over:</strong> This hands ${opp} a forced <strong>Mate in ${oppMateAfter}</strong>!`;
                } else if (threat) {
                    text += threatSentence;
                } else if (captName) {
                    text += ` Capturing the ${captName} directly hands ${opp} a decisive advantage.`;
                } else {
                    text += ` The game completely turns in ${opp}'s favor here.`;
                }
                text += criticalBanner + bestSuggest;
                return { label: LABELS.blunder, text };
            }
            default:
                return { label: 'Analysis', text: `<strong>${san}</strong> ${cls.text}` };
        }
    }

    function updateCoachBubble(index) {
        const bubble = el.coachBubble;
        if (index < 0) {
            // Show placeholder so coach wrapper always takes up space
            // This keeps the board at a stable Y position from the start
            bubble.classList.remove('invisible');
            const iconEl = document.getElementById('coach-icon');
            if (iconEl) { iconEl.className = 'coach-icon'; iconEl.innerHTML = '♟'; }
            const labelEl = document.getElementById('coach-label');
            if (labelEl) labelEl.textContent = 'Game Start';
            el.coachText.innerHTML = 'Navigate through moves to see analysis.';
            el.coachScore.textContent = '';
            return;
        }
        const move = moves[index];
        if (move && move.classification) {
            bubble.classList.remove('invisible');

            // Remove old classification classes from bubble
            const clsNames = ['brilliant','great','best','excellent','good','book','inaccuracy','mistake','miss','blunder'];
            bubble.classList.remove(...clsNames);
            bubble.classList.add(move.classification.class);

            // Update icon (now accessed by id)
            const iconEl = document.getElementById('coach-icon');
            if (iconEl) {
                iconEl.className = `coach-icon ${move.classification.class}`;
                iconEl.innerHTML = move.classification.icon;
            }

            // Build rich explanation
            let { label, text } = buildCoachExplanation(index);

            const labelEl = document.getElementById('coach-label');
            if (labelEl) labelEl.textContent = label;

            // Show Threat Button Logic
            const nextEngineData = reviewEvals[index + 1];
            if (['blunder', 'mistake', 'miss'].includes(move.classification.id) && nextEngineData && nextEngineData.pv1Sequence) {
                text += `<div style="margin-top: 12px;"><button class="secondary-btn" id="btn-show-threat" style="width: 100%; font-size: 0.9rem; padding: 8px 16px; border-radius: 8px; background: rgba(229,83,75,0.15); border: 1px solid rgba(229,83,75,0.4); color: #e5534b; cursor: pointer; display: flex; justify-content: center; align-items: center; gap: 8px;">🔥 Show Opponent's Threat</button></div>`;
            }

            el.coachText.innerHTML = text;
            
            const threatBtn = document.getElementById('btn-show-threat');
            if (threatBtn) {
                threatBtn.addEventListener('click', () => {
                    if (nextEngineData && nextEngineData.pv1Sequence) {
                        const pvMoves = nextEngineData.pv1Sequence.split(' ');
                        const arrows = [];
                        let opacity = 0.9;
                        for (let i = 0; i < Math.min(3, pvMoves.length); i++) {
                            arrows.push({ move: pvMoves[i], color: `rgba(229,83,75,${opacity})` });
                            opacity -= 0.25;
                        }
                        drawArrows(arrows);
                    }
                });
            }

            // Eval score
            if (move.evalCp !== undefined) {
                const cp = move.evalCp;
                if (Math.abs(cp) >= 29000) {
                    const mateIn = 30000 - Math.abs(cp);
                    el.coachScore.textContent = cp > 0 ? `M${mateIn}` : `-M${mateIn}`;
                } else {
                    const pawns = (cp / 100).toFixed(2);
                    el.coachScore.textContent = cp > 0 ? `+${pawns}` : `${pawns}`;
                }
            } else {
                el.coachScore.textContent = '';
            }
        } else {
            bubble.classList.add('invisible');
        }
    }

    function renderMoveList() {
        el.movesList.innerHTML = '';
        if (moves.length === 0) return;

        let html = '';
        for (let i = 0; i < moves.length; i += 2) {
            const moveNumber = (i / 2) + 1;
            const w = moves[i];
            const b = moves[i + 1];

            const renderMove = (m, idx) => {
                if (!m) return `<div class="move"></div>`;
                // Forced moves get no icon badge
                const isForced = m.classification && m.classification.id === 'forced';
                const iconHtml = (m.classification && !isForced)
                    ? `<div class="move-icon ${m.classification.class}">${m.classification.icon}</div>`
                    : '';
                return `<div class="move${isForced ? ' forced' : ''}" data-index="${idx}" id="move-${idx}">
                            <div class="move-text">${m.san}</div>
                            ${iconHtml}
                        </div>`;
            };

            html += `<div class="move-row">
                <div class="move-number">${moveNumber}.</div>
                ${renderMove(w, i)}
                ${renderMove(b, i + 1)}
            </div>`;
        }
        el.movesList.innerHTML = html;

        document.querySelectorAll('.move[data-index]').forEach(el => {
            el.addEventListener('click', e => {
                const idx = parseInt(e.currentTarget.getAttribute('data-index'));
                goToMove(idx, false);
            });
        });
    }

    // Draw one arrow on the board SVG overlay
    function _drawSingleArrow(arrowGroup, move, color) {
        if (!move || move.length < 4) return;
        const flipped = board.orientation() === 'black';
        const f1 = move.charCodeAt(0) - 97, r1 = parseInt(move[1]) - 1;
        const f2 = move.charCodeAt(2) - 97, r2 = parseInt(move[3]) - 1;
        
        const x1 = ((flipped ? 7-f1 : f1) + 0.5) * 12.5;
        const y1 = ((flipped ? r1 : 7-r1) + 0.5) * 12.5;
        const x2 = ((flipped ? 7-f2 : f2) + 0.5) * 12.5;
        const y2 = ((flipped ? r2 : 7-r2) + 0.5) * 12.5;
        
        // Calculate shortened distance so arrowhead doesn't overlap center of piece too much
        const dx = x2 - x1;
        const dy = y2 - y1;
        const dist = Math.sqrt(dx*dx + dy*dy);
        
        // Chess.com style shortened arrows: start slightly off center, end before center
        const startOffset = 2.0;
        const endOffset = 3.5;
        
        let startX = x1, startY = y1, endX = x2, endY = y2;
        if (dist > (startOffset + endOffset)) {
            startX = x1 + (dx / dist) * startOffset;
            startY = y1 + (dy / dist) * startOffset;
            endX = x2 - (dx / dist) * endOffset;
            endY = y2 - (dy / dist) * endOffset;
        }

        const svg = arrowGroup.closest('svg');
        let defs = svg.querySelector('defs');
        if (!defs) {
            defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            svg.appendChild(defs);
        }

        const cleanColor = color.replace(/[^a-zA-Z0-9]/g, '');
        const markerId = `ah_${cleanColor}`;

        if (!defs.querySelector(`#${markerId}`)) {
            const m = document.createElementNS('http://www.w3.org/2000/svg','marker');
            m.setAttribute('id', markerId);
            m.setAttribute('markerWidth','3'); 
            m.setAttribute('markerHeight','3');
            m.setAttribute('refX','1.4'); // blend line into arrowhead seamlessly
            m.setAttribute('refY','1.5');
            m.setAttribute('orient','auto');
            
            const poly = document.createElementNS('http://www.w3.org/2000/svg','polygon');
            poly.setAttribute('points','0 0, 3 1.5, 0 3, 0.4 1.5'); // swept-back professional arrowhead
            poly.setAttribute('fill', color);
            m.appendChild(poly); 
            defs.appendChild(m);
        }

        const line = document.createElementNS('http://www.w3.org/2000/svg','line');
        line.setAttribute('x1',`${startX}%`); line.setAttribute('y1',`${startY}%`);
        line.setAttribute('x2',`${endX}%`); line.setAttribute('y2',`${endY}%`);
        line.setAttribute('stroke', color);
        line.setAttribute('stroke-width','1.6%'); // perfect sleek thickness
        line.setAttribute('stroke-linecap','butt'); // prevent poking out of the arrowhead
        line.setAttribute('marker-end', `url(#${markerId})`);
        // Add a subtle drop shadow
        line.style.filter = "drop-shadow(0px 1.5px 3px rgba(0,0,0,0.4))";
        arrowGroup.appendChild(line);
    }

    // drawArrows([{move:'e2e4', color:'green'}, {move:'d2d4', color:'orange'}])
    function drawArrows(list) {
        const arrowGroup = document.getElementById('arrow-group');
        if (!arrowGroup) return;
        arrowGroup.innerHTML = '';
        (list || []).forEach(({move, color}) => _drawSingleArrow(arrowGroup, move, color));
    }

    // Legacy single-arrow helper (green)
    function drawArrow(move) {
        drawArrows(move ? [{ move, color: 'rgba(129,182,76,0.85)' }] : []);
    }

    function clearBoardHighlights() {
        $('#board .square-55d63').removeClass('square-highlight highlight-from highlight-to brilliant great best excellent good book inaccuracy mistake miss blunder');
        $('#board .board-badge').remove();
        if (typeof drawArrow === 'function') drawArrow('');
    }

    function goToMove(index, animate = true) {
        if (isReviewing) return;
        if (index < -1 || index >= moves.length) return;
        currentMoveIndex = index;

        // ── Rapid-navigation ghost-piece fix ────────────────────────────
        // If the previous board update was less than the animation duration ago,
        // skip animation entirely — calling board.position() while a CSS
        // transition is still running causes pieces to "teleport" mid-flight.
        const ANIM_DURATION = 160; // slightly above the 150ms moveSpeed
        const now = Date.now();
        const shouldAnimate = animate && (now - lastNavTime) >= ANIM_DURATION;
        lastNavTime = now;

        clearBoardHighlights();

        if (index === -1) {
            game.reset();
            board.position(startFen === 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' ? 'start' : startFen, false);
            updateEvalUI(reviewEvals[0] ? reviewEvals[0].cp : 0);
        } else {
            const fen = moves[index].fen;
            game.load(fen);
            board.position(fen, shouldAnimate);
            playMoveSound(moves[index]);
            if (moves[index].evalCp !== undefined) updateEvalUI(moves[index].evalCp);

            const move = moves[index];
            if (move && move.classification && move.to && move.classification.id !== 'forced') {
                setTimeout(() => {
                    const sqTo   = $('#board .square-' + move.to);
                    const sqFrom = $('#board .square-' + move.from);
                    if (sqFrom.length > 0) sqFrom.addClass('highlight-from');
                    if (sqTo.length > 0) {
                        sqTo.addClass('square-highlight highlight-to').addClass(move.classification.class);
                        if (move.classification.icon) {
                            let animClass = '';
                            if (move.classification.class === 'brilliant') animClass = ' animate-brilliant';
                            if (move.classification.class === 'great') animClass = ' animate-great';
                            sqTo.append(`<div class="board-badge ${move.classification.class}${animClass}">${move.classification.icon}</div>`);
                        }
                    }
                }, 50);
            } else if (move && move.to) {
                // Forced move: still highlight squares but no badge
                setTimeout(() => {
                    const sqTo   = $('#board .square-' + move.to);
                    const sqFrom = $('#board .square-' + move.from);
                    if (sqFrom.length > 0) sqFrom.addClass('highlight-from');
                    if (sqTo.length > 0) sqTo.addClass('square-highlight highlight-to');
                }, 50);
            }
        }

        document.querySelectorAll('.move').forEach(e => e.classList.remove('active'));
        if (index >= 0) {
            const moveEl = document.getElementById(`move-${index}`);
            if (moveEl) {
                moveEl.classList.add('active');
                
                // Manual scroll to avoid scrollIntoView shifting the entire page
                const container = el.movesList.parentElement;
                const cRect = container.getBoundingClientRect();
                const eRect = moveEl.getBoundingClientRect();
                
                if (eRect.top < cRect.top) {
                    container.scrollBy({ top: eRect.top - cRect.top - 10, behavior: 'smooth' });
                } else if (eRect.bottom > cRect.bottom) {
                    container.scrollBy({ top: eRect.bottom - cRect.bottom + 10, behavior: 'smooth' });
                }
            }
        }

        updateCoachBubble(index);

        // Arrows + Alternative Best Move display
        if (!isReviewing) {
            // engineData[i]   = eval of position BEFORE move[i] → contains bestMove recommended
            // engineData[i+1] = eval AFTER move[i] → bestMove for NEXT position (future arrow)
            const prevEngineData = (index >= 0) ? reviewEvals[index] : null; // before played move
            const nextEngineData = (index === -1) ? reviewEvals[0] : reviewEvals[index + 1]; // next pos

            const playedUci = (index >= 0) ? moves[index].uci : null;
            const recUci    = prevEngineData ? prevEngineData.bestMove : null;
            const isPlayedBest = playedUci && recUci && playedUci === recUci;

            // Build arrow list
            const arrows = [];
            
            // 1. Arrow for the engine's recommended best move in the CURRENT position (if any)
            if (nextEngineData && nextEngineData.bestMove && !isPlayedBest) {
                // If the player hasn't moved yet, or we're just showing next best
                arrows.push({ move: nextEngineData.bestMove, color: 'rgba(129,182,76,0.85)' });
            }

            // 2. Highlight Blunders/Mistakes vs Best Move
            if (index >= 0 && recUci && !isPlayedBest) {
                const clsId = moves[index].classification ? moves[index].classification.id : '';
                
                if (clsId === 'blunder' || clsId === 'mistake' || clsId === 'miss') {
                    // Red arrow for the bad move played
                    arrows.push({ move: playedUci, color: 'rgba(229,83,75,0.8)' }); // Red
                    // Green arrow for the correct/best move
                    arrows.push({ move: recUci, color: 'rgba(129,182,76,0.9)' });   // Green
                } else if (clsId === 'inaccuracy') {
                    // Orange arrow for the played move
                    arrows.push({ move: playedUci, color: 'rgba(229,143,42,0.8)' }); // Orange
                    // Green arrow for the correct/best move
                    arrows.push({ move: recUci, color: 'rgba(129,182,76,0.9)' });   // Green
                } else {
                    // Just show the best move in orange if it's not a severe error
                    arrows.push({ move: recUci, color: 'rgba(255,165,0,0.8)' });
                }
            }
            
            if (arrowsEnabled) {
                drawArrows(arrows);
            } else {
                drawArrows([]);
            }

            // Best-move display text
            if (nextEngineData && nextEngineData.bestMove) {
                const fenCurrent = moves[index] ? moves[index].fen : startFen;
                const nextBestSan = uciToSan(fenCurrent, nextEngineData.bestMove);
                el.bestMoveDisplay.innerHTML = `Next Best: <span style="color:var(--accent)">${nextBestSan}</span>`;
            } else {
                el.bestMoveDisplay.innerHTML = 'Best Move: -';
            }

            // Alternative Best Move panel (shown when played move ≠ engine recommendation)
            const altPanel = document.getElementById('alt-best-panel');
            if (altPanel) {
                if (index >= 0 && prevEngineData && prevEngineData.bestMove && !isPlayedBest) {
                    const altCp   = prevEngineData.cp; // eval of position before move (white persp)
                    const pv2Move = prevEngineData.pv2Move;
                    const isWhite = (index % 2 === 0);
                    const altWp   = playerWp(altCp, isWhite);
                    
                    const fenBefore = index === 0 ? startFen : moves[index - 1].fen;
                    const bestSan = uciToSan(fenBefore, prevEngineData.bestMove);
                    const pv2San = pv2Move ? uciToSan(fenBefore, pv2Move) : '';
                    
                    const pv2Label = pv2San ? ` · Alt: <span style="color:#aaa">${pv2San}</span>` : '';
                    altPanel.innerHTML = `
                        <div class="alt-best-row">
                            <span class="alt-label">Best was</span>
                            <span class="alt-move">${bestSan}</span>
                            ${pv2Label}
                        </div>`;
                    altPanel.classList.remove('hidden');
                } else {
                    altPanel.classList.add('hidden');
                }
            }
        }
    }

    // =========================================================
    // ACTIONS
    // =========================================================

    el.loadBtn.addEventListener('click', () => {
        let pgn = el.pgnInput.value.trim();
        if (!pgn) return;

        // --- Smart PGN Extraction ---
        // Strip out leading text before headers or the first move
        const startIdx = pgn.search(/\[[A-Za-z]+|1\./);
        if (startIdx !== -1) {
            pgn = pgn.substring(startIdx);
        }
        
        // Strip out trailing text after the game result marker
        const endMatch = pgn.match(/.*(1-0|0-1|1\/2-1\/2|\*)/s);
        if (endMatch) {
            pgn = endMatch[0];
        }
        // ----------------------------

        // Ensure blank line between headers and moves (chess.js requirement)
        pgn = pgn.replace(/\]\s+(?=[^\[])/g, "]\n\n");

        game = new Chess();
        if (!game.load_pgn(pgn)) return alert("Invalid PGN format.");

        const header = game.header();
        el.whitePlayer.textContent = header.White || 'White';
        el.blackPlayer.textContent = header.Black || 'Black';
        document.getElementById('white-rating').textContent = header.WhiteElo ? `(${header.WhiteElo})` : '';
        document.getElementById('black-rating').textContent  = header.BlackElo  ? `(${header.BlackElo})`  : '';
        el.gameResult.textContent = header.Result || '*';
        el.gameInfo.classList.remove('hidden');

        // --- Report Dashboard Population ---
        const reportWhiteName = document.getElementById('report-w-name');
        const reportBlackName = document.getElementById('report-b-name');
        if (reportWhiteName) reportWhiteName.textContent = header.White || 'White';
        if (reportBlackName) reportBlackName.textContent = header.Black || 'Black';

        const result = header.Result || '*';
        const wAvatar = document.getElementById('report-w-avatar');
        const wPlaceholder = document.getElementById('report-w-placeholder');
        const bAvatar = document.getElementById('report-b-avatar');
        const bPlaceholder = document.getElementById('report-b-placeholder');

        const defaultAvatar = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iIzQ0NCIvPjxjaXJjbGUgY3g9IjUwIiBjeT0iNDAiIHI9IjIwIiBmaWxsPSIjYWFhIi8+PHBhdGggZD0iTTAgMTAwIEMgMCA2MCAxMDAgNjAgMTAwIDEwMCIgZmlsbD0iI2FhYSIvPjwvc3ZnPg==';

        if (wAvatar && wPlaceholder && bAvatar && bPlaceholder) {
            wAvatar.src = defaultAvatar;
            bAvatar.src = defaultAvatar;
            wAvatar.style.display = 'block';
            bAvatar.style.display = 'block';
            wPlaceholder.style.display = 'none';
            bPlaceholder.style.display = 'none';

            wAvatar.classList.remove('avatar-winner');
            bAvatar.classList.remove('avatar-winner');
            if (result === '1-0') wAvatar.classList.add('avatar-winner');
            else if (result === '0-1') bAvatar.classList.add('avatar-winner');

            if (header.White && header.White !== 'White') {
                fetch(`https://api.chess.com/pub/player/${header.White}`)
                    .then(r => r.json())
                    .then(data => { if (data.avatar) wAvatar.src = data.avatar; })
                    .catch(() => {});
            }
            if (header.Black && header.Black !== 'Black') {
                fetch(`https://api.chess.com/pub/player/${header.Black}`)
                    .then(r => r.json())
                    .then(data => { if (data.avatar) bAvatar.src = data.avatar; })
                    .catch(() => {});
            }
        }
        // -----------------------------------

        // Extract Opening Name for "Theory"
        let openingName = header.Opening;
        if (!openingName && header.ECOUrl) {
            const urlParts = header.ECOUrl.split('/');
            const lastPart = urlParts[urlParts.length - 1];
            let nameParts = lastPart.split('-');
            let cleanParts = [];
            for (let part of nameParts) {
                if (part.match(/^[0-9]/)) break; 
                cleanParts.push(part);
            }
            openingName = cleanParts.join(' ');
        }
        gameOpening = openingName || "";

        // Extract moves — also store piece/captured/flags for sacrifice detection
        const history = game.history({ verbose: true });
        moves = [];
        game.reset();

        // Record the starting FEN before any move is made
        startFen = game.fen();

        history.forEach(m => {
            game.move(m);
            moves.push({
                san:      m.san,
                fen:      game.fen(),
                to:       m.to,
                from:     m.from,
                piece:    m.piece,       // piece type that moved
                captured: m.captured,    // captured piece type (or undefined)
                flags:    m.flags,       // e.g. 'c' capture, 'e' en-passant, 'p' promotion
                uci:      m.from + m.to + (m.promotion ? m.promotion : '') // used for engine match
            });
        });

        // Reset review state
        reviewEvals = [];

        renderMoveList();
        switchTab('moves');
        goToMove(-1);
        
        if (typeof gtag === 'function') gtag('event', 'pgn_loaded');
    });

    // Fetch Games from Chess.com
    const fetchBtn   = document.getElementById('fetch-games-btn');
    const fetchInput = document.getElementById('chesscom-username');
    const fetchError = document.getElementById('fetch-error');

    // Modal elements
    const gamesModal     = document.getElementById('games-modal');
    const gamesModalList = document.getElementById('games-modal-list');
    const gamesModalSub  = document.getElementById('games-modal-subtitle');
    const gamesModalClose= document.getElementById('games-modal-close');

    function openGamesModal() { gamesModal.classList.remove('hidden'); }
    function closeGamesModal() { gamesModal.classList.add('hidden'); }

    gamesModalClose.addEventListener('click', closeGamesModal);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeGamesModal(); });

    fetchBtn.addEventListener('click', async () => {
        const username = fetchInput.value.trim();
        if (!username) return;

        fetchBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 0.7s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>';
        fetchBtn.disabled = true;
        fetchError.classList.add('hidden');

        // Show modal with skeleton loaders
        const skeletonHTML = Array(6).fill(`
            <div class="gm-skeleton">
                <div class="gm-skeleton-badge"></div>
                <div class="gm-skeleton-body">
                    <div class="gm-skeleton-line"></div>
                    <div class="gm-skeleton-line short"></div>
                </div>
                <div class="gm-skeleton-right">
                    <div class="gm-skeleton-line short"></div>
                    <div class="gm-skeleton-btn"></div>
                </div>
            </div>
        `).join('');
        gamesModalList.innerHTML = skeletonHTML;
        gamesModalSub.textContent = `Loading games for ${username}...`;
        openGamesModal();

        try {
            // 1. Get archives list
            const archRes = await fetch(`https://api.chess.com/pub/player/${username}/games/archives`);
            if (!archRes.ok) throw new Error('User not found or API error.');
            const archData = await archRes.json();
            
            if (!archData.archives || archData.archives.length === 0) {
                throw new Error('No games found for this user.');
            }

            // 2. Fetch games starting from the latest month's archive (fallback if empty or timezone error)
            gamesModalSub.textContent = `Loading recent games...`;
            let allGames = [];
            
            // Try up to the 6 most recent archives to accumulate 30 games
            const archivesToCheck = archData.archives.slice(-6).reverse();
            for (const archiveUrl of archivesToCheck) {
                const gamesRes = await fetch(archiveUrl);
                if (gamesRes.ok) {
                    const gamesData = await gamesRes.json();
                    if (gamesData.games && gamesData.games.length > 0) {
                        allGames = allGames.concat([...gamesData.games].reverse());
                        if (allGames.length >= 30) break;
                    }
                }
            }

            allGames = allGames.slice(0, 30); // Keep exactly the last 30 games

            if (allGames.length === 0) throw new Error('No recent games found.');

            // 3. Render all games from last month (latest first)
            renderGamesModal(username, allGames, 'chesscom');

            if (typeof gtag === 'function') gtag('event', 'game_fetched', { platform: 'chesscom' });

            // Save username to cache
            localStorage.setItem('chesscom_username', username);

        } catch (err) {
            fetchError.textContent = err.message;
            fetchError.classList.remove('hidden');
        } finally {
            fetchBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
            fetchBtn.disabled = false;
        }
    });

    function renderGamesModal(username, games, source = 'chesscom') {
        gamesModalList.innerHTML = '';
        gamesModalSub.textContent = `${games.length} game${games.length !== 1 ? 's' : ''} found for ${username} (latest first)`;

        const uniqueOpponents = new Set();

        games.forEach((g) => {
            const isWhite = g.white.username.toLowerCase() === username.toLowerCase();
            const opp = isWhite ? g.black.username : g.white.username;
            const oppRating = isWhite ? g.black.rating : g.white.rating;
            const result = isWhite ? g.white.result : g.black.result;

            let resultKey = 'draw';
            let resultIcon = '<rect width="14" height="4" x="5" y="10" fill="currentColor" rx="1.5" /><rect width="14" height="4" x="5" y="16" fill="currentColor" rx="1.5" />'; // equals SVG
            if (result === 'win') {
                resultKey = 'win';
                resultIcon = '<path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5z" fill="currentColor" />'; // plus SVG
            } else if (!['repetition','agreed','stalemate','timevsinsufficient','insufficient','50move'].includes(result)) {
                resultKey = 'loss';
                resultIcon = '<rect width="14" height="4" x="5" y="10" fill="currentColor" rx="1.5" />'; // minus SVG
            }

            // Chess piece SVG directly embedded instead of data URI to fix rendering issue
            const avatarSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#d3d3d3" width="100%" height="100%"><rect width="24" height="24" fill="#e8e8e8"/><path d="M12 4a3 3 0 00-3 3c0 1.11.6 2.08 1.5 2.6A4.99 4.99 0 008 14c0 2.21 1.43 4.1 3.42 4.75L10 21v1h4v-1l-1.42-2.25C14.57 18.1 16 16.21 16 14a4.99 4.99 0 00-2.5-4.4C14.4 9.08 15 8.11 15 7a3 3 0 00-3-3z" fill="#999"/></svg>`;

            uniqueOpponents.add(opp);

            // Use moves-sequence hash (stable — ignores PGN headers/whitespace differences)
            const gameSans = parseMovesFromPgn(g.pgn);
            const hash = computeGameHash(gameSans);
            let localAcc = JSON.parse(localStorage.getItem('localAccuracies') || '{}');
            const savedAcc = localAcc[hash];
            const myAccuracy = savedAcc ? (isWhite ? savedAcc.w : savedAcc.b) : undefined;

            let actionHtml = '';
            if (myAccuracy !== undefined && myAccuracy !== '-') {
                actionHtml = `<div class="gm-accuracy">${myAccuracy}</div>`;
            } else {
                actionHtml = `
                    <button class="gm-analyze-btn" title="Review Game">
                        <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="11" cy="11" r="8"></circle>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                            <line x1="11" y1="8" x2="11" y2="14"></line>
                            <line x1="8" y1="11" x2="14" y2="11"></line>
                        </svg>
                    </button>
                `;
            }

            const timeClass = g.time_class;
            let timeIconHtml = `
                <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="9"></circle>
                    <polyline points="12 7 12 12 15 15"></polyline>
                    <line x1="12" y1="1" x2="12" y2="3"></line>
                </svg>
            `;
            if (timeClass === 'bullet') {
                timeIconHtml = `<img src="icons/bullet.png" style="width: 36px; height: 36px; object-fit: contain; filter: drop-shadow(0 0 1px rgba(255,255,255,0.2)); opacity: 0.9; transform: scale(1.0);" alt="Bullet">`;
            } else if (timeClass === 'blitz') {
                timeIconHtml = `<img src="icons/blitz.png" style="width: 36px; height: 36px; object-fit: contain; filter: drop-shadow(0 0 1px rgba(255,255,255,0.2)); opacity: 0.9; transform: scale(2.2);" alt="Blitz">`;
            } else if (timeClass === 'daily') {
                timeIconHtml = `<img src="icons/daily.png" style="width: 36px; height: 36px; object-fit: contain; filter: drop-shadow(0 0 1px rgba(255,255,255,0.2)); opacity: 0.9; transform: scale(1.8);" alt="Daily" onerror="this.outerHTML='<svg viewBox=\\'0 0 24 24\\' width=\\'22\\' height=\\'22\\' stroke=\\'currentColor\\' stroke-width=\\'2.5\\' fill=\\'none\\' stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\'><circle cx=\\'12\\' cy=\\'12\\' r=\\'9\\'></circle><polyline points=\\'12 7 12 12 15 15\\'></polyline><line x1=\\'12\\' y1=\\'1\\' x2=\\'12\\' y2=\\'3\\'></line></svg>'">`;
            }

            const card = document.createElement('div');
            card.className = 'gm-row';
            card.setAttribute('data-hash', hash);
            card.setAttribute('data-is-white', isWhite);
            card.innerHTML = `
                <div class="gm-time-icon" title="${timeClass || 'Rapid'}">
                    ${timeIconHtml}
                </div>
                <div class="gm-avatar-container" data-opp="${opp.toLowerCase()}">
                    ${avatarSvg}
                </div>
                <div class="gm-details">
                    <div class="gm-username">${opp} ${oppRating ? `<span class="gm-rating">(${oppRating})</span>` : ''}</div>
                </div>
                <div class="gm-result-badge ${resultKey}">
                    <svg viewBox="0 0 24 24" width="14" height="14">
                        ${resultIcon}
                    </svg>
                </div>
                <div class="gm-action">
                    ${actionHtml}
                </div>
            `;

            card.addEventListener('click', () => {
                closeGamesModal();
                // Set state immediately to prevent home screen flash
                setMobileState('analyzing');
                el.pgnInput.value = g.pgn;
                // Auto-flip: if autoFlip is on, set board to user's perspective
                if (autoFlip) {
                    isFlipped = !isWhite;
                    board.orientation(isFlipped ? 'black' : 'white');
                }
                el.loadBtn.click();
                setTimeout(() => el.startReviewBtn.click(), 50);
            });

            const analyzeBtn = card.querySelector('.gm-analyze-btn');
            if (analyzeBtn) {
                analyzeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    closeGamesModal();
                    // Set state immediately to prevent home screen flash
                    setMobileState('analyzing');
                    el.pgnInput.value = g.pgn;
                    el.loadBtn.click();
                    setTimeout(() => el.startReviewBtn.click(), 50);
                });
            }

            gamesModalList.appendChild(card);
        });

        if (source === 'chesscom') {
            uniqueOpponents.forEach(async (oppUsername) => {
                try {
                    const res = await fetch(`https://api.chess.com/pub/player/${oppUsername}`);
                    if (res.ok) {
                        const data = await res.json();
                        if (data.avatar) {
                            const containers = document.querySelectorAll(`.gm-avatar-container[data-opp="${oppUsername.toLowerCase()}"]`);
                            containers.forEach(c => {
                                c.innerHTML = `<img class="gm-avatar" src="${data.avatar}" alt="${oppUsername}">`;
                            });
                        }
                    }
                } catch (e) {}
            });
        }
    }


    // =========================================================
    // LICHESS FETCH
    // =========================================================
    const lichessFetchBtn   = document.getElementById('lichess-fetch-btn');
    const lichessFetchInput = document.getElementById('lichess-username');
    const lichessFetchError = document.getElementById('lichess-fetch-error');

    // Build a minimal PGN string from Lichess NDJSON game object
    function buildLichessPgn(g) {
        const result = g.winner === 'white' ? '1-0' : g.winner === 'black' ? '0-1' : '1/2-1/2';
        const d = new Date(g.createdAt);
        const dateStr = `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
        const wName = g.players.white.user?.name || 'Anonymous';
        const bName = g.players.black.user?.name || 'Anonymous';
        const wRating = g.players.white.rating || '';
        const bRating = g.players.black.rating || '';
        const opening = g.opening?.name || '';
        let movesStr = '';
        if (g.moves) {
            const tokens = g.moves.trim().split(' ');
            tokens.forEach((m, i) => {
                if (i % 2 === 0) movesStr += `${Math.floor(i/2)+1}. `;
                movesStr += m + ' ';
            });
        }
        return `[Event "Rated ${g.speed} game on Lichess"]\n[Site "https://lichess.org/${g.id}"]\n[Date "${dateStr}"]\n[White "${wName}"]\n[Black "${bName}"]\n[Result "${result}"]\n[WhiteElo "${wRating}"]\n[BlackElo "${bRating}"]\n[Opening "${opening}"]\n\n${movesStr.trim()} ${result}`;
    }

    // Convert Lichess NDJSON game to Chess.com-compatible shape for renderGamesModal
    function lichessToChesscom(g, username) {
        const result = g.winner === 'white' ? '1-0' : g.winner === 'black' ? '0-1' : '1/2-1/2';
        const wName = g.players.white.user?.name || 'Anonymous';
        const bName = g.players.black.user?.name || 'Anonymous';
        const isWhite = wName.toLowerCase() === username.toLowerCase();
        const myWin = (isWhite && g.winner === 'white') || (!isWhite && g.winner === 'black');
        const isDraw = !g.winner;
        return {
            white:      { username: wName, rating: g.players.white.rating, result: g.winner === 'white' ? 'win' : isDraw ? 'agreed' : 'resigned' },
            black:      { username: bName, rating: g.players.black.rating, result: g.winner === 'black' ? 'win' : isDraw ? 'agreed' : 'resigned' },
            time_class: g.speed,
            end_time:   Math.floor(g.lastMoveAt / 1000),
            pgn:        buildLichessPgn(g)
        };
    }

    if (lichessFetchBtn) {
        lichessFetchBtn.addEventListener('click', async () => {
            const username = lichessFetchInput.value.trim();
            if (!username) return;

            lichessFetchBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 0.7s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>';
            lichessFetchBtn.disabled = true;
            lichessFetchError.classList.add('hidden');

            // Skeleton in modal
            const skeletonHTML = Array(5).fill(`
                <div class="gm-skeleton">
                    <div class="gm-skeleton-badge"></div>
                    <div class="gm-skeleton-body">
                        <div class="gm-skeleton-line"></div>
                        <div class="gm-skeleton-line short"></div>
                    </div>
                    <div class="gm-skeleton-right">
                        <div class="gm-skeleton-line short"></div>
                        <div class="gm-skeleton-btn"></div>
                    </div>
                </div>`).join('');
            gamesModalList.innerHTML = skeletonHTML;
            gamesModalSub.textContent = `Loading Lichess games for ${username}...`;
            openGamesModal();

            try {
                const url = `https://lichess.org/api/games/user/${encodeURIComponent(username)}?max=30&moves=true&tags=true&clocks=false&evals=false&opening=true`;
                const res = await fetch(url, { headers: { 'Accept': 'application/x-ndjson' } });
                if (!res.ok) throw new Error('User not found or Lichess API error.');
                const text = await res.text();
                const lines = text.trim().split('\n').filter(Boolean);
                if (lines.length === 0) throw new Error('No games found.');
                const lichessGames = lines.map(l => JSON.parse(l)); // Lichess API already returns latest first
                const chesscomGames = lichessGames.map(g => lichessToChesscom(g, username));
                renderGamesModal(username, chesscomGames, 'lichess');
                localStorage.setItem('lichess_username', username);
                
                if (typeof gtag === 'function') gtag('event', 'game_fetched', { platform: 'lichess' });
            } catch (err) {
                lichessFetchError.textContent = err.message;
                lichessFetchError.classList.remove('hidden');
                closeGamesModal();
            } finally {
                lichessFetchBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
                lichessFetchBtn.disabled = false;
            }
        });

        // Auto-fill cached Lichess username
        const cachedLichess = localStorage.getItem('lichess_username');
        if (cachedLichess) lichessFetchInput.value = cachedLichess;
    }


    // Auto-fill cached username (don't auto-fetch on load)
    const cachedUsername = localStorage.getItem('chesscom_username');
    if (cachedUsername) {
        fetchInput.value = cachedUsername;
        // Don't auto-fetch — user clicks Fetch manually
    }

    el.startReviewBtn.addEventListener('click', startFullReview);

    // Navigation
    const goToStart = () => goToMove(-1, false);
    const goToEnd   = () => goToMove(moves.length - 1, false);
    const goPrev    = () => goToMove(currentMoveIndex - 1, true);
    const goNext    = () => goToMove(currentMoveIndex + 1, true);

    const setupLongPressNav = (btnId, navFn) => {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        
        let intervalId = null;
        let timeoutId = null;
        let lastTouchTime = 0;

        const start = (e) => {
            if (e.type === 'touchstart') {
                e.preventDefault(); // Prevents synthetic mouse events on most mobile browsers
                lastTouchTime = Date.now();
            } else {
                if (e.button !== undefined && e.button !== 0) return; // only left click
                // Prevent synthetic mousedown firing after touchstart
                if (Date.now() - lastTouchTime < 500) return;
            }
            
            navFn();
            
            // start fast nav if held for 400ms (slightly longer to prevent accidental fast-scroll on slow clicks)
            timeoutId = setTimeout(() => {
                intervalId = setInterval(navFn, 80); // very fast!
            }, 400);
        };

        const stop = (e) => {
            if (timeoutId) clearTimeout(timeoutId);
            if (intervalId) clearInterval(intervalId);
            timeoutId = null;
            intervalId = null;
        };

        btn.addEventListener('mousedown', start);
        btn.addEventListener('touchstart', start, {passive: false});
        btn.addEventListener('mouseup', stop);
        btn.addEventListener('mouseleave', stop);
        btn.addEventListener('touchend', stop);
        btn.addEventListener('touchcancel', stop);
    };

    setupLongPressNav('btn-prev', goPrev);
    setupLongPressNav('btn-next', goNext);
    document.getElementById('btn-flip').addEventListener('click', () => {
        isFlipped = !isFlipped;
        board.orientation(isFlipped ? 'black' : 'white');
    });

    document.addEventListener('keydown', e => {
        if (document.activeElement.tagName === 'TEXTAREA' || document.activeElement.tagName === 'INPUT') return;
        if (e.key === 'ArrowLeft')  goPrev();
        else if (e.key === 'ArrowRight') goNext();
        else if (e.key === 'ArrowUp')    goToStart();
        else if (e.key === 'ArrowDown')  goToEnd();
    });

    // Tabs
    function switchTab(tab) {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.getElementById(`tab-${tab}`).classList.add('active');
        document.getElementById(`content-${tab}`).classList.add('active');
    }
    el.tabMoves.addEventListener('click', () => switchTab('moves'));
    el.tabReview.addEventListener('click', () => switchTab('review'));

});
