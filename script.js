// ── Premium Sound Design (Web Audio API) ──
const PremiumSoundManager = {
    audioCtx: null,
    init() {
        if (!this.audioCtx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                this.audioCtx = new AudioContext();
            }
        }
    },
    playTone(frequency, type, duration, vol, detune=0) {
        if (!this.audioCtx) return;
        try {
            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(frequency, this.audioCtx.currentTime);
            if (osc.detune) osc.detune.setValueAtTime(detune, this.audioCtx.currentTime);
            
            gain.gain.setValueAtTime(vol, this.audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + duration);
            
            osc.connect(gain);
            gain.connect(this.audioCtx.destination);
            
            osc.start();
            osc.stop(this.audioCtx.currentTime + duration);
        } catch (e) {
            console.error("Audio API error", e);
        }
    },
    playSuccess() {
        this.playTone(600, 'sine', 0.1, 0.04);
        setTimeout(() => this.playTone(800, 'sine', 0.2, 0.04), 100);
    },
    playError() {
        this.playTone(300, 'sawtooth', 0.15, 0.03);
        setTimeout(() => this.playTone(250, 'sawtooth', 0.2, 0.03), 150);
    }
};

// Initialize audio context on first user interaction
document.addEventListener('click', () => PremiumSoundManager.init(), { once: true });

function initRegistrationApp() {
    // ==========================================
    // CONFIGURATION
    // Registration open/close is now controlled from Admin Panel
    // No need to change code — toggle it from admin.html
    // ==========================================
    // eventId is now loaded dynamically from Firestore!
    let currentEventId = 'event_default';

    // ── PROMO CODE STATE ──────────────────────────────────────
    // Stores the last successfully validated promo code.
    // IMPORTANT: This is ONLY used for display/UI purposes.
    // The actual discount is always RE-FETCHED from Firestore on submit.
    let appliedPromo = null; // { code: 'CHESS50', discount: 50 }

    // ── REGISTRATION FEE STATE ───────────────────────────────────
    // These are DISPLAY-ONLY variables. On submit, fee is RE-FETCHED
    // from Firestore directly. DevTools se change karoge toh bhi kuch nahi hoga.
    let BASE_AMOUNT_PAISE = 2900; // ₹29 default fallback (updated from Firestore)
    let BASE_AMOUNT_RS = 29;      // ₹29 display (updated from Firestore)
    // =========================================================

    const form = document.getElementById('chessForm');
    const closedMessage = document.getElementById('closedMessage');
    const alreadyRegisteredMessage = document.getElementById('alreadyRegisteredMessage');

    // Dynamically set the redirect URL to the current page + ?success=true
    const nextRedirect = document.getElementById('nextRedirect');
    if (nextRedirect) {
        // This ensures it works on both localhost and the live site
        nextRedirect.value = window.location.href.split('?')[0] + '?success=true';
    }

    // ── Hide form initially while we check registration status ──
    if (form) form.style.display = 'none';

    // Flag to ensure we process ?success=true only once
    let successParamProcessed = false;

    // 1. Check registration status and eventId from Firestore (Admin Panel controls this)
    let countdownInterval = null;

    function startCountdown(deadlineMs) {
        const block = document.getElementById('countdownBlock');
        if (!block) return;

        if (countdownInterval) clearInterval(countdownInterval);

        function tick() {
            const now = Date.now();
            const diff = deadlineMs - now;

            if (diff <= 0) {
                // Deadline passed — auto-close
                clearInterval(countdownInterval);
                block.style.display = 'none';
                return;
            }

            block.style.display = 'block';

            const days  = Math.floor(diff / 86400000);
            const hours = Math.floor((diff % 86400000) / 3600000);
            const mins  = Math.floor((diff % 3600000) / 60000);
            const secs  = Math.floor((diff % 60000) / 1000);

            const isUrgent = diff < 3600000; // < 1 hour: red pulse

            ['cd-days', 'cd-hours', 'cd-mins', 'cd-secs'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.classList.toggle('urgent', isUrgent);
            });

            const dEl = document.getElementById('cd-days');
            const hEl = document.getElementById('cd-hours');
            const mEl = document.getElementById('cd-mins');
            const sEl = document.getElementById('cd-secs');

            if (dEl) dEl.querySelector('.cd-num').textContent = String(days).padStart(2, '0');
            if (hEl) hEl.querySelector('.cd-num').textContent = String(hours).padStart(2, '0');
            if (mEl) mEl.querySelector('.cd-num').textContent = String(mins).padStart(2, '0');
            if (sEl) sEl.querySelector('.cd-num').textContent = String(secs).padStart(2, '0');
        }

        tick();
        countdownInterval = setInterval(tick, 1000);
    }

    // ── Helper: update the status message UI based on Firestore doc ──
    function applyStatusUI(docSnap) {
        if (!alreadyRegisteredMessage) return;
        const iconWrap = alreadyRegisteredMessage.querySelector('.status-icon');
        const h3 = alreadyRegisteredMessage.querySelector('h3');
        const p = alreadyRegisteredMessage.querySelector('p');
        if (!docSnap.exists) {
            // REJECTED — doc deleted by admin
            if (iconWrap) {
                iconWrap.style.color = '#ef4444';
                iconWrap.style.background = 'rgba(239, 68, 68, 0.1)';
                iconWrap.innerHTML = '<i class="fas fa-times-circle"></i>';
            }
            if (h3) { h3.style.color = '#ef4444'; h3.innerText = 'Application Rejected'; }
            if (p) { p.innerText = 'We are sorry, but your registration was not approved. Please contact support if you think this is a mistake.'; }
        } else {
            const userData = docSnap.data();
            if (userData.cardId && userData.cardId !== 'Pending') {
                // APPROVED — admin has assigned a cardId
                if (iconWrap) {
                    iconWrap.style.color = '#22c55e';
                    iconWrap.style.background = 'rgba(34, 197, 94, 0.1)';
                    iconWrap.innerHTML = '<i class="fas fa-check-circle"></i>';
                }
                if (h3) { h3.style.color = '#22c55e'; h3.innerText = 'Registration Approved! 🎉'; }
                if (p) { p.innerText = 'Your registration has been approved! You can now view and download your pass.'; }
            } else {
                // PENDING — still waiting
                if (iconWrap) {
                    iconWrap.style.color = '#f59e0b';
                    iconWrap.style.background = 'rgba(245, 158, 11, 0.1)';
                    iconWrap.innerHTML = '<i class="fas fa-clock"></i>';
                }
                if (h3) { h3.style.color = '#f59e0b'; h3.innerText = 'Waiting for Approval'; }
                if (p) { p.innerText = 'Your registration is under review. Approval usually takes up to 24 hours.'; }
            }
        }
    }

    // ── Helper: start real-time listener on user's registration doc ──
    let statusUnsubscribe = null;
    function listenToStatus() {
        const userPhone = localStorage.getItem('userPhone');
        if (!userPhone || typeof db === 'undefined') return;
        if (statusUnsubscribe) statusUnsubscribe(); // clear old listener
        statusUnsubscribe = db.collection('registrations').doc(userPhone)
            .onSnapshot(docSnap => {
                applyStatusUI(docSnap);
            }, e => console.warn('Status listen failed', e));
    }

    if (typeof db !== 'undefined') {
        db.collection('settings').doc('global').onSnapshot((doc) => {
            const isRegistrationOpen = doc.exists ? (doc.data().isRegistrationOpen || false) : false;
            currentEventId = doc.exists ? (doc.data().eventId || 'event_default') : 'event_default';
            const isPromoEnabled = doc.exists ? (doc.data().isPromoEnabled !== false) : true; // Default ON
            window.dynamicAdminEmails = doc.exists ? (doc.data().notificationEmails || []) : [];
            window.activeUpiId = doc.exists ? (doc.data().upiId || 'chessbird@ybl') : 'chessbird@ybl';
            window.activeVercelUrl = doc.exists ? (doc.data().vercelUrl || '') : '';
            const upiDisplay = document.getElementById('upiIdDisplay');
            if (upiDisplay) {
                upiDisplay.textContent = window.activeUpiId;
            }
            window.emailMaskingSettings = doc.exists ? {
                sendFullPhone: doc.data().sendFullPhone !== false,
                sendFullEmail: doc.data().sendFullEmail !== false,
                sendFullUsername: doc.data().sendFullUsername !== false
            } : { sendFullPhone: true, sendFullEmail: true, sendFullUsername: true };

            // ── Update Urgency Banner ────────────────────────────
            const urgencyBanner = document.getElementById('urgencyBanner');
            const urgencyText = document.getElementById('urgencyText');
            const urgencyPulse = document.getElementById('urgencyPulse');
            if (urgencyBanner && urgencyText) {
                urgencyBanner.style.display = '';
                if (isRegistrationOpen) {
                    if (urgencyPulse) urgencyPulse.style.display = 'block';
                    urgencyText.innerHTML = '<strong style="color: var(--primary);">Registrations Open</strong> — Join India\'s Most Exclusive Chess Community';
                } else {
                    if (urgencyPulse) urgencyPulse.style.display = 'none';
                    urgencyText.innerHTML = '<strong style="color: #ef4444;">Registration Closed</strong> — Stay tuned for the next tournament';
                }
            }
            // ─────────────────────────────────────────────────────────


            // ── Load Registration Fee from Firestore ─────────────────
            // Update display variables (these are ONLY for UI display)
            // Actual payment amount is ALWAYS re-fetched at submit time
            if (doc.exists && doc.data().registrationFee) {
                const serverFee = parseInt(doc.data().registrationFee, 10);
                if (!isNaN(serverFee) && serverFee >= 1 && serverFee <= 10000) {
                    BASE_AMOUNT_RS    = serverFee;
                    BASE_AMOUNT_PAISE = serverFee * 100;
                    updateSubmitBtn(); // Refresh displayed price
                }
            }
            // ─────────────────────────────────────────────────────────

            // Show/hide promo code field
            const promoGroup = document.getElementById('promoCodeGroup');
            if (promoGroup) {
                promoGroup.style.display = isPromoEnabled ? 'block' : 'none';
            }

            // ── Countdown Timer ──────────────────────────────────
            const deadlineMs = doc.exists ? (doc.data().registrationDeadline || null) : null;
            const block = document.getElementById('countdownBlock');
            if (deadlineMs && deadlineMs > Date.now()) {
                startCountdown(deadlineMs);
            } else {
                if (block) block.style.display = 'none';
                if (countdownInterval) clearInterval(countdownInterval);
            }
            // ────────────────────────────────────────────────────


            if (!isRegistrationOpen) {
                // Registration is CLOSED
                const skel = document.getElementById('formSkeleton');
                if (skel) skel.style.display = 'none';

                if (form) form.style.display = 'none';
                if (alreadyRegisteredMessage) alreadyRegisteredMessage.style.display = 'none';
                if (closedMessage) {
                    closedMessage.style.display = 'block';
                    closedMessage.style.animation = 'slideUpFade 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) forwards';
                }
            } else {
                // Registration is OPEN — check if already registered
                const skel = document.getElementById('formSkeleton');
                if (skel) skel.style.display = 'none';

                if (closedMessage) closedMessage.style.display = 'none';

                // Handle ?success=true with the correct eventId
                const urlParams = new URLSearchParams(window.location.search);
                if (urlParams.get('success') === 'true' && !successParamProcessed) {
                    localStorage.setItem(currentEventId, 'true');
                    successParamProcessed = true;
                    
                    if (form) form.style.display = 'none';
                    if (alreadyRegisteredMessage) {
                        alreadyRegisteredMessage.style.display = 'block';
                        alreadyRegisteredMessage.style.animation = 'slideUpFade 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) forwards';
                        // Start real-time status listener so approval shows immediately
                        listenToStatus();
                    }
                    const successOverlay = document.querySelector('.success-overlay');
                    if (successOverlay) {
                        successOverlay.classList.add('active');
                        window.history.replaceState({}, document.title, window.location.pathname);
                    }
                    return; // Done processing
                }

                // Only check the CURRENT event's localStorage key.
                // When admin changes Event ID, users see a fresh form for the new event.
                if (localStorage.getItem(currentEventId) === 'true') {
                    if (form) form.style.display = 'none';
                    if (alreadyRegisteredMessage) {
                        alreadyRegisteredMessage.style.display = 'block';
                        alreadyRegisteredMessage.style.animation = 'slideUpFade 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) forwards';
                        // Real-time listener: UI updates the moment admin approves
                        listenToStatus();
                    }
                } else {
                    if (alreadyRegisteredMessage) alreadyRegisteredMessage.style.display = 'none';
                    if (form) form.style.display = 'block';
                }
            }
        });
    } else {
        // Firestore not available — fallback: show form (open by default)
        const skel = document.getElementById('formSkeleton');
        if (skel) skel.style.display = 'none';
        if (form) form.style.display = 'block';
    }

    // Add staggered animation delay to form groups
    const formGroups = document.querySelectorAll('.form-group');
    formGroups.forEach((group, index) => {
        group.style.opacity = '0';
        group.style.animation = `slideUpFade 0.5s ease forwards ${0.3 + (index * 0.1)}s`;
    });

    const btn = document.querySelector('.submit-btn');
    if (btn) {
        btn.style.opacity = '0';
        btn.style.animation = `slideUpFade 0.5s ease forwards ${0.3 + (formGroups.length * 0.1)}s`;
    }

    // ═══════════════════════════════════════════════════════════
    // PROMO CODE SYSTEM
    // ═══════════════════════════════════════════════════════════
    const promoInput   = document.getElementById('promoCodeInput');
    const applyBtn     = document.getElementById('applyPromoBtn');
    const promoStatus  = document.getElementById('promoStatus');
    const promoPopup   = document.getElementById('promoPopup');
    const promoClosBtn = document.getElementById('promoPopupCloseBtn');
    const submitBtn    = document.getElementById('submitBtn');

    // ── Close popup on button click or overlay click ──
    if (promoClosBtn) {
        promoClosBtn.addEventListener('click', () => {
            if (promoPopup) promoPopup.classList.remove('active');
        });
    }
    if (promoPopup) {
        promoPopup.addEventListener('click', (e) => {
            if (e.target === promoPopup) promoPopup.classList.remove('active');
        });
    }

    // ── Update submit button text based on applied promo and toggle UPI Payment Card ──
    function updateSubmitBtn() {
        if (!submitBtn) return;
        const btnText = submitBtn.querySelector('.btn-text');
        const mainPrice = document.getElementById('mainPriceDisplay');
        const origPrice = document.getElementById('originalPriceDisplay');
        const discBadge = document.getElementById('discountBadge');
        const upiPaymentCard = document.getElementById('upiPaymentCard');
        const upiQrCodeImg = document.getElementById('upiQrCodeImg');
        const upiAmountDisplay = document.getElementById('upiAmountDisplay');
        const upiUtrInput = document.getElementById('upiUtrInput');
        const upiUtrError = document.getElementById('upiUtrError');

        if (!btnText || !mainPrice) return;

        let finalRs = BASE_AMOUNT_RS;
        let isFree = false;

        if (appliedPromo && appliedPromo.discount > 0 && appliedPromo.discount < 100) {
            finalRs = Math.max(0, (BASE_AMOUNT_RS * (1 - appliedPromo.discount / 100)));
            const finalDisplay = Number.isInteger(finalRs) ? finalRs : finalRs.toFixed(2);
            
            mainPrice.innerHTML = `&#x20B9;${finalDisplay}`;
            origPrice.innerHTML = `&#x20B9;${BASE_AMOUNT_RS}`;
            origPrice.style.display = 'inline';
            discBadge.innerHTML = `<i class="fas fa-tag"></i> <span>${appliedPromo.discount}% OFF</span>`;
            discBadge.style.display = 'inline-flex';
        } else if (appliedPromo && appliedPromo.discount === 100) {
            isFree = true;
            mainPrice.innerHTML = `<span style="color:#4ade80;">FREE</span>`;
            origPrice.innerHTML = `&#x20B9;${BASE_AMOUNT_RS}`;
            origPrice.style.display = 'inline';
            discBadge.innerHTML = `<i class="fas fa-tag"></i> <span>100% OFF</span>`;
            discBadge.style.display = 'inline-flex';
        } else {
            mainPrice.innerHTML = `&#x20B9;${BASE_AMOUNT_RS}`;
            origPrice.style.display = 'none';
            discBadge.style.display = 'none';
        }

        if (isFree || finalRs <= 0) {
            if (upiPaymentCard) upiPaymentCard.style.display = 'none';
            if (upiUtrInput) {
                upiUtrInput.required = false;
                upiUtrInput.removeAttribute('required');
            }
            if (upiUtrError) upiUtrError.style.display = 'none';
            btnText.innerHTML = `Submit Free Registration <i class="fas fa-arrow-right arrow-icon"></i>`;
        } else {
            const finalDisplay = Number.isInteger(finalRs) ? finalRs : finalRs.toFixed(2);
            if (upiPaymentCard) upiPaymentCard.style.display = 'block';
            if (upiUtrInput) upiUtrInput.required = true;
            if (upiAmountDisplay) upiAmountDisplay.textContent = `₹${finalDisplay}`;
            
            const upiId = window.activeUpiId || 'chessbird@ybl';
            const qrData = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=ChessBird&am=${finalDisplay}&cu=INR`;
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qrData)}`;
            if (upiQrCodeImg) upiQrCodeImg.src = qrUrl;

            const upiPayBtn = document.getElementById('upiPayBtn');
            if (upiPayBtn) {
                // Ensure it works nicely on mobile devices
                upiPayBtn.href = qrData;
            }

            btnText.innerHTML = `Register & Submit Payment <i class="fas fa-arrow-right arrow-icon"></i>`;
        }
    }

    // ── Apply Promo Code (reads from Firestore) ──
    async function applyPromoCode() {
        if (!promoInput || !promoStatus) return;
        const code = promoInput.value.trim().toUpperCase();

        if (!code) {
            setPromoStatus('error', '<i class="fas fa-exclamation-circle"></i> Please enter a promo code.');
            return;
        }

        // Loading state
        setPromoStatus('loading', '<i class="fas fa-spinner fa-spin"></i> Verifying code...');
        if (applyBtn) { applyBtn.disabled = true; applyBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }

        try {
            if (typeof db === 'undefined') throw new Error('Database not available.');

            const docSnap = await db.collection('promo_codes').doc(code).get();

            if (!docSnap.exists) {
                appliedPromo = null;
                PremiumSoundManager.playError();
                setPromoStatus('error', '<i class="fas fa-times-circle"></i> Invalid promo code. Please check and try again.');
                resetApplyBtn();
                updateSubmitBtn();
                return;
            }

            const data = docSnap.data();

            if (data.active !== true) {
                appliedPromo = null;
                PremiumSoundManager.playError();
                setPromoStatus('error', '<i class="fas fa-times-circle"></i> This code has expired or is no longer active.');
                resetApplyBtn();
                updateSubmitBtn();
                return;
            }

            const discount = Number(data.discount) || 0;
            if (discount <= 0 || discount > 100) {
                appliedPromo = null;
                PremiumSoundManager.playError();
                setPromoStatus('error', '<i class="fas fa-times-circle"></i> Invalid code configuration. Please contact support.');
                resetApplyBtn();
                updateSubmitBtn();
                return;
            }

            // ✅ Code is valid — store and show popup
            appliedPromo = { code, discount };
            
            PremiumSoundManager.playSuccess();

            setPromoStatus('success', `<i class="fas fa-check-circle"></i> <strong>${code}</strong> applied — ${discount}% discount!`);
            if (applyBtn) {
                applyBtn.disabled = false;
                applyBtn.className = 'apply-btn applied';
                applyBtn.innerHTML = '<i class="fas fa-check"></i> Applied';
            }

            // Show popup
            showPromoPopup(code, discount);
            updateSubmitBtn();

        } catch (err) {
            console.error('Promo code verification error:', err);
            appliedPromo = null;
            PremiumSoundManager.playError();
            setPromoStatus('error', '<i class="fas fa-exclamation-triangle"></i> Verification failed. Please try again.');
            resetApplyBtn();
            updateSubmitBtn();
        }
    }

    function setPromoStatus(type, html) {
        if (!promoStatus) return;
        promoStatus.className = '';
        promoStatus.classList.add(`status-${type}`);
        promoStatus.innerHTML = html;
    }

    function resetApplyBtn() {
        if (!applyBtn) return;
        applyBtn.disabled = false;
        applyBtn.className = 'apply-btn';
        applyBtn.innerHTML = '<i class="fas fa-bolt"></i> Apply';
    }

    function showPromoPopup(code, discount) {
        const finalRs   = Math.max(0, (BASE_AMOUNT_RS * (1 - discount / 100)));
        const finalDisplay = Number.isInteger(finalRs) ? finalRs : finalRs.toFixed(2);

        const titleEl  = document.getElementById('promoPopupTitle');
        const descEl   = document.getElementById('promoPopupDesc');
        const discEl   = document.getElementById('promoDiscountText');
        const origEl   = document.getElementById('promoOriginalPrice');
        const finalEl  = document.getElementById('promoFinalPrice');
        const priceRow = document.getElementById('promoPriceRow');

        if (titleEl) titleEl.textContent = discount === 100 ? 'Free Registration! 🚀' : 'Code Applied!';
        if (descEl) {
            descEl.textContent = discount === 100
                ? `Code "${code}" gives you 100% off — register completely FREE!`
                : `Code "${code}" gives you ${discount}% off your registration fee.`;
        }
        if (discEl) discEl.textContent = `${discount}% OFF`;
        if (origEl) origEl.textContent = `\u20B9${BASE_AMOUNT_RS}`;
        if (finalEl) {
            finalEl.textContent = discount === 100 ? 'FREE' : `\u20B9${finalDisplay}`;
            finalEl.style.color = discount === 100 ? '#f59e0b' : '#10b981';
        }
        if (priceRow) priceRow.style.display = discount === 100 ? 'flex' : 'flex';

        if (promoPopup) promoPopup.classList.add('active');
    }

    // ── Wire up Apply button ──
    if (applyBtn) {
        applyBtn.addEventListener('click', applyPromoCode);
    }
    // Also apply on Enter key in promo input
    if (promoInput) {
        promoInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); applyPromoCode(); }
        });
        // Reset if user changes the code after applying
        promoInput.addEventListener('input', () => {
            if (appliedPromo) {
                appliedPromo = null;
                setPromoStatus('', '');
                resetApplyBtn();
                updateSubmitBtn();
            }
        });
    }
    // ═══════════════════════════════════════════════════════════
    
    // ── UPI Payment Clipboard Copy & UTR Validation ───────────
    const upiCopyBtn = document.getElementById('upiCopyBtn');
    if (upiCopyBtn) {
        upiCopyBtn.addEventListener('click', () => {
            const upiId = window.activeUpiId || 'chessbird@ybl';
            navigator.clipboard.writeText(upiId).then(() => {
                if (typeof PremiumSoundManager !== 'undefined') {
                    PremiumSoundManager.playSuccess();
                }
                const icon = upiCopyBtn.querySelector('i');
                if (icon) {
                    icon.className = 'fas fa-check';
                    setTimeout(() => {
                        icon.className = 'far fa-copy';
                    }, 2000);
                }
            }).catch(err => {
                console.error('Could not copy text: ', err);
            });
        });
    }

    const utrInput = document.getElementById('upiUtrInput');
    const utrError = document.getElementById('upiUtrError');
    if (utrInput) {
        utrInput.addEventListener('input', () => {
            let val = utrInput.value.replace(/\D/g, '');
            if (val.length > 12) {
                val = val.substring(0, 12);
            }
            utrInput.value = val;

            if (val.length === 12) {
                if (utrError) utrError.style.display = 'none';
                const wrapper = utrInput.closest('.input-wrapper');
                if (wrapper) {
                    wrapper.classList.remove('is-invalid');
                    wrapper.classList.add('is-valid');
                }
            } else if (val.length === 0) {
                if (utrError) utrError.style.display = 'none';
                const wrapper = utrInput.closest('.input-wrapper');
                if (wrapper) wrapper.classList.remove('is-invalid', 'is-valid');
            }
        });
    }
    // ───────────────────────────────────────────────────────────

    // ── Add checkmark icons to all input wrappers ──
    document.querySelectorAll('.input-wrapper').forEach(wrapper => {
        const check = document.createElement('i');
        check.className = 'fas fa-check-circle field-check';
        wrapper.appendChild(check);
    });

    const inputs = document.querySelectorAll('.form-control');
    const totalFields = inputs.length;

    // ── Real-Time Field Validation ──
    inputs.forEach(input => {
        input.addEventListener('focus', () => {
            input.parentElement.parentElement.classList.add('focused');
        });
        input.addEventListener('blur', () => {
            input.parentElement.parentElement.classList.remove('focused');
            
            // Skip basic validation for username, as it uses advanced API validation
            if (input.id === 'username') return;

            const wrapper = input.closest('.input-wrapper');
            if (input.value.trim() !== '') {
                if (input.checkValidity()) {
                    wrapper.classList.add('is-valid');
                    wrapper.classList.remove('is-invalid');
                } else {
                    wrapper.classList.add('is-invalid');
                    wrapper.classList.remove('is-valid');
                }
            } else {
                wrapper.classList.remove('is-valid', 'is-invalid');
            }
        });
    });

    // ── Auto-Fetch Chess.com Data on Username Input (Live Typing with Debounce) ──
    const usernameInput = document.getElementById('username');
    const ratingInput = document.getElementById('rating');
    const platformRadios = document.querySelectorAll('input[name="platformSelect"]');
    const usernameLabel = document.getElementById('usernameLabel');
    let typingTimer;
    const typingInterval = 800; // Wait 800ms after user stops typing to trigger API

    if (platformRadios.length > 0 && usernameInput) {
        platformRadios.forEach(radio => {
            radio.addEventListener('change', () => {
                if (usernameLabel) {
                    usernameLabel.textContent = radio.value === 'lichess' ? 'Lichess Username' : 'Chess.com Username';
                }
                
                if (usernameInput.value.trim() !== '') {
                    usernameInput.dispatchEvent(new Event('input'));
                }
            });
        });
    }
    // Removed 'noChessAccount' logic to make Chess.com username mandatory

    if (usernameInput && ratingInput) {
        usernameInput.addEventListener('input', () => {
            clearTimeout(typingTimer);
            const username = usernameInput.value.trim();
            const userWrapper = usernameInput.closest('.input-wrapper');
            const userIcon = userWrapper.querySelector('.icon-left');
            const rightCheckIcon = userWrapper.querySelector('.field-check');
            const ratingWrapper = ratingInput.closest('.input-wrapper');

            // 1. Immediately wipe previous rating data since username changed
            ratingInput.value = '';
            ratingWrapper.classList.remove('is-valid', 'is-invalid');

            if (!username) {
                userWrapper.classList.remove('is-invalid', 'is-valid', 'is-loading');
                const errText = document.getElementById('usernameError');
                if (errText) errText.style.display = 'none';
                // Don't touch userIcon, let it stay @
                if (rightCheckIcon) rightCheckIcon.className = 'fa-solid fa-circle-check field-check';
                return;
            }

            // Immediately show spinner class on the RIGHT side while user is typing/waiting
            userWrapper.classList.remove('is-invalid', 'is-valid');
            userWrapper.classList.add('is-loading');
            const errText = document.getElementById('usernameError');
            if (errText) errText.style.display = 'none';
            if (rightCheckIcon) rightCheckIcon.className = 'fa-solid fa-spinner fa-spin field-check';

            typingTimer = setTimeout(async () => {
                try {
                    // 2. Check if user exists based on platform
                    const checkedRadio = document.querySelector('input[name="platformSelect"]:checked');
                    const platform = checkedRadio ? checkedRadio.value : 'chesscom';
                    
                    if (platform === 'chesscom') {
                        const userRes = await fetch(`https://api.chess.com/pub/player/${username}`);
                        userWrapper.classList.remove('is-loading');

                        if (!userRes.ok) {
                            userWrapper.classList.add('is-invalid');
                            if (rightCheckIcon) rightCheckIcon.className = 'fa-solid fa-circle-xmark field-check';
                            const errText = document.getElementById('usernameError');
                            if (errText) errText.style.display = 'block';
                            return;
                        }

                        userWrapper.classList.add('is-valid');
                        const errText = document.getElementById('usernameError');
                        if (errText) errText.style.display = 'none';
                        if (rightCheckIcon) rightCheckIcon.className = 'fa-solid fa-circle-check field-check';

                        const statsRes = await fetch(`https://api.chess.com/pub/player/${username}/stats`);
                        if (statsRes.ok) {
                            const stats = await statsRes.json();
                            let bestRating = null;

                            if (stats.chess_rapid && stats.chess_rapid.last) {
                                bestRating = stats.chess_rapid.last.rating;
                            } else if (stats.chess_blitz && stats.chess_blitz.last) {
                                bestRating = stats.chess_blitz.last.rating;
                            } else if (stats.chess_bullet && stats.chess_bullet.last) {
                                bestRating = stats.chess_bullet.last.rating;
                            }

                            ratingInput.value = bestRating !== null ? bestRating : 'N/A';
                            ratingWrapper.classList.add('is-valid');
                            ratingWrapper.classList.remove('is-invalid');
                            
                            ratingInput.style.transition = 'box-shadow 0.3s, background 0.3s';
                            ratingInput.style.background = '#ecfdf5';
                            setTimeout(() => { ratingInput.style.background = ''; }, 600);
                        }
                    } else if (platform === 'lichess') {
                        const userRes = await fetch(`https://lichess.org/api/user/${username}`);
                        userWrapper.classList.remove('is-loading');

                        if (!userRes.ok) {
                            userWrapper.classList.add('is-invalid');
                            if (rightCheckIcon) rightCheckIcon.className = 'fa-solid fa-circle-xmark field-check';
                            const errText = document.getElementById('usernameError');
                            if (errText) errText.style.display = 'block';
                            return;
                        }

                        userWrapper.classList.add('is-valid');
                        const errText = document.getElementById('usernameError');
                        if (errText) errText.style.display = 'none';
                        if (rightCheckIcon) rightCheckIcon.className = 'fa-solid fa-circle-check field-check';

                        const data = await userRes.json();
                        let bestRating = null;

                        if (data.perfs) {
                            if (data.perfs.rapid && data.perfs.rapid.rating) {
                                bestRating = data.perfs.rapid.rating;
                            } else if (data.perfs.blitz && data.perfs.blitz.rating) {
                                bestRating = data.perfs.blitz.rating;
                            } else if (data.perfs.bullet && data.perfs.bullet.rating) {
                                bestRating = data.perfs.bullet.rating;
                            }
                        }

                        ratingInput.value = bestRating !== null ? bestRating : 'N/A';
                        ratingWrapper.classList.add('is-valid');
                        ratingWrapper.classList.remove('is-invalid');
                        
                        ratingInput.style.transition = 'box-shadow 0.3s, background 0.3s';
                        ratingInput.style.background = '#ecfdf5';
                        setTimeout(() => { ratingInput.style.background = ''; }, 600);
                    }
                } catch (err) {
                    // In case of complete network failure (not 404)
                    console.warn("Chess.com API fetch failed", err);
                    userIcon.className = 'fas fa-at icon-left'; 
                }
            }, typingInterval);
        });
    }





    // Prevent double submission and ensure EmailJS sends before redirecting
    if (form) {
        form.addEventListener('submit', async function (e) {
            // Prevent default to stop browser from redirecting before EmailJS finishes
            e.preventDefault();

            const checkedRadio = document.querySelector('input[name="platformSelect"]:checked');
            const platformName = checkedRadio && checkedRadio.value === 'lichess' ? 'Lichess' : 'Chess.com';
            
            // Prevent submission if username is invalid or still loading API
            const usernameInput = document.getElementById('username');
            const userWrapper = usernameInput ? usernameInput.closest('.input-wrapper') : null;
            if (userWrapper && (userWrapper.classList.contains('is-invalid') || userWrapper.classList.contains('is-loading'))) {
                alert("Please enter a valid Chess Username.");
                return;
            }

            const btn = this.querySelector('.submit-btn');
            const originalBtnHtml = btn ? btn.innerHTML : '';
            
            if (btn) {
                // Keep the button text formatting intact
                btn.innerHTML = '<span class="btn-text">Submitting... <i class="fas fa-spinner fa-spin"></i></span><div class="btn-glow"></div>';
                btn.style.opacity = '0.8';
                btn.style.pointerEvents = 'none';
            }

            // Send EmailJS
            const serviceID = 'service_nfjpyi6';
            const templateID = 'template_udal0hk';

            const rawUsername = document.getElementById('username').value;
            const fullUsername = `${rawUsername} (${platformName})`;

            const templateParams = {
                name: document.getElementById('name').value,
                username: fullUsername,
                email: document.getElementById('email').value,
                user_email: document.getElementById('email').value,
                phone: document.getElementById('phone').value,
                rating: document.getElementById('rating').value
            };

            const maskString = (str, visibleStart = 2, visibleEnd = 2) => {
                if (!str || str.length <= visibleStart + visibleEnd) return str;
                return str.substring(0, visibleStart) + '*'.repeat(str.length - visibleStart - visibleEnd) + str.substring(str.length - visibleEnd);
            };

            const maskEmailStr = (email) => {
                if (!email || !email.includes('@')) return email;
                const [local, domain] = email.split('@');
                if (local.length <= 2) return `${local[0]}*@${domain}`;
                return `${local.substring(0, 2)}${'*'.repeat(local.length - 2)}@${domain}`;
            };

            const maskingSettings = window.emailMaskingSettings || { sendFullPhone: true, sendFullEmail: true, sendFullUsername: true };
            
            let finalPhone = maskingSettings.sendFullPhone ? templateParams.phone : maskString(templateParams.phone, 4, 2);
            let finalEmail = maskingSettings.sendFullEmail ? templateParams.email : maskEmailStr(templateParams.email);
            let finalUsername = maskingSettings.sendFullUsername ? templateParams.username : maskString(templateParams.username, 2, 0);

            const maskedTemplateParams = {
                name: templateParams.name,
                username: finalUsername,
                email: finalEmail,
                user_email: finalEmail,
                phone: finalPhone,
                rating: templateParams.rating
            };

            // Function to handle UI transition after saving
            const showSuccessUI = () => {
                // Email is NO LONGER sent here! It is sent from Admin Panel on Approval.
                
                // Use the SAME currentEventId from Firestore (not a hardcoded key!)
                localStorage.setItem(currentEventId, 'true');
                if (templateParams && templateParams.phone) {
                    localStorage.setItem('userPhone', templateParams.phone);
                }
                form.style.display = 'none';
                const alreadyRegisteredMessage = document.getElementById('alreadyRegisteredMessage');
                if (alreadyRegisteredMessage) {
                    alreadyRegisteredMessage.style.display = 'block';
                    alreadyRegisteredMessage.style.animation = 'slideUpFade 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) forwards';
                    // Start real-time listener so approval shows without page refresh
                    listenToStatus();
                }
                const successOverlay = document.querySelector('.success-overlay');
                if (successOverlay) {
                    successOverlay.classList.add('active');
                }
            };
            // Database Handling — SECURITY HARDENED via BACKEND
            const handleFinalSave = async (paymentId, usedPromoCode, discountApplied, finalAmountPaise) => {
                // Free registrations (100% off) use 'FREE_<timestamp>' format
                const isFreeReg = paymentId && /^FREE_\d+$/.test(paymentId);
                const isUpiReg = paymentId && /^UPI_\d{12}$/.test(paymentId);

                if (!isFreeReg && !isUpiReg) {
                    console.error("Invalid paymentId format. Aborting save.", paymentId);
                    alert("Invalid payment reference. Aborting.");
                    return;
                }

                const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
                
                // Determine API Endpoint
                let apiEndpoint = '/api/verifyPayment';
                if (isLocalhost) {
                    const fallbackUrl = window.activeVercelUrl || 'https://chessbirdform.vercel.app';
                    apiEndpoint = `${fallbackUrl.replace(/\/$/, '')}/api/verifyPayment`;
                    console.log(`Running on localhost. Routing API request to: ${apiEndpoint}`);
                }

                try {
                    const response = await fetch(apiEndpoint, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            paymentId: paymentId,
                            name: templateParams.name,
                            username: templateParams.username,
                            email: templateParams.email,
                            phone: templateParams.phone,
                            rating: templateParams.rating,
                            promoCode: usedPromoCode,
                            discountApplied: discountApplied,
                            amountPaid: finalAmountPaise
                        })
                    });

                    const data = await response.json();
                    
                    if (data.success) {
                        console.log("Registration securely saved via backend!");
                        showSuccessUI();
                        return;
                    } else {
                        throw new Error(data.error || "Unknown backend validation error");
                    }
                } catch (fetchError) {
                    console.warn("Backend API call failed:", fetchError);
                    
                    // Fallback for Localhost: If backend API failed and it's a FREE registration,
                    // we can fall back to direct client-side save because Firestore rules allow client-side free writes.
                    if (isLocalhost && isFreeReg) {
                        console.log("Attempting direct client-side Firestore write fallback for free registration on localhost...");
                        try {
                            const publicData = {
                                name: String(templateParams.name || '').trim().substring(0, 100),
                                username: String(templateParams.username || '').trim().substring(0, 50),
                                phone: String(templateParams.phone || '').trim(),
                                rating: templateParams.rating === 'N/A' ? 'N/A' : (parseInt(templateParams.rating, 10) || 'N/A'),
                                cardId: 'Pending'
                            };

                            const privateData = {
                                email: String(templateParams.email || '').trim().substring(0, 200),
                                paymentId: paymentId,
                                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                                promoCode: usedPromoCode || null,
                                discountApplied: discountApplied || 0,
                                amountPaid: finalAmountPaise
                            };

                            const batch = db.batch();
                            batch.set(db.collection('registrations').doc(templateParams.phone), publicData);
                            batch.set(db.collection('registrations_private').doc(templateParams.phone), privateData);
                            await batch.commit();

                            console.log('Registration securely saved directly to Firestore (localhost free fallback)!');
                            showSuccessUI();
                            return;
                        } catch (error) {
                            console.error('Direct client-side fallback failed:', error);
                            alert('Registration failed (Direct Fallback): ' + error.message);
                        }
                    } else {
                        // For paid registrations or when not running on localhost, show the API error
                        alert("Payment verification failed: " + fetchError.message);
                    }

                    const btn = form.querySelector('.submit-btn');
                    if (btn) {
                        btn.innerHTML = originalBtnHtml;
                        btn.style.opacity = '1';
                        btn.style.pointerEvents = 'all';
                    }
                }
            };

            // ═══════════════════════════════════════════════════════
            // We re-fetch the promo code from Firestore at submit time.
            // ═══════════════════════════════════════════════════════
            let verifiedDiscount = 0;
            let verifiedCode = null;

            const cachedCode = appliedPromo ? appliedPromo.code : null;

            const proceedToPayment = async () => {
                // ── PRE-CHECK: Duplicate Phone Number ─────────────
                if (typeof db !== 'undefined') {
                    try {
                        const docSnap = await db.collection("registrations").doc(templateParams.phone).get();
                        if (docSnap.exists) {
                            alert("This phone number is already used for registration! Please use a different phone number.");
                            updateSubmitBtn();
                            if (btn) { btn.style.opacity = '1'; btn.style.pointerEvents = 'all'; }
                            return; // Stop execution
                        }
                    } catch (e) {
                        console.error("Checking registration failed", e);
                    }
                }

                // ── Step 1: Re-fetch registration fee LIVE from Firestore ─
                let secureAmountPaise = BASE_AMOUNT_PAISE; // fallback: display value
                try {
                    if (typeof db !== 'undefined') {
                        const settingsSnap = await db.collection('settings').doc('global').get();
                        if (settingsSnap.exists) {
                            const rawFee = parseInt(settingsSnap.data().registrationFee, 10);
                            if (!isNaN(rawFee) && rawFee >= 1 && rawFee <= 10000) {
                                secureAmountPaise = rawFee * 100;
                            }
                        }
                    }
                } catch (feeErr) {
                    console.warn('Settings re-fetch failed, using cached display value:', feeErr);
                }

                // ── Step 2: Re-verify promo code LIVE from Firestore ──────
                if (cachedCode && typeof db !== 'undefined') {
                    try {
                        const freshSnap = await db.collection('promo_codes').doc(cachedCode).get();
                        if (freshSnap.exists && freshSnap.data().active === true) {
                            verifiedDiscount = Number(freshSnap.data().discount) || 0;
                            if (verifiedDiscount < 0 || verifiedDiscount > 100) verifiedDiscount = 0;
                            verifiedCode = cachedCode;
                        }
                    } catch (err) {
                        console.warn('Promo re-verification failed, proceeding with no discount:', err);
                        verifiedDiscount = 0;
                        verifiedCode = null;
                    }
                }

                // Calculate final amount (fee + discount — BOTH from Firestore, not JS variables)
                const finalAmountPaise = Math.round(secureAmountPaise * (1 - verifiedDiscount / 100));

                // ── 100% OFF or Free registration: Skip UPI entirely ──
                if (verifiedDiscount === 100 || finalAmountPaise === 0) {
                    if (btn) btn.innerHTML = '<span class="btn-text">Processing... <i class="fas fa-spinner fa-spin"></i></span><div class="btn-glow"></div>';
                    const freePayId = 'FREE_' + Date.now();
                    handleFinalSave(freePayId, verifiedCode, verifiedDiscount, finalAmountPaise);
                    return;
                }

                // ── Paid registration: Verify UTR and submit ──
                const utrVal = utrInput ? utrInput.value.trim() : '';
                if (utrVal.length !== 12 || !/^\d{12}$/.test(utrVal)) {
                    PremiumSoundManager.playError();
                    if (utrError) utrError.style.display = 'block';
                    alert("Please enter a valid 12-digit transaction UTR.");
                    if (btn) {
                        btn.innerHTML = originalBtnHtml;
                        btn.style.opacity = '1';
                        btn.style.pointerEvents = 'all';
                    }
                    return;
                }

                const paymentId = 'UPI_' + utrVal;
                if (btn) btn.innerHTML = '<span class="btn-text">Submitting Payment... <i class="fas fa-spinner fa-spin"></i></span><div class="btn-glow"></div>';
                handleFinalSave(paymentId, verifiedCode, verifiedDiscount, finalAmountPaise);
            };

            // Execute the payment flow
            proceedToPayment();
        });
    }

}



if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRegistrationApp);
} else {
    initRegistrationApp();
}
