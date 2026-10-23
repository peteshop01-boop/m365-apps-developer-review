import type { IProductionDataService } from '../services/IProductionDataService';
import type { IAdminReportingControlDataService } from '../services/AdminReportingControlDataService';
import type { IReportingViewsDataset } from '../models/ReportingModels';

export interface IPerformanceHubProps {
  dataService: IProductionDataService;
  adminReportingDataService?: IAdminReportingControlDataService;
  currentUserEmail: string;
  userDisplayName: string;
  localUatMode?: boolean;
  adminUatMode?: boolean;
  adminReportingUatMode?: boolean;
  strategicCoreCoverageUatMode?: boolean;
  strategicCoreCoverageBusinessUatMode?: boolean;
  reportingData?: IReportingViewsDataset;
}
