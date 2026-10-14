/**
 * 證券商業務員 題庫測驗系統 - 核心前端邏輯 (app.js)
 */

(function () {
  'use strict';

  // =========================================================
  // 常數與設定
  // =========================================================
  const STORAGE_USER_KEY = 'quiz-active-user-v1';
  const STORAGE_PROGRESS_KEY = 'quiz-progress-by-user-v1';
  const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

  // 全域狀態
  let allQuestions = [];
  let filteredQuestions = [];
  let currentQuestion = null;
  let currentFilterCategory = 'ALL';
  let currentFilterChapter = 'ALL';
  let currentMode = 'all'; // 'all' | 'wrong'
  let currentOrder = 'random'; // 'random' | 'seq'
  let currentSeqIndex = 0;
  let historyStack = []; // 供隨機模式下的上一題紀錄
  let isAnswered = false;

  // 使用者資料結構
  let activeUser = 'circle';
  let userStore = {};

  // DOM 元素引用快取
  const dom = {
    // 頂部
    activeUserName: document.getElementById('active-user-name'),
    userBtn: document.getElementById('user-btn'),
    statAnswered: document.getElementById('stat-answered'),
    statProgressBar: document.getElementById('stat-progress-bar'),
    statAccuracy: document.getElementById('stat-accuracy'),
    statCorrectCount: document.getElementById('stat-correct-count'),
    statWrongCount: document.getElementById('stat-wrong-count'),
    statStreak: document.getElementById('stat-streak'),
    statBestStreak: document.getElementById('stat-best-streak'),

    // 篇章標籤與計數
    categoryTabs: document.getElementById('category-tabs'),
    countAll: document.getElementById('count-all'),
    countLaw: document.getElementById('count-law'),
    countPractice: document.getElementById('count-practice'),
    countInvest: document.getElementById('count-invest'),
    countFinance: document.getElementById('count-finance'),
    countExam: document.getElementById('count-exam'),

    // 次級過濾與模式
    chapterSelect: document.getElementById('chapter-select'),
    modeSelector: document.getElementById('mode-selector'),
    orderSelector: document.getElementById('order-selector'),
    wrongBadgeCount: document.getElementById('wrong-badge-count'),

    // 題目卡片
    quizCard: document.getElementById('quiz-card'),
    qMetaLevel: document.getElementById('q-meta-level'),
    qMetaChapter: document.getElementById('q-meta-chapter'),
    qMetaSource: document.getElementById('q-meta-source'),
    qIndexInfo: document.getElementById('q-index-info'),
    bookmarkBtn: document.getElementById('bookmark-btn'),
    bookmarkIcon: document.getElementById('bookmark-icon'),
    qText: document.getElementById('q-text'),
    optionsList: document.getElementById('options-list'),

    // 詳解
    explanationBox: document.getElementById('explanation-box'),
    resultBanner: document.getElementById('result-banner'),
    resultIcon: document.getElementById('result-icon'),
    resultText: document.getElementById('result-text'),
    expCorrectAns: document.getElementById('exp-correct-ans'),
    expText: document.getElementById('exp-text'),

    // 控制按鈕
    btnPrev: document.getElementById('btn-prev'),
    btnNext: document.getElementById('btn-next'),
    btnRandomJump: document.getElementById('btn-random-jump'),
    btnToggleExp: document.getElementById('btn-toggle-exp'),

    // 空狀態
    emptyState: document.getElementById('empty-state'),
    emptyTitle: document.getElementById('empty-title'),
    emptyDesc: document.getElementById('empty-desc'),
    emptyBackBtn: document.getElementById('empty-back-btn'),

    // Modal
    userModal: document.getElementById('user-modal'),
    modalCloseBtn: document.getElementById('modal-close-btn'),
    usernameInput: document.getElementById('username-input'),
    btnSaveUser: document.getElementById('btn-save-user'),
    modalUserDisplay: document.getElementById('modal-user-display'),
    modalStatTotal: document.getElementById('modal-stat-total'),
    modalStatCorrect: document.getElementById('modal-stat-correct'),
    modalStatWrong: document.getElementById('modal-stat-wrong'),
    modalStatStreak: document.getElementById('modal-stat-streak'),
    modalStatWrongBank: document.getElementById('modal-stat-wrong-bank'),
    btnResetProgress: document.getElementById('btn-reset-progress')
  };

  // =========================================================
  // 本地儲存 (LocalStorage) 管理
  // =========================================================
  function initUserStorage() {
    try {
      const savedUser = localStorage.getItem(STORAGE_USER_KEY);
      if (savedUser && savedUser.trim()) {
        activeUser = savedUser.trim();
      }
      const rawStore = localStorage.getItem(STORAGE_PROGRESS_KEY);
      if (rawStore) {
        userStore = JSON.parse(rawStore);
      }
    } catch (e) {
      console.error('LocalStorage 讀取失敗:', e);
      userStore = {};
    }

    if (!userStore[activeUser]) {
      userStore[activeUser] = createEmptyUserData();
    }
    saveUserData();
    updateUserDisplay();
  }

  function createEmptyUserData() {
    return {
      answers: {},        // { [questionId]: { choice: 1-4, isCorrect: bool, time: number } }
      wrongQuestions: [], // [questionId, ...] 錯題清單
      bookmarks: [],      // [questionId, ...] 收藏清單
      totalAnswered: 0,
      totalCorrect: 0,
      totalWrong: 0,
      currentStreak: 0,
      maxStreak: 0
    };
  }

  function getUserData() {
    if (!userStore[activeUser]) {
      userStore[activeUser] = createEmptyUserData();
    }
    return userStore[activeUser];
  }

  function saveUserData() {
    try {
      localStorage.setItem(STORAGE_USER_KEY, activeUser);
      localStorage.setItem(STORAGE_PROGRESS_KEY, JSON.stringify(userStore));
    } catch (e) {
      console.error('LocalStorage 儲存失敗:', e);
    }
  }

  function updateUserDisplay() {
    dom.activeUserName.textContent = activeUser;
    dom.modalUserDisplay.textContent = activeUser;
  }

  // =========================================================
  // 載入題庫 JSON
  // =========================================================
  async function loadQuestions() {
    try {
      dom.qText.textContent = '正在載入全書題庫 (1,352 題)...';
      const response = await fetch('questions.json');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      allQuestions = await response.json();
      console.log(`成功載入 ${allQuestions.length} 道試題`);

      updateCategoryCounts();
      buildChapterDropdown();
      applyFilters();
      updateTopStats();
    } catch (err) {
      console.error('載入題目失敗:', err);
      dom.qText.textContent = '載入題庫失敗，請確認 questions.json 存在或重新啟動伺服器。';
    }
  }

  // =========================================================
  // 分類與選單過濾
  // =========================================================
  function updateCategoryCounts() {
    const counts = { ALL: allQuestions.length, 法規篇: 0, 實務篇: 0, 投資篇: 0, 財析篇: 0, 歷屆試題: 0 };
    for (const q of allQuestions) {
      if (counts[q.level] !== undefined) {
        counts[q.level]++;
      }
    }
    dom.countAll.textContent = counts.ALL;
    dom.countLaw.textContent = counts['法規篇'];
    dom.countPractice.textContent = counts['實務篇'];
    dom.countInvest.textContent = counts['投資篇'];
    dom.countFinance.textContent = counts['財析篇'];
    dom.countExam.textContent = counts['歷屆試題'];
  }

  function buildChapterDropdown() {
    const select = dom.chapterSelect;
    select.innerHTML = '<option value="ALL">全部章節 / 歷屆試題</option>';

    // 找出符合目前 major category 的章節
    const chapters = new Set();
    for (const q of allQuestions) {
      if (currentFilterCategory === 'ALL' || q.level === currentFilterCategory) {
        if (q.chapter) chapters.add(q.chapter);
      }
    }

    chapters.forEach(ch => {
      const opt = document.createElement('option');
      opt.value = ch;
      opt.textContent = ch;
      select.appendChild(opt);
    });

    currentFilterChapter = 'ALL';
    select.value = 'ALL';
  }

  function applyFilters(preserveCurrent = false) {
    const uData = getUserData();
    const wrongSet = new Set(uData.wrongQuestions || []);

    filteredQuestions = allQuestions.filter(q => {
      // 1. 大篇章過濾
      if (currentFilterCategory !== 'ALL' && q.level !== currentFilterCategory) {
        return false;
      }
      // 2. 章節細項過濾
      if (currentFilterChapter !== 'ALL' && q.chapter !== currentFilterChapter) {
        return false;
      }
      // 3. 錯題模式過濾
      if (currentMode === 'wrong' && !wrongSet.has(q.id)) {
        return false;
      }
      return true;
    });

    // 更新錯題紅點徽章
    const totalWrongsInCat = allQuestions.filter(q => {
      if (currentFilterCategory !== 'ALL' && q.level !== currentFilterCategory) return false;
      return wrongSet.has(q.id);
    }).length;
    dom.wrongBadgeCount.textContent = totalWrongsInCat;

    if (filteredQuestions.length === 0) {
      showEmptyState();
      return;
    }

    hideEmptyState();

    if (!preserveCurrent) {
      currentSeqIndex = 0;
      historyStack = [];
      pickNextQuestion();
    } else {
      updateIndexBadge();
    }
  }

  function showEmptyState() {
    dom.quizCard.style.display = 'none';
    dom.emptyState.style.display = 'flex';
    if (currentMode === 'wrong') {
      dom.emptyTitle.textContent = '🎉 太棒了！此分類下沒有錯題';
      dom.emptyDesc.textContent = '您已完全掌握目前分類的所有題目，或尚未有答錯紀錄。';
      dom.emptyBackBtn.textContent = '切換至全部題庫練習';
    } else {
      dom.emptyTitle.textContent = '沒有找到符合條件的題目';
      dom.emptyDesc.textContent = '請嘗試切換其他篇章或章節條件。';
      dom.emptyBackBtn.textContent = '重設為全部題目';
    }
  }

  function hideEmptyState() {
    dom.quizCard.style.display = 'flex';
    dom.emptyState.style.display = 'none';
  }

  // =========================================================
  // 題目切換邏輯
  // =========================================================
  function pickNextQuestion() {
    if (filteredQuestions.length === 0) return;

    if (currentOrder === 'random') {
      const randIdx = Math.floor(Math.random() * filteredQuestions.length);
      currentQuestion = filteredQuestions[randIdx];
      historyStack.push(currentQuestion.id);
      if (historyStack.length > 50) historyStack.shift();
    } else {
      if (currentSeqIndex >= filteredQuestions.length) {
        currentSeqIndex = 0;
      }
      currentQuestion = filteredQuestions[currentSeqIndex];
    }

    renderQuestion(currentQuestion);
  }

  function pickPrevQuestion() {
    if (filteredQuestions.length === 0) return;

    if (currentOrder === 'random') {
      if (historyStack.length > 1) {
        historyStack.pop(); // 彈出當前題
        const prevId = historyStack[historyStack.length - 1];
        const prevQ = allQuestions.find(q => q.id === prevId);
        if (prevQ) {
          currentQuestion = prevQ;
          renderQuestion(currentQuestion);
          return;
        }
      }
    } else {
      currentSeqIndex = (currentSeqIndex - 1 + filteredQuestions.length) % filteredQuestions.length;
      currentQuestion = filteredQuestions[currentSeqIndex];
      renderQuestion(currentQuestion);
    }
  }

  // =========================================================
  // 題目渲染
  // =========================================================
  function renderQuestion(q) {
    if (!q) return;

    isAnswered = false;

    // 標籤列
    dom.qMetaLevel.textContent = q.level || '精選試題';
    dom.qMetaChapter.textContent = q.chapter || '';
    dom.qMetaSource.textContent = q.source || '牛刀小試';

    // 收藏 / 錯題星號
    const uData = getUserData();
    const isBookmarked = (uData.bookmarks || []).includes(q.id);
    const isWrong = (uData.wrongQuestions || []).includes(q.id);
    dom.bookmarkIcon.textContent = (isBookmarked || isWrong) ? '★' : '☆';
    dom.bookmarkBtn.classList.toggle('active', isBookmarked || isWrong);

    updateIndexBadge();

    // 題目文字
    dom.qText.textContent = q.question;

    // 選項列表
    dom.optionsList.innerHTML = '';
    const existingAns = uData.answers[q.id];

    q.options.forEach((optText, idx) => {
      const choiceNum = idx + 1;
      const letter = OPTION_LETTERS[idx];

      const btn = document.createElement('button');
      btn.className = 'option-btn';
      btn.dataset.choice = choiceNum;

      btn.innerHTML = `
        <span class="opt-key">${letter}</span>
        <span class="opt-text">${escapeHtml(optText)}</span>
        <span class="opt-feedback-icon"></span>
      `;

      btn.addEventListener('click', () => handleOptionClick(choiceNum));
      dom.optionsList.appendChild(btn);
    });

    // 重設詳解區塊
    dom.explanationBox.style.display = 'none';
    dom.btnToggleExp.style.display = 'none';

    // 若歷史上作答過，可選擇性展示作答狀態
    if (existingAns) {
      dom.btnToggleExp.style.display = 'inline-flex';
    }
  }

  function updateIndexBadge() {
    if (!currentQuestion) return;
    const total = filteredQuestions.length;
    let idx = 1;
    if (currentOrder === 'seq') {
      idx = currentSeqIndex + 1;
    } else {
      const found = filteredQuestions.findIndex(q => q.id === currentQuestion.id);
      idx = found >= 0 ? found + 1 : 1;
    }
    dom.qIndexInfo.textContent = `第 ${idx} / ${total} 題`;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // =========================================================
  // 作答處理
  // =========================================================
  function handleOptionClick(choiceNum) {
    if (isAnswered || !currentQuestion) return;
    isAnswered = true;

    const correctChoice = currentQuestion.answer;
    const isCorrect = (choiceNum === correctChoice);
    const uData = getUserData();

    // 更新歷史紀錄
    uData.answers[currentQuestion.id] = {
      choice: choiceNum,
      isCorrect: isCorrect,
      time: Date.now()
    };
    uData.totalAnswered++;

    if (isCorrect) {
      uData.totalCorrect++;
      uData.currentStreak++;
      if (uData.currentStreak > uData.maxStreak) {
        uData.maxStreak = uData.currentStreak;
      }
      // 若在錯題本中答對，且處於錯題模式，可標註答對
    } else {
      uData.totalWrong++;
      uData.currentStreak = 0;
      if (!uData.wrongQuestions.includes(currentQuestion.id)) {
        uData.wrongQuestions.push(currentQuestion.id);
      }
    }

    saveUserData();
    updateTopStats();

    // 選項視覺反饋
    const optButtons = dom.optionsList.querySelectorAll('.option-btn');
    optButtons.forEach(btn => {
      btn.disabled = true;
      const bChoice = parseInt(btn.dataset.choice, 10);
      const iconSpan = btn.querySelector('.opt-feedback-icon');

      if (bChoice === correctChoice) {
        btn.classList.add('correct');
        iconSpan.textContent = '✓';
      } else if (bChoice === choiceNum && !isCorrect) {
        btn.classList.add('wrong');
        iconSpan.textContent = '✗';
      } else {
        btn.classList.add('faded');
      }
    });

    // 展開詳解面板
    showExplanation(isCorrect, correctChoice);
  }

  function showExplanation(isCorrect, correctChoice) {
    const correctLetter = OPTION_LETTERS[correctChoice - 1] || 'A';
    dom.expCorrectAns.textContent = `(${correctLetter})`;
    dom.expText.textContent = currentQuestion.explanation || '依據證券法規與業務規則辦理。';

    dom.resultBanner.className = `result-banner ${isCorrect ? 'success' : 'fail'}`;
    dom.resultIcon.textContent = isCorrect ? '✓' : '✗';
    dom.resultText.textContent = isCorrect ? '回答正確！加深記憶！' : '回答錯誤，請仔細閱讀下方詳解：';

    dom.explanationBox.style.display = 'flex';
    dom.btnToggleExp.style.display = 'none';

    // 平滑捲動至解析如果題目過長
    dom.explanationBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // =========================================================
  // 頂部統計指標更新
  // =========================================================
  function updateTopStats() {
    const uData = getUserData();
    const answeredCount = Object.keys(uData.answers).length;
    const totalQ = allQuestions.length || 1;

    dom.statAnswered.textContent = `${answeredCount} / ${totalQ}`;
    const progressPct = Math.min(100, Math.round((answeredCount / totalQ) * 100));
    dom.statProgressBar.style.width = `${progressPct}%`;

    const totalTrials = uData.totalCorrect + uData.totalWrong;
    let acc = 0;
    if (totalTrials > 0) {
      acc = Math.round((uData.totalCorrect / totalTrials) * 100);
    }
    dom.statAccuracy.textContent = `${acc}%`;
    dom.statCorrectCount.textContent = `答對 ${uData.totalCorrect} 題`;

    const wrongCount = (uData.wrongQuestions || []).length;
    dom.statWrongCount.textContent = wrongCount;

    dom.statStreak.textContent = `${uData.currentStreak} 🔥`;
    dom.statBestStreak.textContent = `最佳 ${uData.maxStreak}`;
  }

  // =========================================================
  // 收藏 / 錯題星號按鈕切換
  // =========================================================
  function toggleBookmark() {
    if (!currentQuestion) return;
    const uData = getUserData();
    const qid = currentQuestion.id;

    if (!uData.wrongQuestions) uData.wrongQuestions = [];
    const idx = uData.wrongQuestions.indexOf(qid);

    if (idx >= 0) {
      uData.wrongQuestions.splice(idx, 1);
      dom.bookmarkIcon.textContent = '☆';
      dom.bookmarkBtn.classList.remove('active');
    } else {
      uData.wrongQuestions.push(qid);
      dom.bookmarkIcon.textContent = '★';
      dom.bookmarkBtn.classList.add('active');
    }

    saveUserData();
    updateTopStats();

    // 更新錯題紅點
    const wrongSet = new Set(uData.wrongQuestions);
    const totalWrongsInCat = allQuestions.filter(q => {
      if (currentFilterCategory !== 'ALL' && q.level !== currentFilterCategory) return false;
      return wrongSet.has(q.id);
    }).length;
    dom.wrongBadgeCount.textContent = totalWrongsInCat;
  }

  // =========================================================
  // 事件監聽與綁定
  // =========================================================
  function setupEventListeners() {
    // 篇章 Tabs
    dom.categoryTabs.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      dom.categoryTabs.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilterCategory = btn.dataset.category;
      buildChapterDropdown();
      applyFilters();
    });

    // 章節下拉選單
    dom.chapterSelect.addEventListener('change', (e) => {
      currentFilterChapter = e.target.value;
      applyFilters();
    });

    // 模式切換 (全部 / 錯題)
    dom.modeSelector.addEventListener('click', (e) => {
      const btn = e.target.closest('.segment-btn');
      if (!btn) return;
      dom.modeSelector.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentMode = btn.dataset.mode;
      applyFilters();
    });

    // 順序切換 (隨機 / 循序)
    dom.orderSelector.addEventListener('click', (e) => {
      const btn = e.target.closest('.segment-btn');
      if (!btn) return;
      dom.orderSelector.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentOrder = btn.dataset.order;
      currentSeqIndex = 0;
      updateIndexBadge();
    });

    // 導航按鈕
    dom.btnNext.addEventListener('click', () => {
      if (currentOrder === 'seq') {
        currentSeqIndex = (currentSeqIndex + 1) % filteredQuestions.length;
      }
      pickNextQuestion();
    });

    dom.btnPrev.addEventListener('click', pickPrevQuestion);
    dom.btnRandomJump.addEventListener('click', () => {
      pickNextQuestion();
    });

    // 查看解析切換
    dom.btnToggleExp.addEventListener('click', () => {
      if (!currentQuestion) return;
      showExplanation(true, currentQuestion.answer);
    });

    // 星號收藏
    dom.bookmarkBtn.addEventListener('click', toggleBookmark);

    // 空狀態返回按鈕
    dom.emptyBackBtn.addEventListener('click', () => {
      currentMode = 'all';
      dom.modeSelector.querySelectorAll('.segment-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.mode === 'all');
      });
      applyFilters();
    });

    // 使用者切換 Modal
    dom.userBtn.addEventListener('click', openUserModal);
    dom.modalCloseBtn.addEventListener('click', closeUserModal);
    dom.userModal.addEventListener('click', (e) => {
      if (e.target === dom.userModal) closeUserModal();
    });

    dom.btnSaveUser.addEventListener('click', () => {
      const newName = dom.usernameInput.value.trim();
      if (newName) {
        activeUser = newName;
        if (!userStore[activeUser]) {
          userStore[activeUser] = createEmptyUserData();
        }
        saveUserData();
        updateUserDisplay();
        updateTopStats();
        applyFilters(true);
        closeUserModal();
      }
    });

    dom.btnResetProgress.addEventListener('click', () => {
      if (confirm(`確定要清空使用者「${activeUser}」的所有答題紀錄與錯題本嗎？此動作無法復原。`)) {
        userStore[activeUser] = createEmptyUserData();
        saveUserData();
        updateTopStats();
        applyFilters();
        closeUserModal();
      }
    });

    // 鍵盤快捷鍵
    window.addEventListener('keydown', handleKeyboardShortcuts);
  }

  function handleKeyboardShortcuts(e) {
    // 忽略正在輸入文字的情況
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    const key = e.key.toUpperCase();

    // 選項 1-4 或 A-D
    let choiceNum = null;
    if (key === '1' || key === 'A') choiceNum = 1;
    else if (key === '2' || key === 'B') choiceNum = 2;
    else if (key === '3' || key === 'C') choiceNum = 3;
    else if (key === '4' || key === 'D') choiceNum = 4;

    if (choiceNum !== null) {
      e.preventDefault();
      handleOptionClick(choiceNum);
      return;
    }

    // 下一題
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') {
      e.preventDefault();
      if (currentOrder === 'seq') {
        currentSeqIndex = (currentSeqIndex + 1) % filteredQuestions.length;
      }
      pickNextQuestion();
      return;
    }

    // 上一題
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      pickPrevQuestion();
      return;
    }
  }

  function openUserModal() {
    const uData = getUserData();
    dom.usernameInput.value = activeUser;
    dom.modalStatTotal.textContent = uData.totalAnswered;
    dom.modalStatCorrect.textContent = uData.totalCorrect;
    dom.modalStatWrong.textContent = uData.totalWrong;
    dom.modalStatStreak.textContent = uData.maxStreak;
    dom.modalStatWrongBank.textContent = (uData.wrongQuestions || []).length;
    dom.userModal.style.display = 'flex';
    dom.usernameInput.focus();
  }

  function closeUserModal() {
    dom.userModal.style.display = 'none';
  }

  // =========================================================
  // 初始化啟動
  // =========================================================
  initUserStorage();
  setupEventListeners();
  loadQuestions();

})();
