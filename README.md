# DateTime Fix Files — SQL_File_Reconcile_Tool Format

**Fix for:** `comparison failed: type object date.time has no attribute 'time'`

These files are in the **exact same folder structure** as your org laptop's `SQL_File_Reconcile_Tool/backend/`.

## Root Cause

```python
from datetime import datetime  # <-- Imports the CLASS, not the module
isinstance(val, datetime.time)  # <-- FAILS! datetime is the CLASS here
```

## Files to Replace

Copy these into your `backend/` folder on the org laptop:

```
backend/
  common/
    json_utils.py       ← REPLACE existing
  module_1/
    comparison_engine.py ← REPLACE existing
    routes.py            ← REPLACE existing
```

## What Changed

| File | Import Fix | Key Additions |
|------|-----------|---------------|
| `common/json_utils.py` | `import datetime` (module, not class) | `normalize_timestamp()`, `_is_datetimetz()`, enhanced `sanitize_df_for_json()`, enhanced `safe_jsonify()` |
| `module_1/comparison_engine.py` | `import datetime as dt_module`, `import time as time_module` | All `time.time()` → `time_module.time()`, datetime-aware normalization in all functions |
| `module_1/routes.py` | `import datetime as dt_module` | New `handle_sql_datetime_types()` helper, applied in all 5 endpoints |

## SQL Types Now Handled

- `TIME` (with/without milliseconds)
- `DATETIME` / `DATETIME2` / `SMALLDATETIME`
- `DATETIMEOFFSET`
- `TIMESTAMP WITH TIME ZONE`
- `TIMESTAMP WITH LOCAL TIME ZONE`
- `timedelta` objects from pyodbc

## Notes

- `app.py` does **NOT** need changes — the error is in the comparison engine and routes
- The `backend/comparison_engine.py` (root level) is the OLD copy; the active one is `module_1/comparison_engine.py`
- All changes are backward-compatible — non-datetime comparisons work exactly as before
