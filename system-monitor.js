const config = require('./config');
const os = require('os');

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
        return `[${'█'.repeat(filled)}${' '.repeat(empty)}] ${(percentage * 100).toFixed(1)}%`;
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
        
        console.clear();
        config.smartLog('buffer','🖥️  SYSTEM MONITOR - myJobBuddy Stress Test');
        config.smartLog('buffer','═'.repeat(60));
        config.smartLog('buffer',`⏱️  Uptime: ${uptime}s | 🔥 Peak Memory: ${this.maxMemory}MB`);
        config.smartLog('buffer','');
        
        config.smartLog('buffer','📊 MEMORY USAGE:');
        config.smartLog('buffer',`   Heap Used: ${currentMemory}MB ${this.getMemoryBar(memUsage.heapUsed, memUsage.heapTotal)}`);
        config.smartLog('buffer',`   Heap Total: ${this.formatBytes(memUsage.heapTotal)}MB`);
        config.smartLog('buffer',`   System Free: ${freeMemory}MB / ${totalMemory}MB`);
        config.smartLog('buffer','');
        
        config.smartLog('buffer','⚡ CPU LOAD:');
        config.smartLog('buffer',`   1min: ${this.formatLoad(load[0])} | 5min: ${this.formatLoad(load[1])} | 15min: ${this.formatLoad(load[2])}`);
        config.smartLog('buffer','');
        
        config.smartLog('buffer','🌐 SERVER STATUS:');
        this.checkServerStats().then(stats => {
            if (stats.error) {
                config.smartLog('buffer',`   ❌ ${stats.error}`);
            } else {
                config.smartLog('buffer',`   ✅ Server responsive`);
                if (stats.coordinator) {
                    config.smartLog('buffer',`   🎯 Active domains: ${stats.coordinator.activeDomains || 0}`);
                }
                if (stats.queue && stats.queue.totalActiveScrapeCount !== undefined) {
                    config.smartLog('buffer',`   🔄 Active scrapes: ${stats.queue.totalActiveScrapeCount}`);
                }
            }
        });
        
        config.smartLog('buffer','');
        config.smartLog('buffer','🎮 CONTROLS:');
        config.smartLog('buffer','   Ctrl+C to stop monitoring');
        config.smartLog('buffer','═'.repeat(60));
    }
    
    start() {
        config.smartLog('buffer','🚀 Starting system monitor...');
        config.smartLog('buffer','📊 Monitoring system performance for stress test');
        config.smartLog('buffer','');
        
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
        
        config.smartLog('buffer','');
        config.smartLog('buffer','🛑 System monitor stopped');
        config.smartLog('buffer',`📈 Peak memory usage: ${this.maxMemory}MB`);
        config.smartLog('buffer',`⏱️  Total monitoring time: ${Math.round((Date.now() - this.startTime) / 1000)}s`);
        process.exit(0);
    }
}

if (require.main === module) {
    const monitor = new SystemMonitor();
    monitor.start();
}

module.exports = SystemMonitor;