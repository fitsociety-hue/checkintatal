// js/api.js

const API = {
  fetchGAS: async function(action, params = {}, method = 'POST') {
    // Add action to params
    const payload = { action, ...params };
    
    // Get JWT token if exists
    const token = localStorage.getItem('jwt_token');
    
    const options = {
      method: method,
      headers: {
        'Content-Type': 'text/plain;charset=utf-8', // GAS requires text/plain for CORS preflight avoidance sometimes
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
      const data = await response.json();
      Utils.hideLoading();
      
      if (!data.success) {
        throw new Error(data.message || 'API request failed');
      }
      
      return data;
    } catch (error) {
      Utils.hideLoading();
      Utils.showToast(error.message, 'error');
      console.error('API Error:', error);
      throw error;
    }
  }
};
