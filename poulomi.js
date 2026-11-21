(() => {
  const form = document.getElementById("poulomiForm");
  if (!form) return;
  const box = document.getElementById("poulomiConversation");
  const input = document.getElementById("poulomiQuery");
  const mic = document.getElementById("poulomiMic");
  const listen = document.getElementById("poulomiListen");
  const notice = document.getElementById("poulomiNotice");
  const maps = document.querySelector(".directions-link").href;
  const whatsapp = document.querySelector(".contact-whatsapp").href;
  let lastWords = [];
  let lastReply = "";

  function element(tag, value, className = "") {
    const node = document.createElement(tag);
    node.textContent = value;
    if (className) node.className = className;
    return node;
  }

  function reply(message, actions = [], results = []) {
    const card = element("div", "", "poulomi-reply");
    card.append(element("div", message));
    const list = element("ul", "", "poulomi-results");
    const summary = [];
    for (const { item, price, size } of results) {
      const row = element("li", "");
      const line = item.name + " · " + money(price) + (size ? " · " + size : "");
      row.append(element("span", line));
      const view = element("button", "Choose");
      view.type = "button";
      view.onclick = () => openCustomize(item.id);
      row.append(view);
      list.append(row);
      summary.push(line);
    }
    if (results.length) card.append(list);
    const links = element("div", "", "poulomi-actions");
    for (const [label, target] of actions) {
      const button = element(typeof target === "string" ? "a" : "button", label);
      if (typeof target === "string") button.href = target;
      else { button.type = "button"; button.onclick = target; }
      links.append(button);
    }
    if (actions.length) card.append(links);
    box.append(card);
    box.scrollTop = box.scrollHeight;
    lastReply = [message, ...summary].join(". ");
    listen.hidden = !("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window);
  }

  function ask(question) {
    question = question.trim();
    if (!question) return;
    box.append(element("p", question, "poulomi-question"));
    input.value = "";
    notice.textContent = "";
    const bn = /[\u0980-\u09ff]/.test(question);
    const say = (en, bnText) => bn ? bnText : en;
    const hundreds = {one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9};
    const q = question.toLowerCase()
      .replace(/[০-৯]/g, d => String("০১২৩৪৫৬৭৮৯".indexOf(d)))
      .replace(/\b(one|two|three|four|five|six|seven|eight|nine) hundred\b/g, (_, word) => String(hundreds[word] * 100))
      .replace(/দুশো|দুইশো/g, "200").replace(/তিনশো/g, "300").replace(/চারশো/g, "400").replace(/পাঁচশো/g, "500");
    if (/allerg|অ্যালার্জি/.test(q)) {
      reply(say("Please confirm ingredients and cross-contact directly with the shop before ordering.", "অ্যালার্জি থাকলে অর্ডারের আগে উপকরণ ও রান্নার বিষয়ে দোকানে কথা বলুন।"), [["Call the shop","tel:+918240266267"],["WhatsApp",whatsapp]]);
    } else if (/track|order status|order (kothay|kothai|where)|অর্ডার.*(কোথায়|কোথায়|স্ট্যাটাস)/.test(q)) {
      reply(say("Open order tracking to check your latest order on this device.", "এই ডিভাইসে আপনার সর্বশেষ অর্ডারের স্ট্যাটাস দেখতে ট্র্যাকিং খুলুন।"), [["Open tracking","#trackSection"]]);
    } else if (/delivery|ডেলিভারি|লোকেশন|location|minimum order/.test(q)) {
      const rule = customerLocation && Number.isFinite(distanceKm) ? getDeliveryRule(distanceKm) : null;
      const text = !deliveryEnabled ? say("Delivery is currently paused.", "ডেলিভারি এখন বন্ধ।") : rule
        ? say(distanceKm.toFixed(1) + " km by road. Minimum order " + money(rule.minOrder) + ". Delivery charge " + (rule.charge ? money(rule.charge) : "free") + ".", "রোড দূরত্ব " + distanceKm.toFixed(1) + " কিমি। ন্যূনতম অর্ডার " + money(rule.minOrder) + "। ডেলিভারি চার্জ " + (rule.charge ? money(rule.charge) : "ফ্রি") + "।")
        : say("Check your location for road distance and the minimum order. We deliver up to 8 km by road.", "রোড দূরত্ব ও ন্যূনতম অর্ডার দেখতে লোকেশন চেক করুন। আমরা রাস্তা দিয়ে ৮ কিমি পর্যন্ত ডেলিভারি করি।");
      reply(text, [["Check location", () => document.getElementById("locateBtn").click()]]);
    } else if (/shop|direction|timing|hour|address|map|দোকান|ঠিকানা|খোলা|khol|kothay/.test(q)) {
      reply(say("Bake & Grill is on Thakurpukur–Bakhrahat Road, Sanjua, Bakhrahat, West Bengal 743377. Open daily from 10 AM to 10 PM.", "Bake & Grill, ঠাকুরপুকুর–বাখরাহাট রোড, সাঁজুয়া, পশ্চিমবঙ্গ ৭৪৩৩৭৭। প্রতিদিন সকাল ১০টা থেকে রাত ১০টা।"), [["Google Maps",maps],["Call","tel:+918240266267"],["WhatsApp",whatsapp]]);
    } else if (/whatsapp|phone|contact|ফোন|হোয়াটসঅ্যাপ|যোগাযোগ/.test(q)) {
      reply("Bake & Grill · +91 82402 66267", [["Call","tel:+918240266267"],["WhatsApp",whatsapp]]);
    } else if (/review|রিভিউ|social|facebook|instagram/.test(q)) {
      reply(say("Find Bake & Grill’s review link and social pages here.", "Bake & Grill-এর রিভিউ লিঙ্ক ও সোশ্যাল পেজ।"), [["Google review","https://g.page/r/CVEbBI4WbYBKEAI/review"],["Social pages","#contactUs"]]);
    } else if (/checkout|cart|how to order|অর্ডার (করব|করবো|কীভাবে|কিভাবে)|কার্ট/.test(q)) {
      reply(say("Choose an item, select your size and toppings, then open your cart to checkout.", "খাবার, সাইজ ও টপিং বেছে কার্ট খুলে চেকআউট করুন।"), [["Browse menu","#categories"],["Open cart",() => document.getElementById("openCart").click()]]);
    } else {
      const budget = Number(q.match(/(?:₹\s*|(?:under|below|within|budget)\s*(?:rs\.?\s*)?)(\d{2,5})/)?.[1] || q.match(/(\d{2,5})\s*(?:er moddhe|takar|টাকার|টাকা|এর মধ্যে|মধ্যে)/)?.[1] || 0);
      const normalized = q.replace(/চিকেন|মুরগি/g," chicken ").replace(/পনির|পনীর|panner/g," paneer ").replace(/পিজ্জা|পিৎজা|পিত্জা/g," pizza ").replace(/ঝাল|jhal/g," spicy ").replace(/ভেজ|সবজি/g," veg ").replace(/বার্গার/g," burger ").replace(/কম্বো/g," combo ").replace(/চিজ/g," cheese ");
      const ignored = new Set("a an i me my for show see is are can you with the to of on ekta ta khabar lagbe show want please find suggest give under within below budget rupees rs er moddhe dao dekhao taka takar want some something people person jon dekhte chai price prices bhalo".split(" "));
      let words = (normalized.match(/[a-z]+/g) || []).filter(word => !ignored.has(word));
      if (!words.length && budget) words = lastWords;
      if (words.length) lastWords = words;
      if (!words.length && !budget) {
        reply(say("Try a menu item or a budget, or ask about delivery and order tracking.", "খাবারের নাম বা বাজেট লিখুন। ডেলিভারি ও অর্ডার ট্র্যাকিং নিয়েও প্রশ্ন করতে পারেন।"), [["Browse menu","#categories"],["WhatsApp",whatsapp]]);
        return;
      }
      const results = [];
      for (const item of getMenuItems()) {
        if (item.category === "Add-ons" || !isInStock(item.id)) continue;
        const searchable = [item.name,item.category,item.description].join(" ").toLowerCase();
        const tokens = searchable.match(/[a-z]+/g) || [];
        if (!words.every(word => tokens.some(token => token === word || token === word + "s") || (word === "spicy" && /chilli|chili|peri peri|schezwan/.test(searchable)))) continue;
        const options = (item.prices ? Object.entries(item.prices) : [["",item.price]])
          .map(([size,amount]) => ({size,price:Number(amount)}))
          .filter(option => Number.isFinite(option.price) && option.price > 0 && (!budget || option.price <= budget))
          .sort((a,b) => a.price-b.price);
        if (options.length) results.push({item,...options[0]});
      }
      results.sort((a,b) => a.price-b.price);
      reply(results.length
        ? say("Here are available matches from the menu.", "মেনুতে এখন পাওয়া যাচ্ছে এমন কয়েকটা অপশন।")
        : say("I couldn’t find an available match. Try a shorter search or a different budget.", "মিল আছে এমন খাবার খুঁজে পাইনি। কম শব্দ বা অন্য বাজেট দিয়ে দেখুন।"), [["Browse menu","#categories"]],results.slice(0,5));
    }
  }

  form.addEventListener("submit", event => { event.preventDefault(); ask(input.value); });
  document.querySelectorAll(".poulomi-prompts [data-ask]").forEach(button => {
    button.onclick = () => ask(button.dataset.ask);
  });
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (Recognition) {
    mic.hidden = false;
    mic.onclick = () => {
      const recognition = new Recognition();
      recognition.lang = navigator.language?.startsWith("bn") ? "bn-IN" : "en-IN";
      recognition.onresult = event => {
        input.value = event.results[0][0].transcript;
        notice.textContent = "Check the transcript, then press Send.";
        input.focus();
      };
      recognition.onerror = () => { notice.textContent = "Voice input unavailable. You can type your question."; };
      recognition.onend = () => { mic.disabled = false; };
      try { recognition.start(); mic.disabled = true; notice.textContent = "Listening…"; }
      catch { notice.textContent = "Voice input unavailable. You can type your question."; }
    };
  }
  listen.onclick = () => {
    const utterance = new SpeechSynthesisUtterance(lastReply);
    utterance.lang = /[\u0980-\u09ff]/.test(lastReply) ? "bn-IN" : "en-IN";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };
})();
