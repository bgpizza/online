BAKE & GRILL PUSH NOTIFICATIONS

The customer PWA supports FCM web push subscription and background notifications.
The included Cloud Function sends a push notification whenever an order status changes.

DEPLOY (requires Firebase CLI and a Firebase billing-enabled project for Cloud Functions):
1. Put this functions folder at your Firebase project root.
2. Run: cd functions && npm install
3. From the Firebase project root run: firebase deploy --only functions

The customer site is already configured for Firebase project bake-grill.
The PWA requests notification permission from the customer using the "Enable Notifications" button.
After an order is created, its FCM token is associated with that Order ID.

If Firebase Console shows a Web Push certificate/public VAPID key for your project, you can optionally set it in notifications.js by changing:
getToken({serviceWorkerRegistration: reg})
to:
getToken({serviceWorkerRegistration: reg, vapidKey: 'YOUR_PUBLIC_VAPID_KEY'})
