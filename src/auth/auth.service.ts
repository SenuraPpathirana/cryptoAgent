import jwt from 'jsonwebtoken';
import { UsersRepository, User } from '../storage/repositories/users.repo';
import { createModuleLogger } from '../config/logger';
import { env } from '../config/env';

const logger = createModuleLogger('AuthService');

const JWT_SECRET = env.JWT_SECRET;
const JWT_EXPIRY = '7d';

export interface AuthToken {
  token: string;
  user: User;
}

export interface TokenPayload {
  userId: number;
  email: string;
}

export class AuthService {
  private static instance: AuthService;
  private usersRepo: UsersRepository;

  private constructor() {
    this.usersRepo = UsersRepository.getInstance();
  }

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  /**
   * Register a new user
   */
  async register(email: string, password: string, username?: string): Promise<AuthToken | null> {
    try {
      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        logger.warn('Invalid email format', { email });
        throw new Error('INVALID_EMAIL');
      }

      // Validate password strength
      if (password.length < 6) {
        logger.warn('Password too short', { email });
        throw new Error('PASSWORD_TOO_SHORT');
      }

      // Create user
      const user = await this.usersRepo.createUser(email, password, username);
      if (!user) {
        logger.error('Failed to create user', { email });
        throw new Error('CREATE_FAILED');
      }

      // Generate token
      const token = this.generateToken(user.id, user.email);

      logger.info('User registered successfully', { userId: user.id, email });

      return {
        token,
        user,
      };
    } catch (error: any) {
      logger.error('Registration failed', { error: error.message, email });
      throw error;
    }
  }

  /**
   * Login existing user
   */
  async login(email: string, password: string): Promise<AuthToken | null> {
    try {
      const user = await this.usersRepo.authenticateUser(email, password);
      
      if (!user) {
        logger.warn('Authentication failed', { email });
        return null;
      }

      // Generate token
      const token = this.generateToken(user.id, user.email);

      logger.info('User logged in successfully', { userId: user.id, email });

      return {
        token,
        user,
      };
    } catch (error) {
      logger.error('Login failed', { error, email });
      return null;
    }
  }

  /**
   * Verify JWT token
   */
  verifyToken(token: string): TokenPayload | null {
    try {
      logger.info('[VerifyToken] Attempting to verify token with secret', { 
        secretStart: JWT_SECRET.substring(0, 10) + '...',
        tokenStart: token.substring(0, 20) + '...'
      });
      const payload = jwt.verify(token, JWT_SECRET) as TokenPayload;
      logger.info('[VerifyToken] Token verified successfully', { userId: payload.userId, email: payload.email });
      return payload;
    } catch (error: any) {
      logger.warn('[VerifyToken] Token verification failed', { error: error.message });
      return null;
    }
  }

  /**
   * Get user from token
   */
  async getUserFromToken(token: string): Promise<User | null> {
    try {
      const payload = this.verifyToken(token);
      if (!payload) {
        return null;
      }

      const user = await this.usersRepo.getUserById(payload.userId);
      return user;
    } catch (error) {
      logger.error('Failed to get user from token', { error });
      return null;
    }
  }

  /**
   * Generate JWT token
   */
  private generateToken(userId: number, email: string): string {
    return jwt.sign(
      { userId, email } as TokenPayload,
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );
  }
}
