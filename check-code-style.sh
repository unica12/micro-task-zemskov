#!/bin/bash
echo "Проверка стиля кода..."
echo "API Gateway:"
cd api_gateway && npx eslint index.js || true
cd ..
echo ""
echo "Сервис пользователей:"
cd service_users && npx eslint index.js || true
cd ..
echo ""
echo "Сервис заказов:"
cd service_orders && npx eslint index.js || true
cd ..
echo ""
echo "Проверка завершена!"
