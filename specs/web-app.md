# Thoughts on what the web app should do

This document journals the pain points that Splice aims to solve for me.

Current one liner: API integrated net worth tracker with optional insights

# Ramblings on how I currently manage finances

Context:

- Accounts in both US and Singapore
- Mixture of savings/checking, investment, crypto, retirement, credit card, etc

Current flow:

- Recurring check in on the last day of each month
- For each account, get the current balance in USD:
  - For savings/checking, this is the available balance
  - For investment/retirement/crypto, this is the portfolio value + cash available
  - For credit card, this is the outstanding statement balance
- Record the current exchange rate on the day ie. 1 USD = 1.30 SGD
- Sum up balances in USD, then convert to SGD
  - Sum of all assets - sum of all liabilities (eg. everything but credit card - credit card)
- Compare to the previous month to see month on month growth
  - Sometimes, this includes analysis of individual growth/loss factors (ie. did certain investment account do very well this month?)

Problems to solve:

- Checking each balance is a manual task (ie. open each app, login if needed, get the balance)
- Data is stored in a spreadsheet, only recorded in once a month intervals
- Insights/comparisons are not immediately obvious

Secondary problems to solve:

- No tracking at a transactional level, difficult to track growth/loss from expenditure vs asset price changes

# Core user flows

1. Onboarding

   New user → Register → Link first bank (or add manual account) → See dashboard

2. Dashboard (Daily Use)

   View current net worth → See breakdown by account/type → Quick health check

3. Account Management

   Link new bank → Or add manual account → Edit/remove accounts

4. Historical Comparison

   View month-over-month → Drill into what changed → Identify growth/loss factors

5. Balance Recording (for manual accounts or corrections)

   Select account → Record current balance → Optionally backfill historical
