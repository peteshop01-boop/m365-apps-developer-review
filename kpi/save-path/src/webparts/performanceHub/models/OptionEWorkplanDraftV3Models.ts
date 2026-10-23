import { OPTION_E_DRAFT_SCHEMA_VERSION, OptionEDraftValidationError, validateOptionEPartialDraftAggregate } from './OptionEWorkplanDraftModels';
export const OPTION_E_DRAFT_V3_SCHEMA_VERSION = 'demo.workplan-draft/v3' as const;
export const OPTION_E_DRAFT_V3_WIRE_VERSION = 'canonical-private-draft/v3' as const;
export const OPTION_E_DRAFT_V3_MAX_UTF8_BYTES = 56000;

// Structural declaration copied exactly from issued008 schema; semantic checks follow.
export const PARTIAL_DRAFT_V3_SCHEMA: object = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'urn:demo:workplan-draft:v3:private-design',
    title: 'Future private Draft V3 \u2014 unverified content and reference claims',
    type: 'object',
    additionalProperties: false,
    required: [
        'behaviours',
        'core',
        'impact',
        'schemaVersion'
    ],
    properties: {
        schemaVersion: {
            const: 'demo.workplan-draft/v3',
            type: 'string'
        },
        core: {
            type: 'object',
            additionalProperties: false,
            required: [
                'entries',
                'weightingMode'
            ],
            properties: {
                weightingMode: {
                    type: 'string',
                    enum: [
                        'Equal',
                        'Custom'
                    ]
                },
                entries: {
                    type: 'array',
                    items: {
                        $ref: '#/$defs/coreEntry'
                    }
                }
            }
        },
        impact: {
            type: 'array',
            items: {
                $ref: '#/$defs/impactEntry'
            }
        },
        behaviours: {
            type: 'object',
            additionalProperties: false,
            required: [
                'entries',
                'frameworkVersion',
                'roleTier'
            ],
            properties: {
                frameworkVersion: {
                    const: 'DEMO-BEHAVIOUR|v02',
                    type: 'string'
                },
                roleTier: {
                    type: 'string'
                },
                entries: {
                    type: 'array',
                    items: {
                        $ref: '#/$defs/behaviourEntry'
                    },
                    maxItems: 5
                },
                governedExtension: {
                    $ref: '#/$defs/governedBehaviourExtension'
                }
            }
        },
        referenceClaims: {
            type: 'object',
            additionalProperties: false,
            required: [],
            properties: {
                overallDelivery: {
                    $ref: '#/$defs/overallDeliveryClaim'
                }
            }
        },
        employeeNotes: {
            type: 'object',
            additionalProperties: false,
            required: [],
            properties: {
                categoryWeightReason: {
                    type: 'string'
                },
                zeroPersonalReason: {
                    type: 'string'
                }
            }
        }
    },
    $defs: {
        targetSlot: {
            oneOf: [
                {
                    type: 'object',
                    additionalProperties: false,
                    required: [
                        'kind'
                    ],
                    properties: {
                        kind: {
                            const: 'Scalar',
                            type: 'string'
                        },
                        value: {
                            type: [
                                'string',
                                'number'
                            ]
                        },
                        success: {
                            type: 'string'
                        },
                        commitment: {
                            type: 'string'
                        },
                        successDefinition: {
                            type: 'string'
                        },
                        editorText: {
                            type: 'string'
                        }
                    }
                },
                {
                    type: 'object',
                    additionalProperties: false,
                    required: [
                        'kind'
                    ],
                    properties: {
                        kind: {
                            const: 'NativePair',
                            type: 'string'
                        },
                        numericValue: {
                            type: 'number'
                        },
                        textValue: {
                            type: 'string'
                        },
                        success: {
                            type: 'string'
                        },
                        commitment: {
                            type: 'string'
                        },
                        successDefinition: {
                            type: 'string'
                        },
                        editorText: {
                            type: 'string'
                        }
                    }
                }
            ]
        },
        targets: {
            type: 'object',
            additionalProperties: false,
            required: [
                'annual',
                'q1',
                'q2',
                'q3',
                'q4'
            ],
            properties: {
                annual: {
                    $ref: '#/$defs/targetSlot'
                },
                q1: {
                    $ref: '#/$defs/targetSlot'
                },
                q2: {
                    $ref: '#/$defs/targetSlot'
                },
                q3: {
                    $ref: '#/$defs/targetSlot'
                },
                q4: {
                    $ref: '#/$defs/targetSlot'
                }
            }
        },
        coreEntry: {
            type: 'object',
            additionalProperties: false,
            required: [
                'contributionMethod',
                'coreId',
                'kpiId',
                'kpiVersionKey',
                'role',
                'targetVersionKey',
                'targets'
            ],
            properties: {
                coreId: {
                    type: 'string',
                    minLength: 1,
                    pattern: '\\S'
                },
                kpiId: {
                    type: 'string',
                    minLength: 1,
                    pattern: '\\S'
                },
                kpiVersionKey: {
                    type: 'string'
                },
                targetVersionKey: {
                    type: 'string'
                },
                role: {
                    type: 'string',
                    enum: [
                        'Owner',
                        'Delivery',
                        'Support',
                        ''
                    ]
                },
                contributionMethod: {
                    type: 'string',
                    enum: [
                        'AdditiveDirect',
                        'SharedTarget',
                        'WeightedDenominator',
                        'AccountableOwner',
                        'CompletionOversight',
                        ''
                    ]
                },
                targets: {
                    $ref: '#/$defs/targets'
                },
                nativeRole: {
                    type: 'string',
                    enum: [
                        'AccountableOwner',
                        'DeliveryLead',
                        'Contributor',
                        'Oversight',
                        'EvidenceProvider'
                    ]
                },
                weightPercent: {
                    type: 'number',
                    minimum: 0,
                    maximum: 100
                },
                sharedTargetRule: {
                    type: 'string',
                    enum: [
                        'VisibleOnly',
                        'ApprovedApportionment'
                    ]
                },
                sharedApportionmentPercent: {
                    type: 'number',
                    minimum: 0,
                    maximum: 100
                },
                governanceReference: {
                    type: 'string'
                },
                denominatorNumerator: {
                    type: 'number'
                },
                denominatorValue: {
                    type: 'number'
                },
                denominatorUnit: {
                    type: 'string'
                },
                denominatorRuleReference: {
                    type: 'string'
                },
                denominatorSourceReference: {
                    type: 'string'
                },
                nativeQuarterOrder: {
                    type: 'array',
                    items: {
                        type: 'string',
                        enum: [
                            'Q1',
                            'Q2',
                            'Q3',
                            'Q4'
                        ]
                    },
                    uniqueItems: true,
                    maxItems: 4
                },
                displayOrder: {
                    type: 'integer',
                    minimum: 0,
                    maximum: 9007199254740991
                },
                activeInWorkplan: {
                    type: 'boolean'
                }
            }
        },
        impactEntry: {
            type: 'object',
            additionalProperties: false,
            required: [
                'classification',
                'editorDefinition',
                'impactId',
                'measure',
                'targets',
                'unitLabel',
                'wording'
            ],
            properties: {
                impactId: {
                    type: 'string',
                    minLength: 1,
                    pattern: '\\S'
                },
                wording: {
                    type: 'string'
                },
                measure: {
                    type: 'string'
                },
                unitLabel: {
                    type: 'string'
                },
                targets: {
                    $ref: '#/$defs/targets'
                },
                editorDefinition: {
                    type: 'object',
                    additionalProperties: false,
                    required: [
                        'measure',
                        'success'
                    ],
                    properties: {
                        measure: {
                            type: 'string',
                            enum: [
                                'Number / Quantity',
                                'Percentage',
                                'Milestone / Completion',
                                ''
                            ]
                        },
                        success: {
                            type: 'string'
                        },
                        intendedOutcome: {
                            type: 'string'
                        },
                        successCriterion: {
                            type: 'string'
                        }
                    }
                },
                classification: {
                    $ref: '#/$defs/classificationClaim'
                },
                description: {
                    type: 'string'
                },
                measureType: {
                    type: 'string',
                    enum: [
                        'Count',
                        'Number',
                        'Percentage',
                        'Currency',
                        'Rate',
                        'Days',
                        'Score',
                        'Milestone',
                        'TextStatus',
                        'Other'
                    ]
                },
                scoringDirection: {
                    type: 'string',
                    enum: [
                        'HigherIsBetter',
                        'LowerIsBetter',
                        'TargetRange',
                        'Milestone',
                        'TBC'
                    ]
                },
                percentageSourceScale: {
                    type: 'string',
                    enum: [
                        'Fraction',
                        'Whole'
                    ]
                },
                baselineValue: {
                    type: 'number'
                },
                personalItemWeight: {
                    type: 'number',
                    minimum: 0,
                    maximum: 100
                },
                displayOrder: {
                    type: 'integer',
                    minimum: 0,
                    maximum: 9007199254740991
                },
                activeInWorkplan: {
                    type: 'boolean'
                }
            }
        },
        classificationClaim: {
            oneOf: [
                {
                    type: 'object',
                    additionalProperties: false,
                    required: [
                        'state'
                    ],
                    properties: {
                        state: {
                            const: 'Unselected',
                            type: 'string'
                        }
                    }
                },
                {
                    type: 'object',
                    additionalProperties: false,
                    required: [
                        'state'
                    ],
                    properties: {
                        state: {
                            const: 'Incomplete',
                            type: 'string'
                        },
                        strategicPillar: {
                            $ref: '#/$defs/selectionClaim'
                        },
                        businessContributionArea: {
                            $ref: '#/$defs/selectionClaim'
                        },
                        taxonomyPin: {
                            $ref: '#/$defs/taxonomyPin'
                        }
                    }
                },
                {
                    type: 'object',
                    additionalProperties: false,
                    required: [
                        'state'
                    ],
                    properties: {
                        state: {
                            const: 'RetainedUnresolved',
                            type: 'string'
                        },
                        strategicPillar: {
                            $ref: '#/$defs/selectionClaim'
                        },
                        businessContributionArea: {
                            $ref: '#/$defs/selectionClaim'
                        },
                        taxonomyPin: {
                            $ref: '#/$defs/taxonomyPin'
                        }
                    }
                },
                {
                    type: 'object',
                    additionalProperties: false,
                    required: [
                        'businessContributionArea',
                        'state',
                        'taxonomyPin'
                    ],
                    properties: {
                        state: {
                            const: 'Pinned',
                            type: 'string'
                        },
                        businessContributionArea: {
                            $ref: '#/$defs/selectionClaim'
                        },
                        taxonomyPin: {
                            $ref: '#/$defs/taxonomyPin'
                        },
                        strategicPillar: {
                            $ref: '#/$defs/selectionClaim'
                        }
                    }
                }
            ]
        },
        selectionClaim: {
            type: 'object',
            additionalProperties: false,
            required: [
                'key'
            ],
            properties: {
                key: {
                    type: 'string'
                },
                label: {
                    type: 'string'
                },
                source: {
                    type: 'string'
                },
                sourceReference: {
                    type: 'string'
                },
                taxonomyId: {
                    type: 'string'
                },
                taxonomyVersion: {
                    type: 'string'
                },
                taxonomyEtag: {
                    type: 'string'
                },
                taxonomyApprovalReference: {
                    const: 'DEMO-APP-PETE-PD-02',
                    type: 'string'
                }
            }
        },
        taxonomyPin: {
            type: 'object',
            additionalProperties: false,
            required: [
                'contentSha256',
                'etag',
                'taxonomyId',
                'version'
            ],
            properties: {
                taxonomyId: {
                    type: 'string',
                    minLength: 1,
                    pattern: '\\S'
                },
                version: {
                    type: 'string',
                    minLength: 1,
                    pattern: '\\S'
                },
                etag: {
                    type: 'string',
                    minLength: 1,
                    pattern: '\\S'
                },
                contentSha256: {
                    type: 'string',
                    pattern: '^[0-9a-fA-F]{64}$'
                }
            }
        },
        behaviourEntry: {
            type: 'object',
            additionalProperties: false,
            required: [
                'commitment',
                'descriptorKey',
                'guidancePromptKeys',
                'periodCommitments',
                'selectedPromptKeys',
                'valueId'
            ],
            properties: {
                valueId: {
                    type: 'string',
                    enum: [
                        'BHV-01',
                        'BHV-02',
                        'BHV-03',
                        'BHV-04',
                        'BHV-05'
                    ]
                },
                descriptorKey: {
                    type: 'string'
                },
                guidancePromptKeys: {
                    type: 'array',
                    items: {
                        type: 'string',
                        minLength: 1,
                        pattern: '\\S'
                    },
                    uniqueItems: true
                },
                selectedPromptKeys: {
                    type: 'array',
                    items: {
                        type: 'string',
                        minLength: 1,
                        pattern: '\\S'
                    },
                    uniqueItems: true
                },
                commitment: {
                    type: 'string'
                },
                periodCommitments: {
                    $ref: '#/$defs/behaviourPeriods'
                },
                planningLevels: {
                    $ref: '#/$defs/planningLevels'
                },
                cadenceClaim: {
                    type: 'string',
                    enum: [
                        'Quarterly',
                        'TwiceYearly'
                    ]
                },
                displayOrder: {
                    type: 'integer',
                    minimum: 0,
                    maximum: 9007199254740991
                },
                activeInWorkplan: {
                    type: 'boolean'
                }
            }
        },
        behaviourPeriods: {
            type: 'object',
            additionalProperties: false,
            required: [
                'Q1',
                'Q2',
                'Q3',
                'Q4'
            ],
            properties: {
                Q1: {
                    type: 'string'
                },
                Q2: {
                    type: 'string'
                },
                Q3: {
                    type: 'string'
                },
                Q4: {
                    type: 'string'
                },
                H1: {
                    type: 'string'
                },
                H2: {
                    type: 'string'
                }
            }
        },
        planningLevels: {
            type: 'object',
            additionalProperties: false,
            required: [
                'contractVersion'
            ],
            properties: {
                contractVersion: {
                    const: 'BHV-LEVELS|v01',
                    type: 'string'
                },
                currentLevel: {
                    type: 'string',
                    enum: [
                        'Developing',
                        'Effective',
                        'Exceptional'
                    ]
                },
                targetLevel: {
                    type: 'string',
                    enum: [
                        'Developing',
                        'Effective',
                        'Exceptional'
                    ]
                },
                targetJustification: {
                    type: 'string'
                }
            }
        },
        behaviourAuthority: {
            type: 'object',
            additionalProperties: false,
            required: [
                'approvalReference',
                'catalogueContentSha256',
                'catalogueEtag',
                'catalogueId',
                'catalogueRevision',
                'catalogueVersion'
            ],
            properties: {
                catalogueId: {
                    type: 'string',
                    minLength: 1,
                    pattern: '\\S'
                },
                catalogueVersion: {
                    type: 'string',
                    minLength: 1,
                    pattern: '\\S'
                },
                catalogueRevision: {
                    type: 'integer',
                    minimum: 1,
                    maximum: 9007199254740991
                },
                catalogueEtag: {
                    type: 'string',
                    minLength: 1,
                    pattern: '\\S'
                },
                catalogueContentSha256: {
                    type: 'string',
                    pattern: '^[A-F0-9]{64}$'
                },
                approvalReference: {
                    const: 'DEMO-APP-PETE-BEH-V02-001',
                    type: 'string'
                }
            }
        },
        behaviourSelection: {
            type: 'object',
            additionalProperties: false,
            required: [
                'behaviourKey',
                'catalogueContentSha256',
                'catalogueEtag',
                'catalogueId',
                'catalogueRevision',
                'catalogueVersion',
                'focusKey',
                'focusTitle',
                'headlineTitle',
                'howWillWeKnow',
                'myCommitment',
                'roleLevelCode',
                'selectedWording',
                'selectionKey',
                'source'
            ],
            properties: {
                selectionKey: {
                    type: 'string',
                    minLength: 1,
                    pattern: '\\S'
                },
                source: {
                    type: 'string',
                    enum: [
                        'Catalogue',
                        'Own'
                    ]
                },
                behaviourKey: {
                    type: 'string',
                    enum: [
                        'BHV-01',
                        'BHV-02',
                        'BHV-03',
                        'BHV-04',
                        'BHV-05'
                    ]
                },
                headlineTitle: {
                    type: 'string',
                    minLength: 1,
                    pattern: '\\S'
                },
                focusKey: {
                    type: 'string',
                    minLength: 1,
                    pattern: '\\S'
                },
                focusTitle: {
                    type: 'string',
                    minLength: 1,
                    pattern: '\\S'
                },
                roleLevelCode: {
                    type: 'string',
                    enum: [
                        'L1',
                        'L2',
                        'L3'
                    ]
                },
                selectedWording: {
                    type: 'string',
                    minLength: 1,
                    pattern: '\\S'
                },
                catalogueId: {
                    type: 'string',
                    minLength: 1,
                    pattern: '\\S'
                },
                catalogueVersion: {
                    type: 'string',
                    minLength: 1,
                    pattern: '\\S'
                },
                catalogueRevision: {
                    type: 'integer',
                    minimum: 1,
                    maximum: 9007199254740991
                },
                catalogueEtag: {
                    type: 'string',
                    minLength: 1,
                    pattern: '\\S'
                },
                catalogueContentSha256: {
                    type: 'string',
                    pattern: '^[A-F0-9]{64}$'
                },
                myCommitment: {
                    type: 'string'
                },
                howWillWeKnow: {
                    type: 'string'
                },
                targetKey: {
                    type: 'string',
                    minLength: 1,
                    pattern: '\\S'
                }
            }
        },
        headline: {
            type: 'object',
            additionalProperties: false,
            required: [
                'behaviourKey',
                'headlineTitle',
                'selections'
            ],
            properties: {
                behaviourKey: {
                    type: 'string',
                    enum: [
                        'BHV-01',
                        'BHV-02',
                        'BHV-03',
                        'BHV-04',
                        'BHV-05'
                    ]
                },
                headlineTitle: {
                    type: 'string',
                    minLength: 1,
                    pattern: '\\S'
                },
                selections: {
                    type: 'array',
                    items: {
                        $ref: '#/$defs/behaviourSelection'
                    },
                    maxItems: 5
                }
            }
        },
        governedBehaviourExtension: {
            type: 'object',
            additionalProperties: false,
            required: [
                'authority',
                'deliveryArithmeticAffected',
                'headlines',
                'immutableSelectionSnapshots',
                'legacyTargetRatingWeightFieldsWritten',
                'roleLevelCode',
                'schemaVersion'
            ],
            properties: {
                schemaVersion: {
                    const: 'demo.option-e.behaviours/v02',
                    type: 'string'
                },
                authority: {
                    $ref: '#/$defs/behaviourAuthority'
                },
                roleLevelCode: {
                    type: 'string',
                    enum: [
                        'L1',
                        'L2',
                        'L3'
                    ]
                },
                headlines: {
                    type: 'array',
                    items: {
                        $ref: '#/$defs/headline'
                    },
                    minItems: 5,
                    maxItems: 5
                },
                immutableSelectionSnapshots: {
                    const: true,
                    type: 'boolean'
                },
                legacyTargetRatingWeightFieldsWritten: {
                    const: false,
                    type: 'boolean'
                },
                deliveryArithmeticAffected: {
                    const: false,
                    type: 'boolean'
                }
            }
        },
        publicationPin: {
            type: 'object',
            additionalProperties: false,
            required: [
                'contentSha256',
                'etag',
                'key',
                'version'
            ],
            properties: {
                key: {
                    type: 'string',
                    minLength: 1,
                    pattern: '\\S'
                },
                version: {
                    type: 'string',
                    minLength: 1,
                    pattern: '\\S'
                },
                etag: {
                    type: 'string',
                    minLength: 1,
                    pattern: '\\S'
                },
                contentSha256: {
                    type: 'string',
                    pattern: '^[0-9a-fA-F]{64}$'
                }
            }
        },
        overallDeliveryClaim: {
            type: 'object',
            additionalProperties: false,
            required: [
                'configurationKey',
                'configurationVersion',
                'coreWeight',
                'impactWeight',
                'sourceReference'
            ],
            properties: {
                configurationKey: {
                    type: 'string',
                    minLength: 1,
                    pattern: '\\S'
                },
                configurationVersion: {
                    type: 'string',
                    minLength: 1,
                    pattern: '\\S'
                },
                coreWeight: {
                    type: 'number',
                    minimum: 0,
                    maximum: 100
                },
                impactWeight: {
                    type: 'number',
                    minimum: 0,
                    maximum: 100
                },
                sourceReference: {
                    const: 'DEMO-APP-PETE-PD-01',
                    type: 'string'
                },
                publicationPin: {
                    $ref: '#/$defs/publicationPin'
                }
            }
        }
    }
};

interface IDeclaredSchema {
    $ref?: string;
    $defs?: Record<string, IDeclaredSchema>;
    oneOf?: IDeclaredSchema[];
    type?: string | string[];
    properties?: Record<string, IDeclaredSchema>;
    required?: string[];
    items?: IDeclaredSchema;
    minItems?: number;
    maxItems?: number;
    uniqueItems?: boolean;
    minLength?: number;
    minimum?: number;
    maximum?: number;
    pattern?: string;
    const?: unknown;
    enum?: unknown[];
}
const invalid = (path: string, reason: string): never => {
    throw new OptionEDraftValidationError('DraftPayloadInvalid', `${path}: ${reason}`);
};
const own = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);
const matchesDeclaredPattern = (value: string, pattern: string): boolean => {
    switch (pattern) {
        case '\\S': return /\S/.test(value);
        case '^[0-9a-fA-F]{64}$': return /^[0-9a-fA-F]{64}$/.test(value);
        case '^[A-F0-9]{64}$': return /^[A-F0-9]{64}$/.test(value);
        default: return invalid('Private Draft schema', 'Unsupported declared string pattern.');
    }
};
/** Interprets only this issued closed schema. No external schema/reference loader. */
const validateStructure = (value: unknown, schema: IDeclaredSchema, path: string): void => {
    if (schema.$ref) {
        const key = schema.$ref.slice('#/$defs/'.length);
        const definitions = (PARTIAL_DRAFT_V3_SCHEMA as IDeclaredSchema).$defs!;
        if (!schema.$ref.startsWith('#/$defs/') || !own(definitions, key))
            invalid(path, 'Unknown schema reference.');
        validateStructure(value, definitions[key], path);
        return;
    }
    if (schema.oneOf || Array.isArray(schema.type)) {
        const alternatives = schema.oneOf || (schema.type as string[]).map(type => ({ ...schema, type }));
        let matched = 0;
        alternatives.forEach(alternative => {
            try {
                validateStructure(value, alternative, path);
                matched += 1;
            }
            catch (error) {
                if (!(error instanceof OptionEDraftValidationError))
                    throw error;
            }
        });
        if (matched !== 1)
            invalid(path, 'Expected one declared representation.');
        return;
    }
    if (schema.type === 'object') {
        if (!value || typeof value !== 'object' || Array.isArray(value))
            invalid(path, 'Expected an object.');
        const prototype = Object.getPrototypeOf(value);
        if (prototype !== Object.prototype && prototype !== null)
            invalid(path, 'Expected a JSON object.');
        const object = value as Record<string, unknown>, properties = schema.properties!;
        if (Reflect.ownKeys(object).some(key => typeof key !== 'string' || !own(properties, key))) {
            invalid(path, 'Undeclared field.');
        }
        const required = schema.required || [];
        if (required.some(key => !own(object, key) || object[key] === undefined))
            invalid(path, 'Missing required field.');
        Object.keys(object).forEach(key => {
            // Only a declared optional undefined field maps to absence.
            if (object[key] !== undefined)
                validateStructure(object[key], properties[key], `${path}.${key}`);
        });
    }
    else if (schema.type === 'array') {
        if (!Array.isArray(value))
            invalid(path, 'Expected an array.');
        const array = value as unknown[];
        if ((schema.minItems !== undefined && array.length < schema.minItems)
            || (schema.maxItems !== undefined && array.length > schema.maxItems))
            invalid(path, 'Array length is outside the contract.');
        for (let index = 0; index < array.length; index += 1) {
            if (!own(array, String(index)))
                invalid(path, 'Missing array entry.');
            validateStructure(array[index], schema.items!, `${path}[${index}]`);
        }
        if (schema.uniqueItems && new Set(array.map(entry => JSON.stringify(entry))).size !== array.length) {
            invalid(path, 'Repeated array value.');
        }
    }
    else if (schema.type === 'number' || schema.type === 'integer') {
        if (typeof value !== 'number' || !Number.isFinite(value) || Object.is(value, -0)
            || (schema.type === 'integer' && !Number.isInteger(value))
            || (schema.minimum !== undefined && value < schema.minimum)
            || (schema.maximum !== undefined && value > schema.maximum))
            invalid(path, 'Invalid finite numeric value.');
    }
    else if (schema.type === 'string') {
        if (typeof value !== 'string' || (schema.minLength !== undefined && value.length < schema.minLength)
            || (schema.pattern !== undefined && !matchesDeclaredPattern(value, schema.pattern)))
            invalid(path, 'Invalid string value.');
    }
    else if (schema.type === 'boolean') {
        if (typeof value !== 'boolean')
            invalid(path, 'Expected a boolean.');
    }
    else
        invalid(path, 'Unsupported declared type.');
    if (own(schema, 'const') && value !== schema.const)
        invalid(path, 'Unexpected constant.');
    if (schema.enum && !schema.enum.includes(value))
        invalid(path, 'Unknown selection.');
};
const nonBlank = (value: string, path: string): void => { if (!value.trim())
    invalid(path, 'Stable identity must not be blank.'); };
const distinct = (values: string[], path: string): void => {
    values.forEach(value => nonBlank(value, path));
    if (new Set(values).size !== values.length)
        invalid(path, 'Repeated logical identity.');
};
const pin = (value: IOptionEDraftV3TaxonomyPin | IOptionEDraftV3PublicationPin, path: string): void => {
    if (!/^"[^"\r\n]+"$/.test(value.etag) || value.etag === '"*"' || !/^[a-fA-F0-9]{64}$/.test(value.contentSha256)) {
        invalid(path, 'A full reference pin needs a strong ETag and SHA-256.');
    }
    nonBlank(value.version, path + '.version');
    nonBlank('taxonomyId' in value ? value.taxonomyId : value.key, path + '.key');
};
export const validateOptionEPartialDraftV3Aggregate: (value: unknown) => asserts value is IOptionEWorkplanDraftV3Aggregate = (value: unknown): asserts value is IOptionEWorkplanDraftV3Aggregate => {
    validateStructure(value, PARTIAL_DRAFT_V3_SCHEMA as IDeclaredSchema, 'Private Draft V3');
    const draft = value as IOptionEWorkplanDraftV3Aggregate;
    distinct(draft.core.entries.map(entry => entry.coreId), 'Core IDs');
    distinct(draft.impact.map(entry => entry.impactId), 'Impact IDs');
    const roleFamilies: Record<NonNullable<IOptionEDraftV3CoreEntry['nativeRole']>, IOptionEDraftV3CoreEntry['role']> = {
        AccountableOwner: 'Owner', DeliveryLead: 'Delivery', Contributor: 'Delivery', Oversight: 'Support', EvidenceProvider: 'Support'
    };
    draft.core.entries.forEach(entry => {
        nonBlank(entry.kpiId, 'Core KPI ID');
        if (entry.nativeRole !== undefined && roleFamilies[entry.nativeRole] !== entry.role)
            invalid('Core role', 'Native alias disagrees with editor family.');
    });
    draft.impact.forEach(entry => {
        const claim = entry.classification;
        if (claim.state === 'Unselected')
            return;
        if (!claim.businessContributionArea && !claim.strategicPillar)
            invalid('Classification', 'Incomplete claims need an actual selection.');
        if (claim.taxonomyPin)
            pin(claim.taxonomyPin, 'Taxonomy pin');
        [claim.businessContributionArea, claim.strategicPillar].forEach(selection => {
            if (!selection)
                return;
            nonBlank(selection.key, 'Classification key');
            const claimedPin = claim.taxonomyPin;
            if (claimedPin && ((selection.taxonomyId !== undefined && selection.taxonomyId !== claimedPin.taxonomyId)
                || (selection.taxonomyVersion !== undefined && selection.taxonomyVersion !== claimedPin.version)
                || (selection.taxonomyEtag !== undefined && selection.taxonomyEtag !== claimedPin.etag))) {
                invalid('Classification', 'Selection provenance disagrees with its pin.');
            }
        });
    });
    const overall = draft.referenceClaims?.overallDelivery;
    if (overall) {
        nonBlank(overall.configurationKey, 'Configuration key');
        nonBlank(overall.configurationVersion, 'Configuration version');
        if (overall.coreWeight + overall.impactWeight !== 100)
            invalid('Overall claim', 'Captured weights must total 100.');
        if (overall.publicationPin)
            pin(overall.publicationPin, 'Publication pin');
    }
    // Validation only: retain the full V3 graph in the result. The unchanged V1
    // validator checks its existing Behaviour identities, never serializes V3.
    validateOptionEPartialDraftAggregate({ schemaVersion: OPTION_E_DRAFT_SCHEMA_VERSION,
        core: { weightingMode: 'Equal', entries: [] }, impact: [], behaviours: {
            frameworkVersion: draft.behaviours.frameworkVersion, roleTier: draft.behaviours.roleTier,
            entries: draft.behaviours.entries.map(entry => ({ valueId: entry.valueId, descriptorKey: entry.descriptorKey,
                guidancePromptKeys: entry.guidancePromptKeys, selectedPromptKeys: entry.selectedPromptKeys, commitment: entry.commitment,
                periodCommitments: { Q1: entry.periodCommitments.Q1, Q2: entry.periodCommitments.Q2,
                    Q3: entry.periodCommitments.Q3, Q4: entry.periodCommitments.Q4 } })),
            ...(draft.behaviours.governedExtension ? { governedExtension: draft.behaviours.governedExtension } : {})
        } });
};
// Exact declarations from issued Technical008 field contract; no native authority.
export type IOptionEDraftV3TargetSlot = {
    kind: 'Scalar';
    value?: string | number;
    success?: string;
    commitment?: string;
    successDefinition?: string;
    editorText?: string;
} | {
    kind: 'NativePair';
    numericValue?: number;
    textValue?: string;
    success?: string;
    commitment?: string;
    successDefinition?: string;
    editorText?: string;
};
export type IOptionEDraftV3Targets = {
    annual: IOptionEDraftV3TargetSlot;
    q1: IOptionEDraftV3TargetSlot;
    q2: IOptionEDraftV3TargetSlot;
    q3: IOptionEDraftV3TargetSlot;
    q4: IOptionEDraftV3TargetSlot;
};
export type IOptionEDraftV3CoreEntry = {
    coreId: string;
    kpiId: string;
    kpiVersionKey: string;
    targetVersionKey: string;
    role: 'Owner' | 'Delivery' | 'Support' | '';
    contributionMethod: 'AdditiveDirect' | 'SharedTarget' | 'WeightedDenominator' | 'AccountableOwner' | 'CompletionOversight' | '';
    targets: IOptionEDraftV3Targets;
    nativeRole?: 'AccountableOwner' | 'DeliveryLead' | 'Contributor' | 'Oversight' | 'EvidenceProvider';
    weightPercent?: number;
    sharedTargetRule?: 'VisibleOnly' | 'ApprovedApportionment';
    sharedApportionmentPercent?: number;
    governanceReference?: string;
    denominatorNumerator?: number;
    denominatorValue?: number;
    denominatorUnit?: string;
    denominatorRuleReference?: string;
    denominatorSourceReference?: string;
    nativeQuarterOrder?: Array<'Q1' | 'Q2' | 'Q3' | 'Q4'>;
    displayOrder?: number;
    activeInWorkplan?: boolean;
};
export type IOptionEDraftV3ImpactEntry = {
    impactId: string;
    wording: string;
    measure: string;
    unitLabel: string;
    targets: IOptionEDraftV3Targets;
    editorDefinition: {
        measure: 'Number / Quantity' | 'Percentage' | 'Milestone / Completion' | '';
        success: string;
        intendedOutcome?: string;
        successCriterion?: string;
    };
    classification: IOptionEDraftV3ClassificationClaim;
    description?: string;
    measureType?: 'Count' | 'Number' | 'Percentage' | 'Currency' | 'Rate' | 'Days' | 'Score' | 'Milestone' | 'TextStatus' | 'Other';
    scoringDirection?: 'HigherIsBetter' | 'LowerIsBetter' | 'TargetRange' | 'Milestone' | 'TBC';
    percentageSourceScale?: 'Fraction' | 'Whole';
    baselineValue?: number;
    personalItemWeight?: number;
    displayOrder?: number;
    activeInWorkplan?: boolean;
};
export type IOptionEDraftV3ClassificationClaim = {
    state: 'Unselected';
} | {
    state: 'Incomplete';
    strategicPillar?: IOptionEDraftV3SelectionClaim;
    businessContributionArea?: IOptionEDraftV3SelectionClaim;
    taxonomyPin?: IOptionEDraftV3TaxonomyPin;
} | {
    state: 'RetainedUnresolved';
    strategicPillar?: IOptionEDraftV3SelectionClaim;
    businessContributionArea?: IOptionEDraftV3SelectionClaim;
    taxonomyPin?: IOptionEDraftV3TaxonomyPin;
} | {
    state: 'Pinned';
    businessContributionArea: IOptionEDraftV3SelectionClaim;
    taxonomyPin: IOptionEDraftV3TaxonomyPin;
    strategicPillar?: IOptionEDraftV3SelectionClaim;
};
export type IOptionEDraftV3SelectionClaim = {
    key: string;
    label?: string;
    source?: string;
    sourceReference?: string;
    taxonomyId?: string;
    taxonomyVersion?: string;
    taxonomyEtag?: string;
    taxonomyApprovalReference?: 'DEMO-APP-PETE-PD-02';
};
export type IOptionEDraftV3TaxonomyPin = {
    taxonomyId: string;
    version: string;
    etag: string;
    contentSha256: string;
};
export type IOptionEDraftV3BehaviourEntry = {
    valueId: 'BHV-01' | 'BHV-02' | 'BHV-03' | 'BHV-04' | 'BHV-05';
    descriptorKey: string;
    guidancePromptKeys: Array<string>;
    selectedPromptKeys: Array<string>;
    commitment: string;
    periodCommitments: IOptionEDraftV3BehaviourPeriods;
    planningLevels?: IOptionEDraftV3PlanningLevels;
    cadenceClaim?: 'Quarterly' | 'TwiceYearly';
    displayOrder?: number;
    activeInWorkplan?: boolean;
};
export type IOptionEDraftV3BehaviourPeriods = {
    Q1: string;
    Q2: string;
    Q3: string;
    Q4: string;
    H1?: string;
    H2?: string;
};
export type IOptionEDraftV3PlanningLevels = {
    contractVersion: 'BHV-LEVELS|v01';
    currentLevel?: 'Developing' | 'Effective' | 'Exceptional';
    targetLevel?: 'Developing' | 'Effective' | 'Exceptional';
    targetJustification?: string;
};
export type IOptionEDraftV3BehaviourAuthority = {
    catalogueId: string;
    catalogueVersion: string;
    catalogueRevision: number;
    catalogueEtag: string;
    catalogueContentSha256: string;
    approvalReference: 'DEMO-APP-PETE-BEH-V02-001';
};
export type IOptionEDraftV3BehaviourSelection = {
    selectionKey: string;
    source: 'Catalogue' | 'Own';
    behaviourKey: 'BHV-01' | 'BHV-02' | 'BHV-03' | 'BHV-04' | 'BHV-05';
    headlineTitle: string;
    focusKey: string;
    focusTitle: string;
    roleLevelCode: 'L1' | 'L2' | 'L3';
    selectedWording: string;
    catalogueId: string;
    catalogueVersion: string;
    catalogueRevision: number;
    catalogueEtag: string;
    catalogueContentSha256: string;
    myCommitment: string;
    howWillWeKnow: string;
    targetKey?: string;
};
export type IOptionEDraftV3Headline = {
    behaviourKey: 'BHV-01' | 'BHV-02' | 'BHV-03' | 'BHV-04' | 'BHV-05';
    headlineTitle: string;
    selections: Array<IOptionEDraftV3BehaviourSelection>;
};
export type IOptionEDraftV3GovernedBehaviourExtension = {
    schemaVersion: 'demo.option-e.behaviours/v02';
    authority: IOptionEDraftV3BehaviourAuthority;
    roleLevelCode: 'L1' | 'L2' | 'L3';
    headlines: Array<IOptionEDraftV3Headline>;
    immutableSelectionSnapshots: true;
    legacyTargetRatingWeightFieldsWritten: false;
    deliveryArithmeticAffected: false;
};
export type IOptionEDraftV3PublicationPin = {
    key: string;
    version: string;
    etag: string;
    contentSha256: string;
};
export type IOptionEDraftV3OverallDeliveryClaim = {
    configurationKey: string;
    configurationVersion: string;
    coreWeight: number;
    impactWeight: number;
    sourceReference: 'DEMO-APP-PETE-PD-01';
    publicationPin?: IOptionEDraftV3PublicationPin;
};
export type IOptionEWorkplanDraftV3Aggregate = {
    schemaVersion: 'demo.workplan-draft/v3';
    core: {
        weightingMode: 'Equal' | 'Custom';
        entries: Array<IOptionEDraftV3CoreEntry>;
    };
    impact: Array<IOptionEDraftV3ImpactEntry>;
    behaviours: {
        frameworkVersion: 'DEMO-BEHAVIOUR|v02';
        roleTier: string;
        entries: Array<IOptionEDraftV3BehaviourEntry>;
        governedExtension?: IOptionEDraftV3GovernedBehaviourExtension;
    };
    referenceClaims?: {
        overallDelivery?: IOptionEDraftV3OverallDeliveryClaim;
    };
    employeeNotes?: {
        categoryWeightReason?: string;
        zeroPersonalReason?: string;
    };
};
