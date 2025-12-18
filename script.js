// ==========================================
// CONFIGURATION
// Change true to false to CLOSE registration
// Change false to true to OPEN registration
// ==========================================
const isRegistrationOpen = true;

// Tournament ID - Change this to reset registration for a new event (e.g., 'event_2026')
const TOURNAMENT_ID = 'chess_event_2025_01';
// ==========================================

const form = document.getElementById('chessForm');
const closedMessage = document.getElementById('closedMessage');
const alreadyRegisteredMessage = document.getElementById('alreadyRegisteredMessage');

// Dynamic Redirect URL: Ensures user comes back to the same site (localhost or production)
const nextInput = document.querySelector('input[name="_next"]');
if (nextInput) {
    // Construct distinct URL for return
    const currentUrl = window.location.href.split('?')[0];
    nextInput.value = currentUrl + (currentUrl.endsWith('/') ? '' : '/') + '?success=true';
}

// 1. Check for Duplicate Registration
if (localStorage.getItem(TOURNAMENT_ID) === 'true') {
    if (form) form.style.display = 'none';
    if (alreadyRegisteredMessage) {
        alreadyRegisteredMessage.style.display = 'block';
        alreadyRegisteredMessage.style.animation = 'slideUpFade 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) forwards';
    }
    return; // Stop execution
}

// 2. Check if Registration is Closed
if (!isRegistrationOpen) {
    if (form) form.style.display = 'none';
    if (closedMessage) {
        closedMessage.style.display = 'block';
        closedMessage.style.animation = 'slideUpFade 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) forwards';
    }
    return; // Stop execution
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

// Check for success query parameter
// Check for success query parameter
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('success') === 'true') {
    // Mark as registered in LocalStorage
    localStorage.setItem(TOURNAMENT_ID, 'true');

    const successOverlay = document.querySelector('.success-overlay');
    if (successOverlay) {
        successOverlay.classList.add('active');

        // Hide form to prevent re-submission immediately
        if (form) form.style.display = 'none';
        if (alreadyRegisteredMessage) {
            // We don't necessarily need to show the message immediately behind the overlay, 
            // but it sets the state correctly for when they click "OK" or reload.
            alreadyRegisteredMessage.style.display = 'block';
            alreadyRegisteredMessage.style.opacity = '1'; // Ensure it's visible if overlay closes
        }

        // Optional: Clean up the URL
        window.history.replaceState({}, document.title, window.location.pathname);

        // Manual close is now required via button, so we don't auto-close
    }
}
});
