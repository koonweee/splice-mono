# Manual Backfill: CSV Balance Import

## Overview
Add endpoints to download a CSV template (pre-filled with user's accounts) and upload a filled-in CSV to bulk-create historical balance snapshots.

---

## Backend

### 1. Install `csv-parse` and `csv-stringify`
```bash
cd backend && yarn add csv-parse csv-stringify
```

### 2. Create `backend/src/balance-snapshot/balance-snapshot.controller.ts`

New controller with two endpoints:

#### `GET /balance-snapshot/template`
- Inject `AccountService` to call `findAll(userId)`
- Build CSV with columns: `Account Name`, `Account UUID`, `Account Type`, `Currency`, then example date columns (e.g. `2025-01-01`, `2025-01-15`) with empty values
- Add a comment row or example values showing format (e.g. `1234.56` or `-150.00`)
- Use `csv-stringify` to serialize
- Return with `Content-Type: text/csv`, `Content-Disposition: attachment; filename="balance-template.csv"`
- Use `@StreamableFile` or set headers manually via `@Res()`

#### `POST /balance-snapshot/import`
- Use `@UseInterceptors(FileInterceptor('file'))` + `@UploadedFile()` for multipart upload
- Parse CSV buffer in memory with `csv-parse/sync`
- **Validation:**
  - Header row: first 4 columns are metadata, remaining columns must be valid `YYYY-MM-DD` dates
  - Each data row: `Account UUID` must exist and belong to `currentUser` (batch-fetch all accounts upfront)
  - `Currency` in CSV must match account's currency
  - Skip empty cells
- **For each non-empty cell:**
  - Parse float value
  - Sign: negative → `MoneySign.NEGATIVE`, else `MoneySign.POSITIVE`
  - Convert to `SerializedMoneyWithSign` using `MoneyWithSign.fromFloat(currency, absValue, sign).toSerialized()`
  - Set both `currentBalance` and `availableBalance` to the same value
  - Call `balanceSnapshotService.upsert({ accountId, snapshotDate, currentBalance, availableBalance, snapshotType: BalanceSnapshotType.USER_UPDATE }, userId)`
- Return `{ imported: number }` count
- Add Swagger docs with `@ApiConsumes('multipart/form-data')`, `@ApiBody` for file

### 3. Modify `backend/src/balance-snapshot/balance-snapshot.module.ts`
- Import `AccountModule` (for `AccountService`)
- Add `BalanceSnapshotController` to `controllers`

### 4. Add bulk upsert method to `balance-snapshot.service.ts`
- Add `bulkUpsert(dtos: CreateBalanceSnapshotDto[], userId: string): Promise<number>` that loops through dtos calling `this.upsert()` for each, returns count of processed snapshots
- This avoids duplicating upsert logic and reuses existing event emission

---

## Frontend

### 5. Regenerate API client
```bash
cd frontend && yarn orval
```

### 6. Create `frontend/src/components/accounts/BackfillModal.tsx`
- Modal with:
  - Instructions text explaining the CSV format and sign conventions
  - "Download Template" button → `GET /balance-snapshot/template` (use `window.open` or axios with blob response)
  - File input (accept `.csv`)
  - "Import" button → `POST /balance-snapshot/import` via generated mutation hook
- On success: show notification, invalidate balance queries, close modal
- On error: show error notification

### 7. Modify `frontend/src/routes/_authed/accounts.tsx`
- Add "Manual Backfill" button in the header button group
- Wire to open `BackfillModal`

---

## Tests

### 8. `backend/test/balance-snapshot/balance-snapshot.controller.spec.ts`
- **Template endpoint:** Verify CSV output has correct headers and one row per account
- **Import endpoint:**
  - Credit account: input `-100` → `amount=10000`, `sign=NEGATIVE`
  - Depository account: input `100` → `amount=10000`, `sign=POSITIVE`
  - Invalid UUID → error
  - Mismatched currency → error
  - Invalid date format → error
  - Empty cells skipped

---

## Files Modified/Created
| File | Action |
|------|--------|
| `backend/package.json` | Add `csv-parse`, `csv-stringify` |
| `backend/src/balance-snapshot/balance-snapshot.controller.ts` | **Create** |
| `backend/src/balance-snapshot/balance-snapshot.service.ts` | Add `bulkUpsert` |
| `backend/src/balance-snapshot/balance-snapshot.module.ts` | Add controller + import AccountModule |
| `frontend/src/components/accounts/BackfillModal.tsx` | **Create** |
| `frontend/src/routes/_authed/accounts.tsx` | Add backfill button |
| `backend/test/balance-snapshot/balance-snapshot.controller.spec.ts` | **Create** |

## Verification
1. `yarn test` in backend — new tests pass
2. Start backend, hit `GET /balance-snapshot/template` — downloads CSV with user's accounts
3. Fill in dates/values in the CSV, `POST /balance-snapshot/import` — returns count
4. Check `/api` docs — both endpoints visible with correct schemas
5. Frontend: click "Manual Backfill", download template, upload filled CSV, verify notification
6. Verify balance history chart shows backfilled data points
