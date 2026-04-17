function initRegistrationApp() {
    // ==========================================
    // CONFIGURATION
    // Registration open/close is now controlled from Admin Panel
    // No need to change code — toggle it from admin.html
    // ==========================================
    // eventId is now loaded dynamically from Firestore!
    let currentEventId = 'event_default';
    // ==========================================

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
    if (typeof db !== 'undefined') {
        db.collection('settings').doc('global').onSnapshot((doc) => {
            const isRegistrationOpen = doc.exists ? (doc.data().isRegistrationOpen || false) : false;
            currentEventId = doc.exists ? (doc.data().eventId || 'event_default') : 'event_default';

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
                
                ratingInput.value = '1200';
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
                        let bestRating = 1200; // default fallback

                        // Prefer Rapid, then Blitz, then Bullet
                        if (stats.chess_rapid && stats.chess_rapid.last) {
                            bestRating = stats.chess_rapid.last.rating;
                        } else if (stats.chess_blitz && stats.chess_blitz.last) {
                            bestRating = stats.chess_blitz.last.rating;
                        } else if (stats.chess_bullet && stats.chess_bullet.last) {
                            bestRating = stats.chess_bullet.last.rating;
                        }

                        // Auto-fill rating
                        ratingInput.value = bestRating;
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
            const handleFinalSave = (paymentId) => {
                // 🔒 SECURITY: Validate paymentId format before writing
                // Must match Razorpay format: pay_ + 14+ alphanumeric chars
                // This matches our Firestore rule — if client sends wrong format, write will fail anyway
                if (!paymentId || !/^pay_[A-Za-z0-9]{14,}$/.test(paymentId)) {
                    console.error("Invalid paymentId format. Aborting save.", paymentId);
                    proceedWithEmailJS(); // Still send confirmation email
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
                                    rating:    parseInt(templateParams.rating, 10) || 1200,
                                    cardId:    'Pending'
                                };

                                // Private (admin only)
                                const privateData = {
                                    email:     String(templateParams.email || '').trim().substring(0, 200),
                                    paymentId: paymentId,
                                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
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

            // Razorpay Integration
            const options = {
                "key": "rzp_test_SdF2J3WDCQa5Ko", // The user's test key
                "amount": 2900, // ₹29 in paise
                "currency": "INR",
                "name": "Chess Bird",
                "description": "Tournament Registration Fee",
                "handler": function (response){
                    // Payment successful
                    console.log("Payment Successful!", response.razorpay_payment_id);
                    // Keep button loading state
                    if (btn) {
                        btn.innerHTML = '<span class="btn-text">Verifying... <i class="fas fa-spinner fa-spin"></i></span><div class="btn-glow"></div>';
                    }
                    handleFinalSave(response.razorpay_payment_id);
                },
                "prefill": {
                    "name": templateParams.name,
                    "email": templateParams.email,
                    "contact": templateParams.phone
                },
                "theme": {
                    "color": "#c6a87c"
                },
                "modal": {
                    "ondismiss": function() {
                        if (btn) {
                            btn.innerHTML = '<span class="btn-text">Pay ₹29 & Register <i class="fas fa-arrow-right arrow-icon"></i></span><div class="btn-glow"></div>';
                            btn.style.opacity = '1';
                            btn.style.pointerEvents = 'all';
                        }
                    }
                }
            };
            
            if (typeof Razorpay !== 'undefined') {
                const rzp = new Razorpay(options);
                rzp.on('payment.failed', function (response){
                    alert("Payment Failed. Reason: " + response.error.description);
                    if (btn) {
                        btn.innerHTML = '<span class="btn-text">Pay ₹29 & Register <i class="fas fa-arrow-right arrow-icon"></i></span><div class="btn-glow"></div>';
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
                                if (btn) {
                                    btn.innerHTML = '<span class="btn-text">Pay ₹29 & Register <i class="fas fa-arrow-right arrow-icon"></i></span><div class="btn-glow"></div>';
                                    btn.style.opacity = '1';
                                    btn.style.pointerEvents = 'all';
                                }
                            } else {
                                rzp.open();
                            }
                        }).catch(e => {
                            console.error("Checking registration failed", e);
                            rzp.open(); // Fallback open
                        });
                } else {
                    rzp.open();
                }
            } else {
                 alert("Razorpay is not loaded properly.");
            }
        });
    }

}



if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRegistrationApp);
} else {
    initRegistrationApp();
}
