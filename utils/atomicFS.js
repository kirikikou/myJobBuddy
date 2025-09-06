const fs = require('fs').promises;
const path = require('path');

const fileLocks = new Map();

async function withFileLock(filePath, fn) {
  const prev = fileLocks.get(filePath) || Promise.resolve();
  let release;
  const next = new Promise((res) => (release = res));
  fileLocks.set(filePath, prev.then(async () => {
    try { 
      return await fn(); 
    } finally { 
      release(); 
      fileLocks.delete(filePath); 
    }
  }));
  return prev.then(() => next);
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true }).catch(() => {});
}

async function safeWriteJson(filePath, data, { retries = 5, retryDelay = 60 } = {}) {
  return withFileLock(filePath, async () => {
    await ensureDir(path.dirname(filePath));
    const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}.json`;
    const payload = JSON.stringify(data, null, 2);

    await fs.writeFile(tmp, payload, 'utf8');

    let lastErr;
    for (let i = 0; i < retries; i++) {
      try {
        await fs.rename(tmp, filePath);
        return true;
      } catch (err) {
        lastErr = err;
        if (['EPERM','EEXIST','EBUSY'].includes(err.code)) {
          try { 
            await fs.unlink(filePath); 
          } catch {}
          try {
            await fs.rename(tmp, filePath);
            return true;
          } catch (err2) {
            lastErr = err2;
          }
        }
        if (i === retries - 1) {
          try {
            await fs.copyFile(tmp, filePath);
            await fs.unlink(tmp).catch(() => {});
            return true;
          } catch (err3) {
            lastErr = err3;
          }
        }
        await new Promise(r => setTimeout(r, retryDelay * (i + 1)));
      }
    }
    await fs.unlink(tmp).catch(() => {});
    throw lastErr;
  });
}

module.exports = { safeWriteJson };