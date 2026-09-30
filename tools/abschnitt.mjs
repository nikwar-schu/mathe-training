/**
 * Schneidet einen Abschnitt (Überschrift h3 mit Anker bis zum nächsten Abschnitt) aus der
 * Zusammenfassung heraus. Die Zusammenfassung ist generiertes, gleichförmiges HTML; ein
 * String-Schnitt reicht deshalb und kommt ohne HTML-Parser-Abhängigkeit aus.
 */

export class AbschnittFehler extends Error {}

const ANKER_MUSTER = /^[a-z0-9-]+$/;
const ABSCHNITTSENDEN = [/<!--\s*-{5,}/, /<div class="section-head"/, /<h2[\s>]/, /<\/main>/, /<\/section>/];
// Rest des Abschnittskopfs nach der h3: optionale Navigation und das schließende div.
const KOPF_REST = /^\s*(<span class="nav-links">[\s\S]*?<\/span>\s*)?<\/div>/;
const KOMMENTARE = /<!--[\s\S]*?-->/g;

function ohneTags(html) {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

/** Liefert Titel und HTML-Inhalt des Abschnitts mit der ID `anker`. */
export function schneideAbschnitt(html, anker) {
  if (!ANKER_MUSTER.test(anker ?? "")) {
    throw new AbschnittFehler(`„${anker}“ ist kein gültiger Anker (nur Kleinbuchstaben, Ziffern, Bindestriche).`);
  }
  const kopf = new RegExp(`<h3[^>]*\\bid="${anker}"[^>]*>([\\s\\S]*?)</h3>`).exec(html);
  if (!kopf) {
    throw new AbschnittFehler(`In der Zusammenfassung gibt es keine h3-Überschrift mit id="${anker}".`);
  }

  const rest = html.slice(kopf.index + kopf[0].length).replace(KOPF_REST, "");
  const ende = Math.min(
    ...ABSCHNITTSENDEN.map((muster) => {
      const treffer = muster.exec(rest);
      return treffer ? treffer.index : rest.length;
    }),
  );
  const inhalt = rest.slice(0, ende).replace(KOMMENTARE, "").trim();
  if (inhalt === "") {
    throw new AbschnittFehler(`Der Abschnitt „${anker}“ ist leer.`);
  }
  return { titel: ohneTags(kopf[1]), html: inhalt };
}
