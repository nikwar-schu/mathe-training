import { test } from "node:test";
import assert from "node:assert/strict";

import { AbschnittFehler, schneideAbschnitt } from "./abschnitt.mjs";

const HTML = `
<h2 id="teil-a">Teil A</h2>
<div class="section-head">
  <h3 id="tangente">Tangente <em>und</em> Normale</h3>
  <span class="nav-links"><a href="#inhalt">↑ Inhalt</a></span>
</div>
<p>Inhalt der Tangente</p>
<!-- Notiz -->
<h4 id="tangente-parallel">Unterabschnitt</h4>
<p>gehört noch dazu</p>

<!-- ------------------------------------------------------------ -->
<div class="section-head">
  <h3 id="normale">Normale</h3>
</div>
<p>Normale</p>
<h2 id="teil-b">Teil B</h2>`;

test("Abschnitt reicht bis zum nächsten h3 und behält Unterabschnitte", () => {
  const { titel, html } = schneideAbschnitt(HTML, "tangente");
  assert.equal(titel, "Tangente und Normale");
  assert.match(html, /^<p>Inhalt der Tangente<\/p>/);
  assert.match(html, /gehört noch dazu/);
  assert.doesNotMatch(html, /nav-links|Notiz|Normale<\/p>/);
});

test("Letzter Abschnitt endet vor dem nächsten Teil", () => {
  assert.equal(schneideAbschnitt(HTML, "normale").html, "<p>Normale</p>");
});

test("Unbekannte oder ungültige Anker werden abgelehnt", () => {
  assert.throws(() => schneideAbschnitt(HTML, "gibt-es-nicht"), AbschnittFehler);
  assert.throws(() => schneideAbschnitt(HTML, 'x" onload="'), AbschnittFehler);
  assert.throws(() => schneideAbschnitt(HTML, "tangente-parallel"), AbschnittFehler);
});
