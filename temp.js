
        // ── Constants ──────────────────────────────────────────────
        const MAX_ATTEMPTS  = 5;
        const LOCKOUT_MS    = 5 * 60 * 1000; // 5 minutes lockout

        function escHtml(str) {
            if (typeof str !== 'string') return str;
            return str.replace(/[&<>"']/g, function(m) {
                return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[m];
            });
        }


        let countdownTimer = null;

        function startLockoutUI(remainingMs, phone) {
            const btn = document.getElementById('findBtn');
            const errDiv = document.getElementById('errorMsg');
            btn.disabled = true;

            if (countdownTimer) clearInterval(countdownTimer);

            const unlockTime = Date.now() + remainingMs;

            function updateDisplay() {
                const left = Math.max(0, unlockTime - Date.now());
                const mins = Math.floor(left / 60000);
                const secs = Math.floor((left % 60000) / 1000);

                errDiv.innerHTML = `<i class="fas fa-lock"></i> Too many failed attempts for this number! <br>Try again in <b>${mins}m ${secs}s</b>.`;
                errDiv.style.display = 'block';
                btn.innerHTML = `Locked (${mins}:${String(secs).padStart(2,'0')})`;

                if (left <= 0) {
                    clearInterval(countdownTimer);
                    btn.disabled = false;
                    btn.innerText = 'Find My Pass';
                    errDiv.style.display = 'none';
                }
            }

            updateDisplay();
            countdownTimer = setInterval(updateDisplay, 1000);
        }

        // Server-side rate limiting now handles attempts and lockouts.

        function showError(msg) {
            document.getElementById('loadingPhase').style.display = 'none';
            document.getElementById('searchPhase').style.display = 'block';
            
            const errDiv = document.getElementById('errorMsg');
            errDiv.innerHTML = msg;
            errDiv.style.display = 'block';
            const btn = document.getElementById('findBtn');
            if (!btn.disabled) btn.innerHTML = 'Find My Pass';
        }

        function showToast(message) {
            const container = document.getElementById('toastContainer');
            const toast = document.createElement('div');
            toast.className = 'toast';
            toast.innerHTML = `<i class="fas fa-clock"></i> <span>${message}</span>`;
            container.appendChild(toast);
            
            setTimeout(() => {
                toast.style.animation = 'slideOutRight 0.3s ease forwards';
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }

        async function findPass() {
            const name  = document.getElementById('passName').value.trim();
            const phone = document.getElementById('passPhone').value.trim();

            if (!name || !phone) return showError('<i class="fas fa-exclamation-circle"></i> Please enter both Name and Phone.');

            if (typeof db === 'undefined') {
                return showError('<i class="fas fa-wifi"></i> Check your internet connection.');
            }

            const btn = document.getElementById('findBtn');
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Searching...';

            document.getElementById('searchPhase').style.display = 'none';
            document.getElementById('loadingPhase').style.display = 'flex';

            try {
                // Artificial delay for premium loading feel
                await new Promise(r => setTimeout(r, 800));
                
                // Check if admin has enabled the feature
                const globalDoc = await db.collection('settings').doc('global').get();
                if (globalDoc.exists && globalDoc.data().isPassEnabled !== true) {
                    document.getElementById('loadingPhase').style.display = 'none';
                    document.getElementById('searchPhase').style.display = 'block';
                    btn.innerHTML = 'Find My Pass';
                    return showToast("Your pass is not generated yet! Please wait.");
                }
                // Server-side lockout check is now purely enforced in the backend.

                // Verify registration via secure API
                const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
                let apiUrl = '/api/getPass';
                
                if (isLocalhost) {
                    try {
                        const settingsDoc = await db.collection('settings').doc('global').get();
                        if (settingsDoc.exists && settingsDoc.data().vercelUrl) {
                            apiUrl = `${settingsDoc.data().vercelUrl.replace(/\/$/, '')}/api/getPass`;
                        }
                    } catch (e) {
                        console.warn("Could not fetch vercelUrl for localhost testing");
                    }
                }

                const res = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone, name })
                });

                const data = await res.json();
                
                if (!data.success) {
                    if (data.error === 'Incorrect name.') {
                        showError(`<i class="fas fa-exclamation-circle"></i> Incorrect name. <b>${data.attemptsLeft}</b> attempt(s) remaining!`);
                    } else if (data.error === 'Locked') {
                        startLockoutUI(data.remainingMs, phone);
                    } else if (data.error.includes('under review')) {
                        document.getElementById('loadingPhase').style.display = 'none';
                        document.getElementById('searchPhase').style.display = 'block';
                        const errDiv = document.getElementById('errorMsg');
                        errDiv.innerHTML = `<i class="fas fa-clock"></i> ${escHtml(data.error)}`;
                        errDiv.style.display = 'block';
                        btn.innerHTML = 'Find My Pass';
                    } else {
                        document.getElementById('loadingPhase').style.display = 'none';
                        document.getElementById('searchPhase').style.display = 'block';
                        const errDiv = document.getElementById('errorMsg');
                        errDiv.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${escHtml(data.error)}`;
                        errDiv.style.display = 'block';
                        btn.innerHTML = 'Find My Pass';
                    }
                    return;
                }

                const userData = data.player;

                // ✅ Success — rate limit is cleared automatically by backend

                // Hide skeleton, show pass card
                document.getElementById('loadingPhase').style.display = 'none';
                document.getElementById('resultPhase').style.display  = 'flex';
                document.getElementById('downloadBtn').style.display  = 'block';

                // Initialize 3D Tilt Effect
                VanillaTilt.init(document.querySelector(".ticket"), {
                    max: 15,
                    speed: 400,
                    glare: true,
                    "max-glare": 0.2,
                    scale: 1.02
                });

                // Fill card
                document.getElementById('cardName').innerText     = userData.name.toUpperCase();
                document.getElementById('cardUsername').innerText = '@' + (userData.username || 'unknown');
                document.getElementById('cardId').innerText = userData.cardId || 'CB000';
                document.getElementById('cardRating').innerText = (userData.rating || '-') + ' ELO';
                
                // Generate QR Code — fetch YouTube video URL from Firestore
                document.getElementById('qrcode').innerHTML = '';
                (async () => {
                    let qrUrl = 'https://chessbird-4625c.web.app'; // fallback
                    try {
                        if (typeof db !== 'undefined') {
                            const settingsDoc = await db.collection('settings').doc('global').get();
                            if (settingsDoc.exists && settingsDoc.data().qrVideoId) {
                                qrUrl = `https://youtu.be/${settingsDoc.data().qrVideoId}`;
                            }
                        }
                    } catch(e) { console.warn('QR URL fetch failed', e); }

                    new QRCode(document.getElementById("qrcode"), {
                        text: qrUrl,
                        width: 80,
                        height: 80,
                        colorDark : "#111113",
                        colorLight : "#ffffff",
                        correctLevel : QRCode.CorrectLevel.M
                    });
                })();
                        
            } catch (error) {
                showError('Database Error: ' + error.message);
                btn.innerHTML = 'Find My Pass';
            }
        }

        // Convert Card to PDF and Download
        function downloadPass() {
            const cardElement = document.getElementById('passCard');
            const btn = document.getElementById('downloadBtn');
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating PDF...';
            btn.disabled = true;

            // Temporarily disable tilt effect for clean capture
            if (cardElement.vanillaTilt) {
                cardElement.vanillaTilt.destroy();
            }
            cardElement.style.transform = 'none';
            cardElement.style.boxShadow = 'none';

            // Wait for QR code and layout to settle before capturing
            setTimeout(() => {
                html2canvas(cardElement, {
                    scale: 3, // High resolution capture
                    backgroundColor: '#111113',
                    useCORS: true
                }).then(canvas => {
                    const { jsPDF } = window.jspdf;

                    const imgData  = canvas.toDataURL('image/png');
                    const imgW     = canvas.width;
                    const imgH     = canvas.height;

                    // Convert px to mm (96 DPI → 1px = 0.2646 mm)
                    const pdfW = (imgW / 3) * 0.2646;  // divide by scale=3
                    const pdfH = (imgH / 3) * 0.2646;

                    // Create PDF exactly the size of the card
                    const pdf = new jsPDF({
                        orientation: pdfW > pdfH ? 'landscape' : 'portrait',
                        unit: 'mm',
                        format: [pdfW, pdfH]
                    });

                    pdf.addImage(imgData, 'PNG', 0, 0, pdfW, pdfH);
                    const cardId = document.getElementById('cardId').innerText.replace('#', '');
                    pdf.save(`ChessBird_Pass_${cardId}.pdf`);

                    btn.innerHTML = '<i class="fas fa-check"></i> PDF Downloaded!';
                    
                    // Re-initialize tilt
                    VanillaTilt.init(cardElement, {
                        max: 15,
                        speed: 400,
                        glare: true,
                        "max-glare": 0.2,
                        scale: 1.02
                    });
                    cardElement.style.boxShadow = '0 20px 40px rgba(0,0,0,0.8)';

                    setTimeout(() => {
                        btn.disabled = false;
                        btn.innerHTML = originalText;
                    }, 2000);
                }).catch(err => {
                    alert('Error generating PDF: ' + err.message);
                    btn.disabled = false;
                    btn.innerHTML = originalText;
                    
                    // Re-initialize tilt even on error
                    VanillaTilt.init(cardElement, {
                        max: 15,
                        speed: 400,
                        glare: true,
                        "max-glare": 0.2,
                        scale: 1.02
                    });
                    cardElement.style.boxShadow = '0 20px 40px rgba(0,0,0,0.8)';
                });
            }, 300);
        }
        // ── Load Custom Logo from Firestore ──────────────────────────
        (function loadSiteLogo() {
            function tryLoad() {
                if (typeof db === 'undefined') { setTimeout(tryLoad, 400); return; }
                db.collection('settings').doc('global').get().then(function(doc) {
                    if (doc.exists && doc.data().logoBase64) {
                        var img = document.getElementById('siteLogoImg');
                        if (img) img.src = doc.data().logoBase64;
                    }
                }).catch(function(){});
            }
            tryLoad();
        })();
    