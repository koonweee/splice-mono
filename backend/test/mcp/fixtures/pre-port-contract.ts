/**
 * Frozen executable parity oracle captured from the PAT/SDK-v1 MCP surface
 * before its hard cutover. Update only for an intentional, reviewed MCP
 * contract change—not as a mechanical consequence of an implementation port.
 */
export const PRE_PORT_MCP_CONTRACT = {
  tools: [
    'get_user_context',
    'get_accounts_snapshot',
    'get_balance_history',
    'search_transactions',
    'list_transactions',
    'list_balance_snapshots',
    'list_categories',
    'list_investment_holdings',
    'list_investment_activity',
    'list_recurring_manual_transaction_schedules',
    'list_analysis_rules',
    'list_categorization_rules',
    'list_categorization_rule_recommendations',
    'list_manual_categorized_transaction_examples',
    'list_rule_candidate_patterns',
    'preview_categorization_rule_draft',
    'create_categorization_rule',
    'preview_categorization_rule_application',
    'apply_categorization_rule',
    'get_cashflow_analysis',
    'list_cashflow_category_transactions',
    'get_cashflow_analysis_audit',
    'show_cashflow_explorer',
    'show_projection_scenario_modeler',
    'show_portfolio_viewer',
    'show_category_rule_workbench',
    'collect_projection_assumptions',
  ],
  /** SHA-256 of each complete normalized listTools contract. */
  toolContractSha256: [
    [
      'get_user_context',
      '1c27ea03bde72b22f3d3462148af5bab991d3c38170a04052d59094b3d91b887',
    ],
    [
      'get_accounts_snapshot',
      'ac79f997dfda9f0aeea829590d9397aba5bfc489371c071918bd1268bdf8df7f',
    ],
    [
      'get_balance_history',
      '7e279e44546fb8ba4442fe1595edaaa0370ed1de9009ad1019bc15149b1154ee',
    ],
    [
      'search_transactions',
      'b085e365e4bbe15903764f89c1d61e556d7d02b399e15f8b1351ceaffcff9937',
    ],
    [
      'list_transactions',
      'd22e8499deac8b9b05dd940ba3bf6bae9c4bf1fdd7359fbadafa0261bb7efd7c',
    ],
    [
      'list_balance_snapshots',
      'cc753d762bb5df9737997a31c7f6460e183e07d88a77a2d2ae7539241f9e6d77',
    ],
    [
      'list_categories',
      'ab38d5d9121da9025974cdea7189acd611c5e5e058274ea8da38d6bcee7b524a',
    ],
    [
      'list_investment_holdings',
      'c6985d020ce825e61dd94bb1ce8298e5b9db41622d74743d87d42cb10ff2f7f6',
    ],
    [
      'list_investment_activity',
      '4884af6aa180b865bb5c8cca29ecb478ad0324b78a015b611e10af641dc0b9d1',
    ],
    [
      'list_recurring_manual_transaction_schedules',
      '5a98b41686030672582911fb517202196fc804c0bf6c9cd212494e482a42a468',
    ],
    [
      'list_analysis_rules',
      '69631284248acb1ef1cee3b5fc43631a2917e4da891c8807b59f5d9de0cc5ed9',
    ],
    [
      'list_categorization_rules',
      '79af01049e664fd3d4d8cd081f384f8e2abd6cb763341c695c769782610e694f',
    ],
    [
      'list_categorization_rule_recommendations',
      '7e8b3df25c18f95a1946f10020abf1c23b40516fc317d4277027adbf4ae1aa70',
    ],
    [
      'list_manual_categorized_transaction_examples',
      'f00ea11bf1c12a393a1bd7a2de872cdf751ea00ba4db54c298730e998c551c15',
    ],
    [
      'list_rule_candidate_patterns',
      '4b209889a5fe92f19ee00027aa00f9716ff0fb84f37e1dfb3c9dc2bbb645811b',
    ],
    [
      'preview_categorization_rule_draft',
      'e2ef1ec64710d2e309708426df647351e8683f0632e48044ed0d939a00defad8',
    ],
    [
      'create_categorization_rule',
      '73ddf83d4c3af8c193b191d986f1138633dfb0d3ae787b1de98823df96c502e4',
    ],
    [
      'preview_categorization_rule_application',
      '760628308bdebe7c888e46d376776f5d545b58c6340027d5fd8510fc83a7626a',
    ],
    [
      'apply_categorization_rule',
      'f6230563a6fffb1cc065152f22149757c4ace74df4ddf558de08366931b0866d',
    ],
    [
      'get_cashflow_analysis',
      'e99251a70543c99b0e6405a496681a9be1e062b27309820283f3bf84516e2ec7',
    ],
    [
      'list_cashflow_category_transactions',
      '94e6102003ee10feb9c186d252468306534456a39b06103a60e40f6f462dcb33',
    ],
    [
      'get_cashflow_analysis_audit',
      '8425953bf5209b4fb6a0831ecd98174df6184f8dc2b49ed885b55d632c2c79c5',
    ],
    [
      'show_cashflow_explorer',
      '5a81247e502bb66a0b8a57bbbb93c412a18c5238a51af42036bbf37844f84855',
    ],
    [
      'show_projection_scenario_modeler',
      '0c2527a1c4e02271596698857607588801e9c0e975fa8d7e6cda0bf0625c2567',
    ],
    [
      'show_portfolio_viewer',
      'cfb9998990d0688720b8ecb2f8cc975d7f0a92d7a57f01328dff2f9c3a710976',
    ],
    [
      'show_category_rule_workbench',
      'dad71fdaf1ac1093711c4ffee776c3eb41b34c890e94b02533013ac6e91c631b',
    ],
    [
      'collect_projection_assumptions',
      'f62ec12504e79263d71496eb3a3c366db0ddd2f0f45ca480d3b944c7507eabb5',
    ],
  ].map(([name, sha256]) => ({ name, sha256 })),
  fixedResources: [
    'splice://mcp-guide',
    'ui://splice/cashflow-explorer.html',
    'ui://splice/projection-scenario-modeler.html',
    'ui://splice/portfolio-viewer.html',
    'ui://splice/category-rule-workbench.html',
  ],
  resourceTemplates: [
    'splice://reports/cashflow/{startDate}/{endDate}',
    'splice://accounts/{accountId}/snapshot',
    'splice://categories/taxonomy',
    'splice://rules/analysis',
    'splice://portfolio/holdings/latest',
  ],
  prompts: [
    'category_cleanup_audit',
    'monthly_cashflow_review',
    'portfolio_snapshot',
    'projection_builder',
    'tax_or_refund_anomaly_review',
  ],
  apps: {
    show_cashflow_explorer: 'ui://splice/cashflow-explorer.html',
    show_projection_scenario_modeler:
      'ui://splice/projection-scenario-modeler.html',
    show_portfolio_viewer: 'ui://splice/portfolio-viewer.html',
    show_category_rule_workbench: 'ui://splice/category-rule-workbench.html',
  },
  paginatedOutputs: {
    list_transactions: ['data', 'pageInfo', 'query'],
    list_balance_snapshots: ['data', 'pageInfo', 'query'],
    list_investment_activity: ['data', 'pageInfo', 'query'],
  },
  moneyFields: ['amount', 'currency', 'sign'],
  writes: {
    create_categorization_rule: {
      preview: 'preview_categorization_rule_draft',
      requiredInput: 'previewToken',
      risk: 'mutating',
    },
    apply_categorization_rule: {
      preview: 'preview_categorization_rule_application',
      requiredInput: 'previewToken',
      risk: 'destructive',
      idempotent: true,
    },
  },
  projection: {
    nonPersistent: true,
    fields: [
      'horizonDate',
      'goalName',
      'recurringIncomeAdjustment',
      'recurringExpenseAdjustment',
      'oneTimeEventsText',
      'expectedAnnualReturnPercent',
    ],
  },
} as const;
