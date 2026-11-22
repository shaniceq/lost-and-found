(function () {
  var form = document.getElementById("auth-form");
  var errorBox = document.getElementById("auth-error");
  var submit = document.getElementById("auth-submit");
  var title = document.getElementById("auth-title");
  var lead = document.getElementById("auth-lead");
  var nameField = document.getElementById("field-name");
  var nameInput = document.getElementById("name");
  var emailInput = document.getElementById("email");
  var passwordInput = document.getElementById("password");
  var passwordHint = document.getElementById("password-hint");
  var toggle = document.getElementById("toggle-password");
  var switchLine = document.getElementById("auth-switch");
  var tabs = document.querySelectorAll(".auth-tabs [data-mode]");
  var mode = "login";

  var COPY = {
    login: {
      title: "Welcome back", lead: "Log in to open your saved documents.", button: "Log in",
      pageTitle: "DocuAI",
      switchHtml: 'New to DocuAI? <button type="button" class="link-button" data-mode="signup">Create an account</button>',
      autocomplete: "current-password"
    },
    signup: {
      title: "Create your account", lead: "Your documents are saved to your account so you can come back to them.", button: "Create account",
      pageTitle: "DocuAI",
      switchHtml: 'Already have an account? <button type="button" class="link-button" data-mode="login">Log in</button>',
      autocomplete: "new-password"
    }
  };

  function showError(message, field) {
    errorBox.textContent = message;
    errorBox.hidden = false;
    clearFieldErrors();
    var target = field === "name" ? nameInput : field === "email" ? emailInput : field === "password" ? passwordInput : null;
    if (target) {
      target.setAttribute("aria-invalid", "true");
      var hint=document.getElementById(target.id+'-error');hint.textContent=message;hint.hidden=false;
      target.setAttribute('aria-describedby',target.id+'-error');target.focus();
    }
  }

  function clearFieldErrors() {
    [nameInput,emailInput,passwordInput].forEach(function(el){
      el.removeAttribute('aria-invalid');el.removeAttribute('aria-describedby');
      document.getElementById(el.id+'-error').hidden=true;
    });
    if(mode==='signup')passwordInput.setAttribute('aria-describedby','password-hint');
  }

  function clearError() {
    errorBox.hidden = true;
    errorBox.textContent = "";
    clearFieldErrors();
  }

  function resetFields() {
    form.reset();
    passwordInput.type = "password";
    toggle.setAttribute("aria-label", "Show password");
    toggle.setAttribute("aria-pressed", "false");
  }

  function setMode(next) {
    var changed = next !== mode;
    mode = next;
    if (changed) resetFields();
    var c = COPY[mode];
    title.textContent = c.title;
    lead.textContent = c.lead;
    submit.textContent = c.button;
    document.title = c.pageTitle;
    switchLine.innerHTML = c.switchHtml;
    nameField.hidden = mode !== "signup";
    passwordHint.hidden = mode !== "signup";
    passwordInput.setAttribute("autocomplete", c.autocomplete);
    nameInput.required=mode==='signup';
    tabs.forEach(function (t) { t.setAttribute("aria-pressed", String(t.dataset.mode === mode)); });
    clearError();
  }

  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-mode]");
    if (el && !submit.disabled) { setMode(el.dataset.mode); (mode === "signup" ? nameInput : emailInput).focus(); }
  });

  toggle.addEventListener("click", function () {
    var show = passwordInput.type === "password";
    passwordInput.type = show ? "text" : "password";
    toggle.setAttribute("aria-label", show ? "Hide password" : "Show password");
    toggle.setAttribute("aria-pressed", String(show));
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var navigating = false;
    clearError();

    var payload = { email: emailInput.value.trim(), password: passwordInput.value };
    if (mode === "signup") payload.name = nameInput.value.trim();

    if (mode === "signup" && payload.name.length < 2) return showError("Enter your name.", "name");
    if (!payload.email) return showError("Enter your email address.", "email");
    if (!emailInput.validity.valid) return showError('Enter a valid email address.', 'email');
    if (!payload.password) return showError("Enter your password.", "password");
    if (mode === "signup" && payload.password.length < 8) return showError("Use a password with at least 8 characters.", "password");

    submit.disabled = true;
    submit.textContent = mode === "signup" ? "Creating account…" : "Logging in…";

    fetch("/api/auth/" + mode, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload)
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) { return { ok: res.ok, data: data }; });
      })
      .then(function (r) {
        if (r.ok) { navigating = true; window.location.href = "/"; return; }
        showError(r.data.error || "Something went wrong. Please try again.", r.data.field);
      })
      .catch(function () {
        showError("Can't reach the server. Check your connection and try again.");
      })
      .then(function () {
        if (!navigating && window.location.pathname === "/login") {
          submit.disabled = false;
          submit.textContent = COPY[mode].button;
        }
      });
  });

  setMode(new URLSearchParams(window.location.search).get("mode") === "signup" ? "signup" : "login");
})();
