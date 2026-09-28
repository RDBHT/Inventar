'use strict';
// Demo-Adapter fuer GitHub Pages: beantwortet die Aufrufe von inventar.js im Browser, statt api.php.
// Startbestand aus daten.json, Aenderungen nur im localStorage dieses Browsers. Keine Anmeldung.
(function () {
  const SCHLUESSEL = 'inventar-demo-v1';
  const MAX_DATEI = 1024 * 1024;
  const basis = location.origin + location.pathname.replace(/\/[^/]*$/, '');
  let zustand = null;

  const heute = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  const jetzt = () => heute() + ' ' + new Date().toTimeString().slice(0, 8);
  const code = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), b => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
  const fehler = t => { throw new Error(t); };

  function speichern() {
    try { localStorage.setItem(SCHLUESSEL, JSON.stringify(zustand)); }
    catch (e) { fehler('Speicher des Browsers voll — Demo zurücksetzen oder Dateien löschen'); }
  }

  async function laden() {
    if (zustand) return zustand;
    try { zustand = JSON.parse(localStorage.getItem(SCHLUESSEL) || 'null'); } catch (e) { zustand = null; }
    if (!zustand) {
      const r = await fetch('daten.json', { cache: 'no-cache' });
      const d = await r.json();
      zustand = { items: d.items, zaehler: Math.max(0, ...d.items.map(i => Number(i.id.slice(4)))), naechsteDok: 1000 };
      speichern();
    }
    return zustand;
  }

  function datumOk(d) {
    d = String(d || '').trim();
    if (!d) return '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || isNaN(new Date(d + 'T12:00:00'))) fehler('Ungültiges Datum: ' + d);
    return d;
  }

  function plusMonate(iso, n) {
    const d = new Date(iso + 'T12:00:00');
    d.setMonth(d.getMonth() + n);
    return d.toISOString().slice(0, 10);
  }

  function aufbereiten(it) {
    const pruef = [...(it.pruefungen || [])].sort((a, b) => (a.datum < b.datum ? 1 : -1));
    const letzte = pruef[0] ? pruef[0].datum : '';
    const bas = letzte || it.anschaffung;
    return {
      ...it,
      pruefungen: pruef,
      letztePruefung: letzte,
      naechstePruefung: it.kontrolle && it.intervallMonate > 0 && bas ? plusMonate(bas, it.intervallMonate) : '',
      oeffPfad: 'i/' + it.id + '-' + it.code,
    };
  }

  function finde(id) {
    const it = zustand.items.find(i => i.id === id);
    if (!it) fehler('Item nicht gefunden');
    return it;
  }

  const antwortItem = it => ({ item: aufbereiten(it) });
  const alsDataUrl = f => new Promise((ok, nein) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = nein; r.readAsDataURL(f); });
  const nichtInDerDemo = () => fehler('In der Demo nicht verfügbar.');

  async function api(aktion, d = {}, fd) {
    await laden();
    switch (aktion) {
      case 'status':
        return {
          eingerichtet: true, angemeldet: true, benutzer: { email: 'demo@beispiel.de', name: 'Demo' },
          basisUrl: basis, traeger: 'WBG Inventar', maxUploadMb: 1, endungen: ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'txt'], lokal: false,
          version: '0.4.0', fusszeile: 'R.D. – WBG',
        };
      case 'liste':
        return { items: zustand.items.map(aufbereiten) };
      case 'speichern': {
        const name = String(d.name || '').trim();
        if (!name) fehler('Name fehlt');
        if (d.hwRef && !/^HW-\d{3,}$/.test(d.hwRef)) fehler('HW-Verweis im Format HW-001');
        const werte = {
          name: name.slice(0, 200), kategorie: String(d.kategorie || '').trim().slice(0, 80), standort: String(d.standort || '').trim().slice(0, 200),
          anschaffung: datumOk(d.anschaffung), ablauf: datumOk(d.ablauf), kontrolle: !!d.kontrolle,
          intervallMonate: d.kontrolle ? Math.max(0, Math.min(600, Number(d.intervallMonate) || 0)) : 0,
          hwRef: String(d.hwRef || ''), notiz: String(d.notiz || '').slice(0, 4000), oeffName: String(d.oeffName || '').trim().slice(0, 200),
          oeffHinweis: String(d.oeffHinweis || '').slice(0, 1000), status: d.status === 'ausgesondert' ? 'ausgesondert' : 'aktiv',
          geaendert: jetzt(), geaendertVon: 'Demo',
        };
        let it;
        if (d.id) { it = finde(d.id); Object.assign(it, werte); }
        else {
          zustand.zaehler += 1;
          it = { id: 'INV-' + String(zustand.zaehler).padStart(4, '0'), code: code(), erstellt: jetzt(), dokumente: [], pruefungen: [], ...werte };
          zustand.items.push(it);
        }
        speichern();
        return antwortItem(it);
      }
      case 'loeschen':
        zustand.items = zustand.items.filter(i => i.id !== d.id);
        speichern();
        return { ok: true };
      case 'hochladen': {
        const it = finde(fd.get('item_id'));
        const f = fd.get('datei');
        if (!f || !f.size) fehler('Bitte eine Datei wählen.');
        if (f.size > MAX_DATEI) fehler('In der Demo höchstens 1 MB je Datei.');
        const endung = (f.name.split('.').pop() || '').toLowerCase();
        if (!['pdf', 'jpg', 'jpeg', 'png', 'webp', 'txt'].includes(endung)) fehler('Dateityp nicht erlaubt');
        zustand.naechsteDok += 1;
        it.dokumente.push({
          id: zustand.naechsteDok, bezeichnung: String(fd.get('bezeichnung') || '').trim() || f.name, original: f.name,
          mime: f.type || 'application/octet-stream', groesse: f.size, oeffentlich: fd.get('oeffentlich') === '1',
          hochgeladen: jetzt(), daten: await alsDataUrl(f),
        });
        speichern();
        return antwortItem(it);
      }
      case 'dokument': {
        const it = finde(d.itemId);
        const dok = it.dokumente.find(x => x.id === d.id) || fehler('Dokument nicht gefunden');
        if (!String(d.bezeichnung || '').trim()) fehler('Bezeichnung fehlt');
        dok.bezeichnung = String(d.bezeichnung).trim().slice(0, 200);
        dok.oeffentlich = !!d.oeffentlich;
        speichern();
        return antwortItem(it);
      }
      case 'dokument_loeschen': {
        const it = zustand.items.find(i => i.dokumente.some(x => x.id === d.id)) || fehler('Dokument nicht gefunden');
        it.dokumente = it.dokumente.filter(x => x.id !== d.id);
        speichern();
        return antwortItem(it);
      }
      case 'pruefung': {
        const it = finde(d.itemId);
        const datum = datumOk(d.datum);
        if (!datum) fehler('Prüfdatum fehlt');
        if (datum > heute()) fehler('Prüfdatum liegt in der Zukunft');
        it.pruefungen.push({ id: Date.now(), datum, notiz: String(d.notiz || '').slice(0, 500) });
        speichern();
        return antwortItem(it);
      }
      case 'pruefung_loeschen': {
        const it = finde(d.itemId);
        it.pruefungen = it.pruefungen.filter(p => p.id !== d.id);
        speichern();
        return antwortItem(it);
      }
      case 'benutzer':
        return { benutzer: [{ id: 1, email: 'demo@beispiel.de', name: 'Demo', ich: true, status: 'aktiv', zuletzt: '', codeFehler: 0, eingeladenVon: '' }] };
      case 'abmelden':
        localStorage.removeItem(SCHLUESSEL);
        return { ok: true };
      default:
        return nichtInDerDemo();
    }
  }

  // Dokumente: aus daten.json als Datei im Repo, im Browser hochgeladene als Blob.
  function dateiUrl(d) {
    if (d.url) return d.url;
    if (!d.daten) return '#';
    const [kopf, inhalt] = d.daten.split(',');
    const bytes = Uint8Array.from(atob(inhalt), c => c.charCodeAt(0));
    return URL.createObjectURL(new Blob([bytes], { type: kopf.slice(5).split(';')[0] }));
  }

  window.InventarDemo = { api, dateiUrl };

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('abmelden-btn').textContent = 'Demo zurücksetzen';
    document.getElementById('sicherung-btn').hidden = true;
    document.getElementById('json-btn').addEventListener('click', async e => {
      e.preventDefault();
      await laden();
      const blob = new Blob([JSON.stringify({ format: 'wbg-inventar/1', exportiert: jetzt(), basisUrl: basis, items: zustand.items.map(aufbereiten) }, null, 1)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'inventar-demo-' + heute() + '.json';
      a.click();
    });
  });
})();
