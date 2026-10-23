import { assertProductionQueryFields } from './ProductionQueryFieldContracts';
import {
  ADMIN_CONFIG_AUDIT_EXPAND,
  ADMIN_CONFIG_AUDIT_SELECT,
  mapAdminConfigSourceRecord
} from './AdminConfigProductionAdapter';
import { ADMIN_OVERALL_DELIVERY_CONFIG_KEYS } from './AdminConfigDomain';

describe('Admin Config production audit adapter', () => {
  it('selects and expands the built-in SharePoint update metadata through the approved query contract', () => {
    expect(ADMIN_CONFIG_AUDIT_SELECT.split(',')).toEqual(expect.arrayContaining([
      'Environment', 'ChangeReference', 'Modified', 'Editor/EMail'
    ]));
    expect(ADMIN_CONFIG_AUDIT_EXPAND).toBe('Editor');
    expect(() => assertProductionQueryFields(
      'KCFKPI_Config',
      ADMIN_CONFIG_AUDIT_SELECT,
      `Environment eq 'Production'`,
      'ConfigKey'
    )).not.toThrow();
  });

  it('maps Boolean value and built-in Modified/Editor metadata into the existing Admin rendering contract', () => {
    expect(mapAdminConfigSourceRecord({
      Id: 7,
      '@odata.etag': '"7"',
      ConfigKey: 'RAG.InvalidIsUnassessed',
      ValueType: 'Boolean',
      BooleanValue: true,
      Environment: 'Production',
      Active: true,
      ChangeReference: 'KCF-KPI-CFG-007',
      Modified: '2026-08-21T13:14:15Z',
      Editor: { EMail: 'person016@example.invalid', Title: 'Config Owner' }
    })).toEqual({
      id: 7,
      etag: '"7"',
      key: 'RAG.InvalidIsUnassessed',
      valueType: 'Boolean',
      textValue: undefined,
      numberValue: undefined,
      booleanValue: true,
      dateValue: undefined,
      jsonValue: undefined,
      environment: 'Production',
      active: true,
      changeReference: 'KCF-KPI-CFG-007',
      modifiedAt: '2026-08-21T13:14:15Z',
      modifiedBy: 'person016@example.invalid'
    });
  });

  it('retains a supported Editor display name when email is unavailable', () => {
    expect(mapAdminConfigSourceRecord({
      Id: 1,
      ConfigKey: 'Period.Q1',
      ValueType: 'Text',
      TextValue: 'Nov-Jan',
      Environment: 'Production',
      Active: true,
      Editor: { Title: 'Recorded editor' }
    }).modifiedBy).toBe('Recorded editor');
  });

  it('maps governed Overall Delivery numeric records with exact ETag and provenance', () => {
    expect(mapAdminConfigSourceRecord({
      Id: 101,
      '@odata.etag': '"core-v1"',
      ConfigKey: ADMIN_OVERALL_DELIVERY_CONFIG_KEYS.coreWeight,
      ValueType: 'Number',
      NumberValue: 70,
      Environment: 'Production',
      Active: true,
      ChangeReference: 'KCF-KPI-PM28-A004',
      Modified: '2026-09-22T16:50:00Z',
      Editor: { EMail: 'config.owner@example.invalid' }
    })).toEqual(expect.objectContaining({
      id: 101,
      etag: '"core-v1"',
      key: ADMIN_OVERALL_DELIVERY_CONFIG_KEYS.coreWeight,
      valueType: 'Number',
      numberValue: 70,
      environment: 'Production',
      active: true,
      changeReference: 'KCF-KPI-PM28-A004',
      modifiedBy: 'config.owner@example.invalid'
    }));
  });
});
