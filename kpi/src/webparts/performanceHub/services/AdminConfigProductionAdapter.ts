import type { ConfigValueType } from '../models/ProductionModels';
import type { IAdminConfigSourceRecord } from './AdminConfigDomain';
import { CONFIG_SELECT } from './ProductionQueryFieldContracts';

export interface IAdminConfigListItemReadback {
  Id: number;
  '@odata.etag'?: string;
  ConfigKey: string;
  ValueType: ConfigValueType;
  TextValue?: string;
  NumberValue?: number;
  BooleanValue?: boolean;
  DateValue?: string;
  JSONValue?: string;
  Environment: string;
  Active: boolean;
  ChangeReference?: string;
  Modified?: string;
  Editor?: {
    EMail?: string;
    Title?: string;
  };
}

/** Built-in SharePoint audit fields available on every Config item. */
export const ADMIN_CONFIG_AUDIT_SELECT = `${CONFIG_SELECT},Modified,Editor/EMail`;
export const ADMIN_CONFIG_AUDIT_EXPAND = 'Editor';

export const mapAdminConfigSourceRecord = (
  row: IAdminConfigListItemReadback
): IAdminConfigSourceRecord => ({
  id: row.Id,
  etag: row['@odata.etag'],
  key: row.ConfigKey,
  valueType: row.ValueType,
  textValue: row.TextValue,
  numberValue: row.NumberValue,
  booleanValue: row.BooleanValue,
  dateValue: row.DateValue,
  jsonValue: row.JSONValue,
  environment: row.Environment,
  active: row.Active,
  changeReference: row.ChangeReference,
  modifiedAt: row.Modified,
  modifiedBy: row.Editor?.EMail || row.Editor?.Title
});
