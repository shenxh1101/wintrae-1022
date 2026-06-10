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
  EnergyLedger,
  EnergyLedgerItem,
  TimePeriod,
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
    const areaDevicesResult = this.deviceArchive.queryByArea(area);
    const areaDeviceIds = areaDevicesResult.success
      ? areaDevicesResult.data.map(d => d.deviceId)
      : [];
    const filteredIds = deviceIds.filter(id => areaDeviceIds.includes(id));
    const deltas = this.getDeltas(filteredIds, startTime, endTime);
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
    area?: string,
  ): SDKResult<BillItem[]> {
    const deltas = this.getDeltas(deviceIds, startTime, endTime);
    return this.peakValleyCalculator.calculateFee(energyType, deltas, area);
  }

  generateBill(
    area: string,
    deviceIds: string[],
    startTime: string,
    endTime: string,
  ): SDKResult<BillSummary> {
    const areaDevicesResult = this.deviceArchive.queryByArea(area);
    const areaDeviceIds = areaDevicesResult.success
      ? areaDevicesResult.data.map(d => d.deviceId)
      : [];
    const filteredIds = deviceIds.filter(id => areaDeviceIds.includes(id));
    const deltas = this.getDeltas(filteredIds, startTime, endTime);
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

  setAreaPriceConfig(area: string, config: PeakValleyConfig): void {
    this.peakValleyCalculator.setAreaPriceConfig(area, config);
  }

  setDevicePriceConfig(deviceId: string, config: PeakValleyConfig): void {
    this.peakValleyCalculator.setDevicePriceConfig(deviceId, config);
  }

  getEnergyLedger(
    dimension: 'area' | 'building' | 'floor' | 'device',
    deviceIds: string[],
    startTime: string,
    endTime: string,
  ): SDKResult<EnergyLedger[]> {
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

    const groups: Map<string, { devices: Set<string>; deltas: ConsumptionDelta[] }> = new Map();

    for (const delta of deltas) {
      const device = deviceMap.get(delta.deviceId);
      if (!device) continue;

      let dimValue: string;
      switch (dimension) {
        case 'area':
          dimValue = device.area;
          break;
        case 'building':
          dimValue = device.building;
          break;
        case 'floor':
          dimValue = device.floor;
          break;
        case 'device':
          dimValue = device.deviceId;
          break;
        default:
          dimValue = device.area;
      }

      if (!groups.has(dimValue)) {
        groups.set(dimValue, { devices: new Set(), deltas: [] });
      }
      const group = groups.get(dimValue)!;
      group.devices.add(delta.deviceId);
      group.deltas.push(delta);
    }

    const ledgers: EnergyLedger[] = [];
    for (const [dimValue, group] of groups) {
      const energyTypes = new Set(group.deltas.map(d => d.reading.energyType));
      const items: EnergyLedgerItem[] = [];
      let totalCost = 0;
      let currency = 'CNY';

      for (const et of energyTypes) {
        const typeDeltas = group.deltas.filter(d => d.reading.energyType === et);
        const totalConsumption = typeDeltas.reduce((s, d) => s + d.consumption, 0);
        const firstDelta = typeDeltas[0];

        const areaForPricing = dimension === 'area' ? dimValue : undefined;
        const config = this.peakValleyCalculator.getEffectiveConfig(et, areaForPricing);
        currency = config.currency;

        const byPeriod: Map<TimePeriod, { consumption: number; cost: number }> = new Map();
        for (const delta of typeDeltas) {
          let period: TimePeriod;
          if (delta.reading.period) {
            period = delta.reading.period;
          } else {
            const hour = new Date(delta.reading.timestamp).getUTCHours();
            const rateConfig = config.periods.find(p => {
              if (p.startHour <= p.endHour) {
                return hour >= p.startHour && hour < p.endHour;
              }
              return hour >= p.startHour || hour < p.endHour;
            });
            period = rateConfig?.period || TimePeriod.Flat;
          }
          const rateConfig = config.periods.find(p => p.period === period);
          const rate = rateConfig?.rate || 1.0;
          const existing = byPeriod.get(period);
          if (existing) {
            existing.consumption += delta.consumption;
            existing.cost += delta.consumption * rate;
          } else {
            byPeriod.set(period, {
              consumption: delta.consumption,
              cost: delta.consumption * rate,
            });
          }
        }

        const peak = byPeriod.get(TimePeriod.Peak);
        const valley = byPeriod.get(TimePeriod.Valley);
        const flat = byPeriod.get(TimePeriod.Flat);
        const typeCost = Array.from(byPeriod.values()).reduce((s, v) => s + v.cost, 0);
        totalCost += typeCost;

        items.push({
          energyType: et,
          consumption: Math.round(totalConsumption * 1000) / 1000,
          unit: firstDelta.reading.unit,
          cost: Math.round(typeCost * 100) / 100,
          currency: config.currency,
          peakConsumption: peak ? Math.round(peak.consumption * 1000) / 1000 : 0,
          valleyConsumption: valley ? Math.round(valley.consumption * 1000) / 1000 : 0,
          flatConsumption: flat ? Math.round(flat.consumption * 1000) / 1000 : 0,
          peakCost: peak ? Math.round(peak.cost * 100) / 100 : 0,
          valleyCost: valley ? Math.round(valley.cost * 100) / 100 : 0,
          flatCost: flat ? Math.round(flat.cost * 100) / 100 : 0,
          pricePlanId: config.planId,
          pricePlanName: config.planName,
        });
      }

      const device = dimension === 'device' ? deviceMap.get(dimValue) : undefined;

      ledgers.push({
        ledgerId: `ldg-${dimValue}-${Date.now()}`,
        dimension,
        dimensionValue: dimValue,
        dimensionLabel: device?.name,
        startDate: startTime,
        endDate: endTime,
        items,
        totalCost: Math.round(totalCost * 100) / 100,
        currency,
        deviceCount: group.devices.size,
        generatedAt: new Date().toISOString(),
      });
    }

    ledgers.sort((a, b) => a.dimensionValue.localeCompare(b.dimensionValue));

    return {
      success: true,
      code: 'SUCCESS',
      message: `生成${dimension}维度台账，共 ${ledgers.length} 条`,
      data: ledgers,
      timestamp: new Date().toISOString(),
    };
  }

  getLedgerDetail(
    dimension: 'area' | 'building' | 'floor' | 'device',
    deviceIds: string[],
    startTime: string,
    endTime: string,
  ): SDKResult<{
    ledgers: EnergyLedger[];
    deviceBreakdown: {
      dimensionValue: string;
      devices: {
        deviceId: string;
        deviceName: string;
        area: string;
        items: EnergyLedgerItem[];
      }[];
    }[];
  }> {
    const ledgerResult = this.getEnergyLedger(dimension, deviceIds, startTime, endTime);
    if (!ledgerResult.success) {
      return {
        success: false,
        code: ledgerResult.code,
        message: ledgerResult.message,
        data: { ledgers: [], deviceBreakdown: [] },
        timestamp: new Date().toISOString(),
      };
    }

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

    const dimToDevices: Map<string, Map<string, ConsumptionDelta[]>> = new Map();

    for (const delta of deltas) {
      const device = deviceMap.get(delta.deviceId);
      if (!device) continue;

      let dimValue: string;
      switch (dimension) {
        case 'area':
          dimValue = device.area;
          break;
        case 'building':
          dimValue = device.building;
          break;
        case 'floor':
          dimValue = device.floor;
          break;
        case 'device':
          dimValue = device.deviceId;
          break;
        default:
          dimValue = device.area;
      }

      if (!dimToDevices.has(dimValue)) {
        dimToDevices.set(dimValue, new Map());
      }
      const deviceMapInner = dimToDevices.get(dimValue)!;
      if (!deviceMapInner.has(delta.deviceId)) {
        deviceMapInner.set(delta.deviceId, []);
      }
      deviceMapInner.get(delta.deviceId)!.push(delta);
    }

    const deviceBreakdown: {
      dimensionValue: string;
      devices: {
        deviceId: string;
        deviceName: string;
        area: string;
        items: EnergyLedgerItem[];
      }[];
    }[] = [];

    for (const [dimValue, deviceDeltas] of dimToDevices) {
      const devices: {
        deviceId: string;
        deviceName: string;
        area: string;
        items: EnergyLedgerItem[];
      }[] = [];

      for (const [devId, devDeltas] of deviceDeltas) {
        const dev = deviceMap.get(devId);
        if (!dev) continue;

        const energyTypes = new Set(devDeltas.map(d => d.reading.energyType));
        const items: EnergyLedgerItem[] = [];

        for (const et of energyTypes) {
          const typeDeltas = devDeltas.filter(d => d.reading.energyType === et);
          const totalConsumption = typeDeltas.reduce((s, d) => s + d.consumption, 0);
          const firstDelta = typeDeltas[0];

          const config = this.peakValleyCalculator.getEffectiveConfig(et, dev.area);

          const byPeriod: Map<TimePeriod, { consumption: number; cost: number }> = new Map();
          for (const delta of typeDeltas) {
            let period: TimePeriod;
            if (delta.reading.period) {
              period = delta.reading.period;
            } else {
              const hour = new Date(delta.reading.timestamp).getUTCHours();
              const rateConfig = config.periods.find(p => {
                if (p.startHour <= p.endHour) {
                  return hour >= p.startHour && hour < p.endHour;
                }
                return hour >= p.startHour || hour < p.endHour;
              });
              period = rateConfig?.period || TimePeriod.Flat;
            }
            const rateConfig = config.periods.find(p => p.period === period);
            const rate = rateConfig?.rate || 1.0;
            const existing = byPeriod.get(period);
            if (existing) {
              existing.consumption += delta.consumption;
              existing.cost += delta.consumption * rate;
            } else {
              byPeriod.set(period, {
                consumption: delta.consumption,
                cost: delta.consumption * rate,
              });
            }
          }

          const peak = byPeriod.get(TimePeriod.Peak);
          const valley = byPeriod.get(TimePeriod.Valley);
          const flat = byPeriod.get(TimePeriod.Flat);
          const typeCost = Array.from(byPeriod.values()).reduce((s, v) => s + v.cost, 0);

          items.push({
            energyType: et,
            consumption: Math.round(totalConsumption * 1000) / 1000,
            unit: firstDelta.reading.unit,
            cost: Math.round(typeCost * 100) / 100,
            currency: config.currency,
            peakConsumption: peak ? Math.round(peak.consumption * 1000) / 1000 : 0,
            valleyConsumption: valley ? Math.round(valley.consumption * 1000) / 1000 : 0,
            flatConsumption: flat ? Math.round(flat.consumption * 1000) / 1000 : 0,
            peakCost: peak ? Math.round(peak.cost * 100) / 100 : 0,
            valleyCost: valley ? Math.round(valley.cost * 100) / 100 : 0,
            flatCost: flat ? Math.round(flat.cost * 100) / 100 : 0,
            pricePlanId: config.planId,
            pricePlanName: config.planName,
          });
        }

        devices.push({
          deviceId: devId,
          deviceName: dev.name,
          area: dev.area,
          items,
        });
      }

      devices.sort((a, b) => a.deviceName.localeCompare(b.deviceName));

      deviceBreakdown.push({
        dimensionValue: dimValue,
        devices,
      });
    }

    deviceBreakdown.sort((a, b) => a.dimensionValue.localeCompare(b.dimensionValue));

    return {
      success: true,
      code: 'SUCCESS',
      message: '明细台账生成成功',
      data: {
        ledgers: ledgerResult.data,
        deviceBreakdown,
      },
      timestamp: new Date().toISOString(),
    };
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
  EnergyLedgerItem,
  EnergyLedger,
  EnergyLedgerDetail,
  SDKResult,
  PaginatedResult,
  SDKConfig,
} from './types';
