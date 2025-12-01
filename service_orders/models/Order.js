const { v4: uuidv4 } = require('uuid');

// Имитация базы данных в памяти
const ordersDB = new Map();

// Статусы заказов
const ORDER_STATUS = {
  CREATED: 'created',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
};

// Роли для проверки прав
const ROLES = {
  ENGINEER: 'engineer',
  MANAGER: 'manager',
  ADMIN: 'admin',
  USER: 'user'
};

class Order {
  constructor({ userId, items = [], total = 0, status = ORDER_STATUS.CREATED, description = '' }) {
    this.id = uuidv4();
    this.userId = userId;
    this.items = items; // Массив объектов { product: string, quantity: number, price: number }
    this.total = total || this.calculateTotal(items);
    this.status = status;
    this.description = description;
    this.createdAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
  }

  // Рассчитываем общую сумму
  calculateTotal(items) {
    return items.reduce((sum, item) => {
      return sum + (item.price || 0) * (item.quantity || 1);
    }, 0);
  }

  static create(orderData) {
    const order = new Order(orderData);
    ordersDB.set(order.id, order);
    return order;
  }

  static findById(id) {
    return ordersDB.get(id);
  }

  static findByUserId(userId, page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc') {
    let orders = Array.from(ordersDB.values())
      .filter(order => order.userId === userId);
    
    // Сортировка
    orders.sort((a, b) => {
      const aValue = a[sortBy] || a.createdAt;
      const bValue = b[sortBy] || b.createdAt;
      
      if (sortOrder === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });
    
    // Пагинация
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const paginatedOrders = orders.slice(startIndex, endIndex);
    
    return {
      data: paginatedOrders,
      pagination: {
        page,
        limit,
        total: orders.length,
        totalPages: Math.ceil(orders.length / limit),
        hasNext: endIndex < orders.length,
        hasPrev: page > 1
      }
    };
  }

  static findAll(page = 1, limit = 10, filters = {}) {
    let orders = Array.from(ordersDB.values());
    
    // Фильтрация
    if (filters.userId) {
      orders = orders.filter(order => order.userId === filters.userId);
    }
    if (filters.status) {
      orders = orders.filter(order => order.status === filters.status);
    }
    if (filters.dateFrom) {
      orders = orders.filter(order => new Date(order.createdAt) >= new Date(filters.dateFrom));
    }
    if (filters.dateTo) {
      orders = orders.filter(order => new Date(order.createdAt) <= new Date(filters.dateTo));
    }
    
    // Сортировка по умолчанию
    orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    // Пагинация
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const paginatedOrders = orders.slice(startIndex, endIndex);
    
    return {
      data: paginatedOrders,
      pagination: {
        page,
        limit,
        total: orders.length,
        totalPages: Math.ceil(orders.length / limit),
        hasNext: endIndex < orders.length,
        hasPrev: page > 1
      }
    };
  }

  // Проверка прав доступа
  static checkPermission(order, userId, userRole) {
    // Админ имеет доступ ко всему
    if (userRole === ROLES.ADMIN) return true;
    
    // Менеджер может видеть все заказы и менять статусы
    if (userRole === ROLES.MANAGER) return true;
    
    // Инженер может обновлять статусы на "в работе" или "выполнен"
    if (userRole === ROLES.ENGINEER) {
      return order.userId === userId || 
             ['in_progress', 'completed'].includes(order.status);
    }
    
    // Обычный пользователь - только свои заказы
    return order.userId === userId;
  }

  update(updates) {
    // Обновляем только разрешенные поля
    const allowedFields = ['items', 'total', 'status', 'description'];
    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        this[field] = updates[field];
      }
    });
    
    // Пересчитываем total если изменились items
    if (updates.items) {
      this.total = this.calculateTotal(updates.items);
    }
    
    this.updatedAt = new Date().toISOString();
    return this;
  }

  updateStatus(newStatus, userRole) {
    const validTransitions = {
      [ORDER_STATUS.CREATED]: [ORDER_STATUS.IN_PROGRESS, ORDER_STATUS.CANCELLED],
      [ORDER_STATUS.IN_PROGRESS]: [ORDER_STATUS.COMPLETED, ORDER_STATUS.CANCELLED],
      [ORDER_STATUS.COMPLETED]: [],
      [ORDER_STATUS.CANCELLED]: []
    };

    // Проверяем валидность перехода статуса
    if (!validTransitions[this.status].includes(newStatus)) {
      throw new Error(`Нельзя изменить статус с ${this.status} на ${newStatus}`);
    }

    // Проверяем права для отмены (только владелец или менеджер/админ)
    if (newStatus === ORDER_STATUS.CANCELLED && 
        userRole !== ROLES.MANAGER && 
        userRole !== ROLES.ADMIN) {
      // Только владелец может отменить свой заказ в статусе CREATED
      if (this.status !== ORDER_STATUS.CREATED) {
        throw new Error('Только менеджер или администратор может отменять заказы');
      }
    }

    this.status = newStatus;
    this.updatedAt = new Date().toISOString();
    return this;
  }

  static delete(id) {
    const order = ordersDB.get(id);
    if (order && order.status === ORDER_STATUS.CREATED) {
      ordersDB.delete(id);
      return true;
    }
    return false;
  }

  toJSON() {
    return {
      id: this.id,
      userId: this.userId,
      items: this.items,
      total: this.total,
      status: this.status,
      description: this.description,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

// Создаем тестовые заказы
Order.create({
  userId: 'test-user-id-1',
  items: [
    { product: 'Кирпич', quantity: 100, price: 50 },
    { product: 'Цемент', quantity: 10, price: 300 }
  ],
  total: 8000,
  status: ORDER_STATUS.CREATED,
  description: 'Заказ для стройки объекта А'
});

Order.create({
  userId: 'test-user-id-2',
  items: [
    { product: 'Песок', quantity: 5, price: 1000 },
    { product: 'Щебень', quantity: 3, price: 1500 }
  ],
  total: 9500,
  status: ORDER_STATUS.IN_PROGRESS,
  description: 'Заказ для дорожных работ'
});

Order.create({
  userId: 'test-user-id-1',
  items: [
    { product: 'Краска', quantity: 20, price: 200 },
    { product: 'Кисти', quantity: 5, price: 150 }
  ],
  total: 4750,
  status: ORDER_STATUS.COMPLETED,
  description: 'Заказ для отделочных работ'
});

module.exports = {
  Order,
  ORDER_STATUS,
  ROLES
};
