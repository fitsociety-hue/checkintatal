// ==============================================================================
// 강동어울림복지관 출석부 시스템 백엔드 (Google Apps Script)
// ==============================================================================

function doOptions(e) {
  return ContentService.createTextOutput('')
    .setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  return handleRequest(e, 'POST');
}

function doGet(e) {
  return handleRequest(e, 'GET');
}

function handleRequest(e, method) {
  try {
    let payload = {};
    if (method === 'POST') {
      if (e.parameter.data) {
        payload = JSON.parse(e.parameter.data);
      } else if (e.postData && e.postData.contents) {
        payload = JSON.parse(e.postData.contents);
      }
    } else {
      if (e.parameter.data) {
        payload = JSON.parse(e.parameter.data);
      }
    }

    const action = payload.action;
    let result = null;

    // 인증 검증 로직 (login, register 등은 제외)
    let user = null;
    const bypassActions = ['login', 'register', 'verifyQRToken', 'selfCheckIn', 'setupAutoSyncTrigger'];
    if (!bypassActions.includes(action)) {
      if (!payload.token) throw new Error('인증 토큰이 필요합니다.');
      user = verifyToken(payload.token);
      if (!user) throw new Error('유효하지 않거나 만료된 토큰입니다.');
    }

    // 캐시 강제 무효화 요청 처리 (근본적인 동기화 문제 해결)
    if (payload.forceRefresh) {
      invalidateCache();
    }

    switch (action) {
      case 'login': result = login(payload.team, payload.name, payload.password); break;
      case 'register': result = registerUser(payload.team, payload.name, payload.password, payload.role); break;
      
      // 회원 관리
      case 'getMembers': result = getMembers(payload.programId, payload.status, payload.programName, payload.teamName); break;
      case 'addMember': result = addMember(payload.data); break;
      case 'updateMember': result = updateMember(payload.name, payload.data); break;
      case 'importMembersCSV': result = importMembersCSV(payload.csvData); break;
      case 'deleteMemberRecord': result = deleteMemberRecord(payload.name, payload.pin, user); break;
      
      // 사업 관리
      case 'getPrograms': result = getPrograms(payload.teamName, payload.status); break;
      case 'addProgram': result = addProgram(payload.data); break;
      case 'updateProgram': result = updateProgram(payload.programId, payload.data); break;
      case 'importProgramsCSV': result = importProgramsCSV(payload.csvData); break;
      case 'deleteProgramRecord': result = deleteProgramRecord(payload.programId, payload.pin, user); break;
      
      // 출석 관리
      case 'checkAttendance': result = checkAttendance(payload.programId, payload.date, payload.attendanceList, user); break;
      case 'getAttendanceSheet': result = getAttendanceSheet(payload.programId, payload.date); break;
      case 'submitCountOnly': result = submitCountOnly(payload.programId, payload.date, payload.count, user); break;
      case 'submitUnspecifiedAttendance': result = submitUnspecifiedAttendance(payload.programId, payload.date, payload.data, user); break;
      case 'deleteAttendanceMember': result = deleteAttendanceMember(payload.programId, payload.date, payload.memberName); break;
      case 'kioskCheckIn': result = kioskCheckIn(payload.programId, payload.date, payload.memberName); break;
      
      // QR 출석
      case 'getQRToken': result = getQRToken(payload.programId, payload.date); break;
      case 'verifyQRToken': result = verifyQRTokenAction(payload.token, payload.programId, payload.date); break;
      case 'selfCheckIn': result = selfCheckIn(payload.token, payload.programId, payload.date, payload.name); break;
      
      // 실적 집계
      case 'getStats': result = getStats(payload.teamName, payload.year, payload.periodType, payload.periodValue); break;
      case 'getAllStats': result = getAllStats(payload.year, payload.periodType, payload.periodValue); break;
      case 'getPersonalStats': result = getPersonalStats(payload.staffId, payload.year, payload.periodType, payload.periodValue); break;
      case 'saveStatsMaster': result = saveStatsMaster(payload.year, payload.periodType, payload.periodValue, payload.statsData, user); break;
      
      // 시스템 관리
      case 'setupAutoSyncTrigger': result = setupAutoSyncTrigger(); break;
      case 'setDeletePin': result = setDeletePin(payload.pin, user); break;
      case 'updateAdminPassword':
        if (!user || user.role !== '관리자') throw new Error('권한이 없습니다.');
        PropertiesService.getScriptProperties().setProperty('ADMIN_PASSWORD', payload.newPassword);
        result = true;
        break;
      
      default:
        throw new Error('알 수 없는 Action입니다: ' + action);
    }

    return createResponse({ success: true, data: result });
  } catch (error) {
    return createResponse({ success: false, message: error.message });
  }
}

function createResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ==============================================================================
// 유틸리티 함수
// ==============================================================================

function getSheet(sheetName) {
  const ssId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  const ss = ssId ? SpreadsheetApp.openById(ssId) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('연결된 구글 시트를 찾을 수 없습니다.');
  
  let sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    const headers = getHeadersForSheet(sheetName);
    if (headers.length > 0) {
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#f3f3f3");
      sheet.setFrozenRows(1);
    }
  }
  
  return sheet;
}

function getHeadersForSheet(sheetName) {
  switch (sheetName) {
    case '직원_마스터': return ['직원ID', '이름', '팀명', '직위', '비밀번호', '상태', '담당사업IDs', '삭제비밀번호'];
    case '사업_마스터': return ['팀명', '사업분류', '세부사업분류', '사업명', '실적유형', '상태', '목표_실인원', '목표_건수', '목표_연인원', '담당자', '사업ID'];
    case '회원_마스터': return ['이름', '시작일', '장애비장애구분', '구분', '상태', '팀명', '사업명', '메모'];
    case '출석_원장': return ['출석ID', '날짜', '사업ID', '사업명', '팀명', '이름', '출석여부', '건수', '입력방식', '입력자', '입력시각', '실인원', '연인원', '세부_직원', '세부_장애인', '세부_비장애인', '비고'];
    case '실적_집계': return ['팀명', '사업명', '년도', '월', '실인원', '건수', '연인원', '목표대비_실인원(%)', '목표대비_건수(%)', '목표대비_연인원(%)'];
    case '실적_마스터': return ['년도', '기준', '팀명', '사업명', '목표_실인원', '목표_건수', '목표_연인원', '실적_실인원', '실적_건수', '실적_연인원', '달성률_실인원', '달성률_건수', '달성률_연인원'];
    default: return [];
  }
}

function getSheetDataAsJSON(sheetName, bypassCache = false) {
  const version = getCacheVersion();
  const cacheKey = 'SHEET_' + sheetName + '_' + version;
  
  if (!bypassCache) {
    const cached = getCacheChunked(cacheKey);
    if (cached) return JSON.parse(cached);
  }

  const sheet = getSheet(sheetName);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length === 0) return [];
  
  const expectedHeaders = getHeadersForSheet(sheetName);
  const currentHeaders = data[0].map(h => String(h).trim());
  
  // 정확한 헤더 일치 여부 확인
  const isExactMatch = expectedHeaders.length === currentHeaders.length && 
                       expectedHeaders.every((h, i) => currentHeaders[i] === h);
  
  if (!isExactMatch) {
    // 1) 헤더가 아예 없거나 첫 컬럼부터 다르면 (신규 시트 또는 잘못된 시트) -> 초기화
    if (currentHeaders.length === 0 || currentHeaders[0] !== expectedHeaders[0]) {
      sheet.insertRowBefore(1);
      sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]).setFontWeight("bold").setBackground("#f3f3f3");
      sheet.setFrozenRows(1);
      return getSheetDataAsJSON(sheetName);
    }
    
    // 2) 첫 컬럼은 맞지만 (ex: 이름) 다른 컬럼 구성이 변경된 경우 -> 기존 데이터 마이그레이션
    const oldRows = [];
    if (data.length > 1) {
      for (let i = 1; i < data.length; i++) {
        let obj = {};
        for (let j = 0; j < currentHeaders.length; j++) {
          if (currentHeaders[j]) {
            obj[currentHeaders[j]] = data[i][j];
          }
        }
        oldRows.push(obj);
      }
    }
    
    // 시트 초기화 후 새 헤더 작성
    sheet.clear();
    sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]).setFontWeight("bold").setBackground("#f3f3f3");
    sheet.setFrozenRows(1);
    
    // 기존 데이터 새 포맷에 맞게 재작성
    if (oldRows.length > 0) {
      const newData = oldRows.map(row => {
        return expectedHeaders.map(h => {
          if (h === '구분' && !row[h]) return '개별';
          if (h === '장애비장애구분' && !row[h]) return '비장애';
          if (h === '상태' && !row[h]) return '활성';
          return row[h] !== undefined ? row[h] : '';
        });
      });
      sheet.getRange(2, 1, newData.length, expectedHeaders.length).setValues(newData);
    }
    
    // 업데이트된 시트 기준으로 다시 데이터 불러오기
    return getSheetDataAsJSON(sheetName);
  }

  if (data.length < 2) return [];
  
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    let obj = {};
    for (let j = 0; j < expectedHeaders.length; j++) {
      obj[expectedHeaders[j]] = data[i][j];
    }
    rows.push(obj);
  }
  
  putCacheChunked(cacheKey, JSON.stringify(rows));
  return rows;
}

// ==============================================================================
// 인증 및 권한
// ==============================================================================

function hashPassword(password) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password, Utilities.Charset.UTF_8);
  let hashStr = '';
  for (let i = 0; i < digest.length; i++) {
    let byte = digest[i];
    if (byte < 0) byte += 256;
    let hex = byte.toString(16);
    if (hex.length == 1) hex = '0' + hex;
    hashStr += hex;
  }
  return hashStr;
}

function login(team, name, password) {
  const safeName = String(name || '').trim();
  const safePassword = String(password || '').trim();
  const safeTeam = String(team || '').trim();
  
  const staffData = getSheetDataAsJSON('직원_마스터', true);
  const inputHash = hashPassword(safePassword);
  
  const user = staffData.find(s => 
    String(s.이름 || '').trim() === safeName && 
    (safeTeam === '관리자' || String(s.팀명 || '').trim() === safeTeam) &&
    (String(s.비밀번호 || '').trim() === safePassword || 
     String(s.비밀번호 || '').trim() === inputHash || 
     String(s.비밀번호해시 || '').trim() === inputHash) && 
    String(s.상태 || '').trim() !== '비활성'
  );
  
  if (!user) {
    // 관리자의 경우 하드코딩된 마스터 계정 허용 (초기 세팅 및 고정 아이디)
    if (safeName.toLowerCase() === 'admin' || safeTeam === '관리자') {
      const adminPw = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
      if (safePassword === '1107' || safePassword === 'admin' || safePassword === '1234' || safePassword === '0000' || (adminPw && safePassword === String(adminPw).trim())) {
        const mockUser = { staffId: 'ADMIN', name: '최고관리자', team: '관리자', role: '관리자', hasDeletePin: true };
        return { token: createToken(mockUser), user: mockUser };
      }
    }
    throw new Error('이름, 소속 또는 비밀번호가 일치하지 않습니다.');
  }

  const payload = {
    staffId: user.직원ID,
    name: user.이름,
    team: user.팀명,
    role: String(user.직위 || user.권한 || '팀원').trim(), // 관리자, 팀장, 팀원
    담당사업IDs: user.담당사업IDs,
    hasDeletePin: !!user.삭제비밀번호
  };
  
  return { token: createToken(payload), user: payload };
}

function createToken(payload) {
  payload.exp = new Date().getTime() + (8 * 60 * 60 * 1000); // 8시간 만료
  const secret = PropertiesService.getScriptProperties().getProperty('JWT_SECRET') || 'DEFAULT_SECRET_KEY';
  const header = Utilities.base64EncodeWebSafe(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  
  // URL-encode payload to avoid UTF-8 corruption during base64 encode/decode
  const payloadAscii = encodeURIComponent(JSON.stringify(payload));
  const payloadStr = Utilities.base64EncodeWebSafe(payloadAscii);
  
  const signature = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(header + '.' + payloadStr, secret));
  return `${header}.${payloadStr}.${signature}`;
}

function verifyToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    // Base64WebSafe로 디코딩 (한글 깨짐 방지)
    const decodedBytes = Utilities.base64DecodeWebSafe(parts[1]);
    let payloadJsonStr = Utilities.newBlob(decodedBytes).getDataAsString();
    
    // URI 인코딩 방식 토큰 지원 (한글 깨짐 근본적 해결)
    if (payloadJsonStr.startsWith('%7B')) {
      payloadJsonStr = decodeURIComponent(payloadJsonStr);
    }
    
    const payload = JSON.parse(payloadJsonStr);
    
    if (new Date().getTime() > payload.exp) return null; // 만료됨
    return payload;
  } catch (e) {
    return null;
  }
}

function registerUser(team, name, password, role) {
  const safeName = String(name || '').trim();
  const safeTeam = String(team || '').trim();
  const safePassword = String(password || '').trim();

  const sheet = getSheet('직원_마스터');
  const staffData = getSheetDataAsJSON('직원_마스터', true);
  
  // 중복 가입 방지 (소속 팀명 + 이름 동일하면 가입 거부)
  const isDuplicate = staffData.some(s => s.이름 === safeName && s.팀명 === safeTeam);
  if (isDuplicate) {
    throw new Error('이미 동일한 소속과 이름으로 가입된 계정이 있습니다.');
  }

  // 중복이 아니면 가입 허용
  const newId = 'STAFF_' + new Date().getTime();
  const hashedPw = hashPassword(safePassword);
  
  sheet.appendRow([
    newId, safeName, safeTeam, role || '팀원', hashedPw, '활성', ''
  ]);
  
  invalidateCache(); // 회원가입 후 즉시 로그인 가능하도록 캐시 무효화
  
  return true;
}

// ==============================================================================
// 사업 관리
// ==============================================================================

function getPrograms(teamName, status) {
  let programs = getSheetDataAsJSON('사업_마스터');
  if (teamName && teamName !== '전체') {
    programs = programs.filter(p => p.팀명 === teamName);
  }
  if (status && status !== 'all') {
    programs = programs.filter(p => p.상태 === status);
  }
  return programs;
}

function addProgram(data) {
  const sheet = getSheet('사업_마스터');
  const programId = 'PROG_' + new Date().getTime();
  sheet.appendRow([
    data.팀명, data.사업분류, data.세부사업분류, data.사업명, data.실적유형,
    data.상태 || '활성', data.목표_실인원 || 0, data.목표_건수 || 0, data.목표_연인원 || 0,
    data.담당자 || '', programId
  ]);
  invalidateCache();
  return { programId };
}

function updateProgram(programId, data) {
  const sheet = getSheet('사업_마스터');
  const vals = sheet.getDataRange().getValues();
  for (let i = 1; i < vals.length; i++) {
    if (vals[i][10] === programId) {
      sheet.getRange(i + 1, 1, 1, 10).setValues([[
        data.팀명, data.사업분류, data.세부사업분류, data.사업명, data.실적유형,
        data.상태, data.목표_실인원, data.목표_건수, data.목표_연인원, data.담당자
      ]]);
      invalidateCache();
      return true;
    }
  }
  throw new Error('해당 사업을 찾을 수 없습니다.');
}

function importProgramsCSV(csvData) {
  const sheet = getSheet('사업_마스터');
  csvData.forEach(row => {
    sheet.appendRow([
      row.팀명, row.사업분류, row.세부사업분류, row.사업명, row.실적유형,
      row.상태 || '활성', row.목표_실인원 || 0, row.목표_건수 || 0, row.목표_연인원 || 0,
      row.담당자 || '', 'PROG_' + Math.floor(Math.random()*10000000)
    ]);
  });
  invalidateCache();
  return true;
}

function deleteProgramRecord(programId, pin, user) {
  verifyDeletePin(pin, user);
  
  const sheet = getSheet('사업_마스터');
  const vals = sheet.getDataRange().getValues();
  if (vals.length <= 1) return true;
  
  let deleted = false;
  for (let i = vals.length - 1; i >= 1; i--) {
    if (vals[i][10] === programId) {
      sheet.deleteRow(i + 1);
      deleted = true;
    }
  }
  
  if (deleted) invalidateCache();
  return true;
}

// ==============================================================================
// 회원 관리
// ==============================================================================

function getMembers(programId, status, programName, teamName) {
  let members = getSheetDataAsJSON('회원_마스터');
  if (status && status !== 'all') {
    members = members.filter(m => m.상태 === status);
  }
  if (teamName && teamName !== '전체' && teamName !== '관리자') {
    const programs = getSheetDataAsJSON('사업_마스터');
    const teamPrograms = programs.filter(p => p.팀명 === teamName && p.사업명).map(p => String(p.사업명).replace(/\s+/g, ''));
    
    members = members.filter(m => {
      if (m.팀명 === teamName) return true;
      if (!m.팀명) {
        const memberPrograms = String(m.사업명 || '').replace(/\s+/g, '');
        if (memberPrograms) {
          return teamPrograms.some(tp => memberPrograms.includes(tp));
        }
        return true; // 사업명이 없는 기존 회원 데이터도 누락 방지
      }
      return false;
    });
  }
  // 사업명으로 필터링 (회원의 사업명 필드에 해당 사업명이 포함되어 있는지 확인, 공백 무시)
  if (programName) {
    const normSearch = String(programName).replace(/\s+/g, '');
    members = members.filter(m => {
      // 배열 split 방식 대신, 모든 텍스트를 붙여서 부분일치(includes) 검색으로 변경 
      // (사용자가 쉼표 대신 줄바꿈, 빗금, '및' 등으로 사업명을 구분해 입력하는 경우 대응)
      const memberPrograms = String(m.사업명 || '').replace(/\s+/g, '');
      return memberPrograms.includes(normSearch);
    });
  }
  return members;
}

function addMember(data) {
  const sheet = getSheet('회원_마스터');
  sheet.appendRow([
    data.이름, data.시작일, data.장애비장애구분 || '비장애', data.구분 || '개별', data.상태 || '활성', data.팀명 || '', data.사업명 || '', data.메모 || ''
  ]);
  invalidateCache();
  return true;
}

function updateMember(name, data) {
  const sheet = getSheet('회원_마스터');
  const vals = sheet.getDataRange().getValues();
  for (let i = 1; i < vals.length; i++) {
    if (vals[i][0] === name) {
      sheet.getRange(i + 1, 1, 1, 8).setValues([[
        data.이름, data.시작일, data.장애비장애구분 || '비장애', data.구분 || '개별', data.상태 || '활성', data.팀명 || '', data.사업명 || '', data.메모 || ''
      ]]);
      invalidateCache();
      return true;
    }
  }
  throw new Error('해당 회원을 찾을 수 없습니다.');
}

function importMembersCSV(csvData) {
  const sheet = getSheet('회원_마스터');
  csvData.forEach(row => {
    sheet.appendRow([
      row.이름, row.시작일, row.장애비장애구분 || '비장애', row.구분 || '개별', row.상태 || '활성', row.팀명 || '', row.사업명 || '', row.메모 || ''
    ]);
  });
  invalidateCache();
  return true;
}

function deleteMemberRecord(name, pin, user) {
  verifyDeletePin(pin, user);
  
  const sheet = getSheet('회원_마스터');
  const vals = sheet.getDataRange().getValues();
  if (vals.length <= 1) return true;
  
  let deleted = false;
  for (let i = vals.length - 1; i >= 1; i--) {
    if (vals[i][0] === name) {
      sheet.deleteRow(i + 1);
      deleted = true;
    }
  }
  
  if (deleted) invalidateCache();
  return true;
}

// ==============================================================================
// 출석 관리
// ==============================================================================

function getAttendanceSheet(programId, date) {
  const attData = getSheetDataAsJSON('출석_원장');
  return attData.filter(a => a.사업ID === programId && formatDateStr(a.날짜) === date);
}

function checkAttendance(programId, date, attendanceList, user) {
  const sheet = getSheet('출석_원장');
  const programs = getSheetDataAsJSON('사업_마스터');
  const prog = programs.find(p => p.사업ID === programId);
  if (!prog) throw new Error('사업을 찾을 수 없습니다.');
  
  // 삭제 후 덮어쓰기를 위해 기존 해당일 데이터 삭제 (간단한 구현)
  deleteExistingAttendance(programId, date);

  const inputterName = (user && user.name) ? user.name : '시스템';

  const attendedList = attendanceList.filter(att => att.출석여부 === 'O');

  attendedList.forEach(att => {
    const attId = 'ATT_' + new Date().getTime() + Math.floor(Math.random()*1000);
    sheet.appendRow([
      attId, date, programId, prog.사업명, prog.팀명, att.이름, 
      att.출석여부, att.건수 || 0, '직원입력', inputterName, new Date()
    ]);
  });
  
  recalcStatsDirectly();
  invalidateCache();
  return true;
}

function kioskCheckIn(programId, date, memberName) {
  const attData = getSheetDataAsJSON('출석_원장');
  const exist = attData.find(a => a.사업ID === programId && formatDateStr(a.날짜) === date && a.이름 === memberName);
  if (exist && exist.출석여부 === 'O') {
    throw new Error('이미 출석 완료된 사용자입니다.');
  }

  const sheet = getSheet('출석_원장');
  const programs = getSheetDataAsJSON('사업_마스터');
  const prog = programs.find(p => p.사업ID === programId);
  if (!prog) throw new Error('사업을 찾을 수 없습니다.');
  
  const attId = 'ATT_' + new Date().getTime() + Math.floor(Math.random()*1000);
  sheet.appendRow([
    attId, date, programId, prog.사업명, prog.팀명, memberName, 
    'O', 0, '키오스크', memberName, new Date()
  ]);
  
  recalcStatsDirectly();
  invalidateCache();
  return true;
}

function submitCountOnly(programId, date, count, user) {
  const sheet = getSheet('출석_원장');
  const programs = getSheetDataAsJSON('사업_마스터');
  const prog = programs.find(p => p.사업ID === programId);
  if (!prog) throw new Error('사업을 찾을 수 없습니다.');

  deleteExistingAttendance(programId, date);

  const inputterName = (user && user.name) ? user.name : '시스템';

  const attId = 'ATT_' + new Date().getTime();
  sheet.appendRow([
    attId, date, programId, prog.사업명, prog.팀명, '건수입력용_무명', 
    'O', count, '직원입력', inputterName, new Date()
  ]);
  
  recalcStatsDirectly();
  invalidateCache();
  return true;
}

function submitUnspecifiedAttendance(programId, date, data, user) {
  const sheet = getSheet('출석_원장');
  const programs = getSheetDataAsJSON('사업_마스터');
  const prog = programs.find(p => p.사업ID === programId);
  if (!prog) throw new Error('사업을 찾을 수 없습니다.');

  deleteExistingAttendance(programId, date);

  const inputterName = (user && user.name) ? user.name : '시스템';

  const attId = 'ATT_' + new Date().getTime();
  sheet.appendRow([
    attId, date, programId, prog.사업명, prog.팀명, '불특정_인원_입력', 
    'O', Number(data.count) || 0, '직원입력', inputterName, new Date(),
    Number(data.realCount) || 0, Number(data.accumCount) || 0,
    Number(data.staffCount) || 0, Number(data.disabledCount) || 0,
    Number(data.nonDisabledCount) || 0, data.remark || ''
  ]);
  
  recalcStatsDirectly();
  invalidateCache();
  return true;
}

function deleteExistingAttendance(programId, date) {
  const sheet = getSheet('출석_원장');
  const vals = sheet.getDataRange().getValues();
  if (vals.length <= 1) return;
  
  let deleted = false;
  for (let i = vals.length - 1; i >= 1; i--) {
    if (vals[i][2] === programId && formatDateStr(vals[i][1]) === date) {
      sheet.deleteRow(i + 1);
      deleted = true;
    }
  }
  
  if (deleted) invalidateCache();
  return true;
}

function deleteAttendanceMember(programId, date, memberName) {
  const sheet = getSheet('출석_원장');
  const vals = sheet.getDataRange().getValues();
  if (vals.length <= 1) return true;
  
  let deleted = false;
  for (let i = vals.length - 1; i >= 1; i--) {
    if (vals[i][2] === programId && formatDateStr(vals[i][1]) === date && vals[i][5] === memberName) {
      sheet.deleteRow(i + 1);
      deleted = true;
    }
  }
  
  if (deleted) {
    recalcStatsDirectly();
    invalidateCache();
  }
  return true;
}

// ==============================================================================
// QR 출석
// ==============================================================================

function getQRToken(programId, date) {
  const token = Utilities.getUuid();
  const cache = CacheService.getScriptCache();
  cache.put('QR_' + token, JSON.stringify({ programId, date }), 300); // 5분 유효
  return { token };
}

function invalidateCache() {
  const cache = CacheService.getScriptCache();
  const newVersion = new Date().getTime().toString();
  cache.put('CACHE_VERSION', newVersion, 21600);
}

function setDeletePin(pin, user) {
  if (user.staffId === 'ADMIN') return true; 
  
  const sheet = getSheet('직원_마스터');
  const vals = sheet.getDataRange().getValues();
  const hashedPin = hashPassword(pin);
  
  for (let i = 1; i < vals.length; i++) {
    if (vals[i][0] === user.staffId) {
      sheet.getRange(i + 1, 8).setValue(hashedPin);
      invalidateCache();
      return true;
    }
  }
  throw new Error('사용자 정보를 찾을 수 없습니다.');
}

function verifyDeletePin(pin, user) {
  if (!user || (user.role !== '팀장' && user.role !== '관리자')) {
    throw new Error('삭제 권한이 없습니다.');
  }
  
  if (user.staffId === 'ADMIN') {
    const adminPw = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD') || '1107';
    if (pin !== adminPw && pin !== 'admin' && pin !== '1107') {
      throw new Error('비밀번호가 일치하지 않습니다.');
    }
    return true;
  }
  
  const staffData = getSheetDataAsJSON('직원_마스터', true);
  const staff = staffData.find(s => s.직원ID === user.staffId);
  if (!staff) throw new Error('사용자 정보를 찾을 수 없습니다.');
  if (!staff.삭제비밀번호) throw new Error('삭제 비밀번호가 설정되어 있지 않습니다.');
  
  if (staff.삭제비밀번호 !== hashPassword(pin) && staff.비밀번호 !== hashPassword(pin)) {
    throw new Error('비밀번호가 일치하지 않습니다.');
  }
  return true;
}

function verifyQRTokenAction(token, programId, date) {
  const cache = CacheService.getScriptCache();
  const cachedStr = cache.get('QR_' + token);
  if (!cachedStr) throw new Error('QR코드가 만료되었습니다.');
  
  const parsed = JSON.parse(cachedStr);
  if (parsed.programId !== programId || parsed.date !== date) {
    throw new Error('유효하지 않은 QR 정보입니다.');
  }
  
  const programs = getSheetDataAsJSON('사업_마스터');
  const prog = programs.find(p => p.사업ID === programId);
  
  const members = getSheetDataAsJSON('회원_마스터').filter(m => m.상태 === '활성');
  
  return { programName: prog.사업명, members: members };
}

function selfCheckIn(token, programId, date, name) {
  verifyQRTokenAction(token, programId, date); // 만료 검증

  const sheet = getSheet('출석_원장');
  const programs = getSheetDataAsJSON('사업_마스터');
  const prog = programs.find(p => p.사업ID === programId);

  const attId = 'ATT_' + new Date().getTime();
  sheet.appendRow([
    attId, date, programId, prog.사업명, prog.팀명, name, 
    'O', 1, 'QR', name, new Date()
  ]);
  
  invalidateCache();
  return true;
}

// ==============================================================================
// 실적 집계 
// ==============================================================================

function formatDateStr(dateObj) {
  if (!dateObj) return '';
  const d = new Date(dateObj);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dd}`;
}

function recalcStatsDirectly() {
  // 간단하게 시트를 리프레시 하는 용도의 함수입니다.
  // 실제 대용량 처리에서는 별도의 시간 트리거로 돌리는 것을 권장합니다.
}

function calculateStatsCore(progs, targetYear, targetMonths, attData, memberMap) {
  const progIds = progs.map(p => p.사업ID);
  const progMap = {};
  progs.forEach(p => { progMap[p.사업ID] = p; });

  const monthAtt = attData.filter(a => {
    if (!progIds.includes(a.사업ID)) return false;
    const d = new Date(a.날짜);
    if (d.getFullYear() !== targetYear) return false;
    const mVal = d.getMonth() + 1;
    return targetMonths.includes(mVal);
  });

  const minTargetMonth = Math.min(...targetMonths);
  const priorAtt = attData.filter(a => {
    if (!progIds.includes(a.사업ID)) return false;
    const d = new Date(a.날짜);
    if (d.getFullYear() !== targetYear) return false;
    const mVal = d.getMonth() + 1;
    return mVal < minTargetMonth;
  });

  const priorNamesByProg = {};
  const priorNamesTotal = new Set();
  
  priorAtt.forEach(a => {
    const p = progMap[a.사업ID];
    if (!p) return;
    const isMemberType = (p.실적유형 !== '건수' && p.실적유형 !== '건수만' && p.실적유형 !== '불특정 인원(실인원, 건수, 연인원)');
    
    if (isMemberType && a.출석여부 === 'O' && a.이름 !== '건수입력용_무명' && a.이름 !== '불특정_인원_입력') {
      if (!priorNamesByProg[a.사업ID]) priorNamesByProg[a.사업ID] = new Set();
      priorNamesByProg[a.사업ID].add(a.이름);
      priorNamesTotal.add(a.이름);
    }
  });

  let totalRealUnspecified = 0;

  const uniqueNames = new Set();
  monthAtt.forEach(a => {
    const p = progMap[a.사업ID];
    if (!p) return;
    const isMemberType = (p.실적유형 !== '건수' && p.실적유형 !== '건수만' && p.실적유형 !== '불특정 인원(실인원, 건수, 연인원)');
    const isUnspecifiedType = (p.실적유형 === '불특정 인원(실인원, 건수, 연인원)');
    
    if (isMemberType && a.출석여부 === 'O' && a.이름 !== '건수입력용_무명' && a.이름 !== '불특정_인원_입력') {
      if (!priorNamesTotal.has(a.이름)) {
        uniqueNames.add(a.이름);
      }
    }
    if (isUnspecifiedType) {
      totalRealUnspecified += Number(a.실인원) || 0;
    }
  });
  const realCount = uniqueNames.size + totalRealUnspecified;

  let totalAccum = 0;
  let totalCount = 0;
  const dailyAttByProg = {};
  
  monthAtt.forEach(a => {
    const p = progMap[a.사업ID];
    if (!p) return;
    const isMemberType = (p.실적유형 !== '건수' && p.실적유형 !== '건수만' && p.실적유형 !== '불특정 인원(실인원, 건수, 연인원)');
    const isUnspecifiedType = (p.실적유형 === '불특정 인원(실인원, 건수, 연인원)');
    
    if (isMemberType) {
      if (a.출석여부 === 'O') totalAccum++;
      const dateStr = formatDateStr(a.날짜);
      if (!dailyAttByProg[a.사업ID]) dailyAttByProg[a.사업ID] = {};
      if (!dailyAttByProg[a.사업ID][dateStr]) dailyAttByProg[a.사업ID][dateStr] = [];
      dailyAttByProg[a.사업ID][dateStr].push(a);
    } else if (isUnspecifiedType) {
      totalCount += Number(a.건수) || 0;
      totalAccum += Number(a.연인원) || 0;
    } else {
      totalCount += Number(a.건수) || 0;
    }
  });

  Object.keys(dailyAttByProg).forEach(progId => {
    const datesObj = dailyAttByProg[progId];
    Object.keys(datesObj).forEach(dateStr => {
      const records = datesObj[dateStr];
      let hasGroupCheck = false;
      let individualChecks = 0;
      records.forEach(a => {
        if (a.출석여부 === 'O') {
          const type = memberMap[a.이름] || '개별';
          if (type === '그룹') hasGroupCheck = true;
          else individualChecks++;
        }
      });
      totalCount += (hasGroupCheck ? 1 : 0) + individualChecks;
    });
  });

  let totalProgRateSum = 0;
  let activeProgCount = 0;

  // O(N) 그룹핑으로 성능 최적화
  const monthAttByProg = {};
  monthAtt.forEach(a => {
    if (!monthAttByProg[a.사업ID]) monthAttByProg[a.사업ID] = [];
    monthAttByProg[a.사업ID].push(a);
  });

  const programStats = progs.map(p => {
    const isMemberType = (p.실적유형 !== '건수' && p.실적유형 !== '건수만' && p.실적유형 !== '불특정 인원(실인원, 건수, 연인원)');
    const isUnspecifiedType = (p.실적유형 === '불특정 인원(실인원, 건수, 연인원)');
    
    const pMonthAtt = monthAttByProg[p.사업ID] || [];
    const pPriorNames = priorNamesByProg[p.사업ID] || new Set();
    const pNames = new Set();
    let pCumReal = 0;
    
    pMonthAtt.forEach(a => {
      if (isMemberType && a.출석여부 === 'O' && a.이름 !== '건수입력용_무명' && a.이름 !== '불특정_인원_입력') {
        if (!pPriorNames.has(a.이름)) {
          pNames.add(a.이름);
        }
      }
      if (isUnspecifiedType) pCumReal += Number(a.실인원) || 0;
    });
    
    let pAccum = 0;
    let pCount = 0;
    
    if (isMemberType) {
      pMonthAtt.forEach(a => { if (a.출석여부 === 'O') pAccum++; });
      const pDaily = {};
      pMonthAtt.forEach(a => {
        const dateStr = formatDateStr(a.날짜);
        if (!pDaily[dateStr]) pDaily[dateStr] = [];
        pDaily[dateStr].push(a);
      });
      Object.keys(pDaily).forEach(dateStr => {
        const records = pDaily[dateStr];
        let hasGroup = false;
        let indvCount = 0;
        records.forEach(a => {
          if (a.출석여부 === 'O') {
            const mType = memberMap[a.이름] || '개별';
            if (mType === '그룹') hasGroup = true;
            else indvCount++;
          }
        });
        pCount += (hasGroup ? 1 : 0) + indvCount;
      });
    } else if (isUnspecifiedType) {
      pMonthAtt.forEach(a => { 
        pCount += Number(a.건수) || 0; 
        pAccum += Number(a.연인원) || 0;
      });
    } else {
      pMonthAtt.forEach(a => { pCount += Number(a.건수) || 0; });
    }

    const gReal = Number(p.목표_실인원) || 0;
    const gCount = Number(p.목표_건수) || 0;
    const gAccum = Number(p.목표_연인원) || 0;

    const actualReal = isMemberType ? pNames.size : (isUnspecifiedType ? pCumReal : 0);
    const rateReal = gReal > 0 ? Math.round((actualReal / gReal) * 100) : 0;
    const rateCount = gCount > 0 ? Math.round((pCount / gCount) * 100) : 0;
    const rateAccum = gAccum > 0 ? Math.round((pAccum / gAccum) * 100) : 0;

    let mainRate = isMemberType || isUnspecifiedType ? rateAccum : rateCount;
    
    totalProgRateSum += mainRate;
    activeProgCount++;

    return {
      팀명: p.팀명,
      사업명: p.사업명,
      parentName: p.사업분류,
      subCategory: p.세부사업분류,
      목표_실인원: gReal,
      목표_건수: gCount,
      목표_연인원: gAccum,
      실인원: actualReal,
      건수: pCount,
      연인원: isMemberType ? pAccum : (isUnspecifiedType ? pAccum : 0),
      '목표대비_실인원': rateReal,
      '목표대비_건수': rateCount,
      '목표대비_연인원': rateAccum,
      mainRate: mainRate
    };
  });

  const rate = activeProgCount > 0 ? Math.round(totalProgRateSum / activeProgCount) : 0;

  return {
    real: realCount,
    accum: totalAccum,
    count: totalCount,
    rate: rate,
    totalRealCount: realCount,
    totalItemCount: totalCount,
    totalAccumCount: totalAccum,
    avgAchieveRate: rate,
    programs: programStats
  };
}

function getTargetMonths(periodType, periodValue) {
  if (periodType === 'quarter') {
    const q = parseInt(periodValue) || 1;
    if (q === 1) return [1, 2, 3];
    if (q === 2) return [4, 5, 6];
    if (q === 3) return [7, 8, 9];
    if (q === 4) return [10, 11, 12];
  } else if (periodType === 'half') {
    const h = parseInt(periodValue) || 1;
    if (h === 1) return [1, 2, 3, 4, 5, 6];
    if (h === 2) return [7, 8, 9, 10, 11, 12];
  } else if (periodType === 'year') {
    return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  } else { // month
    if (periodValue === 'all') return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    return [parseInt(periodValue) || (new Date().getMonth() + 1)];
  }
}

function getStats(teamName, year, periodType, periodValue) {
  const now = new Date();
  const targetYear = parseInt(year) || now.getFullYear();
  const targetMonths = getTargetMonths(periodType, periodValue);

  const progs = getSheetDataAsJSON('사업_마스터', true).filter(p => p.팀명 === teamName);
  const attData = getSheetDataAsJSON('출석_원장', true);
  
  const memberMap = {};
  getSheetDataAsJSON('회원_마스터', true).forEach(m => {
    memberMap[m.이름] = m.구분 || '개별';
  });

  return calculateStatsCore(progs, targetYear, targetMonths, attData, memberMap);
}


function getAllStats(year, periodType, periodValue) {
  const now = new Date();
  const targetYear = parseInt(year) || now.getFullYear();
  const targetMonths = getTargetMonths(periodType, periodValue);

  const teams = ['지역연계팀', '맞춤지원팀', '건강문화팀', '성장지원팀', '전략기획팀', '미래경영팀'];
  const allProgs = getSheetDataAsJSON('사업_마스터', true);
  const attData = getSheetDataAsJSON('출석_원장', true);
  
  // 회원 구분 매핑용
  const memberMap = {};
  getSheetDataAsJSON('회원_마스터', true).forEach(m => {
    memberMap[m.이름] = m.구분 || '개별';
  });

  const progMap = {};
  allProgs.forEach(p => { progMap[p.사업ID] = p; });

  // 선택기간 출석 데이터 필터
  const monthAtt = attData.filter(a => {
    const d = new Date(a.날짜);
    if (d.getFullYear() !== targetYear) return false;
    const mVal = d.getMonth() + 1;
    return targetMonths.includes(mVal);
  });

  const minTargetMonth = Math.min(...targetMonths);
  const priorAtt = attData.filter(a => {
    const d = new Date(a.날짜);
    if (d.getFullYear() !== targetYear) return false;
    const mVal = d.getMonth() + 1;
    return mVal < minTargetMonth;
  });

  const grandPriorNames = new Set();
  const priorNamesByProg = {};

  priorAtt.forEach(a => {
    const p = progMap[a.사업ID];
    if (!p) return;
    const isMemberType = (p.실적유형 !== '건수' && p.실적유형 !== '건수만' && p.실적유형 !== '불특정 인원(실인원, 건수, 연인원)');
    
    if (isMemberType && a.출석여부 === 'O' && a.이름 !== '건수입력용_무명' && a.이름 !== '불특정_인원_입력') {
      grandPriorNames.add(a.이름);
      if (!priorNamesByProg[a.사업ID]) priorNamesByProg[a.사업ID] = new Set();
      priorNamesByProg[a.사업ID].add(a.이름);
    }
  });

  let grandReal = new Set();
  let grandAccum = 0;
  let grandCount = 0;
  let grandCumRealUnspecified = 0;

  // 전체 실인원 집계 (선택기간만)
  monthAtt.forEach(a => {
    const p = progMap[a.사업ID];
    if (!p) return;
    const isMemberType = (p.실적유형 !== '건수' && p.실적유형 !== '건수만' && p.실적유형 !== '불특정 인원(실인원, 건수, 연인원)');
    const isUnspecifiedType = (p.실적유형 === '불특정 인원(실인원, 건수, 연인원)');
    
    if (isMemberType && a.출석여부 === 'O' && a.이름 !== '건수입력용_무명' && a.이름 !== '불특정_인원_입력') {
      if (!grandPriorNames.has(a.이름)) {
        grandReal.add(a.이름);
      }
    }
    if (isUnspecifiedType) {
      grandCumRealUnspecified += Number(a.실인원) || 0;
    }
  });

  let totalAllProgRateSum = 0;
  let activeAllProgCount = 0;

  // O(N) 그룹핑
  const monthAttByProg = {};
  monthAtt.forEach(a => {
    if (!monthAttByProg[a.사업ID]) monthAttByProg[a.사업ID] = [];
    monthAttByProg[a.사업ID].push(a);
  });

  const teamStats = teams.map(team => {
    const teamProgs = allProgs.filter(p => p.팀명 === team);
    const teamAtt = [];
    teamProgs.forEach(p => {
      if (monthAttByProg[p.사업ID]) teamAtt.push(...monthAttByProg[p.사업ID]);
    });

    let tAccum = 0;
    let tCount = 0;
    const dailyAttByProg = {}; // progId -> dateStr -> [records]

    teamAtt.forEach(a => {
      const p = progMap[a.사업ID];
      if (!p) return;
      
      const isMemberType = (p.실적유형 !== '건수' && p.실적유형 !== '건수만' && p.실적유형 !== '불특정 인원(실인원, 건수, 연인원)');
      const isUnspecifiedType = (p.실적유형 === '불특정 인원(실인원, 건수, 연인원)');
      
      if (isMemberType) {
        if (a.출석여부 === 'O') {
          tAccum++;
          grandAccum++;
        }
        const dateStr = formatDateStr(a.날짜);
        if (!dailyAttByProg[a.사업ID]) dailyAttByProg[a.사업ID] = {};
        if (!dailyAttByProg[a.사업ID][dateStr]) dailyAttByProg[a.사업ID][dateStr] = [];
        dailyAttByProg[a.사업ID][dateStr].push(a);
      } else if (isUnspecifiedType) {
        tCount += Number(a.건수) || 0;
        tAccum += Number(a.연인원) || 0;
        grandAccum += Number(a.연인원) || 0;
      } else {
        tCount += Number(a.건수) || 0;
      }
    });

    // 날짜별 그룹/개별 건수 계산
    Object.keys(dailyAttByProg).forEach(progId => {
      const datesObj = dailyAttByProg[progId];
      Object.keys(datesObj).forEach(dateStr => {
        const records = datesObj[dateStr];
        let hasGroup = false;
        let indvCount = 0;
        records.forEach(a => {
          if (a.출석여부 === 'O') {
            const mType = memberMap[a.이름] || '개별';
            if (mType === '그룹') {
              hasGroup = true;
            } else {
              indvCount++;
            }
          }
        });
        tCount += (hasGroup ? 1 : 0) + indvCount;
      });
    });
    grandCount += tCount;

    // 각 팀의 사업들 달성률 합산 및 평균
    let teamProgRateSum = 0;
    let teamProgCount = 0;

    teamProgs.forEach(p => {
      const progAtt = monthAttByProg[p.사업ID] || [];
      let pCount = 0, pAccum = 0;
      
      const isMemberType = (p.실적유형 !== '건수' && p.실적유형 !== '건수만' && p.실적유형 !== '불특정 인원(실인원, 건수, 연인원)');
      const isUnspecifiedType = (p.실적유형 === '불특정 인원(실인원, 건수, 연인원)');
      
      if (isMemberType) {
        progAtt.forEach(a => {
          if (a.출석여부 === 'O') pAccum++;
        });

        // 일자별 건수 집계
        const pDaily = {};
        progAtt.forEach(a => {
          const dateStr = formatDateStr(a.날짜);
          if (!pDaily[dateStr]) pDaily[dateStr] = [];
          pDaily[dateStr].push(a);
        });

        Object.keys(pDaily).forEach(dateStr => {
          const records = pDaily[dateStr];
          let hasGroup = false;
          let indvCount = 0;
          records.forEach(a => {
            if (a.출석여부 === 'O') {
              const mType = memberMap[a.이름] || '개별';
              if (mType === '그룹') hasGroup = true;
              else indvCount++;
            }
          });
          pCount += (hasGroup ? 1 : 0) + indvCount;
        });
      } else if (isUnspecifiedType) {
        progAtt.forEach(a => {
          pCount += Number(a.건수) || 0;
          pAccum += Number(a.연인원) || 0;
        });
      } else {
        progAtt.forEach(a => {
          pCount += Number(a.건수) || 0;
        });
      }

      const gCount = Number(p.목표_건수) || 0;
      const gAccum = Number(p.목표_연인원) || 0;

      let mainRate = 0;
      if (isMemberType || isUnspecifiedType) {
        mainRate = gAccum > 0 ? Math.round((pAccum / gAccum) * 100) : 0;
      } else {
        mainRate = gCount > 0 ? Math.round((pCount / gCount) * 100) : 0;
      }

      teamProgRateSum += mainRate;
      teamProgCount++;

      totalAllProgRateSum += mainRate;
      activeAllProgCount++;
    });

    const teamRate = teamProgCount > 0 ? Math.round(teamProgRateSum / teamProgCount) : 0;
    return { team: team, rate: teamRate };
  });

  const avgRate = activeAllProgCount > 0 ? Math.round(totalAllProgRateSum / activeAllProgCount) : 0;

  // 사업별 상세
  const programStats = allProgs.map(p => {
    const isMemberType = (p.실적유형 !== '건수' && p.실적유형 !== '건수만' && p.실적유형 !== '불특정 인원(실인원, 건수, 연인원)');
    const isUnspecifiedType = (p.실적유형 === '불특정 인원(실인원, 건수, 연인원)');
    
    // 이 사업의 선택월 실인원, 연인원 및 건수
    const progAtt = monthAttByProg[p.사업ID] || [];
    const pPriorNames = priorNamesByProg[p.사업ID] || new Set();
    const pNames = new Set();
    let pCumReal = 0;
    let pCount = 0, pAccum = 0;
    
    progAtt.forEach(a => {
      if (isMemberType && a.출석여부 === 'O' && a.이름 !== '건수입력용_무명' && a.이름 !== '불특정_인원_입력') {
        if (!pPriorNames.has(a.이름)) {
          pNames.add(a.이름);
        }
      }
      if (isUnspecifiedType) {
        pCumReal += Number(a.실인원) || 0;
      }
    });

    if (isMemberType) {
      progAtt.forEach(a => {
        if (a.출석여부 === 'O') pAccum++;
      });

      // 일자별 건수 집계
      const pDaily = {};
      progAtt.forEach(a => {
        const dateStr = formatDateStr(a.날짜);
        if (!pDaily[dateStr]) pDaily[dateStr] = [];
        pDaily[dateStr].push(a);
      });

      Object.keys(pDaily).forEach(dateStr => {
        const records = pDaily[dateStr];
        let hasGroup = false;
        let indvCount = 0;
        records.forEach(a => {
          if (a.출석여부 === 'O') {
            const mType = memberMap[a.이름] || '개별';
            if (mType === '그룹') hasGroup = true;
            else indvCount++;
          }
        });
        pCount += (hasGroup ? 1 : 0) + indvCount;
      });
    } else if (isUnspecifiedType) {
      progAtt.forEach(a => {
        pCount += Number(a.건수) || 0;
        pAccum += Number(a.연인원) || 0;
      });
    } else {
      progAtt.forEach(a => {
        pCount += Number(a.건수) || 0;
      });
    }

    const gReal = Number(p.목표_실인원) || 0;
    const gCount = Number(p.목표_건수) || 0;
    const gAccum = Number(p.목표_연인원) || 0;
    
    const actualReal = isMemberType ? pNames.size : (isUnspecifiedType ? pCumReal : 0);
    const rateReal = gReal > 0 ? Math.round((actualReal / gReal) * 100) : 0;
    const rateCount = gCount > 0 ? Math.round((pCount / gCount) * 100) : 0;
    const rateAccum = gAccum > 0 ? Math.round((pAccum / gAccum) * 100) : 0;

    return {
      팀명: p.팀명,
      사업명: p.사업명,
      목표_실인원: gReal,
      목표_건수: gCount,
      목표_연인원: gAccum,
      실인원: actualReal,
      건수: pCount,
      연인원: isMemberType ? pAccum : (isUnspecifiedType ? pAccum : 0),
      '목표대비_실인원': rateReal,
      '목표대비_건수': rateCount,
      '목표대비_연인원': rateAccum
    };
  });

  return {
    totalRealCount: grandReal.size + grandCumRealUnspecified,
    totalItemCount: grandCount,
    totalAccumCount: grandAccum,
    avgAchieveRate: avgRate,
    teamStats: teamStats,
    programs: programStats
  };
}

function getPersonalStats(staffId, year, periodType, periodValue) {
  const staff = getSheetDataAsJSON('직원_마스터').find(s => s.직원ID === staffId);
  if (!staff) return { programs: [] };
  
  const now = new Date();
  const targetYear = parseInt(year) || now.getFullYear();
  const targetMonths = getTargetMonths(periodType, periodValue);

  const staffName = String(staff.이름 || '').trim();
  const allProgs = getSheetDataAsJSON('사업_마스터', true);
  const progs = allProgs.filter(p => String(p.담당자 || '').includes(staffName));
  
  if (progs.length === 0) return { programs: [] };

  const attData = getSheetDataAsJSON('출석_원장', true);
  const memberMap = {};
  getSheetDataAsJSON('회원_마스터', true).forEach(m => {
    memberMap[m.이름] = m.구분 || '개별';
  });

  return calculateStatsCore(progs, targetYear, targetMonths, attData, memberMap);
}

// ==============================================================================
// 캐시 처리 (CacheService)
// ==============================================================================

function getCacheVersion() {
  const props = PropertiesService.getScriptProperties();
  let v = props.getProperty('DATA_VERSION');
  if (!v) {
    v = Date.now().toString();
    props.setProperty('DATA_VERSION', v);
  }
  return v;
}

function invalidateCache() {
  PropertiesService.getScriptProperties().setProperty('DATA_VERSION', Date.now().toString());
}

function putCacheChunked(cacheKey, str) {
  try {
    const cache = CacheService.getScriptCache();
    const chunkSize = 90000;
    const chunks = Math.ceil(str.length / chunkSize);
    const keys = [];
    for (let i = 0; i < chunks; i++) {
      const chunkKey = cacheKey + '_c' + i;
      cache.put(chunkKey, str.substring(i * chunkSize, (i + 1) * chunkSize), 600); // 10 minutes
      keys.push(chunkKey);
    }
    cache.put(cacheKey + '_meta', JSON.stringify(keys), 600);
  } catch (e) {
    // CacheService limit errors or other errors should not break the app
  }
}

function getCacheChunked(cacheKey) {
  try {
    const cache = CacheService.getScriptCache();
    const metaStr = cache.get(cacheKey + '_meta');
    if (!metaStr) return null;
    const keys = JSON.parse(metaStr);
    const chunks = cache.getAll(keys);
    let str = '';
    for (const k of keys) {
      if (!chunks[k]) return null;
      str += chunks[k];
    }
    return str;
  } catch (e) {
    return null;
  }
}

// ==============================================================================
// 삭제 비밀번호 기능
// ==============================================================================

function setDeletePin(pin, user) {
  if (user.staffId === 'ADMIN') return true; 
  
  const sheet = getSheet('직원_마스터');
  const vals = sheet.getDataRange().getValues();
  const hashedPin = hashPassword(pin);
  
  for (let i = 1; i < vals.length; i++) {
    if (vals[i][0] === user.staffId) {
      sheet.getRange(i + 1, 8).setValue(hashedPin);
      invalidateCache();
      return true;
    }
  }
  throw new Error('사용자 정보를 찾을 수 없습니다.');
}

function verifyDeletePin(pin, user) {
  if (!user) {
    throw new Error('인증 정보가 없습니다. 다시 로그인해 주세요.');
  }
  
  const role = String(user.role || user.직위 || user.권한 || '').trim();
  if (role !== '팀장' && role !== '관리자') {
    throw new Error('삭제 권한이 없습니다. (현재 시스템에 인식된 권한: ' + (role || '없음') + ') 권한 오류가 지속되면 우측 상단의 로그아웃 후 다시 로그인해 주세요.');
  }
  
  if (user.staffId === 'ADMIN') {
    const adminPw = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD') || '1107';
    if (pin !== adminPw && pin !== 'admin' && pin !== '1107') {
      throw new Error('비밀번호가 일치하지 않습니다.');
    }
    return true;
  }
  
  const staffData = getSheetDataAsJSON('직원_마스터', true);
  const staff = staffData.find(s => s.직원ID === user.staffId);
  if (!staff) throw new Error('사용자 정보를 찾을 수 없습니다.');
  if (!staff.삭제비밀번호) throw new Error('삭제 비밀번호가 설정되어 있지 않습니다.');
  
  if (staff.삭제비밀번호 !== hashPassword(pin) && staff.비밀번호 !== hashPassword(pin)) {
    throw new Error('비밀번호가 일치하지 않습니다.');
  }
  return true;
}

// ==============================================================================
// 트리거 설정 (근본적인 캐시 동기화 오류 해결)
// ==============================================================================

// 이 함수를 Apps Script 에디터에서 한 번 실행하면 구글 시트에서 직접 행을 삭제/추가할 때 자동으로 캐시가 무효화됩니다.
function setupAutoSyncTrigger() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 기존 트리거 확인 및 삭제 (중복 생성 방지)
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'onSpreadsheetChange') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  
  // 새 onChange 트리거 생성
  ScriptApp.newTrigger('onSpreadsheetChange')
    .forSpreadsheet(ss)
    .onChange()
    .create();
    
  return true;
}

function onSpreadsheetChange(e) {
  // 사용자가 시트에서 직접 행 삭제, 추가, 수정 등 구조적 변경을 가했을 때 캐시 무효화
  invalidateCache();
}

// ==============================================================================
// 실적_마스터 자동 저장
// ==============================================================================

function saveStatsMaster(year, periodType, periodValue, statsData, user) {
  if (!user || user.role !== '관리자') {
    throw new Error('권한이 없습니다.');
  }

  const sheet = getSheet('실적_마스터');
  const targetYear = parseInt(year);
  
  let periodLabel = '';
  if (periodType === 'quarter') {
    periodLabel = periodValue + '분기';
  } else if (periodType === 'half') {
    periodLabel = (periodValue == 1) ? '상반기' : '하반기';
  } else if (periodType === 'year') {
    periodLabel = '연간';
  } else {
    if (periodValue === 'all') periodLabel = '전체 월';
    else periodLabel = periodValue + '월';
  }

  const vals = sheet.getDataRange().getValues();
  // 기존 데이터 중 동일한 년도와 기준(periodLabel)인 데이터 삭제
  let deleted = false;
  if (vals.length > 1) {
    for (let i = vals.length - 1; i >= 1; i--) {
      // 년도는 0번째 컬럼, 기준은 1번째 컬럼
      if (String(vals[i][0]) === String(targetYear) && String(vals[i][1]) === periodLabel) {
        sheet.deleteRow(i + 1);
        deleted = true;
      }
    }
  }

  // ['년도', '기준', '팀명', '사업명', '목표_실인원', '목표_건수', '목표_연인원', '실적_실인원', '실적_건수', '실적_연인원', '달성률_실인원', '달성률_건수', '달성률_연인원']
  const newRows = [];
  if (statsData && statsData.length > 0) {
    statsData.forEach(p => {
      newRows.push([
        targetYear,
        periodLabel,
        p.팀명 || '',
        p.사업명 || '',
        p.목표_실인원 || 0,
        p.목표_건수 || 0,
        p.목표_연인원 || 0,
        p.실인원 || 0,
        p.건수 || 0,
        p.연인원 || 0,
        p['목표대비_실인원'] || 0,
        p['목표대비_건수'] || 0,
        p['목표대비_연인원'] || 0
      ]);
    });
  }

  if (newRows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, 13).setValues(newRows);
  }

  if (deleted || newRows.length > 0) {
    invalidateCache();
  }

  return true;
}