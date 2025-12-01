const swaggerUi = require('swagger-ui-express');

// Простая заглушка для Swagger
const swaggerDocument = {
  openapi: '3.0.0',
  info: {
    title: 'API Документация',
    version: '1.0.0',
    description: 'Документация временно недоступна'
  },
  paths: {}
};

const options = {
  explorer: true,
  customSiteTitle: 'API Документация'
};

module.exports = {
  serve: swaggerUi.serve,
  setup: swaggerUi.setup(swaggerDocument, options)
};
