/* SeekerAi site runtime — reanima sites premium servidos como HTML
   estático (doc editado no editor visual). Na página viva o React cuida
   de tudo; aqui (sem scripts do Next) assumimos menu, âncoras, FAQ,
   lightbox, vídeos e o fluxo de agendamento.
   Dados: <script id="skr-cfg" type="application/json"> gerado por
   siteRuntimePayload(). Sem a ilha, degrada: menu/lightbox/FAQ do DOM
   seguem e CTAs de agendamento caem no WhatsApp. */
(function () {
  "use strict";
  if (window.__skr) return;
  window.__skr = 1;

  function boot() {
    if (document.querySelector('script[src*="/_next/"]')) return; // página viva
    var root = document.querySelector(".bshop, .bbeauty");
    if (!root) return;
    var ns = root.classList.contains("bbeauty") ? "bbeauty" : "bshop";
    var C = null;
    try {
      var isle = document.getElementById("skr-cfg");
      C = isle && isle.textContent ? JSON.parse(isle.textContent) : null;
    } catch (e) { C = null; }
    var S = (C && C.s) || {};

    var q = function (sel) { return root.querySelector(sel); };
    var qa = function (sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); };
    var el = function (tag, cls, html) {
      var n = document.createElement(tag);
      if (cls) n.className = cls;
      if (html != null) n.innerHTML = html;
      return n;
    };
    var esc = function (s) {
      return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
      });
    };
    // Paleta/vars do tema acompanham os overlays gerados (beleza usa
    // data-palette + --bb-* inline no root).
    var paintOverlay = function (node) {
      var p = root.getAttribute("data-palette");
      if (p) node.setAttribute("data-palette", p);
      if (root.style) for (var i = 0; i < root.style.length; i++) {
        var prop = root.style[i];
        if (prop.indexOf("--") === 0) node.style.setProperty(prop, root.style.getPropertyValue(prop));
      }
      return node;
    };
    var money = (function () {
      try { return new Intl.NumberFormat(S.loc || "pt-BR", { style: "currency", currency: S.cur || "BRL" }); }
      catch (e) { return { format: function (v) { return "R$ " + v; } }; }
    })();
    var fmtDia = (function () {
      try { return new Intl.DateTimeFormat(S.loc || "pt-BR", { day: "numeric", month: "short" }); }
      catch (e) { return { format: function (d) { return d.getDate() + "/" + (d.getMonth() + 1); } }; }
    })();

    // WhatsApp do site — da ilha ou de qualquer link wa.me presente.
    var waNum = (C && C.wa) || (function () {
      var a = root.querySelector('a[href*="wa.me/"]');
      var m = a && a.getAttribute("href").match(/wa\.me\/(\d+)/);
      return m ? m[1] : "";
    })();
    var waOpen = function (text) {
      if (!waNum) return;
      window.open("https://wa.me/" + waNum + (text ? "?text=" + encodeURIComponent(text) : ""), "_blank", "noopener");
    };

    /* ---------- overlays: scroll-lock + Escape ---------- */
    var openOverlays = [];
    var lockScroll = function () { document.body.style.overflow = "hidden"; };
    var unlockScroll = function () { if (!openOverlays.length) document.body.style.overflow = ""; };
    var closeOverlay = function (node) {
      var i = openOverlays.indexOf(node);
      if (i >= 0) openOverlays.splice(i, 1);
      if (node.parentNode) node.parentNode.removeChild(node);
      unlockScroll();
    };
    document.addEventListener("keydown", function (e) {
      var top = openOverlays[openOverlays.length - 1];
      if (!top) return;
      if (e.key === "Escape") closeOverlay(top);
      if (top.__lb && e.key === "ArrowRight") top.__lb.go(1);
      if (top.__lb && e.key === "ArrowLeft") top.__lb.go(-1);
    });

    /* ---------- barra de progresso + nav ---------- */
    var progress = q("." + ns + "-progress");
    var nav = q("." + ns + "-nav");
    var onScroll = function () {
      if (progress) {
        var h = document.documentElement;
        var max = h.scrollHeight - h.clientHeight;
        progress.style.transform = "scaleX(" + (max > 0 ? h.scrollTop / max : 0) + ")";
      }
      if (nav) nav.classList.toggle("is-scrolled", window.scrollY > 40);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    /* ---------- menu mobile ---------- */
    var menu = q("." + ns + "-mobile-menu");
    var burger = q("." + ns + "-nav-burger");
    if (burger) {
      if (!menu) {
        var links = q("." + ns + "-nav-links");
        if (links) {
          menu = links.cloneNode(true);
          menu.className = ns + "-mobile-menu";
          root.appendChild(menu);
        }
      }
      if (menu) burger.addEventListener("click", function () { menu.classList.toggle("open"); });
    }
    var closeMenu = function () { if (menu) menu.classList.remove("open"); };

    /* ---------- âncoras suaves ---------- */
    document.addEventListener("click", function (e) {
      var a = e.target.closest ? e.target.closest('a[href^="#"]') : null;
      if (!a) return;
      var href = a.getAttribute("href");
      if (!href || href === "#") return;
      var t = document.querySelector(href);
      if (t) { e.preventDefault(); t.scrollIntoView({ behavior: "smooth", block: "start" }); }
      closeMenu();
    });

    /* ---------- FAQ ---------- */
    document.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("." + ns + "-faq-item > button") : null;
      if (!btn) return;
      var item = btn.parentNode;
      if (!item.querySelector("." + ns + "-faq-answer") && C && C.faq) {
        var idx = qa("." + ns + "-faq-item").indexOf(item);
        var f = C.faq[idx];
        if (f) {
          var ans = el("div", ns + "-faq-answer");
          ans.appendChild(el("p", null, esc(f.a)));
          item.appendChild(ans);
        }
      }
      item.classList.toggle("open");
    });

    /* ---------- lightbox (galeria + cards de dúvidas) ---------- */
    var lbImgs = qa("." + ns + "-gallery-item img, ." + ns + "-duvida-card img")
      .map(function (i) { return i.currentSrc || i.src; });
    var lbItems = qa("." + ns + "-gallery-item, ." + ns + "-duvida-card");
    var openLightbox = function (idx) {
      if (!lbImgs.length) return;
      var cur = idx;
      var box = paintOverlay(el("div", ns + "-lightbox"));
      var img = el("img");
      var cap = el("span", ns + "-lightbox-cap");
      var prev = el("button", ns + "-lightbox-nav prev", "&lsaquo;");
      var next = el("button", ns + "-lightbox-nav next", "&rsaquo;");
      var x = el("button", ns + "-lightbox-close", "&times;");
      [prev, next, x].forEach(function (b) { b.type = "button"; });
      var render = function () {
        img.src = lbImgs[cur];
        cap.innerHTML = esc((C && C.nome) || "") + " · " + (cur + 1) + "/" + lbImgs.length
          + (lbImgs.length > 1 ? ' <em class="' + ns + '-lightbox-swipe">' + esc(S.ar || "") + "</em>" : "");
        var multi = lbImgs.length > 1;
        prev.style.display = next.style.display = multi ? "" : "none";
      };
      var go = function (d) { cur = (cur + d + lbImgs.length) % lbImgs.length; render(); };
      box.__lb = { go: go };
      box.addEventListener("click", function () { closeOverlay(box); });
      img.addEventListener("click", function (e) { e.stopPropagation(); });
      prev.addEventListener("click", function (e) { e.stopPropagation(); go(-1); });
      next.addEventListener("click", function (e) { e.stopPropagation(); go(1); });
      x.addEventListener("click", function () { closeOverlay(box); });
      var tx = null;
      img.addEventListener("touchstart", function (e) { tx = e.touches[0].clientX; }, { passive: true });
      img.addEventListener("touchend", function (e) {
        if (tx == null) return;
        var dx = e.changedTouches[0].clientX - tx;
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
        tx = null;
      }, { passive: true });
      box.appendChild(img); box.appendChild(cap);
      box.appendChild(prev); box.appendChild(next); box.appendChild(x);
      render();
      document.body.appendChild(box);
      openOverlays.push(box); lockScroll();
    };
    lbItems.forEach(function (item, i) {
      item.addEventListener("click", function () { openLightbox(i); });
    });

    /* ---------- vídeos: controles nativos ---------- */
    qa("video:not([controls])").forEach(function (v) {
      v.setAttribute("controls", "");
      v.setAttribute("preload", "metadata");
    });
    qa('button[class*="video-play"]').forEach(function (b) { b.parentNode.removeChild(b); });

    /* ---------- corredor 3D: sem JS vira pilha — some ---------- */
    qa("." + ns + "-corridor").forEach(function (s) { s.style.display = "none"; });

    /* ---------- contador da nota (CountUp fica em 0.0 sem React) ---------- */
    if (C && C.nota) {
      var big = q("." + ns + "-rating-hero .big");
      if (big && /^0[.,]0*$/.test(big.textContent.trim())) big.textContent = C.nota.toFixed(1);
    }

    /* ---------- topo ---------- */
    var topBtn = q("." + ns + "-footer-top");
    if (topBtn) topBtn.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    /* ---------- agendamento (wizard → WhatsApp) ---------- */
    var toMin = function (t) { var p = t.split(":"); return (+p[0]) * 60 + (+p[1]); };
    var hhmm = function (m) {
      return ("0" + Math.floor(m / 60)).slice(-2) + ":" + ("0" + (m % 60)).slice(-2);
    };
    var bk = { servico: null, prof: null, data: null, hora: null, nome: "", tel: "" };
    var step = 0;
    var hasPros = !!(C && C.pros && C.pros.length);
    var stepsTotal = hasPros ? 5 : 4;
    var dataStep = hasPros ? 2 : 1;
    var horaStep = hasPros ? 3 : 2;
    var finalStep = hasPros ? 4 : 3;
    var modal = null, stepBox = null, errBox = null, stepsBar = null, backBtn = null, nextBtn = null;

    var dias = function () {
      var out = [], now = new Date();
      var n = (C && C.bk && C.bk.dias) || 14;
      for (var i = 0; i < n; i++) {
        var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
        var w = C && C.hrs ? C.hrs[String(d.getDay())] : null;
        out.push({ d: d, aberto: !!(w && w.length) });
      }
      return out;
    };
    var slots = function () {
      if (!bk.data || !C || !C.hrs) return [];
      var janelas = C.hrs[String(bk.data.getDay())] || [];
      var dur = (bk.servico && bk.servico.d) || (C.bk && C.bk.slot) || 30;
      var st = (C.bk && C.bk.slot) || 30;
      var now = new Date(), today = bk.data.toDateString() === now.toDateString();
      var minNow = now.getHours() * 60 + now.getMinutes() + ((C.bk && C.bk.ant) || 0);
      var out = [];
      janelas.forEach(function (w) {
        for (var m = toMin(w[0]); m + dur <= toMin(w[1]); m += st) {
          if (today && m < minNow) continue;
          out.push(hhmm(m));
        }
      });
      return out;
    };
    var dataLabel = function () {
      if (!bk.data) return "—";
      return ((S.dows || [])[bk.data.getDay()] || "") + ", " + fmtDia.format(bk.data);
    };
    var pick = function (label, small, on, cb) {
      var b = el("button", ns + "-pick" + (on ? " on" : ""),
        "<strong>" + esc(label) + "</strong>" + (small ? "<small>" + esc(small) + "</small>" : ""));
      b.type = "button";
      b.addEventListener("click", cb);
      return b;
    };
    var renderStep = function () {
      if (!stepBox) return;
      stepBox.innerHTML = "";
      errBox.textContent = ""; errBox.style.display = "none";
      stepsBar.innerHTML = "";
      for (var i = 0; i < stepsTotal; i++) stepsBar.appendChild(el("i", i <= step ? "on" : ""));
      backBtn.style.visibility = step > 0 ? "" : "hidden";
      nextBtn.innerHTML = step === finalStep ? esc(S.ew || "Enviar") : esc(S.co || "Continuar") + " &rsaquo;";

      if (step === 0) {
        stepBox.appendChild(el("h3", ns + "-step-title", esc(S.ss || "")));
        var g = el("div", ns + "-pick-grid");
        (C.sv || []).forEach(function (s) {
          var small = (s.d ? "~" + s.d + " min" : "") + (s.p ? " · " + money.format(s.p) : (!s.d && s.p == null ? S.vb || "" : ""));
          g.appendChild(pick(s.n, small, bk.servico && bk.servico.n === s.n, function () {
            bk.servico = s; bk.hora = null; renderStep();
          }));
        });
        stepBox.appendChild(g);
      } else if (hasPros && step === 1) {
        stepBox.appendChild(el("h3", ns + "-step-title", esc(S.sp || "")));
        var g2 = el("div", ns + "-pick-grid");
        g2.appendChild(pick(S.np || "", S.pd || "", bk.prof === S.np, function () {
          bk.prof = S.np; renderStep();
        }));
        C.pros.forEach(function (p) {
          g2.appendChild(pick(p.n, p.e || S.pf || "", bk.prof === p.n, function () {
            bk.prof = p.n; renderStep();
          }));
        });
        stepBox.appendChild(g2);
      } else if (step === dataStep) {
        stepBox.appendChild(el("h3", ns + "-step-title", esc((hasPros ? "3. " : "2. ") + (S.sd || ""))));
        var days = el("div", ns + "-days");
        dias().forEach(function (o) {
          var on = bk.data && bk.data.toDateString() === o.d.toDateString();
          var b = el("button", ns + "-day" + (on ? " on" : "") + (o.aberto ? "" : " off"),
            '<div class="dow">' + esc((S.dows || [])[o.d.getDay()] || "") + "</div>"
            + '<div class="num">' + o.d.getDate() + "</div>"
            + '<div class="mon">' + esc((fmtDia.format(o.d).split(" ")[2] || "")) + "</div>");
          b.type = "button";
          if (!o.aberto) b.disabled = true;
          else b.addEventListener("click", function () { bk.data = o.d; bk.hora = null; renderStep(); });
          days.appendChild(b);
        });
        stepBox.appendChild(days);
      } else if (step === horaStep) {
        stepBox.appendChild(el("h3", ns + "-step-title", esc((hasPros ? "4. " : "3. ") + (S.sh || ""))));
        var sl = slots();
        if (!sl.length) stepBox.appendChild(el("p", ns + "-book-error", esc(S.nh || "")));
        else {
          var sg = el("div", ns + "-slots");
          sl.forEach(function (h) {
            var b = el("button", ns + "-slot" + (bk.hora === h ? " on" : ""), esc(h));
            b.type = "button";
            b.addEventListener("click", function () { bk.hora = h; renderStep(); });
            sg.appendChild(b);
          });
          stepBox.appendChild(sg);
        }
      } else if (step === finalStep) {
        stepBox.appendChild(el("h3", ns + "-step-title", esc((hasPros ? "5. " : "4. ") + (S.sc || ""))));
        var dl = el("dl", ns + "-summary");
        var row = function (t, v) {
          var d = el("div");
          d.appendChild(el("dt", null, esc(t)));
          d.appendChild(el("dd", null, esc(v)));
          return d;
        };
        dl.appendChild(row(S.ls || "", (bk.servico ? bk.servico.n : "") + (bk.servico && bk.servico.p ? " — " + money.format(bk.servico.p) : "")));
        if (bk.prof && bk.prof !== S.np) dl.appendChild(row(S.lp || "", bk.prof));
        dl.appendChild(row(S.ld || "", dataLabel()));
        dl.appendChild(row(S.lh || "", bk.hora || ""));
        stepBox.appendChild(dl);
        var f1 = el("div", ns + "-field");
        f1.appendChild(el("label", null, esc(S.yn || "")));
        var i1 = el("input"); i1.placeholder = S.nph || ""; i1.value = bk.nome;
        i1.addEventListener("input", function () { bk.nome = i1.value; });
        f1.appendChild(i1);
        var f2 = el("div", ns + "-field");
        f2.appendChild(el("label", null, esc(S.yw || "")));
        var i2 = el("input"); i2.type = "tel"; i2.placeholder = S.tph || ""; i2.value = bk.tel;
        i2.addEventListener("input", function () { bk.tel = i2.value; });
        f2.appendChild(i2);
        stepBox.appendChild(f1); stepBox.appendChild(f2);
      }
    };
    var err = function (msg) {
      errBox.textContent = msg; errBox.style.display = "";
    };
    var sendWa = function () {
      if (!bk.nome.trim()) return err(S.en || "");
      var msg = [
        S.wh || "",
        "• " + (S.ls || "") + ": " + (bk.servico ? bk.servico.n : ""),
        bk.prof && bk.prof !== S.np ? "• " + (S.lp || "") + ": " + bk.prof : null,
        "• " + (S.ld || "") + ": " + dataLabel(),
        "• " + (S.lh || "") + ": " + bk.hora,
        bk.nome ? "• " + (S.ln || "") + ": " + bk.nome : null,
        bk.tel ? "• " + (S.lt || "") + ": " + bk.tel : null,
      ].filter(Boolean).join("\n");
      waOpen(msg);
      if (modal) closeOverlay(modal);
    };
    var nextStep = function () {
      if (step === 0 && !bk.servico) return err(S.es || "");
      if (hasPros && step === 1 && bk.prof === null) return err(S.ep || "");
      if (step === dataStep && !bk.data) return err(S.ed || "");
      if (step === horaStep && !bk.hora) return err(S.eh || "");
      if (step === finalStep) return sendWa();
      step++; renderStep();
    };
    var openBook = function (preIdx) {
      if (!C || !C.book) { waOpen(); return; }
      bk = { servico: null, prof: null, data: null, hora: null, nome: "", tel: "" };
      step = 0;
      /* "dois toques": serviço pré-selecionado pula direto pro próximo passo
         (voltar ainda mostra a lista com o serviço marcado). */
      if (preIdx != null && C.sv && C.sv[preIdx]) { bk.servico = C.sv[preIdx]; step = 1; }
      modal = paintOverlay(el("div", ns + "-book-modal-bg"));
      var card = paintOverlay(el("div", ns + "-booking-card " + ns + "-book-modal"));
      var x = el("button", ns + "-modal-close", "&times;");
      x.type = "button";
      x.addEventListener("click", function () { closeOverlay(modal); });
      var head = el("div", ns + "-book-modal-head",
        '<span class="' + ns + '-eyebrow">' + esc(S.ag || "") + "</span>"
        + '<h2 class="' + ns + '-modal-h2">' + (S.t || "") + "</h2>");
      stepsBar = el("div", ns + "-steps");
      stepBox = el("div");
      errBox = el("p", ns + "-book-error");
      errBox.style.display = "none";
      var actions = el("div", ns + "-book-actions");
      backBtn = el("button", ns + "-btn-back", "&lsaquo; " + esc(S.vo || ""));
      backBtn.type = "button";
      backBtn.addEventListener("click", function () { if (step > 0) { step--; renderStep(); } });
      nextBtn = el("button", ns + "-btn " + ns + "-btn-primary");
      nextBtn.type = "button";
      nextBtn.addEventListener("click", nextStep);
      actions.appendChild(backBtn); actions.appendChild(nextBtn);
      card.appendChild(x); card.appendChild(head); card.appendChild(stepsBar);
      card.appendChild(stepBox); card.appendChild(errBox); card.appendChild(actions);
      card.appendChild(el("p", ns + "-book-msg", esc(S.bm || "")));
      modal.appendChild(card);
      modal.addEventListener("click", function () { closeOverlay(modal); });
      card.addEventListener("click", function (e) { e.stopPropagation(); });
      renderStep();
      document.body.appendChild(modal);
      openOverlays.push(modal); lockScroll();
    };

    /* ---------- modal de visita (beleza, cta "mapa") ---------- */
    var openVisit = function () {
      if (!C) return;
      var m = paintOverlay(el("div", ns + "-book-modal-bg"));
      var card = paintOverlay(el("div", ns + "-booking-card " + ns + "-book-modal " + ns + "-visit-modal"));
      var x = el("button", ns + "-modal-close", "&times;");
      x.type = "button";
      x.addEventListener("click", function () { closeOverlay(m); });
      card.appendChild(x);
      card.appendChild(el("div", ns + "-book-modal-head",
        '<span class="' + ns + '-eyebrow">' + esc(S.ve || "") + "</span>"
        + '<h2 class="' + ns + '-modal-h2">' + esc(S.vt || "") + "</h2>"));
      if (C.end) card.appendChild(el("p", ns + "-visit-line", esc(C.end)));
      if (C.hl && C.hl.length) {
        var h = el("div", ns + "-visit-hours");
        C.hl.forEach(function (r) {
          var d = el("div", ns === "bbeauty" ? "bbeauty-hours-line" : "hours-line");
          d.appendChild(el("span", null, esc(r[0])));
          d.appendChild(el("strong", null, esc(r[1])));
          h.appendChild(d);
        });
        card.appendChild(h);
      }
      var acts = el("div", ns + "-visit-actions");
      var pill = function (href, txt, primary) {
        if (!href) return;
        var a = el("a", ns + "-pill" + (primary ? " primary" : ""), esc(txt));
        a.href = href; a.target = "_blank"; a.rel = "noopener";
        acts.appendChild(a);
      };
      pill(C.maps, S.tr || S.cc || "", true);
      pill(waNum ? "https://wa.me/" + waNum : null, S.cw || "WhatsApp", false);
      pill(C.tel, S.ls2 || "", false);
      card.appendChild(acts);
      m.appendChild(card);
      m.addEventListener("click", function () { closeOverlay(m); });
      card.addEventListener("click", function (e) { e.stopPropagation(); });
      document.body.appendChild(m);
      openOverlays.push(m); lockScroll();
    };

    /* ---------- CTAs: botões que a página viva liga via React ---------- */
    document.addEventListener("click", function (e) {
      var kind = C ? C.cta : "link";
      /* quick-pick / card de serviço: abre o wizard já no serviço escolhido */
      var bkEl = e.target.closest ? e.target.closest("[data-bk-open]") : null;
      if (bkEl && !bkEl.closest("." + ns + "-book-modal-bg")
        && kind === "agendar" && C && C.book) {
        openBook(parseInt(bkEl.getAttribute("data-bk-open"), 10));
        return;
      }
      var b = e.target.closest ? e.target.closest(
        "button." + ns + "-nav-cta, button." + ns + "-mobile-cta, button." + ns + "-pill"
      ) : null;
      if (!b || b.closest("." + ns + "-book-modal-bg") || b.classList.contains(ns + "-footer-top")) return;
      if (kind === "agendar" && C.book) openBook();
      else if (kind === "mapa") openVisit();
      else if (kind === "scroll") {
        var t = document.getElementById("contato");
        if (t) t.scrollIntoView({ behavior: "smooth" });
        else waOpen();
      } else waOpen();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else boot();
})();
