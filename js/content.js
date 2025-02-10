chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  logger.debug('Content script 메시지 수신:', request);
  
  if (request.action === "getBillsList") {
    const bills = getBillsList();
    sendResponse(bills);
  } else if (request.action === "checkContentScript") {
    logger.debug('Content script 로드 확인');
    sendResponse({ loaded: true });
    return true;
  } else if (request.action === "registerOpinion") {
    logger.debug('의견등록 요청 수신:', request);
    
    if (document.readyState === 'complete') {
      processOpinionRegistration(request, sendResponse);
    } else {
      window.addEventListener('load', () => {
        processOpinionRegistration(request, sendResponse);
      });
    }
    return true;
  } else if (request.action === 'autoFillOpinion') {
    const { title, content } = request.data;
    
    // 의견등록 탭이 아직 활성화되지 않았다면 클릭
    const tabList = document.querySelectorAll('ul#cnts-tab-list li a');
    tabList.forEach(tab => {
      if (tab.textContent.trim() === "의견등록" && !tab.classList.contains('on')) {
        tab.click();
      }
    });

    // 입력 필드가 나타날 때까지 대기
    const maxAttempts = 10;
    let attempts = 0;

    const checkFields = setInterval(() => {
      const titleInput = document.querySelector('#txt_sj');
      const contentInput = document.querySelector('#txt_cn');
      const captchaInput = document.querySelector('#catpchaAnswer');

      if (titleInput && contentInput && captchaInput) {
        clearInterval(checkFields);
        
        // 제목 입력
        titleInput.value = title;
        titleInput.dispatchEvent(new Event('input', { bubbles: true }));
        titleInput.dispatchEvent(new Event('change', { bubbles: true }));

        // 내용 입력
        contentInput.value = content;
        contentInput.dispatchEvent(new Event('input', { bubbles: true }));
        contentInput.dispatchEvent(new Event('change', { bubbles: true }));

        // 보안문자 입력칸으로 포커스 이동
        captchaInput.focus();

        // 보안문자가 이미 입력되어 있다면 자동으로 등록 버튼 클릭
        if (captchaInput.value.length === 5) {
          const submitButton = document.querySelector('#btn_opnReg');
          if (submitButton) {
            submitButton.click();
          }
        }
      } else {
        attempts++;
        logger.debug(`입력 필드 대기 중... (${attempts}/${maxAttempts})`);
        
        if (attempts >= maxAttempts) {
          clearInterval(checkFields);
          logger.error('입력 필드를 찾을 수 없음');
        }
      }
    }, 500); // 0.5초마다 체크
  }
  return false;
});

// 입법예고 목록 추출
function getBillsList() {
  const bills = [];
  const rows = document.querySelectorAll('table.bbs_list tbody tr');
  
  rows.forEach(row => {
    const titleElement = row.querySelector('td.alignL a');
    if (titleElement) {
      const title = titleElement.textContent.trim();
      const href = titleElement.getAttribute('href');
      // href에서 lgsltPaId 추출
      const match = href.match(/lgsltPaId=([^&]+)/);
      const id = match ? match[1] : null;
      
      if (id) {
        bills.push({
          id: id,
          title: title,
          url: `https://pal.assembly.go.kr/napal/lgsltpa/lgsltpaOngoing/view.do?lgsltPaId=${id}`
        });
      }
    }
  });
  
  return bills;
}

// 의견 등록 처리 함수
function processOpinionRegistration(request, sendResponse) {
  try {
    logger.debug('의견 등록 처리 시작');
    logger.debug('현재 URL:', window.location.href);
    logger.debug('DOM 상태:', document.readyState);

    // 입력 필드가 나타날 때까지 대기
    const maxAttempts = 10;
    let attempts = 0;

    const checkFields = setInterval(() => {
      const titleInput = document.querySelector('#txt_sj');
      const contentInput = document.querySelector('#txt_cn');

      if (titleInput && contentInput) {
        clearInterval(checkFields);
        
        // 제목 입력
        titleInput.value = request.title;
        titleInput.dispatchEvent(new Event('input', { bubbles: true }));
        titleInput.dispatchEvent(new Event('change', { bubbles: true }));
        logger.debug('제목 입력 완료:', titleInput.value);

        // 내용 입력
        contentInput.value = request.content;
        contentInput.dispatchEvent(new Event('input', { bubbles: true }));
        contentInput.dispatchEvent(new Event('change', { bubbles: true }));
        logger.debug('내용 입력 완료:', contentInput.value);

        sendResponse({ success: true });
      } else {
        attempts++;
        logger.debug(`입력 필드 대기 중... (${attempts}/${maxAttempts})`);
        
        if (attempts >= maxAttempts) {
          clearInterval(checkFields);
          logger.debug('입력 필드를 찾을 수 없음');
          sendResponse({ success: false, error: '입력 필드를 찾을 수 없습니다.' });
        }
      }
    }, 1000);

  } catch (error) {
    logger.error('의견 등록 처리 중 오류:', error);
    logger.error('에러 상세:', error.stack);
    sendResponse({ success: false, error: error.message });
  }
} 