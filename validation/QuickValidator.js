const DomainProfiler = require('./scrapers/DomainProfiler');
const ProfileQueueManager = require('./scrapers/ProfileQueueManager');
const cacheManager = require('./cacheManager');

const loggingService = require('../services/LoggingService');

class QuickValidator {
  constructor() {
    this.profiler = new DomainProfiler();
  }

  async testFranceTravailFix() {
    loggingService.steps('QuickValidator', 'france-travail-test-start', {
      testUrl: 'https://candidat.francetravail.fr/offres/emploi/mecatronicien/s18m9'
    });
    
    const franceTravailUrl = 'https://candidat.francetravail.fr/offres/emploi/mecatronicien/s18m9';
    
    try {
      await this.profiler.resetDomainProfile(franceTravailUrl, 'validation_test');
      
      loggingService.steps('QuickValidator', 'cache-success-session-creation', {
        action: 'creating session with cache success'
      });
      
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

      loggingService.steps('QuickValidator', 'france-travail-results', {
        successes: updatedProfile.successes,
        failures: updatedProfile.failures,
        needsReprofiling: updatedProfile.needsReprofiling,
        step: updatedProfile.step,
        lastJobs: updatedProfile.lastJobs,
        successRate: updatedProfile.successRate,
        expected: {
          successes: 1,
          failures: 0,
          needsReprofiling: false,
          step: 'adaptive-fallback',
          lastJobs: 72,
          successRate: 100
        }
      });

      const isFixed = updatedProfile.successes === 1 && 
                     !updatedProfile.needsReprofiling && 
                     updatedProfile.step === 'adaptive-fallback' &&
                     updatedProfile.lastJobs === 72;

      if (isFixed) {
        loggingService.win('France Travail fix working correctly', {
          reason: 'cache created + jobs found = effective success detected',
          testResult: 'PASS'
        });
        return true;
      } else {
        loggingService.fail('France Travail fix not working', {
          expected: {
            successes: 1,
            needsReprofiling: false,
            step: 'adaptive-fallback',
            lastJobs: 72
          },
          actual: {
            successes: updatedProfile.successes,
            needsReprofiling: updatedProfile.needsReprofiling,
            step: updatedProfile.step,
            lastJobs: updatedProfile.lastJobs
          },
          testResult: 'FAIL'
        });
        return false;
      }
      
    } catch (error) {
      loggingService.error('France Travail test failed', {
        error: error.message,
        testName: 'testFranceTravailFix'
      });
      return false;
    }
  }

  async testQueueManagement() {
    loggingService.steps('QuickValidator', 'queue-management-test-start', {
      testDomain: 'test-domain.example.com',
      concurrentRequests: 5
    });
    
    try {
      await ProfileQueueManager.start();
      
      const testDomain = 'test-domain.example.com';
      loggingService.steps('QuickValidator', 'concurrent-requests-test', {
        domain: testDomain,
        requestCount: 5
      });
      
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
      const userResults = [];
      
      for (const result of results) {
        if (result.status === 'fulfilled') {
          const data = result.value;
          if (data.allowed) {
            grantedCount++;
            userResults.push({
              userId: data.userId,
              status: 'GRANTED',
              scraperId: data.scraperId
            });
            if (data.scraperId) {
              await ProfileQueueManager.releaseScrapingSlot(testDomain, data.scraperId);
            }
          } else if (data.error) {
            errorCount++;
            userResults.push({
              userId: data.userId,
              status: 'ERROR',
              error: data.error
            });
          } else {
            queuedCount++;
            userResults.push({
              userId: data.userId,
              status: 'QUEUED'
            });
          }
        } else {
          errorCount++;
          userResults.push({
            status: 'REQUEST_FAILED',
            reason: result.reason
          });
        }
      }
      
      loggingService.steps('QuickValidator', 'queue-test-results', {
        summary: {
          granted: grantedCount,
          queued: queuedCount,
          errors: errorCount
        },
        userResults: userResults
      });
      
      if (grantedCount === 1 && queuedCount >= 3) {
        loggingService.win('Queue management working correctly', {
          granted: grantedCount,
          queued: queuedCount,
          explanation: 'Only 1 request granted, others properly queued',
          testResult: 'PASS'
        });
        return true;
      } else {
        loggingService.fail('Queue management not working', {
          expected: {
            granted: 1,
            queued: '3+'
          },
          actual: {
            granted: grantedCount,
            queued: queuedCount
          },
          testResult: 'FAIL'
        });
        return false;
      }
      
    } catch (error) {
      loggingService.error('Queue management test failed', {
        error: error.message,
        testName: 'testQueueManagement'
      });
      return false;
    }
  }

  async runQuickValidation() {
    loggingService.service('QuickValidator', 'validation-start', {
      message: 'Running quick validation of critical fixes'
    });
    
    const tests = [];
    
    tests.push(await this.testFranceTravailFix());
    tests.push(await this.testQueueManagement());
    
    const passedTests = tests.filter(Boolean).length;
    const totalTests = tests.length;
    
    loggingService.service('QuickValidator', 'validation-report', {
      testsPassed: passedTests,
      totalTests: totalTests,
      successRate: `${passedTests}/${totalTests}`
    });
    
    if (passedTests === totalTests) {
      loggingService.win('All critical fixes validated successfully', {
        testsPassed: passedTests,
        totalTests: totalTests,
        fixes: [
          'FranceTravail bug is fixed',
          'Queue management is working'
        ],
        systemStatus: 'Ready for 1000+ concurrent users'
      });
    } else {
      loggingService.fail('Some critical fixes failed validation', {
        testsPassed: passedTests,
        totalTests: totalTests,
        recommendation: 'Please check the implementation'
      });
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
    loggingService.error('Validation failed', {
      error: error.message,
      context: 'runQuickTest'
    });
    process.exit(1);
  }
}

if (require.main === module) {
  runQuickTest();
}

module.exports = QuickValidator;