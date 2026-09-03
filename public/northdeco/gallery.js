/* Galería 3D Northdeco — JS vanilla (sin React/hidratación).
   Carga model-viewer, virtualiza (solo monta el visor cerca del viewport y lo
   desmonta al salir → GPU acotada), gestiona filtros, y el feedback público
   (check "visto bueno" + comentarios) guardado en /api/northdeco. */
(function () {
  "use strict";

  // 1) Cargar model-viewer una sola vez.
  if (!document.querySelector("script[data-model-viewer]")) {
    var s = document.createElement("script");
    s.type = "module";
    s.src =
      "https://ajax.googleapis.com/ajax/libs/model-viewer/3.5.0/model-viewer.min.js";
    s.setAttribute("data-model-viewer", "1");
    document.head.appendChild(s);
  }

  var MV_ATTRS = {
    // La COLA de abajo decide cuándo carga cada modelo (4 a la vez, por
    // cercanía al viewport); model-viewer no debe re-aplazar con su lazy interno.
    loading: "eager",
    "camera-controls": "",
    "touch-action": "pan-y",
    // Vista 3/4 FRONTAL idéntica en todas las piezas (comprobado: el frente de
    // estos modelos cae en theta 90°). Sin auto-rotate: girando, cada tarjeta
    // quedaba en un ángulo distinto y el catálogo se veía descolocado; el
    // cliente puede girar cada modelo a mano con camera-controls.
    "camera-orbit": "65deg 75deg 105%",
    "interaction-prompt": "none",
    ar: "",
    "ar-modes": "webxr scene-viewer quick-look",
    // Render NEUTRO, como el visor de Google Drive: no altera color ni
    // contraste. "aces" (el tono por defecto) lavaba las maderas claras y
    // quemaba los brillos; exposure 1.05 sobreexponía.
    "tone-mapping": "neutral",
    exposure: "1",
    "shadow-intensity": "0.2",
    "shadow-softness": "1",
  };

  /* --- Carga progresiva ---------------------------------------------------
     Los GLB originales pesan mucho (~20MB): si todas las tarjetas visibles
     descargan a la vez, la página se ahoga. Cola con máximo MAX_PARALLEL
     descargas simultáneas, en orden visual (primeras filas primero). El
     spinner se mantiene hasta que el modelo termina de cargar. */
  var MAX_PARALLEL = 4;
  var LOAD_TIMEOUT = 120000; // suelta el hueco si una descarga se eterniza
  var active = 0;
  var queue = [];

  function byPosition(a, b) {
    return a.offsetTop - b.offsetTop || a.offsetLeft - b.offsetLeft;
  }

  function releaseSlot(card) {
    if (card.__nxHolds) {
      card.__nxHolds = false;
      active = Math.max(0, active - 1);
    }
    pump();
  }

  function startLoad(card) {
    var viewer = card.querySelector(".nx-viewer");
    if (!viewer) return;
    if (viewer.querySelector("model-viewer")) {
      card.__nxState = "loaded";
      return;
    }
    card.__nxState = "loading";
    card.__nxHolds = true;
    active++;

    var m = document.createElement("model-viewer");
    m.setAttribute("alt", card.getAttribute("data-alt") || "");
    for (var k in MV_ATTRS) m.setAttribute(k, MV_ATTRS[k]);

    var timer = setTimeout(function () {
      releaseSlot(card); // sigue descargando, pero deja pasar a los demás
    }, LOAD_TIMEOUT);
    m.addEventListener(
      "load",
      function () {
        clearTimeout(timer);
        var ph = viewer.querySelector(".nx-ph");
        if (ph) ph.style.display = "none";
        card.__nxState = "loaded";
        releaseSlot(card);
      },
      { once: true },
    );
    m.addEventListener(
      "error",
      function () {
        clearTimeout(timer);
        card.__nxState = "error";
        releaseSlot(card);
      },
      { once: true },
    );

    var src = card.getAttribute("data-src");
    if (window.__ndBust) src += (src.indexOf("?") === -1 ? "?" : "&") + "v=" + window.__ndBust;
    m.setAttribute("src", src);
    viewer.appendChild(m);
  }

  function pump() {
    if (!queue.length || active >= MAX_PARALLEL) return;
    queue.sort(byPosition); // de arriba hacia abajo
    while (active < MAX_PARALLEL && queue.length) {
      var card = queue.shift();
      if (card.__nxState !== "queued" || !card.isConnected) continue;
      startLoad(card);
    }
  }

  function mount(card) {
    var st = card.__nxState;
    if (st === "queued" || st === "loading" || st === "loaded") return;
    card.__nxState = "queued";
    queue.push(card);
    pump();
  }

  function unmount(card) {
    var viewer = card.querySelector(".nx-viewer");
    if (!viewer) return;
    var m = viewer.querySelector("model-viewer");
    if (m) m.remove(); // libera el contexto WebGL / memoria GPU (aborta la descarga)
    var ph = viewer.querySelector(".nx-ph");
    if (ph) ph.style.display = "";
    card.__nxState = null; // si estaba en cola, pump() la descarta
    releaseSlot(card);
  }

  /* Una pieza cuenta como "revisada" si tiene el check o algún comentario. */
  function isReviewed(c) {
    var i = c.querySelector(".nx-check-input");
    return !!(i && i.checked) || !!c.querySelector(".nx-cmt-item");
  }

  /* Contadores de filtros + barra de progreso de la revisión (en vivo). */
  function updateCounts() {
    var all = document.querySelectorAll(".nx-card");
    var visto = 0;
    var comentados = 0;
    var revisadas = 0;
    var rehechos = 0;
    var porCorregir = 0;
    for (var i = 0; i < all.length; i++) {
      var chk = all[i].querySelector(".nx-check-input");
      var hasChk = !!(chk && chk.checked);
      var hasCmt = !!all[i].querySelector(".nx-cmt-item");
      if (hasChk) visto++;
      if (hasCmt) comentados++;
      if (hasChk || hasCmt) revisadas++;
      if (hasCmt) {
        if (all[i].getAttribute("data-rehecho") === "1") rehechos++;
        else porCorregir++;
      }
    }
    var a = document.querySelector('[data-n="visto"]');
    var b = document.querySelector('[data-n="comentados"]');
    var p = document.querySelector('[data-n="pendientes"]');
    var rh = document.querySelector('[data-n="rehechos"]');
    var pc = document.querySelector('[data-n="porcorregir"]');
    if (rh) rh.textContent = String(rehechos);
    if (pc) pc.textContent = String(porCorregir);
    if (a) a.textContent = String(visto);
    if (b) b.textContent = String(comentados);
    if (p) p.textContent = String(all.length - revisadas);
    var bar = document.querySelector("[data-progress-bar]");
    var lbl = document.querySelector("[data-progress-label]");
    if (bar && all.length) {
      bar.style.width = Math.round((revisadas / all.length) * 100) + "%";
    }
    if (lbl) {
      lbl.textContent =
        revisadas + " de " + all.length + " revisadas";
    }
  }

  /* ¿La tarjeta pasa el filtro activo? */
  // Filtro por material: data-material lleva los materiales del mueble
  // separados por espacios (puede haber varios, p. ej. "madera metal").
  function cardMatchesMat(c, mat) {
    if (mat === "todos") return true;
    var mats = (c.getAttribute("data-material") || "").split(" ");
    return mats.indexOf(mat) !== -1;
  }

  /* Buscador: texto libre (SKU/nombre/color) + desplegable de familia. */
  function cardMatchesSearch(c, q, fam) {
    if (fam && c.getAttribute("data-fam") !== fam) return false;
    if (!q) return true;
    var hay = (c.getAttribute("data-search") || "");
    return hay.indexOf(q) !== -1;
  }

  function cardMatches(c, f) {
    if (f === "todos") return true;
    if (f === "pendientes") return !isReviewed(c);
    if (f === "visto") {
      var i = c.querySelector(".nx-check-input");
      return !!(i && i.checked);
    }
    if (f === "comentados") return !!c.querySelector(".nx-cmt-item");
    // Flujo de corrección: una pieza comentada está "por corregir" hasta que
    // NAVYX la marca como rehecha; si el cliente vuelve a comentar, regresa.
    if (f === "porcorregir") {
      return (
        !!c.querySelector(".nx-cmt-item") && c.getAttribute("data-rehecho") !== "1"
      );
    }
    if (f === "rehechos") {
      return (
        !!c.querySelector(".nx-cmt-item") && c.getAttribute("data-rehecho") === "1"
      );
    }
    return c.getAttribute("data-status") === f;
  }

  // --- Feedback (check + comentarios) ---
  function post(payload) {
    return fetch("/api/northdeco", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(function (r) {
      return r.json();
    });
  }

  function addComment(ul, c, file, onDelete) {
    var li = document.createElement("li");
    li.className = "nx-cmt-item";
    if (c.author) {
      var a = document.createElement("span");
      a.className = "nx-cmt-author";
      a.textContent = c.author + ":";
      li.appendChild(a);
    }
    var b = document.createElement("span");
    b.className = "nx-cmt-body";
    b.textContent = c.text; // textContent => sin XSS
    li.appendChild(b);
    if (c.id) {
      var del = document.createElement("button");
      del.type = "button";
      del.className = "nx-cmt-del";
      del.setAttribute("aria-label", "Quitar comentario");
      del.setAttribute("title", "Quitar");
      del.textContent = "×";
      del.addEventListener("click", function () {
        del.disabled = true;
        post({ action: "deleteComment", file: file, id: c.id })
          .then(function (res) {
            if (res && res.ok) {
              if (li.parentNode) li.parentNode.removeChild(li);
              if (onDelete) onDelete();
            } else del.disabled = false;
          })
          .catch(function () {
            del.disabled = false;
          });
      });
      li.appendChild(del);
    }
    ul.appendChild(li);
  }

  function wireCard(card) {
    var file = card.getAttribute("data-file");
    var chk = card.querySelector(".nx-check-input");
    var ul = card.querySelector(".nx-comments");
    var nEl = card.querySelector(".nx-cmt-n");
    var btn = card.querySelector(".nx-cmt-btn");
    var form = card.querySelector(".nx-cmt-form");
    var text = card.querySelector(".nx-cmt-text");
    var name = card.querySelector(".nx-cmt-name");
    var send = card.querySelector(".nx-cmt-send");
    var cancel = card.querySelector(".nx-cmt-cancel");
    var fixBtn = card.querySelector("[data-fix]");
    var fixLbl = card.querySelector("[data-fix-lbl]");

    /* Estado de corrección de la pieza. "Rehecho" lo marca NAVYX cuando ha
       vuelto a subir el modelo; si el cliente comenta DESPUÉS, la pieza
       vuelve sola a "por corregir" (se compara con la fecha del comentario
       más reciente, en data-last-comment). */
    function pintarFix() {
      var n = ul.children.length;
      if (fixBtn) fixBtn.hidden = n === 0; // solo tiene sentido si hay comentarios
      var rehecho = card.getAttribute("data-fixed-at") || "";
      var ultimo = card.getAttribute("data-last-comment") || "";
      var vigente = !!rehecho && (!ultimo || rehecho > ultimo);
      card.setAttribute("data-rehecho", vigente ? "1" : "");
      if (fixBtn) fixBtn.classList.toggle("on", vigente);
      if (fixLbl) fixLbl.textContent = vigente ? "Rehecho" : "Marcar rehecho";
    }

    function setCount() {
      var n = ul.children.length;
      if (n > 0) {
        nEl.textContent = String(n);
        nEl.hidden = false;
      } else nEl.hidden = true;
      pintarFix();
      updateCounts();
    }

    if (fixBtn) {
      fixBtn.addEventListener("click", function () {
        var vigente = card.getAttribute("data-rehecho") === "1";
        fixBtn.disabled = true;
        post({ action: "fixed", file: file, fixed: !vigente })
          .then(function (r) {
            card.setAttribute("data-fixed-at", (r && r.fixedAt) || "");
            pintarFix();
            updateCounts();
          })
          .catch(function () {})
          .finally(function () {
            fixBtn.disabled = false;
          });
      });
    }

    if (chk) {
      chk.addEventListener("change", function () {
        chk.disabled = true;
        post({ action: "check", file: file, checked: chk.checked })
          .catch(function () {
            chk.checked = !chk.checked; // revertir si falla
          })
          .finally(function () {
            chk.disabled = false;
            updateCounts();
          });
      });
    }
    if (btn && form) {
      btn.addEventListener("click", function () {
        form.hidden = !form.hidden;
        if (!form.hidden && text) text.focus();
      });
    }
    if (cancel && form) {
      cancel.addEventListener("click", function () {
        form.hidden = true;
      });
    }
    if (send) {
      send.addEventListener("click", function () {
        var t = (text.value || "").trim();
        if (!t) {
          text.focus();
          return;
        }
        send.disabled = true;
        post({
          action: "comment",
          file: file,
          text: t,
          author: (name.value || "").trim(),
        })
          .then(function (res) {
            if (res && res.comment) {
              addComment(ul, res.comment, file, setCount);
              // Un comentario nuevo invalida el "rehecho" anterior: la pieza
              // vuelve a "por corregir" sin tener que desmarcarla a mano.
              if (res.comment.createdAt) {
                card.setAttribute("data-last-comment", res.comment.createdAt);
              }
              setCount();
              text.value = "";
              form.hidden = true;
            }
          })
          .finally(function () {
            send.disabled = false;
          });
      });
    }

    return { file: file, chk: chk, ul: ul, setCount: setCount, pintarFix: pintarFix };
  }

  function loadFeedback(cards) {
    var refs = cards.map(wireCard);
    var byFile = {};
    refs.forEach(function (r) {
      byFile[r.file] = r;
    });
    fetch("/api/northdeco")
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        var checks = (data && data.checks) || {};
        var fixed = (data && data.fixed) || {};
        var comments = (data && data.comments) || {};
        refs.forEach(function (r) {
          if (checks[r.file] && r.chk) r.chk.checked = true;
          var card = r.ul.closest(".nx-card");
          if (card && fixed[r.file]) card.setAttribute("data-fixed-at", fixed[r.file]);
          var list = comments[r.file] || [];
          var ultimo = "";
          list.forEach(function (c) {
            addComment(r.ul, c, r.file, r.setCount);
            if (c.createdAt && c.createdAt > ultimo) ultimo = c.createdAt;
          });
          if (card && ultimo) card.setAttribute("data-last-comment", ultimo);
          r.setCount();
        });
      })
      .catch(function () {});
  }

  function init() {
    var cards = Array.prototype.slice.call(
      document.querySelectorAll(".nx-card"),
    );
    if (!cards.length) return;

    // Virtualización por visibilidad.
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (e) {
            if (e.isIntersecting) mount(e.target);
            else unmount(e.target);
          });
        },
        { rootMargin: "300px 0px" },
      );
      cards.forEach(function (c) {
        io.observe(c);
      });
      // Respaldo: si el observer no reacciona (viewport 0, embeds raros…),
      // encola todo igualmente — la cola mantiene el goteo de 4 en 4 en orden.
      setTimeout(function () {
        var touched = false;
        for (var i = 0; i < cards.length; i++) {
          if (cards[i].__nxState !== undefined) {
            touched = true;
            break;
          }
        }
        if (!touched) {
          cards.forEach(function (c) {
            if (c.style.display !== "none") mount(c);
          });
        }
      }, 1500);
    } else {
      cards.forEach(function (c) {
        if (c.style.display !== "none") mount(c);
      });
    }

    /* ---- Filtros + paginación (40 por página) ---- */
    var PAGE_SIZE = 60;
    var currentFilter = "todos";
    var currentMat = "todos";
    var currentQ = "";
    var currentFam = "";
    var currentPage = 0;
    var grid = document.querySelector(".nx-grid");

    function refreshView(scrollToGrid) {
      var matched = cards.filter(function (c) {
        return (
          cardMatches(c, currentFilter) &&
          cardMatchesMat(c, currentMat) &&
          cardMatchesSearch(c, currentQ, currentFam)
        );
      });
      var totalPages = Math.max(1, Math.ceil(matched.length / PAGE_SIZE));
      if (currentPage > totalPages - 1) currentPage = totalPages - 1;
      if (currentPage < 0) currentPage = 0;
      var start = currentPage * PAGE_SIZE;
      var end = Math.min(start + PAGE_SIZE, matched.length);

      var shown = {};
      for (var i = start; i < end; i++) {
        shown[matched[i].getAttribute("data-file")] = true;
      }
      cards.forEach(function (c) {
        var show = !!shown[c.getAttribute("data-file")];
        c.style.display = show ? "" : "none";
        if (!show) unmount(c);
      });

      var txt = matched.length
        ? start + 1 + "–" + end + " de " + matched.length
        : "0 resultados";
      document.querySelectorAll("[data-page-label]").forEach(function (el) {
        el.textContent = txt;
      });
      document.querySelectorAll("[data-page-prev]").forEach(function (b) {
        b.disabled = currentPage === 0;
      });
      document.querySelectorAll("[data-page-next]").forEach(function (b) {
        b.disabled = currentPage >= totalPages - 1;
      });

      if (scrollToGrid && grid) {
        try {
          grid.scrollIntoView({ behavior: "smooth", block: "start" });
        } catch (e) {
          grid.scrollIntoView();
        }
      }
    }

    var buttons = Array.prototype.slice.call(
      document.querySelectorAll(".nx-filters button[data-filter]"),
    );
    buttons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        currentFilter = btn.getAttribute("data-filter");
        buttons.forEach(function (b) {
          b.classList.toggle("on", b === btn);
        });
        currentPage = 0;
        refreshView(false);
      });
    });

    var matButtons = Array.prototype.slice.call(
      document.querySelectorAll(".nx-filters button[data-mat]"),
    );
    matButtons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        currentMat = btn.getAttribute("data-mat");
        matButtons.forEach(function (b) {
          b.classList.toggle("on", b === btn);
        });
        currentPage = 0;
        refreshView(false);
      });
    });
    var reload = document.querySelector("[data-reload]");
    if (reload) {
      reload.addEventListener("click", function () {
        reload.disabled = true;
        var txt = reload.textContent;
        reload.textContent = "↻ Buscando en Drive…";
        fetch("/api/northdeco/refresh", { method: "POST" })
          .catch(function () {})
          .then(function () {
            // Marca de tiempo para saltarse la caché del navegador y remontaje
            // de los visores: cada pieza vuelve a pedir su archivo a Drive.
            window.__ndBust = Date.now();
            cards.forEach(unmount);
            refreshView(false);
            reload.disabled = false;
            reload.textContent = txt;
          });
      });
    }

    var qInput = document.querySelector("[data-q]");
    if (qInput) {
      qInput.addEventListener("input", function () {
        currentQ = qInput.value.trim().toLowerCase();
        currentPage = 0;
        refreshView(false);
      });
    }
    var famSel = document.querySelector("[data-fam-select]");
    if (famSel) {
      famSel.addEventListener("change", function () {
        currentFam = famSel.value;
        currentPage = 0;
        refreshView(true);
      });
    }
    document.querySelectorAll("[data-page-prev]").forEach(function (b) {
      b.addEventListener("click", function () {
        currentPage--;
        refreshView(true);
      });
    });
    document.querySelectorAll("[data-page-next]").forEach(function (b) {
      b.addEventListener("click", function () {
        currentPage++;
        refreshView(true);
      });
    });

    refreshView(false);

    // Feedback público.
    loadFeedback(cards);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
