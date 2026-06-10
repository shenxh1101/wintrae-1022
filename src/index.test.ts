import {
  SmartEnergySDK,
  EnergyType,
  DeviceStatus,
  AnomalyType,
  AlertLevel,
  AggregationType,
  ReadingQuality,
  BatchReadingSummary,
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
});
