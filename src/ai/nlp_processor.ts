

export interface ParsedIntent {
  action: 'CREATE_GOAL' | 'LIST_GOALS' | 'CHECK_PRICE' | 'DELETE_GOAL' | 'HELP' | 'UNKNOWN';
  symbol?: string;
  condition?: 'ABOVE' | 'BELOW' | 'CROSSES_ABOVE' | 'CROSSES_BELOW';
  target?: number;
  watchMode?: 'ONCE' | 'CONTINUOUS' | 'RECURRING';
  autoTrade?: boolean;
  confidence: number;
}

export class NLPProcessor {
  // Symbol aliases
  private symbolMap: Record<string, string> = {
    'bitcoin': 'BTCUSDT',
    'btc': 'BTCUSDT',
    'ethereum': 'ETHUSDT',
    'eth': 'ETHUSDT',
    'binance coin': 'BNBUSDT',
    'bnb': 'BNBUSDT',
    'cardano': 'ADAUSDT',
    'ada': 'ADAUSDT',
    'solana': 'SOLUSDT',
    'sol': 'SOLUSDT',
    'ripple': 'XRPUSDT',
    'xrp': 'XRPUSDT',
  };

  // Condition keywords
  private conditionMap: Record<string, 'ABOVE' | 'BELOW' | 'CROSSES_ABOVE' | 'CROSSES_BELOW'> = {
    'above': 'ABOVE',
    'over': 'ABOVE',
    'higher': 'ABOVE',
    'greater': 'ABOVE',
    'exceeds': 'ABOVE',
    'reaches': 'ABOVE',
    'hits': 'ABOVE',
    'below': 'BELOW',
    'under': 'BELOW',
    'lower': 'BELOW',
    'less': 'BELOW',
    'drops': 'BELOW',
    'falls': 'BELOW',
    'crosses above': 'CROSSES_ABOVE',
    'goes above': 'CROSSES_ABOVE',
    'breaks above': 'CROSSES_ABOVE',
    'crosses below': 'CROSSES_BELOW',
    'goes below': 'CROSSES_BELOW',
    'breaks below': 'CROSSES_BELOW',
  };

  parse(message: string): ParsedIntent {
    const msg = message.toLowerCase().trim();

    // Check for list goals
    if (this.matchesPattern(msg, ['show', 'list', 'my goals', 'active', 'display'])) {
      return {
        action: 'LIST_GOALS',
        confidence: 0.9
      };
    }

    // Check for price query
    if (this.matchesPattern(msg, ['price', 'current', 'what is', "what's", 'how much'])) {
      const symbol = this.extractSymbol(msg);
      return {
        action: 'CHECK_PRICE',
        symbol: symbol || 'BTCUSDT',
        confidence: symbol ? 0.9 : 0.6
      };
    }

    // Check for delete/stop
    if (this.matchesPattern(msg, ['delete', 'remove', 'stop', 'cancel'])) {
      return {
        action: 'DELETE_GOAL',
        confidence: 0.8
      };
    }

    // Check for help
    if (this.matchesPattern(msg, ['help', 'how', 'what can'])) {
      return {
        action: 'HELP',
        confidence: 0.9
      };
    }

    // Try to parse as create goal
    const goalIntent = this.parseCreateGoal(msg);
    if (goalIntent.confidence > 0.5) {
      return goalIntent;
    }

    return {
      action: 'UNKNOWN',
      confidence: 0
    };
  }

  private parseCreateGoal(message: string): ParsedIntent {
    const symbol = this.extractSymbol(message);
    const target = this.extractPrice(message);
    const condition = this.extractCondition(message);
    const notifyOnce = this.extractNotifyOnce(message);
    const autoTrade = this.extractAutoTrade(message);

    // Calculate confidence
    let confidence = 0;
    if (symbol) confidence += 0.3;
    if (target) confidence += 0.4;
    if (condition) confidence += 0.3;

    if (confidence < 0.5) {
      return { action: 'UNKNOWN', confidence: 0 };
    }

    return {
      action: 'CREATE_GOAL',
      symbol,
      target,
      condition,
      watchMode: 'ONCE',
      autoTrade: autoTrade ?? false,
      confidence
    };
  }

  private extractSymbol(message: string): string | undefined {
    for (const [alias, symbol] of Object.entries(this.symbolMap)) {
      if (message.includes(alias)) {
        return symbol;
      }
    }

    // Try to match SYMBOL format (e.g., BTCUSDT)
    const match = message.match(/[A-Z]{2,10}USDT/);
    if (match) {
      return match[0];
    }

    return undefined;
  }

  private extractPrice(message: string): number | undefined {
    // Match price patterns: $50000, 50k, 50,000, 50000
    const patterns = [
      /\$[\d,]+\.?\d*/,  // $50000, $50,000.50
      /[\d,]+\.?\d*k/,   // 50k, 50.5k
      /[\d,]+\.?\d*/     // 50000, 50,000
    ];

    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match) {
        let numStr = match[0].replace(/[$,]/g, '');
        
        // Handle 'k' suffix
        if (numStr.includes('k')) {
          return parseFloat(numStr.replace('k', '')) * 1000;
        }
        
        return parseFloat(numStr);
      }
    }

    return undefined;
  }

  private extractCondition(message: string): 'GTE' | 'LTE' | 'CROSS_ABOVE' | 'CROSS_BELOW' | undefined {
    // Check multi-word conditions firstABOVE' | 'BELOW' | 'CROSSES_ABOVE' | 'CROSSE
    for (const [phrase, condition] of Object.entries(this.conditionMap)) {
      if (message.includes(phrase)) {
        return condition;
      }
    }

    return undefined;
  }

  private extractNotifyOnce(message: string): boolean | undefined {
    if (this.matchesPattern(message, ['once', 'one time', 'single'])) {
      return true;
    }
    if (this.matchesPattern(message, ['keep', 'continuous', 'always', 'repeatedly'])) {
      return false;
    }
    return undefined;
  }

  private extractAutoTrade(message: string): boolean | undefined {
    if (this.matchesPattern(message, ['trade', 'auto trade', 'buy', 'sell', 'execute'])) {
      return true;
    }
    return undefined;
  }

  private matchesPattern(text: string, keywords: string[]): boolean {
    return keywords.some(keyword => text.includes(keyword));
  }

  generateResponse(intent: ParsedIntent, result?: any): string {
    switch (intent.action) {
      case 'CREATE_GOAL':
        return `✅ Got it! I'll watch ${intent.symbol} and alert you when it ${this.conditionToText(intent.condition!)} $${intent.target?.toLocaleString()}.`;

      case 'LIST_GOALS':
        if (!result || result.length === 0) {
          return "You don't have any active goals yet. Try creating one by saying: 'Alert me when BTC hits $50000'";
        }
        return `📋 You have ${result.length} active goal(s):\n\n${result.map((g: any, i: number) => 
          `${i + 1}. ${g.symbol} ${g.condition} $${g.target} (${g.isActive ? '🟢 Active' : '🔴 Inactive'})`
        ).join('\n')}`;

      case 'CHECK_PRICE':
        if (result) {
          return `💰 Current ${intent.symbol} price: $${result.toLocaleString()}`;
        }
        return `I don't have price data for ${intent.symbol} right now.`;

      case 'DELETE_GOAL':
        return `To delete a goal, please tell me the goal number or symbol. You can see all goals by asking: "Show my goals"`;

      case 'HELP':
        return `I can help you with:\n\n` +
          `🎯 Create price alerts: "Alert me when BTC hits $50000"\n` +
          `📋 View goals: "Show my active goals"\n` +
          `💰 Check prices: "What's the current BTC price?"\n` +
          `🗑️ Delete goals: "Delete my BTC goal"\n` +
          `📈 Auto-trading: "Buy ETH when it crosses $3000"\n\n` +
          `Try being conversational - I understand natural language!`;

      default:
        return `I'm not sure I understood that. Could you rephrase? For example:\n` +
          `• "Alert me when Bitcoin goes above $50000"\n` +
          `• "Show my active goals"\n` +
          `• "What's the current ETH price?"\n\n` +
          `Type "help" to see what I can do!`;
    }
  }

  private conditionToText(condition: string): string {
    const map: Record<string, string> = {
      'ABOVE': 'reaches or exceeds',
      'BELOW': 'drops to or below',
      'CROSSES_ABOVE': 'crosses above',
      'CROSSES_BELOW': 'crosses below'
    };
    return map[condition] || condition;
  }
}
