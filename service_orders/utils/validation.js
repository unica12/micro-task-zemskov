const Joi = require('joi');

// Схема для создания заказа
const createOrderSchema = Joi.object({
  items: Joi.array().items(
    Joi.object({
      product: Joi.string().min(1).required(),
      quantity: Joi.number().min(1).required(),
      price: Joi.number().min(0).required()
    })
  ).min(1).required(),
  description: Joi.string().max(500),
  total: Joi.number().min(0).optional()
}).options({ stripUnknown: true });

// Схема для обновления заказа
const updateOrderSchema = Joi.object({
  items: Joi.array().items(
    Joi.object({
      product: Joi.string().min(1).required(),
      quantity: Joi.number().min(1).required(),
      price: Joi.number().min(0).required()
    })
  ).min(1),
  description: Joi.string().max(500),
  status: Joi.string().valid('created', 'in_progress', 'completed', 'cancelled'),
  total: Joi.number().min(0)
}).min(1).options({ stripUnknown: true });

// Схема для обновления статуса
const updateStatusSchema = Joi.object({
  status: Joi.string().valid('created', 'in_progress', 'completed', 'cancelled').required()
});

// Схема для пагинации и фильтрации
const querySchema = Joi.object({
  page: Joi.number().min(1).default(1),
  limit: Joi.number().min(1).max(100).default(10),
  status: Joi.string().valid('created', 'in_progress', 'completed', 'cancelled'),
  sortBy: Joi.string().valid('createdAt', 'updatedAt', 'total', 'status').default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
  dateFrom: Joi.date().iso(),
  dateTo: Joi.date().iso()
});

/**
 * Middleware для валидации входящих данных
 */
const validateRequest = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], { abortEarly: false });
    
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

module.exports = {
  createOrderSchema,
  updateOrderSchema,
  updateStatusSchema,
  querySchema,
  validateRequest
};
