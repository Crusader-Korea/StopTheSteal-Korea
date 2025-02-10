// import { logger, LogLevel } from './utils/logger.js';

// 팝업 전용 로거 설정
window.logger.prefix = 'Popup';

// 설정 관련 전역 변수
let autoRegisterSettings = {
  title: '',
  content: ''
};

document.addEventListener('DOMContentLoaded', async function() {
  logger.group('초기화');
  logger.info('DOMContentLoaded 이벤트 발생');
  
  try {
    logger.time('DOM 로딩');
    // DOM 요소들을 가져오기
    const loginButton = document.getElementById('login-button');
    logger.debug('loginButton 요소:', loginButton ? '찾음' : '못찾음');
    
    if (loginButton) {
      loginButton.onclick = async function(e) {
        logger.group('로그인 프로세스');
        try {
          logger.info('로그인 버튼 클릭 이벤트 발생');
          e.preventDefault();
          e.stopPropagation();
          
          logger.info('로그인 탭 생성 시도');

          alert('로그인이 완료되면 자동으로 창이 닫힙니다.');

          // background script에 로그인 처리 요청
          chrome.runtime.sendMessage({ 
            action: "startLogin"
          }, (response) => {
            if (response.success) {
              location.reload();  // 팝업 새로고침
            }
          });

        } catch (error) {
          logger.error('로그인 처리 중 오류:', error);
        } finally {
          logger.groupEnd();
        }
      };
    } else {
      logger.error('로그인 버튼을 찾을 수 없음 (초기)', 'error');
    }
    
    // 나머지 DOM 요소들 가져오기
    const loginStatus = document.getElementById('login-status');
    const billsCount = document.getElementById('bills-count');
    const billsList = document.getElementById('bills-list');
    const totalCountElement = document.getElementById('total-count');
    
    // 각 요소의 존재 여부 확인
    logger.debug('loginStatus 요소:', loginStatus);
    logger.debug('billsCount 요소:', billsCount);
    logger.debug('billsList 요소:', billsList);
    
    // querySelector로도 시도해보기
    const loginButtonAlt = document.querySelector('#login-button');
    logger.debug('querySelector로 찾은 loginButton:', loginButtonAlt);
    
    // 로그인 상태 로딩 표시
    if (loginStatus) {
      loginStatus.textContent = '확인 중...';
      loginStatus.classList.add('checking');
    } else {
      logger.error('loginStatus 요소를 찾을 수 없습니다', 'error');
    }
    
    try {
      // 로그인 상태 확인
      const response = await fetch('https://www.assembly.go.kr/portal/main/main.do', {
        credentials: 'include'
      });

      const text = await response.text();
      const isLoggedIn = text.includes('/portal/member/user/logout2.do');
      logger.debug('로그인 상태:', isLoggedIn);

      if (isLoggedIn) {
        logger.info('로그인 확인됨, UI 업데이트');
        loginStatus.textContent = '로그인됨';
        loginStatus.classList.add('logged-in');
        loginButton.classList.add('hidden');
      } else {
        logger.info('로그아웃 상태, UI 업데이트');
        loginStatus.textContent = '로그인 필요';
        loginStatus.classList.remove('logged-in');
        loginButton.classList.remove('hidden');
      }
    } catch (error) {
      logger.error('로그인 상태 확인 실패:', error, 'error');
      loginStatus.textContent = '로그인 필요';
      loginStatus.classList.remove('checking');
      loginButton.classList.remove('hidden');
    } finally {
      loginStatus.classList.remove('checking');
    }
    
    // 법안 목록 로딩 표시를 더 동적으로 변경
    showLoadingUI();
    
    // 나머지 초기화 작업 수행
    await checkAndResetOpinionStatus();
    await fetchBillsList();
    
    // 법안 수 업데이트
    totalCountElement.textContent = allBills.length;
    
    // 모든 법안 완료 여부 체크는 목록을 가져온 후에 수행
    const storage = await chrome.storage.local.get(['registeredOpinions']);
    const registeredOpinions = storage.registeredOpinions || [];
    
    if (registeredOpinions.length > 0 && allBills.length > 0) {
      const allCompleted = allBills.every(bill => registeredOpinions.includes(bill.id));
      if (allCompleted) {
        setTimeout(() => {
          showCelebrationModal();
        }, 500);
      }
    }

    // 로고 클릭 이벤트 핸들러 추가
    const logo = document.querySelector('.footer .logo');
    if (logo) {
      logo.addEventListener('click', async (e) => {
        e.preventDefault();
        await chrome.tabs.create({ 
          url: 'https://vforkorea.com/assem/',
          active: true 
        });
      });
    }

    // 설정 버튼 이벤트 리스너
    const settingsButton = document.getElementById('settings-button');
    const settingsModal = document.getElementById('settings-modal');
    const closeSettings = document.getElementById('close-settings');
    const saveSettings = document.getElementById('save-settings');

    // 저장된 설정 불러오기
    const settings = await chrome.storage.local.get(['autoRegisterSettings']);
    if (settings.autoRegisterSettings) {
      autoRegisterSettings = settings.autoRegisterSettings;
      document.getElementById('auto-title').value = autoRegisterSettings.title;
      document.getElementById('auto-content').value = autoRegisterSettings.content;
    }

    // 설정 모달 열기
    settingsButton.onclick = function() {
      settingsModal.style.display = 'block';
    };

    // 설정 모달 닫기
    closeSettings.onclick = function() {
      settingsModal.style.display = 'none';
    };

    // 설정 저장
    saveSettings.onclick = async function() {
      autoRegisterSettings = {
        title: document.getElementById('auto-title').value,
        content: document.getElementById('auto-content').value
      };
      await chrome.storage.local.set({ autoRegisterSettings });
      settingsModal.style.display = 'none';
    };

    // 모달 외부 클릭 시 닫기
    window.onclick = function(event) {
      if (event.target == settingsModal) {
        settingsModal.style.display = 'none';
      }
    };

    logger.timeEnd('DOM 로딩');
  } catch (error) {
    logger.error('초기화 실패:', error);
  } finally {
    logger.groupEnd();
  }
});

let allBills = []; // 모든 법안을 저장할 배열

// 법안 목록 로딩 표시를 더 동적으로 변경
function showLoadingUI() {
  const billsList = document.getElementById('bills-list');
  billsList.innerHTML = `
    <div class="loading-container">
      <div class="loading-spinner"></div>
      <div class="loading-text">
        <p>법안 목록을 불러오는 중...</p>
        <p class="loading-subtext">오늘 마감되는 법안을 검색하고 있습니다</p>
      </div>
    </div>
  `;
}

// fetchBillsList 함수 수정
async function fetchBillsList() {
  try {
    showLoadingUI();
    
    const response = await chrome.runtime.sendMessage({ action: "getBillsList" });
    if (!response.success) {
      throw new Error(response.error);
    }
    
    const billsContainer = document.getElementById('bills-list');
    billsContainer.innerHTML = '';
    
    // 저장된 의견등록 상태 가져오기
    const storage = await chrome.storage.local.get(['registeredOpinions']);
    const registeredOpinions = storage.registeredOpinions || [];
    
    // 법안 목록 정렬
    allBills = response.bills.sort((a, b) => {
      const aRegistered = registeredOpinions.includes(a.id);
      const bRegistered = registeredOpinions.includes(b.id);
      
      if (aRegistered && !bRegistered) return 1;
      if (!aRegistered && bRegistered) return -1;
      return 0;
    });
    
    // 총 법안 수 업데이트
    const totalCountElement = document.getElementById('total-count');
    if (totalCountElement) {
      totalCountElement.textContent = allBills.length;
    }
    
    // 법안을 5개씩 나누어 점진적으로 표시
    const chunkSize = 5;
    for (let i = 0; i < allBills.length; i += chunkSize) {
      const chunk = allBills.slice(i, i + chunkSize);
      const elements = await Promise.all(chunk.map(bill => createBillElement(bill)));
      
      elements.forEach(element => {
        billsContainer.appendChild(element);
      });
      
      // 다음 청크를 처리하기 전에 약간의 지연
      if (i + chunkSize < allBills.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
  } catch (error) {
    logger.error('입법예고 목록을 가져오는데 실패했습니다:', error);
    document.getElementById('bills-list').innerHTML = '<p>목록을 가져오는데 실패했습니다.</p>';
  }
}

// 의견등록 상태를 체크하고 초기화하는 함수 추가
async function checkAndResetOpinionStatus() {
  try {
    const storage = await chrome.storage.local.get(['registeredOpinions', 'lastResetDate']);
    const today = new Date().toDateString();
    
    // 마지막 초기화 날짜가 오늘이 아니면 초기화
    if (storage.lastResetDate !== today) {
      await chrome.storage.local.set({
        registeredOpinions: [],
        lastResetDate: today
      });
      logger.info('의견등록 상태 초기화 완료');
      return [];
    }
    
    return storage.registeredOpinions || [];
  } catch (error) {
    logger.error('의견등록 상태 체크 실패:', error, 'error');
    return [];
  }
}

// 입법예고 항목 요소를 생성하는 함수 수정
async function createBillElement(bill) {
  const div = document.createElement('div');
  div.className = 'bill-card';
  
  // 저장된 의견등록 상태 가져오기
  const storage = await chrome.storage.local.get(['registeredOpinions']);
  const registeredOpinions = storage.registeredOpinions || [];
  
  if (registeredOpinions.includes(bill.id)) {
    div.classList.add('opinion-registered');
  }

  // 정당 태그 HTML 생성
  const partyTags = bill.parties.map(party => {
    let className = 'party-tag';
    if (party.isBlue) className += ' blue';
    if (party.isRed) className += ' red';
    
    return `
      <span class="${className}" data-bill-id="${bill.dataIdx}">
        ${party.name} <b>${party.count}</b>
      </span>
    `;
  }).join('');
  
  div.innerHTML = `
    <div class="bill-header">
      <div class="bill-title-section">
        <h3 class="bill-title">${bill.title}</h3>
        <div class="bill-meta">
          <div class="party-tags">
            ${partyTags}
          </div>
          <span class="opinion-count">의견 ${bill.count}개</span>
        </div>
      </div>
      <div class="bill-header-controls">
        <button class="toggle-info-btn">▼</button>
        <button class="auto-register-btn" ${registeredOpinions.includes(bill.id) ? 'disabled' : ''} 
          style="${registeredOpinions.includes(bill.id) ? 'background-color: #6c757d; font-size: 14px;' : ''}">
          ${registeredOpinions.includes(bill.id) ? '등록<br>완료' : '자동<br>등록'}
        </button>
      </div>
    </div>
    <div class="bill-content" style="display: none;">
      <div class="bill-section">
        <h4>법안 설명</h4>
        <p>${bill.info || '상세 정보가 없습니다.'}</p>
      </div>
      <div class="bill-pros-cons">
        <div class="bill-section negative">
          <h4>단점</h4>
          <p>${bill.negative || '단점 정보가 없습니다.'}</p>
        </div>
        <div class="bill-section positive">
          <h4>장점</h4>
          <p>${bill.positive || '장점 정보가 없습니다.'}</p>
        </div>
      </div>
      <div class="bill-action">
        <button class="register-opinion-btn">
          ${registeredOpinions.includes(bill.id) ? '의견 재등록' : '의견등록'}
        </button>
        <p class="opinion-status" style="display: ${registeredOpinions.includes(bill.id) ? 'block' : 'none'}">
          ✓ 의견등록 완료
        </p>
      </div>
    </div>
  `;
  
  // 카드 전체 클릭 이벤트 (토글 기능)
  const header = div.querySelector('.bill-header');
  const content = div.querySelector('.bill-content');
  const toggleBtn = div.querySelector('.toggle-info-btn');
  
  function toggleContent(event) {
    // 정당 태그나 의견등록 버튼 클릭 시에는 토글하지 않음
    if (event.target.closest('.party-tag') || event.target.closest('.register-opinion-btn')) {
      return;
    }
    
    const isHidden = content.style.display === 'none';
    content.style.display = isHidden ? 'block' : 'none';
    toggleBtn.textContent = isHidden ? '▲' : '▼';
    div.classList.toggle('expanded');
  }
  
  header.addEventListener('click', toggleContent);
  
  // 의견등록 버튼 클릭 이벤트 수정
  const registerButton = div.querySelector('.register-opinion-btn');
  registerButton.addEventListener('click', async function(e) {
    e.stopPropagation();
    logger.info('의견등록 버튼 클릭됨');
    
    // 로그인 상태 확인
    try {
      const response = await fetch('https://www.assembly.go.kr/portal/main/main.do', {
        credentials: 'include'
      });
      const text = await response.text();
      const isLoggedIn = text.includes('/portal/member/user/logout2.do');
      
      if (!isLoggedIn) {
        alert('로그인이 필요합니다.\n로그인이 완료되면 자동으로 창이 닫힙니다.');
        // 로그인 처리 시작
        chrome.runtime.sendMessage({ 
          action: "startLogin"
        }, (response) => {
          if (response.success) {
            location.reload();  // 팝업 새로고침
          }
        });
        return;
      }
      
      // 로그인된 상태라면 기존 의견등록 로직 실행
      registerButton.disabled = true;
      logger.info('버튼 비활성화됨');
      
      try {
        const success = await registerOpinion(bill.id);
        logger.info('의견등록 함수 결과:', success);
        
        if (success) {
          // 의견등록 상태 저장
          const result = await chrome.storage.local.get(['registeredOpinions']);
          const registeredOpinions = result.registeredOpinions || [];
          logger.info('현재 저장된 의견등록 목록:', registeredOpinions);
          
          if (!registeredOpinions.includes(bill.id)) {
            registeredOpinions.push(bill.id);
            await chrome.storage.local.set({ registeredOpinions });
            logger.info('새로운 의견등록 저장됨:', bill.id);
            
            // UI 업데이트
            div.classList.add('opinion-registered');
            registerButton.textContent = '의견 재등록';
            const statusElement = div.querySelector('.opinion-status');
            if (statusElement) {
              statusElement.style.display = 'block';
            }
            logger.info('UI 업데이트 완료');

            // 모든 법안이 완료되었는지 체크
            if (allBills.length > 0 && registeredOpinions.length === allBills.length) {
              if (allBills.every(b => registeredOpinions.includes(b.id))) {
                // 모든 법안이 완료되었을 때만 축하 모달 표시
                setTimeout(() => {
                  showCelebrationModal();
                }, 500);
              }
            }
          }
        }
      } catch (error) {
        logger.error('의견등록 처리 중 오류:', error, 'error');
        alert('의견등록 처리 중 오류가 발생했습니다.');
      } finally {
        registerButton.disabled = false;
        logger.info('버튼 재활성화됨');
      }
    } catch (error) {
      logger.error('로그인 상태 확인 실패:', error, 'error');
      alert('로그인 상태 확인에 실패했습니다.');
    }
  });
  
  // 정당 태그 클릭 이벤트 추가
  div.querySelectorAll('.party-tag').forEach(tag => {
    tag.addEventListener('click', async function(e) {
      e.stopPropagation();
      const billId = this.dataset.billId;
      await showProposers(billId, bill.title);
    });
  });
  
  // 자동등록 버튼 이벤트 리스너 수정
  const autoRegisterBtn = div.querySelector('.auto-register-btn');
  autoRegisterBtn.addEventListener('click', async function(e) {
    e.stopPropagation();
    
    // 설정값 확인
    if (!autoRegisterSettings.title || !autoRegisterSettings.content) {
      alert('자동등록을 위해 기본 제목과 내용을 먼저 설정해주세요.');
      const settingsModal = document.getElementById('settings-modal');
      settingsModal.style.display = 'block';
      return;
    }

    try {
      // 먼저 UI 업데이트 및 상태 저장
      const result = await chrome.storage.local.get(['registeredOpinions']);
      const registeredOpinions = result.registeredOpinions || [];
      
      if (!registeredOpinions.includes(bill.id)) {
        registeredOpinions.push(bill.id);
        await chrome.storage.local.set({ registeredOpinions });
        
        // UI 업데이트
        div.classList.add('opinion-registered');
        autoRegisterBtn.innerHTML = '등록<br>완료';  // innerHTML 사용하여 줄바꿈 적용
        autoRegisterBtn.style.fontSize = '14px';     // 글자 크기 조정
        autoRegisterBtn.disabled = true;
        autoRegisterBtn.style.backgroundColor = '#6c757d';  // 비활성화 상태 색상
        
        const registerButton = div.querySelector('.register-opinion-btn');
        if (registerButton) {
          registerButton.textContent = '의견 재등록';
        }
        
        const statusElement = div.querySelector('.opinion-status');
        if (statusElement) {
          statusElement.style.display = 'block';
        }

        // 법안 카드를 맨 아래로 이동
        const billsList = document.getElementById('bills-list');
        if (billsList) {
          billsList.appendChild(div);
        }

        // 모든 법안이 완료되었는지 체크
        if (allBills.length > 0 && registeredOpinions.length === allBills.length) {
          if (allBills.every(b => registeredOpinions.includes(b.id))) {
            setTimeout(() => {
              showCelebrationModal();
            }, 500);
          }
        }
      }

      // background script에 자동등록 요청
      chrome.runtime.sendMessage({
        action: "autoRegister",
        data: {
          billId: bill.id,
          title: autoRegisterSettings.title,
          content: autoRegisterSettings.content
        }
      }, (response) => {
        if (!response.success) {
          logger.error('자동등록 처리 중 오류:', response.error);
          alert(response.error || '자동등록 처리 중 오류가 발생했습니다.');
        }
      });

    } catch (error) {
      logger.error('자동등록 상태 저장 중 오류:', error);
      alert('자동등록 처리 중 오류가 발생했습니다.');
    }
  });
  
  return div;
}

// 의견을 등록하는 함수 수정
async function registerOpinion(billId) {
  try {
    logger.info('의견등록 시작 - billId:', billId);
    
    // 의견등록 페이지 URL
    const url = `https://pal.assembly.go.kr/napal/lgsltpa/lgsltpaOpn/forInsert.do?lgsltPaId=${billId}&searchConClosed=0&refererDiv=O`;
    logger.info('의견등록 페이지 URL:', url);
    
    // 먼저 성공 반환 (UI 업데이트를 위해)
    logger.info('의견등록 상태 저장 완료');
    
    // 상태 저장 후 새 탭 열기
    setTimeout(async () => {
      try {
        await chrome.tabs.create({ url, active: true });
        logger.info('의견등록 페이지가 새 탭에서 열렸습니다.');
      } catch (error) {
        logger.error('새 탭 열기 실패:', error, 'error');
      }
    }, 100); // 약간의 지연을 두어 UI 업데이트가 먼저 이루어지도록 함

    return true;

  } catch (error) {
    logger.error('의견등록 처리 실패:', error, 'error');
    logger.error('에러 상세:', error.stack, 'error');
    alert('의견등록 처리 중 오류가 발생했습니다.');
    return false;
  }
}

// 제안자 목록을 가져오고 표시하는 함수 수정
async function showProposers(billId, billTitle) {
  try {
    const timestamp = Date.now();
    const response = await chrome.runtime.sendMessage({
      action: "getProposerList",
      billId: billId,
      timestamp: timestamp
    });

    logger.debug('받아온 데이터:', response);
    
    if (!response.success) {
      throw new Error(response.error || '데이터를 가져오는데 실패했습니다.');
    }

    // 제안자 목록 파싱
    const proposers = [];
    if (response.data) {
      const proposerList = response.data.split(',');
      proposerList.forEach(proposer => {
        const [name, party, deptCd] = proposer.split('|');
        proposers.push({
          name,
          party,
          className: party === '더불어민주당' ? 'blue' : 
                     party === '국민의힘' ? 'red' : '',
          deptCd
        });
      });
    }

    logger.debug('파싱된 제안자 목록:', proposers);
    
    // 모달 HTML 생성
    const modalHtml = `
      <div class="proposer-modal">
        <h1><i class="fas fa-user-tie"></i>&nbsp; 제안자 리스트</h1>
        <p class="title">${billTitle}</p>
        <ul class="partyList">
          ${proposers.map(p => `
            <li>
              <a href="http://www.assembly.go.kr/assm/memPop/memPopup.do?dept_cd=${p.deptCd}" 
                 target="_blank" 
                 class="party">
                <span class="party-name">${p.name}</span>
                <span class="${p.className}">${p.party}</span>
              </a>
            </li>
          `).join('')}
        </ul>
        <div><button class="close-proposer-modal">닫기</button></div>
      </div>
      <div class="modal-backdrop"></div>
    `;
    
    // 기존 모달이 있다면 제거
    document.querySelectorAll('.proposer-modal, .modal-backdrop').forEach(el => el.remove());
    
    // 새 모달 추가
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // 모달과 백드롭 표시
    const modal = document.querySelector('.proposer-modal');
    const backdrop = document.querySelector('.modal-backdrop');
    modal.style.display = 'block';
    backdrop.style.display = 'block';

    // 닫기 버튼 이벤트 리스너 추가
    const closeButton = modal.querySelector('.close-proposer-modal');
    closeButton.addEventListener('click', closeProposerModal);

    // 백드롭 클릭 시 닫기
    backdrop.addEventListener('click', closeProposerModal);
    
  } catch (error) {
    logger.error('제안자 목록 가져오기 실패:', error, 'error');
    logger.error('에러 상세:', error, 'error');
    alert('제안자 목록을 가져오는데 실패했습니다.');
  }
}

// 모달 닫기 함수
function closeProposerModal() {
  const modal = document.querySelector('.proposer-modal');
  const backdrop = document.querySelector('.modal-backdrop');
  if (modal) modal.style.display = 'none';
  if (backdrop) backdrop.style.display = 'none';
}

// 축하 모달 표시 함수 추가
function showCelebrationModal() {
  // 모달 HTML 생성
  const modalHtml = `
    <div class="fireworks"></div>
    <div class="celebration-modal">
      <h2>🎉 모든 법안 완료! 🎉</h2>
      <p>오늘도 행동해주셔서 고맙습니다</p>
    </div>
  `;
  
  // 기존 모달이 있다면 제거
  document.querySelectorAll('.celebration-modal, .fireworks').forEach(el => el.remove());
  
  // 새 모달 추가
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  
  // 모달 표시
  const modal = document.querySelector('.celebration-modal');
  modal.style.display = 'block';
  
  // 컨페티 효과 생성
  createConfetti();
  
  // 3초 후 모달 자동 닫기
  setTimeout(() => {
    modal.style.display = 'none';
    document.querySelector('.fireworks').remove();
  }, 3000);
}

// 컨페티 효과 생성 함수
function createConfetti() {
  const fireworks = document.querySelector('.fireworks');
  const colors = ['#1976d2', '#4caf50', '#ff9800', '#e91e63', '#9c27b0'];
  const shapes = ['square', 'circle', 'triangle'];
  
  for (let i = 0; i < 50; i++) {
    const confetti = document.createElement('div');
    confetti.className = `confetti ${shapes[Math.floor(Math.random() * shapes.length)]}`;
    confetti.style.left = Math.random() * 100 + 'vw';
    confetti.style.background = colors[Math.floor(Math.random() * colors.length)];
    confetti.style.animation = `confetti ${1 + Math.random() * 2}s ease-out ${Math.random() * 0.5}s forwards`;
    fireworks.appendChild(confetti);
  }
}

// 로그인 시도
async function attemptLogin() {
  logger.info('로그인 시작');
  try {
    chrome.runtime.sendMessage({ 
      action: "log", 
      message: '로그인 시도 시작' 
    });

    const loginTab = await chrome.tabs.create({
      url: 'https://member.assembly.go.kr/login/loginPage.do',
      active: true
    });

    chrome.runtime.sendMessage({ 
      action: "log", 
      message: `로그인 탭 생성됨 (ID: ${loginTab.id})` 
    });

    // 탭 URL 변경 감지를 위한 리스너
    chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo, tab) {
      chrome.runtime.sendMessage({ 
        action: "log", 
        message: `탭 업데이트 감지 - ID: ${tabId}, Status: ${changeInfo.status}, URL: ${tab.url || '없음'}` 
      });

      // URL이 메인 페이지를 포함하는지 확인
      const isMainPage = tab.url && (
        tab.url === 'https://www.assembly.go.kr/portal/main/main.do' ||
        tab.url.includes('assembly.go.kr/portal/main') ||
        tab.url.includes('assembly.go.kr/portal/contents/main.do')
      );

      if (tabId === loginTab.id && changeInfo.status === 'complete' && isMainPage) {
        chrome.runtime.sendMessage({ 
          action: "log", 
          message: '메인 페이지 감지됨, 로그인 성공으로 판단' 
        });

        // 탭 닫기 시도
        try {
          chrome.tabs.remove(loginTab.id, () => {
            if (chrome.runtime.lastError) {
              chrome.runtime.sendMessage({ 
                action: "log", 
                message: `탭 닫기 실패: ${chrome.runtime.lastError.message}`,
                type: 'error'
              });
            } else {
              chrome.runtime.sendMessage({ 
                action: "log", 
                message: '탭이 성공적으로 닫힘' 
              });
            }
          });

          // 리스너 제거
          chrome.tabs.onUpdated.removeListener(listener);
          
          // 로그인 상태 업데이트
          location.reload();
        } catch (closeError) {
          chrome.runtime.sendMessage({ 
            action: "log", 
            message: `탭 닫기 중 오류 발생: ${closeError.message}`,
            type: 'error'
          });
        }
      }
    });

  } catch (error) {
    chrome.runtime.sendMessage({ 
      action: "log", 
      message: `로그인 처리 중 오류: ${error.message}`,
      type: 'error'
    });
  }
}

// 메시지 리스너 수정
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  if (request.action === "triggerFirstAutoRegister") {
    logger.debug('자동등록 단축키 동작 감지');
    
    // 로그인 상태 확인
    try {
      const response = await fetch('https://www.assembly.go.kr/portal/main/main.do', {
        credentials: 'include'
      });
      const text = await response.text();
      const isLoggedIn = text.includes('/portal/member/user/logout2.do');
      
      if (!isLoggedIn) {
        alert('로그인이 필요합니다.\n로그인이 완료되면 자동으로 창이 닫힙니다.');
        // 로그인 처리 시작
        chrome.runtime.sendMessage({ 
          action: "startLogin"
        }, (response) => {
          if (response.success) {
            location.reload();  // 팝업 새로고침
          }
        });
        return;
      }
      
      // 로그인 상태인 경우 계속 진행
      // 저장된 설정값 확인
      const settings = await chrome.storage.local.get(['autoRegisterSettings']);
      autoRegisterSettings = settings.autoRegisterSettings || { title: '', content: '' };
      
      // 설정값 확인
      if (!autoRegisterSettings.title || !autoRegisterSettings.content) {
        alert('자동등록을 위해 기본 제목과 내용을 먼저 설정해주세요.');
        const settingsModal = document.getElementById('settings-modal');
        settingsModal.style.display = 'block';
        return;
      }
      
      // 첫 번째 미등록 법안의 자동등록 버튼 찾기
      const autoRegisterBtns = document.querySelectorAll('.auto-register-btn');
      for (const btn of autoRegisterBtns) {
        if (!btn.disabled) {
          logger.debug('미등록 법안의 자동등록 버튼 클릭');
          btn.click();
          break;
        }
      }
    } catch (error) {
      logger.error('자동등록 처리 중 오류:', error);
      alert('자동등록 처리 중 오류가 발생했습니다.');
    }
  }
  return true;  // 비동기 응답을 위해 true 반환
}); 