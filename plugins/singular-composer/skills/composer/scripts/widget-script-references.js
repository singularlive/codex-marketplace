const WIDGET_SCRIPT_REFERENCES = Object.freeze({
  12: 'references/composition-scripting/widget-gradient.md',
  642: 'references/composition-scripting/widget-image.md',
  812: 'references/composition-scripting/widget-videoclip.md',
  822: 'references/composition-scripting/widget-web-page.md',
  1022: 'references/composition-scripting/widget-rectangle.md',
  1032: 'references/composition-scripting/widget-text.md',
  1052: 'references/composition-scripting/widget-circle.md',
  1212: 'references/composition-scripting/widget-html.md',
  1216: 'references/composition-scripting/widget-text-ticker.md',
  3284: 'references/composition-scripting/widget-grid.md',
  3367: 'references/composition-scripting/widget-bodymovin.md',
  3558: 'references/composition-scripting/widget-timer.md',
  3585: 'references/composition-scripting/widget-sound.md',
  3616: 'references/composition-scripting/widget-current-date-time.md',
  3617: 'references/composition-scripting/widget-date-time-countdown.md',
  3783: 'references/composition-scripting/widget-bodymovin-loop.md',
  3934: 'references/composition-scripting/widget-video-animation.md',
  3936: 'references/composition-scripting/widget-video-background.md',
  4307: 'references/composition-scripting/widget-videoclip-with-audio.md',
  4662: 'references/composition-scripting/widget-metrictext.md',
  4671: 'references/composition-scripting/widget-metrictextml.md',
  4672: 'references/composition-scripting/widget-metricticker.md',
  4706: 'references/composition-scripting/widget-metrictextanim.md',
  4758: 'references/composition-scripting/widget-metrictextstyle.md'
});

function normalizeWidgetId(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  return value;
}

function compareValues(left, right) {
  if (left === null) return right === null ? 0 : 1;
  if (right === null) return -1;
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left).localeCompare(String(right));
}

function createWidgetReferences(tiles) {
  const routesByWidgetId = {};

  (Array.isArray(tiles) ? tiles : []).forEach(function(tile) {
    if (!tile || tile.type !== 'widget' || tile.widget === undefined || tile.widget === null) {
      return;
    }

    const widgetId = normalizeWidgetId(tile.widget);
    const routeKey = String(widgetId);
    if (!routesByWidgetId[routeKey]) {
      routesByWidgetId[routeKey] = {
        widgetId: widgetId,
        loadedVersions: [],
        document: WIDGET_SCRIPT_REFERENCES[routeKey] || null,
        referenceStatus: WIDGET_SCRIPT_REFERENCES[routeKey] ? 'available' : 'missing',
        versionPolicy: 'live-inspection-authoritative'
      };
    }

    const version = tile.version === undefined ? null : normalizeWidgetId(tile.version);
    if (routesByWidgetId[routeKey].loadedVersions.indexOf(version) === -1) {
      routesByWidgetId[routeKey].loadedVersions.push(version);
    }
  });

  return Object.keys(routesByWidgetId).map(function(routeKey) {
    const route = routesByWidgetId[routeKey];
    route.loadedVersions.sort(compareValues);
    return route;
  }).sort(function(left, right) {
    return compareValues(left.widgetId, right.widgetId);
  });
}

function createWidgetReferencesFromContent(json) {
  const tiles = [];
  const compositions = json && json.compositions ? json.compositions : {};

  Object.keys(compositions).forEach(function(compositionId) {
    const compositionTiles = compositions[compositionId] && compositions[compositionId].tiles;
    Object.keys(compositionTiles || {}).forEach(function(tileId) {
      tiles.push(compositionTiles[tileId]);
    });
  });

  return createWidgetReferences(tiles);
}

module.exports = {
  WIDGET_SCRIPT_REFERENCES,
  createWidgetReferences,
  createWidgetReferencesFromContent
};
