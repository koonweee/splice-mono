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
import {
  createPortfolioPresentation,
  formatPortfolioMoney,
  formatPortfolioPercentage,
  portfolioAccountLabel,
  portfolioPositionById,
  portfolioPositionLabel,
  portfolioSelectionContext,
  portfolioSnapshotLabel,
  type PortfolioPosition,
  type PortfolioPresentation,
} from './portfolio-model';

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
    selectedPortfolioSecurityId: null,
    portfolioOtherExpanded: false,
    portfolioContributionsExpanded: false,
    portfolioContextPublished: false,
    portfolioPublishedSecurityId: null,
    portfolioContextRequestId: 0,
    portfolioContextError: false,
  };

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
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

  function formatCashFlowMoney(value, fallbackCurrency) {
    var amount = Math.abs(moneyAmount(value));
    var currency = moneyCurrency(value, fallbackCurrency);
    var sign = moneySign(value) === 'negative' ? '-' : '';
    return (
      sign +
      new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency,
        currencyDisplay: 'narrowSymbol',
        maximumFractionDigits: 2,
      }).format(amount)
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

  function clearPublishedPortfolioContext() {
    if (appId !== 'portfolio') return;
    var shouldClear = Boolean(
      state.portfolioContextPublished ||
        state.portfolioPublishedSecurityId ||
        state.selectedPortfolioSecurityId,
    );
    state.portfolioContextError = false;
    var requestId = ++state.portfolioContextRequestId;
    if (!shouldClear) return;
    mcpRuntime.app
      .updateModelContext({
        structuredContent: {
          visualization: 'portfolio',
          selection: null,
        },
      })
      .then(function () {
        if (requestId !== state.portfolioContextRequestId) {
          republishCurrentPortfolioContext();
          return;
        }
        state.portfolioContextPublished = false;
        state.portfolioPublishedSecurityId = null;
      })
      .catch(function () {
        // Retain the last successful identity so the next lifecycle boundary
        // retries this best-effort clear.
      });
  }

  function clearDerivedBusinessData() {
    clearPublishedCashFlowContext();
    clearPublishedPortfolioContext();
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
    state.selectedPortfolioSecurityId = null;
    state.portfolioOtherExpanded = false;
    state.portfolioContributionsExpanded = false;
    state.portfolioContextError = false;
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
    if (appId === 'portfolio') return 'Portfolio';
    return 'Splice';
  }

  function appVersion() {
    return '3.0.0';
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
    return formatCashFlowMoney(
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
                  ? formatCashFlowMoney(
                      displayAmount,
                      presentation.current.currency,
                    )
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
      escapeHtml(formatCashFlowMoney(presentation.current.netFlow, currency)) +
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
      '<p class="cash-flow-currency-note">All values in ' +
      escapeHtml(currency) +
      '.</p>' +
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

  function portfolioColor(index) {
    var colors = [
      '#2563eb',
      '#0f766e',
      '#7c3aed',
      '#c2410c',
      '#a16207',
      '#0891b2',
      '#be185d',
      '#16a34a',
    ];
    return colors[index % colors.length];
  }

  function formatPortfolioDecimal(value) {
    var parsed = Number(value);
    if (!Number.isFinite(parsed)) return '';
    return new Intl.NumberFormat('en-US', {
      maximumFractionDigits: 6,
    }).format(parsed);
  }

  function renderPortfolioDetail(
    presentation: PortfolioPresentation,
    position: PortfolioPosition,
  ) {
    var metadata = [position.tickerSymbol, position.type, position.subtype]
      .filter(Boolean)
      .join(' · ');
    var visibleContributions = state.portfolioContributionsExpanded
      ? position.contributions
      : position.contributions.slice(0, 3);
    var contributions = visibleContributions
      .map(function (contribution) {
        var details = [
          contribution.quantity
            ? formatPortfolioDecimal(contribution.quantity) + ' units'
            : '',
          contribution.priceUsd
            ? formatPortfolioMoney(contribution.priceUsd) + ' per unit'
            : '',
          contribution.snapshotDate,
        ]
          .filter(Boolean)
          .join(' · ');
        return (
          '<li><span><strong>' +
          escapeHtml(portfolioAccountLabel(contribution)) +
          '</strong><small>' +
          escapeHtml(details) +
          '</small></span><strong>' +
          escapeHtml(formatPortfolioMoney(contribution.valueUsd)) +
          '</strong></li>'
        );
      })
      .join('');
    return (
      '<section class="portfolio-detail" id="portfolio-detail-' +
      escapeHtml(position.securityId) +
      '" aria-live="polite"><div class="portfolio-detail-head"><div><p class="eyebrow">Selected holding</p><h3>' +
      escapeHtml(portfolioPositionLabel(position)) +
      '</h3>' +
      (metadata ? '<p>' + escapeHtml(metadata) + '</p>' : '') +
      '</div><button class="text-button" data-action="close-position">Close</button></div><div class="portfolio-detail-summary"><span><small>Position value</small><strong>' +
      escapeHtml(formatPortfolioMoney(position.valueUsd)) +
      '</strong></span><span><small>Portfolio share</small><strong>' +
      escapeHtml(formatPortfolioPercentage(position.allocationBps)) +
      '</strong></span>' +
      (position.quantity
        ? '<span><small>Combined quantity</small><strong>' +
          escapeHtml(formatPortfolioDecimal(position.quantity)) +
          '</strong></span>'
        : '') +
      '</div><div><p class="eyebrow">Contributing accounts</p><ul class="portfolio-contributions" id="portfolio-contributions-' +
      escapeHtml(position.securityId) +
      '">' +
      contributions +
      '</ul></div>' +
      (position.contributions.length > 3
        ? '<button class="show-more portfolio-show-contributions" data-action="toggle-portfolio-contributions" aria-controls="portfolio-contributions-' +
          escapeHtml(position.securityId) +
          '" aria-expanded="' +
          String(state.portfolioContributionsExpanded) +
          '">' +
          (state.portfolioContributionsExpanded
            ? 'Show fewer accounts'
            : 'Show ' +
              String(position.contributions.length - 3) +
              ' more accounts') +
          '</button>'
        : '') +
      (state.portfolioContextError
        ? '<p class="portfolio-context-note" role="status">This selection could not be shared with the conversation. The visualization is unaffected.</p>'
        : '') +
      '</section>'
    );
  }

  function renderPortfolioPositionRow(
    position: PortfolioPosition,
    presentation: PortfolioPresentation,
    index: number,
  ) {
    var selected = state.selectedPortfolioSecurityId === position.securityId;
    var barWidth = Math.max(
      position.allocationBps > 0 ? 2 : 0,
      Math.min(100, position.allocationBps / 100),
    );
    var secondary = position.tickerSymbol || position.type || 'Holding';
    return (
      '<button class="portfolio-position" data-action="select-position" data-security-id="' +
      escapeHtml(position.securityId) +
      '" aria-expanded="' +
      String(selected) +
      '" aria-controls="portfolio-detail-' +
      escapeHtml(position.securityId) +
      '"><span class="portfolio-rank" aria-hidden="true">' +
      String(index + 1) +
      '</span><span class="portfolio-position-main"><span><strong>' +
      escapeHtml(portfolioPositionLabel(position)) +
      '</strong><small>' +
      escapeHtml(secondary) +
      '</small></span><span class="portfolio-bar" aria-hidden="true"><span style="width:' +
      barWidth +
      '%;background:' +
      portfolioColor(index) +
      '"></span></span></span><span class="portfolio-position-value"><strong>' +
      escapeHtml(formatPortfolioMoney(position.valueUsd)) +
      '</strong><small>' +
      escapeHtml(formatPortfolioPercentage(position.allocationBps)) +
      '</small></span></button>' +
      (selected ? renderPortfolioDetail(presentation, position) : '')
    );
  }

  function renderPortfolioOther(presentation: PortfolioPresentation) {
    if (!presentation.remainingPositions.length) return '';
    var expanded = state.portfolioOtherExpanded;
    return (
      '<button class="portfolio-position portfolio-other" data-action="toggle-portfolio-other" aria-expanded="' +
      String(expanded) +
      '" aria-controls="portfolio-other-rows"><span class="portfolio-rank" aria-hidden="true">' +
      (expanded ? '−' : '+') +
      '</span><span class="portfolio-position-main"><span><strong>Other</strong><small>' +
      escapeHtml(String(presentation.remainingPositions.length)) +
      ' more holdings</small></span></span><span class="portfolio-position-value"><strong>' +
      escapeHtml(formatPortfolioMoney(presentation.otherValueUsd)) +
      '</strong><small>' +
      escapeHtml(formatPortfolioPercentage(presentation.otherAllocationBps)) +
      '</small></span></button><div id="portfolio-other-rows"' +
      (expanded ? '' : ' hidden') +
      '>' +
      (expanded
        ? presentation.remainingPositions
            .map(function (position, index) {
              return renderPortfolioPositionRow(
                position,
                presentation,
                index + 5,
              );
            })
            .join('')
        : '') +
      '</div>'
    );
  }

  function currentPortfolioPresentation(): PortfolioPresentation | null {
    return appId === 'portfolio'
      ? createPortfolioPresentation(readEnvelopeData())
      : null;
  }

  function republishCurrentPortfolioContext() {
    if (!state.selectedPortfolioSecurityId) return;
    var presentation = currentPortfolioPresentation();
    if (!presentation) return;
    var position = portfolioPositionById(
      presentation,
      state.selectedPortfolioSecurityId,
    );
    if (!position) return;
    publishPortfolioContext(presentation, position, businessDataGeneration);
  }

  function publishPortfolioContext(
    presentation: PortfolioPresentation,
    position: PortfolioPosition | null,
    generation: number,
  ) {
    state.portfolioContextError = false;
    var securityId = position ? position.securityId : null;
    var requestId = ++state.portfolioContextRequestId;
    mcpRuntime.app
      .updateModelContext({
        structuredContent: portfolioSelectionContext(presentation, position),
      })
      .then(function () {
        if (
          requestId !== state.portfolioContextRequestId ||
          generation !== businessDataGeneration ||
          state.selectedPortfolioSecurityId !== securityId
        ) {
          return;
        }
        state.portfolioContextPublished = Boolean(securityId);
        state.portfolioPublishedSecurityId = securityId;
      })
      .catch(function () {
        if (
          requestId !== state.portfolioContextRequestId ||
          generation !== businessDataGeneration ||
          state.selectedPortfolioSecurityId !== securityId
        ) {
          return;
        }
        state.portfolioContextError = true;
        if (securityId) {
          var clearRequestId = ++state.portfolioContextRequestId;
          mcpRuntime.app
            .updateModelContext({
              structuredContent: {
                visualization: 'portfolio',
                selection: null,
              },
            })
            .then(function () {
              if (
                clearRequestId !== state.portfolioContextRequestId ||
                generation !== businessDataGeneration ||
                state.selectedPortfolioSecurityId !== securityId
              ) {
                republishCurrentPortfolioContext();
                return;
              }
              state.portfolioContextPublished = false;
              state.portfolioPublishedSecurityId = null;
            })
            .catch(function () {
              // The prior successful identity remains tracked so a later
              // lifecycle boundary can retry the best-effort clear.
            });
        }
        render();
      });
  }

  function selectPortfolioPosition(securityId) {
    var presentation = currentPortfolioPresentation();
    if (!presentation) return;
    var position = portfolioPositionById(presentation, securityId);
    if (!position) return;
    var selectedPosition: PortfolioPosition = position;
    state.selectedPortfolioSecurityId = selectedPosition.securityId;
    state.portfolioContributionsExpanded = false;
    state.portfolioContextError = false;
    if (
      presentation.remainingPositions.some(function (candidate) {
        return candidate.securityId === selectedPosition.securityId;
      })
    ) {
      state.portfolioOtherExpanded = true;
    }
    render();
    publishPortfolioContext(
      presentation,
      selectedPosition,
      businessDataGeneration,
    );
  }

  function closePortfolioPosition() {
    var presentation = currentPortfolioPresentation();
    if (!presentation) return;
    state.selectedPortfolioSecurityId = null;
    state.portfolioContributionsExpanded = false;
    state.portfolioContextError = false;
    render();
    publishPortfolioContext(presentation, null, businessDataGeneration);
  }

  function togglePortfolioOther() {
    var presentation = currentPortfolioPresentation();
    if (!presentation) return;
    var expanding = !state.portfolioOtherExpanded;
    state.portfolioOtherExpanded = expanding;
    if (
      !expanding &&
      state.selectedPortfolioSecurityId &&
      presentation.remainingPositions.some(function (position) {
        return position.securityId === state.selectedPortfolioSecurityId;
      })
    ) {
      state.selectedPortfolioSecurityId = null;
      state.portfolioContributionsExpanded = false;
      state.portfolioContextError = false;
      render();
      publishPortfolioContext(presentation, null, businessDataGeneration);
      return;
    }
    render();
  }

  function renderPortfolio() {
    var presentation = currentPortfolioPresentation();
    if (!presentation) {
      renderLiveDataError();
      return;
    }
    var readyPresentation: PortfolioPresentation = presentation;
    if (
      state.selectedPortfolioSecurityId &&
      !portfolioPositionById(presentation, state.selectedPortfolioSecurityId)
    ) {
      state.selectedPortfolioSecurityId = null;
    }
    var body = readyPresentation.isEmpty
      ? '<section class="portfolio-empty"><h2>No investment holdings</h2><p>Splice found no current holdings for the selected accounts.</p></section>'
      : '<section class="portfolio-allocation" aria-labelledby="portfolio-allocation-title"><div class="section-heading"><div><p class="eyebrow">Concentration</p><h2 id="portfolio-allocation-title">Largest holdings</h2></div><span>' +
        escapeHtml(String(readyPresentation.positions.length)) +
        (readyPresentation.positions.length === 1 ? ' holding' : ' holdings') +
        '</span></div>' +
        '<div class="portfolio-position-list">' +
        readyPresentation.topPositions
          .map(function (position, index) {
            return renderPortfolioPositionRow(
              position,
              readyPresentation,
              index,
            );
          })
          .join('') +
        renderPortfolioOther(readyPresentation) +
        '</div></section>';
    appRoot.innerHTML =
      '<article class="portfolio-view"><header class="portfolio-header"><div><p class="eyebrow">Latest available holdings</p><h1>Portfolio</h1></div></header><section class="portfolio-total"><p>Total portfolio value</p><strong>' +
      escapeHtml(formatPortfolioMoney(presentation.totalValueUsd)) +
      '</strong></section>' +
      body +
      '<footer class="portfolio-disclosure"><span>' +
      escapeHtml(portfolioSnapshotLabel(presentation.snapshotRange)) +
      '</span><span>All values in USD.</span></footer></article>';
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
    if (appId === 'portfolio') renderPortfolio();
    setStatus('Connected to live Splice data.', 'success');
  }

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
    if (action === 'select-position') {
      if (state.selectedPortfolioSecurityId === target.dataset.securityId) {
        closePortfolioPosition();
      } else {
        selectPortfolioPosition(target.dataset.securityId);
      }
    }
    if (action === 'close-position') {
      closePortfolioPosition();
    }
    if (action === 'toggle-portfolio-other') {
      togglePortfolioOther();
    }
    if (action === 'toggle-portfolio-contributions') {
      state.portfolioContributionsExpanded =
        !state.portfolioContributionsExpanded;
      render();
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
