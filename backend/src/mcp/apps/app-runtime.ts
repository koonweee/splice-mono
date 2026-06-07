export function getMcpAppRuntimeScript(): string {
  return String.raw`
(function () {
  'use strict';

  var appRoot = document.getElementById('splice-mcp-app-root');
  var fixtureEl = document.getElementById('splice-mcp-app-fixture');
  var fixtureEnvelope = parseJson(fixtureEl ? fixtureEl.textContent : null) || {};
  var appId = appRoot ? appRoot.getAttribute('data-app-id') : '';
  var requestId = 1;
  var pending = {};
  var bridgeSeen = false;
  var toolInput = null;
  var envelope = fixtureEnvelope;
  var remoteDataLoaded = false;
  var state = {
    selectedFlow: 'outflow',
    selectedCategory: null,
    categorySearch: '',
    summaryMode: 'net',
    drilldownRows: [],
    audit: null,
    portfolioSort: 'value',
    portfolioSearch: '',
    portfolioAccount: 'all',
    portfolioType: 'all',
    portfolioDateMode: 'latest',
    portfolioSnapshotDate: '2026-03-31',
    portfolioCursor: null,
    activeTab: 'categories',
    ruleSearch: '',
    ruleStatus: 'all',
    includeArchived: false,
    detail: null,
    scenario: {
      name: 'Runway scenario',
      horizonDate: '2027-12-31',
      incomeAdjustment: 0,
      expenseAdjustment: 0,
      expectedReturn: 5,
      selectedAccounts: {},
      events: []
    }
  };

  function parseJson(value) {
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch (_error) {
      return null;
    }
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function toArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function moneyAmount(value) {
    if (value == null) return 0;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      var parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    if (typeof value === 'object') {
      if (value.money) return moneyAmount(value.money);
      if (value.amount != null) return moneyAmount(value.amount);
    }
    return 0;
  }

  function moneyCurrency(value, fallback) {
    if (value && typeof value === 'object') {
      if (value.currency) return String(value.currency);
      if (value.money && value.money.currency) return String(value.money.currency);
    }
    return fallback || 'USD';
  }

  function moneySign(value) {
    if (value && typeof value === 'object' && value.sign) return String(value.sign);
    return moneyAmount(value) < 0 ? 'negative' : 'positive';
  }

  function formatMoney(value, fallbackCurrency) {
    var amount = Math.abs(moneyAmount(value));
    var currency = moneyCurrency(value, fallbackCurrency);
    var sign = moneySign(value) === 'negative' ? '-' : '';
    return sign + new Intl.NumberFormat('en-US', {
      style: currency.length === 3 ? 'currency' : 'decimal',
      currency: currency.length === 3 ? currency : 'USD',
      maximumFractionDigits: 2
    }).format(amount) + (currency.length === 3 ? '' : ' ' + currency);
  }

  function formatCategory(value) {
    return String(value || 'Uncategorized')
      .toLowerCase()
      .split('_')
      .filter(Boolean)
      .map(function (part) { return part.charAt(0).toUpperCase() + part.slice(1); })
      .join(' ');
  }

  function readEnvelopeData() {
    var content = envelope && envelope.structuredContent ? envelope.structuredContent : envelope;
    if (content && content.data) return content.data;
    return content || {};
  }

  function structuredResult(result) {
    if (!result) return {};
    if (result.structuredContent) return result.structuredContent;
    if (result.result && result.result.structuredContent) return result.result.structuredContent;
    return result;
  }

  function setStatus(message, kind) {
    var status = document.getElementById('app-status');
    if (!status) return;
    status.textContent = message;
    status.dataset.kind = kind || 'info';
  }

  function notifySizeChanged() {
    if (!bridgeSeen) return;
    sendNotification('ui/notifications/size-changed', {
      height: Math.ceil(document.documentElement.scrollHeight),
      width: Math.ceil(document.documentElement.scrollWidth)
    });
  }

  function sendRequest(method, params) {
    if (window.parent === window) {
      return Promise.reject(new Error('MCP Apps host bridge unavailable'));
    }

    var id = requestId++;
    var message = { jsonrpc: '2.0', id: id, method: method, params: params || {} };
    window.parent.postMessage(message, '*');

    return new Promise(function (resolve, reject) {
      pending[id] = { resolve: resolve, reject: reject };
      window.setTimeout(function () {
        if (!pending[id]) return;
        delete pending[id];
        reject(new Error('Timed out waiting for host bridge response'));
      }, 15000);
    });
  }

  function sendNotification(method, params) {
    if (window.parent === window) return;
    window.parent.postMessage({ jsonrpc: '2.0', method: method, params: params || {} }, '*');
  }

  function callTool(name, args) {
    if (!bridgeSeen) {
      return Promise.reject(new Error('MCP Apps host bridge unavailable'));
    }
    return sendRequest('tools/call', { name: name, arguments: args || {} }).then(structuredResult);
  }

  function updateModelContext(text, structuredContent) {
    if (!bridgeSeen) {
      setStatus('Host bridge unavailable. Scenario summary is shown locally only.', 'warn');
      return Promise.resolve();
    }
    return sendRequest('ui/update-model-context', {
      content: [{ type: 'text', text: text }],
      structuredContent: structuredContent || {}
    }).then(function () {
      setStatus('Scenario summary sent to model context.', 'success');
    }).catch(function (error) {
      setStatus(error.message, 'warn');
    });
  }

  function handleHostMessage(event) {
    var message = event.data;
    if (!message || typeof message !== 'object' || message.jsonrpc !== '2.0') return;

    if (message.id != null && pending[message.id]) {
      var entry = pending[message.id];
      delete pending[message.id];
      if (message.error) {
        entry.reject(new Error(message.error.message || 'Host bridge request failed'));
      } else {
        entry.resolve(message.result || {});
      }
      return;
    }

    if (message.method === 'ui/notifications/tool-input') {
      bridgeSeen = true;
      toolInput = message.params && message.params.arguments ? message.params.arguments : {};
      render();
    }

    if (message.method === 'ui/notifications/tool-result') {
      bridgeSeen = true;
      envelope = message.params || envelope;
      remoteDataLoaded = true;
      setStatus('Connected to MCP host data.', 'success');
      render();
    }

    if (message.method === 'ui/notifications/host-context-changed' && message.params) {
      applyHostContext(message.params.hostContext || message.params);
    }
  }

  function applyHostContext(hostContext) {
    if (!hostContext) return;
    if (hostContext.theme) document.documentElement.dataset.theme = hostContext.theme;
    var variables = hostContext.styles && hostContext.styles.variables ? hostContext.styles.variables : {};
    Object.keys(variables).forEach(function (key) {
      if (variables[key]) document.documentElement.style.setProperty(key, variables[key]);
    });
  }

  function initializeBridge() {
    window.addEventListener('message', handleHostMessage);
    if (window.parent !== window) {
      sendRequest('ui/initialize', {
        protocolVersion: '2026-01-26',
        capabilities: {},
        clientInfo: { name: 'Splice MCP App', version: '1.0.0' },
        appCapabilities: { availableDisplayModes: ['inline', 'fullscreen'] }
      }).then(function (result) {
        bridgeSeen = true;
        applyHostContext(result.hostContext);
        sendNotification('ui/notifications/initialized', {});
        setStatus('Waiting for MCP tool result...', 'info');
      }).catch(function () {
        setStatus('Rendering local fixture. MCP Apps host bridge was not detected.', 'warn');
      });
    }
    window.setTimeout(function () {
      if (!remoteDataLoaded && !bridgeSeen) {
        setStatus('Rendering local fixture. MCP Apps host bridge was not detected.', 'warn');
      }
      render();
    }, 350);
  }

  function button(attrs, text) {
    return '<button ' + attrs + '>' + escapeHtml(text) + '</button>';
  }

  function metric(label, value, tone) {
    return '<div class="metric" data-tone="' + escapeHtml(tone || 'neutral') + '">' +
      '<div class="label">' + escapeHtml(label) + '</div>' +
      '<div class="value">' + escapeHtml(value) + '</div>' +
      '</div>';
  }

  function rowsEmpty(message) {
    return '<div class="empty">' + escapeHtml(message) + '</div>';
  }

  function renderCashflow() {
    var data = readEnvelopeData();
    var totals = data.totals || {};
    var currency = data.currency || 'USD';
    var startDate = (toolInput && toolInput.startDate) || data.startDate || '2026-03-01';
    var endDate = (toolInput && toolInput.endDate) || data.endDate || '2026-03-31';
    var inflows = toArray(data.inflows);
    var outflows = toArray(data.outflows);
    var categories = state.selectedFlow === 'inflow' ? inflows : outflows;
    var query = state.categorySearch.trim().toLowerCase();
    var filtered = categories.filter(function (category) {
      return formatCategory(category.primaryCategory).toLowerCase().indexOf(query) >= 0;
    });
    var maxAmount = Math.max.apply(null, filtered.map(function (category) {
      return Math.abs(moneyAmount(category.totalAmount));
    }).concat([1]));

    var categoryHtml = filtered.length
      ? filtered.map(function (category, index) {
          var primary = category.primaryCategory || 'UNCATEGORIZED';
          var width = Math.max(4, Math.round((Math.abs(moneyAmount(category.totalAmount)) / maxAmount) * 100));
          var selected = state.selectedCategory === primary ? 'true' : 'false';
          var color = category.color || colorForIndex(index);
          return '<button class="category-row" data-action="select-category" data-category="' + escapeHtml(primary) + '" aria-pressed="' + selected + '">' +
            '<span class="swatch" style="background:' + escapeHtml(color) + '"></span>' +
            '<span class="category-main"><span>' + escapeHtml(formatCategory(primary)) + '</span><span class="bar-track"><span class="bar-fill" style="width:' + width + '%;background:' + escapeHtml(color) + '"></span></span></span>' +
            '<span class="number-stack"><strong>' + escapeHtml(formatMoney(category.totalAmount, currency)) + '</strong><small>' + escapeHtml(String(category.transactionCount || 0)) + ' txns</small></span>' +
            '</button>';
        }).join('')
      : rowsEmpty('No matching categories.');

    var drilldown = renderCashflowDrilldown(currency);
    var audit = state.audit ? renderAuditRows(state.audit.rows || state.audit.data || []) : rowsEmpty('Open audit effects to inspect rule and neutralization impact.');

    appRoot.innerHTML =
      '<section class="hero">' +
        '<div><h1>Cashflow Explorer</h1><p>Rule-adjusted cash-flow totals, category drilldowns, and audit effects.</p></div>' +
        '<div class="status-pill" id="app-status" data-kind="info"></div>' +
      '</section>' +
      '<section class="toolbar" aria-label="Cashflow controls">' +
        '<label>Start<input id="cashflow-start" type="date" value="' + escapeHtml(startDate) + '"></label>' +
        '<label>End<input id="cashflow-end" type="date" value="' + escapeHtml(endDate) + '"></label>' +
        button('data-action="preset-month"', 'This month') +
        button('data-action="reload-cashflow"', 'Reload') +
        button('data-action="load-audit"', 'Audit effects') +
      '</section>' +
      '<section class="metrics">' +
        metric('Inflow', formatMoney(totals.totalInflow, currency), 'positive') +
        metric('Outflow', formatMoney(totals.totalOutflow, currency), 'negative') +
        metric('Net flow', formatMoney(totals.netFlow, currency), moneySign(totals.netFlow)) +
        metric('Uncategorized outflow', formatMoney(totals.uncategorizedOutflow, currency), 'neutral') +
      '</section>' +
      '<section class="split">' +
        '<div class="panel">' +
          '<div class="panel-head"><h2>Categories</h2><div class="segmented">' +
            '<button data-action="set-flow" data-flow="outflow" aria-pressed="' + String(state.selectedFlow === 'outflow') + '">Outflows</button>' +
            '<button data-action="set-flow" data-flow="inflow" aria-pressed="' + String(state.selectedFlow === 'inflow') + '">Inflows</button>' +
          '</div></div>' +
          '<label class="search">Search<input id="cashflow-search" type="search" value="' + escapeHtml(state.categorySearch) + '" placeholder="Category"></label>' +
          '<div class="category-list">' + categoryHtml + '</div>' +
        '</div>' +
        '<div class="panel">' +
          '<div class="panel-head"><h2>Drilldown</h2><span class="muted">' + escapeHtml(state.selectedCategory ? formatCategory(state.selectedCategory) : 'Select a category') + '</span></div>' +
          drilldown +
        '</div>' +
      '</section>' +
      '<section class="panel"><div class="panel-head"><h2>Audit Effects</h2><span class="muted">Selected range</span></div>' + audit + '</section>';
  }

  function renderCashflowDrilldown(currency) {
    if (!state.selectedCategory) return rowsEmpty('Select a category to inspect transactions.');
    var rows = state.drilldownRows;
    if (!rows.length) {
      var data = readEnvelopeData();
      var fixture = data.fixtureDrilldowns && data.fixtureDrilldowns[state.selectedFlow] && data.fixtureDrilldowns[state.selectedFlow][state.selectedCategory];
      rows = toArray(fixture);
    }
    if (!rows.length) return rowsEmpty('No transactions returned for this category.');
    return '<div class="table-wrap"><table><thead><tr><th>Date</th><th>Merchant</th><th>Amount</th></tr></thead><tbody>' +
      rows.map(function (row) {
        return '<tr><td>' + escapeHtml(row.activityDate || row.date || '') + '</td><td>' + escapeHtml(row.merchantName || row.name || 'Transaction') + '</td><td class="num">' + escapeHtml(formatMoney(row.amount || row.convertedAmount || row.totalAmount, currency)) + '</td></tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  function renderAuditRows(rows) {
    rows = toArray(rows);
    if (!rows.length) return rowsEmpty('No audit effects returned for this range.');
    return '<div class="detail-list">' + rows.map(function (row) {
      return '<button class="detail-row" data-detail="' + escapeHtml(JSON.stringify(row)) + '">' +
        '<strong>' + escapeHtml(row.ruleName || row.effect || row.type || 'Audit row') + '</strong>' +
        '<span>' + escapeHtml([row.activityDate, row.merchantName || row.description, row.reason].filter(Boolean).join(' - ')) + '</span>' +
      '</button>';
    }).join('') + '</div>';
  }

  function renderProjection() {
    var data = readEnvelopeData();
    var accounts = toArray(data.accounts && data.accounts.accounts ? data.accounts.accounts : data.accounts);
    var schedules = toArray(data.recurringSchedules && data.recurringSchedules.data ? data.recurringSchedules.data : data.recurringSchedules);
    if (!Object.keys(state.scenario.selectedAccounts).length) {
      accounts.forEach(function (account) { state.scenario.selectedAccounts[account.id || account.displayName] = true; });
    }
    var validation = validateScenario();
    var summary = calculateScenario(accounts);
    var scheduleRows = schedules.length ? schedules.map(function (schedule) {
      return '<tr><td>' + escapeHtml(schedule.description || schedule.name || 'Schedule') + '</td><td>' + escapeHtml(schedule.frequency || '') + '</td><td class="num">' + escapeHtml(formatMoney(schedule.amount || schedule.convertedAmount, summary.currency)) + '</td><td>' + escapeHtml(schedule.status || 'active') + '</td></tr>';
    }).join('') : '<tr><td colspan="4">No recurring schedules returned.</td></tr>';
    var accountRows = accounts.length ? accounts.map(function (account) {
      var id = account.id || account.displayName;
      return '<label class="check-row"><input type="checkbox" data-action="toggle-account" data-account="' + escapeHtml(id) + '"' + (state.scenario.selectedAccounts[id] ? ' checked' : '') + '><span><strong>' + escapeHtml(account.displayName || account.name || 'Account') + '</strong><small>' + escapeHtml(account.groupingLabel || account.grouping || '') + '</small></span><span>' + escapeHtml(formatMoney(account.balance || account.currentBalance, summary.currency)) + '</span></label>';
    }).join('') : rowsEmpty('No account baseline returned.');
    var eventRows = state.scenario.events.length ? state.scenario.events.map(function (event, index) {
      return '<tr><td><input data-event-field="date" data-event-index="' + index + '" type="date" value="' + escapeHtml(event.date) + '"></td><td><input data-event-field="label" data-event-index="' + index + '" value="' + escapeHtml(event.label) + '"></td><td><select data-event-field="sign" data-event-index="' + index + '"><option value="positive"' + (event.sign === 'positive' ? ' selected' : '') + '>Inflow</option><option value="negative"' + (event.sign === 'negative' ? ' selected' : '') + '>Outflow</option></select></td><td><input data-event-field="amount" data-event-index="' + index + '" inputmode="decimal" value="' + escapeHtml(event.amount) + '"></td><td><button data-action="remove-event" data-event-index="' + index + '">Remove</button></td></tr>';
    }).join('') : '<tr><td colspan="5">No one-time events.</td></tr>';

    appRoot.innerHTML =
      '<section class="hero">' +
        '<div><h1>Projection Scenario Modeler</h1><p>In-session estimates from account baselines, recurring schedules, and explicit assumptions.</p></div>' +
        '<div class="status-pill" id="app-status" data-kind="info"></div>' +
      '</section>' +
      '<section class="metrics">' +
        metric('Selected baseline', formatMoney({ amount: summary.baseline, currency: summary.currency, sign: 'positive' }, summary.currency), 'positive') +
        metric('Months', String(summary.months), 'neutral') +
        metric('Estimated ending', formatMoney({ amount: summary.ending, currency: summary.currency, sign: summary.ending < 0 ? 'negative' : 'positive' }, summary.currency), summary.ending < 0 ? 'negative' : 'positive') +
        metric('Monthly delta', formatMoney({ amount: summary.monthlyDelta, currency: summary.currency, sign: summary.monthlyDelta < 0 ? 'negative' : 'positive' }, summary.currency), summary.monthlyDelta < 0 ? 'negative' : 'positive') +
      '</section>' +
      '<section class="split">' +
        '<div class="panel"><h2>Assumptions</h2>' +
          '<div class="form-grid">' +
            '<label>Scenario<input data-scenario-field="name" value="' + escapeHtml(state.scenario.name) + '"></label>' +
            '<label>Horizon<input data-scenario-field="horizonDate" type="date" value="' + escapeHtml(state.scenario.horizonDate) + '"></label>' +
            '<label>Monthly income change<input data-scenario-field="incomeAdjustment" inputmode="decimal" value="' + escapeHtml(state.scenario.incomeAdjustment) + '"></label>' +
            '<label>Monthly expense change<input data-scenario-field="expenseAdjustment" inputmode="decimal" value="' + escapeHtml(state.scenario.expenseAdjustment) + '"></label>' +
            '<label>Expected annual return %<input data-scenario-field="expectedReturn" inputmode="decimal" value="' + escapeHtml(state.scenario.expectedReturn) + '"></label>' +
          '</div>' +
          (validation.length ? '<div class="error-list">' + validation.map(escapeHtml).join('<br>') + '</div>' : '<div class="hint">Assumptions are not persisted and do not create transactions.</div>') +
          '<div class="button-row">' + button('data-action="add-event"', 'Add event') + button('data-action="send-scenario"', 'Send summary') + '</div>' +
        '</div>' +
        '<div class="panel"><h2>Account Baseline</h2><div class="check-list">' + accountRows + '</div></div>' +
      '</section>' +
      '<section class="panel"><div class="panel-head"><h2>One-Time Events</h2><span class="muted">Scenario only</span></div><div class="table-wrap"><table><thead><tr><th>Date</th><th>Label</th><th>Flow</th><th>Amount</th><th></th></tr></thead><tbody>' + eventRows + '</tbody></table></div></section>' +
      '<section class="panel"><div class="panel-head"><h2>Recurring Inputs</h2><span class="muted">Read-only from Splice</span></div><div class="table-wrap"><table><thead><tr><th>Description</th><th>Frequency</th><th>Amount</th><th>Status</th></tr></thead><tbody>' + scheduleRows + '</tbody></table></div></section>';
  }

  function validateScenario() {
    var errors = [];
    if (!state.scenario.horizonDate || Number.isNaN(Date.parse(state.scenario.horizonDate))) errors.push('Horizon date is required.');
    ['incomeAdjustment', 'expenseAdjustment', 'expectedReturn'].forEach(function (field) {
      if (String(state.scenario[field]).trim() === '' || !Number.isFinite(Number(state.scenario[field]))) errors.push(field + ' must be numeric.');
    });
    state.scenario.events.forEach(function (event, index) {
      if (!event.date || Number.isNaN(Date.parse(event.date))) errors.push('Event ' + (index + 1) + ' needs a valid date.');
      if (String(event.amount).trim() === '' || !Number.isFinite(Number(event.amount))) errors.push('Event ' + (index + 1) + ' amount must be numeric.');
    });
    return errors;
  }

  function calculateScenario(accounts) {
    var currency = 'USD';
    var baseline = toArray(accounts).reduce(function (total, account) {
      var id = account.id || account.displayName;
      if (!state.scenario.selectedAccounts[id]) return total;
      currency = moneyCurrency(account.balance || account.currentBalance, currency);
      return total + moneyAmount(account.balance || account.currentBalance);
    }, 0);
    var now = new Date();
    var horizon = new Date(state.scenario.horizonDate);
    var months = Number.isNaN(horizon.getTime()) ? 0 : Math.max(0, Math.ceil((horizon.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30)));
    var income = Number(state.scenario.incomeAdjustment) || 0;
    var expense = Number(state.scenario.expenseAdjustment) || 0;
    var monthlyDelta = income - expense;
    var eventTotal = state.scenario.events.reduce(function (total, event) {
      var amount = Number(event.amount) || 0;
      return total + (event.sign === 'negative' ? -amount : amount);
    }, 0);
    var annualReturn = (Number(state.scenario.expectedReturn) || 0) / 100;
    var estimatedReturn = baseline * annualReturn * (months / 12);
    return {
      currency: currency,
      baseline: baseline,
      months: months,
      monthlyDelta: monthlyDelta,
      ending: baseline + months * monthlyDelta + eventTotal + estimatedReturn
    };
  }

  function renderPortfolio() {
    var data = readEnvelopeData();
    var holdingsResult = data.holdings || {};
    var activityResult = data.activity || {};
    var holdings = toArray(holdingsResult.data || holdingsResult.holdings);
    var activity = toArray(activityResult.data || activityResult.activity);
    var accounts = unique(holdings.map(function (holding) {
      return { id: holding.accountId || holding.accountName || 'unknown', label: holding.accountName || holding.accountDisplayName || holding.accountId || 'Unknown account' };
    }), 'id');
    var visibleHoldings = holdings.filter(function (holding) {
      var accountMatch = state.portfolioAccount === 'all' || (holding.accountId || holding.accountName) === state.portfolioAccount;
      var label = securityLabel(holding).toLowerCase();
      return accountMatch && label.indexOf(state.portfolioSearch.toLowerCase()) >= 0;
    }).sort(function (left, right) {
      return compareHolding(left, right, state.portfolioSort);
    });
    var visibleActivity = activity.filter(function (row) {
      if (state.portfolioAccount !== 'all' && (row.accountId || row.accountName) !== state.portfolioAccount) return false;
      if (state.portfolioType !== 'all' && String(row.investmentType || row.type || '').toLowerCase() !== state.portfolioType) return false;
      return true;
    });
    var total = visibleHoldings.reduce(function (sum, holding) { return sum + moneyAmount(holding.institutionValue || holding.value); }, 0);
    var currency = visibleHoldings[0] ? moneyCurrency({ currency: visibleHoldings[0].isoCurrencyCode || visibleHoldings[0].unofficialCurrencyCode || (visibleHoldings[0].security || {}).isoCurrencyCode }, 'USD') : 'USD';
    var accountOptions = '<option value="all">All accounts</option>' + accounts.map(function (account) {
      return '<option value="' + escapeHtml(account.id) + '"' + (state.portfolioAccount === account.id ? ' selected' : '') + '>' + escapeHtml(account.label) + '</option>';
    }).join('');
    var typeOptions = unique(activity.map(function (row) { return { id: String(row.investmentType || row.type || 'other').toLowerCase(), label: String(row.investmentType || row.type || 'Other') }; }), 'id');
    var activityTypeOptions = '<option value="all">All activity</option>' + typeOptions.map(function (item) {
      return '<option value="' + escapeHtml(item.id) + '"' + (state.portfolioType === item.id ? ' selected' : '') + '>' + escapeHtml(item.label) + '</option>';
    }).join('');
    var holdingRows = visibleHoldings.length ? visibleHoldings.map(function (holding) {
      return '<tr><td><strong>' + escapeHtml(securityLabel(holding)) + '</strong><small>' + escapeHtml((holding.security && holding.security.type) || '') + '</small></td><td>' + escapeHtml((holding.security && holding.security.tickerSymbol) || '--') + '</td><td class="num">' + escapeHtml(formatDecimal(holding.quantity)) + '</td><td class="num">' + escapeHtml(formatMoney({ amount: holding.institutionPrice, currency: currency }, currency)) + '</td><td class="num">' + escapeHtml(formatMoney({ amount: holding.institutionValue, currency: currency }, currency)) + '</td></tr>';
    }).join('') : '<tr><td colspan="5">No holdings match the current filters.</td></tr>';
    var activityRows = visibleActivity.length ? visibleActivity.map(function (row) {
      return '<tr><td>' + escapeHtml(row.activityDate || row.date || '') + '</td><td><strong>' + escapeHtml(securityLabel(row)) + '</strong><small>' + escapeHtml([row.investmentType, row.investmentSubtype].filter(Boolean).join(' / ')) + '</small></td><td class="num">' + escapeHtml(formatDecimal(row.quantity)) + '</td><td class="num">' + escapeHtml(formatMoney(row.amount || row.cashImpact, currency)) + '</td></tr>';
    }).join('') : '<tr><td colspan="4">No activity matches the current filters.</td></tr>';
    var allocation = renderAllocation(visibleHoldings, total, currency);

    appRoot.innerHTML =
      '<section class="hero"><div><h1>Portfolio Viewer</h1><p>Latest or date-specific holdings, allocation, and investment activity.</p></div><div class="status-pill" id="app-status" data-kind="info"></div></section>' +
      '<section class="toolbar">' +
        '<label>Account<select id="portfolio-account">' + accountOptions + '</select></label>' +
        '<label>Holdings mode<select id="portfolio-date-mode"><option value="latest"' + (state.portfolioDateMode === 'latest' ? ' selected' : '') + '>Latest</option><option value="date"' + (state.portfolioDateMode === 'date' ? ' selected' : '') + '>Specific date</option></select></label>' +
        '<label>Snapshot date<input id="portfolio-snapshot-date" type="date" value="' + escapeHtml(state.portfolioSnapshotDate) + '"' + (state.portfolioDateMode === 'latest' ? ' disabled' : '') + '></label>' +
        '<label>Search<input id="portfolio-search" type="search" value="' + escapeHtml(state.portfolioSearch) + '" placeholder="Security or ticker"></label>' +
        '<label>Sort<select id="portfolio-sort"><option value="value">Value</option><option value="security">Security</option><option value="ticker">Ticker</option><option value="quantity">Quantity</option><option value="price">Price</option></select></label>' +
        '<label>Activity<select id="portfolio-type">' + activityTypeOptions + '</select></label>' +
        button('data-action="reload-portfolio"', 'Reload') +
      '</section>' +
      '<section class="metrics">' + metric('Visible value', formatMoney({ amount: total, currency: currency, sign: 'positive' }, currency), 'positive') + metric('Holdings', String(visibleHoldings.length), 'neutral') + metric('Activity rows', String(visibleActivity.length), 'neutral') + metric('Next page', activityResult.pageInfo && activityResult.pageInfo.hasMore ? 'Available' : 'None', 'neutral') + '</section>' +
      '<section class="split"><div class="panel"><h2>Allocation</h2>' + allocation + '</div><div class="panel"><div class="panel-head"><h2>Activity</h2>' + button('data-action="next-activity"', 'Next page') + '</div><div class="table-wrap"><table><thead><tr><th>Date</th><th>Security</th><th>Qty</th><th>Cash Impact</th></tr></thead><tbody>' + activityRows + '</tbody></table></div></div></section>' +
      '<section class="panel"><h2>Holdings</h2><div class="table-wrap"><table><thead><tr><th>Security</th><th>Ticker</th><th>Quantity</th><th>Price</th><th>Value</th></tr></thead><tbody>' + holdingRows + '</tbody></table></div></section>';
    var sort = document.getElementById('portfolio-sort');
    if (sort) sort.value = state.portfolioSort;
  }

  function renderAllocation(holdings, total, currency) {
    if (!holdings.length) return rowsEmpty('No holdings to allocate.');
    return '<div class="category-list">' + holdings.map(function (holding, index) {
      var value = moneyAmount(holding.institutionValue || holding.value);
      var width = total ? Math.max(4, Math.round((value / total) * 100)) : 0;
      var color = colorForIndex(index);
      return '<div class="allocation-row"><span class="swatch" style="background:' + color + '"></span><span class="category-main"><span>' + escapeHtml(securityLabel(holding)) + '</span><span class="bar-track"><span class="bar-fill" style="width:' + width + '%;background:' + color + '"></span></span></span><span class="number-stack"><strong>' + escapeHtml(formatMoney({ amount: value, currency: currency }, currency)) + '</strong><small>' + width + '%</small></span></div>';
    }).join('') + '</div>';
  }

  function renderRules() {
    var data = readEnvelopeData();
    var tabs = [
      ['categories', 'Categories'],
      ['analysis', 'Analysis Rules'],
      ['categorization', 'Categorization Rules'],
      ['recommendations', 'Recommendations'],
      ['audit', 'Audit Effects']
    ];
    var body = renderRuleTab(data);
    appRoot.innerHTML =
      '<section class="hero"><div><h1>Category Rule Workbench</h1><p>Read-only category metadata, rules, recommendations, and audit effects.</p></div><div class="status-pill" id="app-status" data-kind="info"></div></section>' +
      '<section class="toolbar">' +
        '<label>Search<input id="rule-search" type="search" value="' + escapeHtml(state.ruleSearch) + '" placeholder="Category, rule, condition"></label>' +
        '<label>Status<select id="rule-status"><option value="all">All statuses</option><option value="active">Active</option><option value="paused">Paused</option><option value="archived">Archived</option></select></label>' +
        '<label class="checkbox-inline"><input id="include-archived" type="checkbox"' + (state.includeArchived ? ' checked' : '') + '> Include archived</label>' +
        '<label>Audit start<input id="audit-start" type="date" value="' + escapeHtml((toolInput && toolInput.startDate) || '2026-03-01') + '"></label>' +
        '<label>Audit end<input id="audit-end" type="date" value="' + escapeHtml((toolInput && toolInput.endDate) || '2026-03-31') + '"></label>' +
        button('data-action="load-rule-audit"', 'Load audit') +
      '</section>' +
      '<section class="tabs">' + tabs.map(function (tab) {
        return '<button data-action="set-tab" data-tab="' + tab[0] + '" aria-pressed="' + String(state.activeTab === tab[0]) + '">' + escapeHtml(tab[1]) + '</button>';
      }).join('') + '</section>' +
      '<section class="split"><div class="panel">' + body + '</div><div class="panel"><h2>Detail</h2>' + renderDetail() + '</div></section>';
    var status = document.getElementById('rule-status');
    if (status) status.value = state.ruleStatus;
  }

  function renderRuleTab(data) {
    if (state.activeTab === 'categories') return renderObjectList('Categories', toArray((data.categories || {}).data || data.categories), categorySummary);
    if (state.activeTab === 'analysis') return renderObjectList('Analysis Rules', toArray((data.analysisRules || {}).data || data.analysisRules), ruleSummary);
    if (state.activeTab === 'categorization') return renderObjectList('Categorization Rules', toArray((data.categorizationRules || {}).data || data.categorizationRules), ruleSummary);
    if (state.activeTab === 'recommendations') return renderObjectList('Recommendations', toArray((data.recommendations || {}).suggestions || data.recommendations), recommendationSummary);
    var auditRows = state.audit ? toArray(state.audit.rows || state.audit.data) : toArray((data.fixtureAudit || {}).rows);
    return renderObjectList('Audit Effects', auditRows, auditSummary);
  }

  function renderObjectList(title, rows, summaryFn) {
    var filtered = toArray(rows).filter(function (row) {
      var haystack = JSON.stringify(row).toLowerCase();
      var status = String(row.status || (row.archived || row.archivedAt ? 'archived' : 'active')).toLowerCase();
      if (!state.includeArchived && status === 'archived') return false;
      if (state.ruleStatus !== 'all' && status !== state.ruleStatus) return false;
      return haystack.indexOf(state.ruleSearch.toLowerCase()) >= 0;
    });
    var list = filtered.length ? filtered.map(function (row) {
      var summary = summaryFn(row);
      return '<button class="detail-row" data-detail="' + escapeHtml(JSON.stringify(row)) + '"><strong>' + escapeHtml(summary.title) + '</strong><span>' + escapeHtml(summary.subtitle) + '</span></button>';
    }).join('') : rowsEmpty('No rows match the current filters.');
    return '<div class="panel-head"><h2>' + escapeHtml(title) + '</h2><span class="muted">' + filtered.length + ' rows</span></div><div class="detail-list">' + list + '</div>';
  }

  function renderDetail() {
    if (!state.detail) return rowsEmpty('Select a row to inspect details. Mutating actions are intentionally not available in MCP.');
    return '<pre class="detail-json">' + escapeHtml(JSON.stringify(state.detail, null, 2)) + '</pre><div class="hint">Read-only pane: no accept, dismiss, apply, create, edit, or archive actions are exposed.</div>';
  }

  function categorySummary(row) {
    return {
      title: row.label || [row.primary, row.detailed].filter(Boolean).join(' / ') || row.primaryCategory || 'Category',
      subtitle: [row.status || (row.archived || row.archivedAt ? 'archived' : 'active'), row.color].filter(Boolean).join(' - ')
    };
  }

  function ruleSummary(row) {
    return {
      title: row.name || row.ruleName || 'Rule',
      subtitle: [row.type || row.itemType, row.status || (row.archived || row.archivedAt ? 'archived' : 'active'), row.scopeSummary || row.targetCategory].filter(Boolean).join(' - ')
    };
  }

  function recommendationSummary(row) {
    return {
      title: row.name || row.title || 'Recommendation',
      subtitle: [row.proposedCategory || row.targetCategory, row.reason, row.confidence != null ? 'confidence ' + row.confidence : ''].filter(Boolean).join(' - ')
    };
  }

  function auditSummary(row) {
    return {
      title: row.ruleName || row.effect || row.type || 'Audit effect',
      subtitle: [row.activityDate, row.merchantName || row.description, row.reason].filter(Boolean).join(' - ')
    };
  }

  function securityLabel(row) {
    var security = row.security || {};
    return security.tickerSymbol || security.name || row.name || row.securityName || 'Unknown security';
  }

  function formatDecimal(value) {
    var parsed = Number(value);
    if (!Number.isFinite(parsed)) return value == null ? '--' : String(value);
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 }).format(parsed);
  }

  function compareHolding(left, right, sort) {
    if (sort === 'security') return securityLabel(left).localeCompare(securityLabel(right));
    if (sort === 'ticker') return String((left.security || {}).tickerSymbol || '').localeCompare(String((right.security || {}).tickerSymbol || ''));
    if (sort === 'quantity') return moneyAmount(right.quantity) - moneyAmount(left.quantity);
    if (sort === 'price') return moneyAmount(right.institutionPrice) - moneyAmount(left.institutionPrice);
    return moneyAmount(right.institutionValue || right.value) - moneyAmount(left.institutionValue || left.value);
  }

  function unique(rows, key) {
    var seen = {};
    return rows.filter(function (row) {
      var value = row[key];
      if (seen[value]) return false;
      seen[value] = true;
      return true;
    });
  }

  function colorForIndex(index) {
    var colors = ['#2563eb', '#0f766e', '#7c3aed', '#dc2626', '#ca8a04', '#0891b2', '#be185d', '#16a34a'];
    return colors[index % colors.length];
  }

  function render() {
    if (!appRoot) return;
    if (appId === 'cashflow_explorer') renderCashflow();
    if (appId === 'projection_scenario_modeler') renderProjection();
    if (appId === 'portfolio_viewer') renderPortfolio();
    if (appId === 'category_rule_workbench') renderRules();
    setStatus(remoteDataLoaded ? 'Connected to MCP host data.' : bridgeSeen ? 'Waiting for MCP tool result...' : 'Rendering local fixture. MCP Apps host bridge was not detected.', remoteDataLoaded ? 'success' : bridgeSeen ? 'info' : 'warn');
    notifySizeChanged();
  }

  function handleControlInput(event) {
    var target = event.target;
    if (!target) return;
    if (target.id === 'cashflow-search') state.categorySearch = target.value;
    if (target.id === 'portfolio-search') state.portfolioSearch = target.value;
    if (target.id === 'portfolio-account') state.portfolioAccount = target.value;
    if (target.id === 'portfolio-sort') state.portfolioSort = target.value;
    if (target.id === 'portfolio-type') state.portfolioType = target.value;
    if (target.id === 'portfolio-date-mode') state.portfolioDateMode = target.value;
    if (target.id === 'portfolio-snapshot-date') state.portfolioSnapshotDate = target.value;
    if (target.id === 'rule-search') state.ruleSearch = target.value;
    if (target.id === 'rule-status') state.ruleStatus = target.value;
    if (target.id === 'include-archived') state.includeArchived = target.checked;
    if (target.dataset && target.dataset.scenarioField) state.scenario[target.dataset.scenarioField] = target.value;
    if (target.dataset && target.dataset.eventField) {
      var eventRow = state.scenario.events[Number(target.dataset.eventIndex)];
      if (eventRow) eventRow[target.dataset.eventField] = target.value;
    }
    render();
  }

  document.addEventListener('input', handleControlInput);
  document.addEventListener('change', handleControlInput);

  document.addEventListener('click', function (event) {
    var target = event.target.closest('[data-action], [data-detail]');
    if (!target) return;
    var action = target.dataset.action;
    if (target.dataset.detail) {
      state.detail = parseJson(target.dataset.detail);
      render();
      return;
    }
    if (action === 'set-flow') {
      state.selectedFlow = target.dataset.flow;
      state.selectedCategory = null;
      state.drilldownRows = [];
      render();
    }
    if (action === 'select-category') {
      state.selectedCategory = target.dataset.category;
      state.drilldownRows = [];
      render();
      var start = document.getElementById('cashflow-start');
      var end = document.getElementById('cashflow-end');
      callTool('list_cashflow_category_transactions', {
        startDate: start ? start.value : undefined,
        endDate: end ? end.value : undefined,
        categoryPrimary: state.selectedCategory,
        flowDirection: state.selectedFlow
      }).then(function (result) {
        state.drilldownRows = toArray(result.data || result.transactions || result);
        render();
      }).catch(function (error) {
        setStatus(error.message, 'warn');
      });
    }
    if (action === 'reload-cashflow') {
      var cashflowStart = document.getElementById('cashflow-start');
      var cashflowEnd = document.getElementById('cashflow-end');
      if (cashflowStart && cashflowEnd && cashflowStart.value > cashflowEnd.value) {
        setStatus('Start date must be before end date.', 'error');
        return;
      }
      callTool('get_cashflow_analysis', {
        startDate: cashflowStart ? cashflowStart.value : undefined,
        endDate: cashflowEnd ? cashflowEnd.value : undefined
      }).then(function (result) {
        envelope = { data: result };
        render();
      }).catch(function (error) { setStatus(error.message, 'warn'); });
    }
    if (action === 'preset-month') {
      var now = new Date();
      var month = String(now.getMonth() + 1).padStart(2, '0');
      document.getElementById('cashflow-start').value = now.getFullYear() + '-' + month + '-01';
      document.getElementById('cashflow-end').value = now.getFullYear() + '-' + month + '-' + String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, '0');
    }
    if (action === 'load-audit') {
      var auditStart = document.getElementById('cashflow-start') || document.getElementById('audit-start');
      var auditEnd = document.getElementById('cashflow-end') || document.getElementById('audit-end');
      callTool('get_cashflow_analysis_audit', {
        startDate: auditStart ? auditStart.value : undefined,
        endDate: auditEnd ? auditEnd.value : undefined
      }).then(function (result) {
        state.audit = result;
        render();
      }).catch(function (error) {
        var data = readEnvelopeData();
        state.audit = data.fixtureAudit || null;
        setStatus(error.message, 'warn');
        render();
      });
    }
    if (action === 'add-event') {
      state.scenario.events.push({ date: state.scenario.horizonDate, label: 'One-time event', sign: 'negative', amount: 0 });
      render();
    }
    if (action === 'remove-event') {
      state.scenario.events.splice(Number(target.dataset.eventIndex), 1);
      render();
    }
    if (action === 'toggle-account') {
      state.scenario.selectedAccounts[target.dataset.account] = target.checked;
      render();
    }
    if (action === 'send-scenario') {
      var validation = validateScenario();
      if (validation.length) {
        setStatus('Fix scenario validation errors before sending summary.', 'error');
        return;
      }
      var data = readEnvelopeData();
      var accounts = toArray(data.accounts && data.accounts.accounts ? data.accounts.accounts : data.accounts);
      var summary = calculateScenario(accounts);
      updateModelContext('Projection scenario "' + state.scenario.name + '" estimates an ending balance of ' + formatMoney({ amount: summary.ending, currency: summary.currency, sign: summary.ending < 0 ? 'negative' : 'positive' }, summary.currency) + ' by ' + state.scenario.horizonDate + '.', { scenario: state.scenario, summary: summary });
    }
    if (action === 'reload-portfolio') {
      var accountArgs = state.portfolioAccount === 'all' ? {} : { accountIds: [state.portfolioAccount] };
      var holdingsArgs = Object.assign({}, accountArgs);
      if (state.portfolioDateMode === 'latest') {
        holdingsArgs.latestOnly = true;
      } else if (state.portfolioSnapshotDate) {
        holdingsArgs.snapshotDate = state.portfolioSnapshotDate;
      } else {
        setStatus('Snapshot date is required for date-specific holdings.', 'error');
        return;
      }
      Promise.all([
        callTool('list_investment_holdings', holdingsArgs),
        callTool('list_investment_activity', Object.assign({}, accountArgs, { pageSize: 25 }))
      ]).then(function (results) {
        envelope = { data: { holdings: results[0], activity: results[1] } };
        render();
      }).catch(function (error) { setStatus(error.message, 'warn'); });
    }
    if (action === 'next-activity') {
      var current = readEnvelopeData().activity || {};
      var cursor = current.pageInfo && current.pageInfo.nextCursor;
      if (!cursor) {
        setStatus('No additional activity page is available.', 'info');
        return;
      }
      callTool('list_investment_activity', { cursor: cursor, pageSize: 25 }).then(function (result) {
        var data = readEnvelopeData();
        data.activity = result;
        envelope = { data: data };
        render();
      }).catch(function (error) { setStatus(error.message, 'warn'); });
    }
    if (action === 'set-tab') {
      state.activeTab = target.dataset.tab;
      state.detail = null;
      render();
    }
    if (action === 'load-rule-audit') {
      var start = document.getElementById('audit-start');
      var end = document.getElementById('audit-end');
      callTool('get_cashflow_analysis_audit', {
        startDate: start ? start.value : undefined,
        endDate: end ? end.value : undefined
      }).then(function (result) {
        state.audit = result;
        state.activeTab = 'audit';
        render();
      }).catch(function (error) {
        var data = readEnvelopeData();
        state.audit = data.fixtureAudit || null;
        state.activeTab = 'audit';
        setStatus(error.message, 'warn');
        render();
      });
    }
  });

  initializeBridge();
})();
`;
}
