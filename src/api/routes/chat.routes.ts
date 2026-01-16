import { Router, Request, Response } from 'express';
import { NLPProcessor } from '../../ai/nlp_processor';
import { LLMService } from '../../ai/llm_service';
import { createModuleLogger } from '../../config/logger';
import { GoalsRepository } from '../../storage/repositories/goals.repo';
import { PriceCache } from '../../market/price_cache';
import { BinanceDataFetcher } from '../../market/binance_data_fetcher';
import { AnalysisEngine } from '../../analysis/analysis_engine';

const logger = createModuleLogger('ChatRoutes');
const nlp = new NLPProcessor();
const llm = new LLMService();

// Store last analysis results per session (simple in-memory store)
const lastAnalysis: Map<string, { symbol: string; resistance?: number; support?: number; timestamp: number }> = new Map();

// Store conversation history per session
const conversationHistory: Map<string, Array<{ role: 'user' | 'assistant', message: string, timestamp: number }>> = new Map();

export const chatRouter = Router();

chatRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { message, tradingMode } = req.body;

    if (!message) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Message is required' 
      });
    }

    // Generate session ID from client (could be improved with real session management)
    const sessionId = req.ip || 'default';
    
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
      case 'CREATE_GOAL':
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
          symbol: intent.symbol,
          targetPrice: intent.target || 0, // 0 for divergence goals
          condition: intent.condition,
          state: 'WATCHING',
          watchMode: intent.watchMode || (isDivergenceGoal ? 'CONTINUOUS' : 'ONCE'),
          notifyChannel: true,
          autoTrade: intent.autoTrade && tradingMode === 'live',
          createdAt: new Date(),
          updatedAt: new Date(),
          triggerCount: 0,
        });

        const goalResponse = response || nlp.generateResponse(intent, goal);
        history.push({ role: 'assistant', message: goalResponse, timestamp: Date.now() });
        
        return res.json({
          ok: true,
          response: goalResponse,
          goal: goal,
          intent: intent,
          llmUsed: llmUsed
        });

      case 'LIST_GOALS':
        result = await goalsRepo.findAll();
        const activeGoals = result.filter((g: any) => g.state === 'WATCHING' || g.state === 'TRIGGERED');
        return res.json({
          ok: true,
          response: response || nlp.generateResponse(intent, activeGoals),
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
        
        return res.json({
          ok: true,
          response: priceResponse,
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
                  resistance: srResult.nearestResistance?.level,
                  support: srResult.nearestSupport?.level,
                  timestamp: Date.now()
                });
                logger.info('Stored S/R levels for session', { 
                  sessionId, 
                  symbol,
                  resistance: srResult.nearestResistance?.level,
                  support: srResult.nearestSupport?.level
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
          }
          
          // Store assistant response in history
          history.push({ role: 'assistant', message: analysisResponse, timestamp: Date.now() });
          
          return res.json({
            ok: true,
            response: analysisResponse,
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
    res.status(500).json({
      ok: false,
      response: '❌ Sorry, something went wrong. Please try again.',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});
