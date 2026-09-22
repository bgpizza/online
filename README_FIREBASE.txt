BAKE & GRILL — FIREBASE READY VERSION
=====================================

Firebase project configured:
- Project ID: bake-grill
- Web App ID: 1:862216497656:web:407898417a86d7058f0e0d

FEATURES
--------
- Shared stock across all customer devices
- Real-time Master order board
- Real-time customer order status tracking by Order ID
- Firebase Email/Password Master login
- WhatsApp ordering and status messages
- All 102 menu entries
- Pizza Ekla Bite / Bondhu Bite / Family Bite shown together
- Delivery rules: 0–1 KM min ₹199, 1.1–3 KM min ₹299, 3.1–8 KM min ₹499, above 8 KM unavailable
- Delivery charge FREE

FIREBASE CONSOLE — DO THESE 3 THINGS
------------------------------------
1. Open Firebase Console and select the `bake-grill` project.
2. Build → Firestore Database → Create database. Then publish `firestore.rules`.
3. Build → Authentication → Sign-in method → Email/Password → Enable.
   Then create the Master admin email/password.

GITHUB PAGES
------------
Upload the files in this folder to your GitHub Pages repository.
Open `index.html` for the customer site.
Open `master.html` for the Master panel.

MASTER LOGIN
------------
There is no hard-coded Master password anymore. The Master login uses Firebase Authentication.
Use the exact email/password account you create in Firebase Authentication.

IMPORTANT
---------
The Firebase Web App config is safe to use in a browser; never upload a Firebase Admin SDK/service-account JSON file.
The current Firestore rules allow authenticated users to write stock/orders. For a single-owner Master account this is acceptable as a simple setup; if you later add staff accounts, use Firebase custom claims or a stricter admin allowlist.

WHATSAPP
--------
Current restaurant WhatsApp number in the site: +91 82402 66267.
