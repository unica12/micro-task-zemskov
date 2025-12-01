const jwt = require('jsonwebtoken');
require('dotenv').config();

/**
 * Генерация JWT токена
 */
const generateToken = (user) => {
  const payload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    name: user.name
  };

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '24h'
  });
};

/**
 * Валидация данных пользователя
 */
const validateUserData = (userData) => {
  const errors = [];

  if (!userData.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userData.email)) {
    errors.push('Некорректный email');
  }

  if (!userData.name || userData.name.trim().length < 2) {
    errors.push('Имя должно содержать минимум 2 символа');
  }

  if (!userData.password) {
    errors.push('Пароль обязателен');
  }

  const allowedRoles = ['user', 'engineer', 'manager', 'admin'];
  if (userData.role && !allowedRoles.includes(userData.role)) {
    errors.push(`Роль должна быть одной из: ${allowedRoles.join(', ')}`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

module.exports = {
  generateToken,
  validateUserData
};
