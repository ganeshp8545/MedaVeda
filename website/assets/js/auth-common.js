// Shared helpers for the auth pages. Tokens are read once from the URL fragment,
// removed from the address bar, kept in memory only, and never logged or stored.
window.MedVedaAuth = (function () {
  var cfg = window.MEDVEDA_CONFIG || {};

  function readFragment() {
    var raw = location.hash ? location.hash.slice(1) : "";
    var params = new URLSearchParams(raw);
    // Clear tokens from the address bar / history entry immediately.
    if (raw) history.replaceState(null, "", location.pathname + location.search);
    return {
      raw: raw,
      type: params.get("type"),
      accessToken: params.get("access_token"),
      refreshToken: params.get("refresh_token"),
      error: params.get("error"),
      errorCode: params.get("error_code"),
      errorDescription: params.get("error_description")
    };
  }

  function friendlyError(f) {
    var code = (f.errorCode || "").toLowerCase();
    var desc = (f.errorDescription || "").toLowerCase();
    if (code === "otp_expired" || desc.indexOf("expired") !== -1 || desc.indexOf("invalid") !== -1) {
      return "This link has expired or was already used. Request a new one from the app.";
    }
    if (code === "access_denied") return "This link is no longer valid. Request a new one from the app.";
    return "We couldn't verify this link. Request a new one from the app and try again.";
  }

  function show(id) {
    var ids = ["state-loading", "state-success", "state-error", "state-empty", "state-form", "state-done"];
    ids.forEach(function (x) {
      var el = document.getElementById(x);
      if (el) el.classList.toggle("hidden", x !== id);
    });
    var t = document.getElementById(id);
    if (t) { t.setAttribute("tabindex", "-1"); t.focus({ preventScroll: true }); }
  }

  function setText(id, text) { var el = document.getElementById(id); if (el) el.textContent = text; }

  function newClient() {
    if (!window.supabase || !cfg.supabaseUrl) return null;
    return window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
  }

  return { cfg: cfg, readFragment: readFragment, friendlyError: friendlyError, show: show, setText: setText, newClient: newClient };
})();
