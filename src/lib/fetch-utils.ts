export async function readJsonResponse(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();

  let data: any = null;
  if (contentType.includes("application/json") && text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    if (response.status === 413) {
      throw new Error("请求内容过大：请压缩或移除参考图片后重试。");
    }

    const message =
      data?.error ||
      data?.message ||
      text?.slice(0, 300) ||
      `请求失败，状态码 ${response.status}`;

    throw new Error(message);
  }

  if (!data) {
    throw new Error("服务器返回的不是 JSON，请检查 API 路由或部署配置。");
  }

  return data;
}
