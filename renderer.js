/**
 * KU Study Matcher - Client Side Core Application Logic
 */

// --- Global Application State ---
let currentRoom = null;
let recentRooms = [];
let activeYear = new Date().getFullYear();
let activeMonth = new Date().getMonth(); // 0-indexed
let selectedDate = null; // YYYY-MM-DD format
let heatmapDate = null; // YYYY-MM-DD format
let editingMember = null; // Member object being edited
let deletePendingMember = null; // Member object pending password verification for deletion
let isDraggingTimeCell = false;
let dragStartSelected = false; // Is the start cell of the drag selected?

// Temporal storage for modal input before user clicks 'Save'
let tempAvailabilities = []; // Array of { date: 'YYYY-MM-DD', time: 'HH:MM' }

// Timer for real-time countdown
let countdownInterval = null;

// --- Helper Functions ---
function generateUUID() {
  return 'room-' + Math.random().toString(36).substring(2, 9) + '-' + Math.random().toString(36).substring(2, 9);
}

function getFormattedDate(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function showToast(message, type = 'success') {
  const toast = document.getElementById('toast-message');
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  setTimeout(() => {
    toast.className = 'toast';
  }, 3000);
}

// Check if running in Electron environment
const isElectron = typeof window.electronAPI !== 'undefined';

// --- Data Layer (localStorage) ---
function loadRecentRooms() {
  try {
    const data = localStorage.getItem('ku_study_recent_rooms');
    recentRooms = data ? JSON.parse(data) : [];
  } catch (e) {
    console.error('Failed to load recent rooms', e);
    recentRooms = [];
  }
}

function saveRecentRoom(roomId, roomName) {
  loadRecentRooms();
  // Avoid duplicates
  recentRooms = recentRooms.filter(r => r.id !== roomId);
  recentRooms.unshift({ id: roomId, name: roomName, lastVisited: new Date().toISOString() });
  // Limit to 5 recent rooms
  if (recentRooms.length > 5) recentRooms.pop();
  localStorage.setItem('ku_study_recent_rooms', JSON.stringify(recentRooms));
}

function loadRoomFromStorage(roomId) {
  try {
    const data = localStorage.getItem(`ku_study_room_${roomId}`);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    console.error('Failed to load room data', e);
    return null;
  }
}

function saveRoomToStorage(roomObj) {
  try {
    localStorage.setItem(`ku_study_room_${roomObj.roomId}`, JSON.stringify(roomObj));
  } catch (e) {
    console.error('Failed to save room data', e);
  }
}

// --- DOM elements ---
const setupSection = document.getElementById('setup-section');
const roomSection = document.getElementById('room-section');
const createRoomForm = document.getElementById('create-room-form');
const recentRoomsContainer = document.getElementById('recent-rooms-container');
const goHomeBtn = document.getElementById('go-home');
const systemStatusText = document.getElementById('system-status');

// Room Detail Banner DOMs
const viewRoomName = document.getElementById('view-room-name');
const viewMinMembers = document.getElementById('view-min-members');
const viewDeadline = document.getElementById('view-deadline');
const countdownDisplay = document.getElementById('countdown-display');
const roomStatusBadge = document.getElementById('room-status-badge');
const inviteLinkInput = document.getElementById('invite-link-input');
const btnCopyLink = document.getElementById('btn-copy-link');

// Participants & Heatmap DOMs
const participantCount = document.getElementById('participant-count');
const participantsList = document.getElementById('participants-list');
const btnOpenInputModal = document.getElementById('btn-open-input-modal');
const btnForceMatch = document.getElementById('btn-force-match');
const btnBackHome = document.getElementById('btn-back-home');
const heatmapDateDisplay = document.getElementById('heatmap-date-display');
const heatmapPrevDay = document.getElementById('heatmap-prev-day');
const heatmapNextDay = document.getElementById('heatmap-next-day');
const heatmapGrid = document.getElementById('heatmap-grid');
const legendMax = document.getElementById('legend-max');

// Results & Candidates DOMs
const finalResultCard = document.getElementById('final-result-card');
const finalResultContainer = document.getElementById('final-result-container');
const matchingCandidatesList = document.getElementById('matching-candidates-list');

// Input Modal DOMs
const inputModal = document.getElementById('input-modal');
const modalTitle = document.getElementById('modal-title');
const modalClose = document.getElementById('modal-close');
const btnCancelInput = document.getElementById('btn-cancel-input');
const btnSaveInput = document.getElementById('btn-save-input');
const memberNameInput = document.getElementById('member-name');
const memberPasswordInput = document.getElementById('member-password');
const calMonthYear = document.getElementById('cal-month-year');
const calPrevMonth = document.getElementById('cal-prev-month');
const calNextMonth = document.getElementById('cal-next-month');
const calendarDatesGrid = document.getElementById('calendar-dates-grid');
const selectedDateLabel = document.getElementById('selected-date-label');
const modalTimeGrid = document.getElementById('modal-time-grid');
const btnSelectAllDay = document.getElementById('btn-select-all-day');

// Verification Modal DOMs
const verifyModal = document.getElementById('verify-modal');
const verifyModalClose = document.getElementById('verify-modal-close');
const btnVerifyCancel = document.getElementById('btn-verify-cancel');
const btnVerifyConfirm = document.getElementById('btn-verify-confirm');
const verifyPasswordInput = document.getElementById('verify-password');

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
  if (isElectron) {
    systemStatusText.textContent = "KU 데스크톱 모드";
  } else {
    systemStatusText.textContent = "KU 웹브라우저 모드";
  }

  // Parse URL to check if entering via invite link
  const urlParams = new URLSearchParams(window.location.search);
  const roomIdFromUrl = urlParams.get('room');

  if (roomIdFromUrl) {
    const room = loadRoomFromStorage(roomIdFromUrl);
    if (room) {
      loadRoomDashboard(room);
    } else {
      showToast('초대 받은 스터디 방이 존재하지 않거나 만료되었습니다.', 'error');
      window.history.replaceState({}, document.title, window.location.pathname);
      showSetupScreen();
    }
  } else {
    showSetupScreen();
  }

  setupEventListeners();
});

// --- Event Listeners Setup ---
function setupEventListeners() {
  // Navigation
  goHomeBtn.addEventListener('click', () => {
    if (confirm('메인 화면으로 이동하시겠습니까? 현재 보고 계신 방 정보가 닫힙니다.')) {
      window.history.replaceState({}, document.title, window.location.pathname);
      showSetupScreen();
    }
  });

  btnBackHome.addEventListener('click', () => {
    window.history.replaceState({}, document.title, window.location.pathname);
    showSetupScreen();
  });

  // Create Room
  createRoomForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const roomName = document.getElementById('room-name').value.trim();
    const minMembers = parseInt(document.getElementById('min-members').value, 10);
    const deadlineVal = document.getElementById('deadline-time').value;

    if (!roomName || isNaN(minMembers) || !deadlineVal) {
      showToast('모든 필수 입력값을 작성해 주세요.', 'error');
      return;
    }

    const deadlineDate = new Date(deadlineVal);
    if (deadlineDate <= new Date()) {
      showToast('마감 시한은 현재 시간보다 미래여야 합니다.', 'error');
      return;
    }

    const roomId = generateUUID();
    const newRoom = {
      roomId,
      roomName,
      minMembers,
      deadline: deadlineDate.toISOString(),
      createdAt: new Date().toISOString(),
      status: 'active', // active, matched, failed
      members: []
    };

    saveRoomToStorage(newRoom);
    saveRecentRoom(roomId, roomName);
    showToast('스터디 방이 성공적으로 개설되었습니다!');
    
    // Set URL and Load Dashboard
    const newUrl = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
    window.history.pushState({ path: newUrl }, '', newUrl);
    loadRoomDashboard(newRoom);
  });

  // Copy Invite Link
  btnCopyLink.addEventListener('click', () => {
    inviteLinkInput.select();
    inviteLinkInput.setSelectionRange(0, 99999); // For mobile devices
    try {
      navigator.clipboard.writeText(inviteLinkInput.value);
      showToast('초대 링크가 클립보드에 복사되었습니다!');
    } catch (err) {
      // Fallback
      document.execCommand('copy');
      showToast('초대 링크가 복사되었습니다!');
    }
  });

  // Modal Controllers
  btnOpenInputModal.addEventListener('click', () => {
    if (currentRoom.status !== 'active') {
      showToast('이미 마감된 스터디 방입니다.', 'warning');
      return;
    }
    openAvailabilityModal();
  });

  modalClose.addEventListener('click', closeAvailabilityModal);
  btnCancelInput.addEventListener('click', closeAvailabilityModal);

  // Calendar navigation in modal
  calPrevMonth.addEventListener('click', () => {
    activeMonth--;
    if (activeMonth < 0) {
      activeMonth = 11;
      activeYear--;
    }
    renderCalendarGrid();
  });

  calNextMonth.addEventListener('click', () => {
    activeMonth++;
    if (activeMonth > 11) {
      activeMonth = 0;
      activeYear++;
    }
    renderCalendarGrid();
  });

  // Save Availabilities
  btnSaveInput.addEventListener('click', handleSaveMemberAvailability);

  // Time grid select all day
  btnSelectAllDay.addEventListener('click', () => {
    if (!selectedDate) return;
    const hours = generateHoursArray();
    
    // Check if all are already selected
    const allSelected = hours.every(h => 
      tempAvailabilities.some(a => a.date === selectedDate && a.time === h)
    );

    if (allSelected) {
      // Unselect all for this day
      tempAvailabilities = tempAvailabilities.filter(a => a.date !== selectedDate);
    } else {
      // Select all for this day
      tempAvailabilities = tempAvailabilities.filter(a => a.date !== selectedDate);
      hours.forEach(h => {
        tempAvailabilities.push({ date: selectedDate, time: h });
      });
    }
    renderTimeGrid(selectedDate);
    renderCalendarGrid(); // Refresh to update dots
  });

  // Verify Modal Controllers
  verifyModalClose.addEventListener('click', closeVerifyModal);
  btnVerifyCancel.addEventListener('click', closeVerifyModal);
  btnVerifyConfirm.addEventListener('click', handleVerifyConfirm);

  // Heatmap Navigation
  heatmapPrevDay.addEventListener('click', () => {
    changeHeatmapDate(-1);
  });
  heatmapNextDay.addEventListener('click', () => {
    changeHeatmapDate(1);
  });

  // Manual Force Match
  btnForceMatch.addEventListener('click', () => {
    if (currentRoom.status !== 'active') {
      showToast('이미 결과가 결정된 방입니다.', 'warning');
      return;
    }
    if (confirm('마감 시간을 기다리지 않고 즉시 매칭을 종료하여 결과를 확정하겠습니까?')) {
      executeMatching(true);
    }
  });

  // Mouse drag selection logic in time grid
  const grid = document.getElementById('modal-time-grid');
  
  grid.addEventListener('mousedown', (e) => {
    const cell = e.target.closest('.time-cell');
    if (!cell) return;

    isDraggingTimeCell = true;
    const timeVal = cell.dataset.time;
    const isSelected = cell.classList.contains('selected');
    
    // If first cell was selected, we drag to unselect. If not, we drag to select.
    dragStartSelected = !isSelected;
    toggleTimeSlot(selectedDate, timeVal, dragStartSelected);
    
    cell.classList.toggle('selected', dragStartSelected);
    renderCalendarGrid();
    e.preventDefault();
  });

  window.addEventListener('mouseup', () => {
    isDraggingTimeCell = false;
  });
}

// --- Navigation & View Switching ---
function showSetupScreen() {
  currentRoom = null;
  if (countdownInterval) {
    clearInterval(countdownInterval);
  }
  
  setupSection.classList.add('active');
  roomSection.classList.remove('active');

  // Render recent rooms
  loadRecentRooms();
  renderRecentRoomsList();
}

function loadRoomDashboard(roomObj) {
  currentRoom = roomObj;
  
  setupSection.classList.remove('active');
  roomSection.classList.add('active');

  // Update room metadata fields
  viewRoomName.textContent = roomObj.roomName;
  viewMinMembers.textContent = roomObj.minMembers;
  
  const dDate = new Date(roomObj.deadline);
  const formattedDeadline = `${dDate.getFullYear()}년 ${String(dDate.getMonth() + 1).padStart(2, '0')}월 ${String(dDate.getDate()).padStart(2, '0')}일 ${String(dDate.getHours()).padStart(2, '0')}:${String(dDate.getMinutes()).padStart(2, '0')}`;
  viewDeadline.textContent = formattedDeadline;

  // Set invite link
  const currentUrl = `${window.location.origin}${window.location.pathname}?room=${roomObj.roomId}`;
  inviteLinkInput.value = currentUrl;

  // Setup Heatmap Date
  if (roomObj.members.length > 0) {
    // Default to the first date found in member availabilities or today
    let foundDate = null;
    for (const member of roomObj.members) {
      if (member.availabilities.length > 0) {
        foundDate = member.availabilities[0].date;
        break;
      }
    }
    heatmapDate = foundDate || getFormattedDate(new Date());
  } else {
    heatmapDate = getFormattedDate(new Date());
  }

  // Set Admin Button visibility
  if (roomObj.status === 'active') {
    btnForceMatch.style.display = 'block';
  } else {
    btnForceMatch.style.display = 'none';
  }

  // Trigger countdown timer
  startCountdownTimer(roomObj.deadline);

  // Render Dashboard components
  refreshDashboardUI();
}

function refreshDashboardUI() {
  if (!currentRoom) return;

  // 1. Participant List
  renderParticipantsList();

  // 2. Heatmap
  renderHeatmap();

  // 3. Candidates
  renderMatchingCandidates();

  // 4. Final Result (if closed)
  checkDeadlineAndExecute();
}

// --- Recent Rooms Component ---
function renderRecentRoomsList() {
  recentRoomsContainer.innerHTML = '';
  
  if (recentRooms.length === 0) {
    recentRoomsContainer.classList.add('empty');
    recentRoomsContainer.innerHTML = `<p class="placeholder-text">최근 개설하거나 참여한 스터디 방이 없습니다.</p>`;
    return;
  }

  recentRoomsContainer.classList.remove('empty');
  recentRooms.forEach(room => {
    const item = document.createElement('div');
    item.className = 'room-item';
    
    // Format last visited
    const lastDate = new Date(room.lastVisited);
    const dateStr = `${lastDate.getMonth() + 1}월 ${lastDate.getDate()}일 ${String(lastDate.getHours()).padStart(2, '0')}:${String(lastDate.getMinutes()).padStart(2, '0')}`;

    item.innerHTML = `
      <div class="room-item-info">
        <h4>${room.name}</h4>
        <p>최근 접속: ${dateStr}</p>
      </div>
      <span class="room-item-link">입장 &rarr;</span>
    `;

    item.addEventListener('click', () => {
      const fullRoom = loadRoomFromStorage(room.id);
      if (fullRoom) {
        // Set URL and Load Dashboard
        const newUrl = `${window.location.origin}${window.location.pathname}?room=${room.id}`;
        window.history.pushState({ path: newUrl }, '', newUrl);
        loadRoomDashboard(fullRoom);
      } else {
        showToast('해당 방 데이터가 로컬 스토리지에 존재하지 않습니다.', 'error');
        // Clean up from recent list
        recentRooms = recentRooms.filter(r => r.id !== room.id);
        localStorage.setItem('ku_study_recent_rooms', JSON.stringify(recentRooms));
        renderRecentRoomsList();
      }
    });

    recentRoomsContainer.appendChild(item);
  });
}

// --- Participants List Component ---
function renderParticipantsList() {
  participantsList.innerHTML = '';
  participantCount.textContent = currentRoom.members.length;

  if (currentRoom.members.length === 0) {
    participantsList.classList.add('empty');
    participantsList.innerHTML = `<p class="placeholder-text">시간을 입력한 스터디원이 아직 없습니다.</p>`;
    return;
  }

  participantsList.classList.remove('empty');
  currentRoom.members.forEach(member => {
    const badge = document.createElement('div');
    badge.className = 'participant-badge';

    // Limit display length of names
    const displayName = member.name.length > 5 ? member.name.substring(0, 4) + '..' : member.name;
    const totalSlots = member.availabilities.length;

    badge.innerHTML = `
      <span>${displayName} (${totalSlots}칸)</span>
      <div class="participant-actions">
        <button class="participant-action-btn edit-btn" title="수정">
          <svg class="icon-sm" viewBox="0 0 24 24"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
        </button>
        <button class="participant-action-btn delete-btn" title="삭제">
          <svg class="icon-sm" viewBox="0 0 24 24"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
      </div>
    `;

    // Edit handler
    badge.querySelector('.edit-btn').addEventListener('click', () => {
      if (currentRoom.status !== 'active') {
        showToast('이미 마감되어 정보를 수정할 수 없습니다.', 'warning');
        return;
      }
      openVerifyModal(member, 'edit');
    });

    // Delete handler
    badge.querySelector('.delete-btn').addEventListener('click', () => {
      if (currentRoom.status !== 'active') {
        showToast('이미 마감되어 정보를 삭제할 수 없습니다.', 'warning');
        return;
      }
      openVerifyModal(member, 'delete');
    });

    participantsList.appendChild(badge);
  });
}

// --- Heatmap Component ---
function changeHeatmapDate(direction) {
  const current = new Date(heatmapDate);
  current.setDate(current.getDate() + direction);
  heatmapDate = getFormattedDate(current);
  renderHeatmap();
}

function renderHeatmap() {
  const dObj = new Date(heatmapDate);
  const formattedDay = `${dObj.getFullYear()}년 ${String(dObj.getMonth() + 1).padStart(2, '0')}월 ${String(dObj.getDate()).padStart(2, '0')}일`;
  heatmapDateDisplay.textContent = formattedDay;

  heatmapGrid.innerHTML = '';

  const hours = generateHoursArray();
  const totalMembers = currentRoom.members.length;
  legendMax.textContent = `${totalMembers}명`;

  // Calculate aggregation for the current date
  hours.forEach(hour => {
    const matchingMembers = [];
    currentRoom.members.forEach(member => {
      const hasSlot = member.availabilities.some(a => a.date === heatmapDate && a.time === hour);
      if (hasSlot) {
        matchingMembers.push(member.name);
      }
    });

    const count = matchingMembers.length;
    const cell = document.createElement('div');
    cell.className = 'heatmap-cell';

    // Calculate background opacity based on count
    let opacity = 0;
    if (totalMembers > 0 && count > 0) {
      opacity = count / totalMembers;
    }

    // Apply color representing Crimson Red with varying opacity
    if (count > 0) {
      cell.style.backgroundColor = `rgba(139, 0, 41, ${0.1 + opacity * 0.9})`;
      cell.style.borderColor = 'rgba(139, 0, 41, 0.4)';
      cell.style.color = opacity > 0.6 ? '#ffffff' : 'var(--color-dark)';
    }

    // Tooltip detailing who is available
    const tooltipText = count > 0 
      ? `참여자: ${matchingMembers.join(', ')}`
      : '가능 인원 없음';

    cell.innerHTML = `
      <span class="heatmap-cell-time">${hour}</span>
      <span class="heatmap-cell-count" style="color: inherit;">${count}명 가능</span>
      <div class="heatmap-tooltip">${tooltipText}</div>
    `;

    heatmapGrid.appendChild(cell);
  });
}

// --- Candidates & Matching Logic Component ---
function aggregateAvailabilities(members) {
  const counts = {}; // Structure: { "YYYY-MM-DD HH:MM": [ "name1", "name2" ] }
  members.forEach(member => {
    member.availabilities.forEach(slot => {
      const key = `${slot.date} ${slot.time}`;
      if (!counts[key]) counts[key] = [];
      if (!counts[key].includes(member.name)) {
        counts[key].push(member.name);
      }
    });
  });
  return counts;
}

function renderMatchingCandidates() {
  matchingCandidatesList.innerHTML = '';
  
  const minMembers = currentRoom.minMembers;
  const aggregated = aggregateAvailabilities(currentRoom.members);
  
  // Filter for key slots satisfying minimum member criteria
  const candidates = [];
  for (const [datetime, membersArray] of Object.entries(aggregated)) {
    if (membersArray.length >= minMembers) {
      const [date, time] = datetime.split(' ');
      candidates.push({
        datetime,
        date,
        time,
        members: membersArray
      });
    }
  }

  // Sort: 1) Most members (descending), 2) Earliest date/time (ascending)
  candidates.sort((a, b) => {
    if (b.members.length !== a.members.length) {
      return b.members.length - a.members.length;
    }
    return a.datetime.localeCompare(b.datetime);
  });

  if (candidates.length === 0) {
    matchingCandidatesList.classList.add('empty');
    matchingCandidatesList.innerHTML = `
      <p class="placeholder-text">최소 성원(${minMembers}명)을 충족하는 시간대가 없습니다.<br>더 많은 스터디원이 시간을 작성하거나 조건을 조정해야 합니다.</p>
    `;
    return;
  }

  matchingCandidatesList.classList.remove('empty');
  candidates.forEach((cand, index) => {
    const item = document.createElement('div');
    item.className = 'candidate-item';
    if (index === 0) {
      item.classList.add('gold-rank'); // Highlight top recommendation
    }

    // Format date beautifully
    const dObj = new Date(cand.date);
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    const dateFormatted = `${dObj.getMonth() + 1}월 ${dObj.getDate()}일(${dayNames[dObj.getDay()]})`;

    item.innerHTML = `
      <div class="candidate-rank">${index + 1}</div>
      <div class="candidate-details">
        <div class="candidate-time">${dateFormatted} ${cand.time}</div>
        <div class="candidate-members">참여자: ${cand.members.join(', ')}</div>
      </div>
      <div class="candidate-count-badge">${cand.members.length}명</div>
    `;

    matchingCandidatesList.appendChild(item);
  });
}

// --- Deadline Verification & Matching Execution ---
function startCountdownTimer(deadlineStr) {
  if (countdownInterval) {
    clearInterval(countdownInterval);
  }

  const deadline = new Date(deadlineStr).getTime();

  function updateTimer() {
    const now = new Date().getTime();
    const distance = deadline - now;

    if (distance < 0) {
      clearInterval(countdownInterval);
      countdownDisplay.textContent = "모집 마감됨";
      countdownDisplay.style.color = "var(--color-error)";
      checkDeadlineAndExecute();
      return;
    }

    const days = Math.floor(distance / (1000 * 60 * 60 * 24));
    const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((distance % (1000 * 60)) / 1000);

    countdownDisplay.textContent = `${days}일 ${String(hours).padStart(2, '0')}시간 ${String(minutes).padStart(2, '0')}분 ${String(seconds).padStart(2, '0')}초`;
    countdownDisplay.style.color = "var(--color-crimson)";
  }

  updateTimer();
  countdownInterval = setInterval(updateTimer, 1000);
}

function checkDeadlineAndExecute() {
  if (!currentRoom) return;

  const now = new Date();
  const deadlineDate = new Date(currentRoom.deadline);

  if (now >= deadlineDate && currentRoom.status === 'active') {
    // Automatically close and execute
    executeMatching(false);
  } else if (currentRoom.status !== 'active') {
    // Already closed, display results card
    renderFinalResultCard();
  } else {
    // Active and still open
    finalResultCard.style.display = 'none';
    roomStatusBadge.textContent = "신청 진행 중";
    roomStatusBadge.className = "badge badge-primary";
  }
}

function executeMatching(isForced = false) {
  if (!currentRoom) return;

  const minMembers = currentRoom.minMembers;
  const aggregated = aggregateAvailabilities(currentRoom.members);
  
  // Identify candidates matching constraints
  const candidates = [];
  for (const [datetime, membersArray] of Object.entries(aggregated)) {
    if (membersArray.length >= minMembers) {
      const [date, time] = datetime.split(' ');
      candidates.push({
        datetime,
        date,
        time,
        members: membersArray
      });
    }
  }

  // Sort
  candidates.sort((a, b) => {
    if (b.members.length !== a.members.length) {
      return b.members.length - a.members.length;
    }
    return a.datetime.localeCompare(b.datetime);
  });

  if (candidates.length > 0) {
    // Matching successful! Select the top candidate
    currentRoom.status = 'matched';
    currentRoom.finalMatch = candidates[0]; // { date, time, members }
  } else {
    // Matching failed
    currentRoom.status = 'failed';
    currentRoom.finalMatch = null;
  }

  saveRoomToStorage(currentRoom);
  btnForceMatch.style.display = 'none';
  
  showToast(
    currentRoom.status === 'matched' 
      ? '축하합니다! 스터디 그룹 매칭이 확정되었습니다.' 
      : '모집이 종료되었으나 성원 미달로 매칭에 실패했습니다.', 
    currentRoom.status === 'matched' ? 'success' : 'error'
  );

  refreshDashboardUI();
}

function renderFinalResultCard() {
  finalResultCard.style.display = 'block';
  finalResultContainer.innerHTML = '';

  if (currentRoom.status === 'matched' && currentRoom.finalMatch) {
    roomStatusBadge.textContent = "매칭 완료";
    roomStatusBadge.className = "badge badge-success";

    const match = currentRoom.finalMatch;
    const dObj = new Date(match.date);
    const formattedDateString = `${dObj.getFullYear()}년 ${dObj.getMonth() + 1}월 ${dObj.getDate()}일`;

    finalResultContainer.innerHTML = `
      <div class="result-success-box">
        <h4>🐯 최적 시간대 매칭 성공!</h4>
        <p><strong>확정된 모임:</strong> ${formattedDateString} ${match.time}</p>
        <p class="mt-10"><strong>참여자 (${match.members.length}명):</strong> ${match.members.join(', ')}</p>
        <p class="mt-15" style="font-size: 11px; opacity: 0.95;">* 스터디원들은 위 일정에 맞춰 모임을 준비해 주세요.</p>
      </div>
    `;
  } else if (currentRoom.status === 'failed') {
    roomStatusBadge.textContent = "매칭 실패";
    roomStatusBadge.className = "badge badge-error";

    finalResultContainer.innerHTML = `
      <div class="result-fail-box">
        <h4>⚠️ 매칭 실패 안내</h4>
        <p>성원 미달로 모임이 취소되었습니다. 최소 성원 조건을 낮추거나 마감 시한을 변경하여 방을 새로 개설해 주세요.</p>
      </div>
    `;
  }
}

// --- Member Availability Input Modal ---
function openAvailabilityModal(memberObj = null) {
  editingMember = memberObj;
  
  if (memberObj) {
    // Edit existing member mode
    modalTitle.textContent = '나의 가용 시간 수정';
    memberNameInput.value = memberObj.name;
    memberNameInput.readOnly = true; // Protect name from change
    memberPasswordInput.value = ''; // Fill password placeholder
    memberPasswordInput.placeholder = '비밀번호를 입력하세요 (수정용)';
    
    // Copy existing availabilities into temporary cache
    tempAvailabilities = [...memberObj.availabilities];
  } else {
    // New member mode
    modalTitle.textContent = '나의 가용 시간 입력';
    memberNameInput.value = '';
    memberNameInput.readOnly = false;
    memberPasswordInput.value = '';
    memberPasswordInput.placeholder = '4자리 비밀번호';
    
    tempAvailabilities = [];
  }

  // Set initial selected date to today
  selectedDate = getFormattedDate(new Date());
  
  // Set calendar view to today
  activeYear = new Date().getFullYear();
  activeMonth = new Date().getMonth();

  inputModal.classList.add('active');

  renderCalendarGrid();
  renderTimeGrid(selectedDate);
}

function closeAvailabilityModal() {
  inputModal.classList.remove('active');
  editingMember = null;
  selectedDate = null;
  tempAvailabilities = [];
}

// Draw the monthly calendar grid dynamically
function renderCalendarGrid() {
  calendarDatesGrid.innerHTML = '';
  
  const year = activeYear;
  const month = activeMonth;

  // Set header
  calMonthYear.textContent = `${year}년 ${String(month + 1).padStart(2, '0')}월`;

  // First day of current month
  const firstDay = new Date(year, month, 1).getDay();
  // Total days in current month
  const totalDays = new Date(year, month + 1, 0).getDate();

  const todayStr = getFormattedDate(new Date());

  // 1. Fill empty cells for days before the 1st
  for (let i = 0; i < firstDay; i++) {
    const emptyCell = document.createElement('div');
    emptyCell.className = 'calendar-date-cell disabled';
    calendarDatesGrid.appendChild(emptyCell);
  }

  // 2. Fill actual dates of the month
  for (let date = 1; date <= totalDays; date++) {
    const cellDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`;
    const cell = document.createElement('div');
    cell.className = 'calendar-date-cell';
    cell.textContent = date;

    const cellDate = new Date(year, month, date);
    const isPast = cellDateStr < todayStr;

    if (isPast) {
      cell.classList.add('disabled');
    } else {
      // Check if this date has selected slots
      const hasSlots = tempAvailabilities.some(a => a.date === cellDateStr);
      if (hasSlots) {
        cell.classList.add('has-data');
      }

      // Check if current active selection
      if (selectedDate === cellDateStr) {
        cell.classList.add('selected');
      }

      cell.addEventListener('click', () => {
        selectedDate = cellDateStr;
        
        // Remove previous selected class
        const prevSelected = calendarDatesGrid.querySelector('.calendar-date-cell.selected');
        if (prevSelected) prevSelected.classList.remove('selected');
        
        cell.classList.add('selected');
        renderTimeGrid(selectedDate);
      });
    }

    calendarDatesGrid.appendChild(cell);
  }
}

function generateHoursArray() {
  const hours = [];
  for (let h = 9; h <= 24; h++) {
    const formattedHour = String(h).padStart(2, '0') + ':00';
    hours.push(formattedHour);
  }
  return hours;
}

function renderTimeGrid(dateStr) {
  selectedDateLabel.textContent = dateStr 
    ? `${dateStr.split('-')[1]}월 ${dateStr.split('-')[2]}일 시간 선택`
    : '날짜를 선택해 주세요';

  modalTimeGrid.innerHTML = '';
  
  if (!dateStr) {
    btnSelectAllDay.style.display = 'none';
    modalTimeGrid.innerHTML = '<p class="placeholder-text" style="grid-column: span 2;">달력에서 먼저 날짜를 선택해 주세요.</p>';
    return;
  }

  btnSelectAllDay.style.display = 'block';
  const hours = generateHoursArray();

  hours.forEach(hour => {
    const isSelected = tempAvailabilities.some(a => a.date === dateStr && a.time === hour);
    
    const cell = document.createElement('div');
    cell.className = 'time-cell';
    if (isSelected) cell.classList.add('selected');
    cell.textContent = hour;
    cell.dataset.time = hour;

    // Mouse drag hover listeners
    cell.addEventListener('mouseenter', () => {
      if (isDraggingTimeCell) {
        toggleTimeSlot(dateStr, hour, dragStartSelected);
        cell.classList.toggle('selected', dragStartSelected);
        renderCalendarGrid(); // Refresh dots
      }
    });

    modalTimeGrid.appendChild(cell);
  });
}

function toggleTimeSlot(date, time, forceSelect = null) {
  const idx = tempAvailabilities.findIndex(a => a.date === date && a.time === time);
  
  const shouldSelect = forceSelect !== null ? forceSelect : (idx === -1);

  if (shouldSelect) {
    if (idx === -1) {
      tempAvailabilities.push({ date, time });
    }
  } else {
    if (idx !== -1) {
      tempAvailabilities.splice(idx, 1);
    }
  }
}

// --- Submit Member Availability ---
function handleSaveMemberAvailability() {
  const name = memberNameInput.value.trim();
  const password = memberPasswordInput.value.trim();

  if (!name || !password) {
    showToast('이름과 비밀번호를 모두 입력해 주세요.', 'error');
    return;
  }

  if (password.length !== 4 || isNaN(parseInt(password, 10))) {
    showToast('비밀번호는 4자리 숫자여야 합니다.', 'error');
    return;
  }

  if (tempAvailabilities.length === 0) {
    if (!confirm('가능한 시간대가 등록되지 않았습니다. 이대로 저장하시겠습니까?')) {
      return;
    }
  }

  if (editingMember) {
    // Edit Mode: Update values in member
    const existingIndex = currentRoom.members.findIndex(m => m.name === editingMember.name);
    
    // Check password matches initial save
    if (currentRoom.members[existingIndex].passwordHash !== password) {
      showToast('비밀번호가 일치하지 않습니다. 본인 인증 실패!', 'error');
      return;
    }

    currentRoom.members[existingIndex].availabilities = [...tempAvailabilities];
    showToast('가용 시간이 성공적으로 수정되었습니다.');
  } else {
    // Add Mode: Validate duplicate nickname
    const isDuplicate = currentRoom.members.some(m => m.name === name);
    if (isDuplicate) {
      showToast('이미 사용 중인 닉네임입니다. 다른 닉네임을 설정해 주세요.', 'error');
      return;
    }

    const newMember = {
      name,
      passwordHash: password, // Store password directly as basic mechanism
      availabilities: [...tempAvailabilities]
    };

    currentRoom.members.push(newMember);
    showToast('가용 시간이 성공적으로 등록되었습니다!');
  }

  saveRoomToStorage(currentRoom);
  refreshDashboardUI();
  closeAvailabilityModal();
}

// --- Verification & Deletion Modals ---
let verificationAction = null; // 'edit' or 'delete'
let targetVerifyMember = null;

function openVerifyModal(member, action) {
  targetVerifyMember = member;
  verificationAction = action;
  verifyPasswordInput.value = '';
  verifyModal.classList.add('active');
  verifyPasswordInput.focus();
}

function closeVerifyModal() {
  verifyModal.classList.remove('active');
  targetVerifyMember = null;
  verificationAction = null;
}

function handleVerifyConfirm() {
  const password = verifyPasswordInput.value.trim();
  
  if (!password) {
    showToast('비밀번호를 입력해 주세요.', 'error');
    return;
  }

  if (targetVerifyMember.passwordHash !== password) {
    showToast('비밀번호가 올바르지 않습니다. 본인 인증에 실패했습니다.', 'error');
    return;
  }

  // Password confirmed successfully
  closeVerifyModal();

  if (verificationAction === 'edit') {
    openAvailabilityModal(targetVerifyMember);
  } else if (verificationAction === 'delete') {
    if (confirm(`정말로 ${targetVerifyMember.name} 님의 입력 데이터를 삭제하시겠습니까?`)) {
      currentRoom.members = currentRoom.members.filter(m => m.name !== targetVerifyMember.name);
      saveRoomToStorage(currentRoom);
      showToast('참여자 데이터가 삭제되었습니다.', 'warning');
      refreshDashboardUI();
    }
  }
}
