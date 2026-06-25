// js/auth.js

const Auth = {
  login: async function(team, name, password) {
    try {
      const result = await API.fetchGAS('login', { team, name, password });
      if (result.success && result.data.token) {
        localStorage.setItem('jwt_token', result.data.token);
        localStorage.setItem('user_info', JSON.stringify(result.data.user));
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  },

  register: async function(team, name, password, role) {
    try {
      const result = await API.fetchGAS('register', { team, name, password, role });
      if (result.success) {
        Utils.showToast('회원가입이 완료되었습니다. 로그인해주세요.', 'success');
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  },

  logout: function() {
    localStorage.removeItem('jwt_token');
    localStorage.removeItem('user_info');
    window.location.href = 'index.html';
  },

  getUser: function() {
    const userStr = localStorage.getItem('user_info');
    if (!userStr) return null;
    try {
      return JSON.parse(userStr);
    } catch (e) {
      return null;
    }
  },

  updateUserInfo: function(updates) {
    const user = this.getUser();
    if (user) {
      const updatedUser = { ...user, ...updates };
      localStorage.setItem('user_info', JSON.stringify(updatedUser));
    }
  },

  requireAuth: function() {
    const token = localStorage.getItem('jwt_token');
    const user = this.getUser();
    if (!token || !user || !user.name) {
      this.logout();
      return false;
    }
    return true;
  },

  hasRole: function(role) {
    const user = this.getUser();
    if (!user) return false;
    // roles could be: '관리자', '팀장', '팀원'
    // If admin is required, only admin passes.
    // If team_leader is required, admin and team_leader passes.
    if (user.role === '관리자') return true;
    if (role === '팀장' && user.role === '팀장') return true;
    if (role === '팀원') return true; // everyone else (if authenticated)
    return false;
  },
  
  updateUserUI: function() {
    const user = this.getUser();
    if (user) {
      const nameEl = document.getElementById('topbar-user-name');
      const teamEl = document.getElementById('topbar-team-name');
      if(nameEl) nameEl.textContent = user.name + ' (' + user.role + ')';
      if(teamEl) teamEl.textContent = user.team;
    }
  }
};
