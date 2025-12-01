# Примеры использования API

## Быстрый старт

### 1. Запуск проекта
\`\`\`bash
make start  # или docker-compose up -d
\`\`\`

### 2. Тестирование API
\`\`\`bash
make test   # запуск всех тестов
\`\`\`

## Основные endpoints

### Аутентификация
\`\`\`bash
# Регистрация
curl -X POST http://localhost:8000/api/v1/auth/register \\
  -H "Content-Type: application/json" \\
  -d '{
    "email": "user@example.com",
    "password": "password123",
    "name": "Иван Иванов",
    "role": "engineer"
  }'

# Вход
curl -X POST http://localhost:8000/api/v1/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{
    "email": "user@example.com",
    "password": "password123"
  }'
\`\`\`

### Работа с заказами
\`\`\`bash
# Создание заказа (требуется токен)
curl -X POST http://localhost:8000/api/v1/orders \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "items": [
      {
        "product": "Кирпич",
        "quantity": 100,
        "price": 50
      }
    ],
    "description": "Заказ для стройки"
  }'

# Получение списка заказов
curl -X GET "http://localhost:8000/api/v1/orders?page=1&limit=10" \\
  -H "Authorization: Bearer YOUR_TOKEN"
\`\`\`

## Тестовые пользователи

Созданы автоматически при запуске:

| Email | Пароль | Роль | Назначение |
|-------|--------|------|------------|
| admin@example.com | password123 | admin | Полный доступ |
| manager@example.com | password123 | manager | Управление заказами |
| engineer@example.com | password123 | engineer | Работа с заказами |

## Мониторинг

\`\`\`bash
# Проверка здоровья
curl http://localhost:8000/health

# Статус API
curl http://localhost:8000/api/v1/status

# Логи
docker-compose logs -f api_gateway
\`\`\`

## Документация

Swagger UI доступен по адресу: http://localhost:8000/api-docs
