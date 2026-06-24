// js/dashboard.js

document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.requireAuth()) return;
  Auth.updateUserUI();

  const user = Auth.getUser();
  const container = document.getElementById('dashboard-content');
  
  window.refreshDashboard = function(forceRefresh = false) {
    if (user.role === '관리자') {
      renderAdminDashboard(container, forceRefresh);
    } else if (user.role === '팀장') {
      renderLeaderDashboard(container, user.team, forceRefresh);
    } else {
      renderStaffDashboard(container, user, forceRefresh);
    }
  };
  
  window.refreshDashboard();
});

async function renderAdminDashboard(container, forceRefresh = false) {
  container.innerHTML = `
    <div class="flex justify-between items-center mb-3">
      <h2 style="margin:0;">관리자 대시보드</h2>
      <button class="btn-secondary" onclick="window.refreshDashboard(true)" style="padding: 6px 12px; font-size: 0.9em;">새로고침</button>
    </div>
    <div class="grid-cards mb-3" id="admin-summary">
      <div class="glass-card stat-card"><div class="spinner"></div></div>
    </div>
    <div class="glass-card mb-3">
      <h3 class="mb-2">관리자 설정</h3>
      <div class="flex gap-2 items-center mt-2">
        <input type="password" id="new-admin-pw" class="form-input" placeholder="새 관리자 비밀번호" style="max-width:200px;">
        <button class="btn-primary" onclick="changeAdminPassword()">비밀번호 변경</button>
      </div>
    </div>
    <div class="glass-card mb-3">
      <h3 class="mb-2">팀별 달성률 (평균)</h3>
      <canvas id="admin-chart"></canvas>
    </div>
  `;
  
  try {
    const res = await API.fetchGAS('getAllStats', forceRefresh ? { forceRefresh: true } : {});
    const stats = res.data; // assume it returns aggregated stats
    
    const summaryHtml = `
      <div class="glass-card stat-card">
        <h3>전체 실인원 합계</h3>
        <div class="value">${Utils.formatNumber(stats.totalRealCount)}명</div>
      </div>
      <div class="glass-card stat-card">
        <h3>전체 연인원 합계</h3>
        <div class="value">${Utils.formatNumber(stats.totalAccumCount)}명</div>
      </div>
      <div class="glass-card stat-card">
        <h3>전체 건수 합계</h3>
        <div class="value">${Utils.formatNumber(stats.totalItemCount)}건</div>
      </div>
      <div class="glass-card stat-card">
        <h3>전체 달성률 (평균)</h3>
        <div class="value">${stats.avgAchieveRate || 0}%</div>
      </div>
    `;
    document.getElementById('admin-summary').innerHTML = summaryHtml;
    
    // Chart
    if (stats.teamStats && stats.teamStats.length > 0) {
      const ctx = document.getElementById('admin-chart').getContext('2d');
      new Chart(ctx, {
        type: 'bar',
        data: {
          labels: stats.teamStats.map(t => t.team),
          datasets: [{
            label: '팀별 평균 달성률 (%)',
            data: stats.teamStats.map(t => t.rate),
            backgroundColor: 'rgba(59, 130, 246, 0.5)',
            borderColor: 'rgba(59, 130, 246, 1)',
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          scales: { y: { beginAtZero: true, max: 100 } }
        }
      });
    }
  } catch (e) {
    document.getElementById('admin-summary').innerHTML = '<p>데이터를 불러오지 못했습니다.</p>';
  }
}

async function renderLeaderDashboard(container, teamName, forceRefresh = false) {
  container.innerHTML = `
    <div class="flex justify-between items-center mb-3">
      <h2 style="margin:0;">${teamName} 대시보드</h2>
      <button class="btn-secondary" onclick="window.refreshDashboard(true)" style="padding: 6px 12px; font-size: 0.9em;">새로고침</button>
    </div>
    <div class="grid-cards mb-3" id="leader-summary">
      <div class="glass-card stat-card"><div class="spinner"></div></div>
    </div>
  `;
  try {
    const params = { teamName };
    if (forceRefresh) params.forceRefresh = true;
    const res = await API.fetchGAS('getStats', params);
    const stats = res.data || { real: 0, accum: 0, count: 0, rate: 0 };
    document.getElementById('leader-summary').innerHTML = `
      <div class="glass-card stat-card">
        <h3>팀 실인원</h3>
        <div class="value">${Utils.formatNumber(stats.real)}명</div>
      </div>
      <div class="glass-card stat-card">
        <h3>팀 건수</h3>
        <div class="value">${Utils.formatNumber(stats.count)}건</div>
      </div>
      <div class="glass-card stat-card">
        <h3>팀 연인원</h3>
        <div class="value">${Utils.formatNumber(stats.accum)}명</div>
      </div>
      <div class="glass-card stat-card">
        <h3>팀 달성률</h3>
        <div class="value">${stats.rate}%</div>
        <div class="progress-container"><div class="progress-bar" style="width: ${Math.min(stats.rate, 100)}%"></div></div>
      </div>
    `;
  } catch(e){}
}

async function renderStaffDashboard(container, user, forceRefresh = false) {
  container.innerHTML = `
    <div class="flex justify-between items-center mb-3">
      <h2 style="margin:0;">환영합니다, ${user.name}님!</h2>
      <button class="btn-secondary" onclick="window.refreshDashboard(true)" style="padding: 6px 12px; font-size: 0.9em;">새로고침</button>
    </div>
    <div class="glass-card mb-3">
      <h3 class="mb-2">내 담당 사업 (빠른 이동)</h3>
      <div class="grid-cards" id="staff-programs">
        <p>담당 사업을 불러오는 중...</p>
      </div>
    </div>
  `;
  try {
    const params = { staffId: user.staffId };
    if (forceRefresh) params.forceRefresh = true;
    const res = await API.fetchGAS('getPersonalStats', params);
    const programs = res.data.programs || [];
    const progsDiv = document.getElementById('staff-programs');
    if (programs.length === 0) {
      progsDiv.innerHTML = '<p>담당 사업이 없습니다.</p>';
    } else {
      progsDiv.innerHTML = programs.map(p => `
        <div class="glass-card flex justify-between items-center" style="padding: 16px; cursor: pointer; margin-bottom: 8px;" onclick="window.location.href='attendance.html?programName=${encodeURIComponent(p.사업명)}'">
          <div style="flex: 1;">
            <div class="badge badge-primary mb-1">${p.subCategory || p.parentName || p.실적유형}</div>
            <h4 style="margin:0">${p.사업명}</h4>
          </div>
          <div style="margin-right: 16px; text-align: right;">
            <span class="text-muted" style="font-size: 0.9em;">달성율</span>
            <div style="font-size: 1.2em; font-weight: bold; color: var(--primary);">${p.mainRate || 0}%</div>
          </div>
          <button class="btn-secondary">출석체크</button>
        </div>
      `).join('');
    }
  } catch(e) {}
}

window.changeAdminPassword = async function() {
  const newPw = document.getElementById('new-admin-pw').value;
  if (!newPw) {
    Utils.showToast('새 비밀번호를 입력하세요.', 'error');
    return;
  }
  try {
    await API.fetchGAS('updateAdminPassword', { newPassword: newPw });
    Utils.showToast('관리자 비밀번호가 변경되었습니다.', 'success');
    document.getElementById('new-admin-pw').value = '';
  } catch(e) {
    Utils.showToast('비밀번호 변경에 실패했습니다.', 'error');
  }
}
