// Bake & Grill pizza image overrides. Activate only after uploading the referenced WebP files.
(function(){
  if (!Array.isArray(window.MENU_ITEMS)) return;
  const paths = {"105":"pizza-images/mushroom_onion_tandoori.webp","106":"pizza-images/onion_tomato_corn_capsicum_jalapeno.webp","110":"pizza-images/onion_capsicum_corn_periperi.webp","112":"pizza-images/green_chilli_chilli_flakes.webp","115":"pizza-images/corn_capsicum_onion_tomato.webp","116":"pizza-images/paneer_onion_capsicum_tomato.webp","118":"pizza-images/paneer_onion_capsicum_periperi.webp","142":"pizza-images/corn_capsicum_chicken.webp"};
  window.MENU_ITEMS.forEach(function(item){
    if (Object.prototype.hasOwnProperty.call(paths, String(item.id))) item.image = paths[String(item.id)] + '?v=20261121';
  });
})();
