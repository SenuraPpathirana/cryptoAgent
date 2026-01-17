# User Management System

## Overview

The Crypto Trading Agent now includes a complete multi-user system with:
- User registration and authentication (JWT)
- Personalized Telegram and Binance configurations per user
- Behavior tracking for AI-powered suggestions
- Chat history storage
- Secure password hashing with bcrypt

## Architecture

### Database Schema

Four main tables:

1. **users** - User accounts
   - `id` (PRIMARY KEY)
   - `email` (UNIQUE)
   - `password_hash` (bcrypt)
   - `username`
   - `created_at`, `last_login`

2. **user_configs** - Per-user configurations
   - `user_id` (FOREIGN KEY)
   - `telegram_bot_token`, `telegram_channel_id`
   - `binance_api_key`, `binance_api_secret`, `binance_testnet`
   - `trading_mode`, `default_leverage`, `max_position_size_usdt`

3. **user_behavior** - Behavior tracking for AI learning
   - `user_id` (FOREIGN KEY)
   - `keyword`, `category`, `occurrence_count`
   - `last_occurred`

4. **chat_messages** - Complete chat history
   - `user_id` (FOREIGN KEY)
   - `role` (user/assistant)
   - `message`, `intent` (JSONB), `metadata` (JSONB)

### Authentication Flow

```
1. Register/Login → JWT token issued (7-day expiry)
2. Token stored in localStorage
3. All API requests include: Authorization: Bearer <token>
4. Middleware verifies token and attaches userId to request
```

## API Endpoints

### Authentication (`/api/auth`)

**POST /api/auth/register**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "username": "John" // optional
}
```

Response:
```json
{
  "token": "eyJhbGciOiJIUzI1...",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "username": "John"
  }
}
```

**POST /api/auth/login**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**GET /api/auth/verify**
Headers: `Authorization: Bearer <token>`

### User Configuration (`/api/user`)

All endpoints require JWT authentication.

**GET /api/user/config**
Returns configuration status (doesn't expose secrets)

**POST /api/user/config/telegram**
```json
{
  "telegram_bot_token": "1234567890:ABC...",
  "telegram_channel_id": "-1001234567890"
}
```

**POST /api/user/config/binance**
```json
{
  "binance_api_key": "your_api_key",
  "binance_api_secret": "your_api_secret",
  "binance_testnet": true
}
```

**POST /api/user/config/trading**
```json
{
  "trading_mode": "testnet",
  "default_leverage": 10,
  "max_position_size_usdt": 1000
}
```

**GET /api/user/behavior**
Returns tracked keywords and patterns

**GET /api/user/suggestions**
Returns AI-powered suggestions based on user behavior

**GET /api/user/history**
Returns chat message history

## Frontend Pages

### Login Page (`/login.html`)
- Email/password authentication
- Toggle between login and register modes
- Auto-redirect if already logged in
- Token stored in localStorage

### Settings Page (`/settings.html`)
- Telegram configuration form
- Binance API key management
- Trading preferences
- Real-time status badges (configured/not configured)
- Logout functionality

### Main Chat UI (`/index.html`)
- Protected: redirects to login if no token
- User info display
- Link to settings page
- Logout button

## Migration

Run database migration to create tables:

```bash
npm run migrate
```

This executes `scripts/migrate.ts` which loads `src/storage/schema/users.sql`.

## Environment Variables

Add to `.env`:

```env
JWT_SECRET=your-super-secret-jwt-key-change-in-production
```

If not set, a random key is generated (not recommended for production).

## Behavior Tracking

The system automatically tracks:
- Keywords from user messages
- Categories (symbol, action, feature, etc.)
- Occurrence counts
- Last used timestamp

This data powers AI suggestions like:
- "Would you like me to send this as a Telegram reminder too?" (if user frequently mentions telegram + reminder)
- "Set a goal based on this level?" (if user frequently checks resistance/support)
- "Enable Telegram notifications for position updates?" (if user tracks positions but not using telegram)

## Security Features

1. **Password Hashing**: bcrypt with 10 rounds
2. **JWT Tokens**: 7-day expiry, signed with secret key
3. **Middleware Protection**: Optional and required auth middleware
4. **No Secret Exposure**: Config API never returns actual tokens/keys
5. **Input Validation**: Email format, password length (min 6 chars)

## Usage Example

### 1. Register a new user

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}'
```

### 2. Configure Telegram

```bash
curl -X POST http://localhost:3000/api/user/config/telegram \
  -H "Authorization: Bearer <your_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "telegram_bot_token":"YOUR_BOT_TOKEN",
    "telegram_channel_id":"YOUR_CHANNEL_ID"
  }'
```

### 3. Configure Binance

```bash
curl -X POST http://localhost:3000/api/user/config/binance \
  -H "Authorization: Bearer <your_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "binance_api_key":"YOUR_API_KEY",
    "binance_api_secret":"YOUR_API_SECRET",
    "binance_testnet":true
  }'
```

## Next Steps

Future enhancements:
1. **Integrate with chat**: Use user-specific configs instead of .env
2. **Smart suggestions**: Integrate behavior data into LLM system prompt
3. **Email verification**: Add email confirmation for registration
4. **Password reset**: Forgot password functionality
5. **2FA**: Two-factor authentication option
6. **Session management**: Refresh tokens, device tracking
7. **User profiles**: Avatar, bio, trading statistics
8. **Social features**: Follow other traders, share signals

## Code Structure

```
src/
├── auth/
│   └── auth.service.ts         # JWT generation & validation
├── api/
│   ├── middleware/
│   │   └── auth.middleware.ts  # JWT middleware
│   ├── routes/
│   │   ├── auth.routes.ts      # Login/register endpoints
│   │   └── user.routes.ts      # User config endpoints
│   └── server.ts               # Route registration
├── storage/
│   ├── repositories/
│   │   └── users.repo.ts       # User database operations
│   └── schema/
│       └── users.sql           # Database schema
public/
├── login.html                  # Login/register UI
└── settings.html               # User settings UI
scripts/
└── migrate.ts                  # Database migration script
```

## TypeScript Types

All repositories and services are fully typed:

```typescript
interface User {
  id: number;
  email: string;
  username?: string;
  created_at: Date;
  last_login?: Date;
}

interface UserConfig {
  user_id: number;
  telegram_bot_token?: string;
  telegram_channel_id?: string;
  binance_api_key?: string;
  binance_api_secret?: string;
  binance_testnet: boolean;
  trading_mode: 'paper' | 'testnet' | 'live';
  default_leverage: number;
  max_position_size_usdt: number;
}

interface UserBehavior {
  user_id: number;
  keyword: string;
  category: string;
  occurrence_count: number;
  last_occurred: Date;
}
```

## Testing

Test the complete flow:

1. Visit http://localhost:3000/login.html
2. Register a new account
3. Login with credentials
4. Visit http://localhost:3000/settings.html
5. Configure Telegram and Binance
6. Return to chat and verify personalized configs are used

## Troubleshooting

**"Invalid or expired token"**
- Token expired (7 days). Re-login required.
- Clear localStorage and login again.

**"User already exists"**
- Email already registered. Use login instead.

**Migration fails**
- Check DATABASE_URL in .env
- Ensure PostgreSQL is running
- Check for existing tables (drop if needed)

**Settings not loading**
- Check JWT_SECRET is set
- Verify token in localStorage
- Check browser console for errors
