export type OrdersHubView = 'orders' | 'preparation' | 'dispatch';

export interface PickingSectionAccess {
  hasPickingFeature: boolean;
  hasPickingPermission: boolean;
  hasTasksFeature?: boolean;
  hasTasksViewAllPermission?: boolean;
}

export function canAccessPickingSection(access: PickingSectionAccess): boolean {
  return access.hasPickingFeature && access.hasPickingPermission;
}

export function canAccessDispatchSection(access: PickingSectionAccess): boolean {
  return access.hasTasksFeature === true && access.hasTasksViewAllPermission === true;
}

export function resolveOrdersHubView(
  requestedView: string | null,
  access: PickingSectionAccess,
): OrdersHubView {
  if (requestedView === 'dispatch' && canAccessDispatchSection(access)) {
    return 'dispatch';
  }
  return requestedView === 'preparation' && canAccessPickingSection(access)
    ? 'preparation'
    : 'orders';
}
