import {
  SEC006_PRIVATE_ROOTS,
  assertSec006AclPlan,
  buildSec006AclPlan,
  type ISec006AclPerson,
  type ISec006Delegation
} from './Sec006AclPlan';

const asOf = '2026-11-01T12:00:00Z';
const automation = 'a1.synthetic.noninteractive@example.invalid';
const people: ISec006AclPerson[] = [
  { personKey: 'E1', email: 'e1@example.invalid', active: true, managerPersonKey: 'M1', appRoles: ['Employee'] },
  { personKey: 'E2', email: 'e2@example.invalid', active: true, managerPersonKey: 'M2', appRoles: ['Employee'] },
  { personKey: 'M1', email: 'm1@example.invalid', active: true, appRoles: ['Employee', 'Manager'] },
  { personKey: 'M2', email: 'm2@example.invalid', active: true, appRoles: ['Employee', 'Manager'] },
  { personKey: 'D1', email: 'd1@example.invalid', active: true, appRoles: ['DelegatedManager'] },
  { personKey: 'BA1', email: 'ba1@example.invalid', active: true, appRoles: ['BusinessAdmin'] },
  { personKey: 'SA1', email: 'sa1@example.invalid', active: true, appRoles: ['SystemAdmin'] }
];
const delegations: ISec006Delegation[] = [
  {
    delegationKey: 'DEL-ACTIVE', delegatorPersonKey: 'M1', delegatePersonKey: 'D1', subjectPersonKey: 'E1',
    performanceYear: 2027, partition: 'Q1', resourceType: 'KCFKPI_QuarterReviews',
    resourceKey: 'QR|E1|2027|Q1', subjectType: 'QuarterReview', subjectKey: 'QR|E1|2027|Q1',
    commandTypes: ['SetQuarterManagerReview'], readOnly: false,
    startUtc: '2026-10-01T00:00:00Z', endUtc: '2027-10-31T23:59:59Z', active: true, revoked: false
  },
  {
    delegationKey: 'DEL-WRONG-SUBJECT', delegatorPersonKey: 'M1', delegatePersonKey: 'D1', subjectPersonKey: 'E2',
    performanceYear: 2027, partition: 'Q1', resourceType: 'KCFKPI_QuarterReviews',
    resourceKey: 'QR|E2|2027|Q1', subjectType: 'QuarterReview', subjectKey: 'QR|E2|2027|Q1',
    commandTypes: ['SetQuarterManagerReview'], readOnly: false,
    startUtc: '2026-10-01T00:00:00Z', endUtc: '2027-10-31T23:59:59Z', active: true, revoked: false
  },
  {
    delegationKey: 'DEL-EXPIRED', delegatorPersonKey: 'M2', delegatePersonKey: 'D1', subjectPersonKey: 'E2',
    performanceYear: 2027, partition: 'Q1', resourceType: 'KCFKPI_QuarterReviews',
    resourceKey: 'QR|E2|2027|Q1', subjectType: 'QuarterReview', subjectKey: 'QR|E2|2027|Q1',
    commandTypes: ['SetQuarterManagerReview'], readOnly: false,
    startUtc: '2025-01-01T00:00:00Z', endUtc: '2025-12-31T23:59:59Z', active: true, revoked: false
  }
];

describe('KCF-KPI-027B SEC-006 ACL recalculation', () => {
  it('breaks inheritance independently on every private root', () => {
    const plan = buildSec006AclPlan(2027, asOf, people, delegations, automation);
    expect(plan.roots.map(root => root.root)).toEqual(SEC006_PRIVATE_ROOTS);
    expect(plan.roots.every(root => root.breakRoleInheritance && !root.copyRoleAssignments
      && root.clearSubscopes && !root.humanBroadGrantAllowed)).toBe(true);
    expect(assertSec006AclPlan(plan)).toEqual([]);
  });

  it('generates annual and Q1-Q4 partitions using internal year and stable PersonKey', () => {
    const plan = buildSec006AclPlan(2027, asOf, people, delegations, automation);
    expect(plan.partitions).toHaveLength(SEC006_PRIVATE_ROOTS.length * people.length * 5);
    expect(plan.partitions.some(partition => partition.serverRelativePattern
      === 'KCFKPI_Workplans/2027/E1/annual')).toBe(true);
    expect(plan.partitions.some(partition => partition.serverRelativePattern
      === 'KCFKPI_Evidence/2027/E1/Q4')).toBe(true);
  });

  it('grants Employee command contribution only to the Employee subject and Automation', () => {
    const partition = buildSec006AclPlan(2027, asOf, people, delegations, automation).partitions
      .find(value => value.root === 'KCFKPI_EmployeeCommands' && value.personKey === 'E1' && value.partition === 'annual');
    expect(partition?.grants).toEqual(expect.arrayContaining([
      expect.objectContaining({ principal: 'e1@example.invalid', permission: 'ContributeNoDelete', basis: 'OwnSubject' }),
      expect.objectContaining({ principal: automation, permission: 'Read', basis: 'Automation' })
    ]));
    expect(partition?.grants.some(grant => grant.principal === 'm1@example.invalid')).toBe(false);
    expect(partition?.grants.some(grant => grant.principal === 'ba1@example.invalid')).toBe(false);
  });

  it('grants Manager commands only to the current manager and mediates an exact delegate scope', () => {
    const plan = buildSec006AclPlan(2027, asOf, people, delegations, automation);
    const e1 = plan.partitions.find(value => value.root === 'KCFKPI_ManagerCommands'
      && value.personKey === 'E1' && value.partition === 'annual');
    const e2 = plan.partitions.find(value => value.root === 'KCFKPI_ManagerCommands'
      && value.personKey === 'E2' && value.partition === 'annual');
    expect(e1?.grants).toEqual(expect.arrayContaining([
      expect.objectContaining({ principal: 'm1@example.invalid', basis: 'CurrentManager' })
    ]));
    expect(e1?.grants.some(grant => grant.principal === 'e1@example.invalid')).toBe(false);
    expect(e1?.grants.some(grant => grant.principal === 'd1@example.invalid')).toBe(false);
    expect(e2?.grants.some(grant => grant.principal === 'd1@example.invalid')).toBe(false);
    expect(plan.delegatedOperations).toEqual([expect.objectContaining({
      delegationKey: 'DEL-ACTIVE', delegatePrincipal: 'd1@example.invalid', partition: 'Q1',
      resourceKey: 'QR|E1|2027|Q1', commandTypes: ['SetQuarterManagerReview'],
      directPrivateRootGrant: false, mediatedByAutomation: true
    })]);
  });

  it('does not grant Business Admin blanket private named access', () => {
    const e1 = buildSec006AclPlan(2027, asOf, people, delegations, automation).partitions
      .filter(value => value.personKey === 'E1');
    expect(e1.every(partition => partition.grants.every(grant => grant.principal !== 'ba1@example.invalid'))).toBe(true);
  });

  it('limits System Admin to diagnostics with no private-root grant', () => {
    const partition = buildSec006AclPlan(2027, asOf, people, delegations, automation).partitions
      .find(value => value.root === 'KCFKPI_Workplans' && value.personKey === 'E1' && value.partition === 'annual');
    expect(partition?.grants.some(grant => grant.principal === 'sa1@example.invalid')).toBe(false);
    const plan = buildSec006AclPlan(2027, asOf, people, delegations, automation);
    expect(plan.systemAdminDiagnostics).toContainEqual({
      principal: 'sa1@example.invalid', permission: 'ReadOnly',
      scopes: ['Configuration', 'ProcessorHealth', 'RecoveryStatus'],
      privateCanonicalAccess: false, canonicalWriteAllowed: false
    });
  });

  it('denies direct human REST mutation on every canonical and Audit root', () => {
    const canonicalRoots = ['KCFKPI_Workplans', 'KCFKPI_WorkplanItems', 'KCFKPI_QuarterReviews',
      'KCFKPI_QuarterReviewItems', 'KCFKPI_CommandReceipts', 'KCFKPI_Evidence', 'KCFKPI_Audit'];
    const partitions = buildSec006AclPlan(2027, asOf, people, delegations, automation).partitions
      .filter(partition => canonicalRoots.indexOf(partition.root) >= 0);
    expect(partitions.length).toBeGreaterThan(0);
    partitions.forEach(partition => partition.grants.forEach(grant => {
      if (grant.basis === 'Automation') {
        if (partition.root === 'KCFKPI_Audit' || partition.root === 'KCFKPI_CommandReceipts') {
          expect(grant.permission).toBe('AppendOnlyAutomation');
        } else if (partition.root === 'KCFKPI_EmployeeCommands' || partition.root === 'KCFKPI_ManagerCommands') {
          expect(grant.permission).toBe('Read');
        } else {
          expect(grant.permission).toBe('ProcessorNoDelete');
        }
      }
      else if (partition.root === 'KCFKPI_Evidence' && grant.basis === 'OwnSubject') {
        expect(grant.permission).toBe('ContributeNoDelete');
      }
      else expect(grant.permission).toBe('Read');
    }));
    expect(partitions.every(partition => partition.grants
      .every(grant => grant.principal !== 'sa1@example.invalid'))).toBe(true);
  });

  it('recalculates 2027 from current People rather than copying a 2026 manager', () => {
    const priorPeople = people.map(person => person.personKey === 'E1' ? { ...person, managerPersonKey: 'M2' } : person);
    const plan2026 = buildSec006AclPlan(2026, '2025-11-01T12:00:00Z', priorPeople, [], automation);
    const plan2027 = buildSec006AclPlan(2027, asOf, people, delegations, automation);
    const prior = plan2026.partitions.find(value => value.root === 'KCFKPI_Workplans'
      && value.personKey === 'E1' && value.partition === 'annual');
    const current = plan2027.partitions.find(value => value.root === 'KCFKPI_Workplans'
      && value.personKey === 'E1' && value.partition === 'annual');
    expect(prior?.grants.some(grant => grant.principal === 'm2@example.invalid')).toBe(true);
    expect(current?.grants.some(grant => grant.principal === 'm1@example.invalid')).toBe(true);
    expect(current?.grants.some(grant => grant.principal === 'm2@example.invalid')).toBe(false);
    expect(plan2027.copiedFromPriorYear).toBe(false);
    expect(plan2027.calculationBasis).toBe('CURRENT_PEOPLE_AND_DELEGATIONS');
  });

  it('fails closed without a named Automation principal', () => {
    expect(() => buildSec006AclPlan(2027, asOf, people, delegations, '')).toThrow(/Automation principal/);
  });
});
