'use strict';
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  let cfg = {};
  let items = [];
  let filter = 'alle';
  let aktuell = null;       // Item im Detail (null = neu)
  let formStand = '';       // fuer „ungespeicherte Aenderungen"

  // ---------- Hilfen ----------
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const heute = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  const plusTage = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const deDatum = iso => iso ? iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.' + iso.slice(0, 4) : '';
  const groesse = b => b > 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
  const oeffUrl = it => cfg.basisUrl + '/' + it.oeffPfad;
  const dateiUrl = d => window.InventarDemo ? window.InventarDemo.dateiUrl(d) : 'api.php?a=datei&id=' + d.id;

  function melde(text) {
    const m = $('#meldung');
    // Ein offenes Fenster liegt ueber allem — der Hinweis muss in das Fenster, sonst ist er unsichtbar.
    const host = document.querySelector('dialog[open]') || document.body;
    if (m.parentNode !== host) host.appendChild(m);
    m.textContent = text;
    m.classList.add('an');
    clearTimeout(melde.t);
    melde.t = setTimeout(() => m.classList.remove('an'), 2200);
  }

  async function api(aktion, daten, formData) {
    // Demo (GitHub Pages): ein Adapter im Browser ersetzt den Server, die Oberflaeche bleibt dieselbe.
    if (window.InventarDemo) return window.InventarDemo.api(aktion, daten, formData);
    const opt = { method: daten || formData ? 'POST' : 'GET', headers: { 'X-Inventar': '1' }, credentials: 'same-origin' };
    if (formData) opt.body = formData;
    else if (daten) { opt.body = JSON.stringify(daten); opt.headers['Content-Type'] = 'application/json'; }
    const r = await fetch('api.php?a=' + aktion, opt);
    let j = {};
    try { j = await r.json(); } catch (e) { j = { fehler: 'Antwort nicht lesbar (' + r.status + ')' }; }
    if (r.status === 401 && aktion !== 'anmelden' && aktion !== 'code') { zeigeAnmeldung(); throw new Error('Nicht angemeldet'); }
    if (!r.ok) throw new Error(j.fehler || 'Fehler ' + r.status);
    return j;
  }

  // ---------- Zustand eines Items ----------
  function lage(it) {
    const h = heute(), b = [];
    if (it.status === 'ausgesondert') b.push(['ausgesondert', '']);
    if (it.kontrolle) {
      if (!it.naechstePruefung) b.push(['Erstprüfung offen', 'gelb', 'pruef']);
      else if (it.naechstePruefung <= h) b.push(['Prüfung fällig seit ' + deDatum(it.naechstePruefung), 'rot', 'pruef']);
      else if (it.naechstePruefung <= plusTage(h, 30)) b.push(['Prüfung bis ' + deDatum(it.naechstePruefung), 'gelb', 'pruef']);
      else b.push(['geprüft', 'gruen']);
    }
    if (it.ablauf) {
      if (it.ablauf < h) b.push(['abgelaufen ' + deDatum(it.ablauf), 'rot', 'ablauf']);
      else if (it.ablauf <= plusTage(h, 60)) b.push(['läuft ab ' + deDatum(it.ablauf), 'gelb', 'ablauf']);
    }
    return b;
  }

  // ---------- Liste ----------
  function passt(it) {
    const b = lage(it);
    if (filter === 'ausgesondert') { if (it.status !== 'ausgesondert') return false; }
    else if (it.status === 'ausgesondert' && filter !== 'alle') return false;
    if (filter === 'faellig' && !b.some(x => x[2] === 'pruef')) return false;
    if (filter === 'ablauf' && !b.some(x => x[2] === 'ablauf')) return false;
    const kat = $('#kategorie-filter').value;
    if (kat && it.kategorie !== kat) return false;
    const q = $('#suche').value.trim().toLowerCase();
    if (!q) return true;
    const heu = [it.id, it.name, it.kategorie, it.standort, it.hwRef, it.notiz, it.oeffName, ...it.dokumente.map(d => d.bezeichnung)].join(' ').toLowerCase();
    return q.split(/\s+/).every(w => heu.includes(w));
  }

  function sichtbare() {
    return items.filter(passt).sort((a, b) => {
      if (filter === 'faellig') return (a.naechstePruefung || '0') < (b.naechstePruefung || '0') ? -1 : 1;
      if (filter === 'ablauf') return a.ablauf < b.ablauf ? -1 : 1;
      return a.id < b.id ? 1 : -1; // neueste zuerst
    });
  }

  function renderListe() {
    const liste = sichtbare();
    $('#zaehlung').textContent = liste.length === items.length ? `${items.length} Einträge` : `${liste.length} von ${items.length}`;
    $('#leer').hidden = items.length > 0;
    $('#liste').innerHTML = liste.map(it => {
      const meta = [it.kategorie, it.standort, it.dokumente.length ? it.dokumente.length + ' Dok.' : ''].filter(Boolean).join(' · ');
      const badges = lage(it).map(([t, k]) => `<span class="badge ${k}">${esc(t)}</span>`).join('');
      return `<button type="button" class="zeile${it.status === 'ausgesondert' ? ' aus' : ''}" data-id="${esc(it.id)}">
        <span class="zid">${esc(it.id)}</span><span class="zname">${esc(it.name)}</span>
        <span class="zbadges">${badges}</span><span class="zmeta">${esc(meta)}</span></button>`;
    }).join('') || (items.length ? '<p class="leer">Keine Treffer.</p>' : '');
    renderKategorien();
  }

  function renderKategorien() {
    const kats = [...new Set(items.map(i => i.kategorie).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
    const sel = $('#kategorie-filter'), alt = sel.value;
    sel.innerHTML = '<option value="">Alle Kategorien</option>' + kats.map(k => `<option>${esc(k)}</option>`).join('');
    sel.value = kats.includes(alt) ? alt : '';
    const vorschlag = [...new Set([...kats, 'Arbeitsplatz', 'Notebook', 'Mobilgerät', 'Drucker', 'Netzwerk', 'Kabel', 'Brandschutz', 'Erste Hilfe', 'Möbel', 'Werkzeug'])];
    $('#kategorien').innerHTML = vorschlag.map(k => `<option value="${esc(k)}">`).join('');
    // Standorte: nur die schon erfassten vorschlagen, damit keine Schreibvarianten entstehen.
    const orte = [...new Set(items.map(i => i.standort).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
    $('#standorte').innerHTML = orte.map(o => `<option value="${esc(o)}">`).join('');
  }

  async function laden() {
    items = (await api('liste')).items;
    renderListe();
    let hash = '';
    try { hash = decodeURIComponent(location.hash.slice(1)); } catch (e) { hash = ''; }
    if (/^INV-\d+$/.test(hash)) {
      history.replaceState(null, '', location.pathname);
      const it = items.find(i => i.id === hash);
      if (it) oeffne(it);
    }
  }

  // ---------- QR ----------
  function qrSvg(text) {
    const q = qrcode(0, 'M');
    q.addData(text);
    q.make();
    return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  }

  function etiketten(liste) {
    if (!liste.length) { melde('Keine Einträge zum Drucken'); return; }
    // Der QR-Code enthaelt die feste Adresse. Laeuft diese Seite woanders (lokal, Test), fuehrt das Etikett ins Leere.
    const ziel = new URL(cfg.basisUrl);
    if (ziel.host !== location.host) {
      const text = `Etiketten gesperrt: Die QR-Codes zeigen auf ${ziel.host}, diese Seite läuft unter ${location.host}. Nur auf dem Server drucken.`;
      if ($('#detail').open) $('#form-fehler').textContent = text; else alert(text);
      return;
    }
    $('#druck').innerHTML = liste.map(it => `<div class="etikett"><div class="eqr">${qrSvg(oeffUrl(it))}</div>
      <div><div class="etr">${esc(cfg.traeger)}</div><div class="eid">${esc(it.id)}</div><div class="ename">${esc(it.oeffName || it.name)}</div></div></div>`).join('');
    window.print();
  }

  // ---------- Detail ----------
  const form = () => $('#item-form');

  function formDaten() {
    const f = form(), d = Object.fromEntries(new FormData(f));
    d.kontrolle = f.kontrolle.checked;
    d.intervallMonate = d.kontrolle ? Number(f.intervallMonate.value) : 0;
    if (aktuell) d.id = aktuell.id;
    return d;
  }

  // Setzt nur die Felder des Eintrags — kein form.reset(), das wuerde auch gewaehlte Datei und Pruefung loeschen.
  function fuelleForm(it) {
    const f = form();
    const w = it || { status: 'aktiv', intervallMonate: 12 };
    for (const k of ['name', 'kategorie', 'standort', 'anschaffung', 'ablauf', 'hwRef', 'notiz', 'oeffName', 'oeffHinweis', 'status']) f[k].value = w[k] || (k === 'status' ? 'aktiv' : '');
    f.kontrolle.checked = !!w.kontrolle;
    f.intervallMonate.value = String(w.intervallMonate || 12);
    $('#kontrolle-felder').hidden = !f.kontrolle.checked;
    $('#mehr').open = !!(w.hwRef || w.notiz || w.status === 'ausgesondert');
  }

  // behalte: Eingaben fuer Datei und Pruefung stehen lassen (nach Speichern des Eintrags selbst).
  function renderDetail(behalte = false) {
    const it = aktuell;
    $('#detail-id').textContent = it ? it.id : 'neu';
    $('#detail-titel').textContent = it ? it.name : 'Neues Item';
    $('#nach-anlage').hidden = !it;
    $('#vor-anlage').hidden = !!it;
    $('#loeschen-btn').hidden = !it;
    $('#kopie-btn').hidden = !it;
    $('#form-fehler').textContent = '';
    if (!it) { $('#pruef-stand').textContent = ''; return; }

    const url = oeffUrl(it);
    $('#qr').innerHTML = qrSvg(url);
    $('#qr-url').textContent = url;
    $('#oeff-link').href = it.oeffPfad;

    $('#pruef-stand').textContent = it.letztePruefung
      ? `Zuletzt geprüft ${deDatum(it.letztePruefung)} · nächste Prüfung ${deDatum(it.naechstePruefung)}`
      : (it.naechstePruefung ? `Noch keine Prüfung eingetragen · fällig ${deDatum(it.naechstePruefung)} (ab Anschaffung)` : 'Noch keine Prüfung eingetragen.');
    $('#pruefungen-block').hidden = !it.kontrolle && !it.pruefungen.length;
    // Nicht vorbelegen: Bei der Ersterfassung zaehlt das Datum auf der Plakette, nicht heute.
    if (!behalte) { $('#pruef-datum').value = ''; $('#pruef-notiz').value = ''; }
    $('#pruef-liste').innerHTML = it.pruefungen.map(p =>
      `<li><span>${deDatum(p.datum)}${p.notiz ? ' · ' + esc(p.notiz) : ''}</span><button type="button" class="linkknopf" data-pruef-weg="${p.id}">entfernen</button></li>`).join('');

    $('#dok-liste').innerHTML = it.dokumente.map(d => `<li data-dok="${d.id}">
        <input class="dok-bez" value="${esc(d.bezeichnung)}" aria-label="Bezeichnung" maxlength="200">
        <a href="${esc(dateiUrl(d))}" target="_blank" rel="noopener">öffnen</a>
        <div class="dok-meta"><label class="haken"><input type="checkbox" class="dok-oeff" ${d.oeffentlich ? 'checked' : ''}> öffentlich</label>
          <span>${esc(d.original)} · ${groesse(d.groesse)}</span>
          <button type="button" class="linkknopf" data-dok-weg="${d.id}">löschen</button></div></li>`).join('')
      || '<li class="leise ohne-rahmen">Noch keine Dokumente.</li>';
    if (!behalte) {
      $('#dok-bez').value = '';
      $('#dok-datei').value = '';
      $('#dok-oeff').checked = false;
    }
  }

  function oeffne(it) {
    aktuell = it || null;
    fuelleForm(aktuell);
    renderDetail();
    formStand = JSON.stringify(formDaten());
    if (!$('#detail').open) $('#detail').showModal();
    if (!it) form().name.focus();
  }

  // Datei und Pruefung werden ueber eigene Knoepfe uebernommen — was dort steht, geht beim Speichern oder Schliessen sonst still verloren.
  function offeneEingaben() {
    const offen = [];
    if ($('#dok-datei').files.length) offen.push('gewählte Datei (noch nicht hochgeladen)');
    if ($('#pruef-datum').value || $('#pruef-notiz').value.trim()) offen.push('Prüfung (noch nicht eingetragen)');
    return offen;
  }

  function schliessen() {
    const offen = offeneEingaben();
    if (JSON.stringify(formDaten()) !== formStand) offen.unshift('Änderungen am Eintrag');
    if (offen.length && !confirm('Nicht übernommen:\n– ' + offen.join('\n– ') + '\n\nTrotzdem schließen?')) return;
    $('#detail').close();
  }

  function uebernehmen(it, behalte = false) {
    const i = items.findIndex(x => x.id === it.id);
    if (i >= 0) items[i] = it; else items.push(it);
    aktuell = it;
    renderListe();
    renderDetail(behalte);
  }

  async function speichern(e) {
    e.preventDefault();
    const f = form(), knopf = $('#speichern-btn');
    if (knopf.disabled || !f.reportValidity()) return;
    const neu = !aktuell;
    // Waehrend der Anfrage gesperrt: ein Doppeltipp legte sonst zwei Eintraege an.
    knopf.disabled = true;
    try {
      $('#form-fehler').textContent = '';
      const { item } = await api('speichern', formDaten());
      fuelleForm(item);
      uebernehmen(item, true);
      formStand = JSON.stringify(formDaten());
      if (neu) {
        // Neu angelegt: offen lassen und zum QR-Code springen — Etikett, Dokumente und Pruefungen gehen jetzt.
        document.activeElement && document.activeElement.blur();
        $('#qr-block').scrollIntoView({ block: 'start' });
        melde(`${item.id} angelegt`);
      } else if (offeneEingaben().length) {
        // Gespeichert, aber Datei oder Pruefung stehen noch aus — offen lassen statt still zu verwerfen.
        $('#form-fehler').textContent = 'Gespeichert. Noch nicht übernommen: ' + offeneEingaben().join(', ') + ' — „Hochladen“ bzw. „Prüfung eintragen“ tippen.';
        melde(`${item.id} gespeichert`);
      } else {
        $('#detail').close();
        melde(`${item.id} gespeichert`);
      }
    } catch (err) {
      $('#form-fehler').textContent = err.message;
      $('#form-fehler').scrollIntoView({ block: 'nearest' });
    } finally {
      knopf.disabled = false;
    }
  }

  // Serienerfassung: neues Formular mit den Angaben des offenen Eintrags — ohne Notiz, HW-Nummer, Dokumente, Pruefungen.
  function weiteresWieDieses() {
    if (!aktuell) return;
    const offen = offeneEingaben();
    if (JSON.stringify(formDaten()) !== formStand) offen.unshift('Änderungen am Eintrag');
    if (offen.length && !confirm('Nicht übernommen:\n– ' + offen.join('\n– ') + '\n\nTrotzdem weiter?')) return;
    const v = { ...formDaten(), notiz: '', hwRef: '', status: 'aktiv' };
    delete v.id;
    aktuell = null;
    fuelleForm(v);
    renderDetail();
    formStand = JSON.stringify(formDaten());
    $('.detail-inhalt').scrollTop = 0;
    form().name.focus();
    form().name.select();
    melde('Vorlage übernommen — Name anpassen, speichern');
  }

  // ---------- Anmeldung ----------
  let modus = 'anmelden';   // anmelden | einrichten | einladung
  let einladungsToken = '';

  function zeigeAnmeldung(text) {
    $('#app').hidden = true;
    if ($('#detail').open) $('#detail').close();
    $('#anmeldung').hidden = false;
    if (modus !== 'einladung') modus = cfg.eingerichtet ? 'anmelden' : 'einrichten';
    const neuesKw = modus !== 'anmelden';
    $('#anmelde-text').textContent = text || {
      anmelden: 'Bitte mit E-Mail-Adresse und Kennwort anmelden.',
      einrichten: 'Erster Start: eigenen Zugang anlegen. Weitere Personen lädst du danach über „Zugänge verwalten“ ein.',
      einladung: 'Eigenes Kennwort festlegen (mindestens 12 Zeichen).',
    }[modus];
    $('#anmelde-email').readOnly = modus === 'einladung';
    $('#anmelde-name-feld').hidden = modus !== 'einrichten';
    $('#anmelde-einrichtcode-feld').hidden = modus !== 'einrichten';
    if (modus === 'einrichten' && !cfg.pruefung && !text) {
      $('#anmelde-text').textContent = 'Einrichtung gesperrt: Im Datenordner die Datei einrichtcode.txt mit einem Code von mindestens 32 Zeichen anlegen, dann neu laden.';
    }
    zeigePruefung();
    $('#anmelde-wdh-feld').hidden = !neuesKw;
    $('#anmelde-btn').textContent = { anmelden: 'Anmelden', einrichten: 'Zugang anlegen', einladung: 'Kennwort festlegen' }[modus];
    $('#anmelde-kennwort').autocomplete = neuesKw ? 'new-password' : 'current-password';
    (modus === 'einladung' ? $('#anmelde-kennwort') : $('#anmelde-email')).focus();
  }

  // Voraussetzungen des Servers — nur waehrend der Ersteinrichtung sichtbar. Der Server meldet, was er selbst
  // pruefen kann; Umleitung und Kopfzeilen prueft der Browser von aussen.
  async function zeigePruefung() {
    const block = $('#pruef-block');
    if (!cfg.pruefung) { block.hidden = true; return; }
    const zeilen = cfg.pruefung.map(([t, ok]) => [t, ok]);
    try {
      const r = await fetch('i/INV-0000-aaaaaaaa', { credentials: 'omit' });
      zeilen.push(['Adresse /i/… wird umgeleitet (QR-Seiten)', r.headers.get('x-inventar-seite') === 'oeffentlich']);
      const k = await fetch('./', { method: 'HEAD', credentials: 'omit' });
      zeilen.push(['Sicherheitsrichtlinie der Oberfläche', /frame-ancestors 'none'/.test(k.headers.get('content-security-policy') || '')]);
      if (!cfg.lokal) zeilen.push(['HSTS (nur HTTPS)', !!k.headers.get('strict-transport-security')]);
      const g = await fetch('konfig.php', { credentials: 'omit' });
      zeilen.push(['Interne Dateien gesperrt (konfig.php)', g.status === 403 || g.status === 404]);
    } catch (e) { zeilen.push(['Prüfung im Browser', false]); }
    $('#pruefliste').innerHTML = zeilen.map(([t, ok]) =>
      `<li><span class="${ok ? 'ok' : 'nein'}">${ok ? '✓' : '✗'}</span><span>${esc(t)}</span></li>`).join('');
    block.hidden = false;
  }

  async function zeigeApp() {
    $('#anmeldung').hidden = true;
    $('#app').hidden = false;
    $('#traeger').textContent = cfg.traeger;
    const ich = $('#ich');
    ich.textContent = cfg.benutzer ? (cfg.benutzer.name || cfg.benutzer.email) : '';
    ich.hidden = !cfg.benutzer;
    document.title = cfg.traeger;
    await laden();
  }

  $('#anmelde-form').addEventListener('submit', async e => {
    e.preventDefault();
    const email = $('#anmelde-email').value.trim(), pw = $('#anmelde-kennwort').value;
    const fehler = $('#anmelde-fehler');
    fehler.textContent = '';
    try {
      if (modus !== 'anmelden' && pw !== $('#anmelde-wdh').value) { fehler.textContent = 'Die Kennwörter stimmen nicht überein.'; return; }
      let r;
      if (modus === 'einrichten') r = await api('einrichten', { email, name: $('#anmelde-name').value, kennwort: pw, einrichtCode: $('#anmelde-einrichtcode').value });
      else if (modus === 'einladung') r = await api('einladung_annehmen', { token: einladungsToken, kennwort: pw });
      else r = await api('anmelden', { email, kennwort: pw });
      $('#anmelde-kennwort').value = $('#anmelde-wdh').value = $('#anmelde-einrichtcode').value = '';
      zeigeCodeSchritt(r);
    } catch (err) { fehler.textContent = err.message; }
  });

  function zeigeCodeSchritt(r) {
    const neu = r.schritt === 'einrichten2fa';
    $('#anmelde-form').hidden = true;
    $('#code-form').hidden = false;
    $('#totp-neu').hidden = !neu;
    $('#totp-alt').hidden = neu;
    if (neu) {
      $('#totp-qr').innerHTML = qrSvg(r.uri);
      $('#totp-geheimnis').textContent = r.geheimnis.match(/.{1,4}/g).join(' ');
    }
    $('#code-fehler').textContent = '';
    $('#code-eingabe').value = '';
    $('#code-eingabe').focus();
  }

  function zurueckZurAnmeldung(text) {
    $('#code-form').hidden = true;
    $('#anmelde-form').hidden = false;
    $('#totp-qr').innerHTML = '';
    $('#totp-geheimnis').textContent = '';
    // Eine Einladung bleibt gueltig, bis der erste Code bestaetigt ist — also im Einladungs-Modus bleiben.
    if (modus !== 'einladung' && modus !== 'einrichten') modus = 'anmelden';
    zeigeAnmeldung(text);
  }

  $('#code-form').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const r = await api('code', { code: $('#code-eingabe').value });
      $('#code-form').hidden = true;
      $('#anmelde-form').hidden = false;
      $('#totp-qr').innerHTML = '';
      $('#totp-geheimnis').textContent = '';
      modus = 'anmelden';
      einladungsToken = '';
      cfg = await api('status');
      await zeigeApp();
      if (r.fehlversuche > 0) {
        const w = $('#warnung');
        w.textContent = `${r.fehlversuche} falsche Code-Eingabe(n) seit der letzten Anmeldung. Falls das nicht du warst: sofort das Kennwort ändern.`;
        w.hidden = false;
      }
    } catch (err) {
      if (/neu anmelden|neuen Link/.test(err.message)) zurueckZurAnmeldung(err.message);
      else $('#code-fehler').textContent = err.message;
    }
  });
  $('#code-zurueck').addEventListener('click', () => zurueckZurAnmeldung());

  // ---------- Zugaenge ----------
  async function renderBenutzer() {
    const { benutzer } = await api('benutzer');
    $('#bn-liste').innerHTML = benutzer.map(b => `<li><span>${esc(b.name || b.email)}
        <span class="leise">${esc(b.email)} · ${esc(b.status)}${b.zuletzt ? ' · zuletzt ' + deDatum(b.zuletzt.slice(0, 10)) : ''}${b.eingeladenVon ? ' · eingeladen von ' + esc(b.eingeladenVon) : ''}${b.codeFehler ? ' · ' + b.codeFehler + ' falsche Codes' : ''}</span></span>
        ${b.ich ? '<span class="leise">du</span>' : `<span><button type="button" class="linkknopf" data-bn-neu="${esc(b.email)}">zurücksetzen</button>
          <button type="button" class="linkknopf" data-bn-weg="${b.id}" data-bn-mail="${esc(b.email)}">entfernen</button></span>`}</li>`).join('');
  }

  $('#benutzer-btn').addEventListener('click', async () => {
    $('.menue').open = false;
    $('#bn-fehler').textContent = '';
    $('#bn-link').hidden = true;
    $('#einladen-form').reset();
    $('#bn-bkw').value = $('#bn-bcode').value = '';
    $('#benutzer-dialog').showModal();
    try { await renderBenutzer(); } catch (err) { $('#bn-fehler').textContent = err.message; }
  });
  $('#bn-schliessen').addEventListener('click', () => { $('#bn-bkw').value = $('#bn-bcode').value = ''; $('#benutzer-dialog').close(); });
  async function einladen(daten) {
    $('#bn-fehler').textContent = '';
    try {
      const r = await api('einladen', { ...daten, ...bestaetigung() });
      // Lokal fuehrt der Link auf diese Adresse, auf dem Server auf die feste Adresse.
      const lokal = !location.hostname.endsWith(new URL(cfg.basisUrl).hostname);
      $('#bn-link-text').value = lokal ? location.origin + location.pathname + r.lokal : r.link;
      $('#bn-bis').textContent = r.gueltigBis;
      $('#bn-link').hidden = false;
      $('#einladen-form').reset();
      await renderBenutzer();
    } catch (err) { $('#bn-fehler').textContent = err.message; }
    finally { $('#bn-bcode').value = ''; }
  }
  function bestaetigung() {
    return { bestaetigungKennwort: $('#bn-bkw').value, bestaetigungCode: $('#bn-bcode').value };
  }
  $('#einladen-form').addEventListener('submit', e => { e.preventDefault(); einladen({ email: $('#bn-email').value, name: $('#bn-name').value }); });
  $('#bn-kopieren').addEventListener('click', async () => {
    const t = $('#bn-link-text');
    try { await navigator.clipboard.writeText(t.value); } catch (e) { t.select(); document.execCommand('copy'); }
    melde('Link kopiert');
  });
  $('#bn-liste').addEventListener('click', async e => {
    const neu = e.target.dataset.bnNeu;
    if (neu) {
      if (confirm(`Zugang für ${neu} zurücksetzen?\n\nKennwort und Authenticator werden gelöscht, die Person ist sofort abgemeldet und bekommt einen neuen Einladungslink (z. B. bei verlorenem Handy).`)) einladen({ email: neu, zuruecksetzen: true });
      return;
    }
    const id = e.target.dataset.bnWeg;
    if (!id || !confirm(`Zugang für ${e.target.dataset.bnMail} entfernen? Die Person wird sofort abgemeldet.`)) return;
    try { await api('benutzer_entfernen', { id: Number(id), ...bestaetigung() }); await renderBenutzer(); $('#bn-fehler').textContent = ''; }
    catch (err) { $('#bn-fehler').textContent = err.message; }
    finally { $('#bn-bcode').value = ''; }
  });

  // ---------- Ereignisse ----------
  $('#neu-btn').addEventListener('click', () => oeffne(null));
  $('#liste').addEventListener('click', e => {
    const z = e.target.closest('.zeile');
    if (z) oeffne(items.find(i => i.id === z.dataset.id));
  });
  $('#suche').addEventListener('input', renderListe);
  $('#kategorie-filter').addEventListener('change', renderListe);
  $$('.chip').forEach(c => c.addEventListener('click', () => {
    filter = c.dataset.filter;
    $$('.chip').forEach(x => x.classList.toggle('aktiv', x === c));
    renderListe();
  }));

  form().addEventListener('submit', speichern);
  form().kontrolle.addEventListener('change', e => { $('#kontrolle-felder').hidden = !e.target.checked; });
  $('#schliessen-btn').addEventListener('click', schliessen);
  $('#kopie-btn').addEventListener('click', weiteresWieDieses);
  $('#abbrechen-btn').addEventListener('click', schliessen);
  $('#detail').addEventListener('cancel', e => { e.preventDefault(); schliessen(); });

  $('#loeschen-btn').addEventListener('click', async () => {
    if (!aktuell) return;
    if (!confirm(`${aktuell.id} „${aktuell.name}“ endgültig löschen?\n\nEin gedrucktes Etikett führt danach ins Leere. Wird das Gerät nur nicht mehr benutzt, besser Status „ausgesondert“ setzen.`)) return;
    try {
      await api('loeschen', { id: aktuell.id });
      items = items.filter(i => i.id !== aktuell.id);
      $('#detail').close();
      renderListe();
      melde('Gelöscht');
    } catch (err) { $('#form-fehler').textContent = err.message; }
  });

  $('#etikett-btn').addEventListener('click', () => aktuell && etiketten([aktuell]));
  $('#etiketten-btn').addEventListener('click', () => { $('.menue').open = false; etiketten(sichtbare()); });

  $('#dok-hochladen').addEventListener('click', async () => {
    const datei = $('#dok-datei').files[0];
    if (!datei) { $('#form-fehler').textContent = 'Bitte eine Datei wählen.'; return; }
    if (datei.size > cfg.maxUploadMb * 1048576) { $('#form-fehler').textContent = `Datei größer als ${cfg.maxUploadMb} MB.`; return; }
    const fd = new FormData();
    fd.append('item_id', aktuell.id);
    fd.append('bezeichnung', $('#dok-bez').value.trim());
    if ($('#dok-oeff').checked) fd.append('oeffentlich', '1');
    fd.append('datei', datei);
    const btn = $('#dok-hochladen');
    btn.disabled = true;
    try { uebernehmen((await api('hochladen', null, fd)).item); melde('Dokument hinterlegt'); $('#form-fehler').textContent = ''; }
    catch (err) { $('#form-fehler').textContent = err.message; }
    finally { btn.disabled = false; }
  });

  $('#dok-liste').addEventListener('change', async e => {
    const li = e.target.closest('li[data-dok]');
    if (!li) return;
    const bez = $('.dok-bez', li).value.trim();
    if (!bez) { $('#form-fehler').textContent = 'Bezeichnung darf nicht leer sein.'; return; }
    try {
      uebernehmen((await api('dokument', { id: Number(li.dataset.dok), itemId: aktuell.id, bezeichnung: bez, oeffentlich: $('.dok-oeff', li).checked })).item, true);
      melde('Dokument aktualisiert');
    } catch (err) { $('#form-fehler').textContent = err.message; }
  });

  $('#dok-liste').addEventListener('click', async e => {
    const id = e.target.dataset.dokWeg;
    if (!id || !confirm('Dokument löschen?')) return;
    try { uebernehmen((await api('dokument_loeschen', { id: Number(id) })).item, true); melde('Dokument gelöscht'); }
    catch (err) { $('#form-fehler').textContent = err.message; }
  });

  $('#pruef-btn').addEventListener('click', async () => {
    try {
      if (!$('#pruef-datum').value) { $('#form-fehler').textContent = 'Prüfdatum eintragen (laut Plakette oder Protokoll).'; $('#pruef-datum').focus(); return; }
      uebernehmen((await api('pruefung', { itemId: aktuell.id, datum: $('#pruef-datum').value, notiz: $('#pruef-notiz').value })).item);
      $('#form-fehler').textContent = '';
      melde('Prüfung eingetragen');
    } catch (err) { $('#form-fehler').textContent = err.message; }
  });

  $('#pruef-liste').addEventListener('click', async e => {
    const id = e.target.dataset.pruefWeg;
    if (!id || !confirm('Prüfung entfernen?')) return;
    try { uebernehmen((await api('pruefung_loeschen', { id: Number(id), itemId: aktuell.id })).item, true); }
    catch (err) { $('#form-fehler').textContent = err.message; }
  });

  $('#csv-btn').addEventListener('click', () => {
    $('.menue').open = false;
    const spalten = [['ID', 'id'], ['Name', 'name'], ['Kategorie', 'kategorie'], ['Standort', 'standort'], ['Anschaffung', 'anschaffung'],
      ['Ablauf', 'ablauf'], ['Kontrolle', 'kontrolle'], ['Intervall (Monate)', 'intervallMonate'], ['Letzte Prüfung', 'letztePruefung'],
      ['Nächste Prüfung', 'naechstePruefung'], ['HW-Nummer', 'hwRef'], ['Status', 'status'], ['Dokumente', 'dokumente'], ['Öffentliche Adresse', 'url']];
    // Zellen, die mit =, +, -, @ oder Steuerzeichen beginnen, entschaerfen — sonst rechnet Excel sie als Formel.
    const zelle = v => {
      let t = String(v ?? '');
      if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
      return '"' + t.replace(/"/g, '""') + '"';
    };
    const zeilen = sichtbare().map(it => spalten.map(([, k]) =>
      k === 'kontrolle' ? (it.kontrolle ? 'ja' : 'nein')
        : k === 'dokumente' ? it.dokumente.map(d => d.bezeichnung).join(', ')
          : k === 'url' ? oeffUrl(it)
            : /anschaffung|ablauf|Pruefung/.test(k) ? deDatum(it[k]) : it[k]).map(zelle).join(';'));
    const blob = new Blob(['﻿' + [spalten.map(s => zelle(s[0])).join(';'), ...zeilen].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `inventar-${heute()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  async function abmelden() { await api('abmelden', {}); location.reload(); }
  $('#abmelden-btn').addEventListener('click', abmelden);

  // Profil: Klick auf den eigenen Namen oben.
  $('#ich').addEventListener('click', () => {
    const b = cfg.benutzer || {};
    $('#pf-name').textContent = b.name || '—';
    $('#pf-email').textContent = b.email || '—';
    $('#pf-bis').textContent = b.sitzungBis ? deDatum(b.sitzungBis) : '—';
    $('#profil-dialog').showModal();
  });
  $('#pf-schliessen').addEventListener('click', () => $('#profil-dialog').close());
  $('#pf-abmelden').addEventListener('click', abmelden);
  $('#pf-kennwort').addEventListener('click', () => { $('#profil-dialog').close(); $('#kennwort-btn').click(); });

  $('#kennwort-btn').addEventListener('click', () => { $('.menue').open = false; $('#kw-fehler').textContent = ''; $('#kennwort-form').reset(); $('#kennwort-dialog').showModal(); });
  $('#kw-abbrechen').addEventListener('click', () => $('#kennwort-dialog').close());
  $('#kennwort-form').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await api('kennwort', { alt: $('#kw-alt').value, code: $('#kw-code').value, neu: $('#kw-neu').value });
      $('#kennwort-dialog').close();
      melde('Kennwort geändert');
    } catch (err) { $('#kw-fehler').textContent = err.message; }
  });

  document.addEventListener('click', e => { const m = $('.menue'); if (m.open && !m.contains(e.target)) m.open = false; });
  window.addEventListener('hashchange', () => {
    if (/^#einladung=/.test(location.hash)) location.reload();
    else if (!$('#app').hidden && /^#INV-/.test(location.hash)) laden();
  });

  // Fusszeile: Version und Absender.
  function zeigeFuss() {
    $('#fuss').textContent = [`Inventar ${cfg.version || ''}`, cfg.fusszeile].filter(Boolean).join(' · ');
    $('#fuss').hidden = false;
  }

  // ---------- Start ----------
  (async () => {
    try {
      cfg = await api('status');
      zeigeFuss();
      const m = location.hash.match(/^#einladung=([a-f0-9]{48})$/);
      if (m) {
        history.replaceState(null, '', location.pathname);
        try {
          const e = await api('einladung', { token: m[1] });
          modus = 'einladung';
          einladungsToken = m[1];
          $('#anmelde-email').value = e.email;
          zeigeAnmeldung();
        } catch (err) { zeigeAnmeldung(err.message + ' — bitte um einen neuen Link bitten.'); }
        return;
      }
      if (cfg.angemeldet) await zeigeApp(); else zeigeAnmeldung();
    } catch (err) {
      document.body.innerHTML = '<p class="fehlerseite">Inventar nicht erreichbar: ' + esc(err.message) + '</p>';
    }
  })();
})();
