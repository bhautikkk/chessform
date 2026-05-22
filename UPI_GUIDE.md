# 📱 ChessBird Manual UPI Payment Guide (Hindi)

Humne checkout system ko Razorpay se hata kar ek fully manual, secure **UPI QR Code + UTR Verification** system mein badal diya hai. Ab aapko Razorpay approval ki zaroorat nahi hai.

---

## 🛠️ System Kaise Kaam Karta Hai?

### 1. User Registration Flow (User Side):
1. **Details Fill Karna**: User website par aakar apni details (Name, Username, Email, Phone, Rating) fill karega.
2. **UPI QR Code Scan Karna**: Agar registration fee `> 0` hai, toh submit button ke upar ek glassmorphic **UPI Payment Card** dikhega. Wahan par ek dynamic QR code generate hoga.
3. **Payment Karna**: User kisi bhi UPI app (Google Pay, PhonePe, Paytm, BHIM) se QR code scan karke ya UPI ID copy karke payment karega.
4. **UTR Enter Karna**: Payment hone ke baad, user ko transition receipt se **12-digit UTR (Unique Transaction Reference) / Ref No** copy karke input box mein enter karna hoga.
5. **Submit**: Form submit karne par backend check karta hai ki:
   - UTR exact 12 digits ka hai ya nahi.
   - Yeh UTR pehle kisi aur ne submit toh nahi kiya (Duplicate check).
   - Validation pass hone par user ka data Firestore database mein `cardId: "Pending"` ke sath save ho jata hai.

---

## 🔑 Admin Verification Flow (Admin Side):

Aapko (Admin ko) payments verify karke player ko manually approve ya reject karna hoga:

### Step 1: UPI ID Configure Karna (Important)
Asli payments lene ke liye sabse pehle apna UPI VPA address setup karein:
1. **Admin Panel** open karein: (`c:\Users\91873\Desktop\chess form\admin.html` ya live Vercel URL).
2. **Config & Settings** tab par jayein.
3. Scroll karke **"UPI VPA Address"** section dhoondein.
4. Apna UPI VPA ID (e.g. `yourname@ybl` ya `chessbird@ybl`) enter karein aur **Save UPI ID** par click karein.
*(Yeh UPI ID update hote hi form par QR code automatic aapke account ka banne lagega).*

### Step 2: Payments Verify & Approve Karna
1. Admin Dashboard login karke **"Pending Approvals"** tab mein jayein.
2. Wahan aapko un sabhi players ki list dikhegi jinhone register kiya hai par verification pending hai.
3. List mein har card par user ka **UTR ID** aur **Amount Paid** likha hoga.
4. Apne bank account / UPI merchant app (Google Pay Business, etc.) mein check karein ki is UTR number se paise receive hue hain ya nahi.
5. **Approve Button**: Agar payment received hai:
   - **Approve** par click karein.
   - System auto-generate karega ek unique random 3-digit card ID (e.g. `CB158`).
   - Player ka status update ho jayega aur wo automatic register ho jayega.
   - User ko **EmailJS** ke through automatic "Approved Confirmation Email" chala jayega jisme unka Chess Card ID likha hoga.
6. **Reject Button**: Agar payment nahi mila ya fake entry hai:
   - **Reject** par click karein.
   - Confirm karne ke baad player ka record database se delete ho jayega.
   - User ko automatic "Rejection Email" chala jayega taaki wo correct payment screenshot/UTR ke sath dobara register karein.

---

## ⚡ Key Updates & Features:
*   **Duplicate UTR Protection**: Koi bhi ek UTR number ka use karke 2 baar register nahi kar sakta. Backend isko block kar deta hai.
*   **Sequential / Random IDs**: Players ko approval ke time automatically aur collision-free Chess Cards milte hain.
*   **EmailJS Integration**: Confirmation aur rejection notifications direct browser-side EmailJS SDK se send hote hain. Iski templates aapke configurations ke sath completely sync hain.
