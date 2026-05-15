# 🚀 Razorpay Live Setup Guide (Hindi)

Jab aapka Razorpay account puri tarah se approve ho jaye aur "Live Mode" mein aa jaye, tab apni website par asli payments lene shuru karne ke liye in aasan steps ko follow karein:

## Step 1: Razorpay se Keys nikalna
1. Apne Razorpay Dashboard mein login karein.
2. Left menu mein **"Settings"** ya **"Account & Settings"** par click karein aur wahan **"API Keys"** wale tab mein jayein.
3. Top right corner se dashboard ko **"Live Mode"** mein switch karein.
4. Wahan se nayi keys generate karein. Aapko 2 cheezein milengi:
   - **Key ID:** (Ye `rzp_live_...` se shuru hogi)
   - **Key Secret:** (Ye ek lamba, password jaisa code hoga jise kisi se share nahi karna)

---

## Step 2: Vercel par update karna (Backend ke liye)
1. Apne Vercel dashboard par jayein aur apne project par click karein.
2. Upar **Settings** tab mein jayein, aur left menu se **Environment Variables** select karein.
3. Puraani test wali `RAZORPAY_KEY_ID` ko edit karke wahan nayi **Live Key ID** daalein aur Save karein.
4. Ab ek ekdam naya variable add karein:
   - **Key:** `RAZORPAY_KEY_SECRET`
   - **Value:** (Apni Razorpay Live Key Secret yahan paste karein)
   - Aur Add/Save daba dein.

*(⚠️ **Zaruri Baat:** Vercel mein nayi keys daalne ke baad "Deployments" tab mein jaakar apni website ko ek baar "Redeploy" zaroor karein taki nayi keys lagoo ho sakein).*

---

## Step 3: Admin Panel par update karna (Frontend ke liye)
1. Apni live website ka Admin Panel open karein (`https://chessbirdform.vercel.app/admin.html`).
2. Apne email (`bhautikk264@gmail.com`) aur password se login karein.
3. Thoda neeche scroll karein aur **"RAZORPAY API KEY"** wale section ko dhoondein.
4. Wahan wale box mein apni nayi **Live Key ID** (`rzp_live_...`) paste karein.
5. **Save Key** button par click kar dein.

**Bas ho gaya! 🎉** 
Ek baar kisi dusre phone se Rs. 1 ka fake/test payment ya asli payment karke check kar lein. Sab kuch theek raha toh aapki website officially payments ke liye ready hai!
