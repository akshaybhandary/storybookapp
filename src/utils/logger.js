// Logger Utility
// Provides comprehensive logging with timestamps, context, and error tracking

const LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3
};

const ENV = import.meta.env.MODE || 'development';
const IS_DEV = ENV === 'development';

class Logger {
    constructor() {
        this.logs = [];
        this.maxLogs = 1000; // Keep last 1000 logs
        this.currentLevel = IS_DEV ? LOG_LEVELS.DEBUG : LOG_LEVELS.INFO;
    }

    _formatMessage(level, context, message, data = {}) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            context,
            message,
            data,
            userAgent: navigator.userAgent,
            url: window.location.href
        };

        // Store log
        this.logs.push(logEntry);
        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }

        return logEntry;
    }

    _shouldLog(level) {
        return LOG_LEVELS[level] >= this.currentLevel;
    }

    _consoleLog(level, logEntry) {
        const { timestamp, context, message, data } = logEntry;
        const timeStr = new Date(timestamp).toLocaleTimeString();
        const prefix = `[${timeStr}] [${level}] [${context}]`;

        const style = {
            DEBUG: 'color: #888',
            INFO: 'color: #0ea5e9',
            WARN: 'color: #f59e0b; font-weight: bold',
            ERROR: 'color: #ef4444; font-weight: bold'
        };

        if (Object.keys(data).length > 0) {
            console.log(`%c${prefix} ${message}`, style[level], data);
        } else {
            console.log(`%c${prefix} ${message}`, style[level]);
        }
    }

    debug(context, message, data) {
        if (!this._shouldLog('DEBUG')) return;
        const logEntry = this._formatMessage('DEBUG', context, message, data);
        this._consoleLog('DEBUG', logEntry);
    }

    info(context, message, data) {
        if (!this._shouldLog('INFO')) return;
        const logEntry = this._formatMessage('INFO', context, message, data);
        this._consoleLog('INFO', logEntry);
    }

    warn(context, message, data) {
        if (!this._shouldLog('WARN')) return;
        const logEntry = this._formatMessage('WARN', context, message, data);
        this._consoleLog('WARN', logEntry);
    }

    error(context, message, error, data = {}) {
        const errorData = {
            ...data,
            errorMessage: error?.message || String(error),
            errorStack: error?.stack,
            errorName: error?.name
        };

        const logEntry = this._formatMessage('ERROR', context, message, errorData);
        this._consoleLog('ERROR', logEntry);

        // In production, you could send to error tracking service here
        // Example: Sentry.captureException(error, { extra: logEntry });
    }

    // API-specific logging
    apiRequest(endpoint, method, params) {
        this.info('API', `Request: ${method} ${endpoint}`, {
            endpoint,
            method,
            params: this._sanitizeParams(params)
        });
    }

    apiResponse(endpoint, status, duration, data = {}) {
        const level = status >= 400 ? 'ERROR' : status >= 300 ? 'WARN' : 'INFO';
        this[level.toLowerCase()]('API', `Response: ${endpoint} (${status}) in ${duration}ms`, {
            endpoint,
            status,
            duration,
            ...data
        });
    }

    apiError(endpoint, error, duration) {
        this.error('API', `Failed: ${endpoint} after ${duration}ms`, error, {
            endpoint,
            duration
        });
    }

    // Image generation specific
    imageGenerationStart(pageNumber, prompt) {
        this.info('IMAGE-GEN', `Starting image generation for page ${pageNumber}`, {
            pageNumber,
            promptLength: prompt?.length
        });
    }

    imageGenerationSuccess(pageNumber, duration, hasImage) {
        this.info('IMAGE-GEN', `Page ${pageNumber} completed in ${duration}ms`, {
            pageNumber,
            duration,
            hasImage,
            status: hasImage ? 'success' : 'fallback'
        });
    }

    imageGenerationError(pageNumber, error, duration) {
        this.error('IMAGE-GEN', `Page ${pageNumber} failed after ${duration}ms`, error, {
            pageNumber,
            duration
        });
    }

    // Story generation specific
    storyGenerationStart(childName, theme, pageCount) {
        this.info('STORY-GEN', 'Starting story generation', {
            childName,
            themeLength: theme?.length,
            pageCount
        });
    }

    storyGenerationSuccess(pageCount, duration) {
        this.info('STORY-GEN', `Story generated successfully in ${duration}ms`, {
            pageCount,
            duration
        });
    }

    storyGenerationError(error, duration) {
        this.error('STORY-GEN', `Story generation failed after ${duration}ms`, error, {
            duration
        });
    }

    // Storage operations
    storageOperation(operation, success, data = {}) {
        if (success) {
            this.debug('STORAGE', `${operation} succeeded`, data);
        } else {
            this.warn('STORAGE', `${operation} failed`, data);
        }
    }

    // Helper to sanitize sensitive data
    _sanitizeParams(params) {
        if (!params) return {};
        const sanitized = { ...params };

        // Remove or mask sensitive fields
        if (sanitized.apiKey) {
            sanitized.apiKey = `***${sanitized.apiKey.slice(-4)}`;
        }
        if (sanitized.Authorization) {
            sanitized.Authorization = '***REDACTED***';
        }

        return sanitized;
    }

    // Get all logs (useful for debugging or sending to support)
    getLogs(level = null) {
        if (level) {
            return this.logs.filter(log => log.level === level);
        }
        return [...this.logs];
    }

    // Export logs as JSON
    exportLogs() {
        const blob = new Blob([JSON.stringify(this.logs, null, 2)], {
            type: 'application/json'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `storybook-logs-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // Clear logs
    clear() {
        this.logs = [];
        this.info('LOGGER', 'Logs cleared');
    }

    // Get summary statistics
    getStats() {
        const stats = {
            total: this.logs.length,
            byLevel: {},
            byContext: {},
            errors: [],
            recentErrors: []
        };

        this.logs.forEach(log => {
            // Count by level
            stats.byLevel[log.level] = (stats.byLevel[log.level] || 0) + 1;

            // Count by context
            stats.byContext[log.context] = (stats.byContext[log.context] || 0) + 1;

            // Collect errors
            if (log.level === 'ERROR') {
                stats.errors.push(log);
            }
        });

        // Get last 5 errors
        stats.recentErrors = stats.errors.slice(-5);

        return stats;
    }
}

// Create singleton instance
const logger = new Logger();

// Only expose logger globally in development
if (IS_DEV) {
    window.logger = logger;
    console.log('%c🔧 Development Mode - Logger available via window.logger', 'color: #10b981; font-weight: bold; font-size: 12px;');
    console.log('%c📊 Debug commands: logger.getLogs(), logger.getStats(), logger.exportLogs()', 'color: #6366f1; font-size: 11px;');
    console.log('%c---', 'color: #444;');
} else {
    // In production, only expose to console for support debugging
    // Users won't see the debug panel, but we can still access logs via console
    window.__getAppLogs = () => logger.getLogs();
    window.__exportAppLogs = () => logger.exportLogs();
}

// Production error tracking integration point
// Uncomment and configure when ready to use Sentry, LogRocket, etc.
/*
if (!IS_DEV && window.Sentry) {
  // Override error method to send to Sentry
  const originalError = logger.error.bind(logger);
  logger.error = (context, message, error, data) => {
    originalError(context, message, error, data);
    window.Sentry.captureException(error, {
      extra: { context, message, ...data }
    });
  };
}
*/

export default logger;
