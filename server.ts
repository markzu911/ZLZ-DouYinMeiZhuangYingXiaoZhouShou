import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import OpenAI from "openai";
import axios from "axios";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

// Helper to convert frontend schema type to Gemini SDK requirements
// Using string literals as the SDK handles them in many versions, or we just type as any
const processSchema = (s: any): any => {
  if (!s) return undefined;
  const processed: any = { type: s.type.toUpperCase() }; // SDK expects uppercase strings or enum
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

// SaaS Backend host
const SAAS_HOST = "http://aibigtree.com";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // Helper for proxying requests to SaaS backend
  const proxyToSaaS = async (req: express.Request, res: express.Response, targetPath: string) => {
    try {
      const response = await axios({
        method: req.method,
        url: `${SAAS_HOST}${targetPath}`,
        data: req.body,
        params: req.query,
        headers: {
          'Content-Type': 'application/json',
          // Optionally forward headers if needed, but the doc says "no auth forwarding"
        }
      });
      res.status(response.status).json(response.data);
    } catch (error: any) {
      console.error(`SaaS Proxy Error (${targetPath}):`, error.response?.data || error.message);
      res.status(error.response?.status || 500).json(error.response?.data || { error: "SaaS 代理请求失败" });
    }
  };

  // SaaS Standard Tool Endpoints (3-Step Flow)
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
        return res.status(400).json({ error: "请在设置中配置 OPENAI_API_KEY 以使用 GPT-4 模型。" });
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
    try {
      const { model, prompt, systemInstruction, responseSchema } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;

      if (!apiKey) {
        return res.status(400).json({ error: "服务器未配置 GEMINI_API_KEY。" });
      }

      const genAI = new GoogleGenAI({ apiKey });
      const geminiModel = (genAI as any).getGenerativeModel({ 
        model: model || "gemini-1.5-flash",
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
      res.json({ text: response.text() });
    } catch (error: any) {
      console.error("Gemini Error:", error);
      res.status(500).json({ error: error.message || "Gemini 生成失败" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
