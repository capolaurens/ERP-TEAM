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
    "auto-rotate": "",
    "auto-rotate-delay": "0",
    "rotation-per-second": "16deg",
    "interaction-prompt": "none",
    ar: "",
    "ar-modes": "webxr scene-viewer quick-look",
    "shadow-intensity": "0.9",
    "shadow-softness": "1",
    exposure: "1.05",
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

    m.setAttribute("src", card.getAttribute("data-src"));
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

    function setCount() {
      var n = ul.children.length;
      if (n > 0) {
        nEl.textContent = String(n);
        nEl.hidden = false;
      } else nEl.hidden = true;
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

    return { file: file, chk: chk, ul: ul, setCount: setCount };
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
        var comments = (data && data.comments) || {};
        refs.forEach(function (r) {
          if (checks[r.file] && r.chk) r.chk.checked = true;
          var list = comments[r.file] || [];
          list.forEach(function (c) {
            addComment(r.ul, c, r.file, r.setCount);
          });
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
        if (!touched) cards.forEach(mount);
      }, 1500);
    } else {
      cards.forEach(mount);
    }

    // Filtros.
    var buttons = Array.prototype.slice.call(
      document.querySelectorAll(".nx-filters button"),
    );
    buttons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var f = btn.getAttribute("data-filter");
        buttons.forEach(function (b) {
          b.classList.toggle("on", b === btn);
        });
        cards.forEach(function (c) {
          var show = f === "todos" || c.getAttribute("data-status") === f;
          c.style.display = show ? "" : "none";
          if (!show) unmount(c);
        });
      });
    });

    // Feedback público.
    loadFeedback(cards);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
