import * as React from 'react';
import type { ProductionSection } from '../models/ProductionModels';
import styles from './PerformanceHub.module.scss';

interface INavigationItem {
  key: ProductionSection;
  label: string;
  shortLabel: string;
}

const items: INavigationItem[] = [
  { key: 'overview', label: 'Overview', shortLabel: '01' },
  { key: 'core', label: 'Core Strategy KPIs', shortLabel: '02' },
  { key: 'personal', label: 'Impact KPIs', shortLabel: '03' },
  { key: 'behaviours', label: 'Behaviours', shortLabel: '04' },
  { key: 'quarterly', label: 'Quarterly Review', shortLabel: '05' }
];

const managerItem: INavigationItem = { key: 'manager', label: 'Manager Review', shortLabel: 'M' };
const recoveryItem: INavigationItem = { key: 'recovery', label: 'Recovery', shortLabel: 'R' };
const reportingItem: INavigationItem = { key: 'reporting', label: 'Reporting', shortLabel: 'RP' };
const adminItem: INavigationItem = { key: 'admin', label: 'Administration', shortLabel: 'A' };
const adminReportingItem: INavigationItem = { key: 'adminReporting', label: 'Reporting Control', shortLabel: 'RC' };
const strategicCoverageItem: INavigationItem = { key: 'strategicCoverage', label: 'Strategic Core Coverage', shortLabel: 'SC' };
const dataQualityItem: INavigationItem = { key: 'dataQuality', label: 'Data Quality', shortLabel: 'DQ' };
const behaviourAdminItem: INavigationItem = { key: 'behaviourAdmin', label: 'Behaviour Library', shortLabel: 'BL' };

export interface IProductionNavigationProps {
  activeSection: ProductionSection;
  showManager: boolean;
  showRecovery: boolean;
  showAdmin: boolean;
  showDataQuality: boolean;
  showBehaviourAdmin: boolean;
  onChange: (section: ProductionSection) => void;
}

const ProductionNavigation: React.FC<IProductionNavigationProps> = ({ activeSection, showManager, showRecovery, showAdmin, showDataQuality, showBehaviourAdmin, onChange }) => (
  <nav className={styles.productionNav} aria-label="Performance Hub sections">
    <div className={styles.navInner}>
      {[
        ...items,
        ...(showManager ? [managerItem] : []),
        ...(showRecovery ? [recoveryItem] : []),
        reportingItem,
        ...(showAdmin ? [adminItem] : []),
        ...(showAdmin ? [adminReportingItem] : []),
        ...(showAdmin ? [strategicCoverageItem] : []),
        ...(showDataQuality ? [dataQualityItem] : []),
        ...(showBehaviourAdmin ? [behaviourAdminItem] : [])
      ].map(item => (
        <button
          key={item.key}
          type="button"
          className={activeSection === item.key ? styles.activeNavItem : styles.navItem}
          aria-current={activeSection === item.key ? 'page' : undefined}
          onClick={() => onChange(item.key)}
        >
          <span aria-hidden="true">{item.shortLabel}</span>
          <strong>{item.label}</strong>
        </button>
      ))}
    </div>
  </nav>
);

export default ProductionNavigation;
