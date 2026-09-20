(function () {
  var A = window.MedVedaAuth;
  var f = A.readFragment();

  if (f.error || f.errorCode) {
    A.setText("error-msg", A.friendlyError(f));
    A.show("state-error");
    return;
  }
  if ((f.type === "signup" || f.type === "email_change" || f.type === "magiclink") && f.accessToken) {
    var client = A.newClient();
    var token = f.accessToken;
    // Show success right away; enrich with the verified email if Supabase answers.
    A.show("state-success");
    if (client) {
      client.auth.getUser(token).then(function (res) {
        var email = res && res.data && res.data.user && res.data.user.email;
        if (email) A.setText("verified-email", email);
      }).catch(function () { /* neutral success is fine */ });
    }
    token = null;
    return;
  }
  A.show("state-empty");
})();
