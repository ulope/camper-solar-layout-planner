import type { Message } from './messages';

/**
 * The source catalog. Every other locale is typed against its keys, so adding a message
 * here makes the compiler ask for a translation in each of them.
 */
export const en = {
  // ----- App shell -----
  'app.title': 'Camper Solar Layout Planner',
  'app.resizeResults': 'Resize results panel',

  // ----- Toolbar -----
  'toolbar.import': 'Import',
  'toolbar.export': 'Export',
  'toolbar.pdf': 'PDF',
  'toolbar.pdfTitle': 'Save the current plan as a PDF report',
  'toolbar.reset': 'Reset',
  'toolbar.moreActions': 'More actions',
  'toolbar.importError': 'That file is not a valid layout configuration.',
  'toolbar.resetConfirm': 'Reset everything to the default example configuration?',
  'toolbar.language': 'Language',
  'toolbar.languageCurrent': 'Language: {name}',

  // ----- Surfaces -----
  'surfaces.title': 'Surfaces',
  'surfaces.hint': 'Roof, sidewalls, … All measurements in centimeters.',
  'surfaces.nameLabel': 'Surface name',
  'surfaces.removeTitle': 'Remove surface',
  'surfaces.empty': 'No surfaces yet.',
  'surfaces.add': '+ Add surface',
  'surfaces.select': 'Select {name}',
  'surfaces.edit': 'Edit {name}',
  'surfaces.activeTitle': 'Active surface — new keep-outs are added here',
  'surfaces.showKeepOuts': 'Show keep-out areas of {name}',
  'surfaces.hideKeepOuts': 'Hide keep-out areas of {name}',
  'surfaces.meta': '{size} · {allowed}',
  'surfaces.length': 'Length',
  'surfaces.width': 'Width (depth)',
  'surfaces.panels': 'Panels',
  'surfaces.allowedAria': 'Panel types allowed on {name}',
  'surfaces.allowed.rigid': 'Rigid',
  'surfaces.allowed.flexible': 'Flexible',
  'surfaces.allowed.both': 'Both',
  'surfaces.allowed.rigidTitle': 'Only framed panels may be placed here',
  'surfaces.allowed.flexibleTitle': 'Only bendable panels may be placed here',
  'surfaces.allowed.bothTitle': 'Any panel may be placed here',
  'surfaces.starved.rigid': 'No rigid models are selected — nothing can be placed here.',
  'surfaces.starved.flexible': 'No flexible models are selected — nothing can be placed here.',

  // ----- Spacing -----
  'spacing.title': 'Spacing',
  'spacing.hint': 'Applies to every surface.',
  'spacing.edgeMargin': 'Edge margin',
  'spacing.panelGap': 'Panel gap',
  'spacing.gridSnap': 'Grid snap',
  'spacing.snapOff': 'Off',
  'spacing.snapCm': '{cm} cm',

  // ----- Panel catalog -----
  'panels.title': 'Panel options',
  'panels.hint':
    'Candidate models the optimizer can choose from. Untick one to leave it out; click one to edit it.',
  'panels.add': '+ Add model',
  'panels.empty': 'No panel models yet. Add at least one.',
  'panels.noneSelected': 'All models are deselected — tick at least one to optimize.',
  'panels.use': 'Use {name} when optimizing',
  'panels.edit': 'Edit {name}',
  'panels.removeConfirm': 'Remove the panel model “{name}”?',
  'panels.size': '{width}×{height} cm',
  'panels.flexible': 'flexible',

  // ----- Panel model dialog -----
  'panelModal.addTitle': 'Add panel model',
  'panelModal.editTitle': 'Edit panel model',
  'panelModal.defaultName': 'New panel',
  'panelModal.name': 'Name',
  'panelModal.sizeGroup': 'Size (cm)',
  'panelModal.length': 'Length',
  'panelModal.width': 'Width (depth)',
  'panelModal.electricalGroup': 'Electrical',
  'panelModal.power': 'Power (Wp)',
  'panelModal.voltage': 'Voltage (V)',
  'panelModal.current': 'Current (A)',
  'panelModal.weightPriceGroup': 'Weight & price',
  'panelModal.weight': 'Weight (kg)',
  'panelModal.price': 'Price ({currency})',
  'panelModal.mountingGroup': 'Mounting',
  'panelModal.mountingAria': 'Panel mounting type',
  'panelModal.rigid': 'Rigid',
  'panelModal.flexible': 'Flexible',
  'panelModal.rigidTitle': 'Framed panel; only surfaces that allow rigid panels take it',
  'panelModal.flexibleTitle': 'Bendable panel; only surfaces that allow flexible panels take it',
  'panelModal.hint':
    'Voltage, current, weight and price are optional. Weight and price feed the optional optimization criteria; missing values count as zero there.',
  'panelModal.densityStat': '{value} Wp/m²',
  'panelModal.priceStat': '{value}/Wp',

  // ----- Surface dialog -----
  'surfaceModal.addTitle': 'Add surface',
  'surfaceModal.editTitle': 'Edit surface',
  'surfaceModal.name': 'Name',
  'surfaceModal.sizeGroup': 'Size (cm)',
  'surfaceModal.panelsGroup': 'Panels allowed',
  'surfaceModal.lastSurface': 'The last surface cannot be removed.',
  'surfaceModal.areaStat': '{area} · {keepOuts}',

  // ----- Keep-out dialog -----
  'keepOutModal.addTitle': 'Add keep-out area',
  'keepOutModal.editTitle': 'Edit keep-out area',
  'keepOutModal.label': 'Label',
  'keepOutModal.positionGroup': 'Position (cm)',
  'keepOutModal.sizeGroup': 'Size (cm)',
  'keepOutModal.onSurface': 'On {name}.',
  'keepOutModal.hint': 'Measured from the top-left corner of the surface.',
  'keepOutModal.outside': 'This area reaches past the edge of the surface.',

  // ----- Keep-outs -----
  'keepOuts.title': 'Keep-out areas',
  'keepOuts.hint': 'Hatches, vents, antennas. Drag on the canvas to draw one.',
  'keepOuts.empty': 'No keep-out areas on this surface.',
  'keepOuts.count': { one: '{count} keep-out', other: '{count} keep-outs' },
  'keepOuts.add': '+ Add keep-out',
  'keepOuts.addTo': 'Add a keep-out to {name}',
  'keepOuts.edit': 'Edit {name}',
  'keepOuts.rect': '{x}, {y} · {width}×{height} cm',
  'keepOuts.x': 'X',
  'keepOuts.y': 'Y',
  'keepOuts.length': 'L',
  'keepOuts.width': 'W',

  // ----- Optimizer -----
  'optimizer.optimize': '⚡ Optimize',
  'optimizer.options': 'Optimizer options',
  'optimizer.cancel': 'Cancel',
  'optimizer.progress': 'Optimizing{scope}… {seconds}s · {power} Wp',
  'optimizer.progressScope': ' {name} ({index}/{count})',
  'optimizer.effort': 'Effort',
  'optimizer.effortAria': 'Optimizer effort',
  'optimizer.fast': '⚡ Fast',
  'optimizer.fastTitle': 'Instant heuristic',
  'optimizer.thorough': '🔎 Thorough',
  'optimizer.thoroughTitle': 'Deeper ~5s search',
  'optimizer.minVoltage': 'Minimum string voltage',
  'optimizer.voltageOff': 'Off',
  'optimizer.voltageOffTitle': 'Place any panel model',
  'optimizer.voltagePreset': '{system} V',
  'optimizer.voltagePresetTitle': '{system} V system — strings must reach {min} V',
  'optimizer.threshold': 'Threshold',
  'optimizer.details': 'Details…',
  'optimizer.voltagePresetNote':
    'A {system} V bank charges to about {chargeEnd} V, so a string is planned against {min} V — 95% of that, plus 1 V.',
  'optimizer.voltageNote':
    'A model’s panels are wired as one series string, so a panel below {min} V is only placed when enough of them fit on the same surface.',
  'optimizer.restrictedHead': 'Only usable in strings of:',
  'optimizer.restrictedNeed': '{count} × {voltage} V',
  'optimizer.voltageGap': {
    one: '{missing} of {count} model has no voltage — not restricted.',
    other: '{missing} of {count} models have no voltage — not restricted.',
  },
  'optimizer.criteria': 'Secondary criteria',
  'optimizer.raise': 'Higher priority',
  'optimizer.lower': 'Lower priority',
  'optimizer.raiseAria': 'Raise priority of {name}',
  'optimizer.lowerAria': 'Lower priority of {name}',
  'optimizer.tolerance': 'Tolerance',
  'optimizer.toleranceNote':
    'Total Wp still wins. The tolerance applies at every level: layouts within {pct}% of the best Wp are ranked by the first criterion, and those within {pct}% of <em>its</em> best value are decided by the next.',
  'optimizer.weightGap': {
    one: '{missing} of {count} model has no weight — counted as 0.',
    other: '{missing} of {count} models have no weight — counted as 0.',
  },
  'optimizer.priceGap': {
    one: '{missing} of {count} model has no price — counted as 0.',
    other: '{missing} of {count} models have no price — counted as 0.',
  },

  // ----- Ranking criteria -----
  'criterion.weight': 'Lighter',
  'criterion.price': 'Cheaper',
  'criterion.panelTypes': 'Fewer panel types',
  'criterionPhrase.weight': 'lighter',
  'criterionPhrase.price': 'cheaper',
  'criterionPhrase.panelTypes': 'fewer panel types',

  // ----- Sidebar shell -----
  'sidebar.label': 'Plan',
  'sidebar.collapse': 'Collapse sidebar',
  'sidebar.expand': 'Expand sidebar',
  'sidebar.resize': 'Resize sidebar',

  // ----- Overview -----
  'overview.title': 'Overview',
  'overview.inputs': '{surfaces} · {area}',
  'overview.catalog': '{keepOuts} · {models}',
  'overview.models': {
    one: '{enabled} of {count} model',
    other: '{enabled} of {count} models',
  },
  'overview.resultMeta': '{panels} · {coverage}% coverage',

  // ----- Results -----
  'results.title': 'Results',
  'results.emptyPrompt': 'Click <strong>Optimize</strong> to compute layouts.',
  'results.noFit': 'No panels fit in the available area. Try smaller panels or a larger surface.',
  'results.selectHint': 'Select an option to preview it on the canvas.',
  'results.criteriaNote': 'Ranked by {criteria} among layouts within {pct}% of the best Wp.',
  'results.criteriaJoin': ', then ',
  'results.partialNote': 'Totals marked ≥ exclude models with no weight or price.',
  'results.allSurfaces': 'All surfaces',
  'results.combinedMeta': '{panels} across {surfaces} · {area}',
  'results.panelCount': { one: '{count} panel', other: '{count} panels' },
  'results.surfaceCount': { one: '{count} surface', other: '{count} surfaces' },
  'results.optionCount': { one: '{count} option', other: '{count} options' },
  'results.weight': 'Weight',
  'results.price': 'Price',
  'results.option': 'Option {index}',
  'results.best': 'Best',
  'results.notOptimized': 'Not optimized yet.',
  'results.noFitSurface': 'No panels fit on this surface.',
  'results.meta': '{panels} · {coverage}% coverage · {area}',
  'results.offset': '· −{pct}% vs max Wp',
  'results.offsetTitle': '{delta} Wp less than the highest-Wp option ({max} Wp).',
  'results.maxTag': '· max Wp',
  'results.maxTagTitle': 'Highest total Wp of the computed options.',
  'results.noWeightData': 'No placed model has a weight.',
  'results.noPriceData': 'No placed model has a price.',
  'results.partialWeight': {
    one: '{missing} of {count} placed model has no weight — the total is a lower bound.',
    other: '{missing} of {count} placed models have no weight — the total is a lower bound.',
  },
  'results.partialPrice': {
    one: '{missing} of {count} placed model has no price — the total is a lower bound.',
    other: '{missing} of {count} placed models have no price — the total is a lower bound.',
  },
  'results.series': 'Series',
  'results.parallel': 'Parallel',
  'results.wiringCount': '{name} ×{count}',
  'results.wiringValues': '{volts} V · {amps} A',
  'results.chip': '{name} × {count}',
  'results.flexTag': 'flex',
  'results.flexTitle': 'Flexible panel',

  // ----- PDF report -----
  'pdf.docTitle': 'Solar layout plan',
  'pdf.generated': 'Generated {date}',
  'pdf.totalPower': 'Total power',
  'pdf.panelsLabel': 'Panels',
  'pdf.surfacesLabel': 'Surfaces',
  'pdf.panelArea': 'Panel area',
  'pdf.settings': 'Edge margin {margin} cm · Panel gap {gap} cm',
  'pdf.settingsVoltage': ' · Minimum string voltage {volts} V',
  'pdf.surfaceHeading': '{name} — {width} × {height} cm',
  'pdf.optionOf': 'option {index} of {count}',
  'pdf.scaleBar': '{cm} cm',
  'pdf.modules': 'Modules',
  'pdf.modulesAll': 'Modules across all surfaces',
  'pdf.noModules': 'No panels are placed — run the optimizer first.',
  'pdf.colModel': 'Model',
  'pdf.colSize': 'Size (cm)',
  'pdf.colPower': 'Wp',
  'pdf.colQty': 'Qty',
  'pdf.colTotalPower': 'Total Wp',
  'pdf.sizeCell': '{width} × {height}',
  'pdf.total': 'Total',
  'pdf.page': 'Page {page} of {count}',
  'pdf.qrCaption': 'Scan to reopen this plan',
  'pdf.qrModels': {
    one: 'Restores the surfaces, keep-outs and the single panel model used here.',
    other: 'Restores the surfaces, keep-outs and the {count} panel models used here.',
  },
  'pdf.qrCatalog': 'Restores the surfaces, keep-outs and the selected panel models.',
  'pdf.qrTooLarge': 'Too large for a QR code — use Export to save this plan as JSON.',

  // ----- Restoring a scanned plan -----
  'restore.confirm':
    'Open the scanned plan?\n\n{surfaces} with {models}.\n\nThis replaces the surfaces and keep-outs you have now.',
  'restore.modelCount': { one: '{count} panel model', other: '{count} panel models' },
  'restore.keptCatalog':
    'Your panel catalog already has every model the plan uses, so it stays as it is.',
  'restore.replacedCatalog': 'Your panel catalog is replaced by the models the plan uses.',
  'restore.invalid': 'That link does not contain a valid plan.',

  // ----- Canvas -----
  'canvas.unit': 'cm',
  'canvas.stale': 'Config changed — re-run optimize',
  'canvas.hint':
    'Drag a surface to add a keep-out · drag a keep-out to move or its edges to resize · scroll to zoom · drag the background to pan',
  'canvas.readout': '{x}, {y} cm',
  'canvas.zoomIn': 'Zoom in',
  'canvas.zoomOut': 'Zoom out',
  'canvas.zoomReset': 'Reset view',
  'canvas.zoomLevel': '{percent}%',
  'canvas.size': '{width} × {height} cm',
  'canvas.power': '{power} Wp',

  // ----- Shared -----
  'common.cancel': 'Cancel',
  'common.save': 'Save',
  'common.delete': 'Delete',
  'common.close': 'Close',

  // ----- Default (example) data -----
  'defaults.roof': 'Roof',
  'defaults.roofHatch': 'Roof hatch',
  'defaults.surface': 'Surface {index}',
  'defaults.keepOut': 'Keep-out',
  'defaults.panel100': '100 W mono',
  'defaults.panel175': '175 W mono',
} as const satisfies Record<string, Message>;

/** Every message key in the catalog. */
export type MessageKey = keyof typeof en;

/** The shape every locale has to provide. */
export type Catalog = Record<MessageKey, Message>;
