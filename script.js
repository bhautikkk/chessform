document.addEventListener('DOMContentLoaded', () => {
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
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('success') === 'true') {
        const successOverlay = document.querySelector('.success-overlay');
        if (successOverlay) {
            successOverlay.classList.add('active');

            // Optional: Clean up the URL
            window.history.replaceState({}, document.title, window.location.pathname);

            // Hide after 3 seconds
            setTimeout(() => {
                successOverlay.classList.remove('active');
            }, 4000);
        }
    }
});
