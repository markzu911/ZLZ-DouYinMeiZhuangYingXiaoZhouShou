import { CopywritingConfig, CopywritingResult } from "../types";

export const generateDouyinCopy = async (config: CopywritingConfig): Promise<CopywritingResult> => {
  const { mainTitle, highlights, details, contentStyle, duration, model } = config;

  const systemInstruction = `你是一位顶级的短视频爆款内容专家。请严格按照 JSON 格式输出脚本。
不要截断，必须确保输出是一个完整的、格式正确的 JSON 对象。

【脚本结构要求】：
映射到以下键名：
1. opening (场景/痛点)：描述具体的痛点场景或吸引人的开场。
2. hook (深度关联/情绪共鸣)：描述核心价值点或引发观众共鸣。
注意：opening + hook 总字数必须在 50 字以内。
3. body (正文)：详实丰富，自然融入【核心卖点标签】。正文部分必须根据文案逻辑分块、分点或分段落清晰列出（例如可以从多个角度、多个特性、使用场景等拆分成多个部分，如：“1. 核心优势一... 2. 独特设计... 3. 适用场景... 4. 真实体验... 等等”），条理分明。每个段落或层级之间【必须使用双换行符 \\n\\n 进行分隔】，确保呈现出明显的分段效果。如果字数要求较多，请大量补充细节。
4. outro (结尾引导)：包含明确的互动引导（如“快来评论区讨论”、“点赞关注不迷路”）。

【风格与要求】：
- 视角：第一人称“我”。
- 语气：口语化、分享欲强。
- 时长：${duration} (${duration === '15-30s' ? '对应约30秒视频，字数约120字' : duration === '30-60s' ? '对应约60秒视频，字数约300字' : '对应约3分钟长视频，字数约800字，必须包含详尽的展开或步骤演示'})。
- 强制要求：如果是 1-3min 档位，正文部分必须深度展开，增加细节密集度，确保信息量撑起时长和字数要求。
- 强制要求：opening 和 hook 的文字总数不得超过 50 字。

核心主题：${mainTitle}
卖点标签：${highlights.join(', ')}
风格设定：${contentStyle}

必须输出以下格式：
{
  "titles": ["标题1", "标题2", "标题3"],
  "sections": { "opening": "...", "hook": "...", "body": "...", "outro": "..." },
  "hashtags": ["标签1", "标签2", ...]
}`;

  const prompt = `请基于以上指令，为“${mainTitle}”生成高质量的 JSON 脚本。${config.referenceImageBase64 ? '提示：用户上传了一张参考图，请结合图片中的视觉信息、包装或内容细节来辅助生成文案。' : ''}细节补充：${details.slice(0, 1500)}。`;

  try {
    let text = "";

    // If model is GPT, use backend proxy
    if (model === 'gpt') {
      const response = await fetch("/api/generate-gpt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          systemInstruction,
          image: config.referenceImageBase64
        }),
      });
      
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "GPT 生成请求失败");
      }
      text = data.text || '';
    } else {
      // Use Gemini via backend proxy
      const response = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Do not hardcode model here, let backend use its environment variable
          prompt,
          systemInstruction,
          image: config.referenceImageBase64, // Pass base64 image
          responseSchema: {
            type: "object",
            properties: {
              titles: {
                type: "array",
                items: { type: "string" },
                description: "3部爆款标题"
              },
              sections: {
                type: "object",
                properties: {
                  opening: { type: "string", description: "视频开头" },
                  hook: { type: "string", description: "钩子部分" },
                  body: { type: "string", description: "视频正文" },
                  outro: { type: "string", description: "结尾引导" }
                },
                required: ["opening", "hook", "body", "outro"]
              },
              hashtags: {
                type: "array",
                items: { type: "string" },
                description: "热门标签"
              }
            },
            required: ["titles", "sections", "hashtags"]
          }
        }),
      });
      
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Gemini 生成请求失败");
      }
      text = data.text || '';
    }
    
    // Safety check: sometimes the model output is wrapped in markdown even with responseMimeType
    if (text.includes('```json')) {
      text = text.split('```json')[1].split('```')[0].trim();
    } else if (text.includes('```')) {
      text = text.split('```')[1].split('```')[0].trim();
    }
    
    try {
      return JSON.parse(text) as CopywritingResult;
    } catch (parseError) {
      console.error("JSON Parse Error:", parseError, "Raw Text:", text);
      throw new Error("模型响应格式异常，请稍后重试。");
    }
  } catch (error: any) {
    console.error("AI Generation Error:", error);
    if (error.message?.includes("JSON")) {
      throw new Error("文案生成解析失败，建议缩短细节描述后重试。");
    }
    throw new Error(error.message || "文案生成失败，请稍后重试。");
  }
};
