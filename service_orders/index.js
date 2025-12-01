require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Order, ORDER_STATUS } = require('./models/Order');

const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'Orders service is running',
      timestamp: new Date().toISOString()
    }
  });
});

// Status
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

// Простой маршрут для тестов
app.post('/api/v1/orders', (req, res) => {
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
    
    const order = Order.create({
      userId,
      items: req.body.items || [],
      total: req.body.total || 0,
      description: req.body.description || ''
    });
    
    console.log(`Заказ создан: ${order.id} для пользователя ${userId}`);
    
    res.status(201).json({
      success: true,
      data: order.toJSON()
    });
  } catch (error) {
    console.error('Ошибка создания заказа:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Ошибка при создании заказа'
      }
    });
  }
});

// Получить заказы пользователя
app.get('/api/v1/orders', (req, res) => {
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
    
    const result = Order.findByUserId(userId);
    
    res.json({
      success: true,
      data: result.data.map(order => order.toJSON()),
      pagination: result.pagination
    });
  } catch (error) {
    console.error('Ошибка получения заказов:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Ошибка при получении заказов'
      }
    });
  }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Orders service running on port ${PORT}`);
  console.log('Test orders available');
});
