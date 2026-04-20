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

    if (typeof db !== 'undefined') {
        db.collection('settings').doc('global').onSnapshot((doc) => {
            const isRegistrationOpen = doc.exists ? (doc.data().isRegistrationOpen || false) : false;
            currentEventId = doc.exists ? (doc.data().eventId || 'event_default') : 'event_default';
            const isPromoEnabled = doc.exists ? (doc.data().isPromoEnabled !== false) : true; // Default ON

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
                if (form) form.style.display = 'none';
                if (alreadyRegisteredMessage) alreadyRegisteredMessage.style.display = 'none';
                if (closedMessage) {
                    closedMessage.style.display = 'block';
                    closedMessage.style.animation = 'slideUpFade 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) forwards';
                }
            } else {
                // Registration is OPEN — check if already registered
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
                    }
                    const successOverlay = document.querySelector('.success-overlay');
                    if (successOverlay) {
                        successOverlay.classList.add('active');
                        window.history.replaceState({}, document.title, window.location.pathname);
                    }
                    return; // Done processing
                }

                if (localStorage.getItem(currentEventId) === 'true') {
                    if (form) form.style.display = 'none';
                    if (alreadyRegisteredMessage) {
                        alreadyRegisteredMessage.style.display = 'block';
                        alreadyRegisteredMessage.style.animation = 'slideUpFade 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) forwards';
                    }
                } else {
                    if (alreadyRegisteredMessage) alreadyRegisteredMessage.style.display = 'none';
                    if (form) form.style.display = 'block';
                }
            }
        });
    } else {
        // Firestore not available — fallback: show form (open by default)
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

    // ── Update submit button text based on applied promo ──
    function updateSubmitBtn() {
        if (!submitBtn) return;
        const btnText = submitBtn.querySelector('.btn-text');
        const mainPrice = document.getElementById('mainPriceDisplay');
        const origPrice = document.getElementById('originalPriceDisplay');
        const discBadge = document.getElementById('discountBadge');

        if (!btnText || !mainPrice) return;

        if (appliedPromo && appliedPromo.discount > 0 && appliedPromo.discount < 100) {
            const finalRs = Math.max(0, (BASE_AMOUNT_RS * (1 - appliedPromo.discount / 100)));
            const finalDisplay = Number.isInteger(finalRs) ? finalRs : finalRs.toFixed(2);
            
            mainPrice.innerHTML = `&#x20B9;${finalDisplay}`;
            origPrice.innerHTML = `&#x20B9;${BASE_AMOUNT_RS}`;
            origPrice.style.display = 'inline';
            discBadge.innerHTML = `<i class="fas fa-tag"></i> <span>${appliedPromo.discount}% OFF</span>`;
            discBadge.style.display = 'inline-flex';
            
            btnText.innerHTML = `Register & Proceed to Pay <i class="fas fa-arrow-right arrow-icon"></i>`;
        } else if (appliedPromo && appliedPromo.discount === 100) {
            mainPrice.innerHTML = `<span style="color:#4ade80;">FREE</span>`;
            origPrice.innerHTML = `&#x20B9;${BASE_AMOUNT_RS}`;
            origPrice.style.display = 'inline';
            discBadge.innerHTML = `<i class="fas fa-tag"></i> <span>100% OFF</span>`;
            discBadge.style.display = 'inline-flex';

            btnText.innerHTML = `Submit Free Registration <i class="fas fa-arrow-right arrow-icon"></i>`;
        } else {
            mainPrice.innerHTML = `&#x20B9;${BASE_AMOUNT_RS}`;
            origPrice.style.display = 'none';
            discBadge.style.display = 'none';

            btnText.innerHTML = `Register & Proceed to Pay <i class="fas fa-arrow-right arrow-icon"></i>`;
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
                setPromoStatus('error', '<i class="fas fa-times-circle"></i> Invalid promo code. Please check and try again.');
                resetApplyBtn();
                updateSubmitBtn();
                return;
            }

            const data = docSnap.data();

            if (data.active !== true) {
                appliedPromo = null;
                setPromoStatus('error', '<i class="fas fa-times-circle"></i> This code has expired or is no longer active.');
                resetApplyBtn();
                updateSubmitBtn();
                return;
            }

            const discount = Number(data.discount) || 0;
            if (discount <= 0 || discount > 100) {
                appliedPromo = null;
                setPromoStatus('error', '<i class="fas fa-times-circle"></i> Invalid code configuration. Please contact support.');
                resetApplyBtn();
                updateSubmitBtn();
                return;
            }

            // ✅ Code is valid — store and show popup
            appliedPromo = { code, discount };

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
    const noChessAccountBtn = document.getElementById('noChessAccount');
    let typingTimer;
    const typingInterval = 800; // Wait 800ms after user stops typing to trigger API

    if (noChessAccountBtn && usernameInput && ratingInput) {
        noChessAccountBtn.addEventListener('change', (e) => {
            const userWrapper = usernameInput.closest('.input-wrapper');
            const ratingWrapper = ratingInput.closest('.input-wrapper');
            const rightCheckIcon = userWrapper.querySelector('.field-check');

            if (e.target.checked) {
                // "Disabled" state
                usernameInput.value = 'No Account';
                usernameInput.readOnly = true;
                usernameInput.style.opacity = '0.5';
                usernameInput.style.pointerEvents = 'none';
                
                ratingInput.value = 'N/A';
                ratingInput.readOnly = true;
                ratingInput.style.opacity = '0.5';
                ratingInput.style.pointerEvents = 'none';

                // Visual updates
                userWrapper.classList.remove('is-invalid', 'is-loading');
                userWrapper.classList.add('is-valid');
                const errText = document.getElementById('usernameError');
                if (errText) errText.style.display = 'none';
                if (rightCheckIcon) rightCheckIcon.className = 'fa-solid fa-circle-check field-check';
                ratingWrapper.classList.remove('is-invalid');
                ratingWrapper.classList.add('is-valid');
            } else {
                // Enabled state
                usernameInput.value = '';
                usernameInput.readOnly = false;
                usernameInput.style.opacity = '1';
                usernameInput.style.pointerEvents = 'auto';
                
                ratingInput.value = '';
                ratingInput.style.opacity = '1';

                // Visual reset
                userWrapper.classList.remove('is-valid', 'is-invalid', 'is-loading');
                const errText = document.getElementById('usernameError');
                if (errText) errText.style.display = 'none';
                if (rightCheckIcon) rightCheckIcon.className = 'fa-solid fa-circle-check field-check';
                ratingWrapper.classList.remove('is-valid', 'is-invalid');
            }
        });
    }

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
                    // 2. Check if user exists
                    const userRes = await fetch(`https://api.chess.com/pub/player/${username}`);
                    
                    userWrapper.classList.remove('is-loading'); // Stop loading state

                    if (!userRes.ok) {
                        userWrapper.classList.add('is-invalid');
                        if (rightCheckIcon) rightCheckIcon.className = 'fa-solid fa-circle-xmark field-check'; // Right Icon Error
                        const errText = document.getElementById('usernameError');
                        if (errText) errText.style.display = 'block';
                        return; // Stop here, no rating to fetch
                    }

                    // 3. User exists, fetch stats for auto-filling rating
                    userWrapper.classList.add('is-valid');
                    const errText = document.getElementById('usernameError');
                    if (errText) errText.style.display = 'none';
                    if (rightCheckIcon) rightCheckIcon.className = 'fa-solid fa-circle-check field-check'; // Right Icon Success

                    const statsRes = await fetch(`https://api.chess.com/pub/player/${username}/stats`);
                    if (statsRes.ok) {
                        const stats = await statsRes.json();
                        let bestRating = null; // null = no rating found

                        // Prefer Rapid, then Blitz, then Bullet
                        if (stats.chess_rapid && stats.chess_rapid.last) {
                            bestRating = stats.chess_rapid.last.rating;
                        } else if (stats.chess_blitz && stats.chess_blitz.last) {
                            bestRating = stats.chess_blitz.last.rating;
                        } else if (stats.chess_bullet && stats.chess_bullet.last) {
                            bestRating = stats.chess_bullet.last.rating;
                        }

                        // Auto-fill rating
                        ratingInput.value = bestRating !== null ? bestRating : 'N/A';
                        ratingWrapper.classList.add('is-valid');
                        ratingWrapper.classList.remove('is-invalid');
                        
                        // Flash success glow
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

            // Prevent submission if username is invalid or still loading API
            const usernameInput = document.getElementById('username');
            const userWrapper = usernameInput ? usernameInput.closest('.input-wrapper') : null;
            if (userWrapper && (userWrapper.classList.contains('is-invalid') || userWrapper.classList.contains('is-loading'))) {
                alert("Please enter a valid Chess.com username, or check 'I don't have an account'.");
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

            const templateParams = {
                name: document.getElementById('name').value,
                username: document.getElementById('username').value,
                email: document.getElementById('email').value,
                user_email: document.getElementById('email').value,
                phone: document.getElementById('phone').value,
                rating: document.getElementById('rating').value
            };

            // Function to handle Email JS and FormSubmit
            const proceedWithEmailJS = () => {
                emailjs.send(serviceID, templateID, templateParams)
                    .then((response) => {
                        console.log('Email sent successfully!', response.status, response.text);
                    })
                    .catch((err) => {
                        console.error('Email sending failed:', err);
                        alert("EmailJS kaam nahi kar raha kyuki:\n\n" + JSON.stringify(err) + "\n\n(Aap iska photo khinch ke chat me bhej dein)");
                    })
                    .finally(() => {
                        // Safe fallback to FormSubmit via AJAX
                        const formData = new FormData(form);
                        fetch('https://formsubmit.co/ajax/hrr26400@gmail.com', {
                            method: 'POST',
                            body: formData,
                            headers: {
                                'Accept': 'application/json'
                            }
                        })
                            .then(response => response.json())
                            .then(data => {
                                console.log('FormSubmit Data stored:', data);
                                localStorage.setItem(currentEventId, 'true');
                                form.style.display = 'none';
                                if (alreadyRegisteredMessage) {
                                    alreadyRegisteredMessage.style.display = 'block';
                                    alreadyRegisteredMessage.style.animation = 'slideUpFade 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) forwards';
                                }
                                const successOverlay = document.querySelector('.success-overlay');
                                if (successOverlay) {
                                    successOverlay.classList.add('active');
                                }
                            })
                            .catch(error => {
                                console.error('FormSubmit error:', error);
                                alert('Something went wrong. Please try again.');
                                if (btn) {
                                    btn.innerHTML = '<span class="btn-text">Register Now <i class="fas fa-arrow-right arrow-icon"></i></span><div class="btn-glow"></div>';
                                    btn.style.opacity = '1';
                                    btn.style.pointerEvents = 'all';
                                }
                            });
                    });
            };

            // Database Handling — SECURITY HARDENED
            const handleFinalSave = (paymentId, usedPromoCode, discountApplied, finalAmountPaise) => {
                // 🔒 SECURITY: Validate paymentId format before writing
                // Free registrations (100% off) use 'FREE_<timestamp>' format
                const isFreeReg = paymentId && /^FREE_\d+$/.test(paymentId);
                const isRazorpay = paymentId && /^pay_[A-Za-z0-9]{14,}$/.test(paymentId);

                if (!isFreeReg && !isRazorpay) {
                    console.error("Invalid paymentId format. Aborting save.", paymentId);
                    proceedWithEmailJS();
                    return;
                }

                if (typeof db !== 'undefined') {
                    const userPhone = templateParams.phone;
                    db.collection("registrations").doc(userPhone).get()
                        .then(docSnap => {
                            if (docSnap.exists) {
                                console.log("User already exists. Skipping re-save.");
                                proceedWithEmailJS();
                            } else {
                                // 🔒 SECURITY: Only write EXPLICITLY whitelisted fields
                                // 🔒 SECURITY: Split data into PUBLIC and PRIVATE collections
                                // Public (for leaderboard/get-pass)
                                const publicData = {
                                    name:      String(templateParams.name  || '').trim().substring(0, 100),
                                    username:  String(templateParams.username || '').trim().substring(0, 50),
                                    phone:     String(templateParams.phone || '').trim(),
                                    rating:    templateParams.rating === 'N/A' ? 'N/A' : (parseInt(templateParams.rating, 10) || 'N/A'),
                                    cardId:    'Pending'
                                };

                                // Private (admin only) — includes promo code used
                                const privateData = {
                                    email:           String(templateParams.email || '').trim().substring(0, 200),
                                    paymentId:       paymentId,
                                    timestamp:       firebase.firestore.FieldValue.serverTimestamp(),
                                    // Promo code audit trail
                                    promoCode:       usedPromoCode   || null,
                                    discountApplied: discountApplied || 0,
                                    amountPaid:      finalAmountPaise || BASE_AMOUNT_PAISE
                                };

                                // Write to both collections simultaneously
                                Promise.all([
                                    db.collection("registrations").doc(userPhone).set(publicData),
                                    db.collection("registrations_private").doc(userPhone).set(privateData)
                                ])
                                .then(() => {
                                    console.log("Registration saved securely (Split).");
                                    proceedWithEmailJS();
                                })
                                .catch((error) => {
                                    console.error("Save failed:", error);
                                    proceedWithEmailJS();
                                });
                            }
                        }).catch(error => {
                            console.error("DB check failed:", error);
                            proceedWithEmailJS();
                        });
                } else {
                    proceedWithEmailJS();
                }
            };

            // ═══════════════════════════════════════════════════════
            // We re-fetch the promo code from Firestore at submit time.
            // This means even if someone edits the appliedPromo variable
            // in DevTools, the actual Razorpay charge is always based on
            // the REAL server value — not any client-side value.
            // ═══════════════════════════════════════════════════════
            let verifiedDiscount = 0;
            let verifiedCode = null;

            const cachedCode = appliedPromo ? appliedPromo.code : null;

            const proceedToPayment = async () => {
                // ── Step 1: Re-fetch registration fee LIVE from Firestore ─
                // Yeh ensure karta hai ki DevTools se BASE_AMOUNT_PAISE
                // change karne par bhi Razorpay correct amount charge kare.
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
                    console.warn('Fee re-fetch failed, using cached display value:', feeErr);
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

                // ── 100% OFF: Skip Razorpay entirely ──
                if (verifiedDiscount === 100) {
                    if (btn) btn.innerHTML = '<span class="btn-text">Processing... <i class="fas fa-spinner fa-spin"></i></span><div class="btn-glow"></div>';
                    const freePayId = 'FREE_' + Date.now();
                    handleFinalSave(freePayId, verifiedCode, verifiedDiscount, finalAmountPaise);
                    return;
                }

                // ── Normal / Discounted payment via Razorpay ──
                const options = {
                    "key": "rzp_test_SdF2J3WDCQa5Ko",
                    "amount": finalAmountPaise,
                    "currency": "INR",
                    "name": "Chess Bird",
                    "description": verifiedCode
                        ? `Tournament Registration (${verifiedCode} — ${verifiedDiscount}% off)`
                        : "Tournament Registration Fee",
                    "handler": function (response) {
                        console.log("Payment Successful!", response.razorpay_payment_id);
                        if (btn) btn.innerHTML = '<span class="btn-text">Verifying... <i class="fas fa-spinner fa-spin"></i></span><div class="btn-glow"></div>';
                        handleFinalSave(response.razorpay_payment_id, verifiedCode, verifiedDiscount, finalAmountPaise);
                    },
                    "prefill": {
                        "name": templateParams.name,
                        "email": templateParams.email,
                        "contact": templateParams.phone
                    },
                    "theme": { "color": "#c6a87c" },
                    "modal": {
                        "ondismiss": function() {
                            updateSubmitBtn(); // Restore correct button text
                            if (btn) {
                                btn.style.opacity = '1';
                                btn.style.pointerEvents = 'all';
                            }
                        }
                    }
                };

                if (typeof Razorpay !== 'undefined') {
                    const rzp = new Razorpay(options);
                    rzp.on('payment.failed', function (response) {
                        alert("Payment Failed. Reason: " + response.error.description);
                        updateSubmitBtn();
                        if (btn) {
                            btn.style.opacity = '1';
                            btn.style.pointerEvents = 'all';
                        }
                    });

                    // Check if already registered before opening payment
                    if (typeof db !== 'undefined') {
                        const userPhone = templateParams.phone;
                        db.collection("registrations").doc(userPhone).get()
                            .then(docSnap => {
                                if (docSnap.exists) {
                                    alert("You are already registered!");
                                    updateSubmitBtn();
                                    if (btn) { btn.style.opacity = '1'; btn.style.pointerEvents = 'all'; }
                                } else {
                                    rzp.open();
                                }
                            }).catch(e => {
                                console.error("Checking registration failed", e);
                                rzp.open();
                            });
                    } else {
                        rzp.open();
                    }
                } else {
                    alert("Razorpay is not loaded properly.");
                }
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
