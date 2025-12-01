#!/bin/bash
echo "=== Тестирование Orders Service API ==="
echo ""

echo "1. Вход пользователя для получения токена:"
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"engineer@example.com","password":"password123"}')
echo $LOGIN_RESPONSE
echo ""
echo "---"

TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -n "$TOKEN" ]; then
  echo "2. Создание заказа:"
  curl -X POST http://localhost:8000/api/v1/orders \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "items": [
        {"product": "Кирпич", "quantity": 100, "price": 50},
        {"product": "Цемент", "quantity": 5, "price": 300}
      ],
      "description": "Тестовый заказ для строительства"
    }'
  echo ""
  echo "---"
  
  echo "3. Получение списка заказов:"
  curl -X GET "http://localhost:8000/api/v1/orders?page=1&limit=5" \
    -H "Authorization: Bearer $TOKEN"
  echo ""
  echo "---"
else
  echo "❌ Не удалось получить токен"
fi

echo "4. Проверка здоровья сервисов:"
curl -X GET http://localhost:8000/health
echo ""
