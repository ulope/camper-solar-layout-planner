import type { Catalog } from './en';

/**
 * German catalog. Typed as {@link Catalog}, so a message added to `en.ts` without a
 * German counterpart is a type error rather than an English string leaking into the UI.
 *
 * Terminology: a solar panel is a *Modul*, a catalog entry for one a *Modell*, and a
 * placement area a *Fläche*. Units follow German convention — a space before `%` and
 * unit symbols, a comma as the decimal separator (handled by `Intl`, not here).
 */
export const de: Catalog = {
  // ----- App shell -----
  'app.title': 'Solar-Layout-Planer für Camper',
  'app.resizeResults': 'Breite des Ergebnisbereichs ändern',

  // ----- Toolbar -----
  'toolbar.import': 'Importieren',
  'toolbar.export': 'Exportieren',
  'toolbar.pdf': 'PDF',
  'toolbar.pdfTitle': 'Den aktuellen Plan als PDF-Bericht speichern',
  'toolbar.reset': 'Zurücksetzen',
  'toolbar.moreActions': 'Weitere Aktionen',
  'toolbar.importError': 'Diese Datei ist keine gültige Layout-Konfiguration.',
  'toolbar.resetConfirm': 'Alles auf die Beispielkonfiguration zurücksetzen?',
  'toolbar.language': 'Sprache',
  'toolbar.languageCurrent': 'Sprache: {name}',

  // ----- Surfaces -----
  'surfaces.title': 'Flächen',
  'surfaces.hint': 'Dach, Seitenwände, … Alle Maße in Zentimetern.',
  'surfaces.nameLabel': 'Name der Fläche',
  'surfaces.removeTitle': 'Fläche entfernen',
  'surfaces.remove': '{name} entfernen',
  'surfaces.length': 'Länge',
  'surfaces.width': 'Breite (Tiefe)',
  'surfaces.panels': 'Module',
  'surfaces.allowedAria': 'Auf {name} erlaubte Modultypen',
  'surfaces.allowed.rigid': 'Starr',
  'surfaces.allowed.flexible': 'Flexibel',
  'surfaces.allowed.both': 'Beide',
  'surfaces.allowed.rigidTitle': 'Hier dürfen nur gerahmte Module platziert werden',
  'surfaces.allowed.flexibleTitle': 'Hier dürfen nur biegsame Module platziert werden',
  'surfaces.allowed.bothTitle': 'Hier darf jedes Modul platziert werden',
  'surfaces.starved.rigid':
    'Es sind keine starren Modelle ausgewählt – hier kann nichts platziert werden.',
  'surfaces.starved.flexible':
    'Es sind keine flexiblen Modelle ausgewählt – hier kann nichts platziert werden.',

  // ----- Spacing -----
  'spacing.title': 'Abstände',
  'spacing.hint': 'Gilt für alle Flächen.',
  'spacing.edgeMargin': 'Randabstand',
  'spacing.panelGap': 'Modulabstand',
  'spacing.gridSnap': 'Raster',
  'spacing.snapOff': 'Aus',
  'spacing.snapCm': '{cm} cm',

  // ----- Panel catalog -----
  'panels.title': 'Modul-Optionen',
  'panels.hint':
    'Modelle, aus denen der Optimierer wählen kann. Häkchen entfernen, um ein Modell auszuschließen; anklicken, um es zu bearbeiten.',
  'panels.empty': 'Noch keine Modulmodelle. Füge mindestens eins hinzu.',
  'panels.noneSelected':
    'Alle Modelle sind abgewählt – wähle mindestens eins aus, um zu optimieren.',
  'panels.use': '{name} beim Optimieren verwenden',
  'panels.edit': '{name} bearbeiten',
  'panels.remove': '{name} entfernen',
  'panels.removeConfirm': 'Modulmodell „{name}“ entfernen?',
  'panels.size': '{width}×{height} cm',
  'panels.flexible': 'flexibel',

  // ----- Panel model dialog -----
  'panelModal.addTitle': 'Modulmodell hinzufügen',
  'panelModal.editTitle': 'Modulmodell bearbeiten',
  'panelModal.defaultName': 'Neues Modul',
  'panelModal.name': 'Name',
  'panelModal.sizeGroup': 'Größe (cm)',
  'panelModal.length': 'Länge',
  'panelModal.width': 'Breite (Tiefe)',
  'panelModal.electricalGroup': 'Elektrik',
  'panelModal.power': 'Leistung (Wp)',
  'panelModal.voltage': 'Spannung (V)',
  'panelModal.current': 'Strom (A)',
  'panelModal.weightPriceGroup': 'Gewicht & Preis',
  'panelModal.weight': 'Gewicht (kg)',
  'panelModal.price': 'Preis ({currency})',
  'panelModal.mountingGroup': 'Montage',
  'panelModal.mountingAria': 'Montageart des Moduls',
  'panelModal.rigid': 'Starr',
  'panelModal.flexible': 'Flexibel',
  'panelModal.rigidTitle':
    'Gerahmtes Modul; kann nur auf Flächen, die starre Module zulassen, platziert werden',
  'panelModal.flexibleTitle':
    'Biegsames Modul; kann nur auf Flächen, die flexible Module zulassen, platziert werden',
  'panelModal.hint':
    'Spannung, Strom, Gewicht und Preis sind optional. Gewicht und Preis fließen in die optionalen Optimierungskriterien ein; fehlende Werte zählen dort als Null.',
  'panelModal.densityStat': '{value} Wp/m²',
  'panelModal.priceStat': '{value}/Wp',

  // ----- Surface dialog -----
  'surfaceModal.addTitle': 'Fläche hinzufügen',
  'surfaceModal.editTitle': 'Fläche bearbeiten',
  'surfaceModal.name': 'Name',
  'surfaceModal.sizeGroup': 'Größe (cm)',
  'surfaceModal.panelsGroup': 'Erlaubte Module',
  'surfaceModal.lastSurface': 'Die letzte Fläche kann nicht entfernt werden.',
  'surfaceModal.areaStat': '{area} · {keepOuts}',

  // ----- Keep-out dialog -----
  'keepOutModal.addTitle': 'Sperrfläche hinzufügen',
  'keepOutModal.editTitle': 'Sperrfläche bearbeiten',
  'keepOutModal.label': 'Bezeichnung',
  'keepOutModal.positionGroup': 'Position (cm)',
  'keepOutModal.sizeGroup': 'Größe (cm)',
  'keepOutModal.onSurface': 'Auf {name}.',
  'keepOutModal.hint': 'Gemessen ab der oberen linken Ecke der Fläche.',
  'keepOutModal.outside': 'Diese Fläche ragt über den Rand der Fläche hinaus.',

  // ----- Keep-outs -----
  'keepOuts.title': 'Sperrflächen',
  'keepOuts.hint': 'Luken, Lüfter, Antennen. Zum Zeichnen auf der Zeichenfläche ziehen.',
  'keepOuts.empty': 'Keine Sperrflächen auf dieser Fläche.',
  'keepOuts.count': { one: '{count} Sperrfläche', other: '{count} Sperrflächen' },
  'keepOuts.add': 'Sperrfläche hinzufügen',
  'keepOuts.addTo': 'Eine Sperrfläche zu {name} hinzufügen',
  'keepOuts.edit': '{name} bearbeiten',
  'keepOuts.rect': '{x}, {y} · {width}×{height} cm',
  'keepOuts.remove': 'Entfernen',
  'keepOuts.x': 'X',
  'keepOuts.y': 'Y',
  'keepOuts.length': 'L',
  'keepOuts.width': 'B',

  // ----- Optimizer -----
  'optimizer.optimize': '⚡ Optimieren',
  'optimizer.options': 'Optimierer-Optionen',
  'optimizer.cancel': 'Abbrechen',
  'optimizer.progress': 'Optimiere{scope} … {seconds} s · {power} Wp',
  'optimizer.progressScope': ' {name} ({index}/{count})',
  'optimizer.effort': 'Aufwand',
  'optimizer.effortAria': 'Optimierungsaufwand',
  'optimizer.fast': '⚡ Schnell',
  'optimizer.fastTitle': 'Sofortige Heuristik',
  'optimizer.thorough': '🔎 Gründlich',
  'optimizer.thoroughTitle': 'Tiefere Suche, ca. 5 s',
  'optimizer.minVoltage': 'Mindest-Strangspannung',
  'optimizer.voltageOff': 'Aus',
  'optimizer.voltageOffTitle': 'Jedes Modulmodell platzieren',
  'optimizer.voltagePreset': '{system} V',
  'optimizer.voltagePresetTitle': '{system}-V-System – Stränge müssen {min} V erreichen',
  'optimizer.threshold': 'Schwelle',
  'optimizer.details': 'Details …',
  'optimizer.voltagePresetNote':
    'Ein {system}-V-Speicher lädt bis auf etwa {chargeEnd} V, pro Strang wird mit {min} V geplant – 95 % der Maximalspannung, plus 1 V.',
  'optimizer.voltageNote':
    'Ein Modul unter {min} V wird nur platziert, wenn genügend davon auf dieselbe Fläche passen, so dass eine Reihenschaltung hergestellt werden kann.',
  'optimizer.restrictedHead': 'Nur nutzbar in Strängen von:',
  'optimizer.restrictedNeed': '{count} × {voltage} V',
  'optimizer.voltageGap': {
    one: '{missing} von {count} Modell hat keine Spannung – nicht eingeschränkt.',
    other: '{missing} von {count} Modellen haben keine Spannung – nicht eingeschränkt.',
  },
  'optimizer.criteria': 'Sekundäre Kriterien',
  'optimizer.raise': 'Höhere Priorität',
  'optimizer.lower': 'Niedrigere Priorität',
  'optimizer.raiseAria': 'Priorität von {name} erhöhen',
  'optimizer.lowerAria': 'Priorität von {name} senken',
  'optimizer.tolerance': 'Toleranz',
  'optimizer.toleranceNote':
    'Die Gesamt-Wp entscheiden weiterhin zuerst. Die Toleranz gilt auf jeder Ebene: Layouts innerhalb von {pct} % des besten Wp-Werts werden nach dem ersten Kriterium sortiert, und unter denen entscheidet innerhalb von {pct} % <em>seines</em> besten Werts das nächste.',
  'optimizer.weightGap': {
    one: '{missing} von {count} Modell hat kein Gewicht – zählt als 0.',
    other: '{missing} von {count} Modellen haben kein Gewicht – zählt als 0.',
  },
  'optimizer.priceGap': {
    one: '{missing} von {count} Modell hat keinen Preis – zählt als 0.',
    other: '{missing} von {count} Modellen haben keinen Preis – zählt als 0.',
  },

  // ----- Ranking criteria -----
  'criterion.weight': 'Leichter',
  'criterion.price': 'Günstiger',
  'criterion.panelTypes': 'Weniger Modultypen',
  'criterionPhrase.weight': 'geringerem Gewicht',
  'criterionPhrase.price': 'niedrigerem Preis',
  'criterionPhrase.panelTypes': 'weniger Modultypen',

  // ----- Results -----
  'results.title': 'Ergebnisse',
  'results.emptyPrompt': 'Klicke auf <strong>Optimieren</strong>, um Layouts zu berechnen.',
  'results.noFit':
    'Es passen keine Module in die verfügbare Fläche. Probiere kleinere Module oder eine größere Fläche.',
  'results.selectHint': 'Wähle eine Option, um sie auf der Zeichenfläche anzusehen.',
  'results.criteriaNote':
    'Sortiert nach {criteria} unter den Layouts innerhalb von {pct} % des besten Wp-Werts.',
  'results.criteriaJoin': ', dann ',
  'results.partialNote':
    'Mit ≥ markierte Summen lassen Modelle ohne Gewicht oder Preis außen vor.',
  'results.allSurfaces': 'Alle Flächen',
  'results.combinedMeta': '{panels} auf {surfaces} · {area}',
  'results.panelCount': { one: '{count} Modul', other: '{count} Module' },
  'results.surfaceCount': { one: '{count} Fläche', other: '{count} Flächen' },
  'results.optionCount': { one: '{count} Option', other: '{count} Optionen' },
  'results.weight': 'Gewicht',
  'results.price': 'Preis',
  'results.option': 'Option {index}',
  'results.best': 'Beste',
  'results.notOptimized': 'Noch nicht optimiert.',
  'results.noFitSurface': 'Auf dieser Fläche passen keine Module.',
  'results.meta': '{panels} · {coverage} % Abdeckung · {area}',
  'results.offset': '· −{pct} % ggü. max. Wp',
  'results.offsetTitle': '{delta} Wp weniger als die Option mit den meisten Wp ({max} Wp).',
  'results.maxTag': '· max. Wp',
  'results.maxTagTitle': 'Höchste Gesamt-Wp der berechneten Optionen.',
  'results.noWeightData': 'Kein platziertes Modell hat ein Gewicht.',
  'results.noPriceData': 'Kein platziertes Modell hat einen Preis.',
  'results.partialWeight': {
    one: '{missing} von {count} platzierten Modell hat kein Gewicht – die Summe ist eine Untergrenze.',
    other:
      '{missing} von {count} platzierten Modellen haben kein Gewicht – die Summe ist eine Untergrenze.',
  },
  'results.partialPrice': {
    one: '{missing} von {count} platzierten Modell hat keinen Preis – die Summe ist eine Untergrenze.',
    other:
      '{missing} von {count} platzierten Modellen haben keinen Preis – die Summe ist eine Untergrenze.',
  },
  'results.series': 'Reihe',
  'results.parallel': 'Parallel',
  'results.wiringCount': '{name} ×{count}',
  'results.wiringValues': '{volts} V · {amps} A',
  'results.chip': '{name} × {count}',
  'results.flexTag': 'flex',
  'results.flexTitle': 'Flexibles Modul',

  // ----- PDF-Bericht -----
  'pdf.docTitle': 'Solar-Layoutplan',
  'pdf.generated': 'Erstellt am {date}',
  'pdf.totalPower': 'Gesamtleistung',
  'pdf.panelsLabel': 'Module',
  'pdf.surfacesLabel': 'Flächen',
  'pdf.panelArea': 'Modulfläche',
  'pdf.settings': 'Randabstand {margin} cm · Modulabstand {gap} cm',
  'pdf.settingsVoltage': ' · Mindest-Strangspannung {volts} V',
  'pdf.surfaceHeading': '{name} — {width} × {height} cm',
  'pdf.optionOf': 'Option {index} von {count}',
  'pdf.scaleBar': '{cm} cm',
  'pdf.modules': 'Module',
  'pdf.modulesAll': 'Module über alle Flächen',
  'pdf.noModules': 'Es sind keine Module platziert — zuerst optimieren.',
  'pdf.colModel': 'Modell',
  'pdf.colSize': 'Maße (cm)',
  'pdf.colPower': 'Wp',
  'pdf.colQty': 'Anz.',
  'pdf.colTotalPower': 'Wp gesamt',
  'pdf.sizeCell': '{width} × {height}',
  'pdf.total': 'Gesamt',
  'pdf.page': 'Seite {page} von {count}',
  'pdf.qrCaption': 'Scannen, um diesen Plan zu öffnen',
  'pdf.qrModels': {
    one: 'Stellt die Flächen, Sperrzonen und das hier verwendete Modul wieder her.',
    other: 'Stellt die Flächen, Sperrzonen und die {count} hier verwendeten Module wieder her.',
  },
  'pdf.qrCatalog': 'Stellt die Flächen, Sperrzonen und die ausgewählten Module wieder her.',
  'pdf.qrTooLarge': 'Zu groß für einen QR-Code — den Plan über „Exportieren“ als JSON sichern.',

  // ----- Gescannten Plan wiederherstellen -----
  'restore.confirm':
    'Den gescannten Plan öffnen?\n\n{surfaces} mit {models}.\n\nDie aktuellen Flächen und Sperrzonen werden ersetzt.',
  'restore.modelCount': { one: '{count} Modul', other: '{count} Modulen' },
  'restore.keptCatalog':
    'Der vorhandene Modulkatalog enthält bereits alle verwendeten Modelle und bleibt unverändert.',
  'restore.replacedCatalog': 'Der Modulkatalog wird durch die im Plan verwendeten Module ersetzt.',
  'restore.invalid': 'Dieser Link enthält keinen gültigen Plan.',

  // ----- Canvas -----
  'canvas.unit': 'cm',
  'canvas.stale': 'Konfiguration geändert – neu optimieren',
  'canvas.hint':
    'Auf einer Fläche ziehen legt eine Sperrfläche an · Sperrfläche ziehen verschiebt sie, an den Kanten ziehen skaliert · scrollen zoomt · Hintergrund ziehen verschiebt die Ansicht',
  'canvas.readout': '{x}, {y} cm',
  'canvas.zoomIn': 'Vergrößern',
  'canvas.zoomOut': 'Verkleinern',
  'canvas.zoomReset': 'Ansicht zurücksetzen',
  'canvas.zoomLevel': '{percent}%',
  'canvas.size': '{width} × {height} cm',
  'canvas.power': '{power} Wp',

  // ----- Shared -----
  'common.add': '+ Hinzufügen',
  'common.cancel': 'Abbrechen',
  'common.save': 'Speichern',
  'common.delete': 'Löschen',
  'common.close': 'Schließen',

  // ----- Default (example) data -----
  'defaults.roof': 'Dach',
  'defaults.roofHatch': 'Dachluke',
  'defaults.surface': 'Fläche {index}',
  'defaults.keepOut': 'Sperrfläche',
  'defaults.panel100': '100 W Mono',
  'defaults.panel175': '175 W Mono',
};
