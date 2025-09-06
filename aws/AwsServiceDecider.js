const DomainProfiler = require('../scrapers/DomainProfiler');
const config = require('../config');

class AwsServiceDecider {
  constructor() {
    this.domainProfiler = new DomainProfiler();
    this.isAwsEnabled = process.env.AWS_ENABLED === 'true' || false;
    this.lambdaMaxDuration = 15 * 60 * 1000; // 15 minutes
    this.lambdaMemoryLimit = 3008; // MB
    this.fargateMinDuration = 5 * 60 * 1000; // 5 minutes minimum for cost efficiency
  }

  async decideService(url, jobTitles = [], options = {}) {
    config.smartLog('buffer',`🤖 AWS Service Decision for: ${url}`);
    
    if (!this.isAwsEnabled) {
      config.smartLog('buffer',`📍 AWS disabled, using local processing`);
      return {
        service: 'local',
        reason: 'AWS not enabled',
        estimatedDuration: 0,
        recommendations: []
      };
    }

    try {
      const profile = await this.domainProfiler.getDomainProfile(url);
      const decision = await this.analyzeRequirements(url, profile, jobTitles, options);
      
      config.smartLog('buffer',`🎯 AWS Decision: ${decision.service} (${decision.reason})`);
      return decision;
      
    } catch (error) {
      config.smartLog('fail',`Error in AWS service decision: ${error.message}`);
      return {
        service: 'local',
        reason: `Decision error: ${error.message}`,
        estimatedDuration: 0,
        recommendations: ['Check AWS configuration', 'Verify domain profiler']
      };
    }
  }

  async analyzeRequirements(url, profile, jobTitles, options) {
    const analysis = {
      service: 'lambda',
      reason: 'Default lightweight processing',
      estimatedDuration: 300000, // 5 minutes default
      estimatedCost: 0,
      confidence: 'low',
      recommendations: []
    };

    if (!profile) {
      analysis.reason = 'No profile available, assuming lightweight';
      analysis.confidence = 'very_low';
      analysis.recommendations.push('Run initial profiling to improve accuracy');
      return analysis;
    }

    const requiresHeadless = profile.requiresHeadless || false;
    const avgDuration = profile.averageProcessingTime || 300000;
    const successRate = profile.successRate || 0;
    const preferredStep = profile.preferredStep;

    if (requiresHeadless) {
      analysis.service = 'fargate';
      analysis.reason = 'Requires headless browser';
      analysis.confidence = 'high';
    }

    if (avgDuration > this.lambdaMaxDuration) {
      analysis.service = 'fargate';
      analysis.reason = `Duration ${Math.round(avgDuration/60000)}min exceeds Lambda limit`;
      analysis.confidence = 'high';
    }

    const complexSteps = [
      'HeadlessRenderingStep',
      'WorkdayStep', 
      'SuccessFactorsStep',
      'OracleStep',
      'ADPStep'
    ];
    
    if (preferredStep && complexSteps.some(step => preferredStep.includes(step))) {
      analysis.service = 'fargate';
      analysis.reason = `Complex platform detected: ${preferredStep}`;
      analysis.confidence = 'high';
    }

    if (successRate < 70 && profile.totalAttempts > 3) {
      analysis.service = 'fargate';
      analysis.reason = `Low success rate: ${successRate}% requires robust processing`;
      analysis.confidence = 'medium';
    }

    const complexPlatforms = Object.keys(profile.platforms || {}).filter(platform => 
      ['workday', 'successfactors', 'oracle', 'adp', 'taleo'].some(complex => 
        platform.toLowerCase().includes(complex)
      )
    );
    
    if (complexPlatforms.length > 0) {
      analysis.service = 'fargate';
      analysis.reason = `Complex platform: ${complexPlatforms.join(', ')}`;
      analysis.confidence = 'high';
    }

    if (options.forceHeadless) {
      analysis.service = 'fargate';
      analysis.reason = 'Headless forced by options';
      analysis.confidence = 'high';
    }

    if (options.priority === 'high' && avgDuration < this.fargateMinDuration) {
      analysis.service = 'fargate';
      analysis.reason = 'High priority processing requested';
      analysis.confidence = 'medium';
    }

    analysis.estimatedDuration = this.estimateDuration(profile, analysis.service);
    analysis.estimatedCost = this.estimateCost(analysis.service, analysis.estimatedDuration);
    
    this.addRecommendations(analysis, profile, options);
    
    return analysis;
  }

  estimateDuration(profile, service) {
    if (!profile) {
      return service === 'lambda' ? 300000 : 600000; // 5min vs 10min
    }

    let baseDuration = profile.averageProcessingTime || 300000;
    
    if (service === 'lambda') {
      return Math.min(baseDuration, this.lambdaMaxDuration * 0.9);
    } else {
      return Math.max(baseDuration, this.fargateMinDuration);
    }
  }

  estimateCost(service, duration) {
    const durationMinutes = duration / 60000;
    
    if (service === 'lambda') {
      const requests = 1;
      const memoryMB = 1024;
      const gbSeconds = (memoryMB / 1024) * (duration / 1000);
      return (requests * 0.0000002) + (gbSeconds * 0.0000166667);
    } else {
      const vCpu = 1;
      const memoryGB = 2;
      const pricePerHour = (vCpu * 0.04048) + (memoryGB * 0.004445);
      return (pricePerHour / 60) * durationMinutes;
    }
  }

  addRecommendations(analysis, profile, options) {
    if (!profile) {
      analysis.recommendations.push('Run test scraping to build domain profile');
      return;
    }

    if (profile.totalAttempts < 5) {
      analysis.recommendations.push('More profiling data needed for better decisions');
    }

    if (analysis.service === 'lambda' && profile.averageProcessingTime > 600000) {
      analysis.recommendations.push('Consider optimizing scraping steps for Lambda');
    }

    if (analysis.service === 'fargate' && !profile.requiresHeadless) {
      analysis.recommendations.push('Investigate if headless is truly required');
    }

    if (profile.successRate < 80) {
      analysis.recommendations.push('Low success rate - review scraping strategy');
    }

    const lastError = profile.lastError;
    if (lastError && Date.now() - new Date(lastError.timestamp).getTime() < 86400000) {
      analysis.recommendations.push(`Recent error: ${lastError.message}`);
    }
  }

  async getBatchDecisions(urls, jobTitles = [], options = {}) {
    config.smartLog('buffer',`🔄 Batch AWS decisions for ${urls.length} URLs`);
    
    const decisions = {};
    const batchStats = {
      lambda: 0,
      fargate: 0,
      local: 0,
      totalEstimatedCost: 0,
      totalEstimatedDuration: 0
    };

    for (const url of urls) {
      try {
        const decision = await this.decideService(url, jobTitles, options);
        decisions[url] = decision;
        
        batchStats[decision.service]++;
        batchStats.totalEstimatedCost += decision.estimatedCost || 0;
        batchStats.totalEstimatedDuration += decision.estimatedDuration || 0;
        
      } catch (error) {
        config.smartLog('fail',`Error deciding service for ${url}: ${error.message}`);
        decisions[url] = {
          service: 'local',
          reason: `Error: ${error.message}`,
          estimatedDuration: 0,
          estimatedCost: 0
        };
        batchStats.local++;
      }
    }

    return {
      decisions,
      batchStats: {
        ...batchStats,
        averageCostPerUrl: batchStats.totalEstimatedCost / urls.length,
        averageDurationPerUrl: batchStats.totalEstimatedDuration / urls.length
      }
    };
  }

  async getServiceRecommendations() {
    const stats = await this.domainProfiler.getProfileStats();
    
    const recommendations = {
      lambdaOptimal: stats.lambdaRecommended,
      fargateRequired: stats.fargateRecommended,
      totalDomains: stats.totalDomains,
      headlessPercentage: Math.round((stats.headlessRequired / stats.totalDomains) * 100),
      suggestions: []
    };

    if (recommendations.headlessPercentage > 60) {
      recommendations.suggestions.push('High headless usage - consider optimizing for Lambda compatibility');
    }

    if (stats.averageSuccessRate < 80) {
      recommendations.suggestions.push('Low overall success rate - review scraping strategies');
    }

    if (stats.lambdaRecommended > stats.fargateRecommended * 3) {
      recommendations.suggestions.push('Good Lambda optimization - most sites are lightweight');
    }

    return recommendations;
  }

  createMockAwsResponse(service, duration) {
    return {
      service,
      requestId: `mock-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      status: 'completed',
      duration,
      logs: [`Mock ${service} execution completed`],
      billing: {
        duration,
        memoryUsed: service === 'lambda' ? '512 MB' : '2048 MB',
        cost: this.estimateCost(service, duration)
      }
    };
  }
}

module.exports = AwsServiceDecider;