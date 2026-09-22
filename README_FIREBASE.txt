BAKE & GRILL — FIREBASE VERSION
================================

WHAT THIS VERSION DOES
- Shared stock across all customer devices
- Shared live order board for the Master page
- Real-time order status changes
- Public order-status tracking by Order ID (status only; no customer address/phone is exposed)
- WhatsApp ordering remains enabled
- All previous menu, 3-size pizza, delivery-distance and minimum-order rules remain

1) CREATE FIREBASE PROJECT
--------------------------
Open Firebase Console: https://console.firebase.google.com/
Create a project named something like bake-grill.

2) ADD A WEB APP
----------------
Firebase Console → Project settings → Your apps → Add web app.
Copy the Firebase config object.
Open firebase-config.js and replace every PASTE_ value.

3) ENABLE FIRESTORE
-------------------
Firebase Console → Build → Firestore Database → Create database.
Then publish the rules from firestore.rules.

4) ENABLE ADMIN LOGIN
---------------------
Firebase Console → Build → Authentication → Get started → Sign-in method → Email/Password → Enable.
Create your Master admin user there, for example:
Email: your-admin-email
Password: your strong password

The Master page now uses Firebase Authentication instead of the old hard-coded browser password.

5) HOSTING
----------
This is still a static website and works on GitHub Pages.
Upload all files in this folder to your repository.
Make sure firebase-config.js is included.

6) IMPORTANT SECURITY
---------------------
Do not put a Firebase Admin SDK/service-account JSON file in this website.
Only the normal Firebase Web App config belongs in firebase-config.js.
The Firestore rules protect writes/reads for the Master side.

7) OPTIONAL CUSTOM DOMAIN
-------------------------
After GitHub Pages is working, you can connect your own domain.

8) WHATSAPP
-----------
Current WhatsApp number in the site: +91 82402 66267.
Change WA_NUMBER in app.js if needed.
