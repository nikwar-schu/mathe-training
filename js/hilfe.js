/**
 * Bereitet den Aufschrieb aus der Zusammenfassung für den Hilfe-Dialog auf.
 *
 * Der Inhalt stammt aus dem eigenen Repo, wird aber trotzdem bereinigt: keine Skripte, keine
 * Event-Handler. Interne Links zeigen auf Abschnitte, die es in der App nicht gibt; sie werden
 * deshalb zu normalem Text.
 */

const VERBOTENE_ELEMENTE = "script, style, iframe, object, embed, link, meta, form, .nav-links";

function bereinige(wurzel) {
  wurzel.querySelectorAll(VERBOTENE_ELEMENTE).forEach((element) => element.remove());
  wurzel.querySelectorAll("*").forEach((element) => {
    [...element.attributes]
      .filter((attribut) => attribut.name.startsWith("on") || /^\s*javascript:/i.test(attribut.value))
      .forEach((attribut) => element.removeAttribute(attribut.name));
  });
  wurzel.querySelectorAll('a[href^="#"]').forEach((link) => {
    const text = document.createElement("span");
    text.className = "verweis";
    text.append(...link.childNodes);
    link.replaceWith(text);
  });
  wurzel.querySelectorAll("a[href]").forEach((link) => {
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  });
}

/** Liefert ein bereinigtes DocumentFragment aus dem HTML eines Abschnitts. */
export function hilfeInhalt(html) {
  const vorlage = document.createElement("template");
  vorlage.innerHTML = html;
  bereinige(vorlage.content);
  return vorlage.content;
}
