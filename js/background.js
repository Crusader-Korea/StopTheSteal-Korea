// logger.js를 service worker에서 로드
importScripts('./utils/logger.js');

// background.js 최상단에 logger 초기화 - self.logger 사용
self.logger.prefix = 'Background';

// 입법예고 목록 가져오기
async function fetchBillsList() {
  try {
    self.logger.debug('입법예고 목록 가져오기 시작');
    
    // 첫 30개 가져오기
    const response1 = await fetch('https://vforkorea.com/api2/assembly/getList.php?start=0&keyword=&align=', {
      headers: {
        'Accept': 'application/json',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    });
    
    const data1 = await response1.json();
    
    // 다음 30개 가져오기
    const response2 = await fetch('https://vforkorea.com/api2/assembly/getList.php?start=30&keyword=&align=', {
      headers: {
        'Accept': 'application/json',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    });
    
    const data2 = await response2.json();
    
    // 두 결과 합치기
    const allData = [...data1.data, ...data2.data];
    
    const bills = [];
    
    // 오늘 날짜 구하기
    const today = new Date().toISOString().split('T')[0];
    
    allData.forEach(item => {
      try {
        // end_date가 오늘인 항목만 처리
        if (item.end_date === today) {
          // 정당 정보 파싱
          const parties = [];
          if (item.parties) {
            item.parties.split('|').forEach(party => {
              const [name, count] = party.split(':');
              // 정당명 축약 처리
              const displayName = name === '국민의힘' ? '국힘' :
                                 name === '더불어민주당' ? '민주' :
                                 name === '조국혁신당' ? '조국' :
                                 name;
              parties.push({
                name: displayName,  // 축약된 이름 사용
                count,
                isBlue: name === '더불어민주당' || name === '조국혁신당',
                isRed: name === '국민의힘'
              });
            });
          }
          
          const bill = {
            id: item.id,
            dataIdx: item.idx,
            title: item.title,
            info: item.short,
            positive: item.positive,
            negative: item.nagative,
            count: item.opinion_count,
            parties,
            url: `https://pal.assembly.go.kr/napal/lgsltpa/lgsltpaOngoing/view.do?lgsltPaId=${item.id}`
          };
          
          bills.push(bill);
          self.logger.debug('법안 추가됨 (오늘 마감):', {
            title: bill.title.substring(0, 30) + '...',
            parties: parties.map(p => `${p.name}(${p.count})`),
            opinionCount: bill.count
          });
        }
      } catch (err) {
        self.logger.error('법안 처리 중 오류:', err);
      }
    });
    
    self.logger.debug('추출된 오늘 마감 법안 수:', bills.length);
    return {
      success: true,
      bills,
      totalCount: bills.length
    };
    
  } catch (error) {
    self.logger.error('목록 가져오기 에러:', error.message);
    return {
      success: false,
      bills: [],
      totalCount: 0,
      error: error.message
    };
  }
}

// 메시지 리스너
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  self.logger.debug('메시지 수신:', request);

  if (request.action === "getBillsList") {
    self.logger.debug('목록 가져오기 메시지 수신');
    fetchBillsList()
      .then(result => {
        self.logger.debug('목록 가져오기 결과:', result);
        sendResponse({ success: true, ...result });
      })
      .catch(error => {
        self.logger.error('목록 가져오기 실패:', error.message);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  } else if (request.action === "getBillsForPage") {
    self.logger.debug(`${request.page}페이지 가져오기 메시지 수신`);
    fetchBillsForPage(request.page)
      .then(bills => {
        self.logger.debug(`${request.page}페이지 가져오기 결과:`, bills.length, '건');
        sendResponse({ success: true, bills });
      })
      .catch(error => {
        self.logger.error(`${request.page}페이지 가져오기 실패: ` + error.message);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  } else if (request.action === "checkLoginStatus") {
    fetch('https://pal.assembly.go.kr/napal/lgsltpa/lgsltpaOngoing/list.do', {
      credentials: 'include'
    })
    .then(response => response.text())
    .then(html => {
      const isLoggedIn = html.includes('로그아웃') || !html.includes('로그인');
      sendResponse({ isLoggedIn });
    })
    .catch(error => {
      self.logger.error('로그인 상태 확인 실패:', error.message);
      sendResponse({ isLoggedIn: false });
    });
    return true;
  } else if (request.action === "getProposerList") {
    self.logger.debug('제안자 목록 가져오기 요청:', request.billId);
    const timestamp = request.timestamp || Date.now();
    fetch(`https://vforkorea.com/api2/assembly/getCoactorList.php?idx=${request.billId}&_=${timestamp}`, {
      headers: {
        'Accept': 'application/json',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'Referer': 'https://vforkorea.com/',
        'Origin': 'https://vforkorea.com'
      }
    })
    .then(async response => {
      const text = await response.text();
      self.logger.debug('Raw response:', text);
      
      try {
        // 빈 응답 처리
        if (!text.trim()) {
          return { success: true, data: '' };
        }
        
        // JSON 파싱 시도
        const data = JSON.parse(text);
        self.logger.debug('Parsed data:', data);
        return { success: true, data: data.data };
      } catch (error) {
        self.logger.error('JSON 파싱 실패:', error.message);
        // HTML 응답일 경우 직접 파싱
        const proposerMatch = text.match(/<ul class="partyList">([\s\S]*?)<\/ul>/);
        if (proposerMatch) {
          const proposers = [];
          const liMatches = proposerMatch[1].matchAll(/<li>[^<]*<a[^>]*>([^<]+)<span class="([^"]+)">([^<]+)<\/span><\/a>[^<]*<\/li>/g);
          
          for (const match of liMatches) {
            proposers.push(`${match[1].trim()}|${match[3].trim()}|${match[2]}`);
          }
          
          return { success: true, data: proposers.join(',') };
        }
        return { success: false, error: '제안자 목록을 파싱할 수 없습니다.' };
      }
    })
    .then(result => {
      self.logger.debug('최종 처리 결과:', result);
      sendResponse(result);
    })
    .catch(error => {
      self.logger.error('네트워크 오류:', error.message);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  } else if (request.action === "log") {
    if (request.type === 'error') {
      self.logger.error(request.message);
    } else {
      self.logger.debug(request.message);
    }
  } else if (request.action === "startLogin") {
    self.logger.info('로그인 처리 시작');
    
    chrome.tabs.create({
      url: 'https://member.assembly.go.kr/login/loginPage.do',
      active: true
    }).then(loginTab => {
      self.logger.debug('로그인 탭 생성됨:', loginTab.id);
      
      // 탭 URL 변경 감지를 위한 리스너
      chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo, tab) {
        self.logger.debug('탭 업데이트:', { tabId, status: changeInfo.status, url: tab.url });
        
        // URL이 메인 페이지를 포함하는지 확인
        const isMainPage = tab.url && (
          tab.url === 'https://www.assembly.go.kr/portal/main/main.do' ||
          tab.url.includes('assembly.go.kr/portal/main') ||
          tab.url.includes('assembly.go.kr/portal/contents/main.do')
        );

        if (tabId === loginTab.id && changeInfo.status === 'complete' && isMainPage) {
          self.logger.debug('메인 페이지 감지됨, 로그인 성공');
          
          // 입법예고 메인 페이지로 이동
          chrome.tabs.update(loginTab.id, {
            url: 'https://pal.assembly.go.kr/napal/main/main.do'
          }).then(() => {
            // 입법예고 페이지 로드 완료 후 탭 닫기
            chrome.tabs.onUpdated.addListener(function completeListener(completeTabId, completeChangeInfo, completeTab) {
              if (completeTabId === loginTab.id && completeChangeInfo.status === 'complete') {
                // 리스너 제거
                chrome.tabs.onUpdated.removeListener(completeListener);
                
                // 약간의 지연 후 탭 닫기 (페이지가 완전히 로드되도록)
                setTimeout(() => {
                  chrome.tabs.remove(loginTab.id).then(() => {
                    self.logger.debug('로그인 탭 닫힘');
                    
                    // 확장프로그램 팝업 다시 열기
                    chrome.action.openPopup().then(() => {
                      self.logger.debug('팝업 다시 열림');
                      // 팝업에 성공 응답
                      sendResponse({ success: true });
                    }).catch(error => {
                      self.logger.error('팝업 열기 실패:', error.message);
                      // 팝업을 열지 못해도 로그인은 성공했으므로 성공 응답
                      sendResponse({ success: true });
                    });
                  }).catch(error => {
                    self.logger.error('탭 닫기 실패:', error.message);
                    sendResponse({ success: false, error: error.message });
                  });
                }, 1000);
              }
            });
          });
          
          // 원래 리스너 제거
          chrome.tabs.onUpdated.removeListener(listener);
        }
      });
    }).catch(error => {
      self.logger.error('로그인 탭 생성 실패:', error.message);
      sendResponse({ success: false, error: error.message });
    });
    
    return true;  // 비동기 응답을 위해 true 반환
  } else if (request.action === "autoRegister") {
    self.logger.debug('자동등록 요청 수신:', request.data);
    
    // 로그인 상태 확인
    fetch('https://www.assembly.go.kr/portal/main/main.do', {
      credentials: 'include'
    })
    .then(async response => {
      const text = await response.text();
      const isLoggedIn = text.includes('/portal/member/user/logout2.do');
      
      if (!isLoggedIn) {
        throw new Error('로그인이 필요합니다.');
      }

      // 현재 활성 탭 찾기
      const tabs = await chrome.tabs.query({active: true, currentWindow: true});
      const currentTab = tabs[0];

      // 현재 탭에서 URL 업데이트
      const url = `https://pal.assembly.go.kr/napal/lgsltpa/lgsltpaOpn/forInsert.do?lgsltPaId=${request.data.billId}`;
      return chrome.tabs.update(currentTab.id, { url });
    })
    .then(tab => {
      // content script에 자동입력 요청
      chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo, tab) {
        if (tabId === tab.id && changeInfo.status === 'complete') {
          self.logger.debug('의견등록 페이지 로드 완료, 자동입력 시작');
          
          // content script 로드 확인 후 메시지 전송
          const checkContentScript = setInterval(() => {
            chrome.tabs.sendMessage(tabId, { action: "checkContentScript" }, response => {
              if (chrome.runtime.lastError) {
                // content script가 아직 로드되지 않음
                return;
              }
              
              if (response && response.loaded) {
                clearInterval(checkContentScript);
                
                // content script가 로드된 것을 확인했으므로 자동입력 메시지 전송
                chrome.tabs.sendMessage(tabId, {
                  action: 'autoFillOpinion',
                  data: {
                    title: request.data.title,
                    content: request.data.content
                  }
                });
              }
            });
          }, 100);  // 100ms 간격으로 체크
          
          // 10초 후에도 로드되지 않으면 체크 중단
          setTimeout(() => {
            clearInterval(checkContentScript);
          }, 10000);
          
          chrome.tabs.onUpdated.removeListener(listener);
        }
      });
      
      sendResponse({ success: true });
    })
    .catch(error => {
      self.logger.error('자동등록 처리 중 오류:', error);
      sendResponse({ success: false, error: error.message });
    });
    
    return true;  // 비동기 응답을 위해 true 반환
  }
});

// 단축키 명령어 리스너 수정
chrome.commands.onCommand.addListener(async (command) => {
  if (command === "auto-register-first") {
    try {
      // 팝업이 열려있든 닫혀있든 메시지 전송 시도
      chrome.runtime.sendMessage({ 
        action: "triggerFirstAutoRegister",
        source: "shortcut"
      }, async (response) => {
        // 응답이 없으면 (팝업이 닫혀있으면) 팝업 열기 시도
        if (chrome.runtime.lastError) {
          try {
            // 현재 활성화된 탭 정보 저장
            const tabs = await chrome.tabs.query({active: true, currentWindow: true});
            if (tabs.length > 0) {
              // 팝업 열기 전에 현재 탭 정보 저장
              const currentTabId = tabs[0].id;
              
              // 팝업 열기
              await chrome.action.openPopup();
              
              // 팝업이 로드될 때까지 대기 후 메시지 전송
              setTimeout(() => {
                chrome.runtime.sendMessage({ 
                  action: "triggerFirstAutoRegister",
                  source: "shortcut"
                });
              }, 1000);
            }
          } catch (innerError) {
            self.logger.error('팝업 열기 중 오류:', innerError);
          }
        }
      });
    } catch (error) {
      self.logger.error('단축키 처리 중 오류:', error);
    }
  }
}); 