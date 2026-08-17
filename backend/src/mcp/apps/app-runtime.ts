/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, no-var */
import { createMcpAppRuntime } from '@koonweee/mcp-kit/apps';
import {
  cashFlowSelectionContext,
  cashFlowTransactionAmount,
  createCashFlowPresentation,
  moneyMagnitude,
  sortCashFlowTransactions,
  type CashFlowCategory,
  type CashFlowPresentation,
} from './cash-flow-model';

(function () {
  'use strict';

  var uiDocument: any = document;
  var appRoot: any = uiDocument.getElementById('splice-mcp-app-root');
  var safeAreaRoot: any = uiDocument.getElementById('splice-mcp-app-safe-area');
  var appId = appRoot ? appRoot.getAttribute('data-app-id') : '';
  var envelope: any = null;
  var businessDataGeneration = 0;
  var state: any = {
    selectedCategory: null,
    cashFlowOtherExpanded: false,
    cashFlowDrilldownStatus: 'idle',
    drilldownRows: [],
    drilldownVisibleCount: 3,
    modelContextError: false,
    modelContextRequestId: 0,
    cashFlowPublishContext: false,
    cashFlowContextPublished: false,
    cashFlowSelectionScroll: 0,
    portfolioSort: 'value',
    portfolioSearch: '',
    portfolioAccount: 'all',
    portfolioType: 'all',
    portfolioDateMode: 'latest',
    portfolioSnapshotDate: '',
    portfolioCursor: null,
  };

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function toArray(value): any[] {
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
      if (value.money && value.money.currency)
        return String(value.money.currency);
    }
    return fallback || 'USD';
  }

  function moneySign(value) {
    if (value && typeof value === 'object' && value.sign)
      return String(value.sign);
    return moneyAmount(value) < 0 ? 'negative' : 'positive';
  }

  function formatMoney(value, fallbackCurrency) {
    var amount = Math.abs(moneyAmount(value));
    var currency = moneyCurrency(value, fallbackCurrency);
    var sign = moneySign(value) === 'negative' ? '-' : '';
    return (
      sign +
      new Intl.NumberFormat('en-US', {
        style: currency.length === 3 ? 'currency' : 'decimal',
        currency: currency.length === 3 ? currency : 'USD',
        maximumFractionDigits: 2,
      }).format(amount) +
      (currency.length === 3 ? '' : ' ' + currency)
    );
  }

  function readEnvelopeData(): any {
    var content =
      envelope && envelope.structuredContent
        ? envelope.structuredContent
        : envelope;
    if (content && content.data) return content.data;
    return content || {};
  }

  function structuredResult(result): any {
    if (!result) return {};
    if (result.structuredContent) return result.structuredContent;
    if (result.result && result.result.structuredContent)
      return result.result.structuredContent;
    return result;
  }

  function isToolErrorResult(result): boolean {
    return Boolean(
      result && (result.isError || (result.result && result.result.isError)),
    );
  }

  function setStatus(message, kind) {
    var status = uiDocument.getElementById('app-status');
    if (!status) return;
    status.textContent = message;
    status.dataset.kind = kind || 'info';
  }

  function callTool(name, args) {
    return mcpRuntime.app
      .callServerTool({ name: name, arguments: args || {} })
      .then(function (result) {
        if (isToolErrorResult(result)) {
          throw new Error('MCP tool returned an error result');
        }
        return structuredResult(result);
      });
  }

  function renderLoading() {
    if (!appRoot) return;
    appRoot.innerHTML =
      '<section class="hero"><div><h1>' +
      escapeHtml(appTitle()) +
      '</h1><p>Loading live Splice data...</p></div>' +
      '<div class="status-pill" id="app-status" data-kind="info">Connecting</div></section>';
  }

  function clearPublishedCashFlowContext() {
    if (appId !== 'cash_flow' || !state.cashFlowContextPublished) return;
    state.cashFlowContextPublished = false;
    state.cashFlowPublishContext = false;
    state.modelContextError = false;
    state.modelContextRequestId += 1;
    mcpRuntime.app
      .updateModelContext({
        structuredContent: {
          visualization: 'cash_flow',
          selection: null,
        },
      })
      .catch(function () {
        // Clearing stale host context is best-effort during lifecycle changes.
      });
  }

  function clearDerivedBusinessData() {
    clearPublishedCashFlowContext();
    businessDataGeneration += 1;
    state.selectedCategory = null;
    state.cashFlowOtherExpanded = false;
    state.cashFlowDrilldownStatus = 'idle';
    state.drilldownRows = [];
    state.drilldownVisibleCount = 3;
    state.modelContextError = false;
    state.modelContextRequestId += 1;
    state.cashFlowPublishContext = false;
    state.cashFlowSelectionScroll = 0;
    state.portfolioCursor = null;
  }

  function renderLiveDataError() {
    envelope = null;
    clearDerivedBusinessData();
    if (!appRoot) return;
    appRoot.innerHTML =
      '<section class="hero"><div><h1>' +
      escapeHtml(appTitle()) +
      '</h1><p>Unable to load live Splice data.</p></div>' +
      '<div class="status-pill" id="app-status" data-kind="error">Unavailable</div></section>';
  }

  function appTitle() {
    if (appId === 'cash_flow') return 'Cash Flow';
    if (appId === 'portfolio_viewer') return 'Portfolio Viewer';
    return 'Splice';
  }

  function appVersion() {
    return appId === 'cash_flow' ? '3.0.0' : '2.0.0';
  }

  function isValidInitialResult(result) {
    var content = result && result.structuredContent;
    return Boolean(
      content &&
        content.app &&
        content.app.id === appId &&
        Object.prototype.hasOwnProperty.call(content, 'data'),
    );
  }

  var mcpRuntime = createMcpAppRuntime({
    appInfo: { name: 'Splice ' + appTitle(), version: appVersion() },
    capabilities: { availableDisplayModes: ['inline', 'fullscreen'] },
    safeAreaElement: safeAreaRoot || undefined,
    onStateChange: function (runtimeState) {
      if (runtimeState.status === 'loading') {
        envelope = null;
        clearDerivedBusinessData();
        renderLoading();
        return;
      }
      if (runtimeState.status === 'error') {
        renderLiveDataError();
        return;
      }
      if (!isValidInitialResult(runtimeState.result)) {
        renderLiveDataError();
        return;
      }
      clearDerivedBusinessData();
      envelope = runtimeState.result;
      render();
      initializeFocusedCashFlowCategory();
    },
    onTeardown: function () {
      renderLiveDataError();
    },
  });

  function button(attrs, text) {
    return '<button ' + attrs + '>' + escapeHtml(text) + '</button>';
  }

  function metric(label, value, tone) {
    return (
      '<div class="metric" data-tone="' +
      escapeHtml(tone || 'neutral') +
      '">' +
      '<div class="label">' +
      escapeHtml(label) +
      '</div>' +
      '<div class="value">' +
      escapeHtml(value) +
      '</div>' +
      '</div>'
    );
  }

  function rowsEmpty(message) {
    return '<div class="empty">' + escapeHtml(message) + '</div>';
  }

  function formatPeriodRange(startDate, endDate) {
    function dateLabel(value) {
      var parts = String(value).split('-').map(Number);
      if (parts.length !== 3 || parts.some(Number.isNaN)) return String(value);
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])));
    }
    return dateLabel(startDate) + ' – ' + dateLabel(endDate);
  }

  function formatMagnitude(value, currency) {
    return formatMoney(
      {
        amount: moneyMagnitude(value),
        currency: moneyCurrency(value, currency),
        sign: 'positive',
      },
      currency,
    );
  }

  function formatDelta(value, currency) {
    if (value == null) return '';
    if (value === 0) return 'No change';
    return (
      (value > 0 ? '+' : '−') +
      formatMagnitude(
        { amount: Math.abs(value), currency: currency, sign: 'positive' },
        currency,
      )
    );
  }

  function safeCategoryColor(value, index) {
    return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
      ? value
      : colorForIndex(index);
  }

  function cashFlowCategoryByIdentity(presentation, identity) {
    if (!identity) return null;
    var allCategories = presentation.topCategories
      .concat(presentation.remainingCategories)
      .concat(presentation.uncategorized ? [presentation.uncategorized] : []);
    return (
      allCategories.find(function (category) {
        return category.primaryCategory === identity;
      }) || null
    );
  }

  function renderCashFlowCategoryRow(category, presentation, index, rowKind) {
    var color = safeCategoryColor(category.color, index);
    var amount = moneyMagnitude(category.totalAmount);
    var width = Math.max(
      amount > 0 ? 3 : 0,
      Math.round((amount / presentation.maxCategoryAmount) * 100),
    );
    var selected = state.selectedCategory === category.primaryCategory;
    var comparison = presentation.comparison
      ? '<small class="category-comparison">Compared with ' +
        escapeHtml(
          formatMagnitude(
            {
              amount: category.comparisonAmount || 0,
              currency: presentation.current.currency,
              sign: 'positive',
            },
            presentation.current.currency,
          ),
        ) +
        ' <span data-delta-tone="' +
        (category.delta > 0
          ? presentation.direction === 'outflow'
            ? 'negative'
            : 'positive'
          : category.delta < 0
            ? presentation.direction === 'outflow'
              ? 'positive'
              : 'negative'
            : 'neutral') +
        '">' +
        escapeHtml(formatDelta(category.delta, presentation.current.currency)) +
        '</span></small>'
      : '';
    return (
      '<button class="cash-flow-category" data-row-kind="' +
      escapeHtml(rowKind || 'ranked') +
      '" data-action="select-category" data-category="' +
      escapeHtml(category.primaryCategory) +
      '" aria-expanded="' +
      String(selected) +
      '" aria-controls="cash-flow-detail">' +
      '<span class="category-rank" aria-hidden="true">' +
      (rowKind === 'uncategorized' ? '!' : String(index + 1)) +
      '</span>' +
      '<span class="cash-flow-category-main"><span class="category-label">' +
      escapeHtml(category.label) +
      '</span><span class="cash-flow-bar" aria-hidden="true"><span style="width:' +
      width +
      '%;background:' +
      escapeHtml(color) +
      '"></span></span>' +
      comparison +
      '</span><span class="cash-flow-category-value"><strong>' +
      escapeHtml(
        formatMagnitude(category.totalAmount, presentation.current.currency),
      ) +
      '</strong>' +
      (category.transactionCountKnown === false
        ? ''
        : '<small>' +
          escapeHtml(String(category.transactionCount)) +
          (category.transactionCount === 1 ? ' transaction' : ' transactions') +
          '</small>') +
      '</span></button>'
    );
  }

  function renderCashFlowCategoryAndDetail(
    category,
    presentation,
    index,
    rowKind,
  ) {
    return (
      renderCashFlowCategoryRow(category, presentation, index, rowKind) +
      (state.selectedCategory === category.primaryCategory
        ? renderCashFlowDrilldown(presentation)
        : '')
    );
  }

  function renderCashFlowOther(presentation) {
    if (!presentation.remainingCategories.length) return '';
    var expanded = state.cashFlowOtherExpanded;
    return (
      '<button class="cash-flow-category cash-flow-other" data-action="toggle-other" aria-expanded="' +
      String(expanded) +
      '" aria-controls="cash-flow-other-rows">' +
      '<span class="category-rank" aria-hidden="true">' +
      (expanded ? '−' : '+') +
      '</span><span class="cash-flow-category-main"><span class="category-label">Other</span><small>' +
      escapeHtml(String(presentation.remainingCategories.length)) +
      ' more categories</small></span><span class="cash-flow-category-value"><strong>' +
      escapeHtml(
        formatMagnitude(
          {
            amount: presentation.otherAmount,
            currency: presentation.current.currency,
            sign: 'positive',
          },
          presentation.current.currency,
        ),
      ) +
      '</strong><small>' +
      escapeHtml(String(presentation.otherTransactionCount)) +
      ' transactions</small></span></button>' +
      '<div id="cash-flow-other-rows"' +
      (expanded ? '' : ' hidden') +
      '>' +
      (expanded
        ? presentation.remainingCategories
            .map(function (category, index) {
              return renderCashFlowCategoryAndDetail(
                category,
                presentation,
                index + 5,
                'expanded',
              );
            })
            .join('')
        : '') +
      '</div>'
    );
  }

  function renderCashFlowDrilldown(presentation) {
    var category = cashFlowCategoryByIdentity(
      presentation,
      state.selectedCategory,
    );
    if (!category) return '';
    var detailTransactionCount =
      category.transactionCountKnown === false
        ? state.cashFlowDrilldownStatus === 'ready'
          ? state.drilldownRows.length
          : null
        : category.transactionCount;
    var heading =
      '<div class="cash-flow-detail-head"><div><p class="eyebrow">Selected category</p><h3>' +
      escapeHtml(category.label) +
      '</h3><p>' +
      escapeHtml(
        formatMagnitude(category.totalAmount, presentation.current.currency),
      ) +
      (detailTransactionCount == null
        ? ''
        : ' across ' +
          escapeHtml(String(detailTransactionCount)) +
          (detailTransactionCount === 1 ? ' transaction' : ' transactions')) +
      '</p></div><button class="text-button" data-action="close-category">Back to categories</button></div>';
    var body = '';
    if (state.cashFlowDrilldownStatus === 'loading') {
      body =
        '<div class="cash-flow-detail-state" role="status"><span class="spinner" aria-hidden="true"></span>Loading transaction evidence…</div>';
    } else if (state.cashFlowDrilldownStatus === 'error') {
      body =
        '<div class="cash-flow-detail-state" role="alert"><p>Transaction details are unavailable. The cash-flow summary is still current.</p><div class="button-row"><button data-action="retry-category">Retry</button><button data-action="close-category">Close</button></div></div>';
    } else if (!state.drilldownRows.length) {
      body =
        '<div class="cash-flow-detail-state">No transactions were returned for this category.</div>';
    } else {
      var visibleRows = state.drilldownRows.slice(
        0,
        state.drilldownVisibleCount,
      );
      body =
        '<ol class="transaction-evidence">' +
        visibleRows
          .map(function (row) {
            var displayAmount = cashFlowTransactionAmount(
              row,
              presentation.current.currency,
            );
            return (
              '<li><span class="transaction-copy"><strong>' +
              escapeHtml(
                row.merchantName || row.originalDescription || 'Transaction',
              ) +
              '</strong><small>' +
              escapeHtml(row.activityDate || '') +
              '</small></span><span class="transaction-amount">' +
              escapeHtml(
                displayAmount
                  ? formatMoney(displayAmount, presentation.current.currency)
                  : 'Amount unavailable',
              ) +
              '</span></li>'
            );
          })
          .join('') +
        '</ol>' +
        (state.drilldownVisibleCount < state.drilldownRows.length
          ? '<button class="show-more" data-action="show-more-transactions">Show 3 more</button>'
          : '');
    }
    return (
      '<section class="cash-flow-detail" id="cash-flow-detail" aria-live="polite">' +
      heading +
      body +
      (state.modelContextError
        ? '<p class="cash-flow-context-note" role="status">This selection could not be shared with the conversation. The visualization is unaffected.</p>'
        : '') +
      '</section>'
    );
  }

  function renderCashFlowAdjustments(presentation) {
    var current = presentation.current.adjustments;
    var comparison = presentation.comparison
      ? presentation.comparison.adjustments
      : null;
    if (!current.affected && !(comparison && comparison.affected)) return '';
    function periodAdjustmentLine(label, adjustments) {
      if (!adjustments || !adjustments.affected) return '';
      return (
        '<p><strong>' +
        escapeHtml(label) +
        ':</strong> ' +
        escapeHtml(String(adjustments.excludedTransactionCount)) +
        ' excluded ' +
        (adjustments.excludedTransactionCount === 1
          ? 'transaction'
          : 'transactions') +
        ' and ' +
        escapeHtml(String(adjustments.neutralizedPairCount)) +
        ' neutralized ' +
        (adjustments.neutralizedPairCount === 1 ? 'pair' : 'pairs') +
        '.</p>'
      );
    }
    return (
      '<details class="cash-flow-adjustments"><summary>How this was calculated</summary><div><p>' +
      'Excluded transactions are left out by your analysis rules. Neutralized transfer or refund pairs keep money moving between accounts from being counted twice.</p>' +
      periodAdjustmentLine('Current period', current) +
      periodAdjustmentLine('Comparison period', comparison) +
      '</div></details>'
    );
  }

  function renderCashflow() {
    var presentation = createCashFlowPresentation(readEnvelopeData());
    if (!presentation) {
      renderLiveDataError();
      return;
    }
    var currency = presentation.current.currency;
    var netDelta = presentation.netDelta || 0;
    var inflowDelta = presentation.inflowDelta || 0;
    var outflowDelta = presentation.outflowDelta || 0;
    var comparison = presentation.comparison
      ? '<p class="comparison-period">Compared with ' +
        escapeHtml(
          formatPeriodRange(
            presentation.comparison.startDate,
            presentation.comparison.endDate,
          ),
        ) +
        '. Exact ranges; values are not normalized for period length.</p>'
      : '';
    var categories = presentation.topCategories
      .map(function (category, index) {
        return renderCashFlowCategoryAndDetail(
          category,
          presentation,
          index,
          'ranked',
        );
      })
      .join('');
    var categorySection = presentation.isEmpty
      ? '<div class="cash-flow-empty"><h2>No ' +
        (presentation.direction === 'outflow' ? 'spending' : 'income') +
        ' activity</h2><p>Splice found no ' +
        (presentation.direction === 'outflow' ? 'outflows' : 'inflows') +
        ' in this exact period.</p></div>'
      : '<section class="cash-flow-categories" aria-labelledby="cash-flow-categories-title"><div class="section-heading"><div><p class="eyebrow">Largest contributors</p><h2 id="cash-flow-categories-title">' +
        (presentation.direction === 'outflow'
          ? 'Top spending categories'
          : 'Income sources') +
        '</h2></div><span>' +
        escapeHtml(
          presentation.direction === 'outflow' ? 'Outflow' : 'Inflow',
        ) +
        '</span></div><div class="cash-flow-category-list">' +
        categories +
        renderCashFlowOther(presentation) +
        (presentation.uncategorized
          ? '<div class="uncategorized-separator"><span>Data quality</span></div>' +
            renderCashFlowCategoryAndDetail(
              presentation.uncategorized,
              presentation,
              presentation.topCategories.length +
                presentation.remainingCategories.length,
              'uncategorized',
            )
          : '') +
        '</div></section>';

    appRoot.innerHTML =
      '<article class="cash-flow-view">' +
      '<header class="cash-flow-header"><div><p class="eyebrow">' +
      escapeHtml(currency) +
      ' · ' +
      escapeHtml(
        formatPeriodRange(
          presentation.current.startDate,
          presentation.current.endDate,
        ),
      ) +
      '</p><h1>Cash Flow</h1></div></header>' +
      '<section class="net-flow" data-tone="' +
      escapeHtml(moneySign(presentation.current.netFlow)) +
      '"><p>Net cash flow</p><strong>' +
      escapeHtml(formatMoney(presentation.current.netFlow, currency)) +
      '</strong>' +
      (presentation.comparison
        ? '<small><span data-delta-tone="' +
          (netDelta > 0 ? 'positive' : netDelta < 0 ? 'negative' : 'neutral') +
          '">' +
          escapeHtml(formatDelta(netDelta, currency)) +
          '</span> vs comparison</small>'
        : '') +
      '</section>' +
      '<section class="flow-pair" aria-label="Inflow and outflow"><div><span>Inflow</span><strong>' +
      escapeHtml(formatMagnitude(presentation.current.totalInflow, currency)) +
      '</strong>' +
      (presentation.comparison
        ? '<small data-delta-tone="' +
          (inflowDelta > 0
            ? 'positive'
            : inflowDelta < 0
              ? 'negative'
              : 'neutral') +
          '">' +
          escapeHtml(formatDelta(inflowDelta, currency)) +
          '</small>'
        : '') +
      '</div><div><span>Outflow</span><strong>' +
      escapeHtml(formatMagnitude(presentation.current.totalOutflow, currency)) +
      '</strong>' +
      (presentation.comparison
        ? '<small data-delta-tone="' +
          (outflowDelta > 0
            ? 'negative'
            : outflowDelta < 0
              ? 'positive'
              : 'neutral') +
          '">' +
          escapeHtml(formatDelta(outflowDelta, currency)) +
          '</small>'
        : '') +
      '</div></section>' +
      comparison +
      categorySection +
      renderCashFlowAdjustments(presentation) +
      '</article>';
  }

  function currentCashFlowPresentation(): CashFlowPresentation | null {
    if (appId !== 'cash_flow' || !envelope) return null;
    return createCashFlowPresentation(readEnvelopeData());
  }

  function publishCashFlowContext(
    presentation: CashFlowPresentation,
    category: CashFlowCategory | null,
    generation: number,
  ) {
    state.modelContextError = false;
    state.cashFlowContextPublished = Boolean(category);
    var contextRequestId = ++state.modelContextRequestId;
    mcpRuntime.app
      .updateModelContext({
        structuredContent: cashFlowSelectionContext(presentation, category),
      })
      .catch(function () {
        if (contextRequestId !== state.modelContextRequestId) return;
        if (generation !== businessDataGeneration) return;
        if (category && state.selectedCategory !== category.primaryCategory) {
          return;
        }
        if (!category && state.selectedCategory) return;
        state.modelContextError = true;
        render();
      });
  }

  function selectCashFlowCategory(
    categoryPrimary,
    shouldPublishContext = true,
  ) {
    var presentation = currentCashFlowPresentation();
    if (!presentation) return;
    var category = cashFlowCategoryByIdentity(presentation, categoryPrimary);
    if (!category) return;
    var publishSelectionContext = shouldPublishContext !== false;
    var selectedPresentation: CashFlowPresentation = presentation;
    if (state.selectedCategory !== category.primaryCategory) {
      state.cashFlowSelectionScroll =
        typeof window.scrollY === 'number' ? window.scrollY : 0;
    }
    state.selectedCategory = category.primaryCategory;
    state.cashFlowDrilldownStatus = 'loading';
    state.drilldownRows = [];
    state.drilldownVisibleCount = 3;
    state.modelContextError = false;
    state.cashFlowPublishContext = publishSelectionContext;
    if (
      presentation.remainingCategories.some(function (candidate) {
        return candidate.primaryCategory === category.primaryCategory;
      })
    ) {
      state.cashFlowOtherExpanded = true;
    }
    render();

    var generation = businessDataGeneration;
    var selectedIdentity = category.primaryCategory;
    if (publishSelectionContext) {
      publishCashFlowContext(selectedPresentation, category, generation);
    }
    callTool('list_cashflow_category_transactions', {
      startDate: selectedPresentation.current.startDate,
      endDate: selectedPresentation.current.endDate,
      categoryPrimary: category.primaryCategory,
      flowDirection: selectedPresentation.direction,
    })
      .then(function (result) {
        if (
          generation !== businessDataGeneration ||
          state.selectedCategory !== selectedIdentity
        ) {
          return;
        }
        state.drilldownRows = sortCashFlowTransactions(
          result,
          selectedPresentation.current.currency,
        );
        state.cashFlowDrilldownStatus = 'ready';
        if (state.cashFlowPublishContext) {
          publishCashFlowContext(
            selectedPresentation,
            {
              ...category,
              transactionCount: state.drilldownRows.length,
              transactionCountKnown: true,
            },
            generation,
          );
        }
        render();
      })
      .catch(function () {
        if (
          generation !== businessDataGeneration ||
          state.selectedCategory !== selectedIdentity
        ) {
          return;
        }
        state.drilldownRows = [];
        state.cashFlowDrilldownStatus = 'error';
        render();
      });
  }

  function closeCashFlowCategory() {
    var presentation = currentCashFlowPresentation();
    if (!presentation) return;
    var restoreScroll = state.cashFlowSelectionScroll;
    state.selectedCategory = null;
    state.cashFlowDrilldownStatus = 'idle';
    state.drilldownRows = [];
    state.drilldownVisibleCount = 3;
    state.cashFlowPublishContext = false;
    render();
    var generation = businessDataGeneration;
    publishCashFlowContext(presentation, null, generation);
    if (typeof window.scrollTo === 'function') {
      window.requestAnimationFrame(function () {
        if (generation === businessDataGeneration) {
          window.scrollTo({ top: restoreScroll, behavior: 'auto' });
        }
      });
    }
  }

  function initializeFocusedCashFlowCategory() {
    var presentation = currentCashFlowPresentation();
    if (!presentation || !presentation.focusedCategory) return;
    selectCashFlowCategory(presentation.focusedCategory.primaryCategory, false);
  }

  function renderPortfolio() {
    var data = readEnvelopeData();
    var holdingsResult = data.holdings || {};
    var activityResult = data.activity || {};
    var holdings = toArray(holdingsResult.data || holdingsResult.holdings);
    var activity = toArray(activityResult.data || activityResult.activity);
    var accounts = unique(
      holdings.map(function (holding) {
        return {
          id: holding.accountId || holding.accountName || 'unknown',
          label:
            holding.accountName ||
            holding.accountDisplayName ||
            holding.accountId ||
            'Unknown account',
        };
      }),
      'id',
    );
    if (
      state.portfolioAccount !== 'all' &&
      !accounts.some(function (account) {
        return account.id === state.portfolioAccount;
      })
    ) {
      state.portfolioAccount = 'all';
    }
    var visibleHoldings = holdings
      .filter(function (holding) {
        var accountMatch =
          state.portfolioAccount === 'all' ||
          (holding.accountId || holding.accountName) === state.portfolioAccount;
        var label = securityLabel(holding).toLowerCase();
        return (
          accountMatch &&
          label.indexOf(state.portfolioSearch.toLowerCase()) >= 0
        );
      })
      .sort(function (left, right) {
        return compareHolding(left, right, state.portfolioSort);
      });
    var visibleActivity = activity.filter(function (row) {
      if (
        state.portfolioAccount !== 'all' &&
        (row.accountId || row.accountName) !== state.portfolioAccount
      )
        return false;
      if (
        state.portfolioType !== 'all' &&
        String(row.investmentType || row.type || '').toLowerCase() !==
          state.portfolioType
      )
        return false;
      return true;
    });
    var total = visibleHoldings.reduce(function (sum, holding) {
      return sum + moneyAmount(holding.institutionValue || holding.value);
    }, 0);
    var currency = visibleHoldings[0]
      ? moneyCurrency(
          {
            currency:
              visibleHoldings[0].isoCurrencyCode ||
              visibleHoldings[0].unofficialCurrencyCode ||
              (visibleHoldings[0].security || {}).isoCurrencyCode,
          },
          'USD',
        )
      : 'USD';
    var accountOptions =
      '<option value="all">All accounts</option>' +
      accounts
        .map(function (account) {
          return (
            '<option value="' +
            escapeHtml(account.id) +
            '"' +
            (state.portfolioAccount === account.id ? ' selected' : '') +
            '>' +
            escapeHtml(account.label) +
            '</option>'
          );
        })
        .join('');
    var typeOptions = unique(
      activity.map(function (row) {
        return {
          id: String(row.investmentType || row.type || 'other').toLowerCase(),
          label: String(row.investmentType || row.type || 'Other'),
        };
      }),
      'id',
    );
    var activityTypeOptions =
      '<option value="all">All activity</option>' +
      typeOptions
        .map(function (item) {
          return (
            '<option value="' +
            escapeHtml(item.id) +
            '"' +
            (state.portfolioType === item.id ? ' selected' : '') +
            '>' +
            escapeHtml(item.label) +
            '</option>'
          );
        })
        .join('');
    var holdingRows = visibleHoldings.length
      ? visibleHoldings
          .map(function (holding) {
            return (
              '<tr><td><strong>' +
              escapeHtml(securityLabel(holding)) +
              '</strong><small>' +
              escapeHtml((holding.security && holding.security.type) || '') +
              '</small></td><td>' +
              escapeHtml(
                (holding.security && holding.security.tickerSymbol) || '--',
              ) +
              '</td><td class="num">' +
              escapeHtml(formatDecimal(holding.quantity)) +
              '</td><td class="num">' +
              escapeHtml(
                formatMoney(
                  { amount: holding.institutionPrice, currency: currency },
                  currency,
                ),
              ) +
              '</td><td class="num">' +
              escapeHtml(
                formatMoney(
                  { amount: holding.institutionValue, currency: currency },
                  currency,
                ),
              ) +
              '</td></tr>'
            );
          })
          .join('')
      : '<tr><td colspan="5">No holdings match the current filters.</td></tr>';
    var activityRows = visibleActivity.length
      ? visibleActivity
          .map(function (row) {
            return (
              '<tr><td>' +
              escapeHtml(row.activityDate || row.date || '') +
              '</td><td><strong>' +
              escapeHtml(securityLabel(row)) +
              '</strong><small>' +
              escapeHtml(
                [row.investmentType, row.investmentSubtype]
                  .filter(Boolean)
                  .join(' / '),
              ) +
              '</small></td><td class="num">' +
              escapeHtml(formatDecimal(row.quantity)) +
              '</td><td class="num">' +
              escapeHtml(formatMoney(row.amount || row.cashImpact, currency)) +
              '</td></tr>'
            );
          })
          .join('')
      : '<tr><td colspan="4">No activity matches the current filters.</td></tr>';
    var allocation = renderAllocation(visibleHoldings, total, currency);

    appRoot.innerHTML =
      '<section class="hero"><div><h1>Portfolio Viewer</h1><p>Latest or date-specific holdings, allocation, and investment activity.</p></div><div class="status-pill" id="app-status" data-kind="info"></div></section>' +
      '<section class="toolbar">' +
      '<label>Account<select id="portfolio-account">' +
      accountOptions +
      '</select></label>' +
      '<label>Holdings mode<select id="portfolio-date-mode"><option value="latest"' +
      (state.portfolioDateMode === 'latest' ? ' selected' : '') +
      '>Latest</option><option value="date"' +
      (state.portfolioDateMode === 'date' ? ' selected' : '') +
      '>Specific date</option></select></label>' +
      '<label>Snapshot date<input id="portfolio-snapshot-date" type="date" value="' +
      escapeHtml(state.portfolioSnapshotDate) +
      '"' +
      (state.portfolioDateMode === 'latest' ? ' disabled' : '') +
      '></label>' +
      '<label>Search<input id="portfolio-search" type="search" value="' +
      escapeHtml(state.portfolioSearch) +
      '" placeholder="Security or ticker"></label>' +
      '<label>Sort<select id="portfolio-sort"><option value="value">Value</option><option value="security">Security</option><option value="ticker">Ticker</option><option value="quantity">Quantity</option><option value="price">Price</option></select></label>' +
      '<label>Activity<select id="portfolio-type">' +
      activityTypeOptions +
      '</select></label>' +
      button('data-action="reload-portfolio"', 'Reload') +
      '</section>' +
      '<section class="metrics">' +
      metric(
        'Visible value',
        formatMoney(
          { amount: total, currency: currency, sign: 'positive' },
          currency,
        ),
        'positive',
      ) +
      metric('Holdings', String(visibleHoldings.length), 'neutral') +
      metric('Activity rows', String(visibleActivity.length), 'neutral') +
      metric(
        'Next page',
        activityResult.pageInfo && activityResult.pageInfo.hasMore
          ? 'Available'
          : 'None',
        'neutral',
      ) +
      '</section>' +
      '<section class="split"><div class="panel"><h2>Allocation</h2>' +
      allocation +
      '</div><div class="panel"><div class="panel-head"><h2>Activity</h2>' +
      button('data-action="next-activity"', 'Next page') +
      '</div><div class="table-wrap"><table><thead><tr><th>Date</th><th>Security</th><th>Qty</th><th>Cash Impact</th></tr></thead><tbody>' +
      activityRows +
      '</tbody></table></div></div></section>' +
      '<section class="panel"><h2>Holdings</h2><div class="table-wrap"><table><thead><tr><th>Security</th><th>Ticker</th><th>Quantity</th><th>Price</th><th>Value</th></tr></thead><tbody>' +
      holdingRows +
      '</tbody></table></div></section>';
    var sort = uiDocument.getElementById('portfolio-sort');
    if (sort) sort.value = state.portfolioSort;
  }

  function renderAllocation(holdings, total, currency) {
    if (!holdings.length) return rowsEmpty('No holdings to allocate.');
    return (
      '<div class="category-list">' +
      holdings
        .map(function (holding, index) {
          var value = moneyAmount(holding.institutionValue || holding.value);
          var width = total
            ? Math.max(4, Math.round((value / total) * 100))
            : 0;
          var color = colorForIndex(index);
          return (
            '<div class="allocation-row"><span class="swatch" style="background:' +
            color +
            '"></span><span class="category-main"><span>' +
            escapeHtml(securityLabel(holding)) +
            '</span><span class="bar-track"><span class="bar-fill" style="width:' +
            width +
            '%;background:' +
            color +
            '"></span></span></span><span class="number-stack"><strong>' +
            escapeHtml(
              formatMoney({ amount: value, currency: currency }, currency),
            ) +
            '</strong><small>' +
            width +
            '%</small></span></div>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function securityLabel(row) {
    var security = row.security || {};
    return (
      security.tickerSymbol ||
      security.name ||
      row.name ||
      row.securityName ||
      'Unknown security'
    );
  }

  function formatDecimal(value) {
    var parsed = Number(value);
    if (!Number.isFinite(parsed)) return value == null ? '--' : String(value);
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 }).format(
      parsed,
    );
  }

  function compareHolding(left, right, sort) {
    if (sort === 'security')
      return securityLabel(left).localeCompare(securityLabel(right));
    if (sort === 'ticker')
      return String((left.security || {}).tickerSymbol || '').localeCompare(
        String((right.security || {}).tickerSymbol || ''),
      );
    if (sort === 'quantity')
      return moneyAmount(right.quantity) - moneyAmount(left.quantity);
    if (sort === 'price')
      return (
        moneyAmount(right.institutionPrice) - moneyAmount(left.institutionPrice)
      );
    return (
      moneyAmount(right.institutionValue || right.value) -
      moneyAmount(left.institutionValue || left.value)
    );
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
    var colors = [
      '#2563eb',
      '#0f766e',
      '#7c3aed',
      '#dc2626',
      '#ca8a04',
      '#0891b2',
      '#be185d',
      '#16a34a',
    ];
    return colors[index % colors.length];
  }

  function render() {
    if (!appRoot) return;
    if (!envelope) {
      renderLoading();
      return;
    }
    if (appId === 'cash_flow') {
      renderCashflow();
      if (!envelope) return;
    }
    if (appId === 'portfolio_viewer') renderPortfolio();
    setStatus('Connected to live Splice data.', 'success');
  }

  function handleControlInput(event) {
    var target = event.target;
    if (!target) return;
    if (target.id === 'portfolio-search') state.portfolioSearch = target.value;
    if (target.id === 'portfolio-account')
      state.portfolioAccount = target.value;
    if (target.id === 'portfolio-sort') state.portfolioSort = target.value;
    if (target.id === 'portfolio-type') state.portfolioType = target.value;
    if (target.id === 'portfolio-date-mode')
      state.portfolioDateMode = target.value;
    if (target.id === 'portfolio-snapshot-date')
      state.portfolioSnapshotDate = target.value;
    render();
  }

  uiDocument.addEventListener('input', handleControlInput);
  uiDocument.addEventListener('change', handleControlInput);

  uiDocument.addEventListener('click', function (event) {
    var target = event.target.closest('[data-action]');
    if (!target) return;
    var action = target.dataset.action;
    if (action === 'select-category') {
      if (state.selectedCategory === target.dataset.category) {
        closeCashFlowCategory();
      } else {
        selectCashFlowCategory(target.dataset.category);
      }
    }
    if (action === 'toggle-other') {
      state.cashFlowOtherExpanded = !state.cashFlowOtherExpanded;
      render();
    }
    if (action === 'close-category') {
      closeCashFlowCategory();
    }
    if (action === 'retry-category' && state.selectedCategory) {
      selectCashFlowCategory(state.selectedCategory);
    }
    if (action === 'show-more-transactions') {
      state.drilldownVisibleCount = Math.min(
        state.drilldownVisibleCount + 3,
        state.drilldownRows.length,
      );
      render();
    }
    if (action === 'reload-portfolio') {
      var accountArgs: any =
        state.portfolioAccount === 'all'
          ? {}
          : { accountIds: [state.portfolioAccount] };
      var holdingsArgs: any = Object.assign({}, accountArgs);
      if (state.portfolioDateMode === 'latest') {
        holdingsArgs.latestOnly = true;
      } else if (state.portfolioSnapshotDate) {
        holdingsArgs.snapshotDate = state.portfolioSnapshotDate;
      } else {
        setStatus(
          'Snapshot date is required for date-specific holdings.',
          'error',
        );
        return;
      }
      envelope = null;
      clearDerivedBusinessData();
      renderLoading();
      var portfolioGeneration = businessDataGeneration;
      Promise.all([
        callTool('list_investment_holdings', holdingsArgs),
        callTool(
          'list_investment_activity',
          Object.assign({}, accountArgs, { pageSize: 25 }),
        ),
      ])
        .then(function (results) {
          if (portfolioGeneration !== businessDataGeneration) return;
          envelope = { data: { holdings: results[0], activity: results[1] } };
          render();
        })
        .catch(function () {
          if (portfolioGeneration !== businessDataGeneration) return;
          renderLiveDataError();
        });
    }
    if (action === 'next-activity') {
      var current = readEnvelopeData().activity || {};
      var cursor = current.pageInfo && current.pageInfo.nextCursor;
      if (!cursor) {
        setStatus('No additional activity page is available.', 'info');
        return;
      }
      var activityGeneration = businessDataGeneration;
      callTool('list_investment_activity', { cursor: cursor, pageSize: 25 })
        .then(function (result) {
          if (activityGeneration !== businessDataGeneration) return;
          var data = readEnvelopeData();
          data.activity = result;
          envelope = { data: data };
          render();
        })
        .catch(function () {
          if (activityGeneration !== businessDataGeneration) return;
          renderLiveDataError();
        });
    }
  });

  renderLoading();
  if (window.parent === window) {
    renderLiveDataError();
  } else {
    mcpRuntime.connect().catch(function () {
      renderLiveDataError();
    });
  }
})();
