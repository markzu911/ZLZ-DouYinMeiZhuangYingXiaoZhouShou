import { GoogleGenerativeAI } from '@google/generative-ai';

const SAAS_ORIGIN = 'http://aibigtree.com';

const TOOL_ENDPOINTS = new Set([
  '/api/tool/launch',
  '/api/tool/verify',
  '/api/tool/consume',
  '/api/upload/direct-token',
  '/api/upload/commit',
  '/api/upload/image',
]);

function setCors(res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function getApiPath(req: any) {
  const path = req.query?.path;

  if (Array.isArray(path)) {
    return `/api/${path.join('/')}`;
  }

  if (typeof path === 'string') {
    return `/api/${path}`;
  }

  return (req.url || '').split('?')[0];
}

function normalizeBody(body: any) {
  if (!body) return {};

  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }

  return body;
}

function processSchema(schema: any): any {
  if (!schema) return undefined;

  const processed: any = {
    type: typeof schema.type === 'string' ? schema.type.toUpperCase() : schema.type,
  };

  if (schema.properties) {
    processed.properties = {};
    for (const key of Object.keys(schema.properties)) {
      processed.properties[key] = processSchema(schema.properties[key]);
    }
  }

  if (schema.items) {
    processed.items = processSchema(schema.items);
  }

  if (schema.required) processed.required = schema.required;
  if (schema.description) processed.description = schema.description;

  return processed;
}

async function proxyTool(req: any, res: any, apiPath: string) {
  const upstream = await fetch(`${SAAS_ORIGIN}${apiPath}`, {
    method: req.method,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: req.method === 'GET' ? undefined : JSON.stringify(normalizeBody(req.body)),
  });

  const text = await upstream.text();
  const contentType = upstream.headers.get('content-type') || 'application/json; charset=utf-8';

  res.setHeader('Content-Type', contentType);
  return res.status(upstream.status).send(text);
}

async function handleGemini(req: any, res: any) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      success: false,
      error: 'Missing GEMINI_API_KEY on server',
    });
  }

  const body = normalizeBody(req.body);
  const {
    prompt,
    systemInstruction,
    responseSchema,
    model = process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  } = body;

  if (!prompt) {
    return res.status(400).json({
      success: false,
      error: 'Missing prompt',
    });
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);

    const geminiModel = genAI.getGenerativeModel({
      model,
      systemInstruction,
    });

    const generationConfig: any = {
      maxOutputTokens: 4096,
    };

    if (responseSchema) {
      generationConfig.responseMimeType = 'application/json';
      generationConfig.responseSchema = processSchema(responseSchema);
    }

    const result = await geminiModel.generateContent({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      generationConfig,
    });

    const response = await result.response;

    return res.status(200).json({
      success: true,
      text: response.text(),
    });
  } catch (error: any) {
    console.error('Gemini Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Gemini generation failed',
      detail: error?.message || String(error),
    });
  }
}

export default async function handler(req: any, res: any) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const apiPath = getApiPath(req);

  try {
    if (apiPath === '/api/gemini') {
      if (req.method !== 'POST') return res.status(405).end();
      return await handleGemini(req, res);
    }

    if (TOOL_ENDPOINTS.has(apiPath)) {
      return await proxyTool(req, res, apiPath);
    }

    // Dynamic check for other upload paths if needed
    if (apiPath.startsWith('/api/upload/')) {
       return await proxyTool(req, res, apiPath);
    }

    return res.status(404).json({
      success: false,
      error: 'API route not found',
      path: apiPath,
    });
  } catch (error: any) {
    console.error('Proxy Exception:', error);
    return res.status(502).json({
      success: false,
      error: 'Proxy request failed',
      detail: error?.message || String(error),
    });
  }
}
