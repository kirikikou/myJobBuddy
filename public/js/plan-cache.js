let _planLimitsCache = null;
let _planLimitsFetchPromise = null;
let _planCacheTimestamp = 0;

const PLAN_CACHE_TTL = 60000;

export async function getCachedPlanLimits() {
    const now = Date.now();
    
    if (_planLimitsCache && (now - _planCacheTimestamp) < PLAN_CACHE_TTL) {
        return _planLimitsCache;
    }
    
    if (_planLimitsFetchPromise) {
        return await _planLimitsFetchPromise;
    }
    
    _planLimitsFetchPromise = fetch('/plan/limits', {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
    }).then(async response => {
        if (!response.ok) throw new Error('Failed to fetch plan limits');
        const data = await response.json();
        _planLimitsCache = data;
        _planCacheTimestamp = now;
        _planLimitsFetchPromise = null;
        return data;
    }).catch(error => {
        _planLimitsFetchPromise = null;
        throw error;
    });
    
    return await _planLimitsFetchPromise;
}

export function invalidatePlanCache() {
    _planLimitsCache = null;
    _planCacheTimestamp = 0;
    _planLimitsFetchPromise = null;
}

window.getCachedPlanLimits = getCachedPlanLimits;
window.invalidatePlanCache = invalidatePlanCache;