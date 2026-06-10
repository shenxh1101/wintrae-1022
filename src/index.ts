import {
  DeviceArchive,
  ReadingValidator,
  EnergyStatistics,
  PeakValleyCalculator,
  AnomalyDetector,
  EnergyAdvisor,
} from './modules';

import {
  DeviceProfile,
  MeterReading,
  ManualCorrection,
  PeakValleyConfig,
  AnomalyRecord,
  AlertRule,
  EnergySavingSuggestion,
  EfficiencyRanking,
  BillSummary,
  TrendResult,
  AreaConsumption,
  ItemizedStat,
  SDKResult,
  SDKConfig,
  EnergyType,
  AggregationType,
  TimePeriod,
  AnomalyType,
  AlertLevel,
  DeviceStatus,
  ReadingQuality,
  PaginatedResult,
  PeakValleyPeriod,
  BillItem,
  TrendPoint,
} from './types';

export class SmartEnergySDK {
  readonly deviceArchive: DeviceArchive;
  readonly readingValidator: ReadingValidator;
  readonly energyStatistics: EnergyStatistics;
  readonly peakValleyCalculator: PeakValleyCalculator;
  readonly anomalyDetector: AnomalyDetector;
  readonly energyAdvisor: EnergyAdvisor;

  private config: SDKConfig;

  constructor(config: SDKConfig = {}) {
    this.config = config;
    this.deviceArchive = new DeviceArchive();
    this.readingValidator = new ReadingValidator();
    this.energyStatistics = new EnergyStatistics();
    this.peakValleyCalculator = new PeakValleyCalculator(config.peakValleyConfigs);
    this.anomalyDetector = new AnomalyDetector(config.alertRules, config.anomalyThreshold);
    this.energyAdvisor = new EnergyAdvisor();
  }

  registerDevice(device: Omit<DeviceProfile, 'deviceId' | 'status'>): SDKResult<DeviceProfile> {
    return this.deviceArchive.register(device);
  }

  queryDevice(deviceId: string): SDKResult<DeviceProfile | null> {
    return this.deviceArchive.query(deviceId);
  }

  queryDevicesByArea(area: string): SDKResult<DeviceProfile[]> {
    return this.deviceArchive.queryByArea(area);
  }

  updateDevice(deviceId: string, updates: Partial<Omit<DeviceProfile, 'deviceId'>>): SDKResult<DeviceProfile> {
    return this.deviceArchive.update(deviceId, updates);
  }

  deleteDevice(deviceId: string): SDKResult<boolean> {
    return this.deviceArchive.delete(deviceId);
  }

  listDevices(): SDKResult<DeviceProfile[]> {
    return this.deviceArchive.listAll();
  }

  submitReading(reading: Omit<MeterReading, 'readingId' | 'quality'>): SDKResult<MeterReading> {
    const result = this.readingValidator.submitReading(reading);
    if (result.success) {
      this.energyStatistics.loadReadings([result.data]);
    }
    return result;
  }

  submitReadings(readings: Omit<MeterReading, 'readingId' | 'quality'>[]): SDKResult<MeterReading[]> {
    const result = this.readingValidator.submitBatch(readings);
    if (result.success) {
      this.energyStatistics.loadReadings(result.data);
    }
    return result;
  }

  validateReading(readingId: string): SDKResult<{ valid: boolean; quality: ReadingQuality; issues: string[] }> {
    return this.readingValidator.validateReading(readingId);
  }

  syncCorrection(correction: Omit<ManualCorrection, 'correctionId' | 'timestamp'>): SDKResult<ManualCorrection> {
    return this.readingValidator.syncCorrection(correction);
  }

  getReadingsByDevice(deviceId: string, startTime?: string, endTime?: string): SDKResult<MeterReading[]> {
    return this.readingValidator.getReadingsByDevice(deviceId, startTime, endTime);
  }

  getCorrections(deviceId?: string): SDKResult<ManualCorrection[]> {
    return this.readingValidator.getCorrections(deviceId);
  }

  queryAreaConsumption(
    area: string,
    deviceIds: string[],
    startTime: string,
    endTime: string,
  ): SDKResult<AreaConsumption[]> {
    return this.energyStatistics.queryAreaConsumption(area, deviceIds, startTime, endTime);
  }

  getItemizedStatistics(
    deviceIds: string[],
    startTime: string,
    endTime: string,
    categoryField: 'area' | 'building' | 'floor' = 'area',
  ): SDKResult<ItemizedStat[]> {
    const devices = new Map<string, { area: string; building: string; floor: string }>();
    const allDevices = this.deviceArchive.listAll();
    if (allDevices.success) {
      for (const d of allDevices.data) {
        if (deviceIds.includes(d.deviceId)) {
          devices.set(d.deviceId, { area: d.area, building: d.building, floor: d.floor });
        }
      }
    }
    return this.energyStatistics.itemizedStatistics(deviceIds, startTime, endTime, categoryField, devices);
  }

  getTrend(
    deviceIds: string[],
    energyType: EnergyType,
    aggregationType: AggregationType,
    startTime: string,
    endTime: string,
    area?: string,
  ): SDKResult<TrendResult> {
    return this.energyStatistics.trendAnalysis(deviceIds, energyType, aggregationType, startTime, endTime, area);
  }

  getMultiEnergyTrend(
    deviceIds: string[],
    aggregationType: AggregationType,
    startTime: string,
    endTime: string,
    area?: string,
  ): SDKResult<TrendResult[]> {
    return this.energyStatistics.multiEnergyTrend(deviceIds, aggregationType, startTime, endTime, area);
  }

  calculatePeakValleyFee(energyType: EnergyType, readings: MeterReading[]): SDKResult<BillItem[]> {
    return this.peakValleyCalculator.calculateFee(energyType, readings);
  }

  generateBill(
    area: string,
    deviceIds: string[],
    startTime: string,
    endTime: string,
  ): SDKResult<BillSummary> {
    const allReadings: MeterReading[] = [];
    for (const deviceId of deviceIds) {
      const result = this.readingValidator.getReadingsByDevice(deviceId, startTime, endTime);
      if (result.success) {
        allReadings.push(...result.data);
      }
    }
    return this.peakValleyCalculator.generateBill(area, allReadings, startTime, endTime);
  }

  detectAnomalies(
    deviceIds: string[],
    startTime: string,
    endTime: string,
  ): SDKResult<AnomalyRecord[]> {
    const currentReadings: MeterReading[] = [];
    const historicalReadings: MeterReading[] = [];

    for (const deviceId of deviceIds) {
      const result = this.readingValidator.getReadingsByDevice(deviceId);
      if (result.success) {
        for (const r of result.data) {
          const ts = new Date(r.timestamp).getTime();
          const start = new Date(startTime).getTime();
          const end = new Date(endTime).getTime();
          if (ts >= start && ts <= end) {
            currentReadings.push(r);
          } else if (ts < start) {
            historicalReadings.push(r);
          }
        }
      }
    }

    return this.anomalyDetector.detectAnomalies(currentReadings, historicalReadings.length > 0 ? historicalReadings : undefined);
  }

  detectSuddenChange(readingId: string): SDKResult<AnomalyRecord | null> {
    const readingResult = this.readingValidator.getReading(readingId);
    if (!readingResult.success || !readingResult.data) {
      return readingResult as SDKResult<null>;
    }

    const deviceReadings = this.readingValidator.getReadingsByDevice(readingResult.data.deviceId);
    if (!deviceReadings.success || deviceReadings.data.length < 2) {
      return { success: true, code: 'INSUFFICIENT_DATA', message: '数据不足以进行突增突降检测', data: null, timestamp: new Date().toISOString() };
    }

    const sorted = deviceReadings.data.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    const currentIdx = sorted.findIndex(r => r.readingId === readingId);
    if (currentIdx < 0 || currentIdx >= sorted.length - 1) {
      return { success: true, code: 'NO_PREVIOUS', message: '无前序读数可比', data: null, timestamp: new Date().toISOString() };
    }

    return this.anomalyDetector.detectSuddenChange(sorted[currentIdx], sorted[currentIdx + 1]);
  }

  getOverLimitAlerts(energyType?: EnergyType): SDKResult<AnomalyRecord[]> {
    return this.anomalyDetector.getOverLimitAlerts(energyType);
  }

  getAllAnomalies(
    deviceId?: string,
    energyType?: EnergyType,
    startTime?: string,
    endTime?: string,
  ): SDKResult<AnomalyRecord[]> {
    return this.anomalyDetector.getAllAnomalies(deviceId, energyType, startTime, endTime);
  }

  addAlertRule(rule: Omit<AlertRule, 'ruleId'>): SDKResult<AlertRule> {
    return this.anomalyDetector.addRule(rule);
  }

  getAlertRules(): SDKResult<AlertRule[]> {
    return this.anomalyDetector.getRules();
  }

  getEfficiencyRanking(deviceIds: string[], topN = 10): SDKResult<EfficiencyRanking[]> {
    const deviceMap = new Map<string, DeviceProfile>();
    const allDevices = this.deviceArchive.listAll();
    if (allDevices.success) {
      for (const d of allDevices.data) {
        if (deviceIds.includes(d.deviceId)) {
          deviceMap.set(d.deviceId, d);
        }
      }
    }

    const readings: MeterReading[] = [];
    for (const deviceId of deviceIds) {
      const result = this.readingValidator.getReadingsByDevice(deviceId);
      if (result.success) {
        readings.push(...result.data);
      }
    }

    return this.energyAdvisor.generateEfficiencyRanking(readings, deviceMap, topN);
  }

  getSavingSuggestions(
    deviceIds: string[],
    season: 'summer' | 'winter' | 'spring_autumn' = 'spring_autumn',
  ): SDKResult<EnergySavingSuggestion[]> {
    const deviceMap = new Map<string, DeviceProfile>();
    const allDevices = this.deviceArchive.listAll();
    if (allDevices.success) {
      for (const d of allDevices.data) {
        if (deviceIds.includes(d.deviceId)) {
          deviceMap.set(d.deviceId, d);
        }
      }
    }

    const readings: MeterReading[] = [];
    for (const deviceId of deviceIds) {
      const result = this.readingValidator.getReadingsByDevice(deviceId);
      if (result.success) {
        readings.push(...result.data);
      }
    }

    return this.energyAdvisor.generateSavingSuggestions(readings, deviceMap, season);
  }

  getBillSummary(bills: BillSummary[]): SDKResult<{
    totalCost: number;
    byEnergyType: Map<EnergyType, number>;
    byArea: Map<string, number>;
    currency: string;
    billCount: number;
  }> {
    return this.energyAdvisor.generateBillSummary(bills);
  }

  getPeakValleyConfig(energyType: EnergyType): PeakValleyConfig | undefined {
    return this.peakValleyCalculator.getConfig(energyType);
  }

  updatePeakValleyConfig(config: PeakValleyConfig): void {
    this.peakValleyCalculator.updateConfig(config);
  }

  setAnomalyThreshold(threshold: number): void {
    this.anomalyDetector.setThreshold(threshold);
  }
}

export default SmartEnergySDK;
