// Apply the prepared menu photos after the base menu and live menu have been combined.
(function(){
  const paths = {
    "A1": "item-images/topping-42.webp",
    "A2": "item-images/topping-42.webp",
    "A3": "item-images/topping-42.webp",
    "A4": "item-images/topping-43.webp",
    "A5": "item-images/topping-44.webp",
    "A6": "item-images/topping-45.webp",
    "A7": "item-images/topping-46.webp",
    "A8": "item-images/topping-47.webp",
    "A9": "item-images/topping-48.webp",
    "A10": "item-images/topping-49.webp",
    "A11": "item-images/topping-50.webp",
    "A12": "item-images/topping-51.webp",
    "A13": "item-images/topping-52.webp",
    "A14": "item-images/topping-53.webp",
    "201": "combo-images/201-bake-grill-signature.webp",
    "202": "combo-images/202-veggie-bonanza.webp",
    "203": "combo-images/203-royal-chicken-combo.webp",
    "204": "combo-images/204-tandoori-raja.webp",
    "205": "combo-images/205-cheese-overload-combo.webp",
    "206": "combo-images/206-double-pizza-party.webp",
    "207": "combo-images/207-garden-feast.webp",
    "208": "combo-images/208-desi-dhamaka-feast.webp",
    "301": "combo-images/301-pizza-duo.webp",
    "302": "combo-images/302-chicken-party.webp",
    "303": "combo-images/303-veggie-blast.webp",
    "304": "combo-images/304-double-paneer.webp",
    "305": "combo-images/305-bbq-chicken-pair.webp",
    "306": "combo-images/306-peri-peri-pair.webp",
    "307": "combo-images/307-sausage-special.webp",
    "308": "combo-images/308-mix-fusion.webp",
    "401": "combo-images/401-student-special.webp",
    "402": "combo-images/402-chicken-crunch.webp",
    "403": "combo-images/403-cheese-king.webp",
    "404": "combo-images/404-keema-solo.webp",
    "405": "combo-images/405-paneer-treat.webp",
    "406": "combo-images/406-tandoori-solo.webp",
    "407": "combo-images/407-spicy-chicken-solo.webp",
    "408": "combo-images/408-the-corn-mix.webp",
    "Q1": "item-images/french-fries-menu.webp",
    "Q2": "item-images/french-fries-menu.webp",
    "Q3": "item-images/french-fries-menu.webp",
    "Q4": "item-images/chicken-pops-menu.webp",
    "Q5": "item-images/chicken-nuggets-menu.webp",
    "Q6": "item-images/crispy-wings-menu.webp",
    "Q7": "item-images/chicken-strips-menu.webp",
    "B1": "item-images/burger-b1.webp",
    "B2": "item-images/burger-b2.webp",
    "B3": "item-images/burger-b3.webp",
    "B4": "item-images/burger-b4.webp",
    "S1": "item-images/veg-sandwich-s1.webp",
    "S2": "item-images/veg-sandwich-s2.webp",
    "S3": "item-images/veg-sandwich-s3.webp",
    "S4": "item-images/veg-sandwich-s4.webp",
    "S5": "item-images/veg-sandwich-s5.webp",
    "S6": "item-images/veg-sandwich-s6.webp",
    "S7": "item-images/chicken-sandwich-s7.webp",
    "S8": "item-images/chicken-sandwich-s8.webp",
    "S9": "item-images/chicken-sandwich-s9.webp",
    "S10": "item-images/chicken-sandwich-s10.webp",
    "S11": "item-images/chicken-sandwich-s11.webp",
    "S12": "item-images/chicken-sandwich-s12.webp",
    "103": "pizza-images/cheese-overload-v2.webp",
    "104": "pizza-images/classic-margherita-v2.webp",
    "105": "pizza-images/mushroom_onion_tandoori.webp",
    "106": "pizza-images/onion_tomato_corn_capsicum_jalapeno.webp",
    "110": "pizza-images/onion_capsicum_corn_periperi.webp",
    "112": "pizza-images/green_chilli_chilli_flakes.webp",
    "115": "pizza-images/corn_capsicum_onion_tomato.webp",
    "116": "pizza-images/classic-paneer-menu.webp",
    "117": "pizza-images/tandoori-paneer.webp",
    "118": "pizza-images/paneer_onion_capsicum_periperi.webp",
    "119": "pizza-images/paneer-supreme.webp",
    "120": "pizza-images/paneer-corn-delight.webp",
    "121": "pizza-images/schezwan-paneer.webp",
    "122": "pizza-images/chicken-keema.webp",
    "124": "pizza-images/chicken-sausage.webp",
    "125": "pizza-images/tandoori-chicken-mayo.webp",
    "126": "pizza-images/chicken-peri-peri.webp",
    "127": "pizza-images/cheese-chicken-mix.webp",
    "128": "pizza-images/onion-chicken.webp",
    "129": "pizza-images/schezwan-chicken.webp",
    "130": "pizza-images/chicken-delight-mix.webp",
    "131": "pizza-images/garden-chicken-feast.webp",
    "132": "pizza-images/peri-veg-chicken.webp",
    "133": "pizza-images/chicken-tikka-olive.webp",
    "134": "pizza-images/corn-chicken-cheese.webp",
    "135": "pizza-images/spicy-mixed-fusion.webp",
    "136": "pizza-images/fiery-veg-chicken.webp",
    "137": "pizza-images/tomato-chicken-supreme.webp",
    "138": "pizza-images/corny-chicken-twist.webp",
    "139": "pizza-images/bbq-veg-chicken.webp",
    "140": "pizza-images/desi-fusion.webp",
    "141": "pizza-images/chicken-paradise.webp",
    "142": "pizza-images/corn_capsicum_chicken.webp",
  };

  function isLegacyMenuPhoto(id, live){
    const code = String(id);
    if (!Object.hasOwn(paths, code) || live.imageEdited || typeof live.image !== "string") return false;
    const oldAddonPhoto = /^A(?:[1-9]|1[0-4])$/.test(code)
      && [".jpg", ".webp"].some(ext => live.image === "item-images/" + code + ext);
    if (oldAddonPhoto) return true;
    try {
      const url = new URL(live.image);
      return url.origin === "https://firebasestorage.googleapis.com"
        && decodeURIComponent(url.pathname) === "/v0/b/bake-grill.firebasestorage.app/o/product-images/" + id + ".jpg"
        && !url.searchParams.has("v");
    } catch {
      return false;
    }
  }

  window.applyPizzaImageOverride = function(item, live){
    if (live && Object.hasOwn(live, "image") && !isLegacyMenuPhoto(item.id, live)) return item;
    if (String(item.id) === "142" && !/^chicken corn delight$/i.test(item.name.trim())) return item;
    if (!Object.prototype.hasOwnProperty.call(paths, item.id)) return item;
    return {...item, image: paths[item.id] + "?v=20261121"};
  };
})();
