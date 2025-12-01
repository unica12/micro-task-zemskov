require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const CircuitBreaker = require('opossum');
const { authenticateToken, authorizeRoles } = require('./middleware/auth');
const { authLimiter, apiLimiter } = require('./middleware/rateLimit');

const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(cors());
app.use(express.json());

// Добавляем middleware для добавления X-Request-ID
app.use((req, res, next) => {
  const requestId = req.headers['x-request-id'] || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  req.headers['x-request-id'] = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
});

// Service URLs
const USERS_SERVICE_URL = process.env.USERS_SERVICE_URL || 'http://service_users:8000';
const ORDERS_SERVICE_URL = process.env.ORDERS_SERVICE_URL || 'http://service_orders:8000';

// Circuit Breaker configuration
const circuitOptions = {
  timeout: 5000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
};

// Create circuit breakers
const createCircuitBreaker = (serviceName) => {
  const circuit = new CircuitBreaker(async (url, options = {}) => {
    try {
      const response = await axios({
        url,
        ...options,
        headers: {
          ...options.headers,
          'x-request-id': options.headers?.['x-request-id'] || 'unknown',
        },
        validateStatus: status => (status >= 200 && status < 300) || status === 404
      });
      return response.data;
    } catch (error) {
      if (error.response && error.response.status === 404) {
        return error.response.data;
      }
      throw error;
    }
  }, circuitOptions);

  circuit.fallback(() => ({
    success: false,
    error: {
      code: 'SERVICE_UNAVAILABLE',
      message: `${serviceName} service temporarily unavailable`
    }
  }));

  return circuit;
};

const usersCircuit = createCircuitBreaker('Users');
const ordersCircuit = createCircuitBreaker('Orders');

// ==================== PUBLIC ROUTES (без аутентификации) ====================

// Регистрация - публичный доступ
app.post('/api/v1/auth/register', authLimiter, async (req, res) => {
  try {
    const user = await usersCircuit.fire(`${USERS_SERVICE_URL}/api/v1/auth/register`, {
      method: 'POST',
      data: req.body,
      headers: {
        'x-request-id': req.headers['x-request-id']
      }
    });
    res.status(201).json(user);
  } catch (error) {
    console.error('Registration error:', error.message);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Ошибка при регистрации'
      }
    });
  }
});

// Вход - публичный доступ
app.post('/api/v1/auth/login', authLimiter, async (req, res) => {
  try {
    const result = await usersCircuit.fire(`${USERS_SERVICE_URL}/api/v1/auth/login`, {
      method: 'POST',
      data: req.body,
      headers: {
        'x-request-id': req.headers['x-request-id']
      }
    });
    res.json(result);
  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Ошибка при входе'
      }
    });
  }
});

// ==================== PROTECTED ROUTES (требуется аутентификация) ====================

// Группа маршрутов для пользователей с аутентификацией
app.use('/api/v1/users*', authenticateToken);

// Получить профиль текущего пользователя
app.get('/api/v1/users/me', async (req, res) => {
  try {
    const user = await usersCircuit.fire(`${USERS_SERVICE_URL}/api/v1/users/${req.user.userId}`, {
      headers: {
        'x-request-id': req.headers['x-request-id'],
        'x-user-id': req.user.userId
      }
    });
    res.json(user);
  } catch (error) {
    console.error('Get profile error:', error.message);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Ошибка при получении профиля'
      }
    });
  }
});

// Обновить профиль
app.put('/api/v1/users/me', async (req, res) => {
  try {
    const user = await usersCircuit.fire(`${USERS_SERVICE_URL}/api/v1/users/${req.user.userId}`, {
      method: 'PUT',
      data: req.body,
      headers: {
        'x-request-id': req.headers['x-request-id'],
        'x-user-id': req.user.userId
      }
    });
    res.json(user);
  } catch (error) {
    console.error('Update profile error:', error.message);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Ошибка при обновлении профиля'
      }
    });
  }
});

// Админские маршруты (только для админов)
app.get('/api/v1/users', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const queryParams = new URLSearchParams(req.query).toString();
    const users = await usersCircuit.fire(`${USERS_SERVICE_URL}/api/v1/users?${queryParams}`, {
      headers: {
        'x-request-id': req.headers['x-request-id'],
        'x-user-id': req.user.userId
      }
    });
    res.json(users);
  } catch (error) {
    console.error('Get users error:', error.message);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Ошибка при получении списка пользователей'
      }
    });
  }
});

// ==================== ORDERS ROUTES ====================

// Группа маршрутов для заказов с аутентификацией
app.use('/api/v1/orders*', authenticateToken);

// Создать заказ
app.post('/api/v1/orders', async (req, res) => {
  try {
    const order = await ordersCircuit.fire(`${ORDERS_SERVICE_URL}/api/v1/orders`, {
      method: 'POST',
      data: { ...req.body, userId: req.user.userId },
      headers: {
        'x-request-id': req.headers['x-request-id'],
        'x-user-id': req.user.userId
      }
    });
    res.status(201).json(order);
  } catch (error) {
    console.error('Create order error:', error.message);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Ошибка при создании заказа'
      }
    });
  }
});

// Получить заказы текущего пользователя
app.get('/api/v1/orders', async (req, res) => {
  try {
    const queryParams = new URLSearchParams({
      ...req.query,
      userId: req.user.userId
    }).toString();
    
    const orders = await ordersCircuit.fire(`${ORDERS_SERVICE_URL}/api/v1/orders?${queryParams}`, {
      headers: {
        'x-request-id': req.headers['x-request-id'],
        'x-user-id': req.user.userId
      }
    });
    res.json(orders);
  } catch (error) {
    console.error('Get orders error:', error.message);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Ошибка при получении заказов'
      }
    });
  }
});

// Получить конкретный заказ
app.get('/api/v1/orders/:orderId', async (req, res) => {
  try {
    const order = await ordersCircuit.fire(`${ORDERS_SERVICE_URL}/api/v1/orders/${req.params.orderId}`, {
      headers: {
        'x-request-id': req.headers['x-request-id'],
        'x-user-id': req.user.userId
      }
    });
    res.json(order);
  } catch (error) {
    console.error('Get order error:', error.message);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Ошибка при получении заказа'
      }
    });
  }
});

// ==================== HEALTH CHECKS ====================

app.get('/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'API Gateway is running',
      timestamp: new Date().toISOString(),
      circuits: {
        users: {
          status: usersCircuit.status,
          stats: usersCircuit.stats
        },
        orders: {
          status: ordersCircuit.status,
          stats: ordersCircuit.stats
        }
      }
    }
  });
});

app.get('/api/v1/status', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'API Gateway v1 is running',
      version: '1.0.0',
      timestamp: new Date().toISOString()
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
app.listen(PORT, () => {
  console.log(`API Gateway running on port ${PORT}`);

  // Log circuit breaker events
  usersCircuit.on('open', () => console.log('Users circuit breaker opened'));
  usersCircuit.on('close', () => console.log('Users circuit breaker closed'));
  usersCircuit.on('halfOpen', () => console.log('Users circuit breaker half-open'));

  ordersCircuit.on('open', () => console.log('Orders circuit breaker opened'));
  ordersCircuit.on('close', () => console.log('Orders circuit breaker closed'));
  ordersCircuit.on('halfOpen', () => console.log('Orders circuit breaker half-open'));
});
