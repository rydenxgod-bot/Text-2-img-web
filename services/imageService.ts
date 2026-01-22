
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
): Promise<{ images: string[], sources: string[] }> => {
  onProgress(5, "Calibrating Primary Engines...");
  const encodedPrompt = encodeURIComponent(prompt.trim());
  const masterSeed = Date.now();
  
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

  // 2. Small Version API (Emergency Fallback)
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

  // 3. Pollination API (Direct URL - Highly Reliable)
  const fetchPollination = () => {
    return `https://image.pollinations.ai/prompt/${encodedPrompt}?nologo=true&seed=${masterSeed}&width=1024&height=1024`;
  };

  onProgress(20, "Executing Priority Tasks...");
  
  // Start Primary Engines
  const [pollRes, fluxRes] = await Promise.all([
    Promise.resolve(fetchPollination()), // Pollination is instant URL generation
    fetchFlux().then(r => { onProgress(60, "Flux Engine Processed..."); return r; })
  ]);

  const images: string[] = [];
  const sources: string[] = [];

  if (pollRes) {
    images.push(pollRes);
    sources.push('Pollination');
  }
  
  if (fluxRes) {
    images.push(fluxRes);
    sources.push('Flux Ai');
  }

  // EMERGENCY FALLBACK LOGIC: 
  // If one of the primary ones failed, trigger Small Version to maintain image count
  if (images.length < 2) {
    onProgress(80, "Primary failure detected. Activating Emergency Fallback...");
    const smallRes = await fetchSmallVersion();
    if (smallRes) {
      images.push(smallRes);
      sources.push('Small Version');
    }
  }

  onProgress(100, "Generation Complete.");
  
  if (images.length === 0) {
    throw new Error("All generation engines failed. Please try a different prompt.");
  }

  return { images, sources };
};
