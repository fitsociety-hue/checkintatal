// js/programs.js

const ProgramsLogic = {
  teams: [
    '지역연계팀', '맞춤지원팀', '건강문화팀', 
    '성장지원팀', '전략기획팀', '미래경영팀'
  ],
  
  loadTeamPrograms: async function(teamName = '', forceRefresh = false) {
    try {
      const res = await API.fetchGAS('getPrograms', { teamName, forceRefresh });
      let progs = res.data || [];
      const user = Auth.getUser();
      if (user && user.role !== '관리자' && user.role !== '팀장') {
        const staffName = user.name;
        progs = progs.filter(p => String(p.담당자 || '').includes(staffName));
      }
      return progs;
    } catch (e) {
      return [];
    }
  },
  
  // Renders cascaded dropdowns
  renderProgramDropdowns: function(programs, containerId, onChangeCallback) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    // Group programs by classification
    // program: {팀명, 사업분류, 세부사업분류, 사업명, 실적유형, 상태, 사업ID}
    
    // 세부분류 -> 사업 배열로만 그룹화
    const categories = {};
    programs.forEach(p => {
      const c2 = p.세부사업분류 || '기타';
      if (!categories[c2]) categories[c2] = [];
      categories[c2].push(p);
    });

    container.innerHTML = `
      <div class="grid-cards" style="margin-bottom: 20px;">
        <div>
          <label class="form-label">세부분류</label>
          <select id="sel-cat2" class="form-select">
            <option value="">선택</option>
            ${Object.keys(categories).map(c2 => `<option value="${c2}">${c2}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="form-label">사업명</label>
          <select id="sel-prog" class="form-select" disabled>
            <option value="">선택</option>
          </select>
        </div>
      </div>
    `;
    
    const selCat2 = document.getElementById('sel-cat2');
    const selProg = document.getElementById('sel-prog');

    let currentPrograms = [];

    selCat2.addEventListener('change', (e) => {
      selProg.innerHTML = '<option value="">선택</option>';
      selProg.disabled = true;

      const c2 = e.target.value;
      if (c2 && categories[c2]) {
        currentPrograms = categories[c2];
        currentPrograms.forEach(p => {
          selProg.innerHTML += `<option value="${p.사업ID}">${p.사업명}</option>`;
        });
        selProg.disabled = false;
        
        if (currentPrograms.length === 1) {
          selProg.value = currentPrograms[0].사업ID;
          setTimeout(() => selProg.dispatchEvent(new Event('change')), 0);
        }
      }
      onChangeCallback(null);
    });

    selProg.addEventListener('change', (e) => {
      const pid = e.target.value;
      if (pid) {
        const selectedP = currentPrograms.find(p => p.사업ID === pid);
        onChangeCallback(selectedP);
      } else {
        onChangeCallback(null);
      }
    });
    
    // Initial auto-select
    const cats2 = Object.keys(categories);
    if (cats2.length === 1) {
      selCat2.value = cats2[0];
      setTimeout(() => selCat2.dispatchEvent(new Event('change')), 0);
    }
  }
};
