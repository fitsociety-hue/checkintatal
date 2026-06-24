// js/programs_page.js

let allPrograms = [];
let currentTab = '전체';

document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.requireAuth()) return;
  Auth.updateUserUI();

  await loadPrograms();
  renderTabs();

  document.getElementById('program-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveProgram();
  });

  document.getElementById('csv-upload-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target.result;
      const parsed = Utils.parseCSV(text);
      if (parsed.length > 0) {
        try {
          await API.fetchGAS('importProgramsCSV', { csvData: parsed });
          Utils.showToast(`${parsed.length}건의 사업이 업로드되었습니다.`, 'success');
          await loadPrograms();
        } catch (err) { }
      }
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = ''; 
  });
});

async function loadPrograms() {
  try {
    const user = Auth.getUser();
    const team = user.role === '관리자' ? '' : user.team;
    allPrograms = await ProgramsLogic.loadTeamPrograms(team);
    renderGrid();
  } catch(e) {
    document.getElementById('programs-grid').innerHTML = '<p>데이터를 불러오지 못했습니다.</p>';
  }
}

function renderTabs() {
  const tabsDiv = document.getElementById('team-tabs');
  const user = Auth.getUser();
  
  let tabs = [];
  if (user.role === '관리자') {
    tabs = ['전체', ...ProgramsLogic.teams];
  } else {
    tabs = [user.team];
    currentTab = user.team;
  }

  tabsDiv.innerHTML = tabs.map(t => 
    `<button class="btn-${currentTab === t ? 'primary' : 'secondary'}" onclick="setTab('${t}')">${t}</button>`
  ).join('');
}

window.setTab = function(tab) {
  currentTab = tab;
  renderTabs();
  renderGrid();
}

function renderGrid() {
  const grid = document.getElementById('programs-grid');
  let filtered = allPrograms;
  if (currentTab !== '전체') {
    filtered = allPrograms.filter(p => p.팀명 === currentTab);
  }

  if (filtered.length === 0) {
    grid.innerHTML = '<p>등록된 사업이 없습니다.</p>';
    return;
  }

  grid.innerHTML = filtered.map(p => `
    <div class="glass-card">
      <div class="flex justify-between items-start mb-2">
        <h4 style="margin:0">${p.사업명}</h4>
        <span class="badge ${p.상태 === '활성' ? 'badge-success' : 'badge-warning'}">${p.상태 || '활성'}</span>
      </div>
      <div class="mb-2">
        <span class="badge badge-primary">${p.실적유형}</span>
        <span class="text-sub" style="font-size: 12px; margin-left: 8px;">${p.팀명}</span>
        ${p.담당자 ? `<span class="text-sub" style="font-size: 12px; margin-left: 8px;">담당: ${p.담당자}</span>` : ''}
      </div>
      
      <div class="mt-3 text-right">
        <button class="btn-ghost" onclick="editProgram('${p.사업ID}')">수정</button>
      </div>
    </div>
  `).join('');
}

window.openProgramModal = function() {
  document.getElementById('modal-title').textContent = '사업 추가';
  document.getElementById('program-form').reset();
  document.getElementById('original-id').value = '';
  document.getElementById('program-modal').classList.add('active');
}

window.closeProgramModal = function() {
  document.getElementById('program-modal').classList.remove('active');
}

window.editProgram = function(id) {
  const p = allPrograms.find(x => x.사업ID === id);
  if (!p) return;
  
  document.getElementById('modal-title').textContent = '사업 수정';
  document.getElementById('original-id').value = p.사업ID;
  document.getElementById('prog-team').value = p.팀명;
  document.getElementById('prog-cat1').value = p.사업분류;
  document.getElementById('prog-cat2').value = p.세부사업분류;
  document.getElementById('prog-name').value = p.사업명;
  document.getElementById('prog-type').value = p.실적유형;
  document.getElementById('prog-goal-real').value = p.목표_실인원 || 0;
  document.getElementById('prog-goal-accum').value = p.목표_연인원 || 0;
  document.getElementById('prog-goal-count').value = p.목표_건수 || 0;
  document.getElementById('prog-status').value = p.상태 || '활성';
  document.getElementById('prog-manager').value = p.담당자 || '';
  
  document.getElementById('program-modal').classList.add('active');
}

async function saveProgram() {
  const isEdit = document.getElementById('original-id').value;
  const data = {
    팀명: document.getElementById('prog-team').value,
    사업분류: document.getElementById('prog-cat1').value,
    세부사업분류: document.getElementById('prog-cat2').value,
    사업명: document.getElementById('prog-name').value,
    실적유형: document.getElementById('prog-type').value,
    목표_실인원: parseInt(document.getElementById('prog-goal-real').value, 10),
    목표_연인원: parseInt(document.getElementById('prog-goal-accum').value, 10),
    목표_건수: parseInt(document.getElementById('prog-goal-count').value, 10),
    상태: document.getElementById('prog-status').value,
    담당자: document.getElementById('prog-manager').value
  };

  try {
    if (isEdit) {
      await API.fetchGAS('updateProgram', { programId: isEdit, data });
      Utils.showToast('수정되었습니다.', 'success');
    } else {
      await API.fetchGAS('addProgram', { data });
      Utils.showToast('추가되었습니다.', 'success');
    }
    closeProgramModal();
    await loadPrograms();
  } catch (e) {}
}

window.downloadProgramsCSV = function() {
  if (allPrograms.length === 0) {
    Utils.showToast('다운로드할 사업 데이터가 없습니다.', 'error');
    return;
  }

  const headers = ['팀명', '사업분류', '세부사업분류', '사업명', '실적유형', '상태', '목표_건수', '목표_실인원', '목표_연인원'];
  const escapeCSV = (val) => {
    const str = String(val == null ? '' : val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  };

  let csv = headers.map(escapeCSV).join(',') + '\n';
  allPrograms.forEach(p => {
    csv += [
      p.팀명,
      p.사업분류,
      p.세부사업분류,
      p.사업명,
      p.실적유형,
      p.상태 || '활성',
      p.목표_건수 || 0,
      p.목표_실인원 || 0,
      p.목표_연인원 || 0
    ].map(escapeCSV).join(',') + '\n';
  });

  // BOM(Byte Order Mark)을 앞에 추가하여 엑셀에서 한글 깨짐 방지
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const today = Utils.formatDate(new Date());
  link.href = url;
  link.download = `사업목록_${today}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  Utils.showToast('CSV 파일이 다운로드되었습니다.', 'success');
}
