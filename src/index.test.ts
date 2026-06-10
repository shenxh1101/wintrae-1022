import {
  SmartEnergySDK,
  EnergyType,
  DeviceStatus,
  AnomalyType,
  AlertLevel,
  AggregationType,
  ReadingQuality,
  BatchReadingSummary,
  TimePeriod,
} from './index';

describe('SmartEnergySDK (Enhanced)', () => {
  let sdk: SmartEnergySDK;

  beforeEach(() => {
    sdk = new SmartEnergySDK();
  });

  describe('1 - Root-level exports', () => {
    test('all commonly used symbols should be importable from root', () => {
      expect(SmartEnergySDK).toBeTruthy();
      expect(EnergyType.Electricity).toBeTruthy();
      expect(DeviceStatus.Online).toBeTruthy();
      expect(AlertLevel.Critical).toBeTruthy();
      expect(ReadingQuality.Good).toBeTruthy();
    });
  });

  describe('2 - Device management', () => {
    test('register/query/update/delete/list all work', () => {
      const reg = sdk.registerDevice({
        name: '空调-1F-A区',
        energyType: EnergyType.Electricity,
        area: 'A区',
        floor: '1F',
        building: '主楼',
        ratedPower: 5000,
        installDate: '2024-01-15',
        meterId: 'METER-001',
      });
      expect(reg.success).toBe(true);
      expect(reg.data.deviceId).toBeTruthy();

      const q = sdk.queryDevice(reg.data.deviceId);
      expect(q.success).toBe(true);
      expect(q.data!.name).toBe('空调-1F-A区');

      const upd = sdk.updateDevice(reg.data.deviceId, { name: '新名字' });
      expect(upd.success).toBe(true);
      expect(upd.data.name).toBe('新名字');

      const areaQ = sdk.queryDevicesByArea('A区');
      expect(areaQ.success).toBe(true);
      expect(areaQ.data.length).toBeGreaterThanOrEqual(1);

      const del = sdk.deleteDevice(reg.data.deviceId);
      expect(del.success).toBe(true);

      const all = sdk.listDevices();
      expect(all.success).toBe(true);
      expect(all.data.length).toBe(0);
    });
  });

  describe('3 - Device archive linkage validation', () => {
    test('submitReading fails with DEVICE_NOT_FOUND for unknown device', () => {
      const r = sdk.submitReading({
        deviceId: 'no-such-device',
        energyType: EnergyType.Electricity,
        value: 100,
        unit: 'kWh',
        timestamp: '2024-06-01T10:00:00Z',
      });
      expect(r.success).toBe(false);
      expect(r.code).toBe('DEVICE_NOT_FOUND');
    });

    test('submitReading fails with ENERGY_TYPE_MISMATCH if wrong type', () => {
      const reg = sdk.registerDevice({
        name: '电表',
        energyType: EnergyType.Electricity,
        area: 'A区',
        floor: '1F',
        building: '主楼',
        ratedPower: 5000,
        installDate: '2024-01-15',
        meterId: 'METER-001',
      });

      const r = sdk.submitReading({
        deviceId: reg.data.deviceId,
        energyType: EnergyType.Water,
        value: 100,
        unit: 't',
        timestamp: '2024-06-01T10:00:00Z',
      });
      expect(r.success).toBe(false);
      expect(r.code).toBe('ENERGY_TYPE_MISMATCH');
    });

    test('submitReading fails with INVALID_VALUE for negative value', () => {
      const reg = sdk.registerDevice({
        name: '电表',
        energyType: EnergyType.Electricity,
        area: 'A区',
        floor: '1F',
        building: '主楼',
        ratedPower: 5000,
        installDate: '2024-01-15',
        meterId: 'METER-001',
      });

      const r = sdk.submitReading({
        deviceId: reg.data.deviceId,
        energyType: EnergyType.Electricity,
        value: -50,
        unit: 'kWh',
        timestamp: '2024-06-01T10:00:00Z',
      });
      expect(r.success).toBe(false);
      expect(r.code).toBe('INVALID_VALUE');
    });

    test('submitReading fails with INVALID_TIMESTAMP for bad timestamp', () => {
      const reg = sdk.registerDevice({
        name: '电表',
        energyType: EnergyType.Electricity,
        area: 'A区',
        floor: '1F',
        building: '主楼',
        ratedPower: 5000,
        installDate: '2024-01-15',
        meterId: 'METER-001',
      });

      const r = sdk.submitReading({
        deviceId: reg.data.deviceId,
        energyType: EnergyType.Electricity,
        value: 100,
        unit: 'kWh',
        timestamp: 'not-a-date',
      });
      expect(r.success).toBe(false);
      expect(r.code).toBe('INVALID_TIMESTAMP');
    });
  });

  describe('4 - Batch submission with per-item results', () => {
    test('submitReadings returns per-item success/failure summary', () => {
      const reg = sdk.registerDevice({
        name: '电表',
        energyType: EnergyType.Electricity,
        area: 'A区',
        floor: '1F',
        building: '主楼',
        ratedPower: 5000,
        installDate: '2024-01-15',
        meterId: 'METER-001',
      });

      const batch: Omit<import('./types').MeterReading, 'readingId' | 'quality'>[] = [
        { deviceId: reg.data.deviceId, energyType: EnergyType.Electricity, value: 100, unit: 'kWh', timestamp: '2024-06-01T10:00:00Z' },
        { deviceId: 'unknown-device', energyType: EnergyType.Electricity, value: 200, unit: 'kWh', timestamp: '2024-06-02T10:00:00Z' },
        { deviceId: reg.data.deviceId, energyType: EnergyType.Water, value: 50, unit: 't', timestamp: '2024-06-03T10:00:00Z' },
        { deviceId: reg.data.deviceId, energyType: EnergyType.Electricity, value: 150, unit: 'kWh', timestamp: '2024-06-04T10:00:00Z' },
      ];

      const result: import('./types').SDKResult<BatchReadingSummary> = sdk.submitReadings(batch);
      expect(result.success).toBe(true);
      expect(result.data.total).toBe(4);
      expect(result.data.successCount).toBe(2);
      expect(result.data.failedCount).toBe(2);

      const successItems = result.data.results.filter(r => r.success);
      expect(successItems.length).toBe(2);
      expect(successItems[0].index).toBe(0);
      expect(successItems[1].index).toBe(3);

      const failedItems = result.data.results.filter(r => !r.success);
      expect(failedItems.length).toBe(2);
      expect(failedItems[0].code).toBe('DEVICE_NOT_FOUND');
      expect(failedItems[1].code).toBe('ENERGY_TYPE_MISMATCH');
    });
  });

  describe('5 - Stable previous-reading lookup (by timestamp)', () => {
    let deviceId: string;

    beforeEach(() => {
      deviceId = sdk.registerDevice({
        name: '电表',
        energyType: EnergyType.Electricity,
        area: 'A区',
        floor: '1F',
        building: '主楼',
        ratedPower: 5000,
        installDate: '2024-01-15',
        meterId: 'METER-001',
      }).data.deviceId;
    });

    test('out-of-order submission still yields stable validation', () => {
      const r1 = sdk.submitReading({ deviceId, energyType: EnergyType.Electricity, value: 100, unit: 'kWh', timestamp: '2024-06-01T10:00:00Z' });
      const r3 = sdk.submitReading({ deviceId, energyType: EnergyType.Electricity, value: 300, unit: 'kWh', timestamp: '2024-06-03T10:00:00Z' });
      const r2 = sdk.submitReading({ deviceId, energyType: EnergyType.Electricity, value: 200, unit: 'kWh', timestamp: '2024-06-02T10:00:00Z' });

      const v2 = sdk.validateReading(r2.data.readingId);
      expect(v2.success).toBe(true);
      expect(v2.data.valid).toBe(true);
      expect(v2.data.issues.length).toBe(0);

      const v3 = sdk.validateReading(r3.data.readingId);
      expect(v3.success).toBe(true);
      expect(v3.data.valid).toBe(true);

      const v1 = sdk.validateReading(r1.data.readingId);
      expect(v1.success).toBe(true);
      expect(v1.data.valid).toBe(true);
    });

    test('submitting data after validation does not change earlier validation result', () => {
      const r1 = sdk.submitReading({ deviceId, energyType: EnergyType.Electricity, value: 100, unit: 'kWh', timestamp: '2024-06-01T10:00:00Z' });
      const r2 = sdk.submitReading({ deviceId, energyType: EnergyType.Electricity, value: 200, unit: 'kWh', timestamp: '2024-06-02T10:00:00Z' });

      const v2Before = sdk.validateReading(r2.data.readingId);
      expect(v2Before.data.valid).toBe(true);
      const issueCountBefore = v2Before.data.issues.length;

      sdk.submitReading({ deviceId, energyType: EnergyType.Electricity, value: 500, unit: 'kWh', timestamp: '2024-06-03T10:00:00Z' });
      sdk.submitReading({ deviceId, energyType: EnergyType.Electricity, value: 900, unit: 'kWh', timestamp: '2024-06-04T10:00:00Z' });

      const v2After = sdk.validateReading(r2.data.readingId);
      expect(v2After.data.valid).toBe(v2Before.data.valid);
      expect(v2After.data.issues.length).toBe(issueCountBefore);
    });

    test('detectSuddenChange uses previous by timestamp', () => {
      sdk.submitReading({ deviceId, energyType: EnergyType.Electricity, value: 100, unit: 'kWh', timestamp: '2024-06-01T10:00:00Z' });
      const r3 = sdk.submitReading({ deviceId, energyType: EnergyType.Electricity, value: 500, unit: 'kWh', timestamp: '2024-06-03T10:00:00Z' });
      sdk.submitReading({ deviceId, energyType: EnergyType.Electricity, value: 200, unit: 'kWh', timestamp: '2024-06-02T10:00:00Z' });

      const sudden = sdk.detectSuddenChange(r3.data.readingId);
      expect(sudden.success).toBe(true);
      if (sudden.data) {
        expect(sudden.data.anomalyType).toBe(AnomalyType.SuddenIncrease);
      }
    });
  });

  describe('6 - Real meter consumption (deltas)', () => {
    let deviceId: string;

    beforeEach(() => {
      deviceId = sdk.registerDevice({
        name: '电表',
        energyType: EnergyType.Electricity,
        area: 'A区',
        floor: '1F',
        building: '主楼',
        ratedPower: 5000,
        installDate: '2024-01-15',
        meterId: 'METER-001',
      }).data.deviceId;
    });

    test('area consumption uses reading deltas, not raw sum', () => {
      sdk.submitReading({ deviceId, energyType: EnergyType.Electricity, value: 1000, unit: 'kWh', timestamp: '2024-05-31T23:00:00Z' });
      sdk.submitReading({ deviceId, energyType: EnergyType.Electricity, value: 1200, unit: 'kWh', timestamp: '2024-06-05T10:00:00Z' });
      sdk.submitReading({ deviceId, energyType: EnergyType.Electricity, value: 1450, unit: 'kWh', timestamp: '2024-06-15T10:00:00Z' });
      sdk.submitReading({ deviceId, energyType: EnergyType.Electricity, value: 1600, unit: 'kWh', timestamp: '2024-06-25T10:00:00Z' });

      const result = sdk.queryAreaConsumption('A区', [deviceId], '2024-06-01T00:00:00Z', '2024-06-30T23:59:59Z');
      expect(result.success).toBe(true);
      expect(result.data.length).toBe(1);
      expect(result.data[0].consumption).toBe(600);
    });

    test('corrected reading changes downstream consumption calculation', () => {
      sdk.submitReading({ deviceId, energyType: EnergyType.Electricity, value: 1000, unit: 'kWh', timestamp: '2024-05-31T23:00:00Z' });
      sdk.submitReading({ deviceId, energyType: EnergyType.Electricity, value: 1500, unit: 'kWh', timestamp: '2024-06-15T10:00:00Z' });
      const r3 = sdk.submitReading({ deviceId, energyType: EnergyType.Electricity, value: 2000, unit: 'kWh', timestamp: '2024-06-30T10:00:00Z' });

      const before = sdk.queryAreaConsumption('A区', [deviceId], '2024-06-01T00:00:00Z', '2024-06-30T23:59:59Z');
      expect(before.data[0].consumption).toBe(1000);

      sdk.syncCorrection({
        readingId: r3.data.readingId,
        deviceId,
        originalValue: 2000,
        correctedValue: 1800,
        reason: '抄表员多录',
        operator: '张三',
      });

      const after = sdk.queryAreaConsumption('A区', [deviceId], '2024-06-01T00:00:00Z', '2024-06-30T23:59:59Z');
      expect(after.data[0].consumption).toBe(800);
    });

    test('trend analysis uses deltas per period', () => {
      sdk.submitReading({ deviceId, energyType: EnergyType.Electricity, value: 0, unit: 'kWh', timestamp: '2024-05-31T23:00:00Z' });
      sdk.submitReading({ deviceId, energyType: EnergyType.Electricity, value: 100, unit: 'kWh', timestamp: '2024-06-01T23:00:00Z' });
      sdk.submitReading({ deviceId, energyType: EnergyType.Electricity, value: 300, unit: 'kWh', timestamp: '2024-06-02T23:00:00Z' });
      sdk.submitReading({ deviceId, energyType: EnergyType.Electricity, value: 600, unit: 'kWh', timestamp: '2024-06-03T23:00:00Z' });

      const trend = sdk.getTrend(
        [deviceId],
        EnergyType.Electricity,
        AggregationType.Day,
        '2024-06-01T00:00:00Z',
        '2024-06-03T23:59:59Z',
      );
      expect(trend.success).toBe(true);
      expect(trend.data.points.length).toBe(3);
      const byTime = new Map(trend.data.points.map(p => [p.time, p.value]));
      expect(byTime.get('2024-06-01')).toBe(100);
      expect(byTime.get('2024-06-02')).toBe(200);
      expect(byTime.get('2024-06-03')).toBe(300);
    });

    test('peak-valley fee and bill also use deltas', () => {
      sdk.submitReading({ deviceId, energyType: EnergyType.Electricity, value: 0, unit: 'kWh', timestamp: '2024-06-01T00:00:00Z' });
      sdk.submitReading({ deviceId, energyType: EnergyType.Electricity, value: 100, unit: 'kWh', timestamp: '2024-06-01T09:00:00Z' });
      sdk.submitReading({ deviceId, energyType: EnergyType.Electricity, value: 300, unit: 'kWh', timestamp: '2024-06-01T22:00:00Z' });

      const fee = sdk.calculatePeakValleyFee(
        EnergyType.Electricity,
        [deviceId],
        '2024-06-01T00:00:00Z',
        '2024-06-01T23:59:59Z',
      );
      expect(fee.success).toBe(true);

      const bill = sdk.generateBill(
        'A区',
        [deviceId],
        '2024-06-01T00:00:00Z',
        '2024-06-01T23:59:59Z',
      );
      expect(bill.success).toBe(true);
      expect(bill.data.totalCost).toBeGreaterThan(0);

      const totalKwh = bill.data.items.reduce((s, it) => s + it.consumption, 0);
      expect(totalKwh).toBe(300);
    });

    test('itemized statistics and efficiency ranking use deltas', () => {
      sdk.submitReading({ deviceId, energyType: EnergyType.Electricity, value: 0, unit: 'kWh', timestamp: '2024-05-31T23:00:00Z' });
      sdk.submitReading({ deviceId, energyType: EnergyType.Electricity, value: 1000, unit: 'kWh', timestamp: '2024-06-15T10:00:00Z' });
      sdk.submitReading({ deviceId, energyType: EnergyType.Electricity, value: 2000, unit: 'kWh', timestamp: '2024-06-30T10:00:00Z' });

      const stats = sdk.getItemizedStatistics(
        [deviceId],
        '2024-06-01T00:00:00Z',
        '2024-06-30T23:59:59Z',
      );
      expect(stats.success).toBe(true);
      expect(stats.data[0].consumption).toBe(2000);

      const ranking = sdk.getEfficiencyRanking(
        [deviceId],
        '2024-06-01T00:00:00Z',
        '2024-06-30T23:59:59Z',
      );
      expect(ranking.success).toBe(true);
      expect(ranking.data.length).toBe(1);
      expect(ranking.data[0].consumption).toBe(2000);

      const suggestions = sdk.getSavingSuggestions(
        [deviceId],
        '2024-06-01T00:00:00Z',
        '2024-06-30T23:59:59Z',
        'summer',
      );
      expect(suggestions.success).toBe(true);
      expect(suggestions.data.length).toBeGreaterThan(0);
      expect(suggestions.data.some((s: { category: string }) => s.category === '空调优化')).toBe(true);
    });
  });

  describe('7 - Unified result format & error reporting', () => {
    test('success result has all unified fields', () => {
      const r = sdk.registerDevice({
        name: '电表',
        energyType: EnergyType.Electricity,
        area: 'A区',
        floor: '1F',
        building: '主楼',
        ratedPower: 5000,
        installDate: '2024-01-15',
        meterId: 'METER-001',
      });
      expect(r.success).toBe(true);
      expect(r.code).toBe('SUCCESS');
      expect(typeof r.message).toBe('string');
      expect(typeof r.timestamp).toBe('string');
      expect(r.data).toBeTruthy();
    });

    test('error result has all unified fields', () => {
      const r = sdk.queryDevice('nonexistent');
      expect(r.success).toBe(false);
      expect(r.code).toBeTruthy();
      expect(r.message).toBeTruthy();
      expect(typeof r.timestamp).toBe('string');
    });
  });

  describe('8 - Anomaly detection & alert rules', () => {
    let deviceId: string;

    beforeEach(() => {
      deviceId = sdk.registerDevice({
        name: '电表',
        energyType: EnergyType.Electricity,
        area: 'A区',
        floor: '1F',
        building: '主楼',
        ratedPower: 5000,
        installDate: '2024-01-15',
        meterId: 'METER-001',
      }).data.deviceId;
    });

    test('alert rule triggers over-limit detection', () => {
      sdk.addAlertRule({
        name: '日用电超1000',
        energyType: EnergyType.Electricity,
        metric: 'value',
        operator: 'gt',
        threshold: 9999,
        level: AlertLevel.Critical,
        enabled: true,
      });

      sdk.submitReading({ deviceId, energyType: EnergyType.Electricity, value: 100, unit: 'kWh', timestamp: '2024-06-01T10:00:00Z' });
      sdk.submitReading({ deviceId, energyType: EnergyType.Electricity, value: 50000, unit: 'kWh', timestamp: '2024-06-02T10:00:00Z' });

      const anomalies = sdk.detectAnomalies([deviceId], '2024-06-01T00:00:00Z', '2024-06-30T23:59:59Z');
      expect(anomalies.success).toBe(true);

      const rules = sdk.getAlertRules();
      expect(rules.success).toBe(true);
      expect(rules.data.length).toBe(1);
    });

    test('getAllAnomalies / getOverLimitAlerts work', () => {
      sdk.addAlertRule({
        name: '超阈值',
        energyType: EnergyType.Electricity,
        metric: 'value',
        operator: 'gt',
        threshold: 99999,
        level: AlertLevel.Warning,
        enabled: true,
      });
      sdk.submitReading({ deviceId, energyType: EnergyType.Electricity, value: 999999, unit: 'kWh', timestamp: '2024-06-02T10:00:00Z' });
      sdk.detectAnomalies([deviceId], '2024-06-01T00:00:00Z', '2024-06-30T23:59:59Z');

      const allA = sdk.getAllAnomalies();
      expect(allA.success).toBe(true);

      const over = sdk.getOverLimitAlerts();
      expect(over.success).toBe(true);
    });
  });

  describe('9 - Itemized statistics keep correct energy types and units', () => {
    let elecId: string;
    let waterId: string;
    let gasId: string;

    beforeEach(() => {
      elecId = sdk.registerDevice({
        name: '电表-1F',
        energyType: EnergyType.Electricity,
        area: 'A区',
        floor: '1F',
        building: '主楼',
        ratedPower: 5000,
        installDate: '2024-01-15',
        meterId: 'E-001',
      }).data.deviceId;

      waterId = sdk.registerDevice({
        name: '水表-1F',
        energyType: EnergyType.Water,
        area: 'A区',
        floor: '1F',
        building: '主楼',
        ratedPower: 0,
        installDate: '2024-01-15',
        meterId: 'W-001',
      }).data.deviceId;

      gasId = sdk.registerDevice({
        name: '气表-1F',
        energyType: EnergyType.Gas,
        area: 'A区',
        floor: '1F',
        building: '主楼',
        ratedPower: 0,
        installDate: '2024-01-15',
        meterId: 'G-001',
      }).data.deviceId;

      sdk.submitReading({ deviceId: elecId, energyType: EnergyType.Electricity, value: 0, unit: 'kWh', timestamp: '2024-05-31T23:00:00Z' });
      sdk.submitReading({ deviceId: elecId, energyType: EnergyType.Electricity, value: 1000, unit: 'kWh', timestamp: '2024-06-30T23:00:00Z' });
      sdk.submitReading({ deviceId: waterId, energyType: EnergyType.Water, value: 0, unit: 'm³', timestamp: '2024-05-31T23:00:00Z' });
      sdk.submitReading({ deviceId: waterId, energyType: EnergyType.Water, value: 200, unit: 'm³', timestamp: '2024-06-30T23:00:00Z' });
      sdk.submitReading({ deviceId: gasId, energyType: EnergyType.Gas, value: 0, unit: 'm³', timestamp: '2024-05-31T23:00:00Z' });
      sdk.submitReading({ deviceId: gasId, energyType: EnergyType.Gas, value: 150, unit: 'm³', timestamp: '2024-06-30T23:00:00Z' });
    });

    test('each energy type keeps its own unit in itemized stats', () => {
      const stats = sdk.getItemizedStatistics([elecId, waterId, gasId], '2024-06-01T00:00:00Z', '2024-06-30T23:59:59Z', 'floor');
      expect(stats.success).toBe(true);

      const elecItem = stats.data.find((s: { energyType: EnergyType }) => s.energyType === EnergyType.Electricity);
      const waterItem = stats.data.find((s: { energyType: EnergyType }) => s.energyType === EnergyType.Water);
      const gasItem = stats.data.find((s: { energyType: EnergyType }) => s.energyType === EnergyType.Gas);

      expect(elecItem).toBeTruthy();
      expect(elecItem?.unit).toBe('kWh');
      expect(elecItem?.energyType).toBe(EnergyType.Electricity);

      expect(waterItem).toBeTruthy();
      expect(waterItem?.unit).toBe('m³');
      expect(waterItem?.energyType).toBe(EnergyType.Water);

      expect(gasItem).toBeTruthy();
      expect(gasItem?.unit).toBe('m³');
      expect(gasItem?.energyType).toBe(EnergyType.Gas);
    });

    test('no item is hardcoded to electricity/kWh', () => {
      const stats = sdk.getItemizedStatistics([waterId, gasId], '2024-06-01T00:00:00Z', '2024-06-30T23:59:59Z', 'area');
      expect(stats.success).toBe(true);

      for (const item of stats.data) {
        expect(item.energyType).not.toBe(EnergyType.Electricity);
        expect(item.unit).not.toBe('kWh');
      }
    });
  });

  describe('10 - Area consumption only counts devices in that area', () => {
    let areaADevice: string;
    let areaBDevice: string;

    beforeEach(() => {
      areaADevice = sdk.registerDevice({
        name: 'A区电表',
        energyType: EnergyType.Electricity,
        area: 'A区',
        floor: '1F',
        building: '主楼',
        ratedPower: 5000,
        installDate: '2024-01-15',
        meterId: 'A-001',
      }).data.deviceId;

      areaBDevice = sdk.registerDevice({
        name: 'B区电表',
        energyType: EnergyType.Electricity,
        area: 'B区',
        floor: '1F',
        building: '副楼',
        ratedPower: 3000,
        installDate: '2024-01-15',
        meterId: 'B-001',
      }).data.deviceId;

      sdk.submitReading({ deviceId: areaADevice, energyType: EnergyType.Electricity, value: 0, unit: 'kWh', timestamp: '2024-05-31T23:00:00Z' });
      sdk.submitReading({ deviceId: areaADevice, energyType: EnergyType.Electricity, value: 500, unit: 'kWh', timestamp: '2024-06-30T23:00:00Z' });
      sdk.submitReading({ deviceId: areaBDevice, energyType: EnergyType.Electricity, value: 0, unit: 'kWh', timestamp: '2024-05-31T23:00:00Z' });
      sdk.submitReading({ deviceId: areaBDevice, energyType: EnergyType.Electricity, value: 300, unit: 'kWh', timestamp: '2024-06-30T23:00:00Z' });
    });

    test('area A query does not include area B device consumption', () => {
      const result = sdk.queryAreaConsumption('A区', [areaADevice, areaBDevice], '2024-06-01T00:00:00Z', '2024-06-30T23:59:59Z');
      expect(result.success).toBe(true);
      expect(result.data.length).toBe(1);
      expect(result.data[0].consumption).toBe(500);
      expect(result.data[0].area).toBe('A区');
    });

    test('area B query returns only area B consumption', () => {
      const result = sdk.queryAreaConsumption('B区', [areaADevice, areaBDevice], '2024-06-01T00:00:00Z', '2024-06-30T23:59:59Z');
      expect(result.success).toBe(true);
      expect(result.data.length).toBe(1);
      expect(result.data[0].consumption).toBe(300);
    });
  });

  describe('11 - Manual correction validation', () => {
    let deviceId: string;
    let readingId: string;

    beforeEach(() => {
      deviceId = sdk.registerDevice({
        name: '电表',
        energyType: EnergyType.Electricity,
        area: 'A区',
        floor: '1F',
        building: '主楼',
        ratedPower: 5000,
        installDate: '2024-01-15',
        meterId: 'METER-001',
      }).data.deviceId;

      const r = sdk.submitReading({ deviceId, energyType: EnergyType.Electricity, value: 1000, unit: 'kWh', timestamp: '2024-06-01T10:00:00Z' });
      readingId = r.data.readingId;
    });

    test('correction fails with DEVICE_MISMATCH if deviceId does not match', () => {
      const result = sdk.syncCorrection({
        readingId,
        deviceId: 'wrong-device-id',
        originalValue: 1000,
        correctedValue: 1200,
        reason: '测试',
        operator: 'test',
      });
      expect(result.success).toBe(false);
      expect(result.code).toBe('DEVICE_MISMATCH');
    });

    test('correction fails with ORIGINAL_VALUE_MISMATCH if original value does not match', () => {
      const result = sdk.syncCorrection({
        readingId,
        deviceId,
        originalValue: 9999,
        correctedValue: 1200,
        reason: '测试',
        operator: 'test',
      });
      expect(result.success).toBe(false);
      expect(result.code).toBe('ORIGINAL_VALUE_MISMATCH');
    });

    test('correction fails with INVALID_VALUE for negative corrected value', () => {
      const result = sdk.syncCorrection({
        readingId,
        deviceId,
        originalValue: 1000,
        correctedValue: -100,
        reason: '测试',
        operator: 'test',
      });
      expect(result.success).toBe(false);
      expect(result.code).toBe('INVALID_VALUE');
    });

    test('successful correction updates downstream stats immediately', () => {
      sdk.submitReading({ deviceId, energyType: EnergyType.Electricity, value: 2000, unit: 'kWh', timestamp: '2024-06-30T10:00:00Z' });

      const before = sdk.queryAreaConsumption('A区', [deviceId], '2024-06-01T00:00:00Z', '2024-06-30T23:59:59Z');
      expect(before.data[0].consumption).toBe(1000);

      sdk.syncCorrection({
        readingId,
        deviceId,
        originalValue: 1000,
        correctedValue: 500,
        reason: '初始表底数错了',
        operator: '张三',
      });

      const after = sdk.queryAreaConsumption('A区', [deviceId], '2024-06-01T00:00:00Z', '2024-06-30T23:59:59Z');
      expect(after.data[0].consumption).toBe(1500);

      const trend = sdk.getTrend([deviceId], EnergyType.Electricity, AggregationType.Month, '2024-06-01T00:00:00Z', '2024-06-30T23:59:59Z');
      expect(trend.data.points[0].value).toBe(1500);

      const bill = sdk.generateBill('A区', [deviceId], '2024-06-01T00:00:00Z', '2024-06-30T23:59:59Z');
      expect(bill.data.totalCost).toBeGreaterThan(0);
    });
  });

  describe('12 - Price plan overrides (area and device level)', () => {
    let areaADevice: string;
    let areaBDevice: string;

    beforeEach(() => {
      areaADevice = sdk.registerDevice({
        name: 'A区电表',
        energyType: EnergyType.Electricity,
        area: 'A区',
        floor: '1F',
        building: '主楼',
        ratedPower: 5000,
        installDate: '2024-01-15',
        meterId: 'A-001',
      }).data.deviceId;

      areaBDevice = sdk.registerDevice({
        name: 'B区电表',
        energyType: EnergyType.Electricity,
        area: 'B区',
        floor: '1F',
        building: '副楼',
        ratedPower: 3000,
        installDate: '2024-01-15',
        meterId: 'B-001',
      }).data.deviceId;

      sdk.submitReading({ deviceId: areaADevice, energyType: EnergyType.Electricity, value: 0, unit: 'kWh', timestamp: '2024-05-31T23:00:00Z' });
      sdk.submitReading({ deviceId: areaADevice, energyType: EnergyType.Electricity, value: 1000, unit: 'kWh', timestamp: '2024-06-30T12:00:00Z' });
      sdk.submitReading({ deviceId: areaBDevice, energyType: EnergyType.Electricity, value: 0, unit: 'kWh', timestamp: '2024-05-31T23:00:00Z' });
      sdk.submitReading({ deviceId: areaBDevice, energyType: EnergyType.Electricity, value: 500, unit: 'kWh', timestamp: '2024-06-30T12:00:00Z' });
    });

    test('default price plan is used when no override exists', () => {
      const bill = sdk.generateBill('A区', [areaADevice], '2024-06-01T00:00:00Z', '2024-06-30T23:59:59Z');
      expect(bill.success).toBe(true);
      expect(bill.data.pricePlans).toBeTruthy();
      expect(bill.data.pricePlans?.length).toBeGreaterThan(0);
      expect(bill.data.pricePlans?.[0].planName).toContain('默认');
    });

    test('area-level price plan override is applied', () => {
      const before = sdk.generateBill('A区', [areaADevice], '2024-06-01T00:00:00Z', '2024-06-30T23:59:59Z');

      sdk.setAreaPriceConfig('A区', {
        energyType: EnergyType.Electricity,
        planId: 'premium-a',
        planName: 'A区商业电价',
        currency: 'CNY',
        periods: [
          { period: TimePeriod.Flat, startHour: 0, endHour: 24, rate: 2.0 },
        ],
      });

      const after = sdk.generateBill('A区', [areaADevice], '2024-06-01T00:00:00Z', '2024-06-30T23:59:59Z');
      expect(after.data.pricePlans?.[0].planName).toBe('A区商业电价');
      expect(after.data.totalCost).toBeGreaterThan(before.data.totalCost);
    });

    test('area B still uses default plan after area A override', () => {
      sdk.setAreaPriceConfig('A区', {
        energyType: EnergyType.Electricity,
        planId: 'premium-a',
        planName: 'A区商业电价',
        currency: 'CNY',
        periods: [
          { period: TimePeriod.Flat, startHour: 0, endHour: 24, rate: 2.0 },
        ],
      });

      const billB = sdk.generateBill('B区', [areaBDevice], '2024-06-01T00:00:00Z', '2024-06-30T23:59:59Z');
      expect(billB.data.pricePlans?.[0].planName).toContain('默认');
    });

    test('bill items are annotated with price plan info', () => {
      const bill = sdk.generateBill('A区', [areaADevice], '2024-06-01T00:00:00Z', '2024-06-30T23:59:59Z');
      expect(bill.data.items.length).toBeGreaterThan(0);
      for (const item of bill.data.items) {
        expect(item.pricePlanId).toBeTruthy();
        expect(item.pricePlanName).toBeTruthy();
      }
    });
  });

  describe('13 - Energy ledger by dimension', () => {
    let elec1F: string;
    let elec2F: string;
    let water1F: string;

    beforeEach(() => {
      elec1F = sdk.registerDevice({
        name: '1F电表',
        energyType: EnergyType.Electricity,
        area: 'A区',
        floor: '1F',
        building: '主楼',
        ratedPower: 5000,
        installDate: '2024-01-15',
        meterId: 'E-1F',
      }).data.deviceId;

      elec2F = sdk.registerDevice({
        name: '2F电表',
        energyType: EnergyType.Electricity,
        area: 'A区',
        floor: '2F',
        building: '主楼',
        ratedPower: 3000,
        installDate: '2024-01-15',
        meterId: 'E-2F',
      }).data.deviceId;

      water1F = sdk.registerDevice({
        name: '1F水表',
        energyType: EnergyType.Water,
        area: 'A区',
        floor: '1F',
        building: '主楼',
        ratedPower: 0,
        installDate: '2024-01-15',
        meterId: 'W-1F',
      }).data.deviceId;

      sdk.submitReading({ deviceId: elec1F, energyType: EnergyType.Electricity, value: 0, unit: 'kWh', timestamp: '2024-05-31T23:00:00Z' });
      sdk.submitReading({ deviceId: elec1F, energyType: EnergyType.Electricity, value: 1000, unit: 'kWh', timestamp: '2024-06-30T12:00:00Z' });
      sdk.submitReading({ deviceId: elec2F, energyType: EnergyType.Electricity, value: 0, unit: 'kWh', timestamp: '2024-05-31T23:00:00Z' });
      sdk.submitReading({ deviceId: elec2F, energyType: EnergyType.Electricity, value: 500, unit: 'kWh', timestamp: '2024-06-30T12:00:00Z' });
      sdk.submitReading({ deviceId: water1F, energyType: EnergyType.Water, value: 0, unit: 'm³', timestamp: '2024-05-31T23:00:00Z' });
      sdk.submitReading({ deviceId: water1F, energyType: EnergyType.Water, value: 100, unit: 'm³', timestamp: '2024-06-30T12:00:00Z' });
    });

    test('floor-dimension ledger groups by floor', () => {
      const ledger = sdk.getEnergyLedger('floor', [elec1F, elec2F, water1F], '2024-06-01T00:00:00Z', '2024-06-30T23:59:59Z');
      expect(ledger.success).toBe(true);
      expect(ledger.data.length).toBe(2);

      const floor1 = ledger.data.find((l: { dimensionValue: string }) => l.dimensionValue === '1F');
      const floor2 = ledger.data.find((l: { dimensionValue: string }) => l.dimensionValue === '2F');

      expect(floor1).toBeTruthy();
      expect(floor1?.deviceCount).toBe(2);
      expect(floor1?.items.length).toBe(2);

      expect(floor2).toBeTruthy();
      expect(floor2?.deviceCount).toBe(1);
      expect(floor2?.items.length).toBe(1);
    });

    test('area-dimension ledger has one entry per area', () => {
      const ledger = sdk.getEnergyLedger('area', [elec1F, elec2F, water1F], '2024-06-01T00:00:00Z', '2024-06-30T23:59:59Z');
      expect(ledger.success).toBe(true);
      expect(ledger.data.length).toBe(1);
      expect(ledger.data[0].dimensionValue).toBe('A区');
      expect(ledger.data[0].deviceCount).toBe(3);
      expect(ledger.data[0].items.length).toBe(2);
    });

    test('device-dimension ledger has one entry per device', () => {
      const ledger = sdk.getEnergyLedger('device', [elec1F, elec2F], '2024-06-01T00:00:00Z', '2024-06-30T23:59:59Z');
      expect(ledger.success).toBe(true);
      expect(ledger.data.length).toBe(2);
      for (const entry of ledger.data) {
        expect(entry.dimension).toBe('device');
        expect(entry.dimensionLabel).toBeTruthy();
        expect(entry.deviceCount).toBe(1);
      }
    });

    test('ledger items have correct units and cost', () => {
      const ledger = sdk.getEnergyLedger('floor', [elec1F, water1F], '2024-06-01T00:00:00Z', '2024-06-30T23:59:59Z');
      const floor1 = ledger.data.find((l: { dimensionValue: string }) => l.dimensionValue === '1F');
      expect(floor1).toBeTruthy();

      const elecItem = floor1?.items.find((i: { energyType: EnergyType }) => i.energyType === EnergyType.Electricity);
      const waterItem = floor1?.items.find((i: { energyType: EnergyType }) => i.energyType === EnergyType.Water);

      expect(elecItem?.unit).toBe('kWh');
      expect(elecItem?.consumption).toBe(1000);
      expect(elecItem?.cost).toBeGreaterThan(0);

      expect(waterItem?.unit).toBe('m³');
      expect(waterItem?.consumption).toBe(100);
      expect(waterItem?.cost).toBeGreaterThan(0);
    });

    test('ledger includes peak/valley/flat breakdown', () => {
      const ledger = sdk.getEnergyLedger('area', [elec1F], '2024-06-01T00:00:00Z', '2024-06-30T23:59:59Z');
      const item = ledger.data[0].items.find((i: { energyType: EnergyType }) => i.energyType === EnergyType.Electricity);
      expect(item).toBeTruthy();
      expect(typeof item?.peakConsumption).toBe('number');
      expect(typeof item?.valleyConsumption).toBe('number');
      expect(typeof item?.flatConsumption).toBe('number');
      expect(item?.peakConsumption! + item?.valleyConsumption! + item?.flatConsumption!).toBeCloseTo(item?.consumption || 0, 1);
    });

    test('ledger detail includes device breakdown', () => {
      const detail = sdk.getLedgerDetail('floor', [elec1F, elec2F, water1F], '2024-06-01T00:00:00Z', '2024-06-30T23:59:59Z');
      expect(detail.success).toBe(true);
      expect(detail.data.ledgers.length).toBe(2);
      expect(detail.data.deviceBreakdown.length).toBe(2);

      const floor1Breakdown = detail.data.deviceBreakdown.find((d: { dimensionValue: string }) => d.dimensionValue === '1F');
      expect(floor1Breakdown).toBeTruthy();
      expect(floor1Breakdown?.devices.length).toBe(2);
      expect(floor1Breakdown?.devices[0].deviceName).toBeTruthy();
      expect(floor1Breakdown?.devices[0].items.length).toBeGreaterThan(0);
    });
  });

  describe('14 - Device-level price plans in bill', () => {
    let sdk: SmartEnergySDK;
    let devA: string;
    let devB: string;

    beforeEach(() => {
      sdk = new SmartEnergySDK();
      const r1 = sdk.registerDevice({
        name: '设备A',
        energyType: EnergyType.Electricity,
        area: 'A区',
        floor: '1F',
        building: '1号楼',
        ratedPower: 100,
        installDate: '2024-01-01',
        meterId: 'mA',
      });
      devA = r1.data!.deviceId;

      const r2 = sdk.registerDevice({
        name: '设备B',
        energyType: EnergyType.Electricity,
        area: 'A区',
        floor: '1F',
        building: '1号楼',
        ratedPower: 100,
        installDate: '2024-01-01',
        meterId: 'mB',
      });
      devB = r2.data!.deviceId;

      sdk.submitReading({ deviceId: devA, timestamp: '2024-06-01T00:00:00Z', value: 100, unit: 'kWh', energyType: EnergyType.Electricity });
      sdk.submitReading({ deviceId: devA, timestamp: '2024-06-01T12:00:00Z', value: 200, unit: 'kWh', energyType: EnergyType.Electricity });
      sdk.submitReading({ deviceId: devB, timestamp: '2024-06-01T00:00:00Z', value: 50, unit: 'kWh', energyType: EnergyType.Electricity });
      sdk.submitReading({ deviceId: devB, timestamp: '2024-06-01T12:00:00Z', value: 150, unit: 'kWh', energyType: EnergyType.Electricity });

      sdk.setDevicePriceConfig(devB, {
        energyType: EnergyType.Electricity,
        periods: [{ period: TimePeriod.Flat, startHour: 0, endHour: 24, rate: 2.0 }],
        currency: 'CNY',
        planId: 'premium-electricity',
        planName: '高端电价方案',
      });
    });

    test('bill has device breakdown with different price plans', () => {
      const bill = sdk.generateBill('A区', [devA, devB], '2024-06-01T00:00:00Z', '2024-06-30T23:59:59Z');
      expect(bill.success).toBe(true);
      expect(bill.data.deviceBreakdown).toBeTruthy();
      expect(bill.data.deviceBreakdown!.length).toBe(2);

      const devAItem = bill.data.deviceBreakdown!.find(d => d.deviceId === devA);
      const devBItem = bill.data.deviceBreakdown!.find(d => d.deviceId === devB);
      expect(devAItem).toBeTruthy();
      expect(devBItem).toBeTruthy();
      expect(devAItem?.pricePlanId).not.toBe('premium-electricity');
      expect(devBItem?.pricePlanId).toBe('premium-electricity');

      expect(devAItem?.totalConsumption).toBeCloseTo(100, 3);
      expect(devBItem?.totalConsumption).toBeCloseTo(100, 3);
      expect(devBItem?.totalCost).toBe(200);
    });

    test('total cost equals sum of device costs', () => {
      const bill = sdk.generateBill('A区', [devA, devB], '2024-06-01T00:00:00Z', '2024-06-30T23:59:59Z');
      expect(bill.success).toBe(true);
      const sumOfDeviceCosts = bill.data.deviceBreakdown!.reduce((s, d) => s + d.totalCost, 0);
      expect(bill.data.totalCost).toBeCloseTo(sumOfDeviceCosts, 2);
    });
  });

  describe('15 - Device group ledger dimension', () => {
    let sdk: SmartEnergySDK;
    let dev1: string;
    let dev2: string;
    let dev3: string;

    beforeEach(() => {
      sdk = new SmartEnergySDK();
      const r1 = sdk.registerDevice({
        name: '空调1',
        energyType: EnergyType.Electricity,
        area: 'A区',
        floor: '1F',
        building: '1号楼',
        deviceGroup: 'HVAC',
        ratedPower: 100,
        installDate: '2024-01-01',
        meterId: 'm1',
      });
      dev1 = r1.data!.deviceId;

      const r2 = sdk.registerDevice({
        name: '空调2',
        energyType: EnergyType.Electricity,
        area: 'A区',
        floor: '2F',
        building: '1号楼',
        deviceGroup: 'HVAC',
        ratedPower: 100,
        installDate: '2024-01-01',
        meterId: 'm2',
      });
      dev2 = r2.data!.deviceId;

      const r3 = sdk.registerDevice({
        name: '照明1',
        energyType: EnergyType.Electricity,
        area: 'A区',
        floor: '1F',
        building: '1号楼',
        deviceGroup: 'Lighting',
        ratedPower: 50,
        installDate: '2024-01-01',
        meterId: 'm3',
      });
      dev3 = r3.data!.deviceId;

      sdk.submitReading({ deviceId: dev1, timestamp: '2024-06-01T00:00:00Z', value: 0, unit: 'kWh', energyType: EnergyType.Electricity });
      sdk.submitReading({ deviceId: dev1, timestamp: '2024-06-30T23:59:59Z', value: 300, unit: 'kWh', energyType: EnergyType.Electricity });
      sdk.submitReading({ deviceId: dev2, timestamp: '2024-06-01T00:00:00Z', value: 0, unit: 'kWh', energyType: EnergyType.Electricity });
      sdk.submitReading({ deviceId: dev2, timestamp: '2024-06-30T23:59:59Z', value: 500, unit: 'kWh', energyType: EnergyType.Electricity });
      sdk.submitReading({ deviceId: dev3, timestamp: '2024-06-01T00:00:00Z', value: 0, unit: 'kWh', energyType: EnergyType.Electricity });
      sdk.submitReading({ deviceId: dev3, timestamp: '2024-06-30T23:59:59Z', value: 200, unit: 'kWh', energyType: EnergyType.Electricity });
    });

    test('device group ledger groups by deviceGroup', () => {
      const ledger = sdk.getEnergyLedger('deviceGroup', [dev1, dev2, dev3], '2024-06-01T00:00:00Z', '2024-06-30T23:59:59Z');
      expect(ledger.success).toBe(true);
      expect(ledger.data.length).toBe(2);

      const hvac = ledger.data.find(l => l.dimensionValue === 'HVAC');
      const lighting = ledger.data.find(l => l.dimensionValue === 'Lighting');
      expect(hvac).toBeTruthy();
      expect(lighting).toBeTruthy();
      expect(hvac?.deviceCount).toBe(2);
      expect(lighting?.deviceCount).toBe(1);

      const hvacItem = hvac?.items.find(i => i.energyType === EnergyType.Electricity);
      expect(hvacItem?.consumption).toBeCloseTo(800, 3);
    });

    test('device group ledger detail has device breakdown', () => {
      const detail = sdk.getLedgerDetail('deviceGroup', [dev1, dev2, dev3], '2024-06-01T00:00:00Z', '2024-06-30T23:59:59Z');
      expect(detail.success).toBe(true);
      expect(detail.data.ledgers.length).toBe(2);
      expect(detail.data.deviceBreakdown.length).toBe(2);

      const hvacBreakdown = detail.data.deviceBreakdown.find((d: { dimensionValue: string }) => d.dimensionValue === 'HVAC');
      expect(hvacBreakdown).toBeTruthy();
      expect(hvacBreakdown?.devices.length).toBe(2);
    });
  });

  describe('16 - Floor ledger inherits area pricing', () => {
    let sdk: SmartEnergySDK;
    let dev1F: string;
    let dev2F: string;

    beforeEach(() => {
      sdk = new SmartEnergySDK();
      const r1 = sdk.registerDevice({
        name: '1楼电表',
        energyType: EnergyType.Electricity,
        area: 'A区',
        floor: '1F',
        building: '1号楼',
        ratedPower: 100,
        installDate: '2024-01-01',
        meterId: 'm1F',
      });
      dev1F = r1.data!.deviceId;

      const r2 = sdk.registerDevice({
        name: '2楼电表',
        energyType: EnergyType.Electricity,
        area: 'A区',
        floor: '2F',
        building: '1号楼',
        ratedPower: 100,
        installDate: '2024-01-01',
        meterId: 'm2F',
      });
      dev2F = r2.data!.deviceId;

      sdk.submitReading({ deviceId: dev1F, timestamp: '2024-06-01T00:00:00Z', value: 0, unit: 'kWh', energyType: EnergyType.Electricity });
      sdk.submitReading({ deviceId: dev1F, timestamp: '2024-06-30T12:00:00Z', value: 100, unit: 'kWh', energyType: EnergyType.Electricity });
      sdk.submitReading({ deviceId: dev2F, timestamp: '2024-06-01T00:00:00Z', value: 0, unit: 'kWh', energyType: EnergyType.Electricity });
      sdk.submitReading({ deviceId: dev2F, timestamp: '2024-06-30T12:00:00Z', value: 200, unit: 'kWh', energyType: EnergyType.Electricity });
    });

    test('floor ledger uses area price plan after setting area config', () => {
      sdk.setAreaPriceConfig('A区', {
        energyType: EnergyType.Electricity,
        periods: [{ period: TimePeriod.Flat, startHour: 0, endHour: 24, rate: 1.5 }],
        currency: 'CNY',
        planId: 'area-a-electricity',
        planName: 'A区电价方案',
      });

      const floorLedger = sdk.getEnergyLedger('floor', [dev1F, dev2F], '2024-06-01T00:00:00Z', '2024-06-30T23:59:59Z');
      expect(floorLedger.success).toBe(true);
      expect(floorLedger.data.length).toBe(2);

      const floor1 = floorLedger.data.find(l => l.dimensionValue === '1F');
      const floor2 = floorLedger.data.find(l => l.dimensionValue === '2F');
      expect(floor1?.items[0]?.pricePlanId).toBe('area-a-electricity');
      expect(floor2?.items[0]?.pricePlanId).toBe('area-a-electricity');
      expect(floor1?.totalCost).toBeCloseTo(150, 2);
      expect(floor2?.totalCost).toBeCloseTo(300, 2);

      const areaBill = sdk.generateBill('A区', [dev1F, dev2F], '2024-06-01T00:00:00Z', '2024-06-30T23:59:59Z');
      const floorSum = floorLedger.data.reduce((s, l) => s + l.totalCost, 0);
      expect(floorSum).toBeCloseTo(areaBill.data.totalCost, 2);
    });
  });

  describe('17 - Bill reconciliation (three dimensions)', () => {
    let sdk: SmartEnergySDK;
    let dev1: string;
    let dev2: string;

    beforeEach(() => {
      sdk = new SmartEnergySDK();
      const r1 = sdk.registerDevice({
        name: '1楼电表',
        energyType: EnergyType.Electricity,
        area: 'A区',
        floor: '1F',
        building: '1号楼',
        ratedPower: 100,
        installDate: '2024-01-01',
        meterId: 'm1',
      });
      dev1 = r1.data!.deviceId;

      const r2 = sdk.registerDevice({
        name: '2楼电表',
        energyType: EnergyType.Electricity,
        area: 'A区',
        floor: '2F',
        building: '1号楼',
        ratedPower: 100,
        installDate: '2024-01-01',
        meterId: 'm2',
      });
      dev2 = r2.data!.deviceId;

      sdk.submitReading({ deviceId: dev1, timestamp: '2024-06-01T00:00:00Z', value: 0, unit: 'kWh', energyType: EnergyType.Electricity });
      sdk.submitReading({ deviceId: dev1, timestamp: '2024-06-30T12:00:00Z', value: 300, unit: 'kWh', energyType: EnergyType.Electricity });
      sdk.submitReading({ deviceId: dev2, timestamp: '2024-06-01T00:00:00Z', value: 0, unit: 'kWh', energyType: EnergyType.Electricity });
      sdk.submitReading({ deviceId: dev2, timestamp: '2024-06-30T12:00:00Z', value: 500, unit: 'kWh', energyType: EnergyType.Electricity });
    });

    test('reconciliation returns balanced result with consistent data', () => {
      const recon = sdk.reconcileBill('A区', [dev1, dev2], '2024-06-01T00:00:00Z', '2024-06-30T23:59:59Z');
      expect(recon.success).toBe(true);
      expect(recon.data.isBalanced).toBe(true);
      expect(recon.code).toBe('BALANCED');
      expect(recon.data.items.length).toBe(1);
      expect(recon.data.items[0].areaVsDeviceDiff).toBeCloseTo(0, 3);
      expect(recon.data.items[0].floorVsDeviceDiff).toBeCloseTo(0, 3);
      expect(recon.data.totalAreaCost).toBeCloseTo(recon.data.totalDeviceCost, 2);
    });

    test('reconciliation has correct totals', () => {
      const recon = sdk.reconcileBill('A区', [dev1, dev2], '2024-06-01T00:00:00Z', '2024-06-30T23:59:59Z');
      expect(recon.success).toBe(true);
      const elecItem = recon.data.items.find(i => i.energyType === EnergyType.Electricity);
      expect(elecItem).toBeTruthy();
      expect(elecItem?.areaTotal).toBeCloseTo(800, 3);
      expect(elecItem?.floorTotal).toBeCloseTo(800, 3);
      expect(elecItem?.deviceTotal).toBeCloseTo(800, 3);
    });
  });

  describe('18 - Cross-area floor/device-group ledger pricing', () => {
    let sdk: SmartEnergySDK;
    let devA1F: string;
    let devB1F: string;

    beforeEach(() => {
      sdk = new SmartEnergySDK();

      const r1 = sdk.registerDevice({
        name: 'A区1楼电表',
        energyType: EnergyType.Electricity,
        area: 'A区',
        floor: '1F',
        building: '1号楼',
        deviceGroup: 'HVAC',
        ratedPower: 100,
        installDate: '2024-01-01',
        meterId: 'mA1',
      });
      devA1F = r1.data!.deviceId;

      const r2 = sdk.registerDevice({
        name: 'B区1楼电表',
        energyType: EnergyType.Electricity,
        area: 'B区',
        floor: '1F',
        building: '2号楼',
        deviceGroup: 'HVAC',
        ratedPower: 100,
        installDate: '2024-01-01',
        meterId: 'mB1',
      });
      devB1F = r2.data!.deviceId;

      sdk.setAreaPriceConfig('A区', {
        energyType: EnergyType.Electricity,
        periods: [{ period: TimePeriod.Flat, startHour: 0, endHour: 24, rate: 1.0 }],
        currency: 'CNY',
        planId: 'area-a-plan',
        planName: 'A区电价',
      });
      sdk.setAreaPriceConfig('B区', {
        energyType: EnergyType.Electricity,
        periods: [{ period: TimePeriod.Flat, startHour: 0, endHour: 24, rate: 2.0 }],
        currency: 'CNY',
        planId: 'area-b-plan',
        planName: 'B区电价',
      });

      sdk.submitReading({ deviceId: devA1F, timestamp: '2024-06-01T00:00:00Z', value: 0, unit: 'kWh', energyType: EnergyType.Electricity });
      sdk.submitReading({ deviceId: devA1F, timestamp: '2024-06-30T23:59:59Z', value: 100, unit: 'kWh', energyType: EnergyType.Electricity });
      sdk.submitReading({ deviceId: devB1F, timestamp: '2024-06-01T00:00:00Z', value: 0, unit: 'kWh', energyType: EnergyType.Electricity });
      sdk.submitReading({ deviceId: devB1F, timestamp: '2024-06-30T23:59:59Z', value: 100, unit: 'kWh', energyType: EnergyType.Electricity });
    });

    test('floor ledger with cross-area devices sums cost correctly per-area', () => {
      const ledger = sdk.getEnergyLedger('floor', [devA1F, devB1F], '2024-06-01T00:00:00Z', '2024-06-30T23:59:59Z');
      expect(ledger.success).toBe(true);
      expect(ledger.data.length).toBe(1);
      const floor1F = ledger.data[0];
      expect(floor1F.items[0].consumption).toBeCloseTo(200, 3);
      expect(floor1F.totalCost).toBeCloseTo(300, 2);
      expect(floor1F.items[0].pricePlanIds).toBeTruthy();
      expect(floor1F.items[0].pricePlanIds!.length).toBe(2);
    });

    test('floor cross-area total equals sum of individual area bills', () => {
      const ledger = sdk.getEnergyLedger('floor', [devA1F, devB1F], '2024-06-01T00:00:00Z', '2024-06-30T23:59:59Z');
      const billA = sdk.generateBill('A区', [devA1F, devB1F], '2024-06-01T00:00:00Z', '2024-06-30T23:59:59Z');
      const billB = sdk.generateBill('B区', [devA1F, devB1F], '2024-06-01T00:00:00Z', '2024-06-30T23:59:59Z');
      expect(ledger.data[0].totalCost).toBeCloseTo(billA.data.totalCost + billB.data.totalCost, 2);
    });

    test('device group ledger with cross-area devices sums correctly', () => {
      const ledger = sdk.getEnergyLedger('deviceGroup', [devA1F, devB1F], '2024-06-01T00:00:00Z', '2024-06-30T23:59:59Z');
      expect(ledger.success).toBe(true);
      expect(ledger.data.length).toBe(1);
      const hvac = ledger.data[0];
      expect(hvac.items[0].consumption).toBeCloseTo(200, 3);
      expect(hvac.totalCost).toBeCloseTo(300, 2);
    });
  });

  describe('19 - Bill pricePlans name matches planId correctly', () => {
    let sdk: SmartEnergySDK;
    let dev1: string;
    let dev2: string;

    beforeEach(() => {
      sdk = new SmartEnergySDK();
      const r1 = sdk.registerDevice({
        name: '普通电表',
        energyType: EnergyType.Electricity,
        area: 'A区', floor: '1F', building: '1号楼',
        ratedPower: 100, installDate: '2024-01-01', meterId: 'm1',
      });
      dev1 = r1.data!.deviceId;

      const r2 = sdk.registerDevice({
        name: 'VIP电表',
        energyType: EnergyType.Electricity,
        area: 'A区', floor: '1F', building: '1号楼',
        ratedPower: 100, installDate: '2024-01-01', meterId: 'm2',
      });
      dev2 = r2.data!.deviceId;

      sdk.setDevicePriceConfig(dev2, {
        energyType: EnergyType.Electricity,
        periods: [{ period: TimePeriod.Flat, startHour: 0, endHour: 24, rate: 5.0 }],
        currency: 'CNY',
        planId: 'vip-plan',
        planName: 'VIP专属电价',
      });

      sdk.submitReading({ deviceId: dev1, timestamp: '2024-06-01T00:00:00Z', value: 0, unit: 'kWh', energyType: EnergyType.Electricity });
      sdk.submitReading({ deviceId: dev1, timestamp: '2024-06-30T23:59:59Z', value: 100, unit: 'kWh', energyType: EnergyType.Electricity });
      sdk.submitReading({ deviceId: dev2, timestamp: '2024-06-01T00:00:00Z', value: 0, unit: 'kWh', energyType: EnergyType.Electricity });
      sdk.submitReading({ deviceId: dev2, timestamp: '2024-06-30T23:59:59Z', value: 100, unit: 'kWh', energyType: EnergyType.Electricity });
    });

    test('bill pricePlans list has correct planName for each planId', () => {
      const bill = sdk.generateBill('A区', [dev1, dev2], '2024-06-01T00:00:00Z', '2024-06-30T23:59:59Z');
      expect(bill.success).toBe(true);
      expect(bill.data.pricePlans).toBeTruthy();
      expect(bill.data.pricePlans!.length).toBeGreaterThanOrEqual(2);

      const vipPlan = bill.data.pricePlans!.find(p => p.planId === 'vip-plan');
      expect(vipPlan).toBeTruthy();
      expect(vipPlan?.planName).toBe('VIP专属电价');

      const defaultPlan = bill.data.pricePlans!.find(p => p.planId !== 'vip-plan');
      expect(defaultPlan).toBeTruthy();
      expect(defaultPlan?.planName).not.toBe('VIP专属电价');
    });

    test('device breakdown item has its own price plan name', () => {
      const bill = sdk.generateBill('A区', [dev1, dev2], '2024-06-01T00:00:00Z', '2024-06-30T23:59:59Z');
      const vipDev = bill.data.deviceBreakdown!.find(d => d.deviceId === dev2);
      expect(vipDev).toBeTruthy();
      expect(vipDev?.pricePlanName).toBe('VIP专属电价');
    });
  });

  describe('20 - Multi-energy reconciliation with separate cost/consumption diffs', () => {
    let sdk: SmartEnergySDK;
    let elecDev: string;
    let waterDev: string;
    let gasDev: string;

    beforeEach(() => {
      sdk = new SmartEnergySDK();
      const r1 = sdk.registerDevice({
        name: '电表', energyType: EnergyType.Electricity,
        area: 'A区', floor: '1F', building: '1号楼',
        ratedPower: 100, installDate: '2024-01-01', meterId: 'mE',
      });
      elecDev = r1.data!.deviceId;
      const r2 = sdk.registerDevice({
        name: '水表', energyType: EnergyType.Water,
        area: 'A区', floor: '1F', building: '1号楼',
        ratedPower: 0, installDate: '2024-01-01', meterId: 'mW',
      });
      waterDev = r2.data!.deviceId;
      const r3 = sdk.registerDevice({
        name: '气表', energyType: EnergyType.Gas,
        area: 'A区', floor: '1F', building: '1号楼',
        ratedPower: 0, installDate: '2024-01-01', meterId: 'mG',
      });
      gasDev = r3.data!.deviceId;

      sdk.submitReading({ deviceId: elecDev, timestamp: '2024-06-01T00:00:00Z', value: 0, unit: 'kWh', energyType: EnergyType.Electricity });
      sdk.submitReading({ deviceId: elecDev, timestamp: '2024-06-30T23:59:59Z', value: 500, unit: 'kWh', energyType: EnergyType.Electricity });
      sdk.submitReading({ deviceId: waterDev, timestamp: '2024-06-01T00:00:00Z', value: 0, unit: 'm³', energyType: EnergyType.Water });
      sdk.submitReading({ deviceId: waterDev, timestamp: '2024-06-30T23:59:59Z', value: 50, unit: 'm³', energyType: EnergyType.Water });
      sdk.submitReading({ deviceId: gasDev, timestamp: '2024-06-01T00:00:00Z', value: 0, unit: 'm³', energyType: EnergyType.Gas });
      sdk.submitReading({ deviceId: gasDev, timestamp: '2024-06-30T23:59:59Z', value: 30, unit: 'm³', energyType: EnergyType.Gas });
    });

    test('reconciliation returns separate item per energy type', () => {
      const recon = sdk.reconcileBill('A区', [elecDev, waterDev, gasDev], '2024-06-01T00:00:00Z', '2024-06-30T23:59:59Z');
      expect(recon.success).toBe(true);
      expect(recon.data.items.length).toBe(3);
      expect(recon.data.isBalanced).toBe(true);

      const elec = recon.data.items.find(i => i.energyType === EnergyType.Electricity);
      const water = recon.data.items.find(i => i.energyType === EnergyType.Water);
      const gas = recon.data.items.find(i => i.energyType === EnergyType.Gas);
      expect(elec).toBeTruthy();
      expect(water).toBeTruthy();
      expect(gas).toBeTruthy();
      expect(elec?.unit).toBe('kWh');
      expect(water?.unit).toBe('m³');
      expect(gas?.unit).toBe('m³');
    });

    test('each energy type has consumption and cost diffs reported separately', () => {
      const recon = sdk.reconcileBill('A区', [elecDev, waterDev, gasDev], '2024-06-01T00:00:00Z', '2024-06-30T23:59:59Z');
      expect(recon.success).toBe(true);
      for (const item of recon.data.items) {
        expect(typeof item.areaTotal).toBe('number');
        expect(typeof item.areaCost).toBe('number');
        expect(typeof item.areaVsFloorDiff).toBe('number');
        expect(typeof item.areaVsFloorCostDiff).toBe('number');
        expect(item.isBalanced).toBe(true);
      }

      const water = recon.data.items.find(i => i.energyType === EnergyType.Water);
      expect(water?.areaTotal).toBeCloseTo(50, 3);
      expect(water?.areaCost).toBeCloseTo(250, 2);

      const gas = recon.data.items.find(i => i.energyType === EnergyType.Gas);
      expect(gas?.areaTotal).toBeCloseTo(30, 3);
      expect(gas?.areaCost).toBeCloseTo(90, 2);
    });

    test('total cost equals sum of all energy type costs', () => {
      const recon = sdk.reconcileBill('A区', [elecDev, waterDev, gasDev], '2024-06-01T00:00:00Z', '2024-06-30T23:59:59Z');
      const sumAreaCost = recon.data.items.reduce((s: number, i) => s + i.areaCost, 0);
      expect(recon.data.totalAreaCost).toBeCloseTo(sumAreaCost, 2);
    });
  });
});
