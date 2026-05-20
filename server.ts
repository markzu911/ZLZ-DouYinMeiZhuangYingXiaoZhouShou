import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import axios from "axios";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";

dotenv.config();

const SAAS_ORIGIN = 'http://aibigtree.com';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // SaaS Proxy logic for local dev
  const proxyToSaaS = async (req: express.Request, res: express.Response, targetPath: string) => {
    try {
      const response = await axios({
        method: req.method,
        url: `${SAAS_ORIGIN}${targetPath}`,
        data: req.body,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        }
      });
      res.status(response.status).json(response.data);
    } catch (error: any) {
      res.status(error.response?.status || 500).json(error.response?.data || { error: "SaaS Proxy Failed" });
    }
  };

  app.all("/api/tool/*", (req, res) => proxyToSaaS(req, res, req.path));
  app.all("/api/upload/*", (req, res) => proxyToSaaS(req, res, req.path));

  app.post("/api/gemini", async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY missing" });

    try {
      const { prompt, systemInstruction, image, model = process.env.GEMINI_MODEL || 'gemini-2.5-flash' } = req.body;
      const genAI = new GoogleGenerativeAI(apiKey);
      const geminiModel = genAI.getGenerativeModel({ model, systemInstruction });
      
      const contents: any[] = [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ];

      if (image && typeof image === 'string') {
        const match = image.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          contents[0].parts.push({
            inlineData: {
              mimeType: match[1],
              data: match[2],
            },
          });
        }
      }

      const result = await geminiModel.generateContent({ contents });
      const response = await result.response;
      res.json({ success: true, text: response.text() });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/generate-gpt", async (req, res) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "OPENAI_API_KEY missing" });

    try {
      const { prompt, systemInstruction, image, model = process.env.OPENAI_MODEL || 'gpt-4o-mini' } = req.body;
      const openai = new OpenAI({ apiKey });

      const userContent: any[] = [{ type: 'text', text: prompt }];

      if (image && typeof image === 'string') {
        userContent.push({
          type: 'image_url',
          image_url: { url: image },
        });
      }

      const completion = await openai.chat.completions.create({
        model,
        messages: [
          systemInstruction ? { role: 'system', content: systemInstruction } : null,
          { role: 'user', content: userContent },
        ].filter(Boolean) as any[],
      });

      const text = completion.choices?.[0]?.message?.content || '';
      res.json({ success: true, text });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
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
    console.log(`Development server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
