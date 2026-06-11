import * as params from "@params";

void params;

/*
 * The site ships a custom archive search page in layouts/_default/search.html.
 * PaperMod still asks Hugo to build js/fastsearch.js for layout="search";
 * this local asset shadows the theme script so the legacy #searchInput /
 * #searchResults wiring does not throw on the custom page.
 */
(function () {
  var legacyInput = document.getElementById("searchInput");
  var legacyResults = document.getElementById("searchResults");
  var legacyBox = document.getElementById("searchbox");

  if (!legacyInput || !legacyResults || !legacyBox) return;

  legacyInput.setAttribute("data-legacy-search-ready", "false");
})();
