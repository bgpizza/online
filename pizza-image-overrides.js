// Apply the prepared photos after the base menu and live menu have been combined.
(function(){
  const paths = {
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
    "131": "pizza-images/garden-chicken-feast.webp",
    "142": "pizza-images/corn_capsicum_chicken.webp",
  };

  window.applyPizzaImageOverride = function(item){
    if (String(item.id) === "142" && !/^chicken corn delight$/i.test(item.name.trim())) return item;
    if (!Object.prototype.hasOwnProperty.call(paths, item.id)) return item;
    return {...item, image: paths[item.id] + "?v=20261121"};
  };
})();
