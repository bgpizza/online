# Bake & Grill – Security and Privacy Deployment Checklist
Updated: 19 November 2026
Repository: https://github.com/bgpizza/online

## What this branch prepares
- Firestore rules: Master UID allow-list, phone-authenticated customer access, private order records, owner-only tracking, and limited public settings.
- Cloud Storage rules: product image upload/replacement/delete restricted to the allow-listed Master UID; image-only MIME types and 5 MB limit.
- Realtime Database rules: legacy default rules deny all reads/writes; the separately included delivery rules restrict user/location access.
- Firebase deploy workflow: Firestore and Storage rules deploy from main.
- Client: customer tracking loads map link from signed-in customer's own private order document; tracking docs contain status/ETA only.
- Master client and push-test callable use the same explicit Master UID.
- Privacy policy at /privacy.html, linked from order and menu pages.

## Required console setup (not performed from repository code)
### 1. Firebase App Check
1. Open Firebase Console → project bake-grill → Security → App Check.
2. Register the Web app with reCAPTCHA v3 or reCAPTCHA Enterprise. Register bakeandgrill.in; include www only if that hostname is used.
3. Add the resulting public site key to BG_APPCHECK_SITE_KEY in firebase-config.js on this branch. Register the matching reCAPTCHA secret in Firebase Console; never put the secret in browser code.
4. The Firebase App Check compat SDK is loaded before Firebase initialization. Deploy this client change before enforcing App Check.
5. Inspect App Check request metrics and test OTP, checkout, account history, tracking, push registration, Master panel and image upload.
6. Only then enable Firestore and Storage enforcement. Evaluate Authentication/Cloud Functions separately after confirming support and traffic metrics.

### 2. Google Cloud API key restrictions
1. Open Google Cloud Console → APIs & Services → Credentials → select the browser key in Firebase Web config.
2. Confirm all APIs used by the current live client and Firebase features before restricting.
3. Set Application restrictions → Websites (HTTP referrers), including only active hosts from the following: https://bakeandgrill.in/* ; https://www.bakeandgrill.in/* ; https://bgpizza.github.io/online/* ; https://*.github.io/* . Remove unused hosts after testing.
4. Set API restrictions to only APIs observed in use. Likely Firebase services include Identity Toolkit API / Firebase Authentication, Cloud Firestore API, Cloud Storage for Firebase API, Firebase Installations API and FCM registration endpoints. Add Maps JavaScript API, Places API, Geocoding API or Routes API only if the key is actually used for them.
5. Save and test OTP, ordering, maps, stock updates and push. If something fails, check the exact API/referrer logs before broadening restrictions.
6. A browser Firebase API key is not a password. Security relies on Firebase Auth, Security Rules, App Check and API restrictions.

## HTTP security headers and hosting limitation
The repository is a static GitHub Pages site (CNAME points to the custom domain). GitHub Pages does not provide arbitrary per-site HTTP response headers configured from repository files. A _headers file or Firebase Hosting configuration will not be applied by GitHub Pages.
Recommended route: configure Cloudflare DNS/proxy in front of GitHub Pages and add Response Header Transform Rules, or migrate hosting to Firebase Hosting and configure headers there.
Suggested headers, after validating all site behavior:
- Strict-Transport-Security: max-age=31536000; includeSubDomains (only after confirming every subdomain uses HTTPS; preload only after careful review).
- X-Content-Type-Options: nosniff
- Referrer-Policy: strict-origin-when-cross-origin
- Permissions-Policy: geolocation=(self), camera=(), microphone=()
- X-Frame-Options: DENY (or use CSP frame-ancestors).
- Content-Security-Policy: build and test a complete allow-list for Firebase, Maps, reCAPTCHA, FCM, Analytics and required image/font/CDN origins before enforcing. Do not deploy a guessed restrictive policy; it can break checkout and OTP.

## Realtime Database deployment
The customer ordering flow uses Firestore; database.rules.json now denies all access. If Realtime Database is actively used for delivery/users, publish realtime-database.rules.json separately in Firebase Console → Realtime Database → Rules, then test delivery features. Do not publish the deny-all rules if a live feature depends on root RTDB access.

## Post-deploy acceptance test
- Customer SMS OTP send and verify.
- Save customer profile and own address.
- Place order; Firestore writes to orders and publicStatuses succeed.
- Track only own order; own map link visible; another account cannot read it.
- Cancel own order before preparation; another account cannot cancel it.
- Submit one feedback entry after delivery.
- Master UID can sign in; other email/password users cannot access Master.
- Master status changes, menu/stock edits and product image upload/delete succeed.
- Customer and Master push notifications still work.
- App Check metrics show legitimate traffic before enforcement.

## Rollback safety
Tracking documents are now private. Older customer site pages may fail to read them. Deploy customer site and rules together, and keep the previous GitHub commit available for rollback. Do not enable App Check enforcement until all active pages/hosts have been updated and tested.