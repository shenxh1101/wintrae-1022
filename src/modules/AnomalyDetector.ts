import {
  MeterReading,
  AnomalyRecord,
  AlertRule,
  AnomalyType,
  AlertLevel,
  EnergyType,
  SDKResult,
} from '../types';
import { createSuccessResult, generateId } from '../utils';

interface DeviceStats {
  mean: number;
  stdDev: number;
  count: number;
}

export class AnomalyDetector {
  private anomalies: Map<string, AnomalyRecord> = new Map();
  private rules: Map<string, AlertRule> = new Map();
  private threshold: number;
  private deviceStats: Map<string, DeviceStats> = new Map();

  constructor(alertRules?: AlertRule[], anomalyThreshold = 0.3) {
    this.threshold = anomalyThreshold;
    if (alertRules) {
      for (const rule of alertRules) {
        this.rules.set(rule.ruleId, rule);
      }
    }
  }

  detectAnomalies(
    readings: MeterReading[],
    historicalReadings?: MeterReading[],
  ): SDKResult<AnomalyRecord[]> {
    if (historicalReadings) {
      this.computeStats(historicalReadings);
    }

    const detected: AnomalyRecord[] = [];

    for (const reading of readings) {
      const stats = this.deviceStats.get(reading.deviceId);

      if (stats && stats.count >= 3) {
        const deviation = Math.abs(reading.value - stats.mean) / stats.stdDev;
        if (deviation > 2) {
          const isIncrease = reading.value > stats.mean;
          const anomaly = this.createAnomaly(
            reading,
            isIncrease ? AnomalyType.SuddenIncrease : AnomalyType.SuddenDecrease,
            isIncrease ? AlertLevel.Warning : AlertLevel.Critical,
            stats.mean,
          );
          detected.push(anomaly);
          this.anomalies.set(anomaly.anomalyId, anomaly);
        }
      }

      const ruleAlerts = this.checkRules(reading);
      for (const anomaly of ruleAlerts) {
        detected.push(anomaly);
        this.anomalies.set(anomaly.anomalyId, anomaly);
      }
    }

    return createSuccessResult(detected, `检测到 ${detected.length} 条异常`);
  }

  detectSuddenChange(
    currentReading: MeterReading,
    previousReading: MeterReading,
  ): SDKResult<AnomalyRecord | null> {
    if (previousReading.value === 0) {
      return createSuccessResult(null);
    }

    const changeRate = (currentReading.value - previousReading.value) / previousReading.value;
    if (Math.abs(changeRate) > this.threshold) {
      const isIncrease = changeRate > 0;
      const anomaly = this.createAnomaly(
        currentReading,
        isIncrease ? AnomalyType.SuddenIncrease : AnomalyType.SuddenDecrease,
        Math.abs(changeRate) > 0.5 ? AlertLevel.Critical : AlertLevel.Warning,
        previousReading.value,
      );
      this.anomalies.set(anomaly.anomalyId, anomaly);
      return createSuccessResult(anomaly);
    }

    return createSuccessResult(null, '未检测到突增突降');
  }

  getOverLimitAlerts(energyType?: EnergyType): SDKResult<AnomalyRecord[]> {
    const results: AnomalyRecord[] = [];
    for (const anomaly of this.anomalies.values()) {
      if (anomaly.anomalyType === AnomalyType.OverLimit) {
        if (!energyType || anomaly.energyType === energyType) {
          results.push(anomaly);
        }
      }
    }
    return createSuccessResult(results);
  }

  getAllAnomalies(
    deviceId?: string,
    energyType?: EnergyType,
    startTime?: string,
    endTime?: string,
  ): SDKResult<AnomalyRecord[]> {
    let results = Array.from(this.anomalies.values());

    if (deviceId) {
      results = results.filter(a => a.deviceId === deviceId);
    }
    if (energyType) {
      results = results.filter(a => a.energyType === energyType);
    }
    if (startTime) {
      const start = new Date(startTime).getTime();
      results = results.filter(a => new Date(a.detectedAt).getTime() >= start);
    }
    if (endTime) {
      const end = new Date(endTime).getTime();
      results = results.filter(a => new Date(a.detectedAt).getTime() <= end);
    }

    return createSuccessResult(results);
  }

  addRule(rule: Omit<AlertRule, 'ruleId'>): SDKResult<AlertRule> {
    const ruleId = generateId('rule');
    const fullRule: AlertRule = { ...rule, ruleId };
    this.rules.set(ruleId, fullRule);
    return createSuccessResult(fullRule, '告警规则添加成功');
  }

  removeRule(ruleId: string): SDKResult<boolean> {
    this.rules.delete(ruleId);
    return createSuccessResult(true, '告警规则删除成功');
  }

  getRules(): SDKResult<AlertRule[]> {
    return createSuccessResult(Array.from(this.rules.values()));
  }

  setThreshold(threshold: number): void {
    this.threshold = threshold;
  }

  private computeStats(readings: MeterReading[]): void {
    const byDevice: Map<string, number[]> = new Map();
    for (const r of readings) {
      if (!byDevice.has(r.deviceId)) {
        byDevice.set(r.deviceId, []);
      }
      byDevice.get(r.deviceId)!.push(r.value);
    }

    for (const [deviceId, values] of byDevice) {
      const mean = values.reduce((s, v) => s + v, 0) / values.length;
      const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
      const stdDev = Math.sqrt(variance);
      this.deviceStats.set(deviceId, { mean, stdDev: stdDev || 1, count: values.length });
    }
  }

  private checkRules(reading: MeterReading): AnomalyRecord[] {
    const anomalies: AnomalyRecord[] = [];

    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;
      if (rule.energyType !== reading.energyType) continue;

      let triggered = false;
      switch (rule.operator) {
        case 'gt': triggered = reading.value > rule.threshold; break;
        case 'gte': triggered = reading.value >= rule.threshold; break;
        case 'lt': triggered = reading.value < rule.threshold; break;
        case 'lte': triggered = reading.value <= rule.threshold; break;
        case 'eq': triggered = reading.value === rule.threshold; break;
      }

      if (triggered) {
        anomalies.push(this.createAnomaly(reading, AnomalyType.OverLimit, rule.level, rule.threshold));
      }
    }

    return anomalies;
  }

  private createAnomaly(
    reading: MeterReading,
    anomalyType: AnomalyType,
    severity: AlertLevel,
    expectedValue: number,
  ): AnomalyRecord {
    const deviationRate = expectedValue !== 0
      ? Math.round(Math.abs((reading.value - expectedValue) / expectedValue) * 10000) / 100
      : 100;

    const descriptions: Record<AnomalyType, string> = {
      [AnomalyType.SuddenIncrease]: `设备 ${reading.deviceId} 用能突增，偏差率 ${deviationRate}%`,
      [AnomalyType.SuddenDecrease]: `设备 ${reading.deviceId} 用能突降，偏差率 ${deviationRate}%`,
      [AnomalyType.OverLimit]: `设备 ${reading.deviceId} 超限告警，当前值 ${reading.value}`,
      [AnomalyType.ReadingError]: `设备 ${reading.deviceId} 读数异常`,
    };

    return {
      anomalyId: generateId('anm'),
      deviceId: reading.deviceId,
      energyType: reading.energyType,
      anomalyType,
      severity,
      description: descriptions[anomalyType],
      detectedAt: new Date().toISOString(),
      value: reading.value,
      expectedValue,
      deviationRate,
    };
  }
}
