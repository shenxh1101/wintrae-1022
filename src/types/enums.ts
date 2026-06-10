export enum EnergyType {
  Electricity = 'electricity',
  Water = 'water',
  Gas = 'gas',
  Heat = 'heat',
}

export enum TimePeriod {
  Peak = 'peak',
  Valley = 'valley',
  Flat = 'flat',
}

export enum AggregationType {
  Day = 'day',
  Month = 'month',
  Year = 'year',
}

export enum AnomalyType {
  SuddenIncrease = 'sudden_increase',
  SuddenDecrease = 'sudden_decrease',
  OverLimit = 'over_limit',
  ReadingError = 'reading_error',
}

export enum AlertLevel {
  Info = 'info',
  Warning = 'warning',
  Critical = 'critical',
}

export enum DeviceStatus {
  Online = 'online',
  Offline = 'offline',
  Maintenance = 'maintenance',
  Fault = 'fault',
}
