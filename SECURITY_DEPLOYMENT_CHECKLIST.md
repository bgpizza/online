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

## Cloud Storage rules deployment
Firebase Storage API was enabled and the Storage rules deployment workflow completed successfully on 19 November 2026 (run attempt 2). Product image access is restricted by storage.rules to the allow-listed Master UID; uploads are limited to image/jpeg, image/png, image/webp and under 5 MB.


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
## API key audit specific to this repository
- There are two distinct browser keys: the Firebase Web config key in firebase-config.js and a Google Maps key in app.js. Do not copy one key's restrictions to the other.
- The Firebase Web config key is public by design. Firebase's guidance is to apply Firebase API restrictions and rely on Authentication, Security Rules and App Check for authorization.
- The Maps key is used to load the Maps JavaScript API and its Geocoder. The unused Places library parameter has been removed from the Maps script URL.
- Restrict the Maps key by Websites (HTTP referrers) to the actual production hosts only: https://bakeandgrill.in and https://bakeandgrill.in/* . Add https://www.bakeandgrill.in and https://www.bakeandgrill.in/* only if that hostname serves the site. Add the GitHub Pages hostname only if it is still actively used by customers/admins.
- Restrict the Maps key to Maps JavaScript API and Geocoding API only; the repository has no remaining google.maps.places references. The Geocoding service requires Geocoding API to be enabled.
- Do not add Maps JavaScript / Geocoding APIs to the Firebase Web config key; keep the keys separate.
- After saving restrictions, test location address resolution and checkout on the real custom domain before removing any temporary referrers.

## Storage bucket setup is still a billing decision
The Storage API is enabled, but the Storage deployment workflow reported that no Firebase Storage bucket has been provisioned. Firebase requires the Blaze pay-as-you-go plan to create/use a new default bucket. Do not proceed to Get started / billing upgrade without the project owner's explicit acceptance of pay-as-you-go billing. Once the owner confirms and provisions the bucket, run the Deploy Firebase Storage Rules (Bake & Grill) workflow again.

## Further code audit completed on 19 November 2026
- The separate track.html page previously loaded Firestore without the App Check compat SDK and Auth compat SDK. It now loads Firebase App, App Check, Firestore, Auth and Messaging in the correct order, then the shared config/init.
- Customer profile rules now constrain profile writes to the signed-in phone account, require the verified phone number to match, limit saved addresses, and validate delivery coordinates/address data.
- Master order updates are now limited to status and ETA/history fields used by the Master UI.
- Customer and Master page script cache versions were refreshed after the App Check/service-worker changes.
- Firestore App Check must remain in Monitoring until current customer and tracking pages produce a sustained high proportion of verified requests. A past 7-day/24-hour graph can contain historical traffic from pre-App-Check clients.

## Current Maps key status and action
The Maps browser key is still present in app.js and must be rotated because it was exposed in a public client file and previously shared in chat. Create a new key restricted to the actual production HTTP referrer and only Maps JavaScript API, Routes API and Geocoding API; test before replacing the old key. See GOOGLE_MAPS_SETUP.txt. The current app.js code no longer uses Places API, so do not add Places to this key unless code later needs it.

## Firebase Web API key
The Firebase Web API key in firebase-config.js is public by design. Keep it restricted to Firebase-related APIs only; Firebase documentation says authorization is provided by Firebase Auth, Security Rules and App Check, not by concealing this key. Do not combine it with the Google Maps browser key.

## Hosting response headers
This site is published via GitHub Pages. Arbitrary custom response headers cannot be applied merely by adding a repository file. To deploy HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, X-Frame-Options and a tested CSP, route the domain through Cloudflare with proxied DNS and configure Response Header Transform Rules, or migrate to Firebase Hosting and add headers there. Do not deploy a guessed CSP; test Firebase Auth/OTP, Maps, reCAPTCHA, FCM and Analytics first.
