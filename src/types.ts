export interface CopywritingConfig {
  mainTitle: string;
  highlights: string[];
  details: string;
  model: 'gemini' | 'gpt';
  contentStyle: string;
  duration: '15-30s' | '30-60s' | '1-3min';
  referenceImageUrl?: string;
}

export interface CopywritingResult {
  titles: string[];
  sections: {
    opening: string;
    hook: string;
    body: string;
    outro: string;
  };
  hashtags: string[];
}
