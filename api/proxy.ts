import express from "express";
import axios from "axios";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";

const app = express();
app.use(express.json({ limit: '50mb' }));

// SaaS Backend host
const SAAS_HOST = "https://aibigtree.com";

// Helper to convert frontend schema type to Gemini SDK requirements
const processSchema = (s: any): any => {
  if (!s) return undefined;
  const processed: any = { type: s.type.toUpperCase() };
  if (s.properties) {
    processed.properties = {};
    for (const key in s.properties) {
      processed.properties[key] = processSchema(s.properties[key]);
    }
  }
  if (s.items) {
    processed.items = processSchema(s.items);
  }
  if (s.required) processed.required = s.required;
  if (s.description) processed.description = s.description;
  return processed;
};

// Helper for proxying requests to SaaS backend
const proxyToSaaS = async (req: express.Request, res: express.Response, targetPath: string) => {
  const url = `${SAAS_HOST}${targetPath}`;
  console.log(`Proxying ${req.method} to SaaS: ${url}`);
  
  try {
    const response = await axios({
      method: req.method,
      url: url,
      data: req.body,
      params: req.query,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      timeout: 30000 // 30s timeout
    });
    res.status(response.status).json(response.data);
  } catch (error: any) {
    const errorData = error.response?.data;
    const status = error.response?.status || 500;
    
    console.error(`SaaS Proxy Error [${status}] (${targetPath}):`, errorData || error.message);
    
    // Return structured error
    res.status(status).json({ 
      success: false, 
      error: typeof errorData === 'string' ? errorData : (errorData?.message || errorData?.error || "SaaS 代理请求失败"),
      detail: errorData,
      path: targetPath
    });
  }
};

// CORS configuration (optional, as vercel.json handles rewrites, but good for direct calls)
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, DELETE");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  next();
});

// SaaS Standard Tool Endpoints
app.post("/api/tool/launch", (req, res) => proxyToSaaS(req, res, "/api/tool/launch"));
app.post("/api/tool/verify", (req, res) => proxyToSaaS(req, res, "/api/tool/verify"));
app.post("/api/tool/consume", (req, res) => proxyToSaaS(req, res, "/api/tool/consume"));

// Image Upload Endpoints
app.post("/api/upload/image", (req, res) => proxyToSaaS(req, res, "/api/upload/image"));
app.post("/api/upload/direct-token", (req, res) => proxyToSaaS(req, res, "/api/upload/direct-token"));
app.post("/api/upload/commit", (req, res) => proxyToSaaS(req, res, "/api/upload/commit"));
app.get("/api/upload/image", (req, res) => proxyToSaaS(req, res, "/api/upload/image"));
app.delete("/api/upload/image", (req, res) => proxyToSaaS(req, res, "/api/upload/image"));

// OpenAI Proxy Route
app.post("/api/generate-gpt", async (req, res) => {
  try {
    const { prompt, systemInstruction } = req.body;
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return res.status(400).json({ error: "请配置 OPENAI_API_KEY。" });
    }

    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    });

    const text = completion.choices[0].message.content;
    res.json({ text });
  } catch (error: any) {
    console.error("OpenAI Error:", error);
    res.status(500).json({ error: error.message || "GPT 生成失败" });
  }
});

// Gemini Proxy Route
app.post("/api/gemini", async (req, res) => {
  let requestedModel = req.body.model || process.env.GEMINI_MODEL || "gemini-2.0-flash";
  
  try {
    const { prompt, systemInstruction, responseSchema } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(400).json({ 
        success: false, 
        error: "Server configuration missing", 
        detail: "服务器未配置 GEMINI_API_KEY。" 
      });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const geminiModel = genAI.getGenerativeModel({ 
      model: requestedModel,
      systemInstruction: systemInstruction 
    });

    const generationConfig: any = {
      maxOutputTokens: 4096,
    };

    if (responseSchema) {
      generationConfig.responseMimeType = "application/json";
      generationConfig.responseSchema = processSchema(responseSchema);
    }

    const result = await geminiModel.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig
    });

    const response = await result.response;
    res.json({ success: true, text: response.text() });
  } catch (error: any) {
    console.error("Gemini Proxy Error:", error);
    
    // Check if it's a model not found error
    const isNotFound = error.message?.includes('not found') || error.status === 404 || error.response?.status === 404;

    if (isNotFound) {
      return res.status(404).json({
        success: false,
        error: "Gemini model is unavailable",
        detail: `当前模型 ${requestedModel} 不可用，请检查 GEMINI_MODEL 配置或尝试其他模型。`
      });
    }

    res.status(500).json({ 
      success: false, 
      error: "Gemini generation failed", 
      detail: error.message || "Unknown error during Gemini generation" 
    });
  }
});

export default app;
