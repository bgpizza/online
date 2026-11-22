window.BGOrderReference = function (id) {
  const full = String(id ?? "");
  return /^BG[0-9A-F]{16}$/i.test(full) ? "BG-" + full.slice(-6).toUpperCase() : full;
};
