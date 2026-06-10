import {
  MeterReading,
  EfficiencyRanking,
  EnergySavingSuggestion,
  BillSummary,
  DeviceProfile,
  EnergyType,
  SDKResult,
} from '../types';
import { createSuccessResult, generateId } from '../utils';

interface DeviceConsumption {
  deviceId: string;
  deviceName: string;
  area: string;
  energyType: EnergyType;
  consumption: number;
  ratedPower: number;
  hoursUsed: number;
}

export class EnergyAdvisor {
  private suggestions: Map<string, EnergySavingSuggestion> = new Map();

  generateEfficiencyRanking(
    readings: MeterReading[],
    devices: Map<string, DeviceProfile>,
    topN = 10,
  ): SDKResult<EfficiencyRanking[]> {
    const consumption: Map<string, DeviceConsumption> = new Map();

    for (const reading of readings) {
      const device = devices.get(reading.deviceId);
      if (!device) continue;

      const existing = consumption.get(reading.deviceId);
      if (existing) {
        existing.consumption += reading.value;
      } else {
        consumption.set(reading.deviceId, {
          deviceId: reading.deviceId,
          deviceName: device.name,
          area: device.area,
          energyType: reading.energyType,
          consumption: reading.value,
          ratedPower: device.ratedPower,
          hoursUsed: 0,
        });
      }
    }

    const rankings: EfficiencyRanking[] = [];
    for (const dc of consumption.values()) {
      const efficiency = dc.ratedPower > 0
        ? dc.consumption / (dc.ratedPower * 24 * 30)
        : 0;
      rankings.push({
        deviceId: dc.deviceId,
        deviceName: dc.deviceName,
        area: dc.area,
        energyType: dc.energyType,
        consumption: Math.round(dc.consumption * 1000) / 1000,
        efficiency: Math.round(efficiency * 10000) / 100,
        rank: 0,
        score: 0,
      });
    }

    rankings.sort((a, b) => a.efficiency - b.efficiency);

    const maxEff = rankings.length > 0 ? rankings[rankings.length - 1].efficiency : 1;
    for (let i = 0; i < rankings.length; i++) {
      rankings[i].rank = i + 1;
      rankings[i].score = maxEff > 0
        ? Math.round((1 - rankings[i].efficiency / maxEff) * 100)
        : 100;
    }

    return createSuccessResult(rankings.slice(0, topN));
  }

  generateSavingSuggestions(
    readings: MeterReading[],
    devices: Map<string, DeviceProfile>,
    avgTempSeason: 'summer' | 'winter' | 'spring_autumn' = 'spring_autumn',
  ): SDKResult<EnergySavingSuggestion[]> {
    const newSuggestions: EnergySavingSuggestion[] = [];

    const byDevice: Map<string, { total: number; energyType: EnergyType; name: string; area: string; ratedPower: number }> = new Map();
    for (const reading of readings) {
      const device = devices.get(reading.deviceId);
      if (!device) continue;

      const existing = byDevice.get(reading.deviceId);
      if (existing) {
        existing.total += reading.value;
      } else {
        byDevice.set(reading.deviceId, {
          total: reading.value,
          energyType: reading.energyType,
          name: device.name,
          area: device.area,
          ratedPower: device.ratedPower,
        });
      }
    }

    for (const [deviceId, data] of byDevice) {
      const loadFactor = data.ratedPower > 0 ? data.total / (data.ratedPower * 720) : 0;

      if (data.energyType === EnergyType.Electricity) {
        if (loadFactor > 0.8) {
          newSuggestions.push(this.createSuggestion(
            deviceId, '负载优化', '设备负载率过高',
            `设备 ${data.name} 负载率达 ${(loadFactor * 100).toFixed(1)}%，建议检查是否存在过载运行或优化运行策略`,
            15, 'high', 'medium',
          ));
        }

        if (avgTempSeason === 'summer') {
          newSuggestions.push(this.createSuggestion(
            deviceId, '空调优化', '夏季空调能效提升',
            '建议将空调设定温度提高1-2°C，利用夜间低谷电价预冷，可在夏季节省约10-20%空调电耗',
            15, 'high', 'low',
          ));
        }

        if (avgTempSeason === 'winter') {
          newSuggestions.push(this.createSuggestion(
            deviceId, '供暖优化', '冬季供暖能效提升',
            '建议降低非工作区供暖温度，利用低谷时段蓄热，可在冬季节省约10-15%供暖能耗',
            12, 'high', 'low',
          ));
        }

        newSuggestions.push(this.createSuggestion(
          deviceId, '峰谷调优', '用电时段优化',
          '建议将可调负荷转移至低谷时段运行，利用峰谷电价差降低用电成本',
          10, 'medium', 'low',
        ));
      }

      if (data.energyType === EnergyType.Water) {
        newSuggestions.push(this.createSuggestion(
          deviceId, '节水管理', '用水效率优化',
          '建议检查管网漏水，安装节水器具，优化绿化浇灌时段至夜间蒸发量低时段',
          8, 'medium', 'low',
        ));
      }

      if (data.energyType === EnergyType.Gas) {
        newSuggestions.push(this.createSuggestion(
          deviceId, '燃气优化', '燃气使用效率提升',
          '建议定期维护燃气设备，优化燃烧空燃比，回收余热用于预热',
          12, 'medium', 'medium',
        ));
      }

      if (data.energyType === EnergyType.Heat) {
        newSuggestions.push(this.createSuggestion(
          deviceId, '供热优化', '供热系统效率提升',
          '建议根据室外温度动态调整供水温度，实施分时段供热策略',
          10, 'medium', 'medium',
        ));
      }

      if (loadFactor < 0.3 && data.ratedPower > 0) {
        newSuggestions.push(this.createSuggestion(
          deviceId, '低负载优化', '设备低负载运行',
          `设备 ${data.name} 负载率仅 ${(loadFactor * 100).toFixed(1)}%，考虑更换为更小容量设备或实施变频改造`,
          20, 'medium', 'high',
        ));
      }
    }

    for (const s of newSuggestions) {
      this.suggestions.set(s.suggestionId, s);
    }

    return createSuccessResult(newSuggestions);
  }

  generateBillSummary(bills: BillSummary[]): SDKResult<{
    totalCost: number;
    byEnergyType: Map<EnergyType, number>;
    byArea: Map<string, number>;
    currency: string;
    billCount: number;
  }> {
    const byEnergyType: Map<EnergyType, number> = new Map();
    const byArea: Map<string, number> = new Map();
    let totalCost = 0;
    let currency = 'CNY';

    for (const bill of bills) {
      totalCost += bill.totalCost;
      currency = bill.currency;

      const currentArea = byArea.get(bill.area) || 0;
      byArea.set(bill.area, currentArea + bill.totalCost);

      for (const item of bill.items) {
        const current = byEnergyType.get(item.energyType) || 0;
        byEnergyType.set(item.energyType, current + item.cost);
      }
    }

    return createSuccessResult({
      totalCost: Math.round(totalCost * 100) / 100,
      byEnergyType,
      byArea,
      currency,
      billCount: bills.length,
    });
  }

  getSuggestions(deviceId?: string, category?: string): SDKResult<EnergySavingSuggestion[]> {
    let results = Array.from(this.suggestions.values());
    if (deviceId) {
      results = results.filter(s => s.deviceId === deviceId);
    }
    if (category) {
      results = results.filter(s => s.category === category);
    }
    return createSuccessResult(results);
  }

  private createSuggestion(
    deviceId: string,
    category: string,
    title: string,
    description: string,
    estimatedSavingPercent: number,
    priority: 'high' | 'medium' | 'low',
    implementCost: 'low' | 'medium' | 'high',
  ): EnergySavingSuggestion {
    return {
      suggestionId: generateId('sug'),
      deviceId,
      category,
      title,
      description,
      estimatedSavingPercent,
      estimatedSavingCost: 0,
      priority,
      implementCost,
      applicability: ['commercial', 'industrial', 'residential'],
    };
  }
}
