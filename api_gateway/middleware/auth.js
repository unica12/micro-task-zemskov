const jwt = require('jsonwebtoken');
require('dotenv').config();

/**
 * Middleware для проверки JWT токена
 */
const authenticateToken = (req, res, next) => {
  // Получаем токен из заголовка Authorization
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Формат: Bearer TOKEN

  if (!token) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Требуется аутентификация'
      }
    });
  }

  try {
    // Проверяем токен
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Добавляем данные пользователя в объект запроса
    req.user = decoded;
    
    // Прокидываем ID пользователя в заголовки для микросервисов
    req.headers['x-user-id'] = decoded.userId;
    req.headers['x-user-role'] = decoded.role;
    
    next();
  } catch (error) {
    console.error('JWT verification error:', error.message);
    
    let errorCode = 'INVALID_TOKEN';
    let errorMessage = 'Неверный токен';
    
    if (error.name === 'TokenExpiredError') {
      errorCode = 'TOKEN_EXPIRED';
      errorMessage = 'Токен истек';
    } else if (error.name === 'JsonWebTokenError') {
      errorCode = 'INVALID_TOKEN';
      errorMessage = 'Неверный формат токена';
    }
    
    return res.status(401).json({
      success: false,
      error: {
        code: errorCode,
        message: errorMessage
      }
    });
  }
};

/**
 * Middleware для проверки ролей
 */
const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Требуется аутентификация'
        }
      });
    }

    const userRole = req.user.role;
    
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Недостаточно прав'
        }
      });
    }
    
    next();
  };
};

module.exports = {
  authenticateToken,
  authorizeRoles
};
