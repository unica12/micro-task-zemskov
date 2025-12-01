#!/bin/bash
echo "=== Тестирование Users Service API ==="
echo ""

echo "1. Регистрация нового пользователя:"
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"testapi@example.com","password":"test123","name":"API Тест"}'
echo ""
echo "---"

echo "2. Вход пользователя (получение токена):"
TOKEN_RESPONSE=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"testapi@example.com","password":"test123"}')
echo $TOKEN_RESPONSE
echo ""
echo "---"

# Извлекаем токен из ответа
TOKEN=$(echo $TOKEN_RESPONSE | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -n "$TOKEN" ]; then
  echo "3. Получение профиля с токеном:"
  curl -X GET http://localhost:8000/api/v1/users/me \
    -H "Authorization: Bearer $TOKEN"
  echo ""
  echo "---"
  
  echo "4. Обновление профиля:"
  curl -X PUT http://localhost:8000/api/v1/users/me \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"name":"Обновленное имя"}'
  echo ""
  echo "---"
else
  echo "❌ Не удалось получить токен"
fi

echo "5. Вход администратора:"
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"password123"}'
echo ""
