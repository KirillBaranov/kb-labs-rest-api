# KB Labs REST API - Compatibility Issues

## 🔍 Critical Compatibility Issues Found

### ❌ Issue 1: Audit Summary Structure Mismatch

**Problem**: Studio's `AuditSummary` interface doesn't match REST API response.

**Studio expects** (`data-client/contracts/audit.ts`):
```typescript
interface AuditSummary {
  ts: ISODate;
  totals: {
    packages: number;
    ok: number;
    warn: number;
    fail: number;
    durationMs: number;
  };
  topFailures: Array<{
    pkg: string;
    checks: Array<'style' | 'types' | 'tests' | 'build' | 'devlink' | 'mind'>;
  }>;
}
```

**REST API returns** (`@kb-labs/api-contracts`):
```typescript
{
  overall: {
    ok: boolean;
    severity: 'none' | 'low' | 'medium' | 'high' | 'critical';
  };
  counts: Record<string, number>;
  lastRunAt?: string;
}
```

**Current Mapping** (`http-audit-source.ts`):
```typescript
return {
  overall: response.overall,  // ❌ Wrong: Studio expects ts, totals, topFailures
  counts: response.counts,
  lastRunAt: response.lastRunAt,
}
```

**Impact**: 
- ⚠️ Type mismatch: Studio code expects `ts`, `totals`, `topFailures`
- ⚠️ Runtime error: If Studio UI accesses `summary.totals`, it will be `undefined`

**Status**: ❌ **CRITICAL MISMATCH**

**Solutions**:
1. **Option A**: Update Studio `AuditSummary` interface to match `@kb-labs/api-contracts`
2. **Option B**: Transform REST API response to Studio format in `http-audit-source.ts`
3. **Option C**: Verify which fields Studio UI actually uses (maybe interface is outdated)

---

### ❌ Issue 2: Release Preview Structure Mismatch

**Problem**: Studio's `ReleasePreview` interface doesn't match REST API response.

**Studio expects** (`data-client/contracts/release.ts`):
```typescript
interface ReleasePreview {
  range: {
    from: string;
    to: string;
  };
  packages: Array<{
    name: string;
    prev: string;  // Previous version
    next: string;  // Next version
    bump: 'major' | 'minor' | 'patch' | 'none';
    breaking?: number;
  }>;
  manifestJson?: string;
  markdown?: string;
}
```

**REST API returns** (`@kb-labs/api-contracts`):
```typescript
{
  plan: {
    packages: Array<{
      name: string;
      version: string;  // Next version only
      type: 'patch' | 'minor' | 'major';  // Not 'none'
    }>
  };
  changelog: string;
}
```

**Current Mapping** (`http-release-source.ts`):
```typescript
return {
  packages: response.plan.packages.map(pkg => ({
    name: pkg.name,
    version: pkg.version,  // ❌ Studio expects `next`
    type: pkg.type,  // ❌ Studio expects `bump`, and `type` might not be 'none'
  })),
  changelog: response.changelog,
}
// ❌ Missing: range, prev, breaking, manifestJson, markdown
```

**Impact**:
- ⚠️ Missing `range`, `prev`, `breaking`, `manifestJson`, `markdown`
- ⚠️ Field name mismatch: `version` vs `next`, `type` vs `bump`

**Status**: ❌ **CRITICAL MISMATCH**

**Solutions**:
1. **Option A**: Update REST API to return all required fields
2. **Option B**: Update Studio `ReleasePreview` interface to match API contracts
3. **Option C**: Add transformation in `http-release-source.ts` (if CLI provides all data)

---

### ❌ Issue 3: Audit Package Report Structure Mismatch

**Problem**: Studio's `AuditPackageReport` interface doesn't match REST API response.

**Studio expects** (`data-client/contracts/audit.ts`):
```typescript
interface AuditPackageReport {
  pkg: PackageRef;  // { name: string, path?: string }
  lastRun: RunRef;  // { id: string, ts: ISODate }
  checks: AuditCheck[];  // Array of checks
  artifacts: AuditArtifacts;  // { json?, md?, txt?, html? }
}
```

**REST API returns** (`@kb-labs/api-contracts`):
```typescript
{
  report: Record<string, unknown>,  // Raw CLI JSON
  sha256?: string,
  createdAt: string
}
```

**Current Mapping** (`http-audit-source.ts`):
```typescript
return {
  package: name,  // ❌ Studio expects `pkg: PackageRef`
  findings: (response.report as any)?.findings || [],  // ❌ Studio expects `checks`
  summary: (response.report as any)?.summary || {},  // ❌ Studio expects `artifacts`
}
```

**Impact**:
- ⚠️ Complete structure mismatch
- ⚠️ Studio expects `pkg`, `lastRun`, `checks`, `artifacts`
- ⚠️ REST API returns raw `report` object

**Status**: ❌ **CRITICAL MISMATCH**

**Solutions**:
1. **Option A**: Transform CLI output in REST API to match Studio format
2. **Option B**: Update Studio `AuditPackageReport` interface to match CLI output
3. **Option C**: Add transformation in `http-audit-source.ts` (requires CLI output structure)

---

## 📊 Compatibility Status Summary

### Current Status: ⚠️ **~70% Compatible** (Not 98%)

| Component | Compatibility | Status |
|-----------|--------------|--------|
| Endpoints | 100% | ✅ Perfect |
| Request Structures | 100% | ✅ Perfect |
| Audit Summary Response | 0% | ❌ **Structure mismatch** |
| Audit Report Response | 0% | ❌ **Structure mismatch** |
| Release Preview Response | 30% | ❌ **Missing fields** |
| Job Status | 100% | ✅ Perfect |
| Job Events (SSE) | 100% | ✅ Perfect |
| Error Handling | 100% | ✅ Perfect |

### Critical Issues
1. ❌ **Audit Summary** - Complete structure mismatch
2. ❌ **Audit Report** - Complete structure mismatch
3. ❌ **Release Preview** - Missing fields (`range`, `prev`, `breaking`, etc.)

---

## 🔧 Recommended Fixes

### Priority 1: Verify Studio UI Usage

**First step**: Verify which fields Studio UI actually uses:

```bash
# Check if Studio UI components use:
# - summary.totals (vs summary.overall)
# - summary.ts (vs summary.lastRunAt)
# - summary.topFailures (not in API)
# - releasePreview.range (not in API)
# - releasePreview.packages[].prev (not in API)
```

**Action**: Search Studio UI components for actual field usage.

### Priority 2: Align Interfaces

**Option A**: Update Studio interfaces to match `@kb-labs/api-contracts`
- ✅ Single source of truth (`@kb-labs/api-contracts`)
- ✅ Consistent across all consumers
- ⚠️ May require UI component updates

**Option B**: Update REST API to transform CLI output to Studio format
- ✅ Studio doesn't need changes
- ⚠️ REST API needs to know Studio format
- ⚠️ Couples REST API to Studio

**Option C**: Add transformation layer in `data-client`
- ✅ REST API stays independent
- ✅ Studio doesn't need changes
- ⚠️ Duplicate transformation logic

### Priority 3: Verify CLI Output Structure

**Action**: Run actual CLI commands to verify output:

```bash
# Verify audit output
kb audit --json
# Expected: { overall: {...}, counts: {...}, findings?: [...] }

# Verify release preview output
kb release preview --json
# Expected: { plan: { packages: [...] }, changelog: string }
```

---

## 📋 Action Plan

1. **Verify Studio UI field usage** (check what's actually accessed)
2. **Decide on interface alignment strategy** (Option A/B/C)
3. **Update interfaces or transformations** accordingly
4. **Run E2E tests** to verify compatibility
5. **Update documentation** with actual compatibility status

---

## ⚠️ Current Risk Level

**High Risk**: If Studio UI components access fields that don't exist in REST API response, runtime errors will occur.

**Example**:
```typescript
// In Studio UI component
const { totals } = summary;  // ❌ totals is undefined if REST API returns overall
const { ok } = totals;  // ❌ Runtime error: Cannot read property 'ok' of undefined
```

**Mitigation**: Verify Studio UI component field usage before deployment.


