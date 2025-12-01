const { Order, ROLES } = require('../models/Order');

/**
 * Middleware для проверки прав доступа к заказу
 */
const checkOrderPermission = (action = 'read') => {
  return async (req, res, next) => {
    try {
      const orderId = req.params.orderId;
      const userId = req.headers['x-user-id'];
      const userRole = req.headers['x-user-role'];
      
      if (!orderId) {
        return next();
      }
      
      const order = Order.findById(orderId);
      
      if (!order) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'ORDER_NOT_FOUND',
            message: 'Заказ не найден'
          }
        });
      }
      
      // Проверяем права доступа
      const hasPermission = Order.checkPermission(order, userId, userRole);
      
      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Недостаточно прав для доступа к этому заказу'
          }
        });
      }
      
      // Для обновления статуса нужны дополнительные проверки
      if (action === 'update_status' && req.body.status) {
        try {
          order.updateStatus(req.body.status, userRole);
        } catch (error) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'INVALID_STATUS_CHANGE',
              message: error.message
            }
          });
        }
      }
      
      // Сохраняем заказ в запросе для дальнейшего использования
      req.order = order;
      next();
    } catch (error) {
      console.error('Permission check error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Ошибка при проверке прав доступа'
        }
      });
    }
  };
};

/**
 * Middleware для проверки ролей
 */
const authorizeRole = (...allowedRoles) => {
  return (req, res, next) => {
    const userRole = req.headers['x-user-role'];
    
    if (!userRole || !allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Недостаточно прав. Требуемые роли: ' + allowedRoles.join(', ')
        }
      });
    }
    
    next();
  };
};

module.exports = {
  checkOrderPermission,
  authorizeRole
};
