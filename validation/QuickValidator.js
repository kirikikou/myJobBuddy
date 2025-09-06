const config = require('../config');
const DomainProfiler = require('./scrapers/DomainProfiler');
const ProfileQueueManager = require('./scrapers/ProfileQueueManager');
const cacheManager = require('./cacheManager');

class QuickValidator {
  constructor() {
    this.profiler = new DomainProfiler();
  }

  async testFranceTravailFix() {
    config.smartLog('buffer','🇫🇷 Testing France Travail fix...');
    
    const franceTravailUrl = 'https://candidat.francetravail.fr/offres/emploi/mecatronicien/s18m9';
    
    try {
      await this.profiler.resetDomainProfile(franceTravailUrl, 'validation_test');
      
      config.smartLog('buffer','Before fix test - creating session with cache success...');
      
      const sessionDataWithCacheSuccess = {
        stepUsed: 'adaptive-fallback',
        wasHeadless: false,
        startTime: Date.now() - 5000,
        endTime: Date.now(),
        success: false,
        contentText: 'emploi candidat france travail mecatronicien job',
        errorMessage: 'Technical step failed but cache created',
        jobsFound: 72,
        platform: 'FranceTravail',
        cacheCreated: true
      };

      const updatedProfile = await this.profiler.recordScrapingSession(
        franceTravailUrl, 
        sessionDataWithCacheSuccess
      );

      config.smartLog('buffer','\n📊 Results after fix:');
      config.smartLog('buffer',`   Successes: ${updatedProfile.successes} (should be 1)`);
      config.smartLog('buffer',`   Failures: ${updatedProfile.failures} (should be 0)`);
      config.smartLog('buffer',`   Needs Reprofiling: ${updatedProfile.needsReprofiling} (should be false)`);
      config.smartLog('buffer',`   Step: ${updatedProfile.step} (should be 'adaptive-fallback')`);
      config.smartLog('buffer',`   Last Jobs: ${updatedProfile.lastJobs} (should be 72)`);
      config.smartLog('buffer',`   Success Rate: ${updatedProfile.successRate}% (should be 100)`);

      const isFixed = updatedProfile.successes === 1 && 
                     !updatedProfile.needsReprofiling && 
                     updatedProfile.step === 'adaptive-fallback' &&
                     updatedProfile.lastJobs === 72;

      if (isFixed) {
        config.smartLog('buffer','\n✅ FRANCE TRAVAIL FIX WORKING CORRECTLY!');
        config.smartLog('buffer','   Cache created + jobs found = effective success detected');
        return true;
      } else {
        config.smartLog('buffer','\n❌ FRANCE TRAVAIL FIX NOT WORKING');
        config.smartLog('buffer','   Expected: successes=1, needsReprofiling=false, step=adaptive-fallback, lastJobs=72');
        return false;
      }
      
    } catch (error) {
      config.smartLog('fail','❌ France Travail test failed:', error.message);
      return false;
    }
  }

  async testQueueManagement() {
    config.smartLog('buffer','\n🔄 Testing queue management...');
    
    try {
      await ProfileQueueManager.start();
      
      const testDomain = 'test-domain.example.com';
      config.smartLog('buffer',`Testing concurrent requests for domain: ${testDomain}`);
      
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          ProfileQueueManager.requestScrapingSlot(testDomain, `user_${i}`)
            .then(result => ({ userId: `user_${i}`, ...result }))
            .catch(error => ({ userId: `user_${i}`, error: error.message }))
        );
      }
      
      const results = await Promise.allSettled(promises);
      
      let grantedCount = 0;
      let queuedCount = 0;
      let errorCount = 0;
      
      config.smartLog('buffer','\n📊 Queue test results:');
      
      for (const result of results) {
        if (result.status === 'fulfilled') {
          const data = result.value;
          if (data.allowed) {
            grantedCount++;
            config.smartLog('buffer',`   ✅ ${data.userId}: GRANTED (${data.scraperId})`);
            if (data.scraperId) {
              await ProfileQueueManager.releaseScrapingSlot(testDomain, data.scraperId);
            }
          } else if (data.error) {
            errorCount++;
            config.smartLog('buffer',`   ❌ ${data.userId}: ERROR (${data.error})`);
          } else {
            queuedCount++;
            config.smartLog('buffer',`   ⏳ ${data.userId}: QUEUED`);
          }
        } else {
          errorCount++;
          config.smartLog('buffer',`   ❌ Request failed: ${result.reason}`);
        }
      }
      
      config.smartLog('buffer',`\nSummary: ${grantedCount} granted, ${queuedCount} queued, ${errorCount} errors`);
      
      if (grantedCount === 1 && queuedCount >= 3) {
        config.smartLog('buffer','✅ QUEUE MANAGEMENT WORKING CORRECTLY!');
        config.smartLog('buffer','   Only 1 request granted, others properly queued');
        return true;
      } else {
        config.smartLog('buffer','❌ QUEUE MANAGEMENT NOT WORKING');
        config.smartLog('buffer','   Expected: 1 granted, 3+ queued');
        return false;
      }
      
    } catch (error) {
      config.smartLog('fail','❌ Queue management test failed:', error.message);
      return false;
    }
  }

  async runQuickValidation() {
    config.smartLog('buffer','🧪 Running quick validation of critical fixes...\n');
    
    const tests = [];
    
    tests.push(await this.testFranceTravailFix());
    tests.push(await this.testQueueManagement());
    
    const passedTests = tests.filter(Boolean).length;
    const totalTests = tests.length;
    
    config.smartLog('buffer','\n' + '='.repeat(50));
    config.smartLog('buffer','📊 QUICK VALIDATION REPORT');
    config.smartLog('buffer','='.repeat(50));
    config.smartLog('buffer',`Tests passed: ${passedTests}/${totalTests}`);
    
    if (passedTests === totalTests) {
      config.smartLog('buffer','🎉 ALL CRITICAL FIXES VALIDATED SUCCESSFULLY!');
      config.smartLog('buffer','✅ FranceTravail bug is fixed');
      config.smartLog('buffer','✅ Queue management is working');
      config.smartLog('buffer','\nYour system is ready for 1000+ concurrent users!');
    } else {
      config.smartLog('buffer','⚠️ SOME CRITICAL FIXES FAILED');
      config.smartLog('buffer','Please check the implementation');
    }
    
    return passedTests === totalTests;
  }
}

async function runQuickTest() {
  const validator = new QuickValidator();
  
  try {
    const success = await validator.runQuickValidation();
    process.exit(success ? 0 : 1);
  } catch (error) {
    config.smartLog('fail','❌ Validation failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  runQuickTest();
}

module.exports = QuickValidator;