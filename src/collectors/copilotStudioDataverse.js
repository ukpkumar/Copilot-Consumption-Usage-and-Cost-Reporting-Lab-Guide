import { listAll, requestText } from "../lib/http.js";

function parseInteger(value, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    return fallback;
  }
  return Math.floor(num);
}

function normalizeDataverseBase(dataverseUrl) {
  const parsed = new URL(dataverseUrl);
  return parsed.origin;
}

function toIsoLookback(days) {
  const now = Date.now();
  const start = new Date(now - days * 24 * 60 * 60 * 1000);
  return start.toISOString();
}

function summarize(rows) {
  return Array.isArray(rows) ? rows.length : 0;
}

export async function collectCopilotStudioDataverse(accessToken, dataverseUrl) {
  const base = normalizeDataverseBase(dataverseUrl);
  const api = `${base}/api/data/v9.2`;

  const lookbackDays = parseInteger(process.env.COPILOT_STUDIO_LOOKBACK_DAYS, 30);
  const transcriptTop = parseInteger(process.env.COPILOT_STUDIO_TRANSCRIPT_TOP, 500);
  const sinceIso = toIsoLookback(lookbackDays);

  const botsUrl = `${api}/bots?$select=botid,name,createdon,modifiedon,statecode,statuscode`;
  const componentsUrl =
    `${api}/botcomponents?` +
    `$select=botcomponentid,name,createdon,modifiedon,statecode,statuscode,_botid_value`;
  const transcriptsUrl =
    `${api}/conversationtranscripts?` +
    `$select=conversationtranscriptid,createdon,modifiedon,statecode,statuscode` +
    `&$filter=createdon ge ${sinceIso}` +
    `&$orderby=createdon desc` +
    `&$top=${transcriptTop}`;

  const [bots, botcomponents, conversationtranscripts, transcriptCountText] = await Promise.all([
    listAll(botsUrl, accessToken),
    listAll(componentsUrl, accessToken),
    listAll(transcriptsUrl, accessToken),
    requestText(`${api}/conversationtranscripts/$count?$filter=createdon ge ${sinceIso}`, accessToken).catch(
      () => null
    )
  ]);
  const transcriptCount = transcriptCountText ? Number(transcriptCountText) : null;

  return {
    ok: true,
    dataverseUrl: base,
    lookbackDays,
    transcriptWindowStart: sinceIso,
    transcriptTop,
    apis: {
      bots: "GET /api/data/v9.2/bots",
      botcomponents: "GET /api/data/v9.2/botcomponents",
      conversationtranscripts: "GET /api/data/v9.2/conversationtranscripts",
      conversationtranscriptsCount: "GET /api/data/v9.2/conversationtranscripts/$count"
    },
    summary: {
      bots: summarize(bots),
      botcomponents: summarize(botcomponents),
      conversationtranscripts: summarize(conversationtranscripts),
      conversationtranscriptsCount: Number.isFinite(transcriptCount) ? transcriptCount : null
    },
    bots,
    botcomponents,
    conversationtranscripts
  };
}
