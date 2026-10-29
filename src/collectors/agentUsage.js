import fs from "node:fs";
import path from "node:path";
import { requestJson } from "../lib/http.js";

const DEFAULT_EXPORT_CANDIDATES = [
  path.join("data", "copilot-studio-usage.json"),
  path.join("data", "copilot-studio-usage.csv")
];

function normalizeRows(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (payload && typeof payload === "object") {
    if (Array.isArray(payload.value)) {
      return payload.value;
    }
    if (Array.isArray(payload.rows)) {
      return payload.rows;
    }
    if (Array.isArray(payload.data)) {
      return payload.data;
    }
    if (Array.isArray(payload.items)) {
      return payload.items;
    }
  }
  return [];
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        current += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  values.push(current);
  return values;
}

function parseCsv(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);
  if (!lines.length) {
    return [];
  }
  const headers = parseCsvLine(lines[0]).map((value) => value.trim());
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header || `col${index + 1}`] = cells[index] ?? "";
    });
    return row;
  });
}

function getCaseInsensitive(row, candidates) {
  const index = new Map();
  Object.entries(row || {}).forEach(([key, value]) => {
    index.set(key.toLowerCase(), value);
  });
  for (const candidate of candidates) {
    const value = index.get(candidate.toLowerCase());
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return null;
}

function summarizeRows(rows) {
  const agentIds = new Set();
  const userIds = new Set();
  for (const row of rows) {
    const agentId = getCaseInsensitive(row, [
      "agentIdentityBlueprintId",
      "agentIdentityId",
      "agentId",
      "agent_id",
      "agent",
      "agentName",
      "Agent Id",
      "AgentID",
      "AgentName"
    ]);
    const userId = getCaseInsensitive(row, [
      "userId",
      "userPrincipalName",
      "upn",
      "user",
      "owner",
      "_customerid_value",
      "_createdby_value",
      "customerid",
      "createdby",
      "Owner",
      "User",
      "UserPrincipalName"
    ]);
    if (agentId) {
      agentIds.add(agentId);
    }
    if (userId) {
      userIds.add(userId);
    }
  }
  return {
    rowCount: rows.length,
    distinctAgentCount: agentIds.size,
    distinctUserCount: userIds.size
  };
}

function collectFromDataverse(dataverseSource) {
  if (!dataverseSource || dataverseSource.ok !== true) {
    return {
      ok: false,
      skipped: true,
      reason:
        dataverseSource?.reason ||
        dataverseSource?.error ||
        "Copilot Studio Dataverse source is unavailable."
    };
  }

  const bots = Array.isArray(dataverseSource.bots) ? dataverseSource.bots : [];
  const transcripts = Array.isArray(dataverseSource.conversationtranscripts)
    ? dataverseSource.conversationtranscripts
    : [];
  const botNameById = new Map();
  for (const bot of bots) {
    const id = String(bot?.botid || "").trim();
    if (id) {
      botNameById.set(id, bot?.name || null);
    }
  }

  const rows = transcripts.map((row) => {
    const agentId =
      row?._botid_value || row?.botid || row?.agentIdentityBlueprintId || row?.agentId || null;
    const userId =
      row?._customerid_value || row?._createdby_value || row?.customerid || row?.createdby || null;
    const conversationId = row?._conversationid_value || row?.conversationid || null;
    return {
      ...row,
      agentId,
      agentName: agentId ? botNameById.get(String(agentId)) || null : null,
      userId,
      conversationId
    };
  });

  return {
    ok: true,
    source: "copilotStudioDataverse",
    summary: summarizeRows(rows),
    rows,
    raw: {
      dataverseUrl: dataverseSource.dataverseUrl,
      transcriptWindowStart: dataverseSource.transcriptWindowStart,
      transcriptTop: dataverseSource.transcriptTop
    }
  };
}

async function collectFromAgent365(graphToken) {
  const endpoint = (process.env.AGENT365_USAGE_URL || "").trim();
  if (!endpoint) {
    return {
      ok: false,
      skipped: true,
      reason: "AGENT365_USAGE_URL is not set."
    };
  }
  const payload = await requestJson(endpoint, graphToken);
  const rows = normalizeRows(payload);
  return {
    ok: true,
    source: "agent365",
    endpoint,
    summary: summarizeRows(rows),
    rows,
    raw: payload
  };
}

function findExportPath(projectRoot) {
  const configured = (process.env.COPILOT_STUDIO_USAGE_EXPORT_PATH || "").trim();
  if (configured) {
    const full = path.isAbsolute(configured) ? configured : path.resolve(projectRoot, configured);
    return fs.existsSync(full) ? full : null;
  }
  for (const candidate of DEFAULT_EXPORT_CANDIDATES) {
    const full = path.resolve(projectRoot, candidate);
    if (fs.existsSync(full)) {
      return full;
    }
  }
  return null;
}

function collectFromCopilotStudioExport(projectRoot) {
  const exportPath = findExportPath(projectRoot);
  if (!exportPath) {
    return {
      ok: false,
      skipped: true,
      reason:
        "No Copilot Studio export found. Provide COPILOT_STUDIO_USAGE_EXPORT_PATH or place data/copilot-studio-usage.json|csv."
    };
  }

  const ext = path.extname(exportPath).toLowerCase();
  const text = fs.readFileSync(exportPath, "utf8");
  let rows;
  let raw;
  if (ext === ".json") {
    raw = JSON.parse(text);
    rows = normalizeRows(raw);
  } else if (ext === ".csv") {
    rows = parseCsv(text);
    raw = { format: "csv", rows };
  } else {
    throw new Error(`Unsupported export format: ${ext}`);
  }

  return {
    ok: true,
    source: "copilotStudioExport",
    filePath: exportPath,
    format: ext === ".json" ? "json" : "csv",
    summary: summarizeRows(rows),
    rows,
    raw
  };
}

export async function collectAgentUsage(graphToken, projectRoot, dataverseSource) {
  const attempts = [];

  try {
    const agent365 = await collectFromAgent365(graphToken);
    if (agent365.ok) {
      return {
        ...agent365,
        fallbackUsed: false
      };
    }
    attempts.push({ source: "agent365", result: agent365 });
  } catch (error) {
    attempts.push({ source: "agent365", error: error.message });
  }

  let studioExport;
  try {
    studioExport = collectFromCopilotStudioExport(projectRoot);
    if (studioExport.ok) {
      return {
        ...studioExport,
        fallbackUsed: true,
        fallbackFrom: "agent365"
      };
    }
    attempts.push({ source: "copilotStudioExport", result: studioExport });
  } catch (error) {
    attempts.push({ source: "copilotStudioExport", error: error.message });
  }

  const dataverse = collectFromDataverse(dataverseSource);
  if (dataverse.ok) {
    return {
      ...dataverse,
      fallbackUsed: true,
      fallbackFrom: "agent365/copilotStudioExport"
    };
  }
  attempts.push({ source: "copilotStudioDataverse", result: dataverse });

  return {
    ok: false,
    skipped: true,
    reason:
      dataverse.reason ||
      studioExport?.reason ||
      "No agent usage data source available. Configure AGENT365_USAGE_URL, COPILOT_STUDIO_USAGE_EXPORT_PATH, or DATAVERSE_URL.",
    attempts
  };
}
