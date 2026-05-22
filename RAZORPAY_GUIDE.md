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

---

# 🧪 Razorpay Test Mode Setup Guide (Hindi)

Agar aap apni website par payments ko bina asli paise kharch kiye test karna chahte hain, toh in steps ko follow karke "Test Mode" setup karein:

## Step 1: Razorpay se Test Keys nikalna
1. Apne Razorpay Dashboard mein login karein.
2. Left sidebar mein check karein ki aapka dashboard **"Test Mode"** mein switched hai (agar wahan "Live Mode" likha hai, toh toggle par click karke use Test Mode mein switch karein).
3. **"Account & Settings"** -> **"API Keys"** par jayein.
4. **"Generate Test Key"** button par click karein. Aapko do cheezein milengi:
   - **Key ID:** (Yeh `rzp_test_...` se shuru hogi)
   - **Key Secret:** (Yeh ek lamba code hoga jise secure rakhna hai)

---

## Step 2: Vercel par Test Secret configure karna
Aapka backend payment ko verify karne ke liye is secret ka use karega.
1. Apne Vercel dashboard par jayein aur apne project settings par jayein.
2. Left menu se **Environment Variables** select karein.
3. Ek naya variable add karein:
   - **Key:** `RAZORPAY_TEST_KEY_SECRET`
   - **Value:** (Apni Razorpay Test Key Secret `rzp_test_secret_...` yahan paste karein)
4. Add aur Save par click karein.
5. *(⚠️ **Zaruri:** Vercel Dashboard par "Deployments" tab mein jaakar apni site ko ek baar **Redeploy** zaroor karein taaki backend variables update ho sakein).*

---

## Step 3: Admin Panel par Test Key update karna
1. Apni website ka Admin Panel open karein (`https://chessbirdform.vercel.app/admin.html`).
2. Log in karein aur scroll karke **"RAZORPAY API KEY"** section par jayein.
3. Wahan par apni **Test Key ID** (`rzp_test_...`) paste karein.
4. **Save Key** par click karein.

**Bas! 🎉** Ab aapka frontend aur backend dono hi secure tarike se Test Mode payments ko process karne ke liye ready hain. Aap cards/UPI ke dummy options se test payments complete kar sakte hain!
