// Apply the prepared menu photos after the base menu and live menu have been combined.
(function(){
  const paths = {
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
    "103": "pizza-images/cheese-overload.webp",
    "104": "pizza-images/classic-margherita.webp",
    "105": "pizza-images/mushroom_onion_tandoori.webp",
    "106": "pizza-images/onion_tomato_corn_capsicum_jalapeno.webp",
    "110": "pizza-images/onion_capsicum_corn_periperi.webp",
    "112": "pizza-images/green_chilli_chilli_flakes.webp",
    "115": "pizza-images/corn_capsicum_onion_tomato.webp",
    "116": "pizza-images/paneer_onion_capsicum_tomato.webp",
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

  window.applyPizzaImageOverride = function(item){
    if (String(item.id) === "142" && !/^chicken corn delight$/i.test(item.name.trim())) return item;
    if (!Object.prototype.hasOwnProperty.call(paths, item.id)) return item;
    return {...item, image: paths[item.id] + "?v=20261121"};
  };
})();
