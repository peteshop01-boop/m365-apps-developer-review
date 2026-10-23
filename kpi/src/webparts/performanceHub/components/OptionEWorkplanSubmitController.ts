import {
  optionERequestKey,
  validateOptionESubmitPreconditions,
  type IOptionECanonicalDraftDto,
  type IOptionELocalDraftBuffer,
  type IOptionEProtectedWorkplanDto,
  type IOptionESubmitOperation,
  type IOptionESubmitValidationError
} from '../models/OptionEWorkplanSubmitModels';
import {
  OptionESubmitConflictError,
  OptionESubmitValidationError,
  type IOptionESubmitIntent,
  type IOptionESubmitRecordedResult,
  OptionEWorkplanSubmitGateway
} from '../services/OptionEWorkplanSubmitGateway';

export type OptionESubmitClientPhase =
  | 'Idle'
  | 'Blocked'
  | 'Recording'
  | 'Processing'
  | 'Submitted'
  | 'Rejected'
  | 'RecoveryHold'
  | 'Conflict'
  | 'Error';

export interface IOptionESubmitClientState {
  phase: OptionESubmitClientPhase;
  disabled: boolean;
  message: string;
  requestKey?: string;
  errors: readonly IOptionESubmitValidationError[];
}

export interface IOptionESubmitStatusReader {
  readOperation(requestKey: string): Promise<IOptionESubmitOperation | undefined>;
  readProtectedWorkplan(workplanKey: string): Promise<IOptionEProtectedWorkplanDto | undefined>;
}

export interface IOptionESubmitControllerContext {
  canonicalDraft: IOptionECanonicalDraftDto;
  localBuffer: IOptionELocalDraftBuffer;
  protectedWorkplan: IOptionEProtectedWorkplanDto;
}

interface IFrozenOptionESubmitIntent {
  readonly context: IOptionESubmitControllerContext;
  readonly gatewayIntent: IOptionESubmitIntent;
  readonly requestKey: string;
}

const freezeContext = (context: IOptionESubmitControllerContext): IOptionESubmitControllerContext =>
  Object.freeze({
    canonicalDraft: Object.freeze({ ...context.canonicalDraft }),
    localBuffer: Object.freeze({ ...context.localBuffer }),
    protectedWorkplan: Object.freeze({ ...context.protectedWorkplan })
  });

export class OptionEWorkplanSubmitController {
  private current: IOptionESubmitClientState = { phase: 'Idle', disabled: false, message: '', errors: [] };
  private frozenIntent?: IFrozenOptionESubmitIntent;
  private pending?: Promise<IOptionESubmitClientState>;
  private refreshEpoch = 0;

  public constructor(
    private readonly gateway: OptionEWorkplanSubmitGateway,
    private readonly statusReader: IOptionESubmitStatusReader,
    private readonly uuid: () => string,
    private readonly now: () => string
  ) {}

  public state(): IOptionESubmitClientState { return { ...this.current, errors: [...this.current.errors] }; }

  public evaluate(context: IOptionESubmitControllerContext): IOptionESubmitClientState {
    if (this.pending) return this.state();
    this.refreshEpoch += 1;
    const errors = validateOptionESubmitPreconditions(
      context.canonicalDraft, context.localBuffer, context.protectedWorkplan
    );
    const confirmedRequest = this.current.requestKey ? { requestKey: this.current.requestKey } : {};
    this.current = errors.length
      ? {
        phase: 'Blocked', disabled: true,
        message: 'Submit is unavailable until the saved Draft and protected state are valid.',
        ...confirmedRequest, errors
      }
      : { phase: 'Idle', disabled: false, message: '', ...confirmedRequest, errors: [] };
    return this.state();
  }

  private async perform(): Promise<IOptionESubmitClientState> {
    try {
      const frozen = this.frozenIntent as IFrozenOptionESubmitIntent;
      const recorded: IOptionESubmitRecordedResult = await this.gateway.record({
        ...frozen.context,
        intent: frozen.gatewayIntent
      });
      if (recorded.request.RequestKey !== frozen.requestKey) {
        throw new OptionESubmitConflictError('Recorded RequestKey did not match the frozen submit intent.');
      }
      this.current = {
        phase: 'Processing', disabled: true, message: recorded.message,
        requestKey: recorded.request.RequestKey, errors: []
      };
    } catch (error) {
      if (error instanceof OptionESubmitValidationError) {
        this.current = { phase: 'Blocked', disabled: true, message: 'Submission validation failed.', errors: error.details };
      } else if (error instanceof OptionESubmitConflictError) {
        this.current = { phase: 'Conflict', disabled: true, message: 'Submission conflict; no new request was created.', errors: [] };
      } else {
        this.current = {
          phase: 'Error', disabled: false,
          message: 'Submission request could not be confirmed. Retry safely; no submitted status has been declared.',
          errors: []
        };
        throw error;
      }
    } finally {
      this.pending = undefined;
    }
    return this.state();
  }

  public submit(context: IOptionESubmitControllerContext): Promise<IOptionESubmitClientState> {
    if (this.pending) return this.pending;
    if (this.current.requestKey) {
      if (this.current.phase === 'Idle' || this.current.phase === 'Blocked' || this.current.phase === 'Error') {
        this.current = {
          ...this.current, phase: 'Processing', disabled: true,
          message: 'Submission request recorded; processing.'
        };
      }
      return this.refresh(context);
    }
    const evaluated = this.evaluate(context);
    if (evaluated.phase === 'Blocked') return Promise.resolve(evaluated);
    if (!this.frozenIntent) {
      const frozenContext = freezeContext(context);
      const gatewayIntent = Object.freeze({ clientSubmitId: this.uuid(), clientSubmittedAt: this.now() });
      this.frozenIntent = Object.freeze({
        context: frozenContext,
        gatewayIntent,
        requestKey: optionERequestKey(
          frozenContext.protectedWorkplan.personKey,
          frozenContext.protectedWorkplan.performanceYear,
          gatewayIntent.clientSubmitId
        )
      });
    }
    this.current = { phase: 'Recording', disabled: true, message: 'Recording submission request…', errors: [] };
    this.pending = this.perform();
    return this.pending;
  }

  private operationCoordinatesMatch(
    operation: IOptionESubmitOperation,
    frozen: IFrozenOptionESubmitIntent
  ): boolean {
    const control = frozen.context.protectedWorkplan;
    return operation.operationKey === frozen.requestKey
      && operation.requestKey === frozen.requestKey
      && operation.workplanKey === control.workplanKey
      && operation.personKey === control.personKey
      && operation.performanceYear === control.performanceYear;
  }

  private controlCoordinatesMatch(
    control: IOptionEProtectedWorkplanDto,
    frozen: IFrozenOptionESubmitIntent
  ): boolean {
    const expected = frozen.context.protectedWorkplan;
    return control.workplanKey === expected.workplanKey
      && control.personKey === expected.personKey
      && control.performanceYear === expected.performanceYear
      && control.draftItemId === expected.draftItemId;
  }

  private setCoordinateError(): void {
    this.current = {
      ...this.current, phase: 'Error', disabled: false,
      message: 'Submission status coordinates did not match the recorded request. Retry safely; no submitted status has been declared.',
      errors: []
    };
  }

  public async refresh(_context: IOptionESubmitControllerContext): Promise<IOptionESubmitClientState> {
    if (!this.current.requestKey) return this.state();
    const frozen = this.frozenIntent;
    const requestKey = this.current.requestKey;
    const epoch = ++this.refreshEpoch;
    if (!frozen || requestKey !== frozen.requestKey) {
      this.setCoordinateError();
      return this.state();
    }
    try {
      const [operation, control] = await Promise.all([
        this.statusReader.readOperation(frozen.requestKey),
        this.statusReader.readProtectedWorkplan(frozen.context.protectedWorkplan.workplanKey)
      ]);
      if (epoch !== this.refreshEpoch) return this.state();
      if ((operation && !this.operationCoordinatesMatch(operation, frozen))
        || (control && !this.controlCoordinatesMatch(control, frozen))) {
        this.setCoordinateError();
        return this.state();
      }
      if (operation?.outcome === 'RecoveryHold' || control?.transitionStatus === 'RecoveryHold') {
        this.current = {
          ...this.current, phase: 'RecoveryHold', disabled: true,
          message: 'Submission needs controlled recovery; no submitted status has been declared.'
        };
      } else if (operation?.outcome === 'Rejected') {
        this.current = { ...this.current, phase: 'Rejected', disabled: true, message: 'Submission was rejected.' };
      } else if (operation?.outcome === 'Completed' && operation.checkpoint === 'Completed'
        && control?.state === 'Submitted' && control.transitionStatus === 'Ready'
        && control.currentSubmittedSnapshotKey === frozen.requestKey && !control.pendingRequestKey) {
        this.current = { ...this.current, phase: 'Submitted', disabled: true, message: 'Submitted' };
      } else {
        this.current = {
          ...this.current, phase: 'Processing', disabled: true,
          message: 'Submission request recorded; processing.'
        };
      }
    } catch (error) {
      if (epoch === this.refreshEpoch) {
        this.current = {
          ...this.current, phase: 'Error', disabled: false,
          message: 'Submission status could not be refreshed. Retry safely; no submitted status has been declared.',
          errors: []
        };
      }
      throw error;
    }
    return this.state();
  }
}
