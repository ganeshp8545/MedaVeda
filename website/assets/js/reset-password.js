(function () {
  var A = window.MedVedaAuth;
  var f = A.readFragment();
  // Kept in memory only, to hand the session to the app on request.
  var originalFragment = f.raw;
  var client = null;

  var form = document.getElementById("reset-form");
  var pw = document.getElementById("pw");
  var pw2 = document.getElementById("pw2");
  var submit = document.getElementById("submit-btn");
  var errBox = document.getElementById("form-error");

  var CHECKS = {
    length: function (p) { return p.length >= 8 && p.length <= 32; },
    lowercase: function (p) { return /[a-z]/.test(p); },
    uppercase: function (p) { return /[A-Z]/.test(p); },
    number: function (p) { return /\d/.test(p); },
    special: function (p) { return /[!@#$%^&*()_+\-=\[\]{};':"\\|<>?,./`~]/.test(p); }
  };
  var LABELS = ["Weak", "Weak", "Fair", "Good", "Strong"];
  var COLORS = ["#c0392b", "#c0392b", "#e0a857", "#3e8e7e", "#4c9a6b"];
  // Identical to mobile-app/src/validation/resetPasswordSchema.ts
  var POLICY = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|<>?,./`~]).{8,32}$/;
  var POLICY_MSG = "Password must be 8-32 characters and include an uppercase letter, a lowercase letter, a number, and a special character";

  function strength(p) {
    var passed = 0;
    Object.keys(CHECKS).forEach(function (k) {
      var ok = CHECKS[k](p);
      if (ok) passed++;
      var li = document.querySelector('[data-check="' + k + '"]');
      if (li) li.classList.toggle("ok", ok);
    });
    return p.length === 0 ? 0 : Math.max(0, passed - 1);
  }

  function openInApp() {
    var url = (A.cfg.appScheme || "ayurpulse://") + "reset-password" + (originalFragment ? "#" + originalFragment : "");
    location.href = url;
  }

  function wireToggles() {
    document.querySelectorAll("[data-toggle]").forEach(function (b) {
      b.addEventListener("click", function () {
        var input = document.getElementById(b.getAttribute("data-toggle"));
        var show = input.type === "password";
        input.type = show ? "text" : "password";
        b.textContent = show ? "Hide" : "Show";
        b.setAttribute("aria-pressed", show ? "true" : "false");
      });
    });
  }

  function fail(msg, allowInApp) {
    A.setText("error-msg", msg);
    var inApp = document.getElementById("error-inapp");
    if (inApp) inApp.classList.toggle("hidden", !allowInApp);
    A.show("state-error");
  }

  function init() {
    var appBtns = document.querySelectorAll("[data-open-app-with-token]");
    appBtns.forEach(function (b) { b.addEventListener("click", openInApp); });

    if (f.error || f.errorCode) { fail(A.friendlyError(f), false); return; }
    if (f.type !== "recovery" || !f.accessToken || !f.refreshToken) { A.show("state-empty"); return; }

    client = A.newClient();
    if (!client) { fail("We couldn't load the secure password form. Check your connection and reload, or reset inside the app.", true); return; }

    A.show("state-loading");
    client.auth.setSession({ access_token: f.accessToken, refresh_token: f.refreshToken })
      .then(function (res) {
        if (res.error || !res.data || !res.data.session) {
          fail("This reset link is invalid or has expired. Request a new one from the app.", false);
          originalFragment = "";
          return;
        }
        f.accessToken = f.refreshToken = null;
        A.show("state-form");
        pw.focus();
      })
      .catch(function () {
        fail("We couldn't reach the server. Check your internet connection and reload this page, or reset inside the app.", true);
      });
  }

  wireToggles();

  pw.addEventListener("input", function () {
    var s = strength(pw.value);
    var bar = document.getElementById("strength-bar");
    bar.style.width = (s / 4 * 100) + "%";
    bar.style.background = COLORS[s];
    document.getElementById("strength-label").textContent = pw.value ? "Strength: " + LABELS[s] : "";
  });
  strength("");

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    errBox.textContent = "";
    if (!pw.value) { errBox.textContent = "New password is required"; pw.focus(); return; }
    if (!POLICY.test(pw.value)) { errBox.textContent = POLICY_MSG; pw.focus(); return; }
    if (!pw2.value) { errBox.textContent = "Confirm your new password"; pw2.focus(); return; }
    if (pw.value !== pw2.value) { errBox.textContent = "Passwords do not match"; pw2.focus(); return; }

    submit.disabled = true; submit.textContent = "Saving…";
    client.auth.updateUser({ password: pw.value })
      .then(function (res) {
        if (res.error) {
          var m = (res.error.message || "").toLowerCase();
          if (m.indexOf("same") !== -1) errBox.textContent = "Your new password must be different from your old one.";
          else if (m.indexOf("weak") !== -1 || m.indexOf("password") !== -1) errBox.textContent = res.error.message;
          else if (m.indexOf("session") !== -1 || m.indexOf("jwt") !== -1 || m.indexOf("expired") !== -1) { fail("Your reset session has expired. Request a new link from the app.", false); return; }
          else errBox.textContent = "We couldn't change your password. Please try again.";
          submit.disabled = false; submit.textContent = "Change password";
          return;
        }
        pw.value = pw2.value = "";
        return client.auth.signOut().catch(function () {}).then(function () {
          originalFragment = "";
          A.show("state-done");
        });
      })
      .catch(function () {
        errBox.textContent = "Network error. Check your connection and try again.";
        submit.disabled = false; submit.textContent = "Change password";
      });
  });

  init();
})();
