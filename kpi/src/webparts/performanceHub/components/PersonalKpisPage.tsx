import * as React from 'react';
import type { IAnnualWorkplan, IPersonalWorkplanItem } from '../models/ProductionModels';
import type { IQuarterReviewItem } from '../models/QuarterlyModels';
import type { IImpactClassificationConfiguration } from '../services/PersonalWorkplanPolicy';
import styles from './PerformanceHub.module.scss';
import PersonalWorkplanPage from './PersonalWorkplanPage';

export interface IPersonalKpisPageProps {
  workplan: IAnnualWorkplan;
  items: IPersonalWorkplanItem[];
  quarterItems?: IQuarterReviewItem[];
  saving: boolean;
  message?: string;
  classificationConfiguration?: IImpactClassificationConfiguration;
  onSave(items: IPersonalWorkplanItem[]): Promise<void>;
  onSubmit?(): Promise<void>;
}

const resultValue = (value: number | undefined, text: string | undefined, unit: string | undefined): string => value !== undefined
  ? `${value}${unit ? ` ${unit}` : ''}`
  : text?.trim() || 'Not rated';

/**
 * Compatibility route for the employee harness. Annual editing is deliberately
 * delegated to the canonical slice-03 Impact editor; existing quarterly results
 * remain a read-only display and QTR-019 progress editing is not introduced here.
 */
const PersonalKpisPage: React.FC<IPersonalKpisPageProps> = ({
  workplan, items, quarterItems = [], saving, message, classificationConfiguration, onSave, onSubmit
}) => <>
  <PersonalWorkplanPage
    workplan={workplan}
    items={items}
    saving={saving}
    message={message}
    classificationConfiguration={classificationConfiguration}
    onSave={onSave}
    onSubmit={onSubmit}
  />
  {quarterItems.length > 0 && <section className={styles.personalPage} aria-labelledby="impact-quarter-readonly-heading">
    <div className={styles.coreHeader}>
      <div>
        <span className={styles.sectionLabel}>Existing quarterly readback</span>
        <h2 id="impact-quarter-readonly-heading">Impact results (read only)</h2>
        <p>Annual Impact definitions and classification stay separate from quarterly progress. This slice does not add or edit QTR-019 progress.</p>
      </div>
    </div>
    <div className={styles.personalList}>{items.filter(item => item.activeInWorkplan).map((item, index) => {
      const current = quarterItems.find(result => result.workplanItemKey === item.workplanItemKey && result.itemType === 'LocalPersonal');
      return <article key={item.workplanItemKey || index} className={styles.personalItem}>
        <div className={styles.personalItemHeader}><span>{item.wording}</span></div>
        <dl className={styles.currentKpiResult}>
          <div><dt>Current-quarter target</dt><dd>{resultValue(current?.quarterTargetValue, current?.quarterTargetText, current?.unitLabel || item.unitLabel)}</dd></div>
          <div><dt>Actual</dt><dd>{resultValue(current?.employeeActualValue, current?.employeeActualText, current?.unitLabel || item.unitLabel)}</dd></div>
          <div><dt>Progress</dt><dd>{current?.progressPct !== undefined ? `${current.progressPct}%` : 'Not rated'}</dd></div>
          <div><dt>Calculated RAG</dt><dd>{current?.calculatedRag || 'Not rated'}</dd></div>
          <div><dt>Forecast</dt><dd>{resultValue(current?.quarterEndForecastValue, current?.quarterEndForecastText, current?.unitLabel || item.unitLabel)}</dd></div>
        </dl>
      </article>;
    })}</div>
  </section>}
</>;

export default PersonalKpisPage;
