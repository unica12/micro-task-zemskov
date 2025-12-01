require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(cors());
app.use(express.json());

// Импортируем наши модули
const { Order, ORDER_STATUS } = require('./models/Order');
const { checkOrderPermission, authorizeRole } = require('./middleware/permissions');
const { 
  createOrderSchema, 
  updateOrderSchema, 
  updateStatusSchema, 
  querySchema, 
  validateRequest 
} = require('./utils/validation');

// Middleware для логирования
app.use((req, res, next) => {
  const requestId = req.headers['x-request-id'] || `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  req.headers['x-request-id'] = requestId;
  console.log(`[${new Date().toISOString()}] [${requestId}] ${req.method} ${req.url}`);
  next();
});

// ==================== ORDER ROUTES ====================

// Создать новый заказ
app.post('/api/v1/orders', validateRequest(createOrderSchema), (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Требуется аутентификация'
        }
      });
    }
    
    const orderData = {
      userId,
      ...req.validatedData
    };
    
    const order = Order.create(orderData);
    
    // Публикация события (заготовка для брокера сообщений)
    console.log(`[DOMAIN_EVENT] OrderCreated: ${order.id} for user ${userId}`);
    
    res.status(201).json({
      success: true,
      data: order.toJSON()
    });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Ошибка при создании заказа'
      }
    });
  }
});

// Получить заказ по ID
app.get('/api/v1/orders/:orderId', checkOrderPermission('read'), (req, res) => {
  try {
    const order = req.order;
    
    res.json({
      success: true,
      data: order.toJSON()
    });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Ошибка при получении заказа'
      }
    });
  }
});

// Получить список заказов текущего пользователя
app.get('/api/v1/orders', validateRequest(querySchema, 'query'), (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    const userRole = req.headers['x-user-role'];
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Требуется аутентификация'
        }
      });
    }
    
    const { page, limit, sortBy, sortOrder, status, dateFrom, dateTo } = req.validatedData;
    
    let result;
    if (userRole === 'admin' || userRole === 'manager') {
      // Админы и менеджеры видят все заказы
      result = Order.findAll(page, limit, { 
        status, 
        dateFrom, 
        dateTo 
      });
    } else {
      // Обычные пользователи и инженеры видят только свои заказы
      result = Order.findByUserId(userId, page, limit, sortBy, sortOrder);
      
      // Фильтрация по статусу для обычных пользователей
      if (status) {
        result.data = result.data.filter(order => order.status === status);
        result.pagination.total = result.data.length;
        result.pagination.totalPages = Math.ceil(result.data.length / limit);
      }
    }
    
    res.json({
      success: true,
      data: result.data.map(order => order.toJSON()),
      pagination: result.pagination
    });
  } catch (error) {
    console.error('Get orders list error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Ошибка при получении списка заказов'
      }
    });
  }
});

// Обновить заказ
app.put('/api/v1/orders/:orderId', 
  checkOrderPermission('update'), 
  validateRequest(updateOrderSchema), 
  (req, res) => {
    try {
      const order = req.order;
      const userRole = req.headers['x-user-role'];
      
      // Проверяем возможность редактирования
      if (order.status !== ORDER_STATUS.CREATED && userRole !== 'admin' && userRole !== 'manager') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'ORDER_LOCKED',
            message: 'Заказ можно редактировать только в статусе "created"'
          }
        });
      }
      
      order.update(req.validatedData);
      
      // Публикация события обновления
      console.log(`[DOMAIN_EVENT] OrderUpdated: ${order.id}`);
      
      res.json({
        success: true,
        data: order.toJSON()
      });
    } catch (error) {
      console.error('Update order error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Ошибка при обновлении заказа'
        }
      });
    }
  }
);

// Обновить статус заказа
app.patch('/api/v1/orders/:orderId/status', 
  checkOrderPermission('update_status'), 
  validateRequest(updateStatusSchema), 
  (req, res) => {
    try {
      const order = req.order;
      const userRole = req.headers['x-user-role'];
      
      order.updateStatus(req.validatedData.status, userRole);
      
      // Публикация события смены статуса
      console.log(`[DOMAIN_EVENT] OrderStatusChanged: ${order.id} -> ${order.status}`);
      
      res.json({
        success: true,
        data: order.toJSON()
      });
    } catch (error) {
      console.error('Update order status error:', error);
      
      if (error.message.includes('Нельзя изменить статус')) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_STATUS_TRANSITION',
            message: error.message
          }
        });
      }
      
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Ошибка при обновлении статуса заказа'
        }
      });
    }
  }
);

// Отменить заказ
app.delete('/api/v1/orders/:orderId', checkOrderPermission('delete'), (req, res) => {
  try {
    const order = req.order;
    const userRole = req.headers['x-user-role'];
    
    // Проверяем возможность отмены
    if (order.status !== ORDER_STATUS.CREATED && 
        userRole !== 'admin' && 
        userRole !== 'manager') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'CANCEL_NOT_ALLOWED',
          message: 'Можно отменять только заказы в статусе "created"'
        }
      });
    }
    
    const deleted = Order.delete(order.id);
    
    if (deleted) {
      console.log(`[DOMAIN_EVENT] OrderCancelled: ${order.id}`);
      res.json({
        success: true,
        data: { message: 'Заказ отменен', order: order.toJSON() }
      });
    } else {
      res.status(400).json({
        success: false,
        error: {
          code: 'CANCEL_FAILED',
          message: 'Не удалось отменить заказ'
        }
      });
    }
  } catch (error) {
    console.error('Cancel order error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Ошибка при отмене заказа'
      }
    });
  }
});

// ==================== HEALTH CHECKS ====================

app.get('/health', (req, res) => {
  const allOrders = Order.findAll();
  res.json({
    success: true,
    data: {
      status: 'Orders service is running',
      timestamp: new Date().toISOString(),
      orderCount: allOrders.pagination.total,
      stats: {
        created: allOrders.data.filter(o => o.status === ORDER_STATUS.CREATED).length,
        in_progress: allOrders.data.filter(o => o.status === ORDER_STATUS.IN_PROGRESS).length,
        completed: allOrders.data.filter(o => o.status === ORDER_STATUS.COMPLETED).length,
        cancelled: allOrders.data.filter(o => o.status === ORDER_STATUS.CANCELLED).length
      }
    }
  });
});

app.get('/api/v1/status', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'Orders service v1 is running',
      version: '1.0.0',
      availableStatuses: Object.values(ORDER_STATUS)
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
  console.log(`Orders service running on port ${PORT}`);
  console.log('Available order statuses:', Object.values(ORDER_STATUS));
  console.log('Test orders created');
});
