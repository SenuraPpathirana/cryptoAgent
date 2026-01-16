import { Router, Request, Response } from 'express';
import { NLPProcessor } from '../../ai/nlp_processor';
import { LLMService } from '../../ai/llm_service';
import { createModuleLogger } from '../../config/logger';
import { GoalsRepository } from '../../storage/repositories/goals.repo';
import { PriceCache } from '../../market/price_cache';

const logger = createModuleLogger('ChatRoutes');
const nlp = new NLPProcessor();
const llm = new LLMService();

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

    // Try LLM first, fall back to basic NLP
    let intent;
    let response;
    let llmUsed = false;

    if (llm.isEnabled()) {
      try {
        const llmResponse = await llm.processMessage(message, { tradingMode });
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

    let result;
    let goal;

    // Handle different actions
    switch (intent.action) {
      case 'CREATE_GOAL':
        if (!intent.symbol || !intent.target || !intent.condition) {
          return res.json({
            ok: true,
            response: "I couldn't fully understand your request. Please specify:\n" +
              "• Which cryptocurrency (e.g., BTC, ETH)\n" +
              "• Target price (e.g., $50000)\n" +
              "• Condition (e.g., above, below, crosses)"
          });
        }

        goal = await goalsRepo.create({
          id: `goal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          symbol: intent.symbol,
          targetPrice: intent.target,
          condition: intent.condition,
          state: 'WATCHING',
          watchMode: intent.watchMode || 'ONCE',
          notifyChannel: true,
          autoTrade: intent.autoTrade && tradingMode === 'live',
          createdAt: new Date(),
          updatedAt: new Date(),
          triggerCount: 0,
        });

        return res.json({
          ok: true,
          response: response || nlp.generateResponse(intent, goal),
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
