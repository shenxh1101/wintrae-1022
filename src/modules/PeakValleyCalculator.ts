import {
  MeterReading,
  PeakValleyConfig,
  PeakValleyPeriod,
  BillItem,
  BillSummary,
  TimePeriod,
  EnergyType,
  SDKResult,
  DeviceProfile,
} from '../types';
import { createSuccessResult, createErrorResult, generateId } from '../utils';
import type { ConsumptionDelta } from './EnergyStatistics';

const DEFAULT_PEAK_VALLEY_CONFIGS: PeakValleyConfig[] = [
  {
    energyType: EnergyType.Electricity,
    periods: [
      { period: TimePeriod.Peak, startHour: 8, endHour: 11, rate: 1.2 },
      { period: TimePeriod.Flat, startHour: 11, endHour: 18, rate: 1.0 },
      { period: TimePeriod.Peak, startHour: 18, endHour: 21, rate: 1.2 },
      { period: TimePeriod.Valley, startHour: 21, endHour: 8, rate: 0.5 },
    ],
    currency: 'CNY',
    planId: 'default-electricity',
    planName: '默认电价方案',
  },
  {
    energyType: EnergyType.Gas,
    periods: [
      { period: TimePeriod.Flat, startHour: 0, endHour: 24, rate: 3.0 },
    ],
    currency: 'CNY',
    planId: 'default-gas',
    planName: '默认气价方案',
  },
  {
    energyType: EnergyType.Water,
    periods: [
      { period: TimePeriod.Flat, startHour: 0, endHour: 24, rate: 5.0 },
    ],
    currency: 'CNY',
    planId: 'default-water',
    planName: '默认水价方案',
  },
  {
    energyType: EnergyType.Heat,
    periods: [
      { period: TimePeriod.Flat, startHour: 0, endHour: 24, rate: 0.3 },
    ],
    currency: 'CNY',
    planId: 'default-heat',
    planName: '默认热价方案',
  },
];

export class PeakValleyCalculator {
  private defaultConfigs: Map<EnergyType, PeakValleyConfig> = new Map();
  private areaConfigs: Map<string, Map<EnergyType, PeakValleyConfig>> = new Map();
  private deviceConfigs: Map<string, Map<EnergyType, PeakValleyConfig>> = new Map();

  constructor(customConfigs?: PeakValleyConfig[]) {
    const configs = customConfigs || DEFAULT_PEAK_VALLEY_CONFIGS;
    for (const config of configs) {
      this.defaultConfigs.set(config.energyType, {
        ...config,
        planId: config.planId || `default-${config.energyType}`,
        planName: config.planName || `默认${config.energyType}方案`,
      });
    }
  }

  setAreaPriceConfig(area: string, config: PeakValleyConfig): void {
    if (!this.areaConfigs.has(area)) {
      this.areaConfigs.set(area, new Map());
    }
    this.areaConfigs.get(area)!.set(config.energyType, config);
  }

  setDevicePriceConfig(deviceId: string, config: PeakValleyConfig): void {
    if (!this.deviceConfigs.has(deviceId)) {
      this.deviceConfigs.set(deviceId, new Map());
    }
    this.deviceConfigs.get(deviceId)!.set(config.energyType, config);
  }

  getEffectiveConfig(
    energyType: EnergyType,
    area?: string,
    deviceId?: string,
  ): PeakValleyConfig {
    if (deviceId) {
      const deviceMap = this.deviceConfigs.get(deviceId);
      if (deviceMap && deviceMap.has(energyType)) {
        return deviceMap.get(energyType)!;
      }
    }

    if (area) {
      const areaMap = this.areaConfigs.get(area);
      if (areaMap && areaMap.has(energyType)) {
        return areaMap.get(energyType)!;
      }
    }

    return this.defaultConfigs.get(energyType)!;
  }

  determinePeriod(energyType: EnergyType, hour: number, area?: string, deviceId?: string): SDKResult<TimePeriod> {
    const config = this.getEffectiveConfig(energyType, area, deviceId);
    const period = this.findPeriod(config.periods, hour);
    return createSuccessResult(period);
  }

  calculateConsumptionByPeriod(
    deltas: ConsumptionDelta[],
    energyType: EnergyType,
    area?: string,
    deviceId?: string,
  ): SDKResult<Map<TimePeriod, number>> {
    const config = this.getEffectiveConfig(energyType, area, deviceId);
    const byPeriod: Map<TimePeriod, number> = new Map();
    byPeriod.set(TimePeriod.Peak, 0);
    byPeriod.set(TimePeriod.Valley, 0);
    byPeriod.set(TimePeriod.Flat, 0);

    for (const delta of deltas) {
      if (delta.reading.energyType !== energyType) continue;

      let period: TimePeriod;
      if (delta.reading.period) {
        period = delta.reading.period;
      } else {
        const hour = new Date(delta.reading.timestamp).getUTCHours();
        period = this.findPeriod(config.periods, hour);
      }
      byPeriod.set(period, (byPeriod.get(period) || 0) + delta.consumption);
    }

    return createSuccessResult(byPeriod);
  }

  calculateFee(
    energyType: EnergyType,
    deltas: ConsumptionDelta[],
    area?: string,
    deviceId?: string,
  ): SDKResult<BillItem[]> {
    const config = this.getEffectiveConfig(energyType, area, deviceId);

    const consumptionByPeriod: Map<TimePeriod, number> = new Map();
    for (const delta of deltas) {
      if (delta.reading.energyType !== energyType) continue;

      let period: TimePeriod;
      if (delta.reading.period) {
        period = delta.reading.period;
      } else {
        const hour = new Date(delta.reading.timestamp).getUTCHours();
        period = this.findPeriod(config.periods, hour);
      }

      consumptionByPeriod.set(period, (consumptionByPeriod.get(period) || 0) + delta.consumption);
    }

    const items: BillItem[] = [];
    for (const [period, consumption] of consumptionByPeriod) {
      const rateConfig = config.periods.find(p => p.period === period);
      const rate = rateConfig ? rateConfig.rate : 1.0;
      items.push({
        energyType,
        period,
        consumption: Math.round(consumption * 1000) / 1000,
        rate,
        cost: Math.round(consumption * rate * 100) / 100,
        pricePlanId: config.planId,
        pricePlanName: config.planName,
      });
    }

    return createSuccessResult(items);
  }

  generateBill(
    area: string,
    deltas: ConsumptionDelta[],
    startDate: string,
    endDate: string,
    deviceProfiles?: Map<string, DeviceProfile>,
  ): SDKResult<BillSummary> {
    const energyTypes = new Set(deltas.map(d => d.reading.energyType));
    const allItems: BillItem[] = [];
    let totalCost = 0;
    const usedPlans: { energyType: EnergyType; planId: string; planName: string }[] = [];

    for (const et of energyTypes) {
      const config = this.getEffectiveConfig(et, area);
      usedPlans.push({
        energyType: et,
        planId: config.planId || `default-${et}`,
        planName: config.planName || `默认${et}方案`,
      });

      const typeDeltas = deltas.filter(d => d.reading.energyType === et);
      const result = this.calculateFeeForDeltas(typeDeltas, config);
      allItems.push(...result);
      totalCost += result.reduce((sum, item) => sum + item.cost, 0);
    }

    const defaultConfig = this.defaultConfigs.get(EnergyType.Electricity);
    const bill: BillSummary = {
      billId: generateId('bill'),
      area,
      startDate,
      endDate,
      items: allItems,
      totalCost: Math.round(totalCost * 100) / 100,
      currency: defaultConfig?.currency || 'CNY',
      generatedAt: new Date().toISOString(),
      pricePlans: usedPlans,
    };

    return createSuccessResult(bill);
  }

  private calculateFeeForDeltas(
    deltas: ConsumptionDelta[],
    config: PeakValleyConfig,
  ): BillItem[] {
    const consumptionByPeriod: Map<TimePeriod, number> = new Map();
    for (const delta of deltas) {
      let period: TimePeriod;
      if (delta.reading.period) {
        period = delta.reading.period;
      } else {
        const hour = new Date(delta.reading.timestamp).getUTCHours();
        period = this.findPeriod(config.periods, hour);
      }
      consumptionByPeriod.set(period, (consumptionByPeriod.get(period) || 0) + delta.consumption);
    }

    const items: BillItem[] = [];
    for (const [period, consumption] of consumptionByPeriod) {
      const rateConfig = config.periods.find(p => p.period === period);
      const rate = rateConfig ? rateConfig.rate : 1.0;
      items.push({
        energyType: config.energyType,
        period,
        consumption: Math.round(consumption * 1000) / 1000,
        rate,
        cost: Math.round(consumption * rate * 100) / 100,
        pricePlanId: config.planId,
        pricePlanName: config.planName,
      });
    }

    return items;
  }

  getConfig(energyType: EnergyType): PeakValleyConfig | undefined {
    return this.defaultConfigs.get(energyType);
  }

  getDefaultConfig(energyType: EnergyType): PeakValleyConfig | undefined {
    return this.defaultConfigs.get(energyType);
  }

  getAreaConfig(area: string, energyType: EnergyType): PeakValleyConfig | undefined {
    return this.areaConfigs.get(area)?.get(energyType);
  }

  getDeviceConfig(deviceId: string, energyType: EnergyType): PeakValleyConfig | undefined {
    return this.deviceConfigs.get(deviceId)?.get(energyType);
  }

  updateConfig(config: PeakValleyConfig): void {
    this.defaultConfigs.set(config.energyType, {
      ...config,
      planId: config.planId || `default-${config.energyType}`,
      planName: config.planName || `默认${config.energyType}方案`,
    });
  }

  private findPeriod(periods: PeakValleyPeriod[], hour: number): TimePeriod {
    for (const p of periods) {
      if (p.startHour <= p.endHour) {
        if (hour >= p.startHour && hour < p.endHour) {
          return p.period;
        }
      } else {
        if (hour >= p.startHour || hour < p.endHour) {
          return p.period;
        }
      }
    }
    return TimePeriod.Flat;
  }
}
