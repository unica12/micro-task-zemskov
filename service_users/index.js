require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Joi = require('joi');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(cors());
app.use(express.json());

// Middleware для логирования запросов
app.use((req, res, next) => {
  const requestId = req.headers['x-request-id'] || 'unknown';
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info({
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      requestId,
      userId: req.headers['x-user-id']
    }, 'HTTP request');
  });
  
  next();
});

// Импортируем наши модули
const User = require('./models/User');
const { hashPassword, comparePassword } = require('./utils/passwordUtils');
const { generateToken } = require('./utils/jwtUtils');
const { validateRequest, checkPermissions } = require('./middleware/validation');

// ==================== SCHEMAS ====================

const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  name: Joi.string().min(2).required(),
  role: Joi.string().valid('user', 'engineer', 'manager', 'admin').default('user')
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

const updateUserSchema = Joi.object({
  name: Joi.string().min(2),
  email: Joi.string().email(),
  role: Joi.string().valid('user', 'engineer', 'manager', 'admin')
}).min(1);

// ==================== AUTH ROUTES ====================

app.post('/api/v1/auth/register', validateRequest(registerSchema), async (req, res) => {
  try {
    const { email, password, name, role } = req.validatedData;
    const requestId = req.headers['x-request-id'] || 'unknown';
    
    const existingUser = User.findByEmail(email);
    if (existingUser) {
      logger.warn({ email, requestId }, 'Registration failed - user already exists');
      return res.status(409).json({
        success: false,
        error: {
          code: 'USER_EXISTS',
          message: 'Пользователь с таким email уже существует'
        }
      });
    }
    
    const hashedPassword = await hashPassword(password);
    const user = User.create({ email, password: hashedPassword, name, role });
    const token = generateToken(user);
    
    logger.info({ userId: user.id, email, role, requestId }, 'User registered successfully');
    
    res.status(201).json({
      success: true,
      data: {
        user: user.toJSON(),
        token
      }
    });
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, 'Registration error');
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Ошибка при регистрации'
      }
    });
  }
});

app.post('/api/v1/auth/login', validateRequest(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.validatedData;
    const requestId = req.headers['x-request-id'] || 'unknown';
    
    const user = User.findByEmail(email);
    if (!user) {
      logger.warn({ email, requestId }, 'Login failed - user not found');
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Неверный email или пароль'
        }
      });
    }
    
    const isValidPassword = await comparePassword(password, user.password);
    if (!isValidPassword) {
      logger.warn({ email, requestId }, 'Login failed - invalid password');
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Неверный email или пароль'
        }
      });
    }
    
    const token = generateToken(user);
    
    logger.info({ userId: user.id, email, role: user.role, requestId }, 'User logged in successfully');
    
    res.json({
      success: true,
      data: {
        user: user.toJSON(),
        token
      }
    });
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, 'Login error');
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Ошибка при входе'
      }
    });
  }
});

// ==================== USER ROUTES ====================

app.get('/api/v1/users/:userId', checkPermissions(), (req, res) => {
  try {
    const user = User.findById(req.params.userId);
    const requestId = req.headers['x-request-id'] || 'unknown';
    
    if (!user) {
      logger.warn({ userId: req.params.userId, requestId }, 'User not found');
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'Пользователь не найден'
        }
      });
    }
    
    logger.debug({ userId: user.id, requestId }, 'User profile retrieved');
    
    res.json({
      success: true,
      data: user.toJSON()
    });
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, 'Get user error');
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Ошибка при получении пользователя'
      }
    });
  }
});

// Вход пользователя
app.post('/api/v1/auth/login', validateRequest(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.validatedData;
    
    // Ищем пользователя
    const user = User.findByEmail(email);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Неверный email или пароль'
        }
      });
    }
    
    // Проверяем пароль
    const isValidPassword = await comparePassword(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Неверный email или пароль'
        }
      });
    }
    
    // Генерируем токен
    const token = generateToken(user);
    
    res.json({
      success: true,
      data: {
        user: user.toJSON(),
        token
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Ошибка при входе'
      }
    });
  }
});

// ==================== USER ROUTES ====================

// Получить профиль пользователя
app.get('/api/v1/users/:userId', checkPermissions(), (req, res) => {
  try {
    const user = User.findById(req.params.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'Пользователь не найден'
        }
      });
    }
    
    res.json({
      success: true,
      data: user.toJSON()
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Ошибка при получении пользователя'
      }
    });
  }
});

// Обновить профиль пользователя
app.put('/api/v1/users/:userId', checkPermissions(), validateRequest(updateUserSchema), async (req, res) => {
  try {
    const user = User.findById(req.params.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'Пользователь не найден'
        }
      });
    }
    
    // Если обновляется email, проверяем что он не занят
    if (req.validatedData.email && req.validatedData.email !== user.email) {
      const existingUser = User.findByEmail(req.validatedData.email);
      if (existingUser && existingUser.id !== user.id) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'EMAIL_EXISTS',
            message: 'Email уже используется другим пользователем'
          }
        });
      }
    }
    
    // Обновляем пользователя
    user.update(req.validatedData);
    
    res.json({
      success: true,
      data: user.toJSON()
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Ошибка при обновлении пользователя'
      }
    });
  }
});

// Получить список пользователей (только для админов)
app.get('/api/v1/users', checkPermissions('admin'), (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    
    const filters = {
      role: req.query.role,
      search: req.query.search
    };
    
    const result = User.findAll(page, limit, filters);
    
    res.json({
      success: true,
      data: result.data.map(user => user.toJSON()),
      pagination: result.pagination
    });
  } catch (error) {
    console.error('Get users list error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Ошибка при получении списка пользователей'
      }
    });
  }
});

// ==================== HEALTH CHECKS ====================

app.get('/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'Users service is running',
      timestamp: new Date().toISOString(),
      userCount: User.findAll().data.length
    }
  });
});

app.get('/api/v1/status', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'Users service v1 is running',
      version: '1.0.0'
    }
  });
});

// ==================== ERROR HANDLING ====================

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Маршрут не найден'
    }
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error:', err);
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Внутренняя ошибка сервера'
    }
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Users service running on port ${PORT}`);
  
  // Хешируем пароли тестовых пользователей при запуске
  const bcrypt = require('bcryptjs');
  const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 10;
  const testPassword = 'password123';
  
  // Обновляем пароли тестовых пользователей
  const users = User.findAll().data;
  users.forEach(async (user) => {
    if (user.password === '$2a$10$YourHashedPasswordHere') {
      user.password = await bcrypt.hash(testPassword, saltRounds);
    }
  });
  
  console.log('Test users created with password "password123"');
  console.log('- admin@example.com (admin)');
  console.log('- manager@example.com (manager)');
  console.log('- engineer@example.com (engineer)');
});
