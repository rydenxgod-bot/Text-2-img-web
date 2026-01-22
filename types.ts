
export enum Tab {
  GENERATE = 'GENERATE',
  GALLERY = 'GALLERY',
  STATS = 'STATS',
  INFO = 'INFO'
}

export interface GeneratedImage {
  id: string;
  url: string;
  prompt: string;
  timestamp: number;
  source: string;
}

export interface GalleryItem {
  id: string;
  images: string[];
  prompt: string;
  timestamp: number;
  sources: string[];
}

export interface UserStats {
  totalGenerated: number;
  totalPrompts: number;
  successRate: number;
  apiCalls: {
    flux: number;
    smallVersion: number;
    pollination: number;
  };
  wordCounts: Record<string, number>;
}

export interface AppSettings {
  theme: 'light' | 'dark';
  lastGeneration: number;
}
