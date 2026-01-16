import { createModuleLogger } from '../config/logger';
import { env } from '../config/env';

const logger = createModuleLogger('LLM');

export interface LLMResponse {
  intent: {
    action: 'CREATE_GOAL' | 'LIST_GOALS' | 'CHECK_PRICE' | 'DELETE_GOAL' | 'HELP' | 'UNKNOWN';
    symbol?: string;
    condition?: 'ABOVE' | 'BELOW' | 'CROSSES_ABOVE' | 'CROSSES_BELOW';
    target?: number;
    watchMode?: 'ONCE' | 'CONTINUOUS' | 'RECURRING';
    autoTrade?: boolean;
  };
  response: string;
  confidence: number;
}

export class LLMService {
  private provider: 'gemini' | 'groq' | 'none';
  private apiKey: string;
  private model: string;

  constructor() {
    // Determine which provider to use based on available API keys
    if (env.GEMINI_API_KEY) {
      this.provider = 'gemini';
      this.apiKey = env.GEMINI_API_KEY;
      this.model = 'gemini-2.0-flash-exp';
      logger.info(`LLM Service initialized with Gemini (model: ${this.model})`);
    } else if (env.GROQ_API_KEY) {
      this.provider = 'groq';
      this.apiKey = env.GROQ_API_KEY;
      this.model = 'llama-3.3-70b-versatile';
      logger.info(`LLM Service initialized with Groq (model: ${this.model})`);
    } else {
      this.provider = 'none';
      this.apiKey = '';
      this.model = '';
      logger.warn('No LLM API key configured. Using basic NLP only.');
    }
  }

  async processMessage(message: string, context?: { tradingMode: string }): Promise<LLMResponse | null> {
    if (this.provider === 'none') {
      return null; // Fall back to basic NLP
    }

    try {
      const systemPrompt = this.buildSystemPrompt();
      const userPrompt = this.buildUserPrompt(message, context);

      let response;
      if (this.provider === 'gemini') {
        response = await this.callGemini(systemPrompt, userPrompt);
      } else {
        response = await this.callGroq(systemPrompt, userPrompt);
      }

      return this.parseLLMResponse(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('LLM processing error', { 
        error: errorMessage, 
        provider: this.provider,
        stack: error instanceof Error ? error.stack : undefined
      });
      return null; // Fall back to basic NLP
    }
  }

  private buildSystemPrompt(): string {
    return `You are a crypto trading assistant. Your job is to understand user messages and extract trading intent.

Supported cryptocurrencies: BTC/Bitcoin (BTCUSDT), ETH/Ethereum (ETHUSDT), BNB/Binance Coin (BNBUSDT), ADA/Cardano (ADAUSDT), SOL/Solana (SOLUSDT), XRP/Ripple (XRPUSDT)

Available actions:
- CREATE_GOAL: User wants to set a price alert or trading goal
- LIST_GOALS: User wants to see their active goals
- CHECK_PRICE: User wants to know current price
- DELETE_GOAL: User wants to remove a goal
- HELP: User needs help
- UNKNOWN: Cannot determine intent

Price conditions:
- ABOVE: Alert when price goes above target
- BELOW: Alert when price goes below target
- CROSSES_ABOVE: Alert when price crosses above (transition)
- CROSSES_BELOW: Alert when price crosses below (transition)

Watch modes:
- ONCE: Trigger once and stop (default)
- CONTINUOUS: Keep watching after trigger
- RECURRING: Reset after cooldown

Respond ONLY with valid JSON in this exact format:
{
  "intent": {
    "action": "CREATE_GOAL" | "LIST_GOALS" | "CHECK_PRICE" | "DELETE_GOAL" | "HELP" | "UNKNOWN",
    "symbol": "BTCUSDT" (if applicable),
    "condition": "ABOVE" | "BELOW" | "CROSSES_ABOVE" | "CROSSES_BELOW" (if applicable),
    "target": 50000 (number, if applicable),
    "watchMode": "ONCE" | "CONTINUOUS" | "RECURRING" (if applicable),
    "autoTrade": false (boolean, if user mentions trading/buying/selling)
  },
  "response": "Friendly confirmation message for the user",
  "confidence": 0.95 (0-1 scale)
}

Examples:
Input: "Alert me when Bitcoin hits $50000"
Output: {"intent":{"action":"CREATE_GOAL","symbol":"BTCUSDT","condition":"ABOVE","target":50000,"watchMode":"ONCE","autoTrade":false},"response":"I'll alert you when Bitcoin reaches $50,000!","confidence":0.95}

Input: "What's the current ETH price?"
Output: {"intent":{"action":"CHECK_PRICE","symbol":"ETHUSDT"},"response":"Let me check the current Ethereum price for you.","confidence":0.98}

Input: "Show my goals"
Output: {"intent":{"action":"LIST_GOALS"},"response":"Here are your active trading goals.","confidence":0.99}`;
  }

  private buildUserPrompt(message: string, context?: { tradingMode: string }): string {
    let prompt = `User message: "${message}"`;
    if (context?.tradingMode) {
      prompt += `\nTrading mode: ${context.tradingMode}`;
    }
    return prompt;
  }

  private async callGemini(systemPrompt: string, userPrompt: string): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: systemPrompt },
            { text: userPrompt }
          ]
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 500,
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Gemini API error: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!text) {
      throw new Error(`No response from Gemini. Response: ${JSON.stringify(data)}`);
    }

    logger.debug('Gemini response', { text });
    return text;
  }

  private async callGroq(systemPrompt: string, userPrompt: string): Promise<string> {
    const url = 'https://api.groq.com/openai/v1/chat/completions';
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1,
        max_tokens: 500,
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Groq API error: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;
    
    if (!text) {
      throw new Error(`No response from Groq. Response: ${JSON.stringify(data)}`);
    }

    logger.debug('Groq response', { text });
    return text;
  }

  private parseLLMResponse(text: string): LLMResponse {
    try {
      // Try to extract JSON from markdown code blocks if present
      let jsonText = text.trim();
      const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1];
      } else {
        // Try to find JSON object in the text
        const objectMatch = text.match(/\{[\s\S]*\}/);
        if (objectMatch) {
          jsonText = objectMatch[0];
        }
      }

      const parsed = JSON.parse(jsonText);
      
      // Validate the response structure
      if (!parsed.intent || !parsed.response || parsed.confidence === undefined) {
        throw new Error('Invalid LLM response structure');
      }

      return parsed as LLMResponse;
    } catch (error) {
      logger.error('Failed to parse LLM response', { error, text });
      throw error;
    }
  }

  isEnabled(): boolean {
    return this.provider !== 'none';
  }

  getProvider(): string {
    return this.provider;
  }
}
