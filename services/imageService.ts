
const toBase64 = async (url: string): Promise<string> => {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Fetch failed");
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('Failed to convert to base64, using raw URL:', error);
    return url;
  }
};

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

export const fetchImages = async (
  prompt: string, 
  onProgress: (p: number, status: string) => void,
  signal: AbortSignal
): Promise<string[]> => {
  onProgress(5, "Initializing engines...");
  const encodedPrompt = encodeURIComponent(prompt.trim());
  
  // 1. Flux Ai API
  const fetchFlux = async () => {
    try {
      const res = await fetch(`https://fluximg.rydenxgod.workers.dev/?prompt=${encodedPrompt}&size=1024x1024&n=1&output_format=png`, { signal });
      if (!res.ok) throw new Error("Flux request failed");
      const data = await res.json();
      if (data.data?.images?.[0]?.url) {
        return await toBase64(data.data.images[0].url);
      }
    } catch (e) { console.error('Flux Ai engine failed', e); }
    return null;
  };

  // 2. Small Version API
  const fetchSmallVersion = async () => {
    try {
      const url = `https://text-to-img.apis-bj-devs.workers.dev/?prompt=${encodedPrompt}`;
      const res = await fetch(url, { signal });
      
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        const data = await res.json();
        const imageUrl = data.result?.[0] || data.url || data.image;
        if (imageUrl) return await toBase64(imageUrl);
      } else {
        const blob = await res.blob();
        if (blob.size > 0 && (blob.type.startsWith("image/") || blob.type === "application/octet-stream")) {
          return await blobToBase64(blob);
        }
      }
    } catch (e) { console.error('Small Version engine failed', e); }
    return null;
  };

  // 3. Pollination API - Guaranteed direct URL return
  const fetchPollination = async () => {
    const seed = Date.now() + Math.floor(Math.random() * 1000);
    return `https://image.pollinations.ai/prompt/${encodedPrompt}?nologo=true&seed=${seed}&width=1024&height=1024`;
  };

  onProgress(20, "Requesting images...");
  
  // Fetching all simultaneously
  const [fluxRes, smallRes, pollRes] = await Promise.all([
    fetchFlux().then(r => { onProgress(40, "Flux Ai ready..."); return r; }),
    fetchSmallVersion().then(r => { onProgress(60, "Small Version ready..."); return r; }),
    fetchPollination().then(r => { onProgress(80, "Pollination ready..."); return r; })
  ]);

  onProgress(95, "Compiling Triple Output...");
  
  const results: string[] = [];

  // SEQUENCE: Pollination -> Flux -> Small Version
  // We provide fallbacks if external APIs fail, but Pollination is guaranteed.
  if (pollRes) results.push(pollRes);
  if (fluxRes) results.push(fluxRes);
  if (smallRes) results.push(smallRes);
  
  if (results.length === 0) {
    throw new Error("Critical engine failure. Please check your connection.");
  }

  onProgress(100, "Done!");
  return results;
};
