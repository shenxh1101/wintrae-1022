import { SmartEnergySDK } from './index';
import { EnergyType, DeviceStatus, AnomalyType, AlertLevel, TimePeriod, AggregationType, ReadingQuality } from './types';

describe('SmartEnergySDK Integration', () => {
  let sdk: SmartEnergySDK;

  beforeEach(() => {
    sdk = new SmartEnergySDK();
  });

  describe('Device Management', () => {
    test('should register and query a device', () => {
      const result = sdk.registerDevice({
        name: '空调-1F-A区',
        energyType: EnergyType.Electricity,
        area: 'A区',
        floor: '1F',
        building: '主楼',
        ratedPower: 5000,
        installDate: '2024-01-15',
        meterId: 'METER-001',
      });

      expect(result.success).toBe(true);
      expect(result.data.name).toBe('空调-1F-A区');
      expect(result.data.energyType).toBe(EnergyType.Electricity);
      expect(result.data.status).toBe(DeviceStatus.Online);
      expect(result.data.deviceId).toBeTruthy();

      const query = sdk.queryDevice(result.data.deviceId);
      expect(query.success).toBe(true);
      expect(query.data!.name).toBe('空调-1F-A区');
    });

    test('should query devices by area', () => {
      sdk.registerDevice({
        name: '空调-1F-A区',
        energyType: EnergyType.Electricity,
        area: 'A区',
        floor: '1F',
        building: '主楼',
        ratedPower: 5000,
        installDate: '2024-01-15',
        meterId: 'METER-001',
      });
      sdk.registerDevice({
        name: '照明-1F-A区',
        energyType: EnergyType.Electricity,
        area: 'A区',
        floor: '1F',
        building: '主楼',
        ratedPower: 2000,
        installDate: '2024-01-15',
        meterId: 'METER-002',
      });
      sdk.registerDevice({
        name: '水泵-2F-B区',
        energyType: EnergyType.Water,
        area: 'B区',
        floor: '2F',
        building: '副楼',
        ratedPower: 3000,
        installDate: '2024-02-01',
        meterId: 'METER-003',
      });

      const areaA = sdk.queryDevicesByArea('A区');
      expect(areaA.success).toBe(true);
      expect(areaA.data).toHaveLength(2);

      const areaB = sdk.queryDevicesByArea('B区');
      expect(areaB.data).toHaveLength(1);
    });

    test('should update device', () => {
      const reg = sdk.registerDevice({
        name: '旧名称',
        energyType: EnergyType.Electricity,
        area: 'A区',
        floor: '1F',
        building: '主楼',
        ratedPower: 5000,
        installDate: '2024-01-15',
        meterId: 'METER-001',
      });

      const updated = sdk.updateDevice(reg.data.deviceId, { name: '新名称', ratedPower: 6000 });
      expect(updated.success).toBe(true);
      expect(updated.data.name).toBe('新名称');
      expect(updated.data.ratedPower).toBe(6000);
    });

    test('should delete device', () => {
      const reg = sdk.registerDevice({
        name: '待删除设备',
        energyType: EnergyType.Electricity,
        area: 'A区',
        floor: '1F',
        building: '主楼',
        ratedPower: 5000,
        installDate: '2024-01-15',
        meterId: 'METER-001',
      });

      const del = sdk.deleteDevice(reg.data.deviceId);
      expect(del.success).toBe(true);

      const query = sdk.queryDevice(reg.data.deviceId);
      expect(query.success).toBe(false);
    });

    test('should list all devices', () => {
      sdk.registerDevice({
        name: '设备1',
        energyType: EnergyType.Electricity,
        area: 'A区',
        floor: '1F',
        building: '主楼',
        ratedPower: 5000,
        installDate: '2024-01-15',
        meterId: 'METER-001',
      });
      sdk.registerDevice({
        name: '设备2',
        energyType: EnergyType.Water,
        area: 'B区',
        floor: '2F',
        building: '主楼',
        ratedPower: 3000,
        installDate: '2024-02-01',
        meterId: 'METER-002',
      });

      const all = sdk.listDevices();
      expect(all.success).toBe(true);
      expect(all.data).toHaveLength(2);
    });
  });

  describe('Reading Submission & Validation', () => {
    let deviceId: string;

    beforeEach(() => {
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
      deviceId = reg.data.deviceId;
    });

    test('should submit a reading', () => {
      const result = sdk.submitReading({
        deviceId,
        energyType: EnergyType.Electricity,
        value: 1250.5,
        unit: 'kWh',
        timestamp: '2024-06-01T10:00:00Z',
      });

      expect(result.success).toBe(true);
      expect(result.data.value).toBe(1250.5);
      expect(result.data.quality).toBe(ReadingQuality.Good);
      expect(result.data.readingId).toBeTruthy();
    });

    test('should submit batch readings', () => {
      const result = sdk.submitReadings([
        {
          deviceId,
          energyType: EnergyType.Electricity,
          value: 100,
          unit: 'kWh',
          timestamp: '2024-06-01T10:00:00Z',
        },
        {
          deviceId,
          energyType: EnergyType.Electricity,
          value: 120,
          unit: 'kWh',
          timestamp: '2024-06-02T10:00:00Z',
        },
      ]);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });

    test('should detect negative reading as bad quality', () => {
      const result = sdk.submitReading({
        deviceId,
        energyType: EnergyType.Electricity,
        value: -50,
        unit: 'kWh',
        timestamp: '2024-06-01T10:00:00Z',
      });

      expect(result.success).toBe(true);
      expect(result.data.quality).toBe(ReadingQuality.Bad);
    });

    test('should detect reading less than previous as suspect', () => {
      sdk.submitReading({
        deviceId,
        energyType: EnergyType.Electricity,
        value: 500,
        unit: 'kWh',
        timestamp: '2024-06-01T10:00:00Z',
      });

      const result = sdk.submitReading({
        deviceId,
        energyType: EnergyType.Electricity,
        value: 200,
        unit: 'kWh',
        timestamp: '2024-06-02T10:00:00Z',
      });

      expect(result.data.quality).toBe(ReadingQuality.Suspect);
    });

    test('should validate reading and find issues', () => {
      const r1 = sdk.submitReading({
        deviceId,
        energyType: EnergyType.Electricity,
        value: 100,
        unit: 'kWh',
        timestamp: '2024-06-01T10:00:00Z',
      });

      const r2 = sdk.submitReading({
        deviceId,
        energyType: EnergyType.Electricity,
        value: 50,
        unit: 'kWh',
        timestamp: '2024-06-02T10:00:00Z',
      });

      const validation = sdk.validateReading(r2.data.readingId);
      expect(validation.success).toBe(true);
      expect(validation.data.valid).toBe(false);
      expect(validation.data.issues.length).toBeGreaterThan(0);
    });

    test('should sync manual correction', () => {
      const reading = sdk.submitReading({
        deviceId,
        energyType: EnergyType.Electricity,
        value: 100,
        unit: 'kWh',
        timestamp: '2024-06-01T10:00:00Z',
      });

      const correction = sdk.syncCorrection({
        readingId: reading.data.readingId,
        deviceId,
        originalValue: 100,
        correctedValue: 95,
        reason: '抄表员录入错误',
        operator: '张三',
      });

      expect(correction.success).toBe(true);
      expect(correction.data.correctedValue).toBe(95);
      expect(correction.data.reason).toBe('抄表员录入错误');

      const updatedReading = sdk.getReadingsByDevice(deviceId);
      const corrected = updatedReading.data!.find((r: { readingId: string }) => r.readingId === reading.data.readingId);
      expect(corrected!.value).toBe(95);
      expect(corrected!.quality).toBe(ReadingQuality.Corrected);
    });

    test('should get readings by device with time range', () => {
      sdk.submitReading({
        deviceId,
        energyType: EnergyType.Electricity,
        value: 100,
        unit: 'kWh',
        timestamp: '2024-06-01T10:00:00Z',
      });
      sdk.submitReading({
        deviceId,
        energyType: EnergyType.Electricity,
        value: 120,
        unit: 'kWh',
        timestamp: '2024-06-15T10:00:00Z',
      });
      sdk.submitReading({
        deviceId,
        energyType: EnergyType.Electricity,
        value: 150,
        unit: 'kWh',
        timestamp: '2024-06-30T10:00:00Z',
      });

      const result = sdk.getReadingsByDevice(deviceId, '2024-06-10T00:00:00Z', '2024-06-20T00:00:00Z');
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].value).toBe(120);
    });
  });

  describe('Energy Statistics', () => {
    let deviceIds: string[];

    beforeEach(() => {
      const d1 = sdk.registerDevice({
        name: '空调-A区',
        energyType: EnergyType.Electricity,
        area: 'A区',
        floor: '1F',
        building: '主楼',
        ratedPower: 5000,
        installDate: '2024-01-15',
        meterId: 'METER-001',
      });
      const d2 = sdk.registerDevice({
        name: '水泵-A区',
        energyType: EnergyType.Water,
        area: 'A区',
        floor: '1F',
        building: '主楼',
        ratedPower: 3000,
        installDate: '2024-01-15',
        meterId: 'METER-002',
      });

      deviceIds = [d1.data.deviceId, d2.data.deviceId];

      for (let day = 1; day <= 30; day++) {
        const dateStr = `2024-06-${String(day).padStart(2, '0')}T10:00:00Z`;
        sdk.submitReading({
          deviceId: d1.data.deviceId,
          energyType: EnergyType.Electricity,
          value: 100 + Math.random() * 50,
          unit: 'kWh',
          timestamp: dateStr,
        });
        sdk.submitReading({
          deviceId: d2.data.deviceId,
          energyType: EnergyType.Water,
          value: 50 + Math.random() * 20,
          unit: 't',
          timestamp: dateStr,
        });
      }
    });

    test('should query area consumption', () => {
      const result = sdk.queryAreaConsumption('A区', deviceIds, '2024-06-01T00:00:00Z', '2024-06-30T23:59:59Z');
      expect(result.success).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.data.some((c: {energyType: EnergyType}) => c.energyType === EnergyType.Electricity)).toBe(true);
      expect(result.data.some((c: {energyType: EnergyType}) => c.energyType === EnergyType.Water)).toBe(true);
    });

    test('should get trend analysis', () => {
      const result = sdk.getTrend(
        [deviceIds[0]],
        EnergyType.Electricity,
        AggregationType.Day,
        '2024-06-01T00:00:00Z',
        '2024-06-30T23:59:59Z',
        'A区',
      );
      expect(result.success).toBe(true);
      expect(result.data.points.length).toBeGreaterThan(0);
      expect(result.data.aggregationType).toBe(AggregationType.Day);
    });

    test('should get multi-energy trend', () => {
      const result = sdk.getMultiEnergyTrend(
        deviceIds,
        AggregationType.Month,
        '2024-06-01T00:00:00Z',
        '2024-06-30T23:59:59Z',
        'A区',
      );
      expect(result.success).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
    });
  });

  describe('Peak Valley Calculation', () => {
    let deviceId: string;

    beforeEach(() => {
      const reg = sdk.registerDevice({
        name: '空调-A区',
        energyType: EnergyType.Electricity,
        area: 'A区',
        floor: '1F',
        building: '主楼',
        ratedPower: 5000,
        installDate: '2024-01-15',
        meterId: 'METER-001',
      });
      deviceId = reg.data.deviceId;
    });

    test('should determine peak period', () => {
      const result = sdk.getPeakValleyConfig(EnergyType.Electricity);
      expect(result).toBeTruthy();
      expect(result!.periods.length).toBeGreaterThan(0);
    });

    test('should calculate peak valley fee', () => {
      sdk.submitReading({
        deviceId,
        energyType: EnergyType.Electricity,
        value: 100,
        unit: 'kWh',
        timestamp: '2024-06-01T09:00:00Z',
      });
      sdk.submitReading({
        deviceId,
        energyType: EnergyType.Electricity,
        value: 80,
        unit: 'kWh',
        timestamp: '2024-06-01T23:00:00Z',
      });

      const readings = sdk.getReadingsByDevice(deviceId);
      const feeResult = sdk.calculatePeakValleyFee(EnergyType.Electricity, readings.data);
      expect(feeResult.success).toBe(true);
      expect(feeResult.data.length).toBeGreaterThan(0);

      const totalCost = feeResult.data.reduce((sum: number, item: {cost: number}) => sum + item.cost, 0);
      expect(totalCost).toBeGreaterThan(0);
    });

    test('should generate bill', () => {
      sdk.submitReading({
        deviceId,
        energyType: EnergyType.Electricity,
        value: 200,
        unit: 'kWh',
        timestamp: '2024-06-01T10:00:00Z',
      });

      const bill = sdk.generateBill('A区', [deviceId], '2024-06-01T00:00:00Z', '2024-06-30T23:59:59Z');
      expect(bill.success).toBe(true);
      expect(bill.data.area).toBe('A区');
      expect(bill.data.totalCost).toBeGreaterThan(0);
      expect(bill.data.items.length).toBeGreaterThan(0);
    });
  });

  describe('Anomaly Detection', () => {
    let deviceId: string;

    beforeEach(() => {
      const reg = sdk.registerDevice({
        name: '空调-A区',
        energyType: EnergyType.Electricity,
        area: 'A区',
        floor: '1F',
        building: '主楼',
        ratedPower: 5000,
        installDate: '2024-01-15',
        meterId: 'METER-001',
      });
      deviceId = reg.data.deviceId;
    });

    test('should detect anomalies from readings', () => {
      for (let i = 1; i <= 10; i++) {
        sdk.submitReading({
          deviceId,
          energyType: EnergyType.Electricity,
          value: 100 + Math.random() * 10,
          unit: 'kWh',
          timestamp: `2024-06-${String(i).padStart(2, '0')}T10:00:00Z`,
        });
      }

      sdk.submitReading({
        deviceId,
        energyType: EnergyType.Electricity,
        value: 500,
        unit: 'kWh',
        timestamp: '2024-06-11T10:00:00Z',
      });

      const anomalies = sdk.detectAnomalies([deviceId], '2024-06-01T00:00:00Z', '2024-06-30T23:59:59Z');
      expect(anomalies.success).toBe(true);
    });

    test('should detect sudden change', () => {
      const r1 = sdk.submitReading({
        deviceId,
        energyType: EnergyType.Electricity,
        value: 100,
        unit: 'kWh',
        timestamp: '2024-06-01T10:00:00Z',
      });

      const r2 = sdk.submitReading({
        deviceId,
        energyType: EnergyType.Electricity,
        value: 300,
        unit: 'kWh',
        timestamp: '2024-06-02T10:00:00Z',
      });

      const result = sdk.detectSuddenChange(r2.data.readingId);
      expect(result.success).toBe(true);
      if (result.data) {
        expect([AnomalyType.SuddenIncrease, AnomalyType.SuddenDecrease]).toContain(result.data.anomalyType);
      }
    });

    test('should add and check alert rules', () => {
      const rule = sdk.addAlertRule({
        name: '功率超限',
        energyType: EnergyType.Electricity,
        metric: 'value',
        operator: 'gt',
        threshold: 1000,
        level: AlertLevel.Critical,
        enabled: true,
      });

      expect(rule.success).toBe(true);

      const rules = sdk.getAlertRules();
      expect(rules.success).toBe(true);
      expect(rules.data.length).toBeGreaterThan(0);
    });

    test('should get over limit alerts', () => {
      const overLimitAlerts = sdk.getOverLimitAlerts();
      expect(overLimitAlerts.success).toBe(true);
    });
  });

  describe('Energy Advisor', () => {
    let deviceId: string;

    beforeEach(() => {
      const reg = sdk.registerDevice({
        name: '空调-A区',
        energyType: EnergyType.Electricity,
        area: 'A区',
        floor: '1F',
        building: '主楼',
        ratedPower: 5000,
        installDate: '2024-01-15',
        meterId: 'METER-001',
      });
      deviceId = reg.data.deviceId;

      for (let i = 1; i <= 30; i++) {
        sdk.submitReading({
          deviceId,
          energyType: EnergyType.Electricity,
          value: 100 + Math.random() * 50,
          unit: 'kWh',
          timestamp: `2024-06-${String(i).padStart(2, '0')}T10:00:00Z`,
        });
      }
    });

    test('should generate efficiency ranking', () => {
      const result = sdk.getEfficiencyRanking([deviceId]);
      expect(result.success).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.data[0].deviceId).toBe(deviceId);
      expect(result.data[0].rank).toBe(1);
    });

    test('should generate saving suggestions', () => {
      const result = sdk.getSavingSuggestions([deviceId], 'summer');
      expect(result.success).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.data.some((s: {category: string}) => s.category === '空调优化')).toBe(true);
    });

    test('should generate bill summary', () => {
      const bill = sdk.generateBill('A区', [deviceId], '2024-06-01T00:00:00Z', '2024-06-30T23:59:59Z');
      expect(bill.success).toBe(true);

      const summary = sdk.getBillSummary([bill.data]);
      expect(summary.success).toBe(true);
      expect(summary.data.totalCost).toBeGreaterThan(0);
    });
  });

  describe('SDK Result Format', () => {
    test('all results should have unified format', () => {
      const result = sdk.registerDevice({
        name: '测试设备',
        energyType: EnergyType.Electricity,
        area: 'A区',
        floor: '1F',
        building: '主楼',
        ratedPower: 5000,
        installDate: '2024-01-15',
        meterId: 'METER-001',
      });

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('code');
      expect(result).toHaveProperty('message');
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('timestamp');
      expect(typeof result.timestamp).toBe('string');
    });

    test('error result should have error code and message', () => {
      const result = sdk.queryDevice('non-existent-id');
      expect(result.success).toBe(false);
      expect(result.code).toBe('DEVICE_NOT_FOUND');
      expect(result.message).toBeTruthy();
    });
  });
});
