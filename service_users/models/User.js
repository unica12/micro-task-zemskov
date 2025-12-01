const { v4: uuidv4 } = require('uuid');

// Имитация базы данных в памяти
const usersDB = new Map();

class User {
  constructor({ email, password, name, role = 'user' }) {
    this.id = uuidv4();
    this.email = email;
    this.password = password; // Хешированный пароль
    this.name = name;
    this.role = role;
    this.createdAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
  }

  static create(userData) {
    const user = new User(userData);
    usersDB.set(user.id, user);
    return user;
  }

  static findById(id) {
    return usersDB.get(id);
  }

  static findByEmail(email) {
    return Array.from(usersDB.values()).find(user => user.email === email);
  }

  static findAll(page = 1, limit = 10, filters = {}) {
    let users = Array.from(usersDB.values());
    
    // Применяем фильтры
    if (filters.role) {
      users = users.filter(user => user.role === filters.role);
    }
    if (filters.search) {
      const search = filters.search.toLowerCase();
      users = users.filter(user => 
        user.name.toLowerCase().includes(search) || 
        user.email.toLowerCase().includes(search)
      );
    }
    
    // Пагинация
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const paginatedUsers = users.slice(startIndex, endIndex);
    
    return {
      data: paginatedUsers,
      pagination: {
        page,
        limit,
        total: users.length,
        totalPages: Math.ceil(users.length / limit),
        hasNext: endIndex < users.length,
        hasPrev: page > 1
      }
    };
  }

  update(updates) {
    Object.keys(updates).forEach(key => {
      if (key !== 'id' && key !== 'createdAt' && this[key] !== undefined) {
        this[key] = updates[key];
      }
    });
    this.updatedAt = new Date().toISOString();
    return this;
  }

  static delete(id) {
    return usersDB.delete(id);
  }

  toJSON() {
    return {
      id: this.id,
      email: this.email,
      name: this.name,
      role: this.role,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

// Создаем начальных пользователей для тестов
const adminUser = User.create({
  email: 'admin@example.com',
  password: '$2a$10$YourHashedPasswordHere', // будет заменено при запуске
  name: 'Администратор',
  role: 'admin'
});

const managerUser = User.create({
  email: 'manager@example.com',
  password: '$2a$10$YourHashedPasswordHere',
  name: 'Менеджер',
  role: 'manager'
});

const engineerUser = User.create({
  email: 'engineer@example.com',
  password: '$2a$10$YourHashedPasswordHere',
  name: 'Инженер',
  role: 'engineer'
});

module.exports = User;
