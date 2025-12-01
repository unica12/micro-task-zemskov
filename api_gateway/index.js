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

// Остальной код оставляем как есть...
// Продолжение файла не меняем
