document.addEventListener('DOMContentLoaded', () => {
    // ==========================================
    // CONFIGURATION
    // Change true to false to CLOSE registration
    // Change false to true to OPEN registration
    // ==========================================
    const isRegistrationOpen = true;
    const eventId = 'event_test_reset_01.007'; // CHANGE THIS FOR NEW EVENTS
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
            const templateID = 'template_q1boq13';

            emailjs.sendForm(serviceID, templateID, this)
                .then(() => {
                    console.log('Email sent successfully!');
                })
                .catch((err) => {
                    console.error('Email sending failed:', err);
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
                        // Show success overlay without reload
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
                        // Reset button
                        if (btn) {
                            btn.innerHTML = '<span class="btn-text">Submit Registration <i class="fas fa-arrow-right arrow-icon"></i></span><div class="btn-glow"></div>';
                            btn.style.opacity = '1';
                            btn.style.pointerEvents = 'all';
                        }
                    });
                });
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
});
