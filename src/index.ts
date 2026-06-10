import {
  DeviceArchive,
  ReadingValidator,
  EnergyStatistics,
  PeakValleyCalculator,
  AnomalyDetector,
  EnergyAdvisor,
  BatchReadingSummary,
  ConsumptionDelta,
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
  ReadingQuality,
  BillItem,
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
    this.readingValidator = new ReadingValidator(this.deviceArchive.getDeviceMap());
    this.energyStatistics = new EnergyStatistics();
    this.peakValleyCalculator = new PeakValleyCalculator(config.peakValleyConfigs);
    this.anomalyDetector = new AnomalyDetector(config.alertRules, config.anomalyThreshold);
    this.energyAdvisor = new EnergyAdvisor();
  }

  registerDevice(device: Omit<DeviceProfile, 'deviceId' | 'status'>): SDKResult<DeviceProfile> {
    const result = this.deviceArchive.register(device);
    this.readingValidator.setDeviceArchive(this.deviceArchive.getDeviceMap());
    return result;
  }

  queryDevice(deviceId: string): SDKResult<DeviceProfile | null> {
    return this.deviceArchive.query(deviceId);
  }

  queryDevicesByArea(area: string): SDKResult<DeviceProfile[]> {
    return this.deviceArchive.queryByArea(area);
  }

  updateDevice(deviceId: string, updates: Partial<Omit<DeviceProfile, 'deviceId'>>): SDKResult<DeviceProfile> {
    const result = this.deviceArchive.update(deviceId, updates);
    if (result.success) {
      this.readingValidator.setDeviceArchive(this.deviceArchive.getDeviceMap());
    }
    return result;
  }

  deleteDevice(deviceId: string): SDKResult<boolean> {
    const result = this.deviceArchive.delete(deviceId);
    if (result.success) {
      this.readingValidator.setDeviceArchive(this.deviceArchive.getDeviceMap());
    }
    return result;
  }

  listDevices(): SDKResult<DeviceProfile[]> {
    return this.deviceArchive.listAll();
  }

  submitReading(reading: Omit<MeterReading, 'readingId' | 'quality'>): SDKResult<MeterReading> {
    return this.readingValidator.submitReading(reading);
  }

  submitReadings(readings: Omit<MeterReading, 'readingId' | 'quality'>[]): SDKResult<BatchReadingSummary> {
    return this.readingValidator.submitBatch(readings);
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

  private getDeltas(deviceIds: string[], startTime: string, endTime: string): ConsumptionDelta[] {
    const { items } = this.readingValidator.computeAllDeltas(deviceIds, startTime, endTime);
    return items;
  }

  queryAreaConsumption(
    area: string,
    deviceIds: string[],
    startTime: string,
    endTime: string,
  ): SDKResult<AreaConsumption[]> {
    const deltas = this.getDeltas(deviceIds, startTime, endTime);
    return this.energyStatistics.queryAreaConsumption(area, deltas);
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
    const deltas = this.getDeltas(deviceIds, startTime, endTime);
    return this.energyStatistics.itemizedStatistics(deltas, categoryField, devices);
  }

  getTrend(
    deviceIds: string[],
    energyType: EnergyType,
    aggregationType: AggregationType,
    startTime: string,
    endTime: string,
    area?: string,
  ): SDKResult<TrendResult> {
    const deltas = this.getDeltas(deviceIds, startTime, endTime);
    return this.energyStatistics.trendAnalysis(deltas, energyType, aggregationType, area);
  }

  getMultiEnergyTrend(
    deviceIds: string[],
    aggregationType: AggregationType,
    startTime: string,
    endTime: string,
    area?: string,
  ): SDKResult<TrendResult[]> {
    const deltas = this.getDeltas(deviceIds, startTime, endTime);
    return this.energyStatistics.multiEnergyTrend(deltas, aggregationType, area);
  }

  calculatePeakValleyFee(
    energyType: EnergyType,
    deviceIds: string[],
    startTime: string,
    endTime: string,
  ): SDKResult<BillItem[]> {
    const deltas = this.getDeltas(deviceIds, startTime, endTime);
    return this.peakValleyCalculator.calculateFee(energyType, deltas);
  }

  generateBill(
    area: string,
    deviceIds: string[],
    startTime: string,
    endTime: string,
  ): SDKResult<BillSummary> {
    const deltas = this.getDeltas(deviceIds, startTime, endTime);
    return this.peakValleyCalculator.generateBill(area, deltas, startTime, endTime);
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

    const reading = readingResult.data;
    const previous = this.readingValidator.getPreviousReading(reading.deviceId, reading.timestamp);
    if (!previous) {
      return { success: true, code: 'NO_PREVIOUS', message: '无前序读数可比', data: null, timestamp: new Date().toISOString() };
    }

    return this.anomalyDetector.detectSuddenChange(reading, previous);
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

  getEfficiencyRanking(deviceIds: string[], startTime: string, endTime: string, topN = 10): SDKResult<EfficiencyRanking[]> {
    const deviceMap = new Map<string, DeviceProfile>();
    const allDevices = this.deviceArchive.listAll();
    if (allDevices.success) {
      for (const d of allDevices.data) {
        if (deviceIds.includes(d.deviceId)) {
          deviceMap.set(d.deviceId, d);
        }
      }
    }

    const deltas = this.getDeltas(deviceIds, startTime, endTime);
    return this.energyAdvisor.generateEfficiencyRanking(deltas, deviceMap, topN);
  }

  getSavingSuggestions(
    deviceIds: string[],
    startTime: string,
    endTime: string,
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

    const deltas = this.getDeltas(deviceIds, startTime, endTime);
    return this.energyAdvisor.generateSavingSuggestions(deltas, deviceMap, season);
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
export {
  DeviceArchive,
  ReadingValidator,
  EnergyStatistics,
  PeakValleyCalculator,
  AnomalyDetector,
  EnergyAdvisor,
  BatchReadingResult,
  BatchReadingSummary,
  ConsumptionDelta,
} from './modules';
export {
  EnergyType,
  TimePeriod,
  AggregationType,
  AnomalyType,
  AlertLevel,
  DeviceStatus,
  ReadingQuality,
} from './types';
export type {
  DeviceProfile,
  MeterReading,
  ManualCorrection,
  PeakValleyPeriod,
  PeakValleyConfig,
  AnomalyRecord,
  AlertRule,
  EnergySavingSuggestion,
  EfficiencyRanking,
  BillItem,
  BillSummary,
  TrendPoint,
  TrendResult,
  AreaConsumption,
  ItemizedStat,
  SDKResult,
  PaginatedResult,
  SDKConfig,
} from './types';
