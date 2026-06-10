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
import { createSuccessResult, createErrorResult } from '../utils';

export class EnergyStatistics {
  private readings: Map<string, MeterReading> = new Map();

  loadReadings(readings: MeterReading[]): void {
    for (const r of readings) {
      this.readings.set(r.readingId, r);
    }
  }

  queryAreaConsumption(
    area: string,
    deviceIds: string[],
    startTime: string,
    endTime: string,
  ): SDKResult<AreaConsumption[]> {
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    const results: AreaConsumption[] = [];
    const byType: Map<EnergyType, { total: number; unit: string }> = new Map();

    for (const reading of this.readings.values()) {
      if (!deviceIds.includes(reading.deviceId)) continue;
      const ts = new Date(reading.timestamp).getTime();
      if (ts < start || ts > end) continue;

      const existing = byType.get(reading.energyType);
      if (existing) {
        existing.total += reading.value;
      } else {
        byType.set(reading.energyType, { total: reading.value, unit: reading.unit });
      }
    }

    const totalAll = Array.from(byType.values()).reduce((sum, v) => sum + v.total, 0);

    for (const [energyType, { total, unit }] of byType) {
      results.push({
        area,
        energyType,
        consumption: Math.round(total * 1000) / 1000,
        unit,
        period: `${startTime}~${endTime}`,
        percentage: totalAll > 0 ? Math.round((total / totalAll) * 10000) / 100 : 0,
      });
    }

    return createSuccessResult(results);
  }

  itemizedStatistics(
    deviceIds: string[],
    startTime: string,
    endTime: string,
    categoryField: 'area' | 'building' | 'floor' = 'area',
    deviceProfiles?: Map<string, { area: string; building: string; floor: string }>,
  ): SDKResult<ItemizedStat[]> {
    if (!deviceProfiles) {
      return createSuccessResult([]);
    }

    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    const categoryMap: Map<string, Map<EnergyType, { total: number; unit: string }>> = new Map();

    for (const reading of this.readings.values()) {
      if (!deviceIds.includes(reading.deviceId)) continue;
      const ts = new Date(reading.timestamp).getTime();
      if (ts < start || ts > end) continue;

      const profile = deviceProfiles.get(reading.deviceId);
      if (!profile) continue;

      const category = profile[categoryField];
      if (!categoryMap.has(category)) {
        categoryMap.set(category, new Map());
      }
      const typeMap = categoryMap.get(category)!;
      const existing = typeMap.get(reading.energyType);
      if (existing) {
        existing.total += reading.value;
      } else {
        typeMap.set(reading.energyType, { total: reading.value, unit: reading.unit });
      }
    }

    const grandTotal = Array.from(categoryMap.values())
      .reduce((sum, typeMap) => {
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
    deviceIds: string[],
    energyType: EnergyType,
    aggregationType: AggregationType,
    startTime: string,
    endTime: string,
    area?: string,
  ): SDKResult<TrendResult> {
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    const filtered: MeterReading[] = [];

    for (const reading of this.readings.values()) {
      if (!deviceIds.includes(reading.deviceId)) continue;
      if (reading.energyType !== energyType) continue;
      const ts = new Date(reading.timestamp).getTime();
      if (ts < start || ts > end) continue;
      filtered.push(reading);
    }

    const buckets: Map<string, number> = new Map();

    for (const reading of filtered) {
      const date = new Date(reading.timestamp);
      let key: string;
      switch (aggregationType) {
        case AggregationType.Day:
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
          break;
        case AggregationType.Month:
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          break;
        case AggregationType.Year:
          key = `${date.getFullYear()}`;
          break;
      }
      buckets.set(key, (buckets.get(key) || 0) + reading.value);
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
    deviceIds: string[],
    aggregationType: AggregationType,
    startTime: string,
    endTime: string,
    area?: string,
  ): SDKResult<TrendResult[]> {
    const types = [EnergyType.Electricity, EnergyType.Water, EnergyType.Gas, EnergyType.Heat];
    const results: TrendResult[] = [];

    for (const et of types) {
      const result = this.trendAnalysis(deviceIds, et, aggregationType, startTime, endTime, area);
      if (result.success && result.data.points.length > 0) {
        results.push(result.data);
      }
    }

    return createSuccessResult(results);
  }
}
