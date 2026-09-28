# Inventar — Demo

Inventar mit QR-Codes: Jeder Gegenstand (Gerät, Kabel, Feuerlöscher …) bekommt ein Etikett. Wer den Code scannt, sieht Name, Hinweis und freigegebene Dokumente wie die Bedienungsanleitung.

**Demo:** https://rdbht.github.io/Inventar/

- Oberfläche vollständig: anlegen, Prüfintervalle, Ablaufdaten, Dokumente, Etiketten drucken, CSV-/JSON-Export.
- Ohne Anmeldung, Änderungen nur im eigenen Browser. „Demo zurücksetzen“ im Menü stellt den Ausgangsstand her.
- Die QR-Codes der Beispiel-Einträge funktionieren auf jedem Handy. Beispiel: [Feuerlöscher](https://rdbht.github.io/Inventar/i/INV-0001-52szhzct)

Die Beispieldaten in `daten.json` sind erfunden. Ein Eintrag, der für alle scannbar sein soll, gehört dorthin (Export aus der Demo, Eintrag übernehmen).

Die echte Version läuft mit PHP und SQLite auf einem eigenen Webspace — mit Anmeldung, Zwei-Faktor-Code und getrennten öffentlichen und internen Daten.

QR-Code-Bibliothek: [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) von Kazuhiko Arase, MIT-Lizenz.
