// js/utils.js

const Utils = {
  formatDate: function(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  },

  formatNumber: function(num) {
    if (num === null || num === undefined) return '0';
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  },

  showToast: function(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${message}</span>`;
    
    container.appendChild(toast);
    
    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 10);
    
    // Remove after 3 seconds
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  },

  showLoading: function() {
    let spinner = document.getElementById('global-spinner');
    if (!spinner) {
      spinner = document.createElement('div');
      spinner.id = 'global-spinner';
      spinner.className = 'spinner-overlay';
      spinner.innerHTML = '<div class="spinner"></div>';
      document.body.appendChild(spinner);
    }
    spinner.classList.remove('hidden');
  },

  hideLoading: function() {
    const spinner = document.getElementById('global-spinner');
    if (spinner) {
      spinner.classList.add('hidden');
    }
  },

  parseCSV: function(text) {
    const lines = text.split('\n').filter(line => line.trim() !== '');
    if (lines.length === 0) return [];
    
    const headers = lines[0].split(',').map(h => h.trim());
    const result = [];
    
    for (let i = 1; i < lines.length; i++) {
      const obj = {};
      const currentline = lines[i].split(',');
      for (let j = 0; j < headers.length; j++) {
        obj[headers[j]] = currentline[j] ? currentline[j].trim() : '';
      }
      result.push(obj);
    }
    return result;
  }
};
