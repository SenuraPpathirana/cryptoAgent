# Integrating LLM APIs (Gemini & Groq) 🤖

## Quick Setup

### Option 1: Google Gemini (Recommended)

1. **Get API Key**
   - Visit: https://aistudio.google.com/app/apikey
   - Sign in with Google account
   - Click "Create API Key"
   - Copy the key

2. **Add to .env**
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

3. **Model Used**: `gemini-2.0-flash-exp` (Fast, free, powerful)

### Option 2: Groq (Ultra-Fast)

1. **Get API Key**
   - Visit: https://console.groq.com/keys
   - Sign up / Log in
   - Create new API key
   - Copy the key

2. **Add to .env**
   ```env
   GROQ_API_KEY=your_groq_api_key_here
   ```

3. **Model Used**: `llama-3.3-70b-versatile` (Fastest inference)

### Priority Order
If both keys are set, the system uses:
1. **Gemini** (first priority)
2. **Groq** (second priority)
3. **Basic NLP** (fallback if no keys)

## How It Works

### Before LLM (Basic NLP)
```javascript
User: "yo can you like alert me if bitcoin gets to 50k?"
Basic NLP: [Struggles with informal language]
           Confidence: 60%
```

### With LLM
```javascript
User: "yo can you like alert me if bitcoin gets to 50k?"
Gemini/Groq: ✅ Understands informal language
             ✅ Recognizes "50k" = $50,000
             ✅ Knows "bitcoin" = BTCUSDT
             ✅ Creates goal: BTCUSDT ABOVE 50000
             Confidence: 95%
```

## Enhanced Capabilities

### 1. **Natural Conversation**
```
❌ Before: "Alert BTCUSDT when price above 50000"
✅ With LLM: "Hey, can you let me know if Bitcoin hits 50k?"
```

### 2. **Context Understanding**
```
User: "What about Ethereum?"
LLM: [Remembers previous conversation context]
     "Current Ethereum price is $3,245"
```

### 3. **Ambiguity Resolution**
```
User: "Tell me when it drops"
LLM: "Which cryptocurrency? (BTC, ETH, BNB, etc.)"
```

### 4. **Complex Queries**
```
User: "Set an alert for Bitcoin at 50k but only if it's going up fast"
LLM: Creates BTCUSDT CROSSES_ABOVE 50000 (not just ABOVE)
```

## Architecture Changes

### File: `src/ai/llm_service.ts`
```typescript
export class LLMService {
  // Automatically chooses provider based on available API keys
  constructor() {
    if (GEMINI_API_KEY) → Use Gemini
    else if (GROQ_API_KEY) → Use Groq
    else → Disable LLM (use basic NLP)
  }

  async processMessage(message: string): Promise<LLMResponse> {
    // Sends to Gemini or Groq API
    // Returns structured JSON with intent
  }
}
```

### File: `src/api/routes/chat.routes.ts`
```typescript
// Try LLM first
if (llm.isEnabled()) {
  llmResponse = await llm.processMessage(message);
  if (success) use LLM response
}

// Fall back to basic NLP if LLM fails
if (!llmResponse) {
  intent = nlp.parse(message);
}
```

## LLM Response Format

The LLM returns structured JSON:

```json
{
  "intent": {
    "action": "CREATE_GOAL",
    "symbol": "BTCUSDT",
    "condition": "ABOVE",
    "target": 50000,
    "watchMode": "ONCE",
    "autoTrade": false
  },
  "response": "I'll alert you when Bitcoin reaches $50,000! 🎯",
  "confidence": 0.95
}
```

## Testing the Integration

### 1. **Check if LLM is Active**
The response includes `llmUsed: true/false`:

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"alert me when btc hits 50k","tradingMode":"paper"}'
```

Response:
```json
{
  "ok": true,
  "response": "I'll alert you when Bitcoin reaches $50,000!",
  "llmUsed": true,  ← Indicates LLM was used
  "intent": {...}
}
```

### 2. **Test Complex Queries**

```javascript
// Informal language
"yo hit me up when bitcoin gets to 50k"

// Abbreviations
"alert @ btc 50k"

// Conversational
"Can you please let me know if Ethereum drops below three thousand dollars?"

// Slang
"Tell me when BTC moons to 100k"
```

## Cost Comparison

| Provider | Cost | Speed | Quality |
|----------|------|-------|---------|
| **Gemini** | FREE (60 req/min) | Fast (1-2s) | Excellent |
| **Groq** | FREE (30 req/min) | Ultra-fast (<1s) | Excellent |
| **Basic NLP** | FREE (unlimited) | Instant | Good |

## Rate Limits

### Gemini Free Tier
- 60 requests per minute
- 1,500 requests per day
- 1 million tokens per day

### Groq Free Tier
- 30 requests per minute
- 14,400 requests per day
- No daily token limit

## Error Handling

The system automatically falls back:

```
1. Try LLM (Gemini/Groq)
   ↓ [Error or no API key]
2. Fall back to Basic NLP
   ↓ [Always works]
3. Return result
```

Logs show what was used:
```
✅ LLM: "Chat intent parsed via LLM (provider: gemini)"
⚠️ Fallback: "LLM processing failed, falling back to basic NLP"
```

## UI Updates

The chat UI automatically shows:
- 🤖 **"Powered by Gemini"** badge (if Gemini active)
- ⚡ **"Powered by Groq"** badge (if Groq active)
- 💡 **Basic NLP** (if no LLM configured)

## Production Recommendations

1. **Use Gemini for production** (better free tier limits)
2. **Use Groq for ultra-low latency** (fastest responses)
3. **Keep Basic NLP as fallback** (always works offline)

## Advanced: Custom System Prompt

Edit `src/ai/llm_service.ts` → `buildSystemPrompt()` to customize:

```typescript
private buildSystemPrompt(): string {
  return `You are a crypto trading assistant...
  
  [ADD YOUR CUSTOM INSTRUCTIONS HERE]
  
  - Be friendly and encouraging
  - Use emojis in responses
  - Explain risk when user mentions trading
  `;
}
```

## Troubleshooting

### "No LLM configured" warning
- Check `.env` has `GEMINI_API_KEY` or `GROQ_API_KEY`
- Restart the application

### "LLM processing failed"
- Check API key is valid
- Check internet connection
- Check API quotas not exceeded
- System will fall back to basic NLP automatically

### Slow responses
- Gemini: 1-2 seconds (normal)
- Groq: <1 second (normal)
- If slower: Check network latency

## Next Steps

1. ✅ Add API key to `.env`
2. ✅ Restart application: `npm run dev`
3. ✅ Test in chat UI: http://localhost:3000
4. ✅ Try complex queries
5. ✅ Monitor logs for `llmUsed: true`

---

**The chat now understands natural language like a human! 🎉**
