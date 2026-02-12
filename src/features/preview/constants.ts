export type DeviceSize = 'mobile' | 'tablet' | 'desktop';

export const DEVICE_WIDTHS: Record<DeviceSize, string> = {
  mobile: '375px',
  tablet: '768px',
  desktop: '100%',
};
