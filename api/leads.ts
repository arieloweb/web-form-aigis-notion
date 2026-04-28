type LeadPayload = {
    tipo_contacto: "demo" | "ventas";
    nombre: string;
    email: string;
    celular: string;
    origen: "landing";
    created_at: string;
  };
  
  type JsonResponse = {
    ok: boolean;
    error?: string;
    detail?: string;
  };
  
  function sendJson(res: any, status: number, body: JsonResponse) {
    res.status(status).setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(body));
  }
  
  function setCors(req: any, res: any) {
    const allowedOrigin = process.env.ALLOWED_ORIGIN || "*";
    const origin = req.headers.origin;
  
    if (allowedOrigin === "*" || origin === allowedOrigin) {
      res.setHeader("Access-Control-Allow-Origin", allowedOrigin === "*" ? "*" : origin);
    }
  
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
  
  function isValidPayload(payload: any): payload is LeadPayload {
    if (!payload || typeof payload !== "object") return false;
    if (payload.tipo_contacto !== "demo" && payload.tipo_contacto !== "ventas") return false;
    if (typeof payload.nombre !== "string" || payload.nombre.trim().length < 2) return false;
    if (typeof payload.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) return false;
    if (typeof payload.celular !== "string" || payload.celular.trim().length < 6) return false;
    if (payload.origen !== "landing") return false;
    if (typeof payload.created_at !== "string" || Number.isNaN(Date.parse(payload.created_at))) return false;
    return true;
  }
  
  function buildNotionProperties(payload: LeadPayload) {
    return {
      Nombre: {
        title: [{ text: { content: payload.nombre } }],
      },
      Email: {
        email: payload.email,
      },
      Celular: {
        phone_number: payload.celular,
      },
      "Tipo contacto": {
        select: { name: payload.tipo_contacto },
      },
      Origen: {
        rich_text: [{ text: { content: payload.origen } }],
      },
      Fecha: {
        date: { start: payload.created_at },
      },
    };
  }
  
  export default async function handler(req: any, res: any) {
    setCors(req, res);
  
    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }
  
    if (req.method !== "POST") {
      return sendJson(res, 405, { ok: false, error: "method_not_allowed" });
    }
  
    const notionToken = process.env.NOTION_TOKEN;
    const notionDatabaseId = process.env.NOTION_DATABASE_ID;
  
    if (!notionToken || !notionDatabaseId) {
      return sendJson(res, 500, { ok: false, error: "missing_notion_env" });
    }
  
    const payload = req.body;
    if (!isValidPayload(payload)) {
      return sendJson(res, 400, { ok: false, error: "invalid_payload" });
    }
  
    const headers = {
      Authorization: `Bearer ${notionToken}`,
      "Content-Type": "application/json",
      "Notion-Version": "2022-06-28",
    };
  
    const properties = buildNotionProperties(payload);
  
    // Intento 1: database_id
    const attemptDb = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers,
      body: JSON.stringify({
        parent: { database_id: notionDatabaseId },
        properties,
      }),
    });
  
    if (attemptDb.ok) {
      return sendJson(res, 200, { ok: true });
    }
  
    const dbDetail = await attemptDb.text();
  
    // Intento 2: data_source_id (Notion nuevo)
    const attemptDs = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers,
      body: JSON.stringify({
        parent: { data_source_id: notionDatabaseId },
        properties,
      }),
    });
  
    if (attemptDs.ok) {
      return sendJson(res, 200, { ok: true });
    }
  
    const dsDetail = await attemptDs.text();
  
    return sendJson(res, 502, {
      ok: false,
      error: "notion_create_failed",
      detail: `database_id_error=${dbDetail} | data_source_id_error=${dsDetail}`,
    });
  }