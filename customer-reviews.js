/* Bake & Grill customer review prompt.
   Shows only after a live order reaches DELIVERED. Private feedback is stored
   without customer name, phone, address or GPS coordinates. */
(function () {
  "use strict";
  const LEGACY_URL = "https://search.google.com/local/writereview?placeid=ChIJ827xCF1jAjoRURsEjhZtgEo";
  const DEFAULT_URL = "https://g.page/r/CVEbBI4WbYBKEAI/review";
  const DEFAULTS = { googleEnabled: true, feedbackEnabled: true, googleReviewUrl: DEFAULT_URL };
  let settingsCache = null;
  let settingsLoadedAt = 0;
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[ch]));
  async function getSettings(db) {
    if (settingsCache && Date.now() - settingsLoadedAt < 30000) return settingsCache;
    try {
      const snap = await db.collection("settings").doc("reviews").get();
      const value = snap.exists ? snap.data() || {} : {};
      const configuredUrl = String(value.googleReviewUrl || "").trim();
      settingsCache = {
        googleEnabled: value.googleEnabled !== false,
        feedbackEnabled: value.feedbackEnabled !== false,
        googleReviewUrl: /^https:\/\//i.test(configuredUrl) && configuredUrl !== LEGACY_URL ? configuredUrl : DEFAULT_URL
      };
    } catch (error) {
      console.warn("Could not read review settings; showing safe defaults.", error);
      settingsCache = { ...DEFAULTS };
    }
    settingsLoadedAt = Date.now();
    return settingsCache;
  }
  async function render(container, orderId, status, db) {
    if (!container) return;
    const cleanId = String(orderId || "").trim();
    if (String(status || "").toUpperCase() !== "DELIVERED" || !cleanId) {
      container.innerHTML = "";
      return;
    }
    container.innerHTML = '<div class="bg-customer-review-loading">Loading review options…</div>';
    const settings = await getSettings(db);
    if (String(container.dataset.orderId || "") !== cleanId) container.dataset.orderId = cleanId;
    const google = settings.googleEnabled
      ? '<a class="bg-customer-google-review" href="' + escapeHtml(settings.googleReviewUrl) + '" target="_blank" rel="noopener noreferrer" lang="bn">⭐ Google-এ রিভিউ লিখুন</a>'
      : "";
    const feedback = settings.feedbackEnabled
      ? `<details class="bg-private-feedback">
          <summary>💬 Send private feedback to Bake &amp; Grill</summary>
          <form class="bg-private-feedback-form" data-order-id="${escapeHtml(cleanId)}">
            <label for="bgReviewRating">Your rating</label>
            <div class="bg-review-stars" role="radiogroup" aria-label="Select a rating">
              ${[1,2,3,4,5].map(n => `<label><input type="radio" name="rating" value="${n}" required><span aria-hidden="true">${"★"}</span><small>${n}</small></label>`).join("")}
            </div>
            <label for="bgReviewComment">Your comments (optional)</label>
            <textarea id="bgReviewComment" name="comment" maxlength="500" rows="3" placeholder="Tell us what you liked or what we can improve…"></textarea>
            <button class="bg-feedback-submit" type="submit">Send private feedback</button>
            <p class="bg-feedback-message" aria-live="polite"></p>
          </form>
        </details>`
      : "";
    if (!google && !feedback) {
      container.innerHTML = "";
      return;
    }
    container.innerHTML = `<section class="bg-customer-review-card" aria-label="Review Bake and Grill">
      <div class="bg-review-thanks">🎉 Thank you for choosing Bake &amp; Grill!</div>
      <h3>How was your experience?</h3>
      <p>Your honest feedback helps our local team improve.</p>
      ${google}${feedback}
    </section>`;
    const form = container.querySelector(".bg-private-feedback-form");
    if (form) {
      form.addEventListener("submit", async event => {
        event.preventDefault();
        const submit = form.querySelector("button[type=submit]");
        const message = form.querySelector(".bg-feedback-message");
        const rating = Number(form.querySelector('input[name="rating"]:checked')?.value || 0);
        const comment = String(form.querySelector('textarea[name="comment"]')?.value || "").trim();
        if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
          message.textContent = "Please choose a star rating.";
          return;
        }
        submit.disabled = true;
        submit.textContent = "Sending…";
        try {
          await db.collection("customerReviews").doc(cleanId).set({
            orderId: cleanId,
            rating,
            comment,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          form.innerHTML = '<p class="bg-feedback-success">✅ Thank you! Your private feedback has been sent to Bake &amp; Grill.</p>';
        } catch (error) {
          console.error("Customer feedback submission failed:", error);
          message.textContent = error?.code === "already-exists"
            ? "Feedback for this order has already been sent."
            : "Could not send feedback. Please try again or contact the shop.";
          submit.disabled = false;
          submit.textContent = "Send private feedback";
        }
      });
    }
  }
  window.BGReviews = { render, invalidateSettings: () => { settingsCache = null; settingsLoadedAt = 0; } };
})();