
export const EXAMPLE_PROMPTS = [
  "Realistic cat with sunglasses",
  "Cyberpunk city at night",
  "Fantasy dragon in mountains",
  "Abstract colorful artwork",
  "Vintage car on highway",
  "Portrait of a futuristic samurai",
  "Enchanted forest with bioluminescent plants"
];

export const RATE_LIMIT_PER_HOUR = 10;
export const MAX_PROMPT_CHARS = 1000;
export const MIN_PROMPT_CHARS = 3;

export const API_ENDPOINTS = {
  FLUX: (prompt: string) => `https://fluximg.rydenxgod.workers.dev/?prompt=${encodeURIComponent(prompt)}&size=1024x1024&n=1&output_format=png`,
  SMALL_VERSION: (prompt: string) => `https://text-to-img.apis-bj-devs.workers.dev/?prompt=${encodeURIComponent(prompt)}`,
  POLLINATION: (prompt: string) => `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?nologo=true`
};
