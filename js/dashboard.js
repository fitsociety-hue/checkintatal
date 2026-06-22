// js/dashboard.js

document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.requireAuth()) return;
  Auth.updateUserUI();

  const user = Auth.getUser();
  const container = document.getElementById('dashboard-content');
  
  if (user.role === '관리자') {
    renderAdminDashboard(container);
  } else if (user.role === '팀장') {
    renderLeaderDashboard(container, user.team);
  } else {
    renderStaffDashboard(container, user);
  }
});

async function renderAdminDashboard(container) {
  container.innerHTML = `
    <h2 class="mb-3">관리자 대시보드</h2>
    <div class="grid-cards mb-3" id="admin-summary">
      <div class="glass-card stat-card"><div class="spinner"></div></div>
    </div>
    <div class="glass-card mb-3">
      <h3 class="mb-2">팀별 달성률 (평균)</h3>
      <canvas id="admin-chart"></canvas>
    </div>
  `;
  
  try {
    const res = await API.fetchGAS('getAllStats');
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

async function renderLeaderDashboard(container, teamName) {
  container.innerHTML = `
    <h2 class="mb-3">${teamName} 대시보드</h2>
    <div class="grid-cards mb-3" id="leader-summary">
      <div class="glass-card stat-card"><div class="spinner"></div></div>
    </div>
  `;
  // Similar logic fetching team stats...
  try {
    const res = await API.fetchGAS('getStats', { teamName });
    const stats = res.data || { real: 0, accum: 0, count: 0, rate: 0 };
    document.getElementById('leader-summary').innerHTML = `
      <div class="glass-card stat-card">
        <h3>팀 실인원</h3>
        <div class="value">${Utils.formatNumber(stats.real)}명</div>
      </div>
      <div class="glass-card stat-card">
        <h3>팀 연인원</h3>
        <div class="value">${Utils.formatNumber(stats.accum)}명</div>
      </div>
      <div class="glass-card stat-card">
        <h3>팀 달성률</h3>
        <div class="value">${stats.rate}%</div>
        <div class="progress-container"><div class="progress-bar" style="width: ${stats.rate}%"></div></div>
      </div>
    `;
  } catch(e){}
}

async function renderStaffDashboard(container, user) {
  container.innerHTML = `
    <h2 class="mb-3">환영합니다, ${user.name}님!</h2>
    <div class="glass-card mb-3">
      <h3 class="mb-2">내 담당 사업 (빠른 이동)</h3>
      <div class="grid-cards" id="staff-programs">
        <p>담당 사업을 불러오는 중...</p>
      </div>
    </div>
  `;
  try {
    const res = await API.fetchGAS('getPersonalStats', { staffId: user.staffId });
    const programs = res.data.programs || [];
    const progsDiv = document.getElementById('staff-programs');
    if (programs.length === 0) {
      progsDiv.innerHTML = '<p>담당 사업이 없습니다.</p>';
    } else {
      progsDiv.innerHTML = programs.map(p => `
        <div class="glass-card flex justify-between items-center" style="padding: 16px; cursor: pointer;" onclick="window.location.href='attendance.html?programId=${p.사업ID}'">
          <div>
            <div class="badge badge-primary mb-1">${p.실적유형}</div>
            <h4 style="margin:0">${p.사업명}</h4>
          </div>
          <button class="btn-secondary">출석체크</button>
        </div>
      `).join('');
    }
  } catch(e) {}
}
