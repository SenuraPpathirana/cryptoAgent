import { createModuleLogger } from '../config/logger';
import { env } from '../config/env';

const logger = createModuleLogger('LLM');

export interface LLMResponse {
  intent: {
    action: 'CREATE_GOAL' | 'LIST_GOALS' | 'CHECK_PRICE' | 'DELETE_GOAL' | 'HELP' | 'ANALYZE_TECHNICAL' | 'OPEN_POSITION' | 'TOGGLE_TRADING_AGENT' | 'VIEW_POSITIONS' | 'CLOSE_ALL_POSITIONS' | 'UNKNOWN';
    symbol?: string;
    condition?: 'ABOVE' | 'BELOW' | 'CROSSES_ABOVE' | 'CROSSES_BELOW' | 'BULLISH_DIVERGENCE' | 'BEARISH_DIVERGENCE' | 'ANY_DIVERGENCE';
    target?: number;
    watchMode?: 'ONCE' | 'CONTINUOUS' | 'RECURRING';
    autoTrade?: boolean;
    analysisType?: 'FULL' | 'QUICK' | 'RSI' | 'MACD' | 'TREND' | 'SIGNALS' | 'SUPPORT_RESISTANCE' | 'DIVERGENCE';
    timeframe?: string;
    // Trading-specific fields
    side?: 'LONG' | 'SHORT';
    leverage?: number;
    positionSize?: number;
    stopLoss?: number;
    takeProfit?: number;
    requireDivergence?: boolean;
    requireRSI?: boolean;
    requireLevel?: boolean;
    requireTrend?: boolean;
  };
  response: string;
  confidence: number;
}

export class LLMService {
  private provider: 'gemini' | 'groq' | 'github' | 'pollinations' | 'none';
  private fallbackProvider: 'groq' | null = null;
  private rateLimitUntil: number = 0;
  private apiKey: string;
  private model: string;
  private groqApiKey: string;
  // @ts-ignore - _groqModel reserved for future use
  private _groqModel: string = 'llama-3.1-8b-instant';

  constructor() {
    // Store Groq API key for fallback
    this.groqApiKey = env.GROQ_API_KEY || '';
    
    // Determine which provider to use based on available API keys (prioritize Pollinations)
    if (env.POLLINATIONS_API_KEY) {
      this.provider = 'pollinations';
      this.apiKey = env.POLLINATIONS_API_KEY;
      this.model = 'openai';
      logger.info(`LLM Service initialized with Pollinations (Google Gemini 2.5 Flash Lite)`);
    } else if (env.GITHUB_TOKEN) {
      this.provider = 'github';
      this.apiKey = env.GITHUB_TOKEN;
      this.model = 'gpt-4o';
      if (this.groqApiKey) {
        logger.info(`LLM Service initialized with GitHub Models (model: ${this.model}) with Groq fallback`);
      } else {
        logger.info(`LLM Service initialized with GitHub Models (model: ${this.model})`);
      }
    } else if (env.GEMINI_API_KEY) {
      this.provider = 'gemini';
      this.apiKey = env.GEMINI_API_KEY;
      this.model = 'gemini-2.0-flash-exp';
      logger.info(`LLM Service initialized with Gemini (model: ${this.model})`);
    } else if (env.GROQ_API_KEY) {
      this.provider = 'groq';
      this.apiKey = env.GROQ_API_KEY;
      this.model = 'llama-3.1-8b-instant'; // Faster, uses fewer tokens
      logger.info(`LLM Service initialized with Groq (model: ${this.model})`);
    } else {
      this.provider = 'none';
      this.apiKey = '';
      this.model = '';
      logger.warn('No LLM API key configured. Using basic NLP only.');
    }
  }

  async processMessage(message: string, context?: { tradingMode: string; conversationHistory?: Array<{ role: 'user' | 'assistant', message: string }> }): Promise<LLMResponse | null> {
    if (this.provider === 'none') {
      return null; // Fall back to basic NLP
    }

    try {
      const systemPrompt = this.buildSystemPrompt();
      const userPrompt = this.buildUserPrompt(message, context);

      let response;
      
      // Check if we should use fallback provider (GitHub rate limited)
      const now = Date.now();
      if (this.provider === 'github' && this.fallbackProvider === 'groq' && now < this.rateLimitUntil) {
        logger.info(`Using Groq fallback (GitHub rate limited until ${new Date(this.rateLimitUntil).toLocaleString()})`);
        response = await this.callGroq(systemPrompt, userPrompt);
      } else if (this.provider === 'pollinations') {
        response = await this.callPollinations(systemPrompt, userPrompt);
      } else if (this.provider === 'gemini') {
        response = await this.callGemini(systemPrompt, userPrompt);
      } else if (this.provider === 'github') {
        try {
          response = await this.callGitHub(systemPrompt, userPrompt);
          // Clear fallback if GitHub works
          if (this.fallbackProvider) {
            logger.info('GitHub Models API recovered, switching back from Groq fallback');
            this.fallbackProvider = null;
            this.rateLimitUntil = 0;
          }
        } catch (error) {
          // If rate limited and Groq is available, switch to fallback
          if (error instanceof Error && error.message.includes('rate limit') && this.groqApiKey) {
            logger.warn('GitHub Models rate limited, switching to Groq fallback');
            this.fallbackProvider = 'groq';
            // Set rate limit duration (20 hours for daily limit)
            this.rateLimitUntil = now + (20 * 60 * 60 * 1000);
            response = await this.callGroq(systemPrompt, userPrompt);
          } else {
            throw error;
          }
        }
      } else {
        response = await this.callGroq(systemPrompt, userPrompt);
      }

      return this.parseLLMResponse(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('LLM processing error', { 
        error: errorMessage, 
        provider: this.fallbackProvider || this.provider,
        stack: error instanceof Error ? error.stack : undefined
      });
      return null; // Fall back to basic NLP
    }
  }

  async generateSuggestionMessage(
    suggestion: string,
    context?: { tradingMode?: string; conversationHistory?: Array<{ role: 'user' | 'assistant', message: string }> }
  ): Promise<string | null> {
    if (this.provider === 'none') {
      return null;
    }

    const systemPrompt =
      'You are a crypto trading assistant. Rewrite the suggestion as a short, friendly question (max 1 sentence, <= 120 chars). ' +
      'Keep it actionable and natural. Do not use quotes.';
    const userPromptParts = [`Suggestion: ${suggestion}`];

    if (context?.conversationHistory && context.conversationHistory.length > 0) {
      const recent = context.conversationHistory.slice(-4);
      const lines = recent.map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.message}`);
      userPromptParts.push(`Recent context:\n${lines.join('\n')}`);
    }

    if (context?.tradingMode) {
      userPromptParts.push(`Trading mode: ${context.tradingMode}`);
    }

    const userPrompt = userPromptParts.join('\n');

    try {
      const text = await this.callTextModel(systemPrompt, userPrompt);
      const cleaned = text.replace(/\s+/g, ' ').trim();
      return cleaned.length > 0 ? cleaned : null;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn('Failed to generate suggestion message via LLM', { error: errorMessage });
      return null;
    }
  }

  private buildSystemPrompt(): string {
    return `You are a crypto trading assistant. Your job is to understand user messages and extract trading intent.

Supported cryptocurrencies: BTC/Bitcoin (BTCUSDT), ETH/Ethereum (ETHUSDT), BNB/Binance Coin (BNBUSDT), ADA/Cardano (ADAUSDT), SOL/Solana (SOLUSDT), XRP/Ripple (XRPUSDT)

Available actions:
- CREATE_GOAL: User wants to set a price alert or trading goal
- LIST_GOALS: User wants to see their active goals
- CHECK_PRICE: User wants to know current price
- ANALYZE_TECHNICAL: User wants technical analysis (RSI, MACD, trends, support/resistance, divergence, overbought/oversold)
- DELETE_GOAL: User wants to remove a goal
- TOGGLE_TRADING_AGENT: User wants to enable/disable trading agent mode
- OPEN_POSITION: User wants to open a trading position (requires trading agent enabled)
- VIEW_POSITIONS: User wants to see their open positions
- CLOSE_ALL_POSITIONS: User wants to close all open positions (e.g., "close all positions", "exit all trades")
- HELP: User needs help or asks how something works
- UNKNOWN: Cannot determine intent

IMPORTANT: When users ask "how do you determine support/resistance" or similar methodology questions, respond with HELP action and provide this explanation:

Support/Resistance Methodology:
- Support/resistance levels are where CANDLE BODIES close, not wicks
- Resistance: Where candle bodies closed near highs (rejections with upper wicks)
- Support: Where candle bodies closed near lows (bounces with lower wicks)
- Short timeframes (1h, 15m): Need multiple body closes at same level (2+)
- Long timeframes (1d, 1w): Single body close is significant
- Trend break: When candle closes by breaking through previous candles' wicks
- Strength based on number of body closes at that level

Price conditions:
- ABOVE: Alert when price goes above target
- BELOW: Alert when price goes below target
- CROSSES_ABOVE: Alert when price crosses above (transition)
- CROSSES_BELOW: Alert when price crosses below (transition)
- BULLISH_DIVERGENCE: Alert when bullish divergence is detected
- BEARISH_DIVERGENCE: Alert when bearish divergence is detected
- ANY_DIVERGENCE: Alert when any divergence (bullish or bearish) is detected

Watch modes:
- ONCE: Trigger once and stop (default)
- CONTINUOUS: Keep watching after trigger
- RECURRING: Reset after cooldown

Analysis types (for ANALYZE_TECHNICAL action):
- DIVERGENCE: Check for bullish/bearish divergence
- SUPPORT_RESISTANCE: Show support and resistance levels
- RSI: Only RSI indicator (oversold/overbought)
- MACD: Only MACD momentum indicator
- TREND: Trend direction analysis
- SIGNALS: Trading signals (buy/sell recommendations)
- QUICK: Fast RSI + MACD analysis
- FULL: Complete analysis with all indicators

Technical Analysis Keywords (MATCH SPECIFIC FIRST):
- divergence, bullish divergence, bearish divergence → analysisType: DIVERGENCE
- support, resistance, support lines, resistance levels → analysisType: SUPPORT_RESISTANCE
- RSI, overbought, oversold → analysisType: RSI
- MACD, momentum, crossover → analysisType: MACD
- trend, uptrend, downtrend → analysisType: TREND
- signal, buy, sell, trade → analysisType: SIGNALS
- quick, fast, brief → analysisType: QUICK
- analyze, analysis, comprehensive → analysisType: FULL

Respond ONLY with valid JSON in this exact format:
{
  "intent": {
    "action": "CREATE_GOAL" | "LIST_GOALS" | "CHECK_PRICE" | "ANALYZE_TECHNICAL" | "DELETE_GOAL" | "TOGGLE_TRADING_AGENT" | "OPEN_POSITION" | "VIEW_POSITIONS" | "CLOSE_ALL_POSITIONS" | "HELP" | "UNKNOWN",
    "symbol": "BTCUSDT" (if applicable),
    "condition": "ABOVE" | "BELOW" | "CROSSES_ABOVE" | "CROSSES_BELOW" (if applicable),
    "target": 50000 (number, if applicable),
    "watchMode": "ONCE" | "CONTINUOUS" | "RECURRING" (if applicable),
    "autoTrade": false (boolean, if user mentions trading/buying/selling),
    "analysisType": "FULL" | "QUICK" | "RSI" | "MACD" | "TREND" | "SIGNALS" (if action is ANALYZE_TECHNICAL),
    "side": "LONG" | "SHORT" (for OPEN_POSITION),
    "leverage": 10 (optional number, default 10, for OPEN_POSITION),
    "positionSize": 100 (optional USDT amount, default 100, for OPEN_POSITION),
    "stopLoss": 2 (optional percent, default 2, for OPEN_POSITION),
    "takeProfit": 5 (optional percent, default 5, for OPEN_POSITION),
    "requireDivergence": true (boolean, if user mentions divergence condition for OPEN_POSITION),
    "requireRSI": true (boolean, if user mentions overbought/oversold for OPEN_POSITION),
    "requireLevel": true (boolean, if user mentions resistance/support for OPEN_POSITION),
    "requireTrend": true (boolean, if user mentions trend direction for OPEN_POSITION),
    "timeframe": "1h" | "15m" | "4h" | "1d" (optional, default 1h)
  },
  "response": "Friendly confirmation message for the user",
  "confidence": 0.95 (0-1 scale)
}

Examples:
Input: "Alert me when Bitcoin hits $50000"
Output: {"intent":{"action":"CREATE_GOAL","symbol":"BTCUSDT","condition":"ABOVE","target":50000,"watchMode":"ONCE","autoTrade":false},"response":"I'll alert you when Bitcoin reaches $50,000!","confidence":0.95}

Input: "What's the current ETH price?"
Output: {"intent":{"action":"CHECK_PRICE","symbol":"ETHUSDT"},"response":"Let me check the current Ethereum price for you.","confidence":0.98}

Input: "Analyze Bitcoin trend"
Output: {"intent":{"action":"ANALYZE_TECHNICAL","symbol":"BTCUSDT","analysisType":"FULL"},"response":"Analyzing Bitcoin market trends and indicators...","confidence":0.95}

Input: "Is ETH overbought?"
Output: {"intent":{"action":"ANALYZE_TECHNICAL","symbol":"ETHUSDT","analysisType":"RSI"},"response":"Checking RSI indicator for Ethereum...","confidence":0.97}

Input: "Show my goals"
Output: {"intent":{"action":"LIST_GOALS"},"response":"Here are your active trading goals.","confidence":0.99}

Input: "Monitor for bearish divergence on BTC"
Output: {"intent":{"action":"CREATE_GOAL","symbol":"BTCUSDT","condition":"BEARISH_DIVERGENCE","watchMode":"CONTINUOUS"},"response":"I'll monitor Bitcoin for bearish divergence and alert you when detected.","confidence":0.95}

Input: "Alert me if there's any divergence near resistance for ETH"
Output: {"intent":{"action":"CREATE_GOAL","symbol":"ETHUSDT","condition":"ANY_DIVERGENCE","watchMode":"CONTINUOUS"},"response":"I'll watch Ethereum for any divergence patterns near resistance levels.","confidence":0.93}

Input: "How do you determine support and resistance?"
Output: {"intent":{"action":"HELP"},"response":"I determine support and resistance based on where candle BODIES close, not wicks:\n\n📍 Resistance: Where bodies closed near highs (rejections with upper wicks)\n📍 Support: Where bodies closed near lows (bounces with lower wicks)\n\nFor short timeframes (1h, 15m): I look for multiple body closes at the same level (2+)\nFor long timeframes (1d, 1w): Even a single body close is significant\n\nA trend breaks when a candle closes by breaking through previous candles' wicks. The strength of each level is based on how many times bodies closed there.","confidence":0.98}

Input: "Enable trading agent"
Output: {"intent":{"action":"TOGGLE_TRADING_AGENT"},"response":"Enabling trading agent mode...","confidence":0.99}

Input: "Turn off trading agent"
Output: {"intent":{"action":"TOGGLE_TRADING_AGENT"},"response":"Disabling trading agent mode...","confidence":0.99}

Input: "If near resistance with bearish divergence and overbought RSI, open short position"
Output: {"intent":{"action":"OPEN_POSITION","symbol":"BTCUSDT","side":"SHORT","requireLevel":true,"requireDivergence":true,"requireRSI":true},"response":"Checking conditions for short position...","confidence":0.95}

Input: "Open long with 20x leverage if price near support"
Output: {"intent":{"action":"OPEN_POSITION","symbol":"BTCUSDT","side":"LONG","leverage":20,"requireLevel":true},"response":"Checking conditions for long position with 20x leverage...","confidence":0.93}

Input: "Open short position on ETH"
Output: {"intent":{"action":"OPEN_POSITION","symbol":"ETHUSDT","side":"SHORT"},"response":"Opening short position on Ethereum...","confidence":0.97}`;
  }

  private buildUserPrompt(message: string, context?: { tradingMode: string; conversationHistory?: Array<{ role: 'user' | 'assistant', message: string }> }): string {
    let prompt = '';
    
    // Add conversation history for context
    if (context?.conversationHistory && context.conversationHistory.length > 0) {
      prompt += 'Recent conversation:\n';
      for (const msg of context.conversationHistory) {
        if (msg.role === 'user') {
          prompt += `User: ${msg.message}\n`;
        } else {
          // Extract resistance/support from new format: "• $95,737 (nearest)"
          const resistanceMatches = msg.message.match(/Key Resistance[^\n]*:\n((?:• \$[\d,]+.*\n?)+)/i);
          const supportMatches = msg.message.match(/Support[^\n]*:\n((?:• \$[\d,]+.*\n?)+)/i);
          
          let hasLevels = false;
          if (resistanceMatches) {
            const nearestResistance = resistanceMatches[1].match(/• \$([\d,]+).*\(nearest\)/);
            if (nearestResistance) {
              prompt += `Assistant showed: Resistance at $${nearestResistance[1]}`;
              hasLevels = true;
            }
          }
          if (supportMatches) {
            const nearestSupport = supportMatches[1].match(/• \$([\d,]+).*\(nearest\)/);
            if (nearestSupport) {
              if (hasLevels) prompt += `, `;
              else prompt += `Assistant showed: `;
              prompt += `Support at $${nearestSupport[1]}`;
              hasLevels = true;
            }
          }
          if (hasLevels) prompt += '\n';
        }
      }
      prompt += '\n';
    }
    
    prompt += `Current user message: "${message}"`;
    if (context?.tradingMode) {
      prompt += `\nTrading mode: ${context.tradingMode}`;
    }
    
    // Add hint if user is referencing resistance/support from history
    if (message.toLowerCase().includes('resistance') || message.toLowerCase().includes('support')) {
      if (context?.conversationHistory?.some(m => m.role === 'assistant' && (m.message.includes('Resistance') || m.message.includes('Support')))) {
        prompt += `\nNote: User previously asked about support/resistance levels. They may be referencing those levels.`;
      }
    }
    
    return prompt;
  }

  private async callGemini(systemPrompt: string, userPrompt: string, retries = 3): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000); // 10 second timeout
        
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
          }),
          signal: controller.signal
        });
        
        clearTimeout(timeout);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          
          // Don't retry on authentication errors
          if (response.status === 401 || response.status === 403) {
            throw new Error(`Gemini API authentication error: ${response.status} - Check your API key`);
          }
          
          // Handle quota exceeded errors
          if (response.status === 429) {
            const errorMsg = (errorData as any).error?.message || 'Rate limit exceeded';
            throw new Error(`Gemini API rate limit: ${errorMsg}`);
          }
          
          throw new Error(`Gemini API error: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`);

        }

        const data = await response.json();
        const text = (data as any).candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!text) {
          throw new Error(`No response from Gemini. Response: ${JSON.stringify(data)}`);
        }

        logger.debug('Gemini response', { text, attempt });
        return text;
      } catch (error) {
        const isLastAttempt = attempt === retries;
        const errorMsg = error instanceof Error ? error.message : String(error);
        
        // Don't retry on auth errors
        if (errorMsg.includes('authentication')) {
          throw error;
        }
        
        if (isLastAttempt) {
          logger.error('Gemini API call failed after retries', { 
            attempts: retries, 
            error: errorMsg,
            hint: 'Check internet connection and firewall settings'
          });
          throw error;
        }
        
        logger.warn(`Gemini API call failed (attempt ${attempt}/${retries}), retrying...`, { error: errorMsg });
        
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 500));
      }
    }
    
    throw new Error('Failed to call Gemini API after all retries');
  }

  private async callPollinations(systemPrompt: string, userPrompt: string, retries = 3): Promise<string> {
    const url = 'https://text.pollinations.ai/openai';
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000); // 30 second timeout
        
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
            temperature: 0.7,
            max_tokens: 1000,
          }),
          signal: controller.signal
        });
        
        clearTimeout(timeout);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          
          // Handle rate limit errors
          if (response.status === 429) {
            const errorMsg = (errorData as any).error?.message || 'Rate limit exceeded';
            throw new Error(`Pollinations API rate limit: ${errorMsg}`);
          }
          
          throw new Error(`Pollinations API error: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`);
        }

        const data = await response.json();
        const text = (data as any).choices?.[0]?.message?.content;
        
        if (!text) {
          throw new Error(`No response from Pollinations. Response: ${JSON.stringify(data)}`);
        }

        return text;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        if (attempt < retries) {
          logger.warn(`Pollinations API call failed (attempt ${attempt}/${retries}), retrying...`, { error: errorMessage });
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        } else {
          logger.error('Pollinations API call failed after retries', { attempts: retries, error: errorMessage });
          throw error;
        }
      }
    }
    
    throw new Error('Failed to call Pollinations API after all retries');
  }

  private async callGroq(systemPrompt: string, userPrompt: string, retries = 3): Promise<string> {
    const url = 'https://api.groq.com/openai/v1/chat/completions';
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000); // 10 second timeout
        
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
          }),
          signal: controller.signal
        });
        
        clearTimeout(timeout);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          
          // Don't retry on authentication errors
          if (response.status === 401 || response.status === 403) {
            throw new Error(`Groq API authentication error: ${response.status} - Check your API key`);
          }
          
          // Handle quota exceeded errors
          if (response.status === 429) {
            const errorMsg = (errorData as any).error?.message || 'Rate limit exceeded';
            throw new Error(`Groq API rate limit: ${errorMsg}`);
          }
          
          throw new Error(`Groq API error: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`);

        }

        const data = await response.json();
        const text = (data as any).choices?.[0]?.message?.content;
        
        if (!text) {
          throw new Error(`No response from Groq. Response: ${JSON.stringify(data)}`);
        }

        logger.debug('Groq response', { text, attempt });
        return text;
      } catch (error) {
        const isLastAttempt = attempt === retries;
        const errorMsg = error instanceof Error ? error.message : String(error);
        
        // Don't retry on auth errors
        if (errorMsg.includes('authentication')) {
          throw error;
        }
        
        if (isLastAttempt) {
          logger.error('Groq API call failed after retries', { 
            attempts: retries, 
            error: errorMsg,
            hint: 'Check internet connection and firewall settings'
          });
          throw error;
        }
        
        logger.warn(`Groq API call failed (attempt ${attempt}/${retries}), retrying...`, { error: errorMsg });
        
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 500));
      }
    }
    
    throw new Error('Failed to call Groq API after all retries');
  }

  private async callGitHub(systemPrompt: string, userPrompt: string, retries = 3): Promise<string> {
    const url = 'https://models.inference.ai.azure.com/chat/completions';
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000); // 30 second timeout
        
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
            temperature: 0.7,
            max_tokens: 1000,
            top_p: 1
          }),
          signal: controller.signal
        });
        
        clearTimeout(timeout);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          
          // Don't retry on authentication errors
          if (response.status === 401 || response.status === 403) {
            throw new Error(`GitHub Models API authentication error: ${response.status} - Check your GITHUB_TOKEN`);
          }
          
          // Handle rate limit errors
          if (response.status === 429) {
            const errorMsg = (errorData as any).error?.message || 'Rate limit exceeded';
            throw new Error(`GitHub Models API rate limit: ${errorMsg}`);
          }
          
          throw new Error(`GitHub Models API error: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`);
        }

        const data = await response.json();
        const text = (data as any).choices?.[0]?.message?.content;
        
        if (!text) {
          throw new Error(`No response from GitHub Models. Response: ${JSON.stringify(data)}`);
        }

        return text;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // Don't retry on authentication errors
        if (errorMessage.includes('authentication error')) {
          throw error;
        }
        
        if (attempt < retries) {
          logger.warn(`GitHub Models API call failed (attempt ${attempt}/${retries}), retrying...`, { error: errorMessage });
          // Wait before retry (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        } else {
          logger.error('GitHub Models API call failed after retries', { attempts: retries, error: errorMessage });
          throw error;
        }
      }
    }
    
    throw new Error('Failed to call GitHub Models API after all retries');
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

      // Fix common Groq JSON formatting issues ONLY
      // Groq sometimes returns: `"response": "text","confidence":0.98` (missing space after comma before field)
      // Only apply these fixes if we detect malformed patterns
      const hasGroqMalformation = /\",\"(confidence|intent|response)\":/.test(jsonText) || 
                                   /\}\s*,\s*\"(confidence|response)\":/.test(jsonText);
      
      if (hasGroqMalformation) {
        // Fix missing comma before top-level fields when preceded by closing brace/bracket
        jsonText = jsonText.replace(/(\}|\])\s*\"(confidence|response)\":/g, '$1,\n  "$2":');
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
    if (this.fallbackProvider && Date.now() < this.rateLimitUntil) {
      return `${this.provider} (fallback: ${this.fallbackProvider})`;
    }
    return this.provider;
  }

  private async callTextModel(systemPrompt: string, userPrompt: string): Promise<string> {
    let response: string;
    const now = Date.now();

    if (this.provider === 'github' && this.fallbackProvider === 'groq' && now < this.rateLimitUntil) {
      response = await this.callGroq(systemPrompt, userPrompt);
    } else if (this.provider === 'pollinations') {
      response = await this.callPollinations(systemPrompt, userPrompt);
    } else if (this.provider === 'gemini') {
      response = await this.callGemini(systemPrompt, userPrompt);
    } else if (this.provider === 'github') {
      try {
        response = await this.callGitHub(systemPrompt, userPrompt);
        if (this.fallbackProvider) {
          this.fallbackProvider = null;
          this.rateLimitUntil = 0;
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('rate limit') && this.groqApiKey) {
          this.fallbackProvider = 'groq';
          this.rateLimitUntil = now + (20 * 60 * 60 * 1000);
          response = await this.callGroq(systemPrompt, userPrompt);
        } else {
          throw error;
        }
      }
    } else {
      response = await this.callGroq(systemPrompt, userPrompt);
    }

    return response;
  }
}
