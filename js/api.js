// js/api.js

const APICache = {
  CACHE_DURATION_MS: 5 * 60 * 1000, // 5 minutes
  
  getKey: function(action, params) {
    // Exclude token from cache key to ensure it's not strictly tied to specific tokens
    // but rather the data request itself. However, team/staffId in params will differentiate it.
    const keyParams = { ...params };
    delete keyParams.token;
    return `api_cache_${action}_${JSON.stringify(keyParams)}`;
  },

  get: function(action, params) {
    const key = this.getKey(action, params);
    const cached = sessionStorage.getItem(key);
    if (!cached) return null;
    
    try {
      const parsed = JSON.parse(cached);
      if (Date.now() - parsed.timestamp > this.CACHE_DURATION_MS) {
        sessionStorage.removeItem(key);
        return null;
      }
      return parsed.data;
    } catch (e) {
      sessionStorage.removeItem(key);
      return null;
    }
  },

  set: function(action, params, data) {
    const key = this.getKey(action, params);
    sessionStorage.setItem(key, JSON.stringify({
      timestamp: Date.now(),
      data: data
    }));
  },

  clearAll: function() {
    Object.keys(sessionStorage).forEach(key => {
      if (key.startsWith('api_cache_')) {
        sessionStorage.removeItem(key);
      }
    });
  }
};

const API = {
  fetchGAS: async function(action, params = {}, method = 'POST') {
    const isReadAction = ['getMembers', 'getPrograms', 'getAttendanceSheet', 'getStats', 'getAllStats', 'getPersonalStats'].includes(action);
    const forceRefresh = params.forceRefresh === true;

    // Return cached data immediately if available and not forced
    if (isReadAction && !forceRefresh) {
      const cachedData = APICache.get(action, params);
      if (cachedData) {
        console.log(`[Cache Hit] ${action}`, cachedData);
        // We simulate a successful API response wrapper
        return { success: true, data: cachedData };
      }
    }

    // Add action to params
    const payload = { action, ...params };
    
    // Get JWT token if exists
    const token = localStorage.getItem('jwt_token');
    
    const options = {
      method: method,
      headers: {
        'Content-Type': method === 'POST' ? 'text/plain;charset=utf-8' : 'application/x-www-form-urlencoded',
      }
    };
    
    if (token) {
      payload.token = token;
    }

    if (method === 'POST') {
      options.body = JSON.stringify(payload);
    }

    let url = CONFIG.GAS_URL;
    if (method === 'GET') {
      const queryStr = new URLSearchParams({ data: JSON.stringify(payload) }).toString();
      url = `${CONFIG.GAS_URL}?${queryStr}`;
    }

    try {
      Utils.showLoading();
      const response = await fetch(url, options);
      const responseData = await response.json();
      Utils.hideLoading();
      
      if (!responseData.success) {
        throw new Error(responseData.message || 'API request failed');
      }
      
      // Clear cache on write operations
      if (!isReadAction) {
        console.log(`[Cache Cleared] due to write action: ${action}`);
        APICache.clearAll();
      } else {
        // Save to cache for read operations
        APICache.set(action, params, responseData.data);
      }
      
      return responseData;
    } catch (error) {
      Utils.hideLoading();
      Utils.showToast(error.message, 'error');
      console.error('API Error:', error);
      throw error;
    }
  }
};
