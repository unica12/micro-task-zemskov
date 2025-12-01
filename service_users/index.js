require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Joi = require('joi');

const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(cors());
app.use(express.json());

// Импортируем наши модули
const User = require('./models/User');
const { hashPassword, comparePassword, validatePassword } = require('./utils/passwordUtils');
const { generateToken, validateUserData } = require('./utils/jwtUtils');
const { validateRequest, checkPermissions } = require('./middleware/validation');

// Middleware для логирования
app.use((req, res, next) => {
  const requestId = req.headers['x-request-id'] || 'unknown';
  console.log(`[${new Date().toISOString()}] [${requestId}] ${req.method} ${req.url}`);
  next();
});

// ==================== SCHEMAS FOR VALIDATION ====================

const registerSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'Некорректный формат email',
    'any.required': 'Email обязателен'
  }),
  password: Joi.string().min(6).required().messages({
    'string.min': 'Пароль должен содержать минимум 6 символов',
    'any.required': 'Пароль обязателен'
  }),
  name: Joi.string().min(2).required().messages({
    'string.min': 'Имя должно содержать минимум 2 символа',
    'any.required': 'Имя обязательно'
  }),
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

// Регистрация пользователя
app.post('/api/v1/auth/register', validateRequest(registerSchema), async (req, res) => {
  try {
    const { email, password, name, role } = req.validatedData;
    
    // Проверяем, нет ли уже пользователя с таким email
    const existingUser = User.findByEmail(email);
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'USER_EXISTS',
          message: 'Пользователь с таким email уже существует'
        }
      });
    }
    
    // Хешируем пароль
    const hashedPassword = await hashPassword(password);
    
    // Создаем пользователя
    const user = User.create({
      email,
      password: hashedPassword,
      name,
      role
    });
    
    // Генерируем токен
    const token = generateToken(user);
    
    res.status(201).json({
      success: true,
      data: {
        user: user.toJSON(),
        token
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Ошибка при регистрации'
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
