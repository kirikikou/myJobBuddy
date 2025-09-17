const crypto = require('crypto');

class DataUtils {
  static paginate(data, page = 1, limit = 10) {
    if (!Array.isArray(data)) return this.createEmptyPagination();
    
    const offset = (page - 1) * limit;
    const total = data.length;
    const paginatedData = data.slice(offset, offset + limit);
    
    return {
      data: paginatedData,
      pagination: {
        page,
        limit,
        offset,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: offset + limit < total,
        hasPrevious: page > 1,
        nextPage: offset + limit < total ? page + 1 : null,
        previousPage: page > 1 ? page - 1 : null
      }
    };
  }

  static createEmptyPagination(page = 1, limit = 10) {
    return {
      data: [],
      pagination: {
        page,
        limit,
        offset: 0,
        total: 0,
        totalPages: 0,
        hasMore: false,
        hasPrevious: false,
        nextPage: null,
        previousPage: null
      }
    };
  }

  static formatDate(date, format = 'ISO') {
    if (!date) return '';
    
    const dateObj = date instanceof Date ? date : new Date(date);
    if (isNaN(dateObj.getTime())) return '';
    
    switch (format) {
      case 'ISO':
        return dateObj.toISOString();
      case 'date':
        return dateObj.toISOString().split('T')[0];
      case 'datetime':
        return dateObj.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
      case 'time':
        return dateObj.toTimeString().split(' ')[0];
      case 'timestamp':
        return dateObj.getTime();
      case 'relative':
        return this.getRelativeTime(dateObj);
      default:
        return dateObj.toISOString();
    }
  }

  static getRelativeTime(date) {
    const now = new Date();
    const diff = now - date;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return 'just now';
  }

  static deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (obj instanceof Array) return obj.map(item => this.deepClone(item));
    if (typeof obj === 'object') {
      const cloned = {};
      Object.keys(obj).forEach(key => {
        cloned[key] = this.deepClone(obj[key]);
      });
      return cloned;
    }
    return obj;
  }

  static mergeObjects(obj1, obj2, options = {}) {
    const { deep = false, overwrite = true } = options;
    
    if (!obj1 || typeof obj1 !== 'object') return deep ? this.deepClone(obj2) : { ...obj2 };
    if (!obj2 || typeof obj2 !== 'object') return deep ? this.deepClone(obj1) : { ...obj1 };
    
    const result = deep ? this.deepClone(obj1) : { ...obj1 };
    
    Object.keys(obj2).forEach(key => {
      if (key in result && !overwrite) return;
      
      if (deep && typeof result[key] === 'object' && typeof obj2[key] === 'object' && 
          !Array.isArray(result[key]) && !Array.isArray(obj2[key])) {
        result[key] = this.mergeObjects(result[key], obj2[key], options);
      } else {
        result[key] = deep ? this.deepClone(obj2[key]) : obj2[key];
      }
    });
    
    return result;
  }

  static hashObject(obj) {
    if (!obj) return '';
    const stringified = JSON.stringify(obj, Object.keys(obj).sort());
    return crypto.createHash('md5').update(stringified).digest('hex');
  }

  static generateId(prefix = '', length = 8) {
    const randomBytes = crypto.randomBytes(Math.ceil(length / 2));
    const id = randomBytes.toString('hex').substring(0, length);
    return prefix ? `${prefix}_${id}` : id;
  }

  static sortArray(array, sortBy, direction = 'asc') {
    if (!Array.isArray(array)) return [];
    
    const sorted = [...array];
    
    sorted.sort((a, b) => {
      let valueA, valueB;
      
      if (typeof sortBy === 'function') {
        valueA = sortBy(a);
        valueB = sortBy(b);
      } else if (typeof sortBy === 'string') {
        valueA = this.getNestedValue(a, sortBy);
        valueB = this.getNestedValue(b, sortBy);
      } else {
        valueA = a;
        valueB = b;
      }
      
      if (valueA == null && valueB == null) return 0;
      if (valueA == null) return direction === 'asc' ? 1 : -1;
      if (valueB == null) return direction === 'asc' ? -1 : 1;
      
      if (typeof valueA === 'string' && typeof valueB === 'string') {
        return direction === 'asc' ? 
          valueA.localeCompare(valueB) : 
          valueB.localeCompare(valueA);
      }
      
      if (valueA < valueB) return direction === 'asc' ? -1 : 1;
      if (valueA > valueB) return direction === 'asc' ? 1 : -1;
      return 0;
    });
    
    return sorted;
  }

  static getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : null;
    }, obj);
  }

  static setNestedValue(obj, path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    
    const target = keys.reduce((current, key) => {
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {};
      }
      return current[key];
    }, obj);
    
    target[lastKey] = value;
    return obj;
  }

  static filterArray(array, filters) {
    if (!Array.isArray(array)) return [];
    if (!filters || typeof filters !== 'object') return array;
    
    return array.filter(item => {
      return Object.entries(filters).every(([key, value]) => {
        const itemValue = this.getNestedValue(item, key);
        
        if (value === null || value === undefined) return true;
        
        if (Array.isArray(value)) {
          return value.includes(itemValue);
        }
        
        if (typeof value === 'object' && value.operator) {
          return this.applyOperator(itemValue, value.operator, value.value);
        }
        
        return itemValue === value;
      });
    });
  }

  static applyOperator(itemValue, operator, filterValue) {
    switch (operator) {
      case 'eq': return itemValue === filterValue;
      case 'ne': return itemValue !== filterValue;
      case 'gt': return itemValue > filterValue;
      case 'gte': return itemValue >= filterValue;
      case 'lt': return itemValue < filterValue;
      case 'lte': return itemValue <= filterValue;
      case 'contains': return String(itemValue).toLowerCase().includes(String(filterValue).toLowerCase());
      case 'startsWith': return String(itemValue).toLowerCase().startsWith(String(filterValue).toLowerCase());
      case 'endsWith': return String(itemValue).toLowerCase().endsWith(String(filterValue).toLowerCase());
      case 'in': return Array.isArray(filterValue) && filterValue.includes(itemValue);
      case 'notIn': return Array.isArray(filterValue) && !filterValue.includes(itemValue);
      default: return itemValue === filterValue;
    }
  }

  static groupBy(array, key) {
    if (!Array.isArray(array)) return {};
    
    return array.reduce((groups, item) => {
      const groupKey = typeof key === 'function' ? key(item) : this.getNestedValue(item, key);
      const groupKeyStr = String(groupKey);
      
      if (!groups[groupKeyStr]) {
        groups[groupKeyStr] = [];
      }
      groups[groupKeyStr].push(item);
      
      return groups;
    }, {});
  }

  static unique(array, key = null) {
    if (!Array.isArray(array)) return [];
    
    if (key) {
      const seen = new Set();
      return array.filter(item => {
        const value = typeof key === 'function' ? key(item) : this.getNestedValue(item, key);
        if (seen.has(value)) return false;
        seen.add(value);
        return true;
      });
    }
    
    return [...new Set(array)];
  }

  static chunk(array, size) {
    if (!Array.isArray(array) || size <= 0) return [];
    
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  static flatten(array, depth = 1) {
    if (!Array.isArray(array)) return [];
    
    return depth > 0 ? 
      array.reduce((acc, val) => 
        acc.concat(Array.isArray(val) ? this.flatten(val, depth - 1) : val), []) :
      array.slice();
  }

  static isEmpty(value) {
    if (value == null) return true;
    if (Array.isArray(value) || typeof value === 'string') return value.length === 0;
    if (typeof value === 'object') return Object.keys(value).length === 0;
    return false;
  }

  static pick(obj, keys) {
    if (!obj || typeof obj !== 'object') return {};
    
    const result = {};
    keys.forEach(key => {
      if (key in obj) {
        result[key] = obj[key];
      }
    });
    return result;
  }

  static omit(obj, keys) {
    if (!obj || typeof obj !== 'object') return {};
    
    const result = { ...obj };
    keys.forEach(key => {
      delete result[key];
    });
    return result;
  }

  static createCacheKey(parts) {
    if (!Array.isArray(parts)) return '';
    return parts.map(part => String(part)).join(':');
  }

  static parseQuery(queryString) {
    if (!queryString || typeof queryString !== 'string') return {};
    
    const params = {};
    const pairs = queryString.replace(/^\?/, '').split('&');
    
    pairs.forEach(pair => {
      if (!pair) return;
      const [key, value] = pair.split('=');
      if (key) {
        params[decodeURIComponent(key)] = value ? decodeURIComponent(value) : '';
      }
    });
    
    return params;
  }

  static buildQuery(params) {
    if (!params || typeof params !== 'object') return '';
    
    const pairs = Object.entries(params)
      .filter(([key, value]) => value != null)
      .map(([key, value]) => 
        `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`
      );
    
    return pairs.length > 0 ? `?${pairs.join('&')}` : '';
  }

  static validatePaginationParams(query, defaults = {}) {
    const {
      defaultLimit = 10,
      maxLimit = 100,
      defaultPage = 1
    } = defaults;
    
    const page = Math.max(1, parseInt(query.page) || defaultPage);
    const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit) || defaultLimit));
    const offset = (page - 1) * limit;
    
    return { page, limit, offset };
  }
}

module.exports = DataUtils;