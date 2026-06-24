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
    if (text.charCodeAt(0) === 0xFEFF) {
      text = text.slice(1);
    }
    
    const result = [];
    let currentRow = [];
    let currentCell = '';
    let inQuotes = false;
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];
      
      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          currentCell += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        currentRow.push(currentCell.trim());
        currentCell = '';
      } else if ((char === '\n' || (char === '\r' && nextChar === '\n')) && !inQuotes) {
        if (char === '\r') i++;
        currentRow.push(currentCell.trim());
        if (currentRow.some(cell => cell !== '')) {
            result.push(currentRow);
        }
        currentRow = [];
        currentCell = '';
      } else {
        if (char !== '\r' || inQuotes) {
          currentCell += char;
        }
      }
    }
    
    if (currentCell || currentRow.length > 0) {
      currentRow.push(currentCell.trim());
      if (currentRow.some(cell => cell !== '')) {
          result.push(currentRow);
      }
    }
    
    if (result.length < 2) return [];
    
    const headers = result[0];
    const parsedData = [];
    
    for (let i = 1; i < result.length; i++) {
      const obj = {};
      const row = result[i];
      for (let j = 0; j < headers.length; j++) {
        obj[headers[j]] = row[j] !== undefined ? row[j] : '';
      }
      parsedData.push(obj);
    }
    return parsedData;
  }
};
