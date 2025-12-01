require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const CircuitBreaker = require('opossum');
const { authenticateToken, authorizeRoles } = require('./middleware/auth');
const { authLimiter, apiLimiter } = require('./middleware/rateLimit');
const { logger, httpLogger } = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(httpLogger);

// Swagger UI документация - ВРЕМЕННО ОТКЛЮЧЕН
// try {
//   const swagger = require('./middleware/swagger');
//   app.use('/api-docs', swagger.serve, swagger.setup);
//   app.use('/api/v1/docs', swagger.serve, swagger.setup);
//   logger.info('Swagger UI доступен на /api-docs');
// } catch (error) {
//   logger.warn('Swagger UI не загружен:', error.message);
// }

// Просто информационная страница
app.get('/api-docs', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>API Документация</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; }
          h1 { color: #333; }
          .endpoint { background: #f5f5f5; padding: 15px; margin: 10px 0; border-radius: 5px; }
        </style>
      </head>
      <body>
        <h1>API Документация</h1>
        <p>Документация временно недоступна. Используйте следующие endpoints:</p>
        
        <div class="endpoint">
          <strong>POST /api/v1/auth/register</strong> - Регистрация
        </div>
        
        <div class="endpoint">
          <strong>POST /api/v1/auth/login</strong> - Вход
        </div>
        
        <div class="endpoint">
          <strong>GET /api/v1/users/me</strong> - Профиль (требуется токен)
        </div>
        
        <div class="endpoint">
          <strong>POST /api/v1/orders</strong> - Создание заказа (требуется токен)
        </div>
        
        <p>Полная документация: <a href="/docs/openapi.yaml">openapi.yaml</a></p>
      </body>
    </html>
  `);
});

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
      logger.error({ error: error.message, service: serviceName, url }, 'Circuit breaker error');
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

// ==================== PUBLIC ROUTES ====================

app.post('/api/v1/auth/register', authLimiter, async (req, res) => {
  try {
    const user = await usersCircuit.fire(`${USERS_SERVICE_URL}/api/v1/auth/register`, {
      method: 'POST',
      data: req.body,
      headers: {
        'x-request-id': req.headers['x-request-id']
      }
    });
    logger.info({ userId: user.data?.user?.id, email: req.body.email }, 'User registered successfully');
    res.status(201).json(user);
  } catch (error) {
    logger.error({ error: error.message, email: req.body.email }, 'Registration failed');
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Ошибка при регистрации'
      }
    });
  }
});

app.post('/api/v1/auth/login', authLimiter, async (req, res) => {
  try {
    const result = await usersCircuit.fire(`${USERS_SERVICE_URL}/api/v1/auth/login`, {
      method: 'POST',
      data: req.body,
      headers: {
        'x-request-id': req.headers['x-request-id']
      }
    });
    logger.info({ email: req.body.email }, 'User logged in successfully');
    res.json(result);
  } catch (error) {
    logger.error({ error: error.message, email: req.body.email }, 'Login failed');
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Ошибка при входе'
      }
    });
  }
});

// ==================== PROTECTED ROUTES ====================

app.use('/api/v1/users*', authenticateToken);

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
    logger.error({ error: error.message, userId: req.user.userId }, 'Get profile failed');
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Ошибка при получении профиля'
      }
    });
  }
});

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
    logger.info({ userId: req.user.userId }, 'Profile updated');
    res.json(user);
  } catch (error) {
    logger.error({ error: error.message, userId: req.user.userId }, 'Update profile failed');
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Ошибка при обновлении профиля'
      }
    });
  }
});

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
    logger.error({ error: error.message, adminId: req.user.userId }, 'Get users list failed');
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

app.use('/api/v1/orders*', authenticateToken);

app.post('/api/v1/orders', async (req, res) => {
  try {
    const order = await ordersCircuit.fire(`${ORDERS_SERVICE_URL}/api/v1/orders`, {
      method: 'POST',
      data: Object.assign({}, req.body, { userId: req.user.userId }),
      headers: {
        'x-request-id': req.headers['x-request-id'],
        'x-user-id': req.user.userId
      }
    });
    logger.info({ userId: req.user.userId, orderId: order.data?.id }, 'Order created');
    res.status(201).json(order);
  } catch (error) {
    logger.error({ error: error.message, userId: req.user.userId }, 'Create order failed');
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Ошибка при создании заказа'
      }
    });
  }
});

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
    logger.error({ error: error.message, userId: req.user.userId }, 'Get orders failed');
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Ошибка при получении заказов'
      }
    });
  }
});

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
    logger.error({ error: error.message, orderId: req.params.orderId, userId: req.user.userId }, 'Get order failed');
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

app.use('*', (req, res) => {
  logger.warn({ url: req.url, method: req.method }, 'Route not found');
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Маршрут не найден'
    }
  });
});

app.use((err, req, res, next) => {
  logger.error({ error: err.message, stack: err.stack }, 'Unhandled error');
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
  logger.info(`API Gateway running on port ${PORT}`);

  usersCircuit.on('open', () => logger.warn('Users circuit breaker opened'));
  usersCircuit.on('close', () => logger.info('Users circuit breaker closed'));
  usersCircuit.on('halfOpen', () => logger.info('Users circuit breaker half-open'));

  ordersCircuit.on('open', () => logger.warn('Orders circuit breaker opened'));
  ordersCircuit.on('close', () => logger.info('Orders circuit breaker closed'));
  ordersCircuit.on('halfOpen', () => logger.info('Orders circuit breaker half-open'));
});
