import {
  MeterReading,
  ManualCorrection,
  SDKResult,
  ReadingQuality,
  EnergyType,
  DeviceProfile,
} from '../types';
import { createSuccessResult, createErrorResult, generateId } from '../utils';

export interface BatchReadingResult {
  success: boolean;
  code?: string;
  message?: string;
  data?: MeterReading;
  index: number;
  originalInput: Omit<MeterReading, 'readingId' | 'quality'>;
}

export interface BatchReadingSummary {
  total: number;
  successCount: number;
  failedCount: number;
  results: BatchReadingResult[];
}

interface ReadingHistory {
  deviceId: string;
  readings: MeterReading[];
}

export class ReadingValidator {
  private readings: Map<string, MeterReading> = new Map();
  private corrections: Map<string, ManualCorrection> = new Map();
  private history: Map<string, ReadingHistory> = new Map();
  private deviceArchive: Map<string, DeviceProfile>;

  constructor(deviceArchive?: Map<string, DeviceProfile>) {
    this.deviceArchive = deviceArchive || new Map();
  }

  setDeviceArchive(deviceArchive: Map<string, DeviceProfile>): void {
    this.deviceArchive = deviceArchive;
  }

  submitReading(
    reading: Omit<MeterReading, 'readingId' | 'quality'>,
  ): SDKResult<MeterReading> {
    const validation = this.validateReadingInput(reading);
    if (validation) {
      return createErrorResult<MeterReading>(validation.code, validation.message);
    }

    const readingId = generateId('rdg');
    const quality = this.assessQualityByTimestamp(reading);
    const fullReading: MeterReading = {
      ...reading,
      readingId,
      quality,
    };

    this.readings.set(readingId, fullReading);
    this.appendHistorySorted(reading.deviceId, fullReading);

    return createSuccessResult(
      fullReading,
      quality === ReadingQuality.Good
        ? '读数提交成功'
        : `读数提交成功，但质量标记为: ${quality}`,
    );
  }

  submitBatch(
    readings: Omit<MeterReading, 'readingId' | 'quality'>[],
  ): SDKResult<BatchReadingSummary> {
    const results: BatchReadingResult[] = [];
    let successCount = 0;

    for (let i = 0; i < readings.length; i++) {
      const input = readings[i];
      try {
        const result = this.submitReading(input);
        if (result.success) {
          successCount++;
          results.push({
            success: true,
            data: result.data,
            index: i,
            originalInput: input,
          });
        } else {
          results.push({
            success: false,
            code: result.code,
            message: result.message,
            index: i,
            originalInput: input,
          });
        }
      } catch (err) {
        results.push({
          success: false,
          code: 'UNEXPECTED_ERROR',
          message: err instanceof Error ? err.message : '未知错误',
          index: i,
          originalInput: input,
        });
      }
    }

    const summary: BatchReadingSummary = {
      total: readings.length,
      successCount,
      failedCount: readings.length - successCount,
      results,
    };

    return createSuccessResult(
      summary,
      `批量提交完成，成功 ${successCount} 条，失败 ${readings.length - successCount} 条`,
    );
  }

  validateReading(
    readingId: string,
  ): SDKResult<{ valid: boolean; quality: ReadingQuality; issues: string[] }> {
    const reading = this.readings.get(readingId);
    if (!reading) {
      return createErrorResult('READING_NOT_FOUND', `读数未找到: ${readingId}`);
    }

    const issues: string[] = [];
    const previous = this.findPreviousByTimestamp(reading.deviceId, reading.timestamp);

    if (previous) {
      if (reading.value < previous.value) {
        issues.push(`读数倒转：当前值 ${reading.value} 小于上一读数 ${previous.value}`);
      }
      if (previous.value > 0) {
        const increaseRate = (reading.value - previous.value) / previous.value;
        if (increaseRate > 2) {
          issues.push(`读数突增：增幅 ${(increaseRate * 100).toFixed(1)}%，超出正常范围`);
        } else if (increaseRate < -0.5) {
          issues.push(`读数突降：降幅 ${(Math.abs(increaseRate) * 100).toFixed(1)}%，超出正常范围`);
        }
      }
      if (reading.value === previous.value) {
        issues.push(`读数重复：与上一读数 ${previous.value} 数值相同，可能存在设备故障或漏抄`);
      }
    }

    if (reading.value < 0) {
      issues.push('读数为负值');
    }

    return createSuccessResult({
      valid: issues.length === 0,
      quality: reading.quality || ReadingQuality.Good,
      issues,
    });
  }

  syncCorrection(
    correction: Omit<ManualCorrection, 'correctionId' | 'timestamp'>,
  ): SDKResult<ManualCorrection> {
    const reading = this.readings.get(correction.readingId);
    if (!reading) {
      return createErrorResult('READING_NOT_FOUND', `读数未找到: ${correction.readingId}`);
    }

    if (correction.deviceId !== reading.deviceId) {
      return createErrorResult(
        'DEVICE_MISMATCH',
        `修正记录设备ID不匹配：修正指定 ${correction.deviceId}，读数实际所属 ${reading.deviceId}`,
      );
    }

    if (correction.originalValue !== reading.value) {
      return createErrorResult(
        'ORIGINAL_VALUE_MISMATCH',
        `原始值不匹配：修正指定 ${correction.originalValue}，读数当前值 ${reading.value}`,
      );
    }

    if (correction.correctedValue === undefined || correction.correctedValue === null || Number.isNaN(correction.correctedValue)) {
      return createErrorResult('INVALID_VALUE', `无效的修正值: ${correction.correctedValue}`);
    }
    if (correction.correctedValue < 0) {
      return createErrorResult('INVALID_VALUE', `修正值不能为负数: ${correction.correctedValue}`);
    }

    const correctionId = generateId('cor');
    const fullCorrection: ManualCorrection = {
      ...correction,
      correctionId,
      timestamp: new Date().toISOString(),
    };

    const updatedReading: MeterReading = {
      ...reading,
      value: correction.correctedValue,
      quality: ReadingQuality.Corrected,
    };
    this.readings.set(correction.readingId, updatedReading);
    this.corrections.set(correctionId, fullCorrection);

    const deviceHistory = this.history.get(correction.deviceId);
    if (deviceHistory) {
      const idx = deviceHistory.readings.findIndex(r => r.readingId === correction.readingId);
      if (idx >= 0) {
        deviceHistory.readings[idx] = updatedReading;
      }
    }

    return createSuccessResult(fullCorrection, '修正记录同步成功');
  }

  getReading(readingId: string): SDKResult<MeterReading | null> {
    const reading = this.readings.get(readingId);
    if (!reading) {
      return createErrorResult('READING_NOT_FOUND', `读数未找到: ${readingId}`);
    }
    return createSuccessResult(reading);
  }

  getReadingsByDevice(
    deviceId: string,
    startTime?: string,
    endTime?: string,
  ): SDKResult<MeterReading[]> {
    const deviceHistory = this.history.get(deviceId);
    if (!deviceHistory) {
      return createSuccessResult([]);
    }

    let filtered = [...deviceHistory.readings];
    if (startTime) {
      const start = new Date(startTime).getTime();
      filtered = filtered.filter(r => new Date(r.timestamp).getTime() >= start);
    }
    if (endTime) {
      const end = new Date(endTime).getTime();
      filtered = filtered.filter(r => new Date(r.timestamp).getTime() <= end);
    }

    filtered.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return createSuccessResult(filtered);
  }

  getReadingsSorted(deviceIds: string[]): MeterReading[] {
    const all: MeterReading[] = [];
    for (const deviceId of deviceIds) {
      const deviceHistory = this.history.get(deviceId);
      if (deviceHistory) {
        all.push(...deviceHistory.readings);
      }
    }
    all.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return all;
  }

  getPreviousReading(deviceId: string, timestamp: string): MeterReading | null {
    return this.findPreviousByTimestamp(deviceId, timestamp);
  }

  computeConsumption(
    deviceId: string,
    startTime: string,
    endTime: string,
  ): { total: number; deltas: { reading: MeterReading; consumption: number }[] } {
    const deviceHistory = this.history.get(deviceId);
    if (!deviceHistory || deviceHistory.readings.length === 0) {
      return { total: 0, deltas: [] };
    }

    const sorted = [...deviceHistory.readings].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

    const startTs = new Date(startTime).getTime();
    const endTs = new Date(endTime).getTime();

    let baseline: MeterReading | null = null;
    for (const r of sorted) {
      const ts = new Date(r.timestamp).getTime();
      if (ts < startTs) {
        baseline = r;
      } else {
        break;
      }
    }

    const deltas: { reading: MeterReading; consumption: number }[] = [];
    let total = 0;
    let prev = baseline;

    for (const r of sorted) {
      const ts = new Date(r.timestamp).getTime();
      if (ts < startTs || ts > endTs) continue;

      if (prev && r.value >= prev.value) {
        const consumption = r.value - prev.value;
        total += consumption;
        deltas.push({ reading: r, consumption });
      }
      prev = r;
    }

    return { total, deltas };
  }

  computeAllDeltas(
    deviceIds: string[],
    startTime: string,
    endTime: string,
  ): {
    byDevice: Map<string, { total: number; unit: string; energyType: EnergyType }>;
    items: {
      reading: MeterReading;
      consumption: number;
      deviceId: string;
    }[];
  } {
    const byDevice = new Map<string, { total: number; unit: string; energyType: EnergyType }>();
    const items: {
      reading: MeterReading;
      consumption: number;
      deviceId: string;
    }[] = [];

    for (const deviceId of deviceIds) {
      const { total, deltas } = this.computeConsumption(deviceId, startTime, endTime);
      if (deltas.length > 0) {
        const firstReading = deltas[0].reading;
        byDevice.set(deviceId, {
          total,
          unit: firstReading.unit,
          energyType: firstReading.energyType,
        });
        for (const d of deltas) {
          items.push({
            reading: d.reading,
            consumption: d.consumption,
            deviceId,
          });
        }
      }
    }

    return { byDevice, items };
  }

  getCorrections(deviceId?: string): SDKResult<ManualCorrection[]> {
    const results: ManualCorrection[] = [];
    for (const correction of this.corrections.values()) {
      if (!deviceId || correction.deviceId === deviceId) {
        results.push(correction);
      }
    }
    return createSuccessResult(results);
  }

  private validateReadingInput(
    reading: Omit<MeterReading, 'readingId' | 'quality'>,
  ): { code: string; message: string } | null {
    if (!reading.deviceId) {
      return { code: 'INVALID_INPUT', message: '缺少 deviceId' };
    }
    if (!reading.energyType) {
      return { code: 'INVALID_INPUT', message: '缺少 energyType' };
    }
    if (reading.value === undefined || reading.value === null || Number.isNaN(reading.value)) {
      return { code: 'INVALID_VALUE', message: `无效的读数值: ${reading.value}` };
    }
    if (reading.value < 0) {
      return { code: 'INVALID_VALUE', message: `读数值不能为负数: ${reading.value}` };
    }
    if (!reading.timestamp) {
      return { code: 'INVALID_TIMESTAMP', message: '缺少 timestamp' };
    }
    const ts = new Date(reading.timestamp).getTime();
    if (Number.isNaN(ts)) {
      return { code: 'INVALID_TIMESTAMP', message: `无效的时间戳: ${reading.timestamp}` };
    }

    const device = this.deviceArchive.get(reading.deviceId);
    if (!device) {
      return {
        code: 'DEVICE_NOT_FOUND',
        message: `设备档案不存在: deviceId=${reading.deviceId}`,
      };
    }
    if (device.energyType !== reading.energyType) {
      return {
        code: 'ENERGY_TYPE_MISMATCH',
        message: `能源类型不匹配：设备档案为 ${device.energyType}，读数提交为 ${reading.energyType}`,
      };
    }

    return null;
  }

  private findPreviousByTimestamp(
    deviceId: string,
    timestamp: string,
  ): MeterReading | null {
    const deviceHistory = this.history.get(deviceId);
    if (!deviceHistory || deviceHistory.readings.length === 0) {
      return null;
    }

    const targetTs = new Date(timestamp).getTime();
    const sorted = [...deviceHistory.readings].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

    let previous: MeterReading | null = null;
    for (const r of sorted) {
      const ts = new Date(r.timestamp).getTime();
      if (ts < targetTs) {
        previous = r;
      } else {
        break;
      }
    }
    return previous;
  }

  private assessQualityByTimestamp(
    reading: Omit<MeterReading, 'readingId' | 'quality'>,
  ): ReadingQuality {
    if (reading.value < 0) {
      return ReadingQuality.Bad;
    }

    const previous = this.findPreviousByTimestamp(reading.deviceId, reading.timestamp);
    if (previous) {
      if (reading.value < previous.value) {
        return ReadingQuality.Suspect;
      }
      if (previous.value > 0) {
        const increaseRate = Math.abs(reading.value - previous.value) / previous.value;
        if (increaseRate > 2) {
          return ReadingQuality.Suspect;
        }
      }
    }

    return ReadingQuality.Good;
  }

  private appendHistorySorted(deviceId: string, reading: MeterReading): void {
    if (!this.history.has(deviceId)) {
      this.history.set(deviceId, { deviceId, readings: [] });
    }
    const history = this.history.get(deviceId)!;
    history.readings.push(reading);
    history.readings.sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
  }
}
