BAKE & GRILL FIREBASE - GITHUB PAGES FIX
========================================

The previous GitHub Pages screen showed:
"Firebase is not configured. Edit firebase-config.js first."

This version fixes that by putting a fallback Firebase Web App config inside
firebase-init.js as well as keeping firebase-config.js. It also adds a cache-
busting version to local JS/CSS references.

IMPORTANT GITHUB UPLOAD
-----------------------
Upload ALL files in this folder into the SAME GitHub Pages folder where
master.html and index.html are located. Do not upload only master.html.

If your URL is:
https://bgpizza.github.io/online/master.html
then these files must be in the /online/ folder:
- master.html
- index.html
- firebase-init.js
- firebase-config.js
- master.js
- app.js
- menu-data.js
- styles.css
- firestore.rules (for Firebase Console only)

After replacing files, open the page with Ctrl+F5.

FIREBASE CONSOLE
----------------
1. Enable Authentication -> Sign-in method -> Email/Password.
2. Create the Master user under Authentication -> Users.
3. Create Firestore Database.
4. Publish firestore.rules from this package.

The Firebase Web App configuration is intended for browser use. Never put a
Firebase Admin SDK/service-account private key into the website.
