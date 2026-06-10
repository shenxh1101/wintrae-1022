import {
  MeterReading,
  PeakValleyConfig,
  PeakValleyPeriod,
  BillItem,
  BillSummary,
  BillDeviceItem,
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

  calculateFeeForDevice(
    device: DeviceProfile,
    deltas: ConsumptionDelta[],
  ): BillDeviceItem {
    const deviceDeltas = deltas.filter(d => d.deviceId === device.deviceId);
    const energyTypes = new Set(deviceDeltas.map(d => d.reading.energyType));
    const allItems: BillItem[] = [];
    let totalConsumption = 0;
    let totalCost = 0;
    let unit = '';
    let planId = '';
    let planName = '';
    let primaryEnergy = EnergyType.Electricity;

    for (const et of energyTypes) {
      primaryEnergy = et;
      const typeDeltas = deviceDeltas.filter(d => d.reading.energyType === et);
      const config = this.getEffectiveConfig(et, device.area, device.deviceId);
      planId = config.planId || '';
      planName = config.planName || '';

      const consumptionByPeriod: Map<TimePeriod, number> = new Map();
      for (const delta of typeDeltas) {
        let period: TimePeriod;
        if (delta.reading.period) {
          period = delta.reading.period;
        } else {
          const hour = new Date(delta.reading.timestamp).getUTCHours();
          period = this.findPeriod(config.periods, hour);
        }
        consumptionByPeriod.set(period, (consumptionByPeriod.get(period) || 0) + delta.consumption);
      }

      for (const [period, consumption] of consumptionByPeriod) {
        const rateConfig = config.periods.find(p => p.period === period);
        const rate = rateConfig ? rateConfig.rate : 1.0;
        const cost = consumption * rate;
        totalConsumption += consumption;
        totalCost += cost;
        allItems.push({
          energyType: et,
          period,
          consumption: Math.round(consumption * 1000) / 1000,
          rate,
          cost: Math.round(cost * 100) / 100,
          pricePlanId: config.planId,
          pricePlanName: config.planName,
        });
      }

      if (typeDeltas.length > 0 && !unit) {
        unit = typeDeltas[0].reading.unit;
      }
    }

    return {
      deviceId: device.deviceId,
      deviceName: device.name,
      energyType: primaryEnergy,
      items: allItems,
      totalConsumption: Math.round(totalConsumption * 1000) / 1000,
      totalCost: Math.round(totalCost * 100) / 100,
      unit,
      pricePlanId: planId || undefined,
      pricePlanName: planName || undefined,
    };
  }

  generateBill(
    area: string,
    deltas: ConsumptionDelta[],
    startDate: string,
    endDate: string,
    deviceProfiles?: Map<string, DeviceProfile>,
  ): SDKResult<BillSummary> {
    const deviceBreakdown: BillDeviceItem[] = [];
    const summaryItems: Map<string, BillItem> = new Map();
    const consumptionByType: Map<EnergyType, { consumption: number; unit: string; cost: number }> = new Map();
    const usedPlansSet: Map<EnergyType, Set<string>> = new Map();
    let totalCost = 0;
    let currency = 'CNY';

    const deviceIds = new Set(deltas.map(d => d.deviceId));

    for (const deviceId of deviceIds) {
      const device = deviceProfiles?.get(deviceId);
      if (!device) continue;

      const deviceItem = this.calculateFeeForDevice(device, deltas);
      deviceBreakdown.push(deviceItem);
      totalCost += deviceItem.totalCost;

      const firstItemWithConfig = deviceItem.items.find(i => i.pricePlanId);
      if (firstItemWithConfig && firstItemWithConfig.pricePlanId) {
        const et = firstItemWithConfig.energyType;
        if (!usedPlansSet.has(et)) {
          usedPlansSet.set(et, new Set());
        }
        usedPlansSet.get(et)!.add(firstItemWithConfig.pricePlanId);
      }

      for (const item of deviceItem.items) {
        const key = `${item.energyType}-${item.period}`;
        const existing = summaryItems.get(key);
        if (existing) {
          existing.consumption += item.consumption;
          existing.cost += item.cost;
        } else {
          summaryItems.set(key, { ...item });
        }

        const typeStat = consumptionByType.get(item.energyType);
        if (typeStat) {
          typeStat.consumption += item.consumption;
          typeStat.cost += item.cost;
        } else {
          consumptionByType.set(item.energyType, {
            consumption: item.consumption,
            unit: '',
            cost: item.cost,
          });
        }
      }
    }

    for (const [et, stat] of consumptionByType) {
      const etItems = deviceBreakdown
        .flatMap(d => d.items)
        .filter(i => i.energyType === et);
      if (etItems.length > 0) {
        stat.unit = etItems[0].period ? '' : etItems[0].period as unknown as string;
        const deltaItems = deltas.filter(d => d.reading.energyType === et);
        if (deltaItems.length > 0) {
          stat.unit = deltaItems[0].reading.unit;
        }
      }
      stat.consumption = Math.round(stat.consumption * 1000) / 1000;
      stat.cost = Math.round(stat.cost * 100) / 100;
    }

    const finalSummaryItems: BillItem[] = Array.from(summaryItems.values()).map(item => ({
      ...item,
      consumption: Math.round(item.consumption * 1000) / 1000,
      cost: Math.round(item.cost * 100) / 100,
      rate: item.consumption > 0 ? Math.round((item.cost / item.consumption) * 10000) / 10000 : item.rate,
    }));

    finalSummaryItems.sort((a, b) => {
      if (a.energyType !== b.energyType) return a.energyType.localeCompare(b.energyType);
      return a.period.localeCompare(b.period);
    });

    deviceBreakdown.sort((a, b) => a.deviceName.localeCompare(b.deviceName));

    const planIdToName: Map<string, string> = new Map();
    const planIdToEnergyType: Map<string, EnergyType> = new Map();
    for (const devItem of deviceBreakdown) {
      for (const item of devItem.items) {
        if (item.pricePlanId) {
          planIdToName.set(item.pricePlanId, item.pricePlanName || item.pricePlanId);
          planIdToEnergyType.set(item.pricePlanId, item.energyType);
        }
      }
    }

    const pricePlans: { energyType: EnergyType; planId: string; planName: string }[] = [];
    for (const [et, planIds] of usedPlansSet) {
      for (const planId of planIds) {
        pricePlans.push({
          energyType: planIdToEnergyType.get(planId) || et,
          planId,
          planName: planIdToName.get(planId) || planId,
        });
      }
    }

    const totalConsumptionByType = Array.from(consumptionByType.entries()).map(([energyType, stat]) => ({
      energyType,
      consumption: stat.consumption,
      unit: stat.unit,
      cost: stat.cost,
    }));

    const firstConfig = this.getEffectiveConfig(EnergyType.Electricity, area);
    currency = firstConfig.currency;

    const bill: BillSummary = {
      billId: generateId('bill'),
      area,
      startDate,
      endDate,
      items: finalSummaryItems,
      totalCost: Math.round(totalCost * 100) / 100,
      totalConsumptionByType,
      currency,
      generatedAt: new Date().toISOString(),
      pricePlans,
      deviceBreakdown,
    };

    return createSuccessResult(bill);
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
