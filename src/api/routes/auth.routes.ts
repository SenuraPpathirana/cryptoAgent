import { Router, Request, Response } from 'express';
import { AuthService } from '../../auth/auth.service';
import { createModuleLogger } from '../../config/logger';

const logger = createModuleLogger('AuthRoutes');
const router = Router();
const authService = AuthService.getInstance();

/**
 * POST /api/auth/register
 * Register a new user
 */
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, username } = req.body;

    // Validation
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password required' });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters' });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({ error: 'Invalid email format' });
      return;
    }

    // Register user
    const result = await authService.register(email, password, username);

    logger.info('User registered', { userId: result.user.id, email });

    res.status(201).json({
      token: result.token,
      user: {
        id: result.user.id,
        email: result.user.email,
        username: result.user.username,
      },
    });
  } catch (error: any) {
    logger.error('Registration error', { error: error.message });
    
    if (error.message === 'EMAIL_EXISTS') {
      res.status(409).json({ error: 'An account with this email already exists' });
      return;
    }
    
    if (error.message === 'INVALID_EMAIL') {
      res.status(400).json({ error: 'Invalid email format' });
      return;
    }
    
    if (error.message === 'PASSWORD_TOO_SHORT') {
      res.status(400).json({ error: 'Password must be at least 6 characters' });
      return;
    }
    
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

/**
 * POST /api/auth/login
 * Login existing user
 */
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password required' });
      return;
    }

    // Login user
    const result = await authService.login(email, password);

    if (!result) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    logger.info('User logged in', { userId: result.user.id, email });

    res.json({
      token: result.token,
      user: {
        id: result.user.id,
        email: result.user.email,
        username: result.user.username,
      },
    });
  } catch (error) {
    logger.error('Login error', { error });
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * GET /api/auth/verify
 * Verify token and return user info
 */
router.get('/verify', async (req: Request, res: Response): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn('[Verify] No token provided');
      res.status(401).json({ valid: false, error: 'No token provided' });
      return;
    }

    const token = authHeader.substring(7);
    logger.info('[Verify] Verifying token', { tokenStart: token.substring(0, 20) + '...' });
    
    const user = await authService.getUserFromToken(token);

    if (!user) {
      logger.warn('[Verify] Invalid or expired token');
      res.status(401).json({ valid: false, error: 'Invalid or expired token' });
      return;
    }

    logger.info('[Verify] Token verified successfully', { userId: user.id, email: user.email });
    
    res.json({
      valid: true,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
      },
    });
  } catch (error) {
    logger.error('Token verification error', { error });
    res.status(500).json({ error: 'Verification failed' });
  }
});

export default router;
