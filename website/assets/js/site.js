// Shared behaviour: mobile menu + home-page auth-fragment redirect. No tracking, no storage.
(function () {
  var btn = document.getElementById("menu-btn");
  var nav = document.getElementById("site-nav");
  if (btn && nav) {
    btn.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      btn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && nav.classList.contains("open")) {
        nav.classList.remove("open");
        btn.setAttribute("aria-expanded", "false");
        btn.focus();
      }
    });
  }

  // Home-page redirect: Supabase's signup / recovery links land on the Site URL
  // (https://medveda.in/) with tokens in the URL fragment. Forward them,
  // fragment intact, to the right page.
  var p = location.pathname.replace(/\/index\.html$/, "/");
  if (p === "/" && location.hash.length > 1) {
    var q = new URLSearchParams(location.hash.slice(1));
    var type = q.get("type");
    var target = null;
    if (type === "recovery") target = "/reset-password";
    else if (type === "signup" || type === "email_change" || type === "magiclink" || q.get("error") || q.get("error_code")) target = "/account-verified";
    if (target) location.replace(target + location.hash);
  }
})();
