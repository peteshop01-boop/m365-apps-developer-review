export type AdminPeopleMutation = 'Add' | 'Deactivate';

export const ADMIN_PEOPLE_UPDATE_UNAVAILABLE = 'People changes are unavailable until the governed update route is verified.';

/** Presentation capability only. There is deliberately no executor or callback. */
export const getAdminPeopleMutationAdmission = (_operation: AdminPeopleMutation): {
  status: 'NotAdmitted'; enabled: false; message: string;
} => ({ status: 'NotAdmitted', enabled: false, message: ADMIN_PEOPLE_UPDATE_UNAVAILABLE });
