// js/attendance.js

document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.requireAuth()) return;
  Auth.updateUserUI();

  // Set default date to today
  document.getElementById('attendance-date').value = Utils.formatDate(new Date());

  const user = Auth.getUser();
  // Fetch programs for dropdown
  let teamName = user.role === '관리자' ? '' : user.team; 
  let programs = await ProgramsLogic.loadTeamPrograms(teamName);
  
  // 담당자 기반 필터링 (관리자가 아닐 경우)
  if (user.role !== '관리자') {
    programs = programs.filter(p => p.담당자 && p.담당자.includes(user.name));
  }
  
  let currentProgram = null;
  let currentMembers = [];

  ProgramsLogic.renderProgramDropdowns(programs, 'dropdowns-container', async (selected) => {
    currentProgram = selected;
    const infoDiv = document.getElementById('selected-program-info');
    const badge = document.getElementById('badge-type');
    const attSection = document.getElementById('attendance-section');
    
    if (selected) {
      infoDiv.classList.remove('hidden');
      badge.textContent = selected.실적유형;
      attSection.classList.remove('hidden');
      await renderAttendanceSection(selected);
    } else {
      infoDiv.classList.add('hidden');
      attSection.classList.add('hidden');
    }
  });

  async function renderAttendanceSection(program) {
    const countOnlyDiv = document.getElementById('count-only-section');
    const membersDiv = document.getElementById('members-section');
    const dateStr = document.getElementById('attendance-date').value;
    
    countOnlyDiv.classList.add('hidden');
    membersDiv.classList.add('hidden');

    if (program.실적유형 === '건수') {
      countOnlyDiv.classList.remove('hidden');
    } else {
      membersDiv.classList.remove('hidden');
      
      // Fetch members for the program (사업명 기반 자동 필터링)
      try {
        const res = await API.fetchGAS('getMembers', { programId: program.사업ID, programName: program.사업명 });
        currentMembers = res.data || [];
        
        // Remove the fallback so it strictly shows matched members.
        
        // Also fetch today's attendance to pre-fill
        const attRes = await API.fetchGAS('getAttendanceSheet', { programId: program.사업ID, date: dateStr });
        const existingAtt = attRes.data || [];
        
        // Add members who are in existingAtt but not in currentMembers
        existingAtt.forEach(att => {
          if (!currentMembers.find(m => m.이름 === att.이름) && att.이름 !== '건수입력용_무명') {
            currentMembers.push({
              이름: att.이름,
              장애비장애구분: '비장애',
              attended: att.출석여부 === 'O'
            });
          }
        });

        currentMembers.forEach(m => {
          const att = existingAtt.find(a => a.이름 === m.이름);
          if (att) {
            m.attended = (att.출석여부 === 'O');
          } else {
            if (m.attended === undefined) m.attended = false;
          }
        });

        renderMembersTable();
      } catch (e) {
        currentMembers = [];
        renderMembersTable();
      }
    }
  }

  function renderMembersTable(filter = '') {
    const tbody = document.querySelector('#members-table tbody');
    tbody.innerHTML = '';
    
    let filtered = currentMembers;
    if (filter) {
      filtered = currentMembers.filter(m => m.이름.includes(filter));
    }
    
    let attCount = currentMembers.filter(m => m.attended).length;
    document.getElementById('attendance-counter').textContent = `출석 ${attCount}명 / 전체 ${currentMembers.length}명`;

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center">회원이 없습니다.</td></tr>';
      return;
    }

    filtered.forEach((m) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${m.이름} ${m.장애비장애구분 === '장애' ? '<span class="badge badge-warning" style="font-size:10px">장애</span>' : ''}</td>
        <td>
          <button class="btn-check ${m.attended ? 'btn-primary' : 'btn-secondary'}" data-name="${m.이름}" style="padding: 6px 12px; border-radius: 20px;">
            ${m.attended ? '출석 O' : '미출석'}
          </button>
        </td>
        <td><input type="text" class="form-input remark-input" data-name="${m.이름}" style="padding: 6px;" placeholder="비고 입력" value="${m.remark || ''}"></td>
        <td>
          <button class="btn-delete btn-error" data-name="${m.이름}" style="padding: 6px 12px; border-radius: 20px; border: none; background-color: #ff4d4f; color: white; cursor: pointer;">삭제</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    document.querySelectorAll('.btn-check').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const memberName = e.target.getAttribute('data-name');
        const member = currentMembers.find(m => m.이름 === memberName);
        if (member) member.attended = !member.attended;
        renderMembersTable(filter);
      });
    });

    document.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const memberName = e.target.getAttribute('data-name');
        currentMembers = currentMembers.filter(m => m.이름 !== memberName);
        renderMembersTable(filter);
      });
    });

    document.querySelectorAll('.remark-input').forEach(input => {
      input.addEventListener('change', (e) => {
        const memberName = e.target.getAttribute('data-name');
        const member = currentMembers.find(m => m.이름 === memberName);
        if (member) member.remark = e.target.value;
      });
    });
  }

  document.getElementById('search-member').addEventListener('input', (e) => {
    renderMembersTable(e.target.value);
  });

  document.getElementById('btn-check-all').addEventListener('click', () => {
    currentMembers.forEach(m => m.attended = true);
    renderMembersTable();
  });

  document.getElementById('btn-uncheck-all').addEventListener('click', () => {
    currentMembers.forEach(m => m.attended = false);
    renderMembersTable();
  });

  document.getElementById('attendance-date').addEventListener('change', async () => {
    if (currentProgram) await renderAttendanceSection(currentProgram);
  });

  // Save functionality
  document.getElementById('btn-save').addEventListener('click', async () => {
    if (!currentProgram) return;
    const dateStr = document.getElementById('attendance-date').value;
    
    try {
      if (currentProgram.실적유형 === '건수') {
        const count = document.getElementById('input-count').value;
        await API.fetchGAS('submitCountOnly', { programId: currentProgram.사업ID, date: dateStr, count: parseInt(count, 10) });
      } else {
        const attendanceList = currentMembers.map(m => ({
          이름: m.이름,
          출석여부: m.attended ? 'O' : 'X',
          건수: m.attended ? 1 : 0
        }));
        await API.fetchGAS('checkAttendance', { programId: currentProgram.사업ID, date: dateStr, attendanceList });
      }
      Utils.showToast('출석이 저장되었습니다.', 'success');
    } catch (e) {}
  });

  // QR Code Generation
  document.getElementById('btn-show-qr').addEventListener('click', async () => {
    if (!currentProgram) return;
    const dateStr = document.getElementById('attendance-date').value;
    
    try {
      const res = await API.fetchGAS('getQRToken', { programId: currentProgram.사업ID, date: dateStr });
      const token = res.data.token;
      
      const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/'));
      const qrUrl = `${baseUrl}/qr-checkin.html?token=${token}&program=${currentProgram.사업ID}&date=${dateStr}`;
      
      document.getElementById('qrcode').innerHTML = '';
      new QRCode(document.getElementById('qrcode'), {
        text: qrUrl,
        width: 200,
        height: 200,
      });
      
      document.getElementById('qr-link').href = qrUrl;
      document.getElementById('qr-modal').classList.add('active');
    } catch(e) {}
  });
});
