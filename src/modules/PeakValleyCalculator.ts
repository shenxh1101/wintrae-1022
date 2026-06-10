import {
  MeterReading,
  PeakValleyConfig,
  PeakValleyPeriod,
  BillItem,
  BillSummary,
  TimePeriod,
  EnergyType,
  SDKResult,
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
  },
  {
    energyType: EnergyType.Gas,
    periods: [
      { period: TimePeriod.Flat, startHour: 0, endHour: 24, rate: 3.0 },
    ],
    currency: 'CNY',
  },
  {
    energyType: EnergyType.Water,
    periods: [
      { period: TimePeriod.Flat, startHour: 0, endHour: 24, rate: 5.0 },
    ],
    currency: 'CNY',
  },
  {
    energyType: EnergyType.Heat,
    periods: [
      { period: TimePeriod.Flat, startHour: 0, endHour: 24, rate: 0.3 },
    ],
    currency: 'CNY',
  },
];

export class PeakValleyCalculator {
  private configs: Map<EnergyType, PeakValleyConfig> = new Map();

  constructor(customConfigs?: PeakValleyConfig[]) {
    const configs = customConfigs || DEFAULT_PEAK_VALLEY_CONFIGS;
    for (const config of configs) {
      this.configs.set(config.energyType, config);
    }
  }

  determinePeriod(energyType: EnergyType, hour: number): SDKResult<TimePeriod> {
    const config = this.configs.get(energyType);
    if (!config) {
      return createErrorResult('CONFIG_NOT_FOUND', `未找到能源类型 ${energyType} 的峰谷配置`);
    }

    const period = this.findPeriod(config.periods, hour);
    return createSuccessResult(period);
  }

  calculateConsumptionByPeriod(
    deltas: ConsumptionDelta[],
  ): SDKResult<Map<TimePeriod, number>> {
    const byPeriod: Map<TimePeriod, number> = new Map();
    byPeriod.set(TimePeriod.Peak, 0);
    byPeriod.set(TimePeriod.Valley, 0);
    byPeriod.set(TimePeriod.Flat, 0);

    for (const delta of deltas) {
      const config = this.configs.get(delta.reading.energyType);
      if (!config) continue;

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
  ): SDKResult<BillItem[]> {
    const config = this.configs.get(energyType);
    if (!config) {
      return createErrorResult('CONFIG_NOT_FOUND', `未找到能源类型 ${energyType} 的峰谷配置`);
    }

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
      });
    }

    return createSuccessResult(items);
  }

  generateBill(
    area: string,
    deltas: ConsumptionDelta[],
    startDate: string,
    endDate: string,
  ): SDKResult<BillSummary> {
    const energyTypes = new Set(deltas.map(d => d.reading.energyType));
    const allItems: BillItem[] = [];
    let totalCost = 0;

    for (const et of energyTypes) {
      const result = this.calculateFee(et, deltas);
      if (result.success) {
        allItems.push(...result.data);
        totalCost += result.data.reduce((sum, item) => sum + item.cost, 0);
      }
    }

    const config = this.configs.get(EnergyType.Electricity);
    const bill: BillSummary = {
      billId: generateId('bill'),
      area,
      startDate,
      endDate,
      items: allItems,
      totalCost: Math.round(totalCost * 100) / 100,
      currency: config?.currency || 'CNY',
      generatedAt: new Date().toISOString(),
    };

    return createSuccessResult(bill);
  }

  getConfig(energyType: EnergyType): PeakValleyConfig | undefined {
    return this.configs.get(energyType);
  }

  updateConfig(config: PeakValleyConfig): void {
    this.configs.set(config.energyType, config);
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
