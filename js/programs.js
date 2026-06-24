// js/programs.js

const ProgramsLogic = {
  teams: [
    '지역연계팀', '맞춤지원팀', '건강문화팀', 
    '성장지원팀', '전략기획팀', '미래경영팀'
  ],
  
  loadTeamPrograms: async function(teamName = '') {
    try {
      const res = await API.fetchGAS('getPrograms', { teamName });
      return res.data; // Array of programs
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
    
    const categories = {};
    programs.forEach(p => {
      if (!categories[p.팀명]) categories[p.팀명] = {};
      if (!categories[p.팀명][p.사업분류]) categories[p.팀명][p.사업분류] = {};
      if (!categories[p.팀명][p.사업분류][p.세부사업분류]) categories[p.팀명][p.사업분류][p.세부사업분류] = [];
      categories[p.팀명][p.사업분류][p.세부사업분류].push(p);
    });

    // We need 4 selects: Team -> Category1 -> Category2 -> Program
    container.innerHTML = `
      <div class="grid-cards" style="grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px;">
        <div>
          <label class="form-label">팀명</label>
          <select id="sel-team" class="form-select">
            <option value="">선택</option>
            ${Object.keys(categories).map(t => `<option value="${t}">${t}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="form-label">사업분류</label>
          <select id="sel-cat1" class="form-select" disabled>
            <option value="">선택</option>
          </select>
        </div>
        <div>
          <label class="form-label">세부분류</label>
          <select id="sel-cat2" class="form-select" disabled>
            <option value="">선택</option>
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
    
    const selTeam = document.getElementById('sel-team');
    const selCat1 = document.getElementById('sel-cat1');
    const selCat2 = document.getElementById('sel-cat2');
    const selProg = document.getElementById('sel-prog');

    let currentPrograms = [];

    selTeam.addEventListener('change', (e) => {
      selCat1.innerHTML = '<option value="">선택</option>';
      selCat2.innerHTML = '<option value="">선택</option>';
      selProg.innerHTML = '<option value="">선택</option>';
      selCat1.disabled = true; selCat2.disabled = true; selProg.disabled = true;
      
      const t = e.target.value;
      if (t && categories[t]) {
        const cats1 = Object.keys(categories[t]);
        cats1.forEach(c1 => {
          selCat1.innerHTML += `<option value="${c1}">${c1}</option>`;
        });
        selCat1.disabled = false;
        if (cats1.length === 1) {
          selCat1.value = cats1[0];
          setTimeout(() => selCat1.dispatchEvent(new Event('change')), 0);
        }
      }
      onChangeCallback(null);
    });

    selCat1.addEventListener('change', (e) => {
      selCat2.innerHTML = '<option value="">선택</option>';
      selProg.innerHTML = '<option value="">선택</option>';
      selCat2.disabled = true; selProg.disabled = true;

      const t = selTeam.value;
      const c1 = e.target.value;
      if (c1 && categories[t][c1]) {
        const cats2 = Object.keys(categories[t][c1]);
        cats2.forEach(c2 => {
          selCat2.innerHTML += `<option value="${c2}">${c2}</option>`;
        });
        selCat2.disabled = false;
        if (cats2.length === 1) {
          selCat2.value = cats2[0];
          setTimeout(() => selCat2.dispatchEvent(new Event('change')), 0);
        }
      }
      onChangeCallback(null);
    });

    selCat2.addEventListener('change', (e) => {
      selProg.innerHTML = '<option value="">선택</option>';
      selProg.disabled = true;

      const t = selTeam.value;
      const c1 = selCat1.value;
      const c2 = e.target.value;
      
      if (c2 && categories[t][c1][c2]) {
        currentPrograms = categories[t][c1][c2];
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
    const teams = Object.keys(categories);
    if (teams.length === 1) {
      selTeam.value = teams[0];
      setTimeout(() => selTeam.dispatchEvent(new Event('change')), 0);
    }
  }
};
