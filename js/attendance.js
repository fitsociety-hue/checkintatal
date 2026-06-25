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
  let expandedMemberName = null;

  ProgramsLogic.renderProgramDropdowns(programs, 'dropdowns-container', async (selected) => {
    currentProgram = selected;
    const infoDiv = document.getElementById('selected-program-info');
    const attSection = document.getElementById('attendance-section');
    
    if (selected) {
      infoDiv.classList.remove('hidden');
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
      
      // Fetch members for the program
      try {
        const res = await API.fetchGAS('getMembers', { programId: 'all', status: '활성', forceRefresh: true });
        const allMembers = res.data || [];
        
        if (program.사업명) {
          const normSearch = String(program.사업명).replace(/\s+/g, '');
          console.log('[Attendance] Searching for program:', normSearch);
          currentMembers = allMembers.filter(m => {
            const mProgStr = String(m.사업명 || '').replace(/\s+/g, '');
            const isMatch = mProgStr.includes(normSearch) || normSearch.includes(mProgStr);
            if (isMatch) {
              console.log('[Attendance] Matched member:', m.이름, 'with programs:', mProgStr);
            }
            return isMatch;
          });
        } else {
          currentMembers = allMembers;
        }
        
        // Also fetch today's attendance to pre-fill
        const attRes = await API.fetchGAS('getAttendanceSheet', { programId: program.사업ID, date: dateStr, forceRefresh: true });
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

        renderMembersGrid();
      } catch (e) {
        console.error('Error fetching members or attendance:', e);
        Utils.showToast('데이터를 불러오는 중 오류가 발생했습니다: ' + e.message, 'error');
        currentMembers = [];
        renderMembersGrid();
      }
    }
  }

  function renderMembersGrid(filter = '') {
    const grid = document.querySelector('#members-grid');
    if (!grid) return;
    grid.innerHTML = '';
    
    let filtered = currentMembers;
    if (filter) {
      filtered = currentMembers.filter(m => m.이름.includes(filter));
    }
    
    let attCount = currentMembers.filter(m => m.attended).length;
    document.getElementById('attendance-counter').textContent = `출석 ${attCount}명 / 전체 ${currentMembers.length}명`;

    if (filtered.length === 0) {
      grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 20px;">회원이 없습니다.</div>';
      return;
    }

    filtered.forEach((m) => {
      const isExpanded = (expandedMemberName === m.이름);
      const card = document.createElement('div');
      card.className = `att-card ${m.attended ? 'attended' : ''} ${isExpanded ? 'expanded' : ''}`;
      card.setAttribute('data-name', m.이름);
      
      const badge = m.장애비장애구분 === '장애' ? '<span class="badge badge-warning" style="font-size:10px; margin-left:4px;">장애</span>' : '';
      
      card.innerHTML = `
        <div class="name-display">${m.이름}${badge}</div>
        <div class="expanded-content">
          <input type="text" class="form-input remark-input" data-name="${m.이름}" placeholder="비고 입력" value="${m.remark || ''}">
          <div class="att-card-actions">
            <button class="btn-ghost btn-cancel-att" data-name="${m.이름}" style="flex:1; border: 1px solid #ccc;">출석 취소</button>
            <button class="btn-error btn-delete-member" data-name="${m.이름}" style="flex:1;">명단 삭제</button>
          </div>
        </div>
      `;
      grid.appendChild(card);
    });

    // Event Delegation for Grid Interactions
    grid.querySelectorAll('.att-card').forEach(card => {
      card.addEventListener('click', (e) => {
        // Prevent trigger if clicking on inputs or buttons inside the card
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
        
        const memberName = card.getAttribute('data-name');
        const member = currentMembers.find(m => m.이름 === memberName);
        if (!member) return;

        if (!member.attended) {
          // 1st Tap: Mark as Attended
          member.attended = true;
          expandedMemberName = null; // collapse others
          renderMembersGrid(filter);
        } else {
          // 2nd Tap (already attended): Toggle expanded state
          if (expandedMemberName === memberName) {
            expandedMemberName = null; // collapse
          } else {
            expandedMemberName = memberName; // expand
          }
          renderMembersGrid(filter);
        }
      });
    });

    // Remark inputs
    grid.querySelectorAll('.remark-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const memberName = e.target.getAttribute('data-name');
        const member = currentMembers.find(m => m.이름 === memberName);
        if (member) member.remark = e.target.value;
      });
    });

    // Cancel Attendance Button
    grid.querySelectorAll('.btn-cancel-att').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const memberName = e.target.getAttribute('data-name');
        const member = currentMembers.find(m => m.이름 === memberName);
        if (member) {
          member.attended = false;
          expandedMemberName = null;
          renderMembersGrid(filter);
        }
      });
    });

    // Delete Member Button
    grid.querySelectorAll('.btn-delete-member').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        if (!confirm('해당 회원을 정말 삭제하시겠습니까? (즉시 서버에 반영됩니다)')) return;
        const memberName = e.target.getAttribute('data-name');
        const dateStr = document.getElementById('attendance-date').value;
        const programId = currentProgram.사업ID;
        
        try {
          await API.fetchGAS('deleteAttendanceMember', { programId, date: dateStr, memberName });
          Utils.showToast('삭제되었습니다.', 'success');
          // Reload attendance table to reflect real-time status
          renderAttendanceSection(currentProgram);
        } catch (err) {
          Utils.showToast('삭제 중 오류가 발생했습니다.', 'error');
        }
      });
    });
  }

  document.getElementById('search-member').addEventListener('input', (e) => {
    renderMembersGrid(e.target.value);
  });

  document.getElementById('btn-check-all').addEventListener('click', () => {
    currentMembers.forEach(m => m.attended = true);
    renderMembersGrid();
  });

  document.getElementById('btn-uncheck-all').addEventListener('click', () => {
    currentMembers.forEach(m => m.attended = false);
    renderMembersGrid();
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
        height: 200
      });
      
      document.getElementById('qr-link').href = qrUrl;
      document.getElementById('qr-modal').classList.add('active');
    } catch (e) {}
  });

  // Kiosk Mode Logic
  let kioskMode = false;
  let selectedKioskMember = null;

  document.getElementById('btn-enter-kiosk').addEventListener('click', () => {
    if (!currentProgram) return Utils.showToast('사업을 먼저 선택해주세요.', 'error');
    kioskMode = true;
    selectedKioskMember = null;
    document.querySelector('.app-container').classList.add('hidden');
    document.getElementById('kiosk-overlay').classList.remove('hidden');
    document.getElementById('kiosk-title').textContent = `${currentProgram.사업명} 출석체크`;
    renderKioskGrid();
  });

  document.getElementById('btn-exit-kiosk').addEventListener('click', () => {
    kioskMode = false;
    document.getElementById('kiosk-overlay').classList.add('hidden');
    document.querySelector('.app-container').classList.remove('hidden');
    renderAttendanceSection(currentProgram); // Refresh staff UI
  });

  function renderKioskGrid() {
    const grid = document.getElementById('kiosk-grid');
    grid.innerHTML = '';
    
    const saveBtn = document.getElementById('btn-kiosk-save');
    if (selectedKioskMember) {
      saveBtn.disabled = false;
      saveBtn.textContent = `${selectedKioskMember}님 출석 저장하기`;
    } else {
      saveBtn.disabled = true;
      saveBtn.textContent = `이름을 선택해주세요`;
    }

    currentMembers.forEach(m => {
      const card = document.createElement('div');
      const isSelected = (selectedKioskMember === m.이름);
      
      if (m.attended) {
        card.className = 'kiosk-card attended';
        card.innerHTML = `
          <div>${m.이름}</div>
          <div style="font-size:14px; font-weight: 500; display:flex; align-items:center; gap:4px;">
            <span style="color:var(--color-success); font-size: 16px;">✅</span> 출석 완료
          </div>
        `;
      } else {
        card.className = `kiosk-card ${isSelected ? 'selected' : ''}`;
        card.innerHTML = `<div>${m.이름}</div>`;
        card.addEventListener('click', () => {
          selectedKioskMember = m.이름;
          renderKioskGrid();
        });
      }
      grid.appendChild(card);
    });
  }

  document.getElementById('btn-kiosk-save').addEventListener('click', async () => {
    if (!selectedKioskMember) return;
    const memberName = selectedKioskMember;
    const dateStr = document.getElementById('attendance-date').value;
    const programId = currentProgram.사업ID;
    
    document.getElementById('btn-kiosk-save').disabled = true;
    document.getElementById('btn-kiosk-save').textContent = '저장 중...';
    
    try {
      await API.fetchGAS('kioskCheckIn', { programId, date: dateStr, memberName });
      alert(`${memberName}님 출석 완료 되었습니다.`);
      
      const m = currentMembers.find(x => x.이름 === memberName);
      if (m) m.attended = true;
      
      selectedKioskMember = null;
      renderKioskGrid();
    } catch (err) {
      alert(`오류: ${err.message}`);
      document.getElementById('btn-kiosk-save').disabled = false;
      document.getElementById('btn-kiosk-save').textContent = `${memberName}님 출석 저장하기`;
    }
  });
});
