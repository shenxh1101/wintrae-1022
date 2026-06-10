import {
  EnergyType,
  DeviceStatus,
  TimePeriod,
  AnomalyType,
  AlertLevel,
  AggregationType,
} from './enums';

export interface DeviceProfile {
  deviceId: string;
  name: string;
  energyType: EnergyType;
  area: string;
  floor: string;
  building: string;
  deviceGroup?: string;
  status: DeviceStatus;
  ratedPower: number;
  installDate: string;
  meterId: string;
  metadata?: Record<string, unknown>;
}

export interface MeterReading {
  readingId: string;
  deviceId: string;
  energyType: EnergyType;
  value: number;
  unit: string;
  timestamp: string;
  period?: TimePeriod;
  quality?: ReadingQuality;
}

export enum ReadingQuality {
  Good = 'good',
  Suspect = 'suspect',
  Bad = 'bad',
  Corrected = 'corrected',
}

export interface ManualCorrection {
  correctionId: string;
  readingId: string;
  deviceId: string;
  originalValue: number;
  correctedValue: number;
  reason: string;
  operator: string;
  timestamp: string;
}

export interface PeakValleyPeriod {
  period: TimePeriod;
  startHour: number;
  endHour: number;
  rate: number;
}

export interface PeakValleyConfig {
  energyType: EnergyType;
  periods: PeakValleyPeriod[];
  currency: string;
  planId?: string;
  planName?: string;
}

export interface AnomalyRecord {
  anomalyId: string;
  deviceId: string;
  energyType: EnergyType;
  anomalyType: AnomalyType;
  severity: AlertLevel;
  description: string;
  detectedAt: string;
  value: number;
  expectedValue: number;
  deviationRate: number;
}

export interface AlertRule {
  ruleId: string;
  name: string;
  energyType: EnergyType;
  metric: string;
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq';
  threshold: number;
  level: AlertLevel;
  enabled: boolean;
}

export interface EnergySavingSuggestion {
  suggestionId: string;
  deviceId: string;
  category: string;
  title: string;
  description: string;
  estimatedSavingPercent: number;
  estimatedSavingCost: number;
  priority: 'high' | 'medium' | 'low';
  implementCost: 'low' | 'medium' | 'high';
  applicability: string[];
}

export interface EfficiencyRanking {
  deviceId: string;
  deviceName: string;
  area: string;
  energyType: EnergyType;
  consumption: number;
  efficiency: number;
  rank: number;
  score: number;
}

export interface BillItem {
  energyType: EnergyType;
  period: TimePeriod;
  consumption: number;
  rate: number;
  cost: number;
  pricePlanId?: string;
  pricePlanName?: string;
}

export interface BillDeviceItem {
  deviceId: string;
  deviceName: string;
  energyType: EnergyType;
  items: BillItem[];
  totalConsumption: number;
  totalCost: number;
  unit: string;
  pricePlanId?: string;
  pricePlanName?: string;
}

export interface BillSummary {
  billId: string;
  area: string;
  startDate: string;
  endDate: string;
  items: BillItem[];
  totalCost: number;
  totalConsumptionByType?: { energyType: EnergyType; consumption: number; unit: string; cost: number }[];
  currency: string;
  generatedAt: string;
  pricePlans?: { energyType: EnergyType; planId: string; planName: string }[];
  deviceBreakdown?: BillDeviceItem[];
}

export interface TrendPoint {
  time: string;
  value: number;
  energyType: EnergyType;
}

export interface TrendResult {
  area: string;
  aggregationType: AggregationType;
  energyType: EnergyType;
  points: TrendPoint[];
}

export interface AreaConsumption {
  area: string;
  energyType: EnergyType;
  consumption: number;
  unit: string;
  period: string;
  percentage?: number;
}

export interface ItemizedStat {
  category: string;
  energyType: EnergyType;
  consumption: number;
  unit: string;
  percentage: number;
  subItems?: ItemizedStat[];
}

export interface EnergyLedgerItem {
  energyType: EnergyType;
  consumption: number;
  unit: string;
  cost: number;
  currency: string;
  peakConsumption?: number;
  valleyConsumption?: number;
  flatConsumption?: number;
  peakCost?: number;
  valleyCost?: number;
  flatCost?: number;
  pricePlanId?: string;
  pricePlanName?: string;
  pricePlanIds?: string[];
}

export interface EnergyLedger {
  ledgerId: string;
  dimension: 'area' | 'building' | 'floor' | 'device' | 'deviceGroup';
  dimensionValue: string;
  dimensionLabel?: string;
  startDate: string;
  endDate: string;
  items: EnergyLedgerItem[];
  totalCost: number;
  currency: string;
  deviceCount: number;
  generatedAt: string;
}

export interface EnergyLedgerDetail {
  ledger: EnergyLedger;
  deviceBreakdown: {
    deviceId: string;
    deviceName: string;
    items: EnergyLedgerItem[];
  }[];
}

export interface BillReconciliationItem {
  energyType: EnergyType;
  areaTotal: number;
  floorTotal: number;
  deviceTotal: number;
  areaVsFloorDiff: number;
  floorVsDeviceDiff: number;
  areaVsDeviceDiff: number;
  unit: string;
  areaCost: number;
  floorCost: number;
  deviceCost: number;
  areaVsFloorCostDiff: number;
  floorVsDeviceCostDiff: number;
  areaVsDeviceCostDiff: number;
  currency: string;
  isBalanced: boolean;
}

export interface BillReconciliationResult {
  area: string;
  startDate: string;
  endDate: string;
  items: BillReconciliationItem[];
  totalAreaCost: number;
  totalFloorCost: number;
  totalDeviceCost: number;
  overallDiff: number;
  isBalanced: boolean;
  currency: string;
  discrepancyDetails?: {
    dimension: string;
    dimensionValue: string;
    energyType: EnergyType;
    expected: number;
    actual: number;
    diff: number;
    unit: string;
  }[];
}

export interface SDKResult<T> {
  success: boolean;
  code: string;
  message: string;
  data: T;
  timestamp: string;
  traceId?: string;
}

export interface PaginatedResult<T> extends SDKResult<T[]> {
  total: number;
  page: number;
  pageSize: number;
}

export interface SDKConfig {
  peakValleyConfigs?: PeakValleyConfig[];
  alertRules?: AlertRule[];
  anomalyThreshold?: number;
  defaultCurrency?: string;
  timezone?: string;
}
