const os = require('os');
const loggingService = require('./services/LoggingService');

class SystemMonitor {
    constructor() {
        this.interval = null;
        this.startTime = Date.now();
        this.maxMemory = 0;
        this.requestCount = 0;
    }
    
    formatBytes(bytes) {
        return Math.round(bytes / 1024 / 1024);
    }
    
    formatLoad(load) {
        return load.toFixed(2);
    }
    
    getMemoryBar(used, total, width = 20) {
        const percentage = used / total;
        const filled = Math.round(percentage * width);
        const empty = width - filled;
        return `[${'â–ˆ'.repeat(filled)}${' '.repeat(empty)}] ${(percentage * 100).toFixed(1)}%`;
    }
    
    async checkServerStats() {
        try {
            const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
            const response = await fetch('http://localhost:3000/api/scraping/stats', { timeout: 1000 });
            if (response.ok) {
                const data = await response.json();
                return data.stats || {};
            }
        } catch (error) {
            return { error: 'Server unreachable' };
        }
        return {};
    }
    
    displayMetrics() {
        const memUsage = process.memoryUsage();
        const currentMemory = this.formatBytes(memUsage.heapUsed);
        const totalMemory = this.formatBytes(os.totalmem());
        const freeMemory = this.formatBytes(os.freemem());
        const load = os.loadavg();
        const uptime = Math.round((Date.now() - this.startTime) / 1000);
        
        if (currentMemory > this.maxMemory) {
            this.maxMemory = currentMemory;
        }
        
        process.stdout.write('\x1Bc');
        loggingService.service('SystemMonitor', 'display-header', { title: 'SYSTEM MONITOR - myJobBuddy Stress Test' });
        loggingService.service('SystemMonitor', 'display-separator');
        loggingService.service('SystemMonitor', 'display-uptime', { uptime, peakMemory: this.maxMemory });
        
        loggingService.service('SystemMonitor', 'display-memory-usage', {
            heapUsed: currentMemory,
            heapTotal: this.formatBytes(memUsage.heapTotal),
            systemFree: freeMemory,
            systemTotal: totalMemory,
            memoryBar: this.getMemoryBar(memUsage.heapUsed, memUsage.heapTotal)
        });
        
        loggingService.service('SystemMonitor', 'display-cpu-load', {
            load1min: this.formatLoad(load[0]),
            load5min: this.formatLoad(load[1]),
            load15min: this.formatLoad(load[2])
        });
        
        loggingService.service('SystemMonitor', 'display-server-status-header');
        this.checkServerStats().then(stats => {
            if (stats.error) {
                loggingService.service('SystemMonitor', 'display-server-error', { error: stats.error });
            } else {
                loggingService.service('SystemMonitor', 'display-server-responsive');
                if (stats.coordinator) {
                    loggingService.service('SystemMonitor', 'display-active-domains', { count: stats.coordinator.activeDomains || 0 });
                }
                if (stats.queue && stats.queue.totalActiveScrapeCount !== undefined) {
                    loggingService.service('SystemMonitor', 'display-active-scrapes', { count: stats.queue.totalActiveScrapeCount });
                }
            }
        });
        
        loggingService.service('SystemMonitor', 'display-controls');
    }
    
    start() {
        loggingService.service('SystemMonitor', 'starting');
        
        this.displayMetrics();
        this.interval = setInterval(() => {
            this.displayMetrics();
        }, 2000);
        
        process.on('SIGINT', () => {
            this.stop();
        });
    }
    
    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        
        const totalTime = Math.round((Date.now() - this.startTime) / 1000);
        loggingService.service('SystemMonitor', 'stopped', { peakMemory: this.maxMemory, totalTime });
        process.exit(0);
    }
}

if (require.main === module) {
    const monitor = new SystemMonitor();
    monitor.start();
}

module.exports = SystemMonitor;