const rateLimit = require('express-rate-limit');

// Лимит запросов для аутентификации
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 10, // максимум 10 запросов
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Слишком много попыток входа. Попробуйте позже.'
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Общий лимит запросов
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 100, // максимум 100 запросов
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Слишком много запросов. Попробуйте позже.'
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  authLimiter,
  apiLimiter
};
