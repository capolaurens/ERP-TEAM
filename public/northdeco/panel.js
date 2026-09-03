/**
 * Panel de control 3D de Northdeco (/revision, solo admin).
 *
 * JS vanilla a propósito, como gallery.js: esta página es un server component y
 * aquí no se monta nada de React. El script solo escribe dentro de los
 * contenedores que el servidor renderiza VACÍOS, así que no puede chocar con la
 * hidratación de los componentes de cliente que sí tiene el layout del ERP.
 *
 * Todo el trabajo pesado (Drive) vive detrás de un botón: el escaneo tarda ~2 s,
 * la auditoría ~25 s en frío y las fichas técnicas ~23 s. Cargarlos al abrir la
 * página dejaría la pantalla en blanco casi un minuto.
 */
(function () {
  "use strict";

  /* ─────────────────────────── utilidades ─────────────────────────── */

  var nf = new Intl.NumberFormat("es-ES");

  function esc(v) {
    if (v === null || v === undefined) return "";
    return String(v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function num(n) {
    return typeof n === "number" && isFinite(n) ? nf.format(n) : "—";
  }

  /**
   * Peso legible, siempre en MB: comparar 0,8 MB con 38 MB es el uso real.
   * MB DECIMALES (10^6), no MiB, porque así los cuenta Drive y así está escrito
   * el umbral del auditor (15.000.000 bytes = "15 MB"). Con MiB ese mismo
   * umbral se leería "14,3 MB" y no cuadraría con lo que dice el aviso.
   */
  function mb(bytes) {
    if (typeof bytes !== "number" || !isFinite(bytes)) return "—";
    return (bytes / 1e6).toFixed(1).replace(".", ",") + " MB";
  }

  function fecha(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  /** Enlace a Drive, o texto plano si no hay id. */
  function linkDrive(id, texto) {
    if (!id) return esc(texto || "—");
    return (
      '<a class="nd-link" target="_blank" rel="noopener noreferrer" href="' +
      esc("https://drive.google.com/file/d/" + id + "/view") +
      '">' +
      esc(texto || "abrir en Drive") +
      " &#8599;</a>"
    );
  }

  /**
   * fetch + JSON con el error del servidor ya desempaquetado. Los endpoints de
   * admin contestan {error} con 401/403/503/502, y ese texto está escrito para
   * enseñarse tal cual (dice si falta sesión, si falta Drive o si falló Drive).
   */
  function pedir(url, opciones) {
    return fetch(url, opciones || { credentials: "same-origin" }).then(function (r) {
      return r
        .json()
        .catch(function () {
          throw new Error("Respuesta ilegible del servidor (" + r.status + ").");
        })
        .then(function (datos) {
          if (!r.ok) {
            throw new Error(datos && datos.error ? datos.error : "Error " + r.status);
          }
          return datos;
        });
    });
  }

  /* ───────────────────────── estado de cada bloque ───────────────────────── */

  /**
   * Contador vivo mientras se espera. Sin él, 25 s de auditoría parecen una
   * página colgada y la gente recarga (y vuelve a pagar los 25 s).
   */
  function Reloj(nodo) {
    var iv = null;
    return {
      arrancar: function (texto) {
        var t0 = Date.now();
        nodo.className = "nd-estado nd-cargando";
        nodo.textContent = texto + " (0 s)";
        clearInterval(iv);
        iv = setInterval(function () {
          var s = Math.round((Date.now() - t0) / 1000);
          nodo.textContent = texto + " (" + s + " s)";
        }, 1000);
        return function () {
          clearInterval(iv);
          return Math.round((Date.now() - t0) / 1000);
        };
      },
      ok: function (texto) {
        clearInterval(iv);
        nodo.className = "nd-estado nd-ok";
        nodo.textContent = texto;
      },
      error: function (texto) {
        clearInterval(iv);
        nodo.className = "nd-estado nd-error";
        nodo.textContent = texto;
      },
    };
  }

  /* ─────────────────────────── arranque ─────────────────────────── */

  function init() {
    var raiz = document.querySelector("[data-nd-panel]");
    if (!raiz) return;
    // Al navegar dentro del ERP el script se puede volver a ejecutar sobre un
    // DOM nuevo. La marca va en el nodo, no en window, para que ese caso vuelva
    // a cablearse y una segunda ejecución sobre el mismo DOM no duplique nada.
    if (raiz.getAttribute("data-nd-listo") === "1") return;
    raiz.setAttribute("data-nd-listo", "1");

    // Mapa clave -> {sku, name}, servido por la página. Los avisos y el escaneo
    // hablan en claves de archivo ("ND-0606-ARMYGREEN_46.glb"); el SKU real
    // ("ND-0606-ARMYGREEN#46") es lo que se busca en Shopify.
    var catalogo = {};
    var blob = raiz.querySelector("[data-nd-catalogo]");
    if (blob) {
      try {
        catalogo = JSON.parse(blob.textContent || "{}");
      } catch {
        catalogo = {};
      }
    }
    function skuDe(clave) {
      var p = catalogo[clave];
      return p && p.sku ? p.sku : clave || "—";
    }
    function nombreDe(clave) {
      var p = catalogo[clave];
      return p && p.name ? p.name : "";
    }

    cablearEscaneo(raiz, skuDe, nombreDe);
    cablearAvisos(raiz, skuDe);
    cablearTecnico(raiz, skuDe);
  }

  /* ───────────────────────────── escaneo ───────────────────────────── */

  function cablearEscaneo(raiz, skuDe, nombreDe) {
    var btn = raiz.querySelector("[data-nd-escanear]");
    var sel = raiz.querySelector("[data-nd-alcance]");
    var caja = raiz.querySelector('[data-nd-res="escaneo"]');
    var reloj = Reloj(raiz.querySelector('[data-nd-estado="escaneo"]'));
    if (!btn || !caja) return;

    function pintar(inf) {
      var h = "";

      h +=
        '<div class="nd-resumen">' +
        chip("Carpetas revisadas", num(inf.carpetasRevisadas)) +
        chip("Modelos vivos", num(inf.modelosVivos)) +
        chip("Piezas publicadas", num(inf.piezasPublicadas)) +
        chip("Sin publicar", num(inf.sinPublicar.length), inf.sinPublicar.length ? "avisa" : "") +
        chip(
          "Fichas sin archivo",
          num(inf.publicadasSinArchivo.length),
          inf.publicadasSinArchivo.length ? "mal" : "",
        ) +
        chip("Nombres duplicados", num(inf.duplicadas.length), inf.duplicadas.length ? "avisa" : "") +
        "</div>";

      /* --- candidatas a alta --- */
      h += '<h4 class="nd-h4">En Drive y sin publicar (' + inf.sinPublicar.length + ")</h4>";
      if (!inf.sinPublicar.length) {
        h += '<p class="nd-vacio">Nada nuevo: todos los GLB de Drive ya tienen ficha.</p>';
      } else {
        h +=
          '<div class="nd-acciones">' +
          '<button type="button" class="nd-btn nd-btn-sec" data-nd-todas>Seleccionar todo</button>' +
          '<button type="button" class="nd-btn" data-nd-publicar disabled>Publicar seleccionadas</button>' +
          '<span class="nd-nota">El alta crea la ficha con el SKU de nombre provisional y sin foto: ' +
          "la foto y la variante se cruzan luego contra Shopify.</span>" +
          "</div>";
        h += '<div class="nd-scroll"><table class="nd-tbl"><thead><tr>' +
          "<th></th><th>Clave que tendrá</th><th>Familia</th><th>SKU</th>" +
          "<th>Archivo en Drive</th><th>Carpeta</th><th class=nd-r>Peso</th>" +
          "<th>Modificado</th><th>Aviso</th></tr></thead><tbody>";
        for (var i = 0; i < inf.sinPublicar.length; i++) {
          var c = inf.sinPublicar[i];
          h +=
            "<tr" + (c.aviso ? ' class="nd-fila-avisa"' : "") + ">" +
            '<td><input type="checkbox" data-nd-clave="' + esc(c.file) + '"></td>' +
            "<td><code>" + esc(c.file) + "</code></td>" +
            "<td>" + esc(c.fam) + "</td>" +
            "<td><code>" + esc(c.sku) + "</code></td>" +
            "<td>" + linkDrive(c.driveId, c.driveName) + "</td>" +
            "<td>" + esc(c.carpetaNombre) + "</td>" +
            '<td class="nd-r nd-num">' + mb(c.sizeBytes) + "</td>" +
            "<td>" + fecha(c.modifiedTime) + "</td>" +
            '<td class="nd-aviso-celda">' + esc(c.aviso || "") + "</td>" +
            "</tr>";
        }
        h += "</tbody></table></div>";
      }

      /* --- fichas rotas --- */
      h +=
        '<h4 class="nd-h4">Publicadas sin archivo vivo (' +
        inf.publicadasSinArchivo.length +
        ")</h4>";
      if (!inf.publicadasSinArchivo.length) {
        h += '<p class="nd-vacio">Ninguna: todas las fichas resuelven su GLB por nombre.</p>';
      } else {
        h +=
          '<p class="nd-nota">Estas fichas no encuentran su archivo por nombre, así que la galería ' +
          "está sirviendo el id congelado — que puede estar en la papelera o ser una versión vieja. " +
          "Se arregla renombrando el GLB en Drive o corrigiendo el SKU de la ficha.</p>";
        h += '<div class="nd-scroll"><table class="nd-tbl"><thead><tr>' +
          "<th>Pieza</th><th>SKU</th><th>Clave buscada</th><th>¿Hay carpeta?</th>" +
          "<th>Sirviendo ahora</th></tr></thead><tbody>";
        for (var j = 0; j < inf.publicadasSinArchivo.length; j++) {
          var p = inf.publicadasSinArchivo[j];
          h +=
            '<tr class="nd-fila-mal">' +
            "<td><code>" + esc(p.file) + "</code><br><span class=nd-sub>" + esc(nombreDe(p.file)) + "</span></td>" +
            "<td><code>" + esc(p.sku || "—") + "</code></td>" +
            "<td><code>" + esc(p.claveBuscada) + "</code></td>" +
            "<td>" + (p.hayCarpeta ? "sí" : "<b>no</b>") + "</td>" +
            "<td>" + linkDrive(p.driveId, p.driveId) + "</td>" +
            "</tr>";
        }
        h += "</tbody></table></div>";
      }

      /* --- duplicados --- */
      if (inf.duplicadas.length) {
        h += '<h4 class="nd-h4">Mismo nombre dos veces (' + inf.duplicadas.length + ")</h4>";
        h +=
          '<p class="nd-nota">Hay dos GLB vivos que normalizan a la misma clave en la misma ' +
          "familia: el resolver se queda con el más reciente, así que el otro es invisible.</p>";
        h += '<div class="nd-scroll"><table class="nd-tbl"><thead><tr>' +
          "<th>Familia</th><th>Clave</th><th>Archivos</th></tr></thead><tbody>";
        for (var k = 0; k < inf.duplicadas.length; k++) {
          var d = inf.duplicadas[k];
          var arch = "";
          for (var a = 0; a < d.archivos.length; a++) {
            arch +=
              "<div>" +
              linkDrive(d.archivos[a].id, d.archivos[a].name) +
              ' <span class="nd-sub">· ' + esc(d.archivos[a].carpetaNombre) + "</span></div>";
          }
          h +=
            "<tr><td>" + esc(d.fam) + "</td><td><code>" + esc(d.clave) + "</code></td><td>" +
            arch + "</td></tr>";
        }
        h += "</tbody></table></div>";
      }

      caja.innerHTML = h;
      refrescarBotonPublicar();
    }

    function chip(etiqueta, valor, tono) {
      return (
        '<span class="nd-chip' + (tono ? " nd-chip-" + tono : "") + '">' +
        '<b>' + esc(valor) + "</b> " + esc(etiqueta) +
        "</span>"
      );
    }

    function seleccionadas() {
      var res = [];
      var cajas = caja.querySelectorAll("input[data-nd-clave]");
      for (var i = 0; i < cajas.length; i++) {
        if (cajas[i].checked) res.push(cajas[i].getAttribute("data-nd-clave"));
      }
      return res;
    }

    function refrescarBotonPublicar() {
      var b = caja.querySelector("[data-nd-publicar]");
      if (!b) return;
      var n = seleccionadas().length;
      b.disabled = n === 0;
      b.textContent = n ? "Publicar seleccionadas (" + n + ")" : "Publicar seleccionadas";
    }

    function escanear(forzar) {
      var alcance = sel && sel.value === "todo" ? "todo" : "publicadas";
      var parar = reloj.arrancar(
        alcance === "todo" ? "Barriendo TODO el Drive…" : "Mirando las familias publicadas…",
      );
      btn.disabled = true;
      caja.innerHTML = "";
      return pedir(
        "/api/northdeco/admin/escanear?alcance=" + alcance + (forzar ? "&forzar=1" : ""),
        { credentials: "same-origin" },
      )
        .then(function (inf) {
          var s = parar();
          pintar(inf);
          reloj.ok(
            "Drive leído en " + s + " s · " + inf.carpetasRevisadas + " carpetas · " +
            inf.modelosVivos + " modelos vivos",
          );
          return true;
        })
        .catch(function (e) {
          parar();
          reloj.error(e.message || "No se pudo escanear.");
          return false;
        })
        .then(function (bien) {
          btn.disabled = false;
          return bien;
        });
    }

    btn.addEventListener("click", function () {
      escanear(true);
    });

    // Delegación: las tablas se repintan enteras en cada escaneo, así que
    // enganchar los listeners a las filas obligaría a recablear cada vez.
    caja.addEventListener("change", function (ev) {
      if (ev.target && ev.target.getAttribute("data-nd-clave")) refrescarBotonPublicar();
    });

    caja.addEventListener("click", function (ev) {
      var t = ev.target;
      if (!t) return;

      if (t.hasAttribute && t.hasAttribute("data-nd-todas")) {
        var cajas = caja.querySelectorAll("input[data-nd-clave]");
        // Alterna: si ya estaban todas marcadas, desmarca.
        var todas = true;
        for (var i = 0; i < cajas.length; i++) if (!cajas[i].checked) todas = false;
        for (var j = 0; j < cajas.length; j++) cajas[j].checked = !todas;
        refrescarBotonPublicar();
        return;
      }

      if (t.hasAttribute && t.hasAttribute("data-nd-publicar")) {
        var claves = seleccionadas();
        if (!claves.length) return;
        if (
          !window.confirm(
            "Se van a publicar " + claves.length +
            " pieza(s) en la galería que ve el cliente.\n\n¿Seguir?",
          )
        ) {
          return;
        }
        t.disabled = true;
        var parar = reloj.arrancar("Publicando…");
        pedir("/api/northdeco/admin/publicar", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ claves: claves }),
        })
          .then(function (r) {
            parar();
            var fallidas = r.fallidas || [];
            var partes = [];
            if (r.publicadas.length) partes.push(r.publicadas.length + " dadas de alta");
            if (r.reenganchadas.length)
              partes.push(r.reenganchadas.length + " reenganchadas a su ficha existente");
            if (r.noEncontradas.length)
              partes.push(r.noEncontradas.length + " ya no estaban en Drive");
            if (fallidas.length) partes.push(fallidas.length + " CON ERROR");
            var resumen = partes.length ? partes.join(" · ") : "Sin cambios.";
            // Se vuelve a escanear forzando: si no, la caché de 5 min seguiría
            // enseñando como "sin publicar" lo que se acaba de publicar. El
            // resumen del alta se repone DESPUÉS, o el escaneo lo borraría de
            // la pantalla antes de que a nadie le diera tiempo a leerlo.
            return escanear(true).then(function (bien) {
              if (!bien) return;
              // Un alta parcial NO puede pasar por buena: el resto del lote sí
              // se ha aplicado, así que el resumen en verde a secas haría creer
              // que entró todo. Se pinta en rojo y con el motivo de la primera,
              // que es lo que se necesita para decidir si reintentar.
              if (fallidas.length) {
                reloj.error(
                  resumen + " — " + fallidas[0].clave + ": " + fallidas[0].motivo,
                );
              } else {
                reloj.ok(resumen + " · escaneo actualizado");
              }
            });
          })
          .catch(function (e) {
            parar();
            reloj.error(e.message || "No se pudo publicar.");
            t.disabled = false;
          });
      }
    });
  }

  /* ───────────────────────────── avisos ───────────────────────────── */

  var GRAVEDADES = [
    { k: "alta", etiqueta: "Grave — la galería está sirviendo algo que no toca" },
    { k: "media", etiqueta: "Media — no se ve hoy, pero es una bomba de relojería" },
    { k: "baja", etiqueta: "Baja — mejorable" },
  ];

  function cablearAvisos(raiz, skuDe) {
    var btn = raiz.querySelector("[data-nd-avisos]");
    var caja = raiz.querySelector('[data-nd-res="avisos"]');
    var cabeceras = raiz.querySelector("[data-nd-cabeceras]");
    var reloj = Reloj(raiz.querySelector('[data-nd-estado="avisos"]'));
    if (!btn || !caja) return;

    function pintar(inf) {
      var h = "";

      if (inf.parcial) {
        h +=
          '<p class="nd-alerta">Drive falló en algún punto: el informe está INCOMPLETO. ' +
          '"Sin avisos" aquí no significa "todo bien".</p>';
      }

      // Recuento por tipo, solo los que tienen algo: un contador a 0 no aporta.
      var tipos = Object.keys(inf.resumen || {}).filter(function (t) {
        return inf.resumen[t] > 0;
      });
      h += '<div class="nd-resumen">';
      h += '<span class="nd-chip"><b>' + num(inf.piezas) + "</b> piezas auditadas</span>";
      h += '<span class="nd-chip"><b>' + num(inf.archivosRevisados) + "</b> archivos vistos</span>";
      for (var t = 0; t < tipos.length; t++) {
        h +=
          '<span class="nd-chip nd-chip-avisa"><b>' + inf.resumen[tipos[t]] + "</b> " +
          esc(tipos[t]) + "</span>";
      }
      h += "</div>";

      if (!inf.avisos.length) {
        h += '<p class="nd-vacio">Sin avisos. Drive y la galería dicen lo mismo.</p>';
        caja.innerHTML = h;
        return;
      }

      for (var g = 0; g < GRAVEDADES.length; g++) {
        var grav = GRAVEDADES[g];
        var lote = inf.avisos.filter(function (a) {
          return a.gravedad === grav.k;
        });
        if (!lote.length) continue;

        h +=
          '<h4 class="nd-h4 nd-grav-' + grav.k + '">' +
          esc(grav.etiqueta) + " <span class=nd-sub>(" + lote.length + ")</span></h4>";
        h += '<ul class="nd-avisos">';
        for (var i = 0; i < lote.length; i++) {
          var a = lote[i];
          h +=
            '<li class="nd-aviso nd-aviso-' + esc(a.gravedad) + '">' +
            '<div class="nd-aviso-cab">' +
            '<span class="nd-tipo">' + esc(a.tipo) + "</span>" +
            '<span class="nd-sku">' + esc(a.pieza ? skuDe(a.pieza) : a.fam) + "</span>" +
            (a.pieza ? '<code class="nd-sub">' + esc(a.pieza) + "</code>" : "") +
            "</div>" +
            '<div class="nd-aviso-msg">' + esc(a.mensaje) + "</div>" +
            (a.detalle ? '<div class="nd-sub">' + esc(a.detalle) + "</div>" : "") +
            (a.enlace
              ? '<div><a class="nd-link" target="_blank" rel="noopener noreferrer" href="' +
                esc(a.enlace) + '">Abrir en Drive &#8599;</a></div>'
              : "") +
            "</li>";
        }
        h += "</ul>";
      }
      caja.innerHTML = h;
    }

    btn.addEventListener("click", function () {
      var completo = !cabeceras || cabeceras.checked;
      var parar = reloj.arrancar(
        completo
          ? "Auditando (lee la cabecera de cada GLB, ~25 s en frío)…"
          : "Auditando solo metadatos (~10 s)…",
      );
      btn.disabled = true;
      caja.innerHTML = "";
      pedir("/api/northdeco/admin/avisos?cabeceras=" + (completo ? "1" : "0"), {
        credentials: "same-origin",
      })
        .then(function (inf) {
          var s = parar();
          pintar(inf);
          reloj.ok(inf.avisos.length + " avisos · " + s + " s");
        })
        .catch(function (e) {
          parar();
          reloj.error(e.message || "No se pudo auditar.");
        })
        .then(function () {
          btn.disabled = false;
        });
    });
  }

  /* ──────────────────────────── ficha técnica ──────────────────────────── */

  function cablearTecnico(raiz, skuDe) {
    var btn = raiz.querySelector("[data-nd-tecnico]");
    var caja = raiz.querySelector('[data-nd-res="tecnico"]');
    var soloPesados = raiz.querySelector("[data-nd-pesados]");
    var porPeso = raiz.querySelector("[data-nd-porpeso]");
    var reloj = Reloj(raiz.querySelector('[data-nd-estado="tecnico"]'));
    if (!btn || !caja) return;

    var ultimo = null; // se guarda para repintar al cambiar filtro sin volver a Drive

    function pintar() {
      if (!ultimo) return;
      var umbral = ultimo.umbralPesoBytes || 15000000;
      var filas = ultimo.filas.slice();

      if (soloPesados && soloPesados.checked) {
        filas = filas.filter(function (f) {
          return typeof f.tecnico.bytes === "number" && f.tecnico.bytes > umbral;
        });
      }
      if (porPeso && porPeso.checked) {
        filas.sort(function (a, b) {
          return (b.tecnico.bytes || 0) - (a.tecnico.bytes || 0);
        });
      }

      var pesadas = 0;
      var papelera = 0;
      var fallos = 0;
      var total = 0;
      for (var i = 0; i < ultimo.filas.length; i++) {
        var tt = ultimo.filas[i].tecnico;
        if (typeof tt.bytes === "number") {
          total += tt.bytes;
          if (tt.bytes > umbral) pesadas++;
        }
        if (tt.enPapelera) papelera++;
        if (tt.error) fallos++;
      }

      var h =
        '<div class="nd-resumen">' +
        '<span class="nd-chip"><b>' + ultimo.filas.length + "</b> piezas</span>" +
        '<span class="nd-chip"><b>' + mb(total) + "</b> en total</span>" +
        '<span class="nd-chip' + (pesadas ? " nd-chip-avisa" : "") + '"><b>' + pesadas +
        "</b> por encima de " + mb(umbral) + "</span>" +
        '<span class="nd-chip' + (papelera ? " nd-chip-mal" : "") + '"><b>' + papelera +
        "</b> sirviéndose desde la papelera</span>" +
        (fallos ? '<span class="nd-chip nd-chip-mal"><b>' + fallos + "</b> sin leer</span>" : "") +
        "</div>";

      h += '<div class="nd-scroll"><table class="nd-tbl"><thead><tr>' +
        "<th>Pieza</th><th>Archivo en Drive</th><th class=nd-r>Peso</th><th>Modificado</th>" +
        "<th class=nd-r>Vértices</th><th class=nd-r>Triángulos</th><th>Generador</th>" +
        "<th>Drive</th></tr></thead><tbody>";

      if (!filas.length) {
        h += '<tr><td colspan="8" class="nd-vacio">Nada que enseñar con este filtro.</td></tr>';
      }

      for (var j = 0; j < filas.length; j++) {
        var f = filas[j];
        var t = f.tecnico;
        var pesada = typeof t.bytes === "number" && t.bytes > umbral;
        var clases = [];
        if (pesada) clases.push("nd-fila-avisa");
        if (t.enPapelera || t.error) clases.push("nd-fila-mal");

        h +=
          "<tr" + (clases.length ? ' class="' + clases.join(" ") + '"' : "") + ">" +
          "<td><b>" + esc(skuDe(f.file)) + "</b>" +
          (f.publicada ? "" : ' <span class="nd-etq">oculta</span>') +
          '<br><span class="nd-sub">' + esc(f.name) + "</span></td>" +
          "<td>" + (t.nombre ? "<code>" + esc(t.nombre) + "</code>" : '<span class="nd-sub">—</span>') +
          (t.enPapelera ? ' <span class="nd-etq nd-etq-mal">EN PAPELERA</span>' : "") +
          (t.error ? '<br><span class="nd-sub nd-error">' + esc(t.error) + "</span>" : "") +
          "</td>" +
          '<td class="nd-r nd-num' + (pesada ? " nd-peso-alto" : "") + '">' + mb(t.bytes) + "</td>" +
          "<td>" + fecha(t.modificado) + "</td>" +
          '<td class="nd-r nd-num">' + num(t.vertices) + "</td>" +
          '<td class="nd-r nd-num">' + num(t.triangulos) + "</td>" +
          '<td><span class="nd-sub">' + esc(t.generador || "—") + "</span>" +
          '<br><span class="nd-etq">' + esc(t.origen) + "</span></td>" +
          "<td>" + linkDrive(t.driveId, "abrir") + "</td>" +
          "</tr>";
      }
      h += "</tbody></table></div>";
      caja.innerHTML = h;
    }

    if (soloPesados) soloPesados.addEventListener("change", pintar);
    if (porPeso) porPeso.addEventListener("change", pintar);

    btn.addEventListener("click", function () {
      var parar = reloj.arrancar("Leyendo la cabecera de cada GLB en Drive (~23 s en frío)…");
      btn.disabled = true;
      caja.innerHTML = "";
      pedir("/api/northdeco/admin/tecnico", { credentials: "same-origin" })
        .then(function (datos) {
          var s = parar();
          ultimo = datos;
          pintar();
          reloj.ok(datos.filas.length + " fichas · " + s + " s");
        })
        .catch(function (e) {
          parar();
          reloj.error(e.message || "No se pudieron leer las fichas.");
        })
        .then(function () {
          btn.disabled = false;
        });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
