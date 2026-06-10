import {
  DeviceProfile,
  SDKResult,
  EnergyType,
  DeviceStatus,
} from '../types';
import { createSuccessResult, createErrorResult, generateId } from '../utils';

export class DeviceArchive {
  private devices: Map<string, DeviceProfile> = new Map();

  register(device: Omit<DeviceProfile, 'deviceId' | 'status'>): SDKResult<DeviceProfile> {
    const deviceId = generateId('dev');
    const profile: DeviceProfile = {
      ...device,
      deviceId,
      status: DeviceStatus.Online,
    };
    this.devices.set(deviceId, profile);
    return createSuccessResult(profile, '设备注册成功');
  }

  query(deviceId: string): SDKResult<DeviceProfile | null> {
    const device = this.devices.get(deviceId);
    if (!device) {
      return createErrorResult('DEVICE_NOT_FOUND', `设备未找到: ${deviceId}`);
    }
    return createSuccessResult(device);
  }

  queryByArea(area: string): SDKResult<DeviceProfile[]> {
    const results: DeviceProfile[] = [];
    for (const device of this.devices.values()) {
      if (device.area === area) {
        results.push(device);
      }
    }
    return createSuccessResult(results);
  }

  queryByEnergyType(energyType: EnergyType): SDKResult<DeviceProfile[]> {
    const results: DeviceProfile[] = [];
    for (const device of this.devices.values()) {
      if (device.energyType === energyType) {
        results.push(device);
      }
    }
    return createSuccessResult(results);
  }

  queryByBuilding(building: string): SDKResult<DeviceProfile[]> {
    const results: DeviceProfile[] = [];
    for (const device of this.devices.values()) {
      if (device.building === building) {
        results.push(device);
      }
    }
    return createSuccessResult(results);
  }

  update(deviceId: string, updates: Partial<Omit<DeviceProfile, 'deviceId'>>): SDKResult<DeviceProfile> {
    const device = this.devices.get(deviceId);
    if (!device) {
      return createErrorResult('DEVICE_NOT_FOUND', `设备未找到: ${deviceId}`);
    }
    const updated: DeviceProfile = { ...device, ...updates, deviceId };
    this.devices.set(deviceId, updated);
    return createSuccessResult(updated, '设备更新成功');
  }

  delete(deviceId: string): SDKResult<boolean> {
    if (!this.devices.has(deviceId)) {
      return createErrorResult('DEVICE_NOT_FOUND', `设备未找到: ${deviceId}`);
    }
    this.devices.delete(deviceId);
    return createSuccessResult(true, '设备删除成功');
  }

  listAll(): SDKResult<DeviceProfile[]> {
    return createSuccessResult(Array.from(this.devices.values()));
  }

  count(): number {
    return this.devices.size;
  }
}
