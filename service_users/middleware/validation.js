/**
 * Middleware для валидации входящих данных
 */
const validateRequest = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, { abortEarly: false });
    
    if (error) {
      const errors = error.details.map(detail => detail.message);
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Ошибка валидации',
          details: errors
        }
      });
    }
    
    req.validatedData = value;
    next();
  };
};

/**
 * Middleware для проверки прав доступа
 */
const checkPermissions = (requiredRole) => {
  return (req, res, next) => {
    const userRole = req.headers['x-user-role'];
    const userId = req.headers['x-user-id'];
    
    // Админы имеют доступ ко всему
    if (userRole === 'admin') {
      return next();
    }
    
    // Проверяем требуемую роль
    if (requiredRole && userRole !== requiredRole) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Недостаточно прав'
        }
      });
    }
    
    // Проверяем, что пользователь имеет доступ к своему ресурсу
    if (req.params.userId && req.params.userId !== userId && userRole !== 'admin') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Доступ только к своему профилю'
        }
      });
    }
    
    next();
  };
};

module.exports = {
  validateRequest,
  checkPermissions
};
