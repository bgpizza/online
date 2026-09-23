BAKE & GRILL - FIREBASE ORDER SAVE FIX

1. This app saves customer orders in CLOUD FIRESTORE, not Realtime Database.
2. Firebase Console -> Firestore Database -> Rules: paste the contents of firestore.rules and Publish.
3. Firebase Authentication -> Sign-in method -> Email/Password should be enabled for Master/admin login.
4. The customer checkout now uses one Firestore batch commit for:
   - orders/{orderId}
   - publicStatuses/{orderId}
   This prevents a partial save.
5. Realtime Database rules are included only for completeness. They are NOT used by customer order checkout.
6. If an order still fails, open browser DevTools (F12) -> Console. The app now shows the Firebase error code in the alert.
