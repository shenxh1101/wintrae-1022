import {
  MeterReading,
  ManualCorrection,
  SDKResult,
  ReadingQuality,
} from '../types';
import { createSuccessResult, createErrorResult, generateId } from '../utils';

interface ReadingHistory {
  deviceId: string;
  readings: MeterReading[];
}

export class ReadingValidator {
  private readings: Map<string, MeterReading> = new Map();
  private corrections: Map<string, ManualCorrection> = new Map();
  private history: Map<string, ReadingHistory> = new Map();

  submitReading(reading: Omit<MeterReading, 'readingId' | 'quality'>): SDKResult<MeterReading> {
    const readingId = generateId('rdg');
    const quality = this.assessQuality(reading);
    const fullReading: MeterReading = {
      ...reading,
      readingId,
      quality,
    };

    this.readings.set(readingId, fullReading);
    this.appendHistory(reading.deviceId, fullReading);

    return createSuccessResult(fullReading, quality === ReadingQuality.Good
      ? '读数提交成功'
      : `读数提交成功，但质量标记为: ${quality}`);
  }

  submitBatch(readings: Omit<MeterReading, 'readingId' | 'quality'>[]): SDKResult<MeterReading[]> {
    const results: MeterReading[] = [];
    for (const reading of readings) {
      const result = this.submitReading(reading);
      if (!result.success) {
        return createErrorResult('BATCH_SUBMIT_FAILED', `批量提交失败，设备: ${reading.deviceId}`);
      }
      results.push(result.data);
    }
    return createSuccessResult(results, `批量提交成功，共 ${results.length} 条`);
  }

  validateReading(readingId: string): SDKResult<{
    valid: boolean;
    quality: ReadingQuality;
    issues: string[];
  }> {
    const reading = this.readings.get(readingId);
    if (!reading) {
      return createErrorResult('READING_NOT_FOUND', `读数未找到: ${readingId}`);
    }

    const issues: string[] = [];
    const deviceHistory = this.history.get(reading.deviceId);
    if (deviceHistory && deviceHistory.readings.length > 1) {
      const sorted = [...deviceHistory.readings].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );
      const lastReading = sorted[sorted.length - 2];
      if (lastReading) {
        if (reading.value < lastReading.value) {
          issues.push('当前读数小于上次读数，可能存在倒转');
        }
        const increaseRate = (reading.value - lastReading.value) / lastReading.value;
        if (increaseRate > 2) {
          issues.push(`读数增幅 ${(increaseRate * 100).toFixed(1)}%，超出正常范围`);
        }
        if (reading.value === lastReading.value) {
          issues.push('当前读数与上次相同，可能存在设备故障');
        }
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

  syncCorrection(correction: Omit<ManualCorrection, 'correctionId' | 'timestamp'>): SDKResult<ManualCorrection> {
    const reading = this.readings.get(correction.readingId);
    if (!reading) {
      return createErrorResult('READING_NOT_FOUND', `读数未找到: ${correction.readingId}`);
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

  getReadingsByDevice(deviceId: string, startTime?: string, endTime?: string): SDKResult<MeterReading[]> {
    const deviceHistory = this.history.get(deviceId);
    if (!deviceHistory) {
      return createSuccessResult([]);
    }

    let filtered = deviceHistory.readings;
    if (startTime) {
      const start = new Date(startTime).getTime();
      filtered = filtered.filter(r => new Date(r.timestamp).getTime() >= start);
    }
    if (endTime) {
      const end = new Date(endTime).getTime();
      filtered = filtered.filter(r => new Date(r.timestamp).getTime() <= end);
    }

    return createSuccessResult(filtered);
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

  private assessQuality(reading: Omit<MeterReading, 'readingId' | 'quality'>): ReadingQuality {
    if (reading.value < 0) {
      return ReadingQuality.Bad;
    }
    const deviceHistory = this.history.get(reading.deviceId);
    if (deviceHistory && deviceHistory.readings.length > 0) {
      const sorted = [...deviceHistory.readings].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      );
      const lastReading = sorted[0];
      if (lastReading) {
        if (reading.value < lastReading.value) {
          return ReadingQuality.Suspect;
        }
        const increaseRate = Math.abs((reading.value - lastReading.value) / lastReading.value);
        if (increaseRate > 2) {
          return ReadingQuality.Suspect;
        }
      }
    }
    return ReadingQuality.Good;
  }

  private appendHistory(deviceId: string, reading: MeterReading): void {
    if (!this.history.has(deviceId)) {
      this.history.set(deviceId, { deviceId, readings: [] });
    }
    this.history.get(deviceId)!.readings.push(reading);
  }
}
