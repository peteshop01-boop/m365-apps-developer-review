export type HubRoute = 'home' | 'expenses' | 'mileage' | 'review' | 'team' | 'manager' | 'finance' | 'nominals' | 'help' | 'profile' | 'admin';
export interface IRouteDefinition {
  readonly id: HubRoute;
  readonly label: string;
  readonly shortLabel: string;
  readonly icon: string;
  readonly restricted?: string;
  readonly sprint?: string;
}
export const routes: ReadonlyArray<IRouteDefinition> = [
  { id: 'home', label: 'Home / My Claims', shortLabel: 'Home', icon: 'home' },
  { id: 'expenses', label: 'Expenses', shortLabel: 'Expenses', icon: 'receipt' },
  { id: 'mileage', label: 'Mileage', shortLabel: 'Mileage', icon: 'route', sprint: 'D03' },
  { id: 'review', label: 'Review Claim', shortLabel: 'Review', icon: 'check', sprint: 'D04' },
  { id: 'team', label: 'My Team', shortLabel: 'My Team', icon: 'users', restricted: 'Manager', sprint: 'D05' },
  { id: 'manager', label: 'Manager Review', shortLabel: 'Manager', icon: 'review', restricted: 'Manager', sprint: 'D05' },
  { id: 'finance', label: 'Finance', shortLabel: 'Finance', icon: 'finance', restricted: 'Finance', sprint: 'D06' },
  { id: 'nominals', label: 'Nominal Directory', shortLabel: 'Nominals', icon: 'book' },
  { id: 'help', label: 'Help', shortLabel: 'Help', icon: 'help' },
  { id: 'profile', label: 'Profile', shortLabel: 'Profile', icon: 'profile', sprint: 'D07' },
  { id: 'admin', label: 'Admin', shortLabel: 'Admin', icon: 'settings', restricted: 'Admin', sprint: 'D07' }
];
