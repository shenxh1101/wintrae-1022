import {
  MeterReading,
  AreaConsumption,
  ItemizedStat,
  TrendPoint,
  TrendResult,
  SDKResult,
  AggregationType,
  EnergyType,
} from '../types';
import { createSuccessResult } from '../utils';

export interface ConsumptionDelta {
  reading: MeterReading;
  consumption: number;
  deviceId: string;
}

export class EnergyStatistics {
  queryAreaConsumption(
    area: string,
    deltas: ConsumptionDelta[],
  ): SDKResult<AreaConsumption[]> {
    const byType: Map<EnergyType, { total: number; unit: string }> = new Map();

    for (const delta of deltas) {
      const existing = byType.get(delta.reading.energyType);
      if (existing) {
        existing.total += delta.consumption;
      } else {
        byType.set(delta.reading.energyType, {
          total: delta.consumption,
          unit: delta.reading.unit,
        });
      }
    }

    const totalAll = Array.from(byType.values()).reduce((sum, v) => sum + v.total, 0);
    const results: AreaConsumption[] = [];

    for (const [energyType, { total, unit }] of byType) {
      results.push({
        area,
        energyType,
        consumption: Math.round(total * 1000) / 1000,
        unit,
        period: area,
        percentage: totalAll > 0 ? Math.round((total / totalAll) * 10000) / 100 : 0,
      });
    }

    return createSuccessResult(results);
  }

  itemizedStatistics(
    deltas: ConsumptionDelta[],
    categoryField: 'area' | 'building' | 'floor' = 'area',
    deviceProfiles?: Map<string, { area: string; building: string; floor: string }>,
  ): SDKResult<ItemizedStat[]> {
    if (!deviceProfiles) {
      return createSuccessResult([]);
    }

    const categoryMap: Map<string, Map<EnergyType, { total: number; unit: string }>> = new Map();

    for (const delta of deltas) {
      const profile = deviceProfiles.get(delta.deviceId);
      if (!profile) continue;

      const category = profile[categoryField];
      if (!categoryMap.has(category)) {
        categoryMap.set(category, new Map());
      }
      const typeMap = categoryMap.get(category)!;
      const existing = typeMap.get(delta.reading.energyType);
      if (existing) {
        existing.total += delta.consumption;
      } else {
        typeMap.set(delta.reading.energyType, {
          total: delta.consumption,
          unit: delta.reading.unit,
        });
      }
    }

    const grandTotal = Array.from(categoryMap.values()).reduce((sum, typeMap) => {
      for (const { total } of typeMap.values()) {
        sum += total;
      }
      return sum;
    }, 0);

    const results: ItemizedStat[] = [];
    for (const [category, typeMap] of categoryMap) {
      const categoryTotal = Array.from(typeMap.values()).reduce((s, v) => s + v.total, 0);
      const subItems: ItemizedStat[] = [];

      for (const [energyType, { total, unit }] of typeMap) {
        subItems.push({
          category: energyType,
          energyType,
          consumption: Math.round(total * 1000) / 1000,
          unit,
          percentage: categoryTotal > 0 ? Math.round((total / categoryTotal) * 10000) / 100 : 0,
        });
      }

      results.push({
        category,
        energyType: EnergyType.Electricity,
        consumption: Math.round(categoryTotal * 1000) / 1000,
        unit: 'kWh',
        percentage: grandTotal > 0 ? Math.round((categoryTotal / grandTotal) * 10000) / 100 : 0,
        subItems,
      });
    }

    return createSuccessResult(results);
  }

  trendAnalysis(
    deltas: ConsumptionDelta[],
    energyType: EnergyType,
    aggregationType: AggregationType,
    area?: string,
  ): SDKResult<TrendResult> {
    const buckets: Map<string, number> = new Map();

    for (const delta of deltas) {
      if (delta.reading.energyType !== energyType) continue;

      const date = new Date(delta.reading.timestamp);
      let key: string;
      switch (aggregationType) {
        case AggregationType.Day:
          key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
          break;
        case AggregationType.Month:
          key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
          break;
        case AggregationType.Year:
          key = `${date.getUTCFullYear()}`;
          break;
      }
      buckets.set(key, (buckets.get(key) || 0) + delta.consumption);
    }

    const points: TrendPoint[] = Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([time, value]) => ({
        time,
        value: Math.round(value * 1000) / 1000,
        energyType,
      }));

    return createSuccessResult({
      area: area || '',
      aggregationType,
      energyType,
      points,
    });
  }

  multiEnergyTrend(
    deltas: ConsumptionDelta[],
    aggregationType: AggregationType,
    area?: string,
  ): SDKResult<TrendResult[]> {
    const types = [EnergyType.Electricity, EnergyType.Water, EnergyType.Gas, EnergyType.Heat];
    const results: TrendResult[] = [];

    for (const et of types) {
      const result = this.trendAnalysis(deltas, et, aggregationType, area);
      if (result.success && result.data.points.length > 0) {
        results.push(result.data);
      }
    }

    return createSuccessResult(results);
  }
}
