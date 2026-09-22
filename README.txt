# Bake & Grill WhatsApp Ordering Website

Ready-to-use static ordering site built from the uploaded Bake & Grill menu.

## Current delivery rule
- 0–1 KM: minimum order ₹199
- 1.1–3 KM: minimum order ₹299
- 3.1–8 KM: minimum order ₹499
- Above 8 KM: no delivery
- Delivery charge: FREE
- Location can be checked directly from the cart
- The order cannot proceed until the location is checked and the applicable minimum order is met

## Important
Browser location requires HTTPS when hosted online (localhost also works for testing).
The current store coordinate is configured in `app.js` as an approximate Sanjua point:
STORE={lat:22.392655,lon:88.224307,...}

For the most accurate delivery boundary, replace those two coordinates with the exact shop GPS coordinates.

## Change delivery rules
Edit:
const DELIVERY={maxKm:8,minOrder:0,charge:0};

## Run
1. Unzip.
2. Open index.html for a basic preview.
3. For location testing, serve the folder through localhost or deploy it to an HTTPS host.
4. Customers add items, tap Check My Location, then Order on WhatsApp.

The menu contains all items from the supplied 8-page menu, including pizzas, burgers, sandwiches, quick bites, combos and add-ons.
