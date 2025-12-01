const bcrypt = require('bcryptjs');

/**
 * Хеширование пароля
 */
const hashPassword = async (password) => {
  const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 10;
  return await bcrypt.hash(password, saltRounds);
};

/**
 * Проверка пароля
 */
const comparePassword = async (password, hashedPassword) => {
  return await bcrypt.compare(password, hashedPassword);
};

/**
 * Валидация пароля
 */
const validatePassword = (password) => {
  if (!password || password.length < 6) {
    return {
      valid: false,
      error: 'Пароль должен содержать минимум 6 символов'
    };
  }
  return { valid: true };
};

module.exports = {
  hashPassword,
  comparePassword,
  validatePassword
};
