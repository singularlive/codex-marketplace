const fs = require("fs");
const {
  createWidgetReferencesFromContent,
} = require("./widget-script-references");

function extractModelsDataLinksNodeRefs(json) {
  const result = [];
  const nameMap = {};
  const compositions = (json && json.compositions) || {};

  for (const compId in compositions) {
    const comp = compositions[compId];
    if (comp && comp.tiles) {
      for (const tileKey in comp.tiles) {
        const tile = comp.tiles[tileKey];
        if (tile && tile.type === "composition") {
          nameMap[tile.id] = tile.name || tile.id;
        }
      }
    }
  }

  for (const compId in compositions) {
    const comp = compositions[compId];
    if (comp && comp.name) {
      nameMap[compId] = comp.name;
    }
  }

  for (const compId in compositions) {
    const comp = compositions[compId];
    const ds =
      comp &&
      comp.dataSources &&
      comp.dataSources.composition &&
      comp.dataSources.composition.controlNode;
    const modelFields = ds && ds.model && ds.model.fields;
    const models = [];

    if (modelFields && typeof modelFields === "object") {
      for (const fieldKey in modelFields) {
        const field = modelFields[fieldKey];
        const modelObj = {
          id: (field && (field.id || fieldKey)) || fieldKey,
          title: (field && (field.title || field.id || fieldKey)) || fieldKey,
          type: (field && field.type) || null,
        };

        if (field && field.type === "table" && Array.isArray(field.columns)) {
          modelObj.columns = field.columns.map(function(column) {
            return {
              id: (column && column.id) || null,
              title: (column && (column.title || column.id)) || null,
              type: (column && column.type) || null,
            };
          });
        }

        models.push(modelObj);
      }
    }

    const datalinks = [];
    if (comp && comp.dataLinks && typeof comp.dataLinks === "object") {
      for (const tileId in comp.dataLinks) {
        const tileLinks = comp.dataLinks[tileId];
        if (tileLinks && typeof tileLinks === "object") {
          for (const property in tileLinks) {
            datalinks.push({
              tileId: tileId,
              property: property,
              link: tileLinks[property],
            });
          }
        }
      }
    }

    const noderefs = [];
    if (comp && comp.nodeRefs && typeof comp.nodeRefs === "object") {
      for (const tileRefId in comp.nodeRefs) {
        const tileRefs = comp.nodeRefs[tileRefId];
        if (tileRefs && typeof tileRefs === "object") {
          for (const refId in tileRefs) {
            noderefs.push({
              tileId: tileRefId,
              refId: refId,
              ref: tileRefs[refId],
            });
          }
        }
      }
    }

    if (models.length > 0 || datalinks.length > 0 || noderefs.length > 0) {
      result.push({
        compName:
          compId === (json && json.mainComposition)
            ? "Root Composition"
            : nameMap[compId] || compId,
        compId: compId,
        models: models,
        datalinks: datalinks,
        noderefs: noderefs,
      });
    }
  }

  return result;
}

function extractCompositionStructure(json, mainCompositionId) {
  if (!json) return null;
  if (!json.mainComposition && mainCompositionId) {
    json.mainComposition = mainCompositionId;
  }

  const compositions = json.compositions || {};
  const nameMap = {};

  for (const compId in compositions) {
    const comp = compositions[compId];
    if (comp && comp.tiles) {
      for (const tileKey in comp.tiles) {
        const tile = comp.tiles[tileKey];
        if (tile && tile.type === "composition" && tile.id) {
          nameMap[tile.id] = tile.name || nameMap[tile.id] || tile.id;
        }
      }
    }
    if (comp && comp.name) {
      nameMap[compId] = comp.name;
    }
  }

  const seen = new Set();

  function buildNode(compId) {
    const isRoot = compId === json.mainComposition;
    const fallbackNode = {
      compName: nameMap[compId] || (isRoot ? "Root Composition" : compId),
      compId: compId,
      children: [],
      groups: [],
      tiles: [],
    };

    if (!compId || !compositions[compId]) {
      return fallbackNode;
    }
    if (seen.has(compId)) {
      return fallbackNode;
    }

    seen.add(compId);

    const comp = compositions[compId];
    const node = {
      compName: isRoot
        ? "Root Composition"
        : nameMap[compId] || comp.name || compId,
      compId: compId,
      children: [],
      groups: [],
      tiles: [],
    };

    if (comp.tiles) {
      for (const tileKey in comp.tiles) {
        const tile = comp.tiles[tileKey];
        if (tile && tile.type === "composition" && tile.id) {
          node.children.push(buildNode(tile.id));
        }
      }

      for (const tileKey in comp.tiles) {
        const tile = comp.tiles[tileKey];
        if (tile && tile.id) {
          node.tiles.push({
            id: tile.id,
            name: tile.name || nameMap[tile.id] || tile.id,
            type: tile.type || null,
            widgetId: tile.widget || null,
          });
        }
      }
    }

    if (comp.groups) {
      for (const groupKey in comp.groups) {
        const group = comp.groups[groupKey];
        if (group && group.id) {
          const groupObj = {
            id: group.id,
            name: group.name || group.id,
            tiles: [],
          };

          if (group.items && typeof group.items === "object") {
            for (const itemKey in group.items) {
              const item = group.items[itemKey];
              if (item && item.id) {
                const tileRef = (comp.tiles && comp.tiles[item.id]) || null;
                groupObj.tiles.push({
                  id: item.id,
                  name:
                    (tileRef && tileRef.name) || nameMap[item.id] || item.id,
                });
              }
            }
          }

          node.groups.push(groupObj);
        }
      }
    }

    return node;
  }

  return json.mainComposition ? buildNode(json.mainComposition) : null;
}

function extractAnimationInfo(json) {
  var result = {
    compositionStates: json.compositionStates || {},
    timeline2Active: (json.compositionProps && json.compositionProps.timeline2Active) || {},
    durations: (json.compositionProps && json.compositionProps.durations) || {},
    compositions: [],
  };

  var compositions = (json && json.compositions) || {};
  var nameMap = {};

  for (var compId in compositions) {
    var comp = compositions[compId];
    if (comp && comp.name) {
      nameMap[compId] = comp.name;
    }
    if (comp && comp.tiles) {
      for (var tileKey in comp.tiles) {
        var tile = comp.tiles[tileKey];
        if (tile && tile.name) {
          nameMap[tile.id] = tile.name;
        }
      }
    }
  }

  for (var compId in compositions) {
    var comp = compositions[compId];
    var compAnim = {
      compId: compId,
      compName:
        compId === json.mainComposition
          ? "Root Composition"
          : nameMap[compId] || compId,
      settings: {},
      groups: [],
      tiles: [],
    };

    if (comp && comp.settings) {
      compAnim.settings.linkTimeline = !!comp.settings.linkTimeline;
      compAnim.settings.parentTimeline = comp.settings.parentTimeline || null;
    }

    if (comp && comp.groups) {
      for (var groupKey in comp.groups) {
        var group = comp.groups[groupKey];
        if (group && group.id) {
          var groupAnim = {
            id: group.id,
            name: group.name || group.id,
          };
          if (group.keyframes) {
            groupAnim.keyframes = group.keyframes;
          }
          if (group.effects) {
            groupAnim.effects = group.effects;
          }
          compAnim.groups.push(groupAnim);
        }
      }
    }

    if (comp && comp.tiles) {
      for (var tileKey in comp.tiles) {
        var tile = comp.tiles[tileKey];
        if (tile && tile.id) {
          var tileAnim = {
            id: tile.id,
            name: tile.name || nameMap[tile.id] || tile.id,
            type: tile.type || null,
          };
          if (tile.keyframes) {
            tileAnim.keyframes = tile.keyframes;
          }
          if (tile.effects) {
            tileAnim.effects = tile.effects;
          }
          compAnim.tiles.push(tileAnim);
        }
      }
    }

    result.compositions.push(compAnim);
  }

  return result;
}

function getScriptName(id, structure) {
  if (!structure) return null;
  if (id === "overlay") return "Overlay Script";
  if (id === "global") return "Global Script";
  if (structure.compId === id) return structure.compName;

  if (Array.isArray(structure.children)) {
    for (let i = 0; i < structure.children.length; i += 1) {
      const name = getScriptName(id, structure.children[i]);
      if (name) return name;
    }
  }

  return null;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const value =
      argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
    args[key] = value;
  }
  return args;
}

function normalizeHost(host) {
  if (!host) return null;
  return String(host).replace(/\/+$/, "");
}

function sanitizeUrl(url) {
  return String(url).replace(
    /(\/apiv1\/compositions\/)[^/]+/,
    "$1<redacted>"
  );
}

function readHandoff(args) {
  const handoffPath = args["handoff-file"];
  if (!handoffPath) return null;

  let text;
  try {
    text = handoffPath === "-"
      ? fs.readFileSync(0, "utf8")
      : fs.readFileSync(handoffPath, "utf8");
  } catch (error) {
    throw new Error("Unable to read script handoff: " + error.message);
  }

  let handoff;
  try {
    handoff = JSON.parse(text);
  } catch (error) {
    throw new Error("Script handoff is not valid JSON: " + error.message);
  }

  if (
    !handoff ||
    handoff.version !== 1 ||
    handoff.kind !== "composer-agent-script-handoff"
  ) {
    throw new Error(
      "Script handoff must have version 1 and kind composer-agent-script-handoff"
    );
  }

  return handoff;
}

function getHandoffScriptId(handoff) {
  return handoff && handoff.suggestedScript && handoff.suggestedScript.id
    ? handoff.suggestedScript.id
    : null;
}

function summarizeHandoff(handoff, host) {
  return {
    host: host,
    source: "composer-agent-handoff",
    fastPath: true,
    scope: handoff.scope || "active-composition",
    mainComposition: handoff.mainComposition || null,
    scriptsEndpointCount: null,
    scriptIds: Array.isArray(handoff.scriptIds)
      ? handoff.scriptIds
      : [getHandoffScriptId(handoff)].filter(Boolean),
    scriptNames: handoff.scriptNames || {},
    suggestedScript: handoff.suggestedScript || null,
    compositionStructure: handoff.compositionStructure || null,
    widgetReferences: handoff.widgetReferences || [],
    widgetNodes: handoff.widgetNodes || null,
    modelsDataLinksNodeRefs: handoff.modelsDataLinksNodeRefs || [],
    animation: handoff.animation || null,
  };
}

function collectCompositionIds(node, out) {
  if (!node) return;
  if (node.compId) out.push(node.compId);
  if (Array.isArray(node.children)) {
    node.children.forEach(function(child) {
      collectCompositionIds(child, out);
    });
  }
}

async function request(url, options) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    throw new Error(
      "Request failed for " +
        sanitizeUrl(url) +
        ": " +
        sanitizeUrl((error && error.message) || "network error")
    );
  }
  const text = await response.text();
  let json;

  try {
    json = text ? JSON.parse(text) : null;
  } catch (error) {
    json = null;
  }

  if (!response.ok) {
    throw new Error(
      "Request failed (" +
        response.status +
        ") for " +
        sanitizeUrl(url)
    );
  }

  return {
    status: response.status,
    text: text,
    json: json,
  };
}

function composerAgentHeaders(accessToken, headers) {
  return Object.assign({}, headers || {}, {
    Authorization: "Bearer " + accessToken,
  });
}

async function fetchJson(url, options) {
  const result = await request(url, options || {});
  return result.json;
}

async function fetchText(url) {
  const result = await request(url, {});
  return result.text;
}

async function fetchContent(host, token) {
  return fetchJson(host + "/apiv1/compositions/" + token + "/content");
}

async function fetchScriptsList(host, token, accessToken) {
  const response = await fetchJson(
    host + "/apiv1/compositions/" + token + "/scripts",
    { headers: composerAgentHeaders(accessToken) }
  );
  return (response && response.data) || [];
}

function resolveScriptNames(content) {
  const structure = extractCompositionStructure(content);
  const compositionIds = [];
  const scriptNames = {};

  collectCompositionIds(structure, compositionIds);
  compositionIds.forEach(function(compId) {
    scriptNames[compId] = getScriptName(compId, structure);
  });
  scriptNames.global = "Global Script";
  scriptNames.overlay = "Overlay Script";

  return {
    compositionStructure: structure,
    scriptNames: scriptNames,
  };
}

async function summarize(host, token, accessToken) {
  const content = await fetchContent(host, token);
  const scriptEntries = await fetchScriptsList(host, token, accessToken);
  const info = resolveScriptNames(content);
  const modelsDataLinksNodeRefs = extractModelsDataLinksNodeRefs(content);
  const discoveredScriptIds = scriptEntries.map(function(entry) {
    return entry.id;
  });

  if (
    discoveredScriptIds.indexOf(content.mainComposition) === -1 &&
    content.mainComposition
  ) {
    discoveredScriptIds.push(content.mainComposition);
  }

  return {
    host: host,
    source: "composer-agent-handoff-full",
    fastPath: false,
    mainComposition: content.mainComposition || null,
    scriptsEndpointCount: scriptEntries.length,
    scriptIds: discoveredScriptIds,
    scriptNames: info.scriptNames,
    compositionStructure: info.compositionStructure,
    widgetReferences: createWidgetReferencesFromContent(content),
    modelsDataLinksNodeRefs: modelsDataLinksNodeRefs,
    animation: extractAnimationInfo(content),
  };
}

async function getScript(host, token, scriptId, accessToken) {
  return fetchJson(
    host + "/apiv1/compositions/" + token + "/scripts/" + scriptId,
    { headers: composerAgentHeaders(accessToken) }
  );
}

async function putScript(host, token, scriptId, script, accessToken) {
  const body = JSON.stringify({ script: script });
  return request(host + "/apiv1/compositions/" + token + "/scripts/" + scriptId, {
    method: "PUT",
    headers: composerAgentHeaders(accessToken, {
      "Content-Type": "application/json",
    }),
    body: body,
  });
}

function printJson(value) {
  process.stdout.write(JSON.stringify(value, null, 2));
}

function getUsage() {
  return [
    "Usage:",
    "  node composer-agent.js script-handoff --compact | node compositionScriptCli.js --handoff-file - --action summary",
    "  node composer-agent.js script-handoff --compact | node compositionScriptCli.js --handoff-file - --action summary --full",
    "  node composer-agent.js script-handoff --compact | node compositionScriptCli.js --handoff-file - --action get-script",
    "  node composer-agent.js script-handoff --compact | node compositionScriptCli.js --handoff-file - --action put-script --script-file <path>",
    "  node composer-agent.js script-handoff --compact | node compositionScriptCli.js --handoff-file - --action clear-script",
  ].join("\n");
}

async function main() {
  const args = parseArgs(process.argv);
  const action = args.action || "summary";

  if (args.help) {
    process.stdout.write(getUsage());
    return;
  }

  if (args.token || args.host) {
    throw new Error(
      "Direct --token and --host operation is not supported; provide a composer-agent script handoff"
    );
  }

  const handoff = readHandoff(args);
  if (!handoff) {
    throw new Error("Missing script handoff: provide --handoff-file <path|->");
  }
  const token = handoff.compositionToken;
  const accessToken = handoff.composerAgentAccessToken;
  const host = normalizeHost(handoff.host);
  if (!token || !accessToken || !host) {
    throw new Error(
      "Script handoff must include host, compositionToken, and composerAgentAccessToken"
    );
  }
  const handoffScriptId = getHandoffScriptId(handoff);

  if (action === "summary") {
    printJson(
      args.full
        ? await summarize(host, token, accessToken)
        : summarizeHandoff(handoff, host)
    );
    return;
  }

  if (args.full) {
    throw new Error("--full is supported only with --action summary");
  }

  if (action === "list-scripts") {
    const handoffEntries = await fetchScriptsList(host, token, accessToken);
    printJson({
      host: host,
      source: "composer-agent-handoff",
      fastPath: true,
      scriptsEndpointCount: handoffEntries.length,
      scripts: handoffEntries,
      fallbackScriptId: handoffScriptId,
      fallbackScriptName:
        (handoff.scriptNames && handoff.scriptNames[handoffScriptId]) ||
        handoffScriptId,
      scriptNames: handoff.scriptNames || {},
    });
    return;
  }

  if (action === "get-script") {
    const scriptId = args["script-id"] || handoffScriptId;
    if (!scriptId) {
      throw new Error(
        "Missing script target: provide --script-id or a handoff with suggestedScript.id"
      );
    }
    printJson(await getScript(host, token, scriptId, accessToken));
    return;
  }

  if (action === "put-script") {
    const scriptId = args["script-id"] || handoffScriptId;
    if (!scriptId) {
      throw new Error(
        "Missing script target: provide --script-id or a handoff with suggestedScript.id"
      );
    }
    let script = args.script;

    if (!script && args["script-file"]) {
      script = fs.readFileSync(args["script-file"], "utf8");
    }

    if (typeof script !== "string") {
      throw new Error("Provide --script or --script-file for put-script");
    }

    const response = await putScript(host, token, scriptId, script, accessToken);
    printJson({
      host: host,
      scriptId: scriptId,
      status: response.json || response.text || "saved",
    });
    return;
  }

  if (action === "clear-script") {
    const clearScriptId = args["script-id"] || handoffScriptId;
    if (!clearScriptId) {
      throw new Error(
        "Missing script target: provide --script-id or a handoff with suggestedScript.id"
      );
    }
    const clearResponse = await putScript(host, token, clearScriptId, "", accessToken);
    printJson({
      host: host,
      scriptId: clearScriptId,
      status: clearResponse.json || clearResponse.text || "saved",
    });
    return;
  }

  throw new Error("Unsupported action: " + action + "\n\n" + getUsage());
}

main().catch(function(error) {
  process.stderr.write(String((error && error.stack) || error));
  process.exit(1);
});
