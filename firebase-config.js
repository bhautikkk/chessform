// ═══════════════════════════════════════════════════════
// ChessBird — Centralized Firebase Configuration
// ⚠️  Yeh file PUBLIC hai — isme kabhi bhi sensitive secrets
//     mat daalo (passwords, private keys etc.)
//     Firebase security RULES se data protect hota hai, yahan se nahi.
// ═══════════════════════════════════════════════════════

const firebaseConfig = {
  apiKey: "AIzaSyCoiZZ-mW1FRiS45ozkm6uUgGCm-dW8kCQ",
  authDomain: "chessbird-4625c.firebaseapp.com",
  projectId: "chessbird-4625c",
  storageBucket: "chessbird-4625c.firebasestorage.app",
  messagingSenderId: "828832296095",
  appId: "1:828832296095:web:f79084fb605c06d0c2c6aa",
  measurementId: "G-XF2X82NMSF"
};

// Initialize Firebase (only once)
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

// ── Firestore Database ──
const db = firebase.firestore();

// ── Auth is available as firebase.auth() wherever needed ──
// (firebase-auth-compat.js must be loaded before this file on pages that need Auth)
