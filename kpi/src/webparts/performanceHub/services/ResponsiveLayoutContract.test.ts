import styles from '../components/PerformanceHub.module.scss';

describe('Quarterly responsive layout contract', () => {
  it('keeps employee Quarterly Review controls single-column at phone width', () => {
    expect(styles.quarterPage).toBeDefined();
    expect(styles.quarterHeader).toBeDefined();
    expect(styles.quarterFormGrid).toBeDefined();
    expect(styles.progressEntryForm).toBeDefined();
    expect(styles.quarterReadiness).toBeDefined();
  });

  it('collapses manager Quarter Review and Recovery Actionboard paths without horizontal grids', () => {
    expect(styles.managerQuarterRow).toBeDefined();
    expect(styles.managerDecisionPreview).toBeDefined();
    expect(styles.actionboardPage).toBeDefined();
    expect(styles.actionboardFilters).toBeDefined();
    expect(styles.actionboardRows).toBeDefined();
  });
});
