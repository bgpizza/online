BAKE & GRILL — CUSTOMER ORDERING + MASTER PANEL (V26)

Customer site: https://bgpizza.github.io/online/
Master panel: https://bgpizza.github.io/online/master.html

This is the consolidated website package. It includes the menu, cart, delivery location picker, GPS-first/manual fallback, PIN/Post Office search, map pin confirmation, road-distance delivery rules, customer checkout without SMS OTP, order tracking, WhatsApp order sharing, and Master Panel order management.

DELIVERY RULES
- 0–1 KM: minimum order ₹199
- 1.1–3 KM: minimum order ₹299
- 3.1–8 KM: minimum order ₹499
- Above 8 KM: no delivery
- Delivery charge: FREE

LOCATION & MAP LINKS
Customers are prompted for GPS first. If permission is denied or GPS is unavailable, they can choose a PIN/Post Office or manually set a map pin. The exact confirmed map coordinates are stored internally with each new order. Master Panel cards and WhatsApp order sharing use a Google Maps link; latitude/longitude are not shown as plain text.

DEPLOY
1. Extract this ZIP.
2. Open the online-main folder.
3. Upload the CONTENTS of online-main into the repository's /online/ folder, preserving subfolders (assets, etc.). Do not upload an extra nested online-main directory.
4. Wait for GitHub Pages deployment, then test customer ordering and /online/master.html.

FIREBASE / GOOGLE REQUIREMENTS
- Firebase Authentication: enable Anonymous sign-in for customer checkout.
- Firebase Authentication: add bgpizza.github.io to Authorized domains.
- Firestore rules must permit the intended authenticated customer order writes and master admin reads/writes.
- Google Maps JavaScript API, Geocoding and Routes APIs must be enabled with billing and correct HTTP referrer restrictions for https://bgpizza.github.io/* .
- Do not publish admin credentials or unrestricted API keys.

TEST LIMITATION
JavaScript syntax and ZIP integrity checks are performed on this package. Live Firebase, Maps API, GPS, route distance, and WhatsApp behaviour must be tested after deployment on a real browser/device.


ANALYTICS UPDATE
- GA4 measurement ID: G-M2B7FN48S9
- Customer funnel events: view_item, add_to_cart, begin_checkout, purchase.
- Purchase fires only after successful Firestore order save.
- Customer personal details and delivery GPS are not sent to GA4.
- See GA4_TRACKING_SETUP.txt for verification and deployment notes.


SEO UPDATE (V26)
- A read-only food-category page is available at https://bakeandgrill.in/menu/. It has no product selection, item prices or add-to-cart controls.
- Homepage and menu-page copy provide crawlable business, food-category, location, contact and opening-hour details.
- Mandatory delivery-location verification is preserved. Customers cannot select/customise items or increase quantities until road distance is verified and the applicable minimum-order band is available.
- See LOCAL_SEO_SETUP.txt for the sitemap and Search Console steps.
