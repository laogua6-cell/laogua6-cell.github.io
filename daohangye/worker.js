export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const workerHost = url.host; 
    const workerPrefix = `${url.protocol}//${workerHost}/`;

    // 1. 提取目标 URL
    let targetUrlStr = url.pathname.replace(/^\/+/, "");
    
    // 如果没有目标地址，显示欢迎页面
    if (!targetUrlStr) {
      return new Response("成功！", {
        headers: { "Content-Type": "text/html;charset=UTF-8" }
      });
    }

    // 补全 https 协议
    if (!targetUrlStr.startsWith('http')) {
      targetUrlStr = 'https://' + targetUrlStr;
    }
    targetUrlStr += url.search;

    try {
      const newHeaders = new Headers(request.headers);
      // 模拟常见浏览器，防止被 GitHub 或采集站拦截
      newHeaders.set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

      const response = await fetch(targetUrlStr, {
        method: request.method,
        headers: newHeaders,
        redirect: "follow"
      });

      const contentType = response.headers.get("Content-Type") || "";
      
      // --- 关键：针对长域名的防止“套娃”逻辑 ---
      if (
        contentType.includes("application/json") || 
        contentType.includes("text/xml") || 
        contentType.includes("application/xml") || 
        contentType.includes("text/plain")
      ) {
        let content = await response.text();

        // 自动将域名中的 . 转义，防止正则解析错误
        // 比如将 x.y.org 转为 x\.y\.org
        const escapedHost = workerHost.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        // 构建正则：匹配所有 http 链接，但排除掉已经包含本域名的链接
        const regex = new RegExp(`https?://(?!${escapedHost})[^\\s"']+`, 'g');
        
        content = content.replace(regex, (match) => {
          return workerPrefix + match;
        });

        return new Response(content, {
          status: response.status,
          headers: {
            "Content-Type": contentType,
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-cache" // 严格无缓存，保证 GitHub 文件和动态图片实时更新
          }
        });
      }

      // 3. 图片、图标、视频等二进制资源直接流式透传
      const modifiedHeaders = new Headers(response.headers);
      modifiedHeaders.set("Access-Control-Allow-Origin", "*");
      
      return new Response(response.body, {
        status: response.status,
        headers: modifiedHeaders
      });

    } catch (e) {
      return new Response("代理请求失败: " + e.message, { status: 500 });
    }
  }
};
