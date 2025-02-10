// 로그 레벨 정의
const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  NONE: 4
};

class Logger {
  constructor(options = {}) {
    this.enabled = options.enabled ?? true;
    this.level = options.level ?? LogLevel.DEBUG;
    this.prefix = options.prefix ?? '';
    this.groupStack = [];
  }

  setLevel(level) {
    this.level = level;
  }

  enable() {
    this.enabled = true;
  }

  disable() {
    this.enabled = false;
  }

  shouldLog(level) {
    return this.enabled && level >= this.level;
  }

  formatMessage(message) {
    return this.prefix ? `[${this.prefix}] ${message}` : message;
  }

  debug(...args) {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.debug(this.formatMessage(...args));
      this.sendToBackground('debug', ...args);
    }
  }

  info(...args) {
    if (this.shouldLog(LogLevel.INFO)) {
      console.info(this.formatMessage(...args));
      this.sendToBackground('info', ...args);
    }
  }

  warn(...args) {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.formatMessage(...args));
      this.sendToBackground('warn', ...args);
    }
  }

  error(...args) {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(this.formatMessage(...args));
      this.sendToBackground('error', ...args);
    }
  }

  group(label) {
    if (this.enabled) {
      console.group(this.formatMessage(label));
      this.groupStack.push(label);
    }
  }

  groupEnd() {
    if (this.enabled && this.groupStack.length > 0) {
      console.groupEnd();
      this.groupStack.pop();
    }
  }

  time(label) {
    if (this.enabled) {
      console.time(this.formatMessage(label));
    }
  }

  timeEnd(label) {
    if (this.enabled) {
      console.timeEnd(this.formatMessage(label));
    }
  }

  sendToBackground(level, ...args) {
    if (chrome.runtime) {
      chrome.runtime.sendMessage({
        action: 'log',
        level,
        message: args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' '),
        timestamp: new Date().toISOString(),
        source: this.prefix
      });
    }
  }
}

// 실행 환경에 따라 다르게 처리
const isServiceWorker = typeof window === 'undefined';

if (isServiceWorker) {
  // Service Worker 환경
  self.logger = new Logger({
    enabled: false,
    level: LogLevel.ERROR,
    prefix: 'Background'
  });
  self.LogLevel = LogLevel;
} else {
  // Window 환경 (popup, content script)
  window.logger = new Logger({
    enabled: false,
    level: LogLevel.ERROR,
    prefix: 'Extension'
  });
  window.LogLevel = LogLevel;
}

// ES modules를 위한 export (필요한 경우)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Logger, LogLevel };
} 