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

    // Add Report UI
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    
    let yearOptions = '';
    for(let y=currentYear-1; y<=currentYear+1; y++) {
      yearOptions += `<option value="${y}" ${y===currentYear?'selected':''}>${y}년</option>`;
    }
    
    let monthOptions = '';
    for(let m=1; m<=12; m++) {
      monthOptions += `<option value="${m}" ${m===currentMonth?'selected':''}>${m}월</option>`;
    }

    container.innerHTML += `
      <div class="glass-card mb-3">
        <h3 class="mb-2">월별 실적 보고서 작성</h3>
        <div class="flex gap-2 items-center mb-3">
          <select id="report-year" class="form-select" style="max-width: 100px;">${yearOptions}</select>
          <select id="report-month" class="form-select" style="max-width: 100px;">${monthOptions}</select>
        </div>
        <div class="grid-cards" style="grid-template-columns: 1fr 1fr; gap: 16px;">
          <div>
            <label class="form-label" style="font-weight: bold; margin-bottom: 4px; display: block;">실적 총평</label>
            <textarea id="report-performance" class="form-input" rows="4" placeholder="해당 월의 전반적인 실적 평가를 작성하세요."></textarea>
          </div>
          <div>
            <label class="form-label" style="font-weight: bold; margin-bottom: 4px; display: block;">예산 (세입/세출)</label>
            <textarea id="report-budget" class="form-input" rows="4" placeholder="예산 집행 내역 및 특이사항을 작성하세요."></textarea>
          </div>
          <div>
            <label class="form-label" style="font-weight: bold; margin-bottom: 4px; display: block;">성과 (특이사항)</label>
            <textarea id="report-achievements" class="form-input" rows="4" placeholder="주요 성과 및 특이사항을 작성하세요."></textarea>
          </div>
          <div>
            <label class="form-label" style="font-weight: bold; margin-bottom: 4px; display: block;">향후 계획</label>
            <textarea id="report-plans" class="form-input" rows="4" placeholder="다음 달 주요 계획을 작성하세요."></textarea>
          </div>
        </div>
        <div class="mt-3" style="text-align: right;">
          <button class="btn-success" onclick="downloadLeaderReport('${teamName}')">엑셀 보고서 다운로드</button>
        </div>
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

window.downloadLeaderReport = async function(teamName) {
  const btn = event.currentTarget;
  const originalText = btn.textContent;
  btn.textContent = '생성 중...';
  btn.disabled = true;

  try {
    const year = document.getElementById('report-year').value;
    const month = document.getElementById('report-month').value;
    
    const res = await API.fetchGAS('getStats', { teamName, year, periodType: 'month', periodValue: month });
    const stats = res.data;
    
    if (!stats || !stats.programs || stats.programs.length === 0) {
      Utils.showToast('해당 월의 실적 데이터가 없습니다.', 'warning');
      return;
    }

    let targetReal = 0, actualReal = 0;
    let targetCount = 0, actualCount = 0;
    let targetAccum = 0, actualAccum = 0;
    
    stats.programs.forEach(p => {
      targetReal += p.목표_실인원 || 0;
      actualReal += p.실인원 || 0;
      targetCount += p.목표_건수 || 0;
      actualCount += p.건수 || 0;
      targetAccum += p.목표_연인원 || 0;
      actualAccum += p.연인원 || 0;
    });

    const rateReal = targetReal > 0 ? Math.round((actualReal / targetReal) * 100) : 0;
    const rateCount = targetCount > 0 ? Math.round((actualCount / targetCount) * 100) : 0;
    const rateAccum = targetAccum > 0 ? Math.round((actualAccum / targetAccum) * 100) : 0;

    const tPerf = document.getElementById('report-performance').value || '';
    const tBudget = document.getElementById('report-budget').value || '';
    const tAchieve = document.getElementById('report-achievements').value || '';
    const tPlans = document.getElementById('report-plans').value || '';

    const wb = XLSX.utils.book_new();

    const summaryData = [
      [`${teamName} ${year}년 ${month}월 실적 보고서`],
      [],
      ['■ 팀 실적 요약 (목표 대비 실적)'],
      ['구분', '목표', '실적', '달성률(%)'],
      ['실인원', targetReal, actualReal, rateReal],
      ['건수', targetCount, actualCount, rateCount],
      ['연인원', targetAccum, actualAccum, rateAccum],
      [],
      ['■ 월간 총평 및 항목별 보고'],
      ['항목', '내용'],
      ['실적 총평', tPerf],
      ['예산(세입/세출)', tBudget],
      ['성과(특이사항)', tAchieve],
      ['향후 계획', tPlans]
    ];

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    wsSummary['!cols'] = [{wch: 15}, {wch: 80}, {wch: 15}, {wch: 15}];
    XLSX.utils.book_append_sheet(wb, wsSummary, '보고서 요약');

    const detailedData = stats.programs.map(p => ({
      '팀명': p.팀명,
      '사업명': p.사업명,
      '목표_실인원': p.목표_실인원,
      '목표_건수': p.목표_건수,
      '목표_연인원': p.목표_연인원,
      '실적_실인원': p.실인원,
      '실적_건수': p.건수,
      '실적_연인원': p.연인원,
      '달성률_실인원(%)': p.목표대비_실인원,
      '달성률_건수(%)': p.목표대비_건수,
      '달성률_연인원(%)': p.목표대비_연인원
    }));

    const wsDetail = XLSX.utils.json_to_sheet(detailedData);
    XLSX.utils.book_append_sheet(wb, wsDetail, '사업별 상세 실적');

    XLSX.writeFile(wb, `월별실적보고서_${teamName}_${year}년${month}월.xlsx`);

  } catch(e) {
    Utils.showToast('보고서 생성 중 오류가 발생했습니다.', 'error');
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
};

