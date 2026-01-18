import { Router, Request, Response } from 'express';
import { NLPProcessor } from '../../ai/nlp_processor';
import { LLMService } from '../../ai/llm_service';
import { createModuleLogger } from '../../config/logger';
import { GoalsRepository } from '../../storage/repositories/goals.repo';
import { PriceCache } from '../../market/price_cache';
import { BinanceDataFetcher } from '../../market/binance_data_fetcher';
import { AnalysisEngine } from '../../analysis/analysis_engine';
import { UsersRepository } from '../../storage/repositories/users.repo';
import { jwtAuthMiddleware } from '../middleware/auth.middleware';

const logger = createModuleLogger('ChatRoutes');
const nlp = new NLPProcessor();
const llm = new LLMService();
const usersRepo = UsersRepository.getInstance();

// Store last analysis results per session (simple in-memory store)
const lastAnalysis: Map<string, { symbol: string; resistance?: number; support?: number; timestamp: number }> = new Map();

// Store conversation history per session
const conversationHistory: Map<string, Array<{ role: 'user' | 'assistant', message: string, timestamp: number }>> = new Map();

// Store trading agent mode per session (enabled/disabled)
const tradingAgentMode: Map<string, boolean> = new Map();

// Store open positions (in-memory for now)
interface Position {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  quantity: number;
  leverage: number;
  stopLoss: number;
  takeProfit: number;
  openedAt: number;
  conditions: string[];
}
const openPositions: Map<string, Position[]> = new Map();
const lastSuggestionAt: Map<number, number> = new Map();

function extractBehaviorKeywords(message: string, intent?: any): Array<{ keyword: string; category: string }> {
  const lower = message.toLowerCase();
  const keywords: Array<{ keyword: string; category: string }> = [];

  if (intent?.symbol) {
    keywords.push({ keyword: intent.symbol, category: 'symbol' });
  }

  if (/(price|current price|quote)/.test(lower) || intent?.action === 'CHECK_PRICE') {
    keywords.push({ keyword: 'price', category: 'keyword' });
  }

  if (/(goal|goals|alert|alerts)/.test(lower) || ['CREATE_GOAL', 'LIST_GOALS', 'DELETE_GOAL'].includes(intent?.action)) {
    keywords.push({ keyword: 'goals', category: 'keyword' });
  }

  if (/(support)/.test(lower)) {
    keywords.push({ keyword: 'support', category: 'keyword' });
  }

  if (/(resistance)/.test(lower)) {
    keywords.push({ keyword: 'resistance', category: 'keyword' });
  }

  if (/(rsi|overbought|oversold)/.test(lower)) {
    keywords.push({ keyword: 'rsi', category: 'keyword' });
  }

  if (/(macd|momentum)/.test(lower)) {
    keywords.push({ keyword: 'macd', category: 'keyword' });
  }

  if (/(divergence)/.test(lower)) {
    keywords.push({ keyword: 'divergence', category: 'keyword' });
  }

  if (/(telegram|botfather)/.test(lower)) {
    keywords.push({ keyword: 'telegram', category: 'feature' });
  }

  if (/(binance|testnet)/.test(lower)) {
    keywords.push({ keyword: 'binance', category: 'feature' });
  }

  if (['OPEN_POSITION', 'VIEW_POSITIONS', 'CLOSE_ALL_POSITIONS'].includes(intent?.action)) {
    keywords.push({ keyword: 'position', category: 'feature' });
  }

  return keywords;
}

async function appendSuggestionIfAny(
  baseResponse: string,
  userId: number,
  intentAction: string | undefined,
  history: Array<{ role: 'user' | 'assistant'; message: string; timestamp: number }>,
  tradingMode?: string
): Promise<string> {
  if (!intentAction || intentAction === 'HELP' || intentAction === 'UNKNOWN') {
    return baseResponse;
  }

  if (/^❌|error|failed/i.test(baseResponse)) {
    return baseResponse;
  }

  const now = Date.now();
  const last = lastSuggestionAt.get(userId) || 0;
  if (now - last < 60_000) {
    return baseResponse;
  }

  const suggestions = await usersRepo.getSmartSuggestions(userId);
  if (!suggestions || suggestions.length === 0) {
    return baseResponse;
  }

  const suggestion = suggestions[0];
  let finalSuggestion = suggestion;
  if (llm.isEnabled()) {
    const refined = await llm.generateSuggestionMessage(suggestion, {
      conversationHistory: history.slice(-6).map(m => ({ role: m.role, message: m.message })),
      tradingMode
    });
    if (refined) {
      finalSuggestion = refined;
    }
  }

  lastSuggestionAt.set(userId, now);
  return `${baseResponse}\n\n💡 ${finalSuggestion}`;
}

export const chatRouter = Router();

// Apply JWT authentication to all chat routes
chatRouter.use(jwtAuthMiddleware);

chatRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { message, tradingMode, sessionId: clientSessionId, agentEnabled } = req.body;
    const userId = req.userId; // Get user ID from JWT middleware (attached by jwtAuthMiddleware)

    if (!message) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Message is required' 
      });
    }

    if (!userId) {
      logger.error('User ID not found in request', { headers: req.headers });
      return res.status(401).json({ 
        ok: false, 
        error: 'Authentication required' 
      });
    }

    // Get user configuration
    const userConfig = await usersRepo.getUserConfig(userId);
    if (!userConfig) {
      logger.warn('User config not found', { userId });
      return res.status(400).json({ 
        ok: false, 
        error: 'User configuration not found. Please complete your profile setup.' 
      });
    }

    // Use client-provided sessionId or fall back to IP
    const sessionId = clientSessionId || req.ip || 'default';
    
    // Set trading agent mode from frontend if provided
    if (typeof agentEnabled === 'boolean') {
      tradingAgentMode.set(sessionId, agentEnabled);
    }
    
    // Try LLM first, fall back to basic NLP
    let intent;
    let response;
    let llmUsed = false;

    if (llm.isEnabled()) {
      try {
        // Get recent conversation history for context
        const history = conversationHistory.get(sessionId) || [];
        const recentHistory = history.slice(-6); // Last 3 exchanges (user + assistant)
        
        const llmResponse = await llm.processMessage(message, { 
          tradingMode,
          conversationHistory: recentHistory 
        });
        if (llmResponse) {
          intent = {
            ...llmResponse.intent,
            confidence: llmResponse.confidence
          };
          response = llmResponse.response;
          llmUsed = true;
          logger.info('Chat intent parsed via LLM', { message, intent, provider: llm.getProvider() });
        }
      } catch (error) {
        logger.warn('LLM processing failed, falling back to basic NLP', { error });
      }
    }

    // Fall back to basic NLP if LLM not available or failed
    if (!intent) {
      intent = nlp.parse(message);
      const logLevel = llm.isEnabled() ? 'warn' : 'info';
      logger[logLevel]('Chat intent parsed via basic NLP', { 
        message, 
        intent,
        llmEnabled: llm.isEnabled(),
        llmProvider: llm.getProvider()
      });
    }

    const goalsRepo = GoalsRepository.getInstance();
    const priceCache = PriceCache.getInstance();

    if (intent?.action) {
      try {
        await usersRepo.trackAction(userId, intent.action);
      } catch (error) {
        logger.warn('Failed to track action', { error, userId, action: intent.action });
      }
    }

    try {
      const keywords = extractBehaviorKeywords(message, intent);
      if (keywords.length > 0) {
        await Promise.all(
          keywords.map(k => usersRepo.trackBehavior(userId, k.keyword, k.category))
        );
      }
    } catch (error) {
      logger.warn('Failed to track behavior keywords', { error, userId });
    }
    
    // Store user message in history
    if (!conversationHistory.has(sessionId)) {
      conversationHistory.set(sessionId, []);
    }
    const history = conversationHistory.get(sessionId)!;
    history.push({ role: 'user', message, timestamp: Date.now() });
    
    // Keep only last 10 messages per session
    if (history.length > 20) {
      history.splice(0, history.length - 20);
    }

    let result;
    let goal;

    // Handle different actions
    switch (intent.action) {
      case 'VIEW_POSITIONS':
        const userPositions = openPositions.get(sessionId) || [];
        
        if (userPositions.length === 0) {
          const noPositionsMsg = `📊 Open Positions\n\nYou have no open positions.`;
          const responseText = await appendSuggestionIfAny(noPositionsMsg, userId, intent.action, history, tradingMode);
          history.push({ role: 'assistant', message: responseText, timestamp: Date.now() });
          return res.json({
            ok: true,
            response: responseText
          });
        }
        
        let positionsMsg = `━━━━━━━━━━━━━━━━━━\n📊 OPEN POSITIONS (${userPositions.length})\n━━━━━━━━━━━━━━━━━━\n\n`;
        
        for (const pos of userPositions) {
          const currentPrice = Number(priceCache.getPrice(pos.symbol) || pos.entryPrice);
          const entryPrice = Number(pos.entryPrice);
          const pnlPercent = pos.side === 'LONG' 
            ? ((currentPrice - entryPrice) / entryPrice * 100)
            : ((entryPrice - currentPrice) / entryPrice * 100);
          const pnlAmount = pnlPercent * Number(pos.leverage);
          const emoji = pnlAmount >= 0 ? '🟢' : '🔴';
          
          positionsMsg += `${emoji} ${pos.symbol} - ${pos.side}\n`;
          positionsMsg += `Entry: $${pos.entryPrice.toLocaleString()}\n`;
          positionsMsg += `Current: $${currentPrice.toLocaleString()}\n`;
          positionsMsg += `Leverage: ${pos.leverage}x\n`;
          positionsMsg += `PNL: ${pnlAmount >= 0 ? '+' : ''}${pnlAmount.toFixed(2)}%\n`;
          positionsMsg += `Stop Loss: $${pos.stopLoss.toFixed(2)}\n`;
          positionsMsg += `Take Profit: $${pos.takeProfit.toFixed(2)}\n`;
          positionsMsg += `ID: ${pos.id}\n\n`;
        }
        
        positionsMsg += `⚠️ PAPER TRADING MODE\n━━━━━━━━━━━━━━━━━━`;
        
        const positionsResponse = await appendSuggestionIfAny(positionsMsg, userId, intent.action, history, tradingMode);
        history.push({ role: 'assistant', message: positionsResponse, timestamp: Date.now() });
        return res.json({
          ok: true,
          response: positionsResponse,
          positions: userPositions
        });
      
      case 'CLOSE_ALL_POSITIONS':
        const closingPositions = openPositions.get(sessionId) || [];
        
        if (closingPositions.length === 0) {
          const noPositionsMsg = `📭 No open positions to close.`;
          const responseText = await appendSuggestionIfAny(noPositionsMsg, userId, intent.action, history, tradingMode);
          history.push({ role: 'assistant', message: responseText, timestamp: Date.now() });
          return res.json({
            ok: true,
            response: responseText
          });
        }

        // Close all positions
        openPositions.set(sessionId, []);
        
        const closedMsg = `✅ All Positions Closed\n\n${closingPositions.length} position(s) have been closed:\n\n${closingPositions.map(p => 
          `• ${p.symbol} ${p.side} - Entry: $${p.entryPrice.toLocaleString()}`
        ).join('\\n')}\n\n⚠️ Note: In testnet mode, positions are closed in memory only.`;
        
        const closedResponse = await appendSuggestionIfAny(closedMsg, userId, intent.action, history, tradingMode);
        history.push({ role: 'assistant', message: closedResponse, timestamp: Date.now() });
        
        return res.json({
          ok: true,
          response: closedResponse,
          closedCount: closingPositions.length
        });
      
      case 'TOGGLE_TRADING_AGENT':
        const isEnabled = !tradingAgentMode.get(sessionId);
        tradingAgentMode.set(sessionId, isEnabled);
        
        const statusMsg = isEnabled 
          ? `✅ Trading Agent Enabled\n\nI can now open positions based on your analysis and conditions.\n\nExample: "If near resistance with bearish divergence and overbought RSI, open short position"`
          : `⏸️ Trading Agent Disabled\n\nI will not open any positions until you enable trading agent again.`;
        
        const statusResponse = await appendSuggestionIfAny(statusMsg, userId, intent.action, history, tradingMode);
        // Store in history
        history.push({ role: 'assistant', message: statusResponse, timestamp: Date.now() });
        
        return res.json({
          ok: true,
          response: statusResponse,
          tradingAgentEnabled: isEnabled
        });

      case 'OPEN_POSITION':
        // Check if trading agent is enabled
        if (!tradingAgentMode.get(sessionId)) {
          const errorMsg = `❌ Agent mode is off.\n\nSwitch the dropdown to "Agent" to open positions.`;
          history.push({ role: 'assistant', message: errorMsg, timestamp: Date.now() });
          return res.json({
            ok: true,
            response: errorMsg
          });
        }

        // Check if user has configured Binance API keys
        if (!userConfig.binance_api_key || !userConfig.binance_api_secret) {
          const errorMsg = `❌ Binance API Not Configured\n\nYou need to configure your Binance API credentials before opening positions.\n\n1. Click your profile in the sidebar\n2. Select "Binance Settings"\n3. Enter your API Key and Secret\n\nGet testnet keys from: https://testnet.binancefuture.com/`;
          history.push({ role: 'assistant', message: errorMsg, timestamp: Date.now() });
          return res.json({
            ok: true,
            response: errorMsg
          });
        }

        // Import required modules
        const { TradeExecutor } = await import('../../trading/trade_executor');
        const { TelegramBotClient } = await import('../../telegram/telegram_bot');
        // @ts-ignore - __telegramBot may be used in future updates
        const __telegramBot = TelegramBotClient.getInstance();
        const tradeExecutor = TradeExecutor.getInstance();

        // Get current market data for validation
        const posSymbol = intent.symbol || 'BTCUSDT';
        const posFetcher = BinanceDataFetcher.getInstance();
        const posCandles = await posFetcher.getKlines(posSymbol, intent.timeframe || '1h', 100);
        
        if (!posCandles || posCandles.length < 50) {
          return res.json({ ok: false, error: 'Insufficient market data' });
        }

        // Analyze current conditions
        const posAnalysisEngine = AnalysisEngine.getInstance();
        const posAnalysis = posAnalysisEngine.analyze(posSymbol, posCandles, intent.timeframe || '1h');
        
        if (!posAnalysis) {
          return res.json({ ok: false, error: 'Analysis failed' });
        }

        // Validate conditions specified by user
        const conditions: string[] = [];
        let conditionsMet = true;
        
        // Check divergence condition if specified
        if (intent.requireDivergence) {
          const { RSIIndicator } = await import('../../analysis/indicators/rsi');
          const closes = posCandles.map((c: any) => c.close);
          const { RSI } = await import('technicalindicators');
          const rsiValues = RSI.calculate({ values: closes, period: 14 });
          const divergence = RSIIndicator.detectDivergence(closes, rsiValues);
          
          const side = intent.side || 'LONG';
          if (side === 'SHORT' && divergence?.type !== 'BEARISH') {
            conditionsMet = false;
            conditions.push(`❌ Bearish divergence not detected`);
          } else if (side === 'LONG' && divergence?.type !== 'BULLISH') {
            conditionsMet = false;
            conditions.push(`❌ Bullish divergence not detected`);
          } else {
            conditions.push(`✅ ${divergence?.type} divergence confirmed`);
          }
        }

        // Check RSI overbought/oversold if specified
        if (intent.requireRSI) {
          const rsiValue = posAnalysis.rsi?.value || 50;
          const side = intent.side || 'LONG';
          
          if (side === 'SHORT' && rsiValue < 70) {
            conditionsMet = false;
            conditions.push(`❌ RSI not overbought (${rsiValue.toFixed(1)})`);
          } else if (side === 'LONG' && rsiValue > 30) {
            conditionsMet = false;
            conditions.push(`❌ RSI not oversold (${rsiValue.toFixed(1)})`);
          } else {
            conditions.push(`✅ RSI ${side === 'SHORT' ? 'overbought' : 'oversold'} (${rsiValue.toFixed(1)})`);
          }
        }

        // Check near resistance/support if specified
        if (intent.requireLevel) {
          const currentPrice = posCandles[posCandles.length - 1].close;
          const side = intent.side || 'LONG';
          const nearThreshold = 0.005; // 0.5%
          
          if (side === 'SHORT') {
            const resistance = posAnalysis.supportResistance?.nearestResistance?.price;
            if (resistance) {
              const distancePct = Math.abs(currentPrice - resistance) / resistance;
              if (distancePct <= nearThreshold) {
                conditions.push(`✅ Near resistance ($${Math.round(resistance).toLocaleString()})`);
              } else {
                conditionsMet = false;
                conditions.push(`❌ Not near resistance (${(distancePct * 100).toFixed(2)}% away)`);
              }
            }
          } else {
            const support = posAnalysis.supportResistance?.nearestSupport?.price;
            if (support) {
              const distancePct = Math.abs(currentPrice - support) / support;
              if (distancePct <= nearThreshold) {
                conditions.push(`✅ Near support ($${Math.round(support).toLocaleString()})`);
              } else {
                conditionsMet = false;
                conditions.push(`❌ Not near support (${(distancePct * 100).toFixed(2)}% away)`);
              }
            }
          }
        }

        // Check trend if specified
        if (intent.requireTrend) {
          const trend = posAnalysis.trend?.direction || 'NEUTRAL';
          const side = intent.side || 'LONG';
          
          if (side === 'SHORT' && trend !== 'DOWNTREND') {
            conditionsMet = false;
            conditions.push(`❌ Trend not down (${trend})`);
          } else if (side === 'LONG' && trend !== 'UPTREND') {
            conditionsMet = false;
            conditions.push(`❌ Trend not up (${trend})`);
          } else {
            conditions.push(`✅ Trend ${trend}`);
          }
        }

        // If conditions not met, inform user
        if (!conditionsMet) {
          const conditionsMsg = `📊 Conditions Check for ${posSymbol}\n\n${conditions.join('\n')}\n\n❌ Not all conditions met. Position not opened.`;
          const conditionsResponse = await appendSuggestionIfAny(conditionsMsg, userId, intent.action, history, tradingMode);
          history.push({ role: 'assistant', message: conditionsResponse, timestamp: Date.now() });
          return res.json({
            ok: true,
            response: conditionsResponse
          });
        }

        // All conditions met, open position
        const currentPrice = posCandles[posCandles.length - 1].close;
        const side = intent.side || 'LONG';
        const leverage = intent.leverage || 10;
        const positionSize = intent.positionSize || 110; // USDT (min 100 + buffer for rounding)
        
        // Calculate stop loss and take profit
        const stopLossPercent = intent.stopLoss || 2; // 2%
        const takeProfitPercent = intent.takeProfit || 5; // 5%
        
        const stopLoss = side === 'LONG' 
          ? currentPrice * (1 - stopLossPercent / 100)
          : currentPrice * (1 + stopLossPercent / 100);
        
        const takeProfit = side === 'LONG'
          ? currentPrice * (1 + takeProfitPercent / 100)
          : currentPrice * (1 - takeProfitPercent / 100);

        // Execute trade with user-specific credentials
        const tradeResult = await tradeExecutor.executeTrade({
          symbol: posSymbol,
          side,
          quantity: positionSize / currentPrice,
          leverage,
          stopLoss,
          takeProfit,
          apiKey: userConfig.binance_api_key!,
          apiSecret: userConfig.binance_api_secret!,
          testnet: userConfig.binance_testnet ?? true
        });

        if (tradeResult.success) {
          // Format position opened message
          const modeLabel = tradeExecutor.isPaperMode() ? '⚠️ PAPER TRADING MODE (memory only)' : '🧪 BINANCE TESTNET MODE (mock trading)';
          const positionMsg = `━━━━━━━━━━━━━━━━━━\n✅ POSITION OPENED\n━━━━━━━━━━━━━━━━━━\n\nSymbol: ${posSymbol}\nSide: ${side}\nEntry: $${currentPrice.toLocaleString()}\nLeverage: ${leverage}x\nSize: $${positionSize}\n\nStop Loss: $${stopLoss.toFixed(2)}\nTake Profit: $${takeProfit.toFixed(2)}\n\nConditions Met:\n${conditions.join('\n')}\n\nTrade ID: ${tradeResult.tradeId}\n${tradeResult.orderId ? `Order ID: ${tradeResult.orderId}\n` : ''}${modeLabel}\n━━━━━━━━━━━━━━━━━━`;
          
          const positionResponse = await appendSuggestionIfAny(positionMsg, userId, intent.action, history, tradingMode);
          history.push({ role: 'assistant', message: positionResponse, timestamp: Date.now() });
          
          // Store position
          const userPositions = openPositions.get(sessionId) || [];
          userPositions.push({
            id: tradeResult.tradeId!,
            symbol: posSymbol,
            side,
            entryPrice: currentPrice,
            quantity: positionSize / currentPrice,
            leverage,
            stopLoss,
            takeProfit,
            openedAt: Date.now(),
            conditions
          });
          openPositions.set(sessionId, userPositions);
          logger.info('Position stored', { sessionId, positionCount: userPositions.length });
          
          // Send Telegram notification to user's configured channel
          try {
            if (userConfig.telegram_bot_token && userConfig.telegram_channel_id) {
              // Create a user-specific Telegram bot instance
              const TelegramBot = (await import('node-telegram-bot-api')).default;
              const userTelegramBot = new TelegramBot(userConfig.telegram_bot_token);
              
              // Send without Markdown parsing to avoid special character issues
              await userTelegramBot.sendMessage(userConfig.telegram_channel_id, positionMsg, { parse_mode: undefined });
              logger.info('Position notification sent to Telegram', { channelId: userConfig.telegram_channel_id });
            } else {
              logger.info('Telegram notification skipped - not configured', { userId });
            }
          } catch (telegramError) {
            logger.error('Failed to send Telegram notification', { error: telegramError });
          }
          
          return res.json({
            ok: true,
            response: positionResponse,
            tradeId: tradeResult.tradeId
          });
        } else {
          const errorMsg = `❌ Failed to open position: ${tradeResult.error}`;
          history.push({ role: 'assistant', message: errorMsg, timestamp: Date.now() });
          return res.json({
            ok: true,
            response: errorMsg
          });
        }

      case 'CREATE_GOAL':
        if (intent?.autoTrade && !tradingAgentMode.get(sessionId)) {
          const errorMsg = `❌ Agent mode is off.\n\nSwitch the dropdown to "Agent" to create goals that open positions.`;
          history.push({ role: 'assistant', message: errorMsg, timestamp: Date.now() });
          return res.json({
            ok: true,
            response: errorMsg
          });
        }
        // Check if user is referencing technical levels/conditions
        const msg = message.toLowerCase();
        const lastResult = lastAnalysis.get(sessionId);
        
        // Auto-fill from last analysis if within 5 minutes
        if (lastResult && (Date.now() - lastResult.timestamp) < 300000) {
          const symbol = intent.symbol || lastResult.symbol;
          
          // Resistance goal
          if (!intent.target && (msg.includes('resistance') || msg.includes('resist'))) {
            if (lastResult.resistance) {
              intent.target = lastResult.resistance;
              intent.condition = 'ABOVE';
              intent.symbol = symbol;
            } else {
              return res.json({
                ok: true,
                response: `❌ No resistance level found in recent analysis. Please check resistance levels first by asking "show BTC resistance"`
              });
            }
          }
          
          // Support goal
          if (!intent.target && msg.includes('support')) {
            if (lastResult.support) {
              intent.target = lastResult.support;
              intent.condition = 'BELOW';
              intent.symbol = symbol;
            } else {
              return res.json({
                ok: true,
                response: `❌ No support level found in recent analysis. Please check support levels first by asking "show BTC support"`
              });
            }
          }
        } else if (!intent.target && (msg.includes('resistance') || msg.includes('support'))) {
          // No recent analysis, need to fetch it first
          return res.json({
            ok: true,
            response: `🔍 I need to analyze the chart first. Let me check the support and resistance levels...\n\nPlease ask: "show ${intent.symbol?.replace('USDT', '') || 'BTC'} resistance" or "show ${intent.symbol?.replace('USDT', '') || 'BTC'} support" first.`
          });
        }
        
        // For divergence goals, we don't need a target price
        const isDivergenceGoal = intent.condition === 'BULLISH_DIVERGENCE' || 
                                  intent.condition === 'BEARISH_DIVERGENCE' ||
                                  intent.condition === 'ANY_DIVERGENCE';
        
        if (!intent.symbol || (!intent.target && !isDivergenceGoal) || !intent.condition) {
          return res.json({
            ok: true,
            response: "I couldn't fully understand your request. Please specify:\n" +
              "• Which cryptocurrency (e.g., BTC, ETH)\n" +
              (isDivergenceGoal ? "" : "• Target price (e.g., $50000)\n") +
              "• Condition (e.g., above, below, divergence)\n\n" +
              "Or try:\n" +
              "• For price alerts: 'alert me when BTC crosses $50000'\n" +
              "• For divergence: 'monitor BTC for bearish divergence'"
          });
        }

        goal = await goalsRepo.create({
          id: `goal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          userId: userId,
          symbol: intent.symbol,
          targetPrice: intent.target || 0, // 0 for divergence goals
          condition: intent.condition,
          state: 'WATCHING',
          watchMode: intent.watchMode || (isDivergenceGoal ? 'CONTINUOUS' : 'ONCE'),
          notifyChannel: true,
          autoTrade: !!(intent.autoTrade && tradingMode === 'live'),
          createdAt: new Date(),
          updatedAt: new Date(),
          triggerCount: 0,
        });

        const goalResponse = response || nlp.generateResponse(intent, goal);
        const goalFinalResponse = await appendSuggestionIfAny(goalResponse, userId, intent.action, history, tradingMode);
        history.push({ role: 'assistant', message: goalFinalResponse, timestamp: Date.now() });
        
        return res.json({
          ok: true,
          response: goalFinalResponse,
          goal: goal,
          intent: intent,
          llmUsed: llmUsed
        });

      case 'LIST_GOALS':
        result = await goalsRepo.findByUserId(userId);
        const activeGoals = result.filter((g: any) => g.state === 'WATCHING' || g.state === 'TRIGGERED');
        const listResponse = response || nlp.generateResponse(intent, activeGoals);
        const listFinalResponse = await appendSuggestionIfAny(listResponse, userId, intent.action, history, tradingMode);
        return res.json({
          ok: true,
          response: listFinalResponse,
          goals: activeGoals,
          intent: intent,
          llmUsed: llmUsed
        });

      case 'CHECK_PRICE':
        const priceData = priceCache.getPrice(intent.symbol || 'BTCUSDT');
        const price = priceData?.mark || priceData?.last;
        
        // Generate price response with actual value
        let priceResponse;
        if (price) {
          const symbol = (intent.symbol || 'BTCUSDT').replace('USDT', '');
          priceResponse = `📊 The current ${symbol} price is $${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        } else {
          priceResponse = `❌ Sorry, I couldn't fetch the current price for ${intent.symbol || 'BTC'}. Please try again.`;
        }
        
        const priceFinalResponse = await appendSuggestionIfAny(priceResponse, userId, intent.action, history, tradingMode);
        return res.json({
          ok: true,
          response: priceFinalResponse,
          price: price,
          intent: intent,
          llmUsed: llmUsed
        });

      case 'ANALYZE_TECHNICAL':
        try {
          const symbol = intent.symbol || 'BTCUSDT';
          const dataFetcher = BinanceDataFetcher.getInstance();
          const analysisEngine = AnalysisEngine.getInstance();
          
          let analysisResponse: string;
          
          // Determine timeframe based on user intent
          let interval = '1h';
          
          // Check if user is asking about weekly/longer timeframe
          const msg = req.body.message?.toLowerCase() || '';
          if (msg.includes('week') || msg.includes('weekly') || msg.includes('long term') || msg.includes('day')) {
            interval = '1d';
          }
          
          // Route to specific analysis method based on type
          const candleLimit = interval === '1d' ? 60 : 200;
          const candles = await dataFetcher.getKlines(symbol, interval, candleLimit);
          
          if (!candles || candles.length === 0) {
            return res.json({
              ok: true,
              response: `❌ Unable to fetch market data for ${symbol}. Please try again later.`,
              intent: intent,
              llmUsed: llmUsed
            });
          }
          
          // Call specific analysis method based on type
          switch (intent.analysisType) {
            case 'RSI':
              analysisResponse = analysisEngine.analyzeRSI(symbol, candles);
              break;
            case 'MACD':
              analysisResponse = analysisEngine.analyzeMacd(symbol, candles);
              break;
            case 'TREND':
              analysisResponse = analysisEngine.analyzeTrend(symbol, candles);
              break;
            case 'SUPPORT_RESISTANCE':
            case 'FULL':
            case 'SIGNALS':
              // These all include S/R data
              const highs = candles.map(c => c.high);
              const lows = candles.map(c => c.low);
              const closes = candles.map(c => c.close);
              
              // Get S/R data
              const { SupportResistanceDetector } = await import('../../analysis/patterns/support_resistance');
              const srResult = SupportResistanceDetector.detect(highs, lows, closes);
              
              // Store it for later goal creation
              if (srResult) {
                lastAnalysis.set(sessionId, {
                  symbol,
                  resistance: srResult.nearestResistance?.price,
                  support: srResult.nearestSupport?.price,
                  timestamp: Date.now()
                });
                logger.info('Stored S/R levels for session', { 
                  sessionId, 
                  symbol,
                  resistance: srResult.nearestResistance?.price,
                  support: srResult.nearestSupport?.price
                });
              }
              
              // Get the actual analysis response
              if (intent.analysisType === 'SUPPORT_RESISTANCE') {
                analysisResponse = analysisEngine.analyzeSupportResistance(symbol, candles);
              } else {
                const analysisResult = analysisEngine.analyze(symbol, candles);
                analysisResponse = analysisResult ? analysisResult.summary : `❌ Unable to analyze ${symbol} at this time.`;
              }
              break;
            case 'DIVERGENCE':
              analysisResponse = analysisEngine.analyzeDivergence(symbol, candles);
              break;
            case 'QUICK':
              analysisResponse = analysisEngine.quickAnalyze(symbol, candles);
              break;
            default:
              analysisResponse = analysisEngine.quickAnalyze(symbol, candles);
              break;
          }
          
          const analysisFinalResponse = await appendSuggestionIfAny(analysisResponse, userId, intent.action, history, tradingMode);
          // Store assistant response in history
          history.push({ role: 'assistant', message: analysisFinalResponse, timestamp: Date.now() });
          
          return res.json({
            ok: true,
            response: analysisFinalResponse,
            intent: intent,
            llmUsed: llmUsed
          });
        } catch (error) {
          logger.error('Technical analysis error', { error, symbol: intent.symbol });
          return res.json({
            ok: true,
            response: `❌ Failed to analyze ${intent.symbol}. Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            intent: intent,
            llmUsed: llmUsed
          });
        }

      case 'HELP':
        return res.json({
          ok: true,
          response: response || nlp.generateResponse(intent),
          intent: intent,
          llmUsed: llmUsed
        });

      default:
        return res.json({
          ok: true,
          response: response || nlp.generateResponse(intent),
          intent: intent,
          llmUsed: llmUsed
        });
    }

  } catch (error) {
    logger.error('Chat error', { error });
    return res.status(500).json({
      ok: false,
      response: '❌ Sorry, something went wrong. Please try again.',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Dedicated endpoint for trading agent toggle (called from UI switch)
chatRouter.post('/toggle-trading-agent', async (req: Request, res: Response) => {
  try {
    const { sessionId, enabled } = req.body;

    if (!sessionId) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Session ID is required' 
      });
    }

    // Update trading agent mode
    tradingAgentMode.set(sessionId, enabled);
    
    const statusMsg = enabled 
      ? `✅ Trading Agent Enabled\n\nI can now open positions based on your analysis and conditions.`
      : `⏸️ Trading Agent Disabled\n\nI will not open any positions until you enable trading agent again.`;
    
    // Store in conversation history
    const history = conversationHistory.get(sessionId) || [];
    history.push({ role: 'assistant', message: statusMsg, timestamp: Date.now() });
    conversationHistory.set(sessionId, history);

    return res.json({
      ok: true,
      response: statusMsg,
      tradingAgentEnabled: enabled
    });

  } catch (error) {
    logger.error('Toggle trading agent error', { error });
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

