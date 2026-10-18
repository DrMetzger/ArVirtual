(function () {
  var cfg = window.SITE_CONFIG || {};
  var root = document.documentElement;

  // ---- Tema claro / escuro (azul + dourado) ----
  var toggle = document.getElementById("themeToggle");
  function setTheme(t) {
    root.setAttribute("data-theme", t);
    toggle.setAttribute("aria-label", t === "dark" ? "Ativar tema claro" : "Ativar tema escuro");
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", t === "dark" ? "#07142a" : "#1a5f9e");
    try { localStorage.setItem("arv-theme", t); } catch (e) {}
  }
  setTheme(root.getAttribute("data-theme") || "light");
  toggle.addEventListener("click", function () {
    setTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark");
  });

  // ---- Menu mobile ----
  var burger = document.getElementById("burger");
  var menu = document.getElementById("menu");
  function closeMenu() { menu.classList.remove("open"); burger.setAttribute("aria-expanded", "false"); }
  burger.addEventListener("click", function () {
    var open = menu.classList.toggle("open");
    burger.setAttribute("aria-expanded", String(open));
  });
  menu.querySelectorAll("a").forEach(function (a) { a.addEventListener("click", closeMenu); });

  // ---- Dados de contato vindos da configuração ----
  document.querySelectorAll("[data-cfg]").forEach(function (el) {
    var val = cfg[el.getAttribute("data-cfg")];
    if (!val) return;
    el.textContent = val;
    var kind = el.getAttribute("data-href");
    if (kind === "tel") el.href = "tel:+" + val.replace(/\D/g, "").replace(/^(?!55)/, "55");
    if (kind === "mailto") el.href = "mailto:" + val;
  });
  if (cfg.WHATSAPP_NUMBER) {
    var wa = "https://wa.me/" + cfg.WHATSAPP_NUMBER.replace(/\D/g, "") +
      "?text=" + encodeURIComponent("Olá! Vim pelo site da ArVirtual e gostaria de conversar sobre um projeto.");
    ["whatsBtn", "whatsFloat"].forEach(function (id) { document.getElementById(id).href = wa; });
  }

  // ---- Animação ao rolar ----
  var items = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("is-visible"); io.unobserve(e.target); }
      });
    }, { threshold: 0.12 });
    items.forEach(function (el) { io.observe(el); });
  } else {
    items.forEach(function (el) { el.classList.add("is-visible"); });
  }

  // ---- Formulário: Formspree se configurado, senão abre o e-mail ----
  var form = document.getElementById("contactForm");
  var status = document.getElementById("formStatus");
  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    status.className = "form__status full";
    if (!form.checkValidity()) {
      status.textContent = "Preencha nome, e-mail válido e mensagem.";
      status.classList.add("err-msg");
      return;
    }
    var data = new FormData(form);
    if (cfg.FORMSPREE_ID) {
      status.textContent = "Enviando...";
      fetch("https://formspree.io/f/" + cfg.FORMSPREE_ID, {
        method: "POST", body: data, headers: { Accept: "application/json" }
      }).then(function (r) {
        if (!r.ok) throw new Error();
        form.reset();
        status.textContent = "Mensagem enviada! Retornaremos em breve.";
        status.classList.add("ok-msg");
      }).catch(function () {
        status.textContent = "Não foi possível enviar agora. Tente pelo WhatsApp ou e-mail.";
        status.classList.add("err-msg");
      });
    } else {
      var body = "Nome: " + data.get("nome") + "\nE-mail: " + data.get("email") +
        "\nEmpresa: " + data.get("empresa") + "\nInteresse: " + data.get("interesse") +
        "\n\n" + data.get("mensagem");
      window.location.href = "mailto:" + (cfg.CONTACT_EMAIL || "kleber@arvirtual.com.br") +
        "?subject=" + encodeURIComponent("Contato pelo site - " + data.get("interesse")) +
        "&body=" + encodeURIComponent(body);
      status.textContent = "Abrindo seu aplicativo de e-mail...";
      status.classList.add("ok-msg");
    }
  });

  // ---- Google Analytics (opcional) ----
  if (cfg.GA_MEASUREMENT_ID) {
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(cfg.GA_MEASUREMENT_ID);
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", cfg.GA_MEASUREMENT_ID);
  }

  document.getElementById("year").textContent = new Date().getFullYear();
})();
