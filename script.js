function initRegistrationApp() {
    // ==========================================
    // CONFIGURATION
    // Change true to false to CLOSE registration
    // Change false to true to OPEN registration
    // ==========================================
    const isRegistrationOpen = true;
    const eventId = 'event_test_reset_07'; // CHANGE THIS FOR NEW EVENTS
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

    // 1. Check if registration is globally closed
    if (!isRegistrationOpen) {
        if (form) form.style.display = 'none';
        if (closedMessage) {
            closedMessage.style.display = 'block';
            closedMessage.style.animation = 'slideUpFade 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) forwards';
        }
        return; // Stop further script execution
    }

    // 2. Check if user is already registered for this specific event
    if (localStorage.getItem(eventId) === 'true') {
        if (form) form.style.display = 'none';
        if (alreadyRegisteredMessage) {
            alreadyRegisteredMessage.style.display = 'block';
            alreadyRegisteredMessage.style.animation = 'slideUpFade 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) forwards';
        }
        return; // Stop further script execution
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

    const inputs = document.querySelectorAll('.form-control');
    // Input focus effects for better UX
    inputs.forEach(input => {
        input.addEventListener('focus', () => {
            input.parentElement.parentElement.classList.add('focused');
        });
        input.addEventListener('blur', () => {
            input.parentElement.parentElement.classList.remove('focused');
        });
    });

    // Prevent double submission and ensure EmailJS sends before redirecting
    if (form) {
        form.addEventListener('submit', function (e) {
            // Prevent default to stop browser from redirecting before EmailJS finishes
            e.preventDefault();

            const btn = this.querySelector('.submit-btn');
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
                                localStorage.setItem(eventId, 'true');
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
                                    btn.innerHTML = '<span class="btn-text">Submit Registration <i class="fas fa-arrow-right arrow-icon"></i></span><div class="btn-glow"></div>';
                                    btn.style.opacity = '1';
                                    btn.style.pointerEvents = 'all';
                                }
                            });
                    });
            };

            // Database Handling & Random ID Generation
            if (typeof db !== 'undefined') {
                // Check if user already exists based on phone document
                db.collection("registrations").where("phone", "==", templateParams.phone).get()
                    .then(snapshot => {
                        if (!snapshot.empty) {
                            console.log("User already exists. Skipping re-save.");
                            proceedWithEmailJS();
                        } else {
                            // Generate a GUARANTEED unique random Card ID
                            generateUniqueCardId().then(cardId => {
                                // Save to Firestore
                                db.collection("registrations").add({
                                    name: templateParams.name,
                                    username: templateParams.username,
                                    email: templateParams.email,
                                    phone: templateParams.phone,
                                    rating: templateParams.rating,
                                    cardId: cardId,
                                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                                }).then(() => {
                                    console.log("Saved with unique Card ID:", cardId);
                                    proceedWithEmailJS();
                                }).catch((error) => {
                                    console.error("Save failed:", error);
                                    proceedWithEmailJS();
                                });
                            }).catch(error => {
                                console.error("ID generation failed:", error);
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
        });
    }

    // Check for success query parameter
    // Check for success query parameter
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('success') === 'true') {
        // Mark user as registered for this event
        localStorage.setItem(eventId, 'true');

        // Hide form and show already registered message (so it's there when overlay closes)
        if (form) form.style.display = 'none';
        if (alreadyRegisteredMessage) {
            alreadyRegisteredMessage.style.display = 'block';
            alreadyRegisteredMessage.style.animation = 'slideUpFade 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) forwards';
        }

        const successOverlay = document.querySelector('.success-overlay');
        if (successOverlay) {
            successOverlay.classList.add('active');

            // Optional: Clean up the URL
            window.history.replaceState({}, document.title, window.location.pathname);

            // Manual close is now required via button, so we don't auto-close
        }
    }
}

// ── Random Card ID Generator ─────────────────────────────────────────
// Format: CB + 6 chars from [0-9A-Z]
// Total combinations: 36^6 = 2,176,782,336 (~2.18 billion)
// Collision check: Agar ID pehle se kisi ko mili hai to naya generate karta hai
function generateRawId() {
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const randomBytes = new Uint8Array(6);
    crypto.getRandomValues(randomBytes); // Cryptographically secure
    let id = 'CB';
    for (let i = 0; i < 6; i++) {
        id += chars[randomBytes[i] % chars.length];
    }
    return id;
}

// Returns a GUARANTEED unique Card ID (checks Firestore before returning)
async function generateUniqueCardId() {
    let attempts = 0;
    while (attempts < 10) { // Safety: max 10 attempts (practically 1 attempt always works)
        const cardId = generateRawId();
        const existing = await db.collection('registrations').where('cardId', '==', cardId).get();
        if (existing.empty) {
            console.log(`Unique Card ID generated in ${attempts + 1} attempt(s): ${cardId}`);
            return cardId; // ✅ Unique confirm — return it
        }
        console.warn(`Card ID collision detected: ${cardId} — retrying...`);
        attempts++;
    }
    // Fallback (astronomically unlikely to ever reach here)
    return 'CB' + Date.now().toString(36).toUpperCase().slice(-6);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRegistrationApp);
} else {
    initRegistrationApp();
}
