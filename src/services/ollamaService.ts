export interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
}

export interface OllamaListResponse {
  models: OllamaModel[];
}

export interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  stream: false;
  options?: {
    temperature?: number;
  };
}

export interface OllamaGenerateResponse {
  response: string;
  done: boolean;
}

export class OllamaService {
  /**
   * Check if the Ollama server is reachable
   */
  static async checkConnection(serverUrl: string): Promise<boolean> {
    try {
      const response = await fetch(`${serverUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * List available models from the Ollama server
   */
  static async listModels(serverUrl: string): Promise<OllamaModel[]> {
    const response = await fetch(`${serverUrl}/api/tags`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      throw new Error(`Failed to list models: ${response.statusText}`);
    }
    const data: OllamaListResponse = await response.json();
    return data.models || [];
  }

  /**
   * Generate tag suggestions for a note
   */
  static async suggestTags(
    serverUrl: string,
    model: string,
    noteContent: string,
    existingTags: string[]
  ): Promise<string[]> {
    const prompt = this.buildTagSuggestionPrompt(noteContent, existingTags);

    const response = await fetch(`${serverUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: { temperature: 0.3 },
      } satisfies OllamaGenerateRequest),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      throw new Error(`Failed to generate tags: ${response.statusText}`);
    }

    const data: OllamaGenerateResponse = await response.json();
    return this.parseTagResponse(data.response);
  }

  private static buildTagSuggestionPrompt(
    content: string,
    existingTags: string[]
  ): string {
    const existingTagsStr =
      existingTags.length > 0
        ? `\nExisting tags in this vault: ${existingTags.slice(0, 50).join(', ')}`
        : '';

    return `You are a tag suggestion assistant. Analyze the following note and suggest 3-5 relevant tags.

Rules:
- Return ONLY a JSON array of lowercase tag strings
- Tags should be single words or hyphenated (e.g., "machine-learning")
- Prefer existing tags when relevant
- Focus on topics, themes, and categories
${existingTagsStr}

Note content:
${content.slice(0, 2000)}

Respond with ONLY a JSON array, no explanation:`;
  }

  private static parseTagResponse(response: string): string[] {
    try {
      // Extract JSON array from response
      const match = response.match(/\[[\s\S]*?\]/);
      if (match) {
        const tags = JSON.parse(match[0]);
        if (Array.isArray(tags)) {
          return tags
            .filter((t): t is string => typeof t === 'string')
            .map((t) => t.toLowerCase().trim().replace(/^#/, ''))
            .filter((t) => /^[a-z][a-z0-9_-]*$/.test(t))
            .slice(0, 5);
        }
      }
    } catch {
      // If JSON parsing fails, try line-based extraction
    }

    // Fallback: try line-based extraction
    const lines = response.split('\n');
    const tags: string[] = [];
    for (const line of lines) {
      const cleaned = line
        .replace(/^[-*•"\s]+/, '')
        .replace(/[",\s]+$/, '')
        .trim()
        .toLowerCase()
        .replace(/^#/, '');
      if (/^[a-z][a-z0-9_-]*$/.test(cleaned) && cleaned.length > 1) {
        tags.push(cleaned);
      }
    }
    return tags.slice(0, 5);
  }
}
