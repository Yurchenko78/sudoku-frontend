const GRID_SIZE = 9;
const BOX_SIZE = 3;
const STORAGE_KEY = "sudoku-game-state-v4";
const RECORDS_KEY = "sudoku-leaderboard-v2";
const THEME_KEY = "sudoku-theme-v2";
const THEME_SEEN_KEY = "sudoku-theme-seen-v2";
const AUTH_TOKEN_KEY = "sudoku-auth-token-v1";
const AUTH_USER_KEY = "sudoku-auth-user-v1";
const DIFFICULTY_LABELS = {
    easy: "Лёгкая",
    medium: "Средняя",
    hard: "Сложная",
    expert: "Эксперт"
};
const THEME_LABELS = {
    sunrise: "Солнечная",
    ocean: "Океан",
    midnight: "Ночной неон"
};
const CELLS_TO_REMOVE = {
    easy: 36,
    medium: 46,
    hard: 54,
    expert: 58
};
const SERVER_URL = "https://api.render.com/deploy/srv-d7f0lnflk1mc73c3dma0?key=n7g65hPHNMM";
const API_READY = SERVER_URL ? true : window.location.protocol.startsWith("http");

const boardElement = document.getElementById("board");
const timerElement = document.getElementById("timer");
const messageElement = document.getElementById("message");
const statusElement = document.getElementById("game-status");
const difficultySelect = document.getElementById("difficulty");
const recordsDifficultySelect = document.getElementById("records-difficulty");
const difficultyLabel = document.getElementById("current-difficulty");
const errorCountElement = document.getElementById("error-count");
const hintCountElement = document.getElementById("hint-count");
const modeLabelElement = document.getElementById("mode-label");
const themeSummaryElement = document.getElementById("theme-summary");
const recordsTableElement = document.getElementById("records-table");
const newGameButton = document.getElementById("new-game");
const checkBoardButton = document.getElementById("check-board");
const hintButton = document.getElementById("hint");
const resetBoardButton = document.getElementById("reset-board");
const solveBoardButton = document.getElementById("solve-board");
const toggleNotesButton = document.getElementById("toggle-notes");
const openThemeScreenButton = document.getElementById("open-theme-screen");
const closeThemeScreenButton = document.getElementById("close-theme-screen");
const themeScreen = document.getElementById("theme-screen");
const themeGrid = document.getElementById("theme-grid");
const victoryOverlay = document.getElementById("victory-overlay");
const victoryTextElement = document.getElementById("victory-text");
const playAgainButton = document.getElementById("play-again");
const closeVictoryButton = document.getElementById("close-victory");
const confettiLayer = document.getElementById("confetti-layer");
const numberPad = document.getElementById("number-pad");
const startScreen = document.getElementById("start-screen");
const startPlayButton = document.getElementById("start-play");
const continueGameButton = document.getElementById("continue-game");
const startThemesButton = document.getElementById("start-themes");
const authFormElement = document.getElementById("auth-form");
const accountPanelElement = document.getElementById("account-panel");
const authUsernameInput = document.getElementById("auth-username");
const authPasswordInput = document.getElementById("auth-password");
const loginButton = document.getElementById("login-button");
const registerButton = document.getElementById("register-button");
const logoutButton = document.getElementById("logout-button");
const syncNowButton = document.getElementById("sync-now");
const authStatusElement = document.getElementById("auth-status");
const accountUserElement = document.getElementById("account-user");
const accountNoteElement = document.getElementById("account-note");

let solutionBoard = [];
let puzzleBoard = [];
let currentBoard = [];
let notesBoard = [];
let selectedCell = null;
let secondsElapsed = 0;
let timerId = null;
let gameCompleted = false;
let errorCount = 0;
let hintCount = 0;
let currentDifficulty = "medium";
let notesMode = false;
let currentTheme = "sunrise";
let hasSavedGame = false;
let authToken = localStorage.getItem(AUTH_TOKEN_KEY) || "";
let currentUser = localStorage.getItem(AUTH_USER_KEY) || "";
let cloudSyncTimeoutId = null;
let cloudSyncInFlight = false;
let suppressCloudSave = false;

function createEmptyNotesBoard() {
    return Array.from({ length: GRID_SIZE }, () => Array.from({ length: GRID_SIZE }, () => []));
}

function cloneBoard(board) {
    return board.map((row) => [...row]);
}

function shuffle(values) {
    const array = [...values];
    for (let index = array.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [array[index], array[swapIndex]] = [array[swapIndex], array[index]];
    }
    return array;
}

function shuffledGroups() {
    return shuffle([0, 1, 2]).flatMap((group) => shuffle([0, 1, 2]).map((value) => group * 3 + value));
}

function buildSolvedBoard() {
    const numbers = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const rows = shuffledGroups();
    const columns = shuffledGroups();

    return rows.map((row) =>
        columns.map((column) => numbers[(row * BOX_SIZE + Math.floor(row / BOX_SIZE) + column) % GRID_SIZE])
    );
}

function generateSolvedBoard() {
    return buildSolvedBoard();
}

function generatePuzzleFromSolution(board, difficulty) {
    const puzzle = cloneBoard(board);
    const target = CELLS_TO_REMOVE[difficulty];
    const positions = shuffle(Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, index) => index));
    let removed = 0;

    for (const position of positions) {
        if (removed >= target) {
            break;
        }
        const row = Math.floor(position / GRID_SIZE);
        const column = position % GRID_SIZE;
        puzzle[row][column] = 0;
        removed += 1;
    }

    return puzzle;
}

function formatTime(totalSeconds) {
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
    const seconds = String(totalSeconds % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
}

function updateTimer() {
    timerElement.textContent = formatTime(secondsElapsed);
}

function updateCounters() {
    errorCountElement.textContent = String(errorCount);
    hintCountElement.textContent = String(hintCount);
}

function updateModeIndicator() {
    modeLabelElement.textContent = notesMode ? "Заметки" : "Числа";
    toggleNotesButton.classList.toggle("active", notesMode);
}

function startTimer() {
    clearInterval(timerId);
    timerId = window.setInterval(() => {
        secondsElapsed += 1;
        updateTimer();
        persistGameState();
    }, 1000);
}

function stopTimer() {
    clearInterval(timerId);
}

function setMessage(text, type = "") {
    messageElement.textContent = text;
    messageElement.className = `message ${type}`.trim();
}

function setAuthStatus(text, type = "") {
    authStatusElement.textContent = text;
    authStatusElement.className = `auth-status ${type}`.trim();
}

function isFixedCell(row, column) {
    return puzzleBoard[row] && puzzleBoard[row][column] !== 0;
}

function isCompletedNumber(value) {
    if (value === 0) {
        return false;
    }

    let occurrences = 0;
    for (let row = 0; row < GRID_SIZE; row += 1) {
        for (let column = 0; column < GRID_SIZE; column += 1) {
            if (currentBoard[row][column] === value && solutionBoard[row][column] === value) {
                occurrences += 1;
            }
        }
    }
    return occurrences === GRID_SIZE;
}

function createNotesMarkup(notes) {
    const grid = document.createElement("div");
    grid.className = "notes-grid";
    for (let value = 1; value <= 9; value += 1) {
        const mark = document.createElement("span");
        mark.className = "note-mark";
        mark.textContent = notes.includes(value) ? String(value) : "";
        grid.appendChild(mark);
    }
    return grid;
}

function renderBoard() {
    boardElement.innerHTML = "";

    for (let row = 0; row < GRID_SIZE; row += 1) {
        for (let column = 0; column < GRID_SIZE; column += 1) {
            const cell = document.createElement("button");
            const value = currentBoard[row]?.[column] || 0;
            const notes = notesBoard[row]?.[column] || [];
            const isSelected = selectedCell && selectedCell.row === row && selectedCell.column === column;
            const isRelated = selectedCell && (
                selectedCell.row === row ||
                selectedCell.column === column ||
                (
                    Math.floor(selectedCell.row / BOX_SIZE) === Math.floor(row / BOX_SIZE) &&
                    Math.floor(selectedCell.column / BOX_SIZE) === Math.floor(column / BOX_SIZE)
                )
            );
            const hasError = value !== 0 && solutionBoard[row] && value !== solutionBoard[row][column];

            cell.type = "button";
            cell.className = "cell";
            cell.dataset.row = String(row);
            cell.dataset.column = String(column);
            cell.setAttribute("aria-label", `Строка ${row + 1}, столбец ${column + 1}`);

            if ((column + 1) % BOX_SIZE === 0 && column !== GRID_SIZE - 1) {
                cell.classList.add("box-right");
            }
            if ((row + 1) % BOX_SIZE === 0 && row !== GRID_SIZE - 1) {
                cell.classList.add("row-end");
            }
            if (isFixedCell(row, column)) {
                cell.classList.add("fixed");
            }
            if (isRelated) {
                cell.classList.add("related");
            }
            if (isSelected) {
                cell.classList.add("selected");
            }
            if (hasError && !isFixedCell(row, column)) {
                cell.classList.add("error");
            }
            if (!hasError && isCompletedNumber(value)) {
                cell.classList.add("completed");
            }

            if (value !== 0) {
                const span = document.createElement("span");
                span.className = "cell-value";
                span.textContent = String(value);
                cell.appendChild(span);
            } else if (notes.length > 0) {
                cell.appendChild(createNotesMarkup(notes));
            }

            cell.addEventListener("click", () => selectCell(row, column));
            boardElement.appendChild(cell);
        }
    }
}

function selectCell(row, column) {
    if (gameCompleted || isFixedCell(row, column)) {
        return;
    }
    selectedCell = { row, column };
    renderBoard();
}

function getStateSnapshot() {
    return {
        solutionBoard,
        puzzleBoard,
        currentBoard,
        notesBoard,
        selectedCell,
        secondsElapsed,
        gameCompleted,
        errorCount,
        hintCount,
        currentDifficulty,
        notesMode,
        currentTheme,
        status: statusElement.textContent,
        message: messageElement.textContent,
        messageType: messageElement.className.replace("message", "").trim(),
        updatedAt: Date.now()
    };
}

function persistAuth() {
    if (authToken) {
        localStorage.setItem(AUTH_TOKEN_KEY, authToken);
        localStorage.setItem(AUTH_USER_KEY, currentUser);
    } else {
        localStorage.removeItem(AUTH_TOKEN_KEY);
        localStorage.removeItem(AUTH_USER_KEY);
    }
}

function queueCloudSave() {
    if (!authToken || suppressCloudSave) {
        return;
    }
    clearTimeout(cloudSyncTimeoutId);
    cloudSyncTimeoutId = window.setTimeout(() => {
        pushCloudState(getStateSnapshot(), { silent: true });
    }, 450);
}

function persistGameState() {
    const snapshot = getStateSnapshot();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    localStorage.setItem(THEME_KEY, currentTheme);
    queueCloudSave();
}

function applySnapshot(state, fromCloud = false) {
    if (!state || !Array.isArray(state.solutionBoard) || !Array.isArray(state.currentBoard)) {
        return false;
    }

    suppressCloudSave = true;
    try {
        solutionBoard = state.solutionBoard;
        puzzleBoard = state.puzzleBoard;
        currentBoard = state.currentBoard;
        notesBoard = state.notesBoard || createEmptyNotesBoard();
        selectedCell = state.selectedCell;
        secondsElapsed = state.secondsElapsed || 0;
        gameCompleted = Boolean(state.gameCompleted);
        errorCount = state.errorCount || 0;
        hintCount = state.hintCount || 0;
        currentDifficulty = state.currentDifficulty || "medium";
        notesMode = Boolean(state.notesMode);

        difficultySelect.value = currentDifficulty;
        difficultyLabel.textContent = DIFFICULTY_LABELS[currentDifficulty];
        recordsDifficultySelect.value = currentDifficulty;
        if (state.currentTheme && THEME_LABELS[state.currentTheme]) {
            applyTheme(state.currentTheme, { persistCloud: false });
        }
        statusElement.textContent = state.status || "Играем";
        updateTimer();
        updateCounters();
        updateModeIndicator();
        renderBoard();
        setMessage(
            state.message || (fromCloud ? "Состояние игры загружено из облака." : "Продолжаем сохранённую игру."),
            state.messageType || ""
        );
        hasSavedGame = true;
        continueGameButton.style.display = "inline-flex";
        localStorage.setItem(STORAGE_KEY, JSON.stringify(getStateSnapshot()));
        return true;
    } finally {
        suppressCloudSave = false;
    }
}

function restoreSavedGame() {
    const rawState = localStorage.getItem(STORAGE_KEY);
    if (!rawState) {
        return false;
    }

    try {
        const state = JSON.parse(rawState);
        return applySnapshot(state, false);
    } catch {
        localStorage.removeItem(STORAGE_KEY);
        return false;
    }
}

function toggleNote(value) {
    if (!selectedCell || gameCompleted) {
        setMessage("Сначала выберите клетку для заметок.", "warning");
        return;
    }

    const { row, column } = selectedCell;
    if (isFixedCell(row, column)) {
        return;
    }

    if (currentBoard[row][column] !== 0) {
        setMessage("Очистите число в клетке, чтобы добавить заметки.", "warning");
        return;
    }

    const notes = notesBoard[row][column];
    notesBoard[row][column] = notes.includes(value)
        ? notes.filter((item) => item !== value)
        : [...notes, value].sort((a, b) => a - b);

    renderBoard();
    setMessage("Заметки обновлены.");
    persistGameState();
}

function placeValue(value) {
    if (notesMode && value !== 0) {
        toggleNote(value);
        return;
    }

    if (!selectedCell || gameCompleted) {
        setMessage("Сначала выберите пустую клетку.", "warning");
        return;
    }

    const { row, column } = selectedCell;
    if (isFixedCell(row, column)) {
        return;
    }

    currentBoard[row][column] = value;
    notesBoard[row][column] = [];

    if (value === 0) {
        statusElement.textContent = "Играем";
        renderBoard();
        setMessage("Клетка очищена.");
        persistGameState();
        return;
    }

    if (value !== solutionBoard[row][column]) {
        errorCount += 1;
        updateCounters();
        statusElement.textContent = "Есть ошибки";
        renderBoard();
        setMessage("Есть конфликт. Проверьте строку, столбец или квадрат 3x3.", "warning");
        persistGameState();
        return;
    }

    statusElement.textContent = "Играем";
    renderBoard();
    setMessage("Ход принят.");
    persistGameState();
    checkForWin();
}

function fillHint() {
    if (gameCompleted) {
        return;
    }

    const emptyCells = [];
    for (let row = 0; row < GRID_SIZE; row += 1) {
        for (let column = 0; column < GRID_SIZE; column += 1) {
            if (currentBoard[row][column] === 0) {
                emptyCells.push({ row, column });
            }
        }
    }

    if (emptyCells.length === 0) {
        setMessage("Пустых клеток не осталось.", "warning");
        checkForWin();
        return;
    }

    const randomCell = emptyCells[Math.floor(Math.random() * emptyCells.length)];
    currentBoard[randomCell.row][randomCell.column] = solutionBoard[randomCell.row][randomCell.column];
    notesBoard[randomCell.row][randomCell.column] = [];
    selectedCell = randomCell;
    hintCount += 1;
    updateCounters();
    renderBoard();
    setMessage("Подсказка открыла одно правильное число.");
    persistGameState();
    checkForWin();
}

function resetBoard() {
    currentBoard = cloneBoard(puzzleBoard);
    notesBoard = createEmptyNotesBoard();
    selectedCell = null;
    gameCompleted = false;
    errorCount = 0;
    hintCount = 0;
    notesMode = false;
    statusElement.textContent = "Играем";
    updateCounters();
    updateModeIndicator();
    renderBoard();
    setMessage("Поле сброшено к началу текущей партии.");
    persistGameState();
}

function solveCurrentBoard() {
    currentBoard = cloneBoard(solutionBoard);
    notesBoard = createEmptyNotesBoard();
    selectedCell = null;
    gameCompleted = true;
    stopTimer();
    statusElement.textContent = "Решено";
    renderBoard();
    setMessage("Судоку решена автоматически.", "success");
    persistGameState();
}

function checkBoard() {
    let hasEmpty = false;
    let hasErrors = false;

    for (let row = 0; row < GRID_SIZE; row += 1) {
        for (let column = 0; column < GRID_SIZE; column += 1) {
            const value = currentBoard[row][column];
            if (value === 0) {
                hasEmpty = true;
            } else if (value !== solutionBoard[row][column]) {
                hasErrors = true;
            }
        }
    }

    renderBoard();

    if (hasErrors) {
        statusElement.textContent = "Есть ошибки";
        setMessage("В поле есть неверные значения.", "warning");
        persistGameState();
        return;
    }

    if (hasEmpty) {
        statusElement.textContent = "Почти готово";
        setMessage("Ошибок нет, но поле ещё не заполнено полностью.");
        persistGameState();
        return;
    }

    checkForWin();
}

function loadLocalRecords() {
    try {
        const raw = localStorage.getItem(RECORDS_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

function saveLocalRecord() {
    const records = loadLocalRecords();
    const difficultyRecords = records[currentDifficulty] || [];
    difficultyRecords.push({
        time: secondsElapsed,
        errors: errorCount,
        hints: hintCount,
        date: new Date().toLocaleDateString("ru-RU")
    });
    difficultyRecords.sort((first, second) => first.time - second.time);
    records[currentDifficulty] = difficultyRecords.slice(0, 5);
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
}

function renderRecordList(records) {
    const difficulty = recordsDifficultySelect.value;
    const list = records[difficulty] || [];

    if (list.length === 0) {
        recordsTableElement.innerHTML = '<div class="records-table__empty">Пока рекордов нет. Сыграйте первую партию на этом уровне.</div>';
        return;
    }

    recordsTableElement.innerHTML = list.map((record, index) => `
        <div class="records-table__row">
            <div class="records-table__place">${index + 1}</div>
            <div>
                <strong>${formatTime(record.time)}</strong>
                <div class="records-table__meta">${record.date} · Ошибки: ${record.errors} · Подсказки: ${record.hints}</div>
            </div>
            <div>${DIFFICULTY_LABELS[difficulty]}</div>
        </div>
    `).join("");
}

async function apiRequest(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (!headers.has("Content-Type") && options.body) {
        headers.set("Content-Type", "application/json");
    }
    if (authToken) {
        headers.set("Authorization", `Bearer ${authToken}`);
    }

    const url = SERVER_URL ? `${SERVER_URL}${path}` : path;
    const response = await fetch(url, { ...options, headers });
    const rawText = await response.text();
    let payload = {};

    if (rawText) {
        try {
            payload = JSON.parse(rawText);
        } catch {
            payload = { message: rawText };
        }
    }

    if (!response.ok) {
        throw new Error(payload.message || "Ошибка сервера");
    }

    return payload;
}

async function renderRecords() {
    if (authToken && API_READY) {
        try {
            const payload = await apiRequest("/api/records");
            renderRecordList(payload.records || {});
            return;
        } catch {
            setAuthStatus("Серверные рекорды временно недоступны. Показываю локальные.", "warning");
        }
    }

    renderRecordList(loadLocalRecords());
}

async function saveRecord() {
    if (authToken && API_READY) {
        try {
            const payload = await apiRequest("/api/records", {
                method: "POST",
                body: JSON.stringify({
                    difficulty: currentDifficulty,
                    record: {
                        time: secondsElapsed,
                        errors: errorCount,
                        hints: hintCount,
                        date: new Date().toLocaleDateString("ru-RU")
                    }
                })
            });
            renderRecordList(payload.records || {});
            return;
        } catch {
            setAuthStatus("Не удалось сохранить рекорд на сервере. Сохраняю локально.", "warning");
        }
    }

    saveLocalRecord();
    renderRecordList(loadLocalRecords());
}

function launchVictoryAnimation() {
    confettiLayer.innerHTML = "";
    const colors = ["#ff8d6c", "#ffd166", "#72d6a3", "#5bc0ff", "#d69cff"];

    for (let index = 0; index < 28; index += 1) {
        const piece = document.createElement("span");
        piece.className = "confetti";
        piece.style.left = `${Math.random() * 100}%`;
        piece.style.background = colors[index % colors.length];
        piece.style.animationDelay = `${Math.random() * 0.8}s`;
        piece.style.animationDuration = `${2.2 + Math.random() * 1.8}s`;
        confettiLayer.appendChild(piece);
    }
}

function openVictoryOverlay() {
    victoryTextElement.textContent = `Время: ${formatTime(secondsElapsed)} · Ошибки: ${errorCount} · Подсказки: ${hintCount}.`;
    victoryOverlay.classList.add("visible");
    victoryOverlay.setAttribute("aria-hidden", "false");
    launchVictoryAnimation();
}

function closeVictoryOverlay() {
    victoryOverlay.classList.remove("visible");
    victoryOverlay.setAttribute("aria-hidden", "true");
}

function showStartScreen() {
    startScreen.classList.add("visible");
    startScreen.setAttribute("aria-hidden", "false");
    continueGameButton.style.display = hasSavedGame ? "inline-flex" : "none";
}

function hideStartScreen() {
    startScreen.classList.remove("visible");
    startScreen.setAttribute("aria-hidden", "true");
}

function checkForWin() {
    for (let row = 0; row < GRID_SIZE; row += 1) {
        for (let column = 0; column < GRID_SIZE; column += 1) {
            if (currentBoard[row][column] !== solutionBoard[row][column]) {
                return false;
            }
        }
    }

    gameCompleted = true;
    stopTimer();
    statusElement.textContent = "Победа";
    setMessage("Поздравляем! Судоку решена правильно.", "success");
    renderBoard();
    saveRecord();
    persistGameState();
    openVictoryOverlay();
    return true;
}

function startNewGame() {
    currentDifficulty = difficultySelect.value;
    solutionBoard = generateSolvedBoard();
    puzzleBoard = generatePuzzleFromSolution(solutionBoard, currentDifficulty);
    currentBoard = cloneBoard(puzzleBoard);
    notesBoard = createEmptyNotesBoard();
    selectedCell = null;
    secondsElapsed = 0;
    gameCompleted = false;
    errorCount = 0;
    hintCount = 0;
    notesMode = false;
    difficultyLabel.textContent = DIFFICULTY_LABELS[currentDifficulty];
    recordsDifficultySelect.value = currentDifficulty;
    statusElement.textContent = "Играем";
    updateTimer();
    updateCounters();
    updateModeIndicator();
    renderBoard();
    renderRecords();
    closeVictoryOverlay();
    setMessage("Новая партия готова. Удачи!");
    persistGameState();
    startTimer();
    hasSavedGame = true;
    continueGameButton.style.display = "inline-flex";
}

function toggleNotesMode() {
    notesMode = !notesMode;
    updateModeIndicator();
    setMessage(notesMode ? "Режим заметок включён." : "Режим ввода чисел включён.");
    persistGameState();
}

function applyTheme(themeName, options = {}) {
    const { persistCloud = true } = options;
    currentTheme = themeName;
    document.body.dataset.theme = themeName;
    themeSummaryElement.textContent = `Тема: ${THEME_LABELS[themeName]}`;
    localStorage.setItem(THEME_KEY, themeName);

    themeGrid.querySelectorAll(".theme-card").forEach((card) => {
        card.classList.toggle("selected", card.dataset.theme === themeName);
    });

    if (persistCloud) {
        persistGameState();
    }
}

function openThemeScreen() {
    themeScreen.classList.add("visible");
    themeScreen.setAttribute("aria-hidden", "false");
}

function closeThemeScreen() {
    themeScreen.classList.remove("visible");
    themeScreen.setAttribute("aria-hidden", "true");
    localStorage.setItem(THEME_SEEN_KEY, "true");
}

function initializeTheme() {
    applyTheme(localStorage.getItem(THEME_KEY) || "sunrise", { persistCloud: false });
}

function continueSavedGame() {
    hideStartScreen();
    closeThemeScreen();
    if (!gameCompleted) {
        startTimer();
    }
    setMessage("Продолжаем игру.");
}

async function pushCloudState(snapshot = getStateSnapshot(), options = {}) {
    if (!authToken || !API_READY || suppressCloudSave) {
        return false;
    }

    try {
        await apiRequest("/api/state", {
            method: "POST",
            body: JSON.stringify({ state: snapshot })
        });
        if (!options.silent) {
            setAuthStatus("Изменения сохранены на сервере.", "success");
        }
        return true;
    } catch (error) {
        if (!options.silent) {
            setAuthStatus(error.message || "Не удалось сохранить данные на сервере.", "warning");
        }
        return false;
    }
}

async function syncWithCloud(options = {}) {
    if (!authToken || !API_READY || cloudSyncInFlight) {
        return false;
    }

    cloudSyncInFlight = true;
    syncNowButton.disabled = true;

    try {
        const payload = await apiRequest("/api/state");
        const remoteState = payload.state;
        const localState = getStateSnapshot();
        const remoteUpdatedAt = Number(payload.updatedAt || remoteState?.updatedAt || 0);
        const localUpdatedAt = Number(localState.updatedAt || 0);
        const hasRemoteState = remoteState && Array.isArray(remoteState.currentBoard) && remoteState.currentBoard.length > 0;

        if (hasRemoteState && remoteUpdatedAt > localUpdatedAt) {
            const wasPlaying = !startScreen.classList.contains("visible") && !gameCompleted;
            applySnapshot(remoteState, true);
            if (wasPlaying && !gameCompleted) {
                startTimer();
            }
        } else {
            await pushCloudState(localState, { silent: true });
        }

        if (!options.silent) {
            setAuthStatus("Синхронизация завершена.", "success");
        }
        await renderRecords();
        return true;
    } catch (error) {
        setAuthStatus(error.message || "Серверная синхронизация недоступна.", "warning");
        return false;
    } finally {
        cloudSyncInFlight = false;
        updateAuthUI();
    }
}

function updateAuthUI() {
    const loggedIn = Boolean(authToken && currentUser);
    authFormElement.classList.toggle("hidden", loggedIn);
    accountPanelElement.classList.toggle("hidden", !loggedIn);
    accountUserElement.textContent = loggedIn ? currentUser : "Гость";
    accountNoteElement.textContent = loggedIn
        ? "Сохранение идёт в облако и синхронизируется между устройствами."
        : "Серверная синхронизация отключена.";

    if (!API_READY) {
        loginButton.disabled = true;
        registerButton.disabled = true;
        syncNowButton.disabled = true;
        setAuthStatus("Укажите SERVER_URL в script.js для работы с удалённым сервером.", "warning");
        return;
    }

    loginButton.disabled = false;
    registerButton.disabled = false;
    syncNowButton.disabled = !loggedIn;

    if (!loggedIn) {
        setAuthStatus("Гостевой режим: сохранение идёт только в этом браузере.");
    }
}

async function handleRegister() {
    const username = authUsernameInput.value.trim();
    const password = authPasswordInput.value;

    if (username.length < 3) {
        setAuthStatus("Имя пользователя должно быть не короче 3 символов.", "warning");
        return;
    }
    if (password.length < 6) {
        setAuthStatus("Пароль должен быть не короче 6 символов.", "warning");
        return;
    }

    try {
        const payload = await apiRequest("/api/register", {
            method: "POST",
            body: JSON.stringify({ username, password })
        });
        authToken = payload.token;
        currentUser = payload.username;
        persistAuth();
        authPasswordInput.value = "";
        updateAuthUI();
        setAuthStatus("Аккаунт создан. Облачное сохранение включено.", "success");
        await syncWithCloud({ silent: true });
    } catch (error) {
        setAuthStatus(error.message || "Не удалось создать аккаунт.", "warning");
    }
}

async function handleLogin() {
    const username = authUsernameInput.value.trim();
    const password = authPasswordInput.value;

    if (!username || !password) {
        setAuthStatus("Введите имя пользователя и пароль.", "warning");
        return;
    }

    try {
        const payload = await apiRequest("/api/login", {
            method: "POST",
            body: JSON.stringify({ username, password })
        });
        authToken = payload.token;
        currentUser = payload.username;
        persistAuth();
        authPasswordInput.value = "";
        updateAuthUI();
        setAuthStatus("Вход выполнен. Синхронизирую данные.", "success");
        await syncWithCloud({ silent: true });
    } catch (error) {
        setAuthStatus(error.message || "Не удалось войти в аккаунт.", "warning");
    }
}

async function handleLogout() {
    try {
        if (authToken && API_READY) {
            await apiRequest("/api/logout", { method: "POST" });
        }
    } catch {
        // Ничего страшного.
    }

    authToken = "";
    currentUser = "";
    persistAuth();
    updateAuthUI();
    await renderRecords();
    setAuthStatus("Вы вышли из аккаунта. Игра продолжит сохраняться только локально.");
}

async function restoreServerSession() {
    if (!authToken || !API_READY) {
        updateAuthUI();
        return;
    }

    try {
        const payload = await apiRequest("/api/me");
        currentUser = payload.username;
        persistAuth();
        updateAuthUI();
        await syncWithCloud({ silent: true });
    } catch {
        authToken = "";
        currentUser = "";
        persistAuth();
        updateAuthUI();
        setAuthStatus("Не удалось восстановить серверную сессию. Работаем локально.", "warning");
    }
}

function handleKeyboardInput(event) {
    if (event.key >= "1" && event.key <= "9") {
        placeValue(Number(event.key));
    }
    if (event.key === "Backspace" || event.key === "Delete" || event.key === "0") {
        placeValue(0);
    }
    if (event.key.toLowerCase() === "n") {
        toggleNotesMode();
    }
    if (event.key === "Escape") {
        closeThemeScreen();
        closeVictoryOverlay();
    }
}

newGameButton.addEventListener("click", startNewGame);
checkBoardButton.addEventListener("click", checkBoard);
hintButton.addEventListener("click", fillHint);
resetBoardButton.addEventListener("click", resetBoard);
solveBoardButton.addEventListener("click", solveCurrentBoard);
toggleNotesButton.addEventListener("click", toggleNotesMode);
openThemeScreenButton.addEventListener("click", openThemeScreen);
closeThemeScreenButton.addEventListener("click", closeThemeScreen);
playAgainButton.addEventListener("click", () => {
    closeVictoryOverlay();
    startNewGame();
});
closeVictoryButton.addEventListener("click", closeVictoryOverlay);
startPlayButton.addEventListener("click", () => {
    hideStartScreen();
    closeThemeScreen();
    if (solutionBoard.length === 0) {
        startNewGame();
    } else {
        if (!gameCompleted) {
            startTimer();
        }
        setMessage("Игра продолжается.");
    }
});
continueGameButton.addEventListener("click", continueSavedGame);
startThemesButton.addEventListener("click", openThemeScreen);
loginButton.addEventListener("click", handleLogin);
registerButton.addEventListener("click", handleRegister);
logoutButton.addEventListener("click", handleLogout);
syncNowButton.addEventListener("click", () => syncWithCloud());

themeGrid.addEventListener("click", (event) => {
    const button = event.target.closest(".theme-card");
    if (!button) {
        return;
    }
    applyTheme(button.dataset.theme);
});

recordsDifficultySelect.addEventListener("change", () => {
    renderRecords();
});

numberPad.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) {
        return;
    }
    if (button.dataset.value === "clear") {
        placeValue(0);
        return;
    }
    placeValue(Number(button.dataset.value));
});

authPasswordInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        handleLogin();
    }
});

document.addEventListener("keydown", handleKeyboardInput);

initializeTheme();
updateAuthUI();
renderRecords();

hasSavedGame = restoreSavedGame();
if (hasSavedGame) {
    stopTimer();
} else {
    continueGameButton.style.display = "none";
}

restoreServerSession().finally(() => {
    showStartScreen();
});
