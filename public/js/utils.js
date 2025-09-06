function generateId(str) {
    return str.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function formatDate(dateInput) {
    if (!dateInput) return '';
    
    let date;
    if (dateInput instanceof Date) {
        date = dateInput;
    } else if (typeof dateInput === 'string') {
        const trimmed = dateInput.trim();
        if (!trimmed) return '';
        
        if (trimmed.includes('/')) {
            const parts = trimmed.split('/');
            if (parts.length === 3) {
                const day = parseInt(parts[0], 10);
                const month = parseInt(parts[1], 10);
                const year = parseInt(parts[2], 10);
                
                const fullYear = year < 100 ? (year < 50 ? 2000 + year : 1900 + year) : year;
                date = new Date(fullYear, month - 1, day);
            } else {
                date = new Date(trimmed);
            }
        } else {
            date = new Date(trimmed);
        }
    } else {
        date = new Date(dateInput);
    }
    
    if (isNaN(date.getTime())) {
        return '';
    }
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    return `${year}-${month}-${day}`;
}

function getTodayDate() {
    return new Date().toISOString().split('T')[0];
}

function getTimeDifference(dateStr) {
    if (!dateStr) return null;
    
    const date = new Date(dateStr);
    const today = new Date();
    const diffTime = Math.abs(today - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays;
}

function getReminderScore(dateStr) {
    if (!dateStr) return -1;
    
    const diffDays = getTimeDifference(dateStr);
    
    if (diffDays < 15) {
        return 0;
    } else if (diffDays < 30) {
        return 1;
    } else {
        return 2;
    }
}

function getReminderLabel(score) {
    switch (score) {
        case 0:
            return 'Recent';
        case 1:
            return 'Follow Up Soon';
        case 2:
            return 'Overdue';
        default:
            return '';
    }
}

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function saveToServer() {
    if (!window.isAuthenticated) {
        window.clientConfig&&window.clientConfig.smartLog('buffer','User not authenticated, skipping server save');
        return;
    }
    
    try {
        const response = await fetch('/api/save-user-preferences', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(userData)
        });
        
        if (!response.ok) {
            throw new Error('Failed to save to server');
        }
        
        const result = await response.json();
        if (result.success) {
            window.clientConfig&&window.clientConfig.smartLog('buffer','Data saved to server successfully');
        } else {
            window.clientConfig&&window.clientConfig.smartLog('fail','Server save failed:', result.message);
        }
    } catch (error) {
        window.clientConfig&&window.clientConfig.smartLog('fail','Error saving to server:', error);
    }
}

window.isAuthenticated = false;

function showToast(message, type = 'info') {
    if (window.showToast && typeof window.showToast === 'function') {
        const correctedType = type === 'warning' ? 'warning' : type;
        window.showToast(correctedType, message);
    } else {
        const CID = 'global-toast-container';
        let container = document.getElementById(CID);
        if (!container) {
            container = document.createElement('div');
            container.id = CID;
            container.style.cssText = `
                position:fixed;top:20px;right:20px;z-index:9999;
                display:flex;flex-direction:column;align-items:flex-end;
            `;
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.style.cssText = `
            min-width:200px;margin:0 0 10px;padding:10px 14px;border-radius:4px;
            color:#fff;font:14px/1.3 sans-serif;box-shadow:0 2px 6px rgba(0,0,0,.2);
            opacity:0;transition:opacity .3s ease;
            background:${type==='success'
                         ?'#28a745'
                         :type==='error'
                         ?'#dc3545'
                         :type==='warning'
                         ?'#ffc107'
                         :'#007bff'};
        `;
        toast.textContent = message;
        container.appendChild(toast);
        requestAnimationFrame(() => (toast.style.opacity = '1'));

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.addEventListener('transitionend', () => {
                toast.remove();
                if (!container.children.length) container.remove();
            });
        }, 3000);
    }
}

window.showToast = showToast;